export type Recommendation =
  | "High-priority research candidate"
  | "Consider with position-sizing discipline"
  | "Watchlist"
  | "Avoid for now";

export type RiskLevel = "low" | "medium" | "high";

// A growth topic is the starting point for the research run. The news agent
// turns these keywords into searches, then later agents map the theme to stocks.
export interface GrowthTopic {
  id: string;
  name: string;
  industry: string;
  description: string;
  keywords: string[];
}

// The company universe is intentionally explicit and configurable. This keeps
// the first version explainable: every selected company comes from this list.
export interface CompanyProfile {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  exchange?: string;
  marketCapCategory?: "mega" | "large" | "mid" | "small";
  keywords: string[];
  notes?: string;
}

// AppConfig collects the knobs that control breadth, thresholds, scheduling,
// and the research universe used by a run.
export interface AppConfig {
  reportDir: string;
  run: {
    maxArticlesPerTopic: number;
    maxGrowthAreas: number;
    maxCompaniesPerArea: number;
    minNewsScore: number;
    priceHistoryRange: string;
    schedulerIntervalHours: number;
  };
  topics: GrowthTopic[];
  companyUniverse: CompanyProfile[];
}

// NewsArticle represents a normalized article from a news provider. The
// relevanceScore is a local score based on whether the title matches the topic.
export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  language?: string;
  country?: string;
  matchedTopicId?: string;
  relevanceScore?: number;
}

// GrowthArea is the news agent's signal after scoring a topic. It contains the
// detected strength of the theme and a small evidence set for the report.
export interface GrowthArea {
  id: string;
  name: string;
  industry: string;
  description: string;
  keywords: string[];
  newsScore: number;
  articleCount: number;
  uniqueSourceCount: number;
  recentArticleCount: number;
  detectedAt: string;
  evidence: NewsArticle[];
}

// CandidateCompany is a company matched to a detected growth area, with the
// keywords that created the match and a trend-fit score for ranking.
export interface CandidateCompany {
  profile: CompanyProfile;
  growthArea: GrowthArea;
  trendFitScore: number;
  matchedKeywords: string[];
}

// PricePoint stores monthly adjusted closes. Monthly data is enough for the
// risk/reward screen and avoids overfitting to short-term price noise.
export interface PricePoint {
  date: string;
  close: number;
}

// MarketSnapshot is the technical/history view of a stock: returns, volatility,
// drawdown, and derived scores used by the risk/reward agent.
export interface MarketSnapshot {
  ticker: string;
  asOf: string;
  currentPrice?: number;
  prices: PricePoint[];
  returns: {
    threeMonth?: number;
    oneYear?: number;
    threeYearAnnualized?: number;
    fiveYearAnnualized?: number;
  };
  volatilityAnnualized?: number;
  maxDrawdown?: number;
  momentumScore: number;
  stabilityScore: number;
  dataQualityWarnings: string[];
}

// FundamentalsSnapshot contains whatever valuation and balance-sheet data a
// provider can supply. Many fields are optional because free APIs are uneven.
export interface FundamentalsSnapshot {
  ticker: string;
  asOf: string;
  source: string;
  marketCap?: number;
  trailingPe?: number;
  forwardPe?: number;
  priceToSales?: number;
  revenueGrowthTtm?: number;
  grossMarginTtm?: number;
  operatingMarginTtm?: number;
  freeCashFlowMarginTtm?: number;
  debtToEquity?: number;
  dataQualityWarnings: string[];
}

// RiskRewardAssessment is the final numeric and qualitative investment screen.
// The report uses these fields directly to explain the recommendation.
export interface RiskRewardAssessment {
  rewardScore: number;
  riskScore: number;
  riskRewardRatio: number;
  riskLevel: RiskLevel;
  recommendation: Recommendation;
  rewardDrivers: string[];
  riskDrivers: string[];
  missingData: string[];
}

// CompanyAssessment joins every view of a company into the final report object.
// aiSummary is an optional LLM-generated narrative set when an AIProvider is
// configured; absent otherwise so the deterministic thesis always remains.
export interface CompanyAssessment {
  candidate: CandidateCompany;
  market: MarketSnapshot;
  fundamentals?: FundamentalsSnapshot;
  assessment: RiskRewardAssessment;
  thesis: string[];
  aiSummary?: string;
  evidence: NewsArticle[];
}

// ResearchRunResult is returned by the orchestrator after the report and JSON
// artifact have been written.
export interface ResearchRunResult {
  generatedAt: string;
  growthAreas: GrowthArea[];
  assessments: CompanyAssessment[];
  reportPath: string;
  jsonPath: string;
  warnings: string[];
}

// Provider interfaces keep the agents independent from specific data sources.
// That makes it easy to swap in paid APIs or internal datasets later.
export interface NewsProvider {
  fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]>;
}

export interface MarketDataProvider {
  fetchPriceHistory(ticker: string, range: string): Promise<PricePoint[]>;
}

export interface FundamentalsProvider {
  fetchFundamentals(ticker: string): Promise<FundamentalsSnapshot | undefined>;
}
