import { CandidateCompany, FundamentalsProvider, FundamentalsSnapshot } from "../types";

// FundamentalsAgent adds valuation, margin, cash-flow, and leverage data when a
// provider can supply it. Missing fundamentals are handled downstream as risk.
export class FundamentalsAgent {
  constructor(private readonly fundamentalsProvider: FundamentalsProvider) {}

  async run(candidates: CandidateCompany[]): Promise<Map<string, FundamentalsSnapshot>> {
    const snapshots = new Map<string, FundamentalsSnapshot>();

    for (const candidate of candidates) {
      const ticker = candidate.profile.ticker;
      try {
        // Fundamentals providers are best-effort because free endpoints can be
        // incomplete or unavailable. Successful snapshots are keyed by ticker.
        const snapshot = await this.fundamentalsProvider.fetchFundamentals(ticker);
        if (snapshot) {
          snapshots.set(ticker, snapshot);
        }
      } catch {
        continue;
      }
    }

    return snapshots;
  }
}
