import assert from "assert";
import { assessCandidate } from "../src/agents/RiskRewardAgent";
import { buildMarketSnapshot } from "../src/market/metrics";
import { CandidateCompany, FundamentalsSnapshot, GrowthArea, PricePoint } from "../src/types";

// Market snapshot tests use a steady upward price series so the expected
// direction of returns, momentum, and drawdown is easy to reason about.
function testMarketSnapshot(): void {
  const prices: PricePoint[] = Array.from({ length: 61 }, (_, index) => ({
    date: new Date(Date.UTC(2021 + Math.floor(index / 12), index % 12, 1))
      .toISOString()
      .slice(0, 10),
    close: 100 + index * 2
  }));
  const snapshot = buildMarketSnapshot("TEST", prices);

  assert(snapshot.returns.oneYear !== undefined, "one-year return should be calculated");
  assert(snapshot.returns.fiveYearAnnualized !== undefined, "five-year return should be calculated");
  assert(snapshot.maxDrawdown !== undefined, "drawdown should be calculated");
  assert(snapshot.momentumScore > 50, "up-trending series should have positive momentum");
}

// This test exercises the happy path: a strong theme fit, positive price trend,
// and available fundamentals should produce a useful risk/reward assessment.
function testRiskRewardAssessment(): void {
  const growthArea: GrowthArea = {
    id: "ai",
    name: "AI infrastructure",
    industry: "Technology",
    description: "AI infrastructure demand",
    keywords: ["ai", "data center"],
    newsScore: 85,
    articleCount: 20,
    uniqueSourceCount: 10,
    recentArticleCount: 12,
    detectedAt: new Date().toISOString(),
    evidence: []
  };
  const candidate: CandidateCompany = {
    growthArea,
    trendFitScore: 82,
    matchedKeywords: ["ai"],
    profile: {
      ticker: "TEST",
      name: "Test Corp",
      sector: "Technology",
      industry: "AI infrastructure",
      country: "US",
      marketCapCategory: "large",
      keywords: ["ai", "data center"]
    }
  };
  const prices: PricePoint[] = Array.from({ length: 61 }, (_, index) => ({
    date: new Date(Date.UTC(2021 + Math.floor(index / 12), index % 12, 1))
      .toISOString()
      .slice(0, 10),
    close: 100 + index * 3
  }));
  const market = buildMarketSnapshot("TEST", prices);
  const fundamentals: FundamentalsSnapshot = {
    ticker: "TEST",
    asOf: new Date().toISOString(),
    source: "fixture",
    forwardPe: 22,
    priceToSales: 6,
    grossMarginTtm: 0.62,
    operatingMarginTtm: 0.28,
    freeCashFlowMarginTtm: 0.23,
    debtToEquity: 0.4,
    dataQualityWarnings: []
  };
  const assessment = assessCandidate(candidate, market, fundamentals);

  assert(assessment.rewardScore > 60, "strong candidate should have a high reward score");
  assert(assessment.riskRewardRatio > 1, "risk/reward should be above 1");
  assert(assessment.rewardDrivers.length > 0, "reward drivers should be present");
  assert(
    assessment.rewardDrivers.some(driver => driver.includes("articles")),
    "reward drivers should include theme evidence detail"
  );
  assert(
    assessment.rewardDrivers.some(driver => driver.includes("gross margin")),
    "reward drivers should include quality metrics"
  );
  assert(
    assessment.rewardDrivers.some(driver => driver.includes("1-year return")),
    "reward drivers should include momentum metrics"
  );
  assert(assessment.riskDrivers.length > 0, "risk drivers should be present");
}

// The app should not overstate confidence when fundamentals are missing. This
// guards the conservative recommendation cap in RiskRewardAgent.
function testMissingFundamentalsCapsRecommendation(): void {
  const growthArea: GrowthArea = {
    id: "defense",
    name: "Defense",
    industry: "Industrials",
    description: "Defense demand",
    keywords: ["defense"],
    newsScore: 90,
    articleCount: 20,
    uniqueSourceCount: 15,
    recentArticleCount: 15,
    detectedAt: new Date().toISOString(),
    evidence: []
  };
  const candidate: CandidateCompany = {
    growthArea,
    trendFitScore: 95,
    matchedKeywords: ["defense"],
    profile: {
      ticker: "MISS",
      name: "Missing Fundamentals Corp",
      sector: "Industrials",
      industry: "Defense",
      country: "US",
      marketCapCategory: "mega",
      keywords: ["defense"]
    }
  };
  const prices: PricePoint[] = Array.from({ length: 61 }, (_, index) => ({
    date: new Date(Date.UTC(2021 + Math.floor(index / 12), index % 12, 1))
      .toISOString()
      .slice(0, 10),
    close: 100 + index * 4
  }));
  const market = buildMarketSnapshot("MISS", prices);
  const assessment = assessCandidate(candidate, market);

  assert.notStrictEqual(
    assessment.recommendation,
    "High-priority research candidate",
    "missing fundamentals should cap the recommendation"
  );
  assert(
    assessment.missingData.some(item => item.includes("Fundamental data")),
    "missing fundamentals should be called out"
  );
}

// A tiny custom runner keeps the project dependency-light while still giving us
// repeatable checks for the core scoring logic.
const tests = [
  testMarketSnapshot,
  testRiskRewardAssessment,
  testMissingFundamentalsCapsRecommendation
];

for (const test of tests) {
  test();
}

console.log(`${tests.length} tests passed.`);
