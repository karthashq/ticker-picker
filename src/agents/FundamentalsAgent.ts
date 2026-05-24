import { CandidateCompany, FundamentalsProvider, FundamentalsSnapshot } from "../types";
import { log } from "../utils/logger";

// FundamentalsAgent adds valuation, margin, cash-flow, and leverage data when a
// provider can supply it. Missing fundamentals are handled downstream as risk.
export class FundamentalsAgent {
  constructor(private readonly fundamentalsProvider: FundamentalsProvider) {}

  async run(candidates: CandidateCompany[]): Promise<Map<string, FundamentalsSnapshot>> {
    const snapshots = new Map<string, FundamentalsSnapshot>();

    for (const candidate of candidates) {
      const ticker = candidate.profile.ticker;
      log.debug("Fetching fundamentals", { ticker });
      const elapsed = log.timer();
      try {
        const snapshot = await this.fundamentalsProvider.fetchFundamentals(ticker);
        if (snapshot) {
          log.debug("Fundamentals fetched", { ticker, source: snapshot.source, elapsedMs: elapsed() });
          snapshots.set(ticker, snapshot);
        } else {
          log.debug("No fundamentals returned", { ticker, elapsedMs: elapsed() });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("Fundamentals fetch failed", { ticker, error: message, elapsedMs: elapsed() });
      }
    }

    return snapshots;
  }
}
