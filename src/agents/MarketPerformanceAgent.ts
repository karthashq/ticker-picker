import { CandidateCompany, MarketDataProvider, MarketSnapshot } from "../types";
import { buildMarketSnapshot } from "../market/metrics";
import { log } from "../utils/logger";

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
      log.debug("Fetching market data", { ticker, range: this.priceHistoryRange });
      const elapsed = log.timer();
      try {
        const prices = await this.marketDataProvider.fetchPriceHistory(
          ticker,
          this.priceHistoryRange
        );
        const snapshot = buildMarketSnapshot(ticker, prices);
        log.debug("Market data fetched", {
          ticker,
          pricePoints: prices.length,
          momentumScore: snapshot.momentumScore,
          stabilityScore: snapshot.stabilityScore,
          elapsedMs: elapsed()
        });
        snapshots.set(ticker, snapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("Market data fetch failed", { ticker, error: message, elapsedMs: elapsed() });
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
