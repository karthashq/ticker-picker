import { AppConfig, CandidateCompany, GrowthArea } from "../types";
import { clamp, round } from "../utils/math";

// CompanyDiscoveryAgent maps active growth areas to the curated company
// universe. This keeps stock selection transparent and easy to edit.
export class CompanyDiscoveryAgent {
  constructor(private readonly config: AppConfig) {}

  run(growthAreas: GrowthArea[]): CandidateCompany[] {
    const candidates: CandidateCompany[] = [];

    for (const growthArea of growthAreas) {
      const matches = this.config.companyUniverse
        .map(profile => {
          // Keyword overlap is the main relevance signal. The check is
          // bidirectional so "data center" and "data center power" can match.
          const matchedKeywords = profile.keywords.filter(keyword =>
            growthArea.keywords.some(
              topicKeyword =>
                topicKeyword.toLowerCase().includes(keyword.toLowerCase()) ||
                keyword.toLowerCase().includes(topicKeyword.toLowerCase())
            )
          );
          // Industry and sector overlap are weaker supporting signals because
          // they are broad and can create false positives on their own.
          const industryOverlap = words(profile.industry).filter(word =>
            words(growthArea.industry).includes(word)
          ).length;
          const sectorOverlap = growthArea.industry
            .toLowerCase()
            .includes(profile.sector.toLowerCase())
            ? 1
            : 0;
          const rawScore =
            matchedKeywords.length * 18 + industryOverlap * 8 + sectorOverlap * 10;
          // A strong news theme can lift a company, but it cannot fully replace
          // actual keyword/industry fit.
          const trendFitScore = round(clamp(rawScore + growthArea.newsScore * 0.35, 0, 100), 1);

          return {
            profile,
            growthArea,
            trendFitScore,
            matchedKeywords
          };
        })
        .filter(candidate => candidate.trendFitScore >= 30)
        .sort((a, b) => b.trendFitScore - a.trendFitScore)
        .slice(0, this.config.run.maxCompaniesPerArea);

      candidates.push(...matches);
    }

    return dedupeCandidates(candidates);
  }
}

// Tokenize text for rough industry-overlap matching.
function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 2);
}

// If a company matches multiple growth areas, keep the strongest theme fit so a
// ticker only appears once in the final candidate list.
function dedupeCandidates(candidates: CandidateCompany[]): CandidateCompany[] {
  const bestByTicker = new Map<string, CandidateCompany>();

  for (const candidate of candidates) {
    const existing = bestByTicker.get(candidate.profile.ticker);
    if (!existing || candidate.trendFitScore > existing.trendFitScore) {
      bestByTicker.set(candidate.profile.ticker, candidate);
    }
  }

  return [...bestByTicker.values()].sort((a, b) => b.trendFitScore - a.trendFitScore);
}
