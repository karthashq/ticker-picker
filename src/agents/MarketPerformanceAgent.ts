import { CandidateCompany, MarketDataProvider, MarketSnapshot } from "../types";
import { buildMarketSnapshot } from "../market/metrics";

// MarketPerformanceAgent enriches candidate stocks with price-history metrics.
// It catches provider failures per ticker so one bad symbol does not stop a run.
export class MarketPerformanceAgent {
  constructor(
    private readonly marketDataProvider: MarketDataProvider,
    private readonly priceHistoryRange: string
  ) {}

  async run(candidates: CandidateCompany[]): Promise<Map<string, MarketSnapshot>> {
    const snapshots = new Map<string, MarketSnapshot>();

    for (const candidate of candidates) {
      const ticker = candidate.profile.ticker;
      try {
        // The provider returns raw monthly prices; buildMarketSnapshot converts
        // those prices into returns, volatility, drawdown, and scores.
        const prices = await this.marketDataProvider.fetchPriceHistory(
          ticker,
          this.priceHistoryRange
        );
        snapshots.set(ticker, buildMarketSnapshot(ticker, prices));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        snapshots.set(ticker, {
          ticker,
          asOf: new Date().toISOString(),
          prices: [],
          returns: {},
          momentumScore: 35,
          stabilityScore: 25,
          dataQualityWarnings: [`Market data fetch failed: ${message}`]
        });
      }
    }

    return snapshots;
  }
}
