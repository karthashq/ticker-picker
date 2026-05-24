import {
  FundamentalsProvider,
  FundamentalsSnapshot,
  MarketDataProvider,
  PricePoint
} from "../types";
import { getJson, withQuery } from "./http";
import { FMP_API_BASE, YAHOO_CHART_API_BASE, YAHOO_QUOTE_API } from "../config/urls";

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
    }>;
    error?: { description?: string };
  };
}

interface YahooQuoteResponse {
  quoteResponse?: {
    result?: Array<{
      regularMarketTime?: number;
      marketCap?: number;
      trailingPE?: number;
      forwardPE?: number;
      priceToSalesTrailing12Months?: number;
    }>;
  };
}

interface FmpRatiosResponse {
  peRatioTTM?: number;
  priceToSalesRatioTTM?: number;
  grossProfitMarginTTM?: number;
  operatingProfitMarginTTM?: number;
  debtEquityRatioTTM?: number;
}

interface FmpMetricsResponse {
  revenuePerShareTTM?: number;
  freeCashFlowPerShareTTM?: number;
}

interface FmpProfileResponse {
  mktCap?: number;
}

// Yahoo's chart endpoint is used for historical monthly prices. It is free and
// adequate for trend, volatility, and drawdown analysis.
export class YahooMarketDataProvider implements MarketDataProvider {
  async fetchPriceHistory(ticker: string, range: string): Promise<PricePoint[]> {
    const url = withQuery(
      `${YAHOO_CHART_API_BASE}/${encodeURIComponent(ticker)}`,
      {
        range,
        interval: "1mo",
        includePrePost: false,
        events: "div,splits"
      }
    );
    const response = await getJson<YahooChartResponse>(url, { timeoutMs: 25000 });
    const result = response.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
    const close = adjusted ?? result?.indicators?.quote?.[0]?.close ?? [];

    // Prefer adjusted closes when Yahoo returns them so splits/dividends do not
    // distort historical performance calculations.
    return timestamps
      .map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        close: close[index]
      }))
      .filter((point): point is PricePoint => {
        return typeof point.close === "number" && Number.isFinite(point.close);
      });
  }
}

// Yahoo quote fundamentals are opportunistic. The endpoint may reject requests,
// so the orchestrator treats this provider as best-effort.
export class YahooFundamentalsProvider implements FundamentalsProvider {
  async fetchFundamentals(ticker: string): Promise<FundamentalsSnapshot | undefined> {
    const url = withQuery(YAHOO_QUOTE_API, {
      symbols: ticker
    });
    const response = await getJson<YahooQuoteResponse>(url, { timeoutMs: 15000 });
    const result = response.quoteResponse?.result?.[0];
    if (!result) {
      return undefined;
    }

    return {
      ticker,
      asOf: result.regularMarketTime
        ? new Date(result.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
      source: "Yahoo Finance quote",
      marketCap: result.marketCap,
      trailingPe: result.trailingPE,
      forwardPe: result.forwardPE,
      priceToSales: result.priceToSalesTrailing12Months,
      dataQualityWarnings: ["Yahoo quote fundamentals are limited and may omit margins or growth."]
    };
  }
}

// Financial Modeling Prep gives richer fundamentals when FMP_API_KEY is set.
// This provider is optional so the app can still run without paid credentials.
export class FinancialModelingPrepFundamentalsProvider implements FundamentalsProvider {
  constructor(private readonly apiKey: string) {}

  async fetchFundamentals(ticker: string): Promise<FundamentalsSnapshot | undefined> {
    // These three endpoints are independent, so fetch them together to keep each
    // company's enrichment step reasonably quick.
    const [ratios, metrics, profile] = await Promise.all([
      this.fetchFirst<FmpRatiosResponse>(`${FMP_API_BASE}/ratios-ttm/${ticker}`),
      this.fetchFirst<FmpMetricsResponse>(`${FMP_API_BASE}/key-metrics-ttm/${ticker}`),
      this.fetchFirst<FmpProfileResponse>(`${FMP_API_BASE}/profile/${ticker}`)
    ]);

    if (!ratios && !metrics && !profile) {
      return undefined;
    }

    return {
      ticker,
      asOf: new Date().toISOString(),
      source: "Financial Modeling Prep",
      marketCap: profile?.mktCap,
      trailingPe: ratios?.peRatioTTM,
      priceToSales: ratios?.priceToSalesRatioTTM,
      grossMarginTtm: ratios?.grossProfitMarginTTM,
      operatingMarginTtm: ratios?.operatingProfitMarginTTM,
      // FMP exposes free cash flow and revenue per share. Dividing them gives a
      // rough trailing free-cash-flow margin when both values are available.
      freeCashFlowMarginTtm:
        metrics?.freeCashFlowPerShareTTM && metrics?.revenuePerShareTTM
          ? metrics.freeCashFlowPerShareTTM / metrics.revenuePerShareTTM
          : undefined,
      debtToEquity: ratios?.debtEquityRatioTTM,
      dataQualityWarnings: []
    };
  }

  private async fetchFirst<T>(baseUrl: string): Promise<T | undefined> {
    // FMP returns arrays for these endpoints; the first object is the current
    // trailing-twelve-month snapshot.
    const url = withQuery(baseUrl, { apikey: this.apiKey });
    const response = await getJson<T[]>(url, { timeoutMs: 20000 });
    return Array.isArray(response) ? response[0] : undefined;
  }
}

// Try fundamentals providers in order and return the first successful snapshot.
// This allows richer paid data to take precedence over limited free data.
export class CompositeFundamentalsProvider implements FundamentalsProvider {
  constructor(private readonly providers: FundamentalsProvider[]) {}

  async fetchFundamentals(ticker: string): Promise<FundamentalsSnapshot | undefined> {
    for (const provider of this.providers) {
      try {
        const snapshot = await provider.fetchFundamentals(ticker);
        if (snapshot) {
          return snapshot;
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }
}
