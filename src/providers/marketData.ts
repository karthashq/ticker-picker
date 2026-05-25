import {
  FundamentalsProvider,
  FundamentalsSnapshot,
  MarketDataProvider,
  PricePoint
} from "../types";
import { getJson, withQuery } from "./http";
import { FMP_API_BASE, YAHOO_CHART_API_BASE, YAHOO_QUOTE_API } from "../config/urls";
import { log } from "../utils/logger";

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
  priceToEarningsRatioTTM?: number;
  priceToSalesRatioTTM?: number;
  grossProfitMarginTTM?: number;
  operatingProfitMarginTTM?: number;
  operatingCashFlowSalesRatioTTM?: number;
  freeCashFlowOperatingCashFlowRatioTTM?: number;
  debtToEquityRatioTTM?: number;
}

interface FmpMetricsResponse {
  marketCap?: number;
}

interface FmpProfileResponse {
  marketCap?: number;
}

// Yahoo's chart endpoint is used for historical monthly prices. It is free and
// adequate for trend, volatility, and drawdown analysis.
export class YahooMarketDataProvider implements MarketDataProvider {
  async fetchPriceHistory(ticker: string, range: string): Promise<PricePoint[]> {
    const start = Date.now();
    log.debug("yahoo price history fetch", { ticker, range });

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
    const points = timestamps
      .map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        close: close[index]
      }))
      .filter((point): point is PricePoint => {
        return typeof point.close === "number" && Number.isFinite(point.close);
      });
    log.debug("yahoo price history fetched", { ticker, range, points: points.length, latencyMs: Date.now() - start });
    return points;
  }
}

// Yahoo quote fundamentals are opportunistic. The endpoint may reject requests,
// so the orchestrator treats this provider as best-effort.
export class YahooFundamentalsProvider implements FundamentalsProvider {
  async fetchFundamentals(ticker: string): Promise<FundamentalsSnapshot | undefined> {
    const start = Date.now();
    log.debug("yahoo fundamentals fetch", { ticker });

    const url = withQuery(YAHOO_QUOTE_API, {
      symbols: ticker
    });
    const response = await getJson<YahooQuoteResponse>(url, { timeoutMs: 15000 });
    const result = response.quoteResponse?.result?.[0];
    if (!result) {
      log.debug("yahoo fundamentals empty", { ticker, latencyMs: Date.now() - start });
      return undefined;
    }

    log.debug("yahoo fundamentals fetched", { ticker, latencyMs: Date.now() - start });
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
    const start = Date.now();
    log.debug("fmp fundamentals fetch", { ticker });

    // These three endpoints are independent, so fetch them together to keep each
    // company's enrichment step reasonably quick.
    const [ratios, metrics, profile] = await Promise.all([
      this.fetchFirst<FmpRatiosResponse>("ratios-ttm", ticker),
      this.fetchFirst<FmpMetricsResponse>("key-metrics-ttm", ticker),
      this.fetchFirst<FmpProfileResponse>("profile", ticker)
    ]);

    if (!ratios && !metrics && !profile) {
      log.debug("fmp fundamentals empty", { ticker, latencyMs: Date.now() - start });
      return undefined;
    }

    log.debug("fmp fundamentals fetched", { ticker, latencyMs: Date.now() - start });

    // Approximate trailing free-cash-flow margin using two ratios:
    // (Operating cash flow / Sales) * (Free cash flow / Operating cash flow)
    // = Free cash flow / Sales.
    const freeCashFlowMarginTtm =
      ratios?.operatingCashFlowSalesRatioTTM !== undefined &&
      ratios?.freeCashFlowOperatingCashFlowRatioTTM !== undefined
        ? ratios.operatingCashFlowSalesRatioTTM * ratios.freeCashFlowOperatingCashFlowRatioTTM
        : undefined;

    return {
      ticker,
      asOf: new Date().toISOString(),
      source: "Financial Modeling Prep (stable)",
      marketCap: profile?.marketCap ?? metrics?.marketCap,
      trailingPe: ratios?.priceToEarningsRatioTTM,
      priceToSales: ratios?.priceToSalesRatioTTM,
      grossMarginTtm: ratios?.grossProfitMarginTTM,
      operatingMarginTtm: ratios?.operatingProfitMarginTTM,
      freeCashFlowMarginTtm,
      debtToEquity: ratios?.debtToEquityRatioTTM,
      dataQualityWarnings: []
    };
  }

  private async fetchFirst<T>(endpoint: string, ticker: string): Promise<T | undefined> {
    // Stable endpoints use query params instead of /{ticker} path segments.
    // Most endpoints return arrays with a single current snapshot.
    const url = withQuery(`${FMP_API_BASE}/${endpoint}`, {
      symbol: ticker,
      apikey: this.apiKey
    });
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
          log.debug("composite fundamentals resolved", { ticker, source: snapshot.source });
          return snapshot;
        }
      } catch {
        continue;
      }
    }

    log.warn("composite fundamentals exhausted all providers", { ticker });
    return undefined;
  }
}
