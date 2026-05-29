import {
  CandidateCompany,
  CompanyAssessment,
  FundamentalsSnapshot,
  MarketSnapshot,
  NewsArticle,
  Recommendation,
  RiskLevel,
  RiskRewardAssessment
} from "../types";
import { clamp, round } from "../utils/math";
import { log, loggedComplete } from "../utils/logger";
import { AIProvider, NullAIProvider } from "../ai";

// RiskRewardAgent is the final analytical agent. It combines theme fit,
// historical performance, fundamentals, and data quality into a recommendation.
// When an AIProvider is configured it also generates a concise per-company
// narrative (aiSummary) that synthesizes the numeric signals into prose. The
// deterministic scores are never replaced — AI enrichment is purely additive.
export class RiskRewardAgent {
  constructor(private readonly aiProvider: AIProvider = new NullAIProvider()) {}

  async run(
    candidates: CandidateCompany[],
    marketSnapshots: Map<string, MarketSnapshot>,
    fundamentalsSnapshots: Map<string, FundamentalsSnapshot>
  ): Promise<CompanyAssessment[]> {
    const assessments: CompanyAssessment[] = candidates
      .map(candidate => {
        const ticker = candidate.profile.ticker;
        const market = marketSnapshots.get(ticker) ?? missingMarketSnapshot(ticker);
        const fundamentals = fundamentalsSnapshots.get(ticker);
        const assessment = assessCandidate(candidate, market, fundamentals);

        log.debug("Company assessed", {
          ticker,
          reward: assessment.rewardScore,
          risk: assessment.riskScore,
          ratio: assessment.riskRewardRatio,
          recommendation: assessment.recommendation,
          hasFundamentals: Boolean(fundamentals)
        });

        return {
          candidate,
          market,
          fundamentals,
          assessment,
          thesis: buildThesis(candidate, market, fundamentals, assessment),
          evidence: selectCandidateEvidence(candidate)
        };
      })
      .sort((a, b) => b.assessment.riskRewardRatio - a.assessment.riskRewardRatio);

    if (this.aiProvider.modelId !== "none") {
      log.debug("Generating AI summaries", { count: assessments.length, model: this.aiProvider.modelId });
      await Promise.all(
        assessments.map(async a => {
          const ticker = a.candidate.profile.ticker;
          log.debug("Generating AI summary", { ticker });
          const summary = await generateAISummary(this.aiProvider, a).catch(err => {
            log.warn("AI summary failed", { ticker, error: err instanceof Error ? err.message : String(err) });
            return "";
          });
          if (summary) {
            log.debug("AI summary generated", { ticker, chars: summary.length });
            a.aiSummary = summary;
          }
        })
      );
    }

    return assessments;
  }
}

// assessCandidate is exported for tests because this is the core scoring logic.
// It deliberately stays deterministic and explainable instead of using an opaque
// model score.
export function assessCandidate(
  candidate: CandidateCompany,
  market: MarketSnapshot,
  fundamentals?: FundamentalsSnapshot
): RiskRewardAssessment {
  const qualityScore = calculateQualityScore(fundamentals);
  const valuationPenalty = calculateValuationRisk(fundamentals);
  const leveragePenalty = calculateLeverageRisk(fundamentals);
  const dataRisk = calculateDataRisk(market, fundamentals);

  // Reward emphasizes theme fit and momentum, with fundamentals and stability as
  // supporting inputs. This favors companies aligned with active growth themes.
  const rewardScore = round(
    clamp(
      candidate.trendFitScore * 0.36 +
        market.momentumScore * 0.26 +
        qualityScore * 0.22 +
        market.stabilityScore * 0.08 +
        marketCapAdvantage(candidate.profile.marketCapCategory) * 0.08,
      0,
      100
    ),
    1
  );
  // Risk combines market downside behavior, valuation, leverage, and missing
  // data. Higher scores mean more uncertainty or downside exposure.
  const riskScore = round(
    clamp(
      volatilityRisk(market) * 0.3 +
        drawdownRisk(market) * 0.25 +
        valuationPenalty * 0.18 +
        leveragePenalty * 0.12 +
        dataRisk * 0.15,
      1,
      100
    ),
    1
  );
  const riskRewardRatio = round(rewardScore / Math.max(riskScore, 1), 2);
  const riskLevel = classifyRisk(riskScore);
  const recommendation = classifyRecommendation(
    rewardScore,
    riskScore,
    riskRewardRatio,
    Boolean(fundamentals)
  );
  const missingData = [
    ...market.dataQualityWarnings,
    ...(fundamentals?.dataQualityWarnings ?? []),
    ...(fundamentals ? [] : ["Fundamental data was unavailable for this run."])
  ];

  return {
    rewardScore,
    riskScore,
    riskRewardRatio,
    riskLevel,
    recommendation,
    rewardDrivers: buildRewardDrivers(candidate, market, fundamentals, qualityScore),
    riskDrivers: buildRiskDrivers(market, fundamentals, valuationPenalty, leveragePenalty),
    missingData
  };
}

// A fallback market snapshot keeps downstream code simple and makes missing
// market data visible as a data-quality warning.
function missingMarketSnapshot(ticker: string): MarketSnapshot {
  return {
    ticker,
    asOf: new Date().toISOString(),
    prices: [],
    returns: {},
    momentumScore: 35,
    stabilityScore: 25,
    dataQualityWarnings: ["No market snapshot was available."]
  };
}

// Quality is based on margins and cash generation. Missing fields get neutral
// fallbacks so one absent metric does not dominate the assessment.
function calculateQualityScore(fundamentals?: FundamentalsSnapshot): number {
  if (!fundamentals) {
    return 45;
  }

  const gross = fundamentals.grossMarginTtm === undefined ? 50 : clamp(fundamentals.grossMarginTtm * 140, 0, 100);
  const operating =
    fundamentals.operatingMarginTtm === undefined ? 50 : clamp(45 + fundamentals.operatingMarginTtm * 180, 0, 100);
  const freeCash =
    fundamentals.freeCashFlowMarginTtm === undefined ? 50 : clamp(45 + fundamentals.freeCashFlowMarginTtm * 200, 0, 100);

  return round(gross * 0.35 + operating * 0.35 + freeCash * 0.3, 1);
}

// High P/E and price/sales multiples increase valuation risk. These thresholds
// are screening heuristics, not intrinsic-value estimates.
function calculateValuationRisk(fundamentals?: FundamentalsSnapshot): number {
  if (!fundamentals) {
    return 65;
  }

  const pe = fundamentals.forwardPe ?? fundamentals.trailingPe;
  const peRisk = pe === undefined ? 55 : clamp((pe - 15) * 2.2 + 35, 10, 95);
  const psRisk =
    fundamentals.priceToSales === undefined
      ? 50
      : clamp((fundamentals.priceToSales - 4) * 7 + 35, 10, 95);

  return round(peRisk * 0.65 + psRisk * 0.35, 1);
}

// Leverage risk uses debt-to-equity when available. Missing leverage is treated
// as moderate rather than low.
function calculateLeverageRisk(fundamentals?: FundamentalsSnapshot): number {
  if (!fundamentals?.debtToEquity) {
    return 45;
  }

  return round(clamp(fundamentals.debtToEquity * 22 + 25, 10, 95), 1);
}

// Missing or sparse data should make the recommendation less confident, so data
// quality contributes directly to the risk score.
function calculateDataRisk(
  market: MarketSnapshot,
  fundamentals?: FundamentalsSnapshot
): number {
  let risk = 15;
  risk += market.dataQualityWarnings.length * 18;
  risk += fundamentals ? fundamentals.dataQualityWarnings.length * 10 : 30;
  if (market.prices.length < 36) {
    risk += 25;
  }

  return clamp(risk, 0, 100);
}

// Translate annualized volatility into a bounded risk contribution.
function volatilityRisk(market: MarketSnapshot): number {
  return market.volatilityAnnualized === undefined
    ? 60
    : round(clamp(market.volatilityAnnualized * 160, 10, 95), 1);
}

// Translate historical drawdown into a bounded risk contribution.
function drawdownRisk(market: MarketSnapshot): number {
  return market.maxDrawdown === undefined
    ? 60
    : round(clamp(market.maxDrawdown * 140, 10, 95), 1);
}

// Larger companies get a small advantage because liquidity, access to capital,
// and business diversity can reduce execution risk in broad screens.
function marketCapAdvantage(category?: string): number {
  switch (category) {
    case "mega":
      return 72;
    case "large":
      return 67;
    case "mid":
      return 58;
    case "small":
      return 45;
    default:
      return 50;
  }
}

// Risk levels are intentionally simple labels for the report.
function classifyRisk(riskScore: number): RiskLevel {
  if (riskScore < 35) {
    return "low";
  }

  if (riskScore < 62) {
    return "medium";
  }

  return "high";
}

// Recommendation labels use the six-state thesis-card system. This stateless
// pipeline can originate WATCH/INVEST ideas; ADD/HOLD/REDUCE/EXIT require the
// future portfolio-monitoring layer described in Phase 2.
function classifyRecommendation(
  rewardScore: number,
  riskScore: number,
  ratio: number,
  hasFundamentals: boolean
): Recommendation {
  if (hasFundamentals && ratio >= 1.65 && rewardScore >= 68 && riskScore <= 55) {
    return "INVEST";
  }

  return "WATCH";
}

// Human-readable reward drivers are generated from the same metrics used in the
// numeric score so the report explains itself.
function buildRewardDrivers(
  candidate: CandidateCompany,
  market: MarketSnapshot,
  fundamentals: FundamentalsSnapshot | undefined,
  qualityScore: number
): string[] {
  const drivers = [
    `Theme fit: ${candidate.trendFitScore}/100 for ${candidate.growthArea.name}; the theme scored ${candidate.growthArea.newsScore}/100 from ${candidate.growthArea.articleCount} articles, ${candidate.growthArea.uniqueSourceCount} sources, and ${candidate.growthArea.recentArticleCount} recent items.`,
    `Company match: ${candidate.profile.name} matched ${formatList(candidate.matchedKeywords)} against a ${candidate.profile.industry} profile in ${candidate.profile.sector}.`,
    `Momentum: ${market.momentumScore}/100, with 3-month return ${formatPercent(market.returns.threeMonth)}, 1-year return ${formatPercent(market.returns.oneYear)}, and 3-year annualized return ${formatPercent(market.returns.threeYearAnnualized)}.`,
    `Stability support: ${market.stabilityScore}/100, using annualized volatility ${formatPercent(market.volatilityAnnualized)} and max drawdown ${formatPercent(market.maxDrawdown)}.`
  ];

  if (fundamentals) {
    drivers.push(
      `Quality: ${qualityScore}/100 from gross margin ${formatPercent(fundamentals.grossMarginTtm)}, operating margin ${formatPercent(fundamentals.operatingMarginTtm)}, and free-cash-flow margin ${formatPercent(fundamentals.freeCashFlowMarginTtm)}.`
    );
    drivers.push(
      `Valuation context: trailing P/E ${formatNumber(fundamentals.trailingPe)}, forward P/E ${formatNumber(fundamentals.forwardPe)}, price/sales ${formatNumber(fundamentals.priceToSales)}, and market cap ${formatMoney(fundamentals.marketCap)}.`
    );
  } else {
    drivers.push("Quality and valuation used conservative fallback inputs because fundamentals were unavailable.");
  }

  if (candidate.profile.marketCapCategory) {
    drivers.push(
      `Scale/liquidity: ${candidate.profile.marketCapCategory}-cap profile contributes ${marketCapAdvantage(candidate.profile.marketCapCategory)}/100 to the reward model.`
    );
  }

  return drivers;
}

function selectCandidateEvidence(candidate: CandidateCompany): NewsArticle[] {
  const ranked = candidate.growthArea.evidence
    .map(article => ({
      article,
      score: evidenceScore(candidate, article)
    }))
    .sort((a, b) => b.score - a.score || comparePublishedAt(b.article, a.article));

  const direct = ranked
    .filter(item => item.score > 0)
    .map(item => item.article);
  const fallback = ranked.map(item => item.article);
  return dedupeArticles([...direct, ...fallback]).slice(0, 4);
}

function evidenceScore(candidate: CandidateCompany, article: NewsArticle): number {
  const profile = candidate.profile;
  const haystack = `${article.title} ${article.source}`.toLowerCase();
  let score = 0;

  if (containsWord(haystack, profile.ticker)) {
    score += 12;
  }

  if (article.impliedTickers?.some(ticker => ticker.toUpperCase() === profile.ticker.toUpperCase())) {
    score += 30 * (article.sourceWeight ?? 1);
  }

  if (haystack.includes(profile.name.toLowerCase())) {
    score += 10;
  }

  for (const word of significantCompanyWords(profile.name)) {
    if (containsWord(haystack, word)) {
      score += 3;
    }
  }

  for (const keyword of candidate.matchedKeywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += 1;
    }
  }

  return score;
}

function dedupeArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const unique: NewsArticle[] = [];

  for (const article of articles) {
    const key = article.url || `${article.source}:${article.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(article);
    }
  }

  return unique;
}

function comparePublishedAt(a: NewsArticle, b: NewsArticle): number {
  return (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "");
}

function containsWord(value: string, token: string): boolean {
  return new RegExp(`\\b${escapeRegExp(token.toLowerCase())}\\b`).test(value);
}

function significantCompanyWords(name: string): string[] {
  const ignored = new Set([
    "corp",
    "corporation",
    "company",
    "inc",
    "incorporated",
    "holding",
    "holdings",
    "technologies",
    "technology"
  ]);

  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 2 && !ignored.has(word));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatPercent(value?: number): string {
  return value === undefined ? "unavailable" : `${round(value * 100, 1)}%`;
}

function formatNumber(value?: number): string {
  return value === undefined ? "unavailable" : String(round(value, 2));
}

function formatMoney(value?: number): string {
  if (value === undefined) {
    return "unavailable";
  }

  if (value >= 1_000_000_000_000) {
    return `$${round(value / 1_000_000_000_000, 2)}T`;
  }

  if (value >= 1_000_000_000) {
    return `$${round(value / 1_000_000_000, 2)}B`;
  }

  if (value >= 1_000_000) {
    return `$${round(value / 1_000_000, 2)}M`;
  }

  return `$${round(value, 2)}`;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "no direct keywords";
}

// Risk drivers call out the largest visible risk categories in plain language.
function buildRiskDrivers(
  market: MarketSnapshot,
  fundamentals: FundamentalsSnapshot | undefined,
  valuationRisk: number,
  leverageRisk: number
): string[] {
  const drivers: string[] = [];

  if (market.volatilityAnnualized !== undefined) {
    drivers.push(`Annualized volatility is ${round(market.volatilityAnnualized * 100, 1)}%.`);
  }

  if (market.maxDrawdown !== undefined) {
    drivers.push(`Max drawdown over available history is ${round(market.maxDrawdown * 100, 1)}%.`);
  }

  if (valuationRisk >= 65) {
    drivers.push("Valuation risk is elevated from available P/E or sales multiples.");
  }

  if (leverageRisk >= 65) {
    drivers.push("Leverage risk is elevated from available debt-to-equity data.");
  }

  if (!fundamentals) {
    drivers.push("Fundamentals were unavailable, increasing uncertainty.");
  }

  return drivers;
}

// The thesis is a concise narrative summary of why the stock landed where it did
// in the ranking.
function buildThesis(
  candidate: CandidateCompany,
  market: MarketSnapshot,
  fundamentals: FundamentalsSnapshot | undefined,
  assessment: RiskRewardAssessment
): string[] {
  const profile = candidate.profile;
  const thesis = [
    `${profile.name} screens as a ${assessment.recommendation.toLowerCase()} because it connects to ${candidate.growthArea.name} with a ${candidate.trendFitScore}/100 trend-fit score.`,
    `${profile.name}'s reward score is ${assessment.rewardScore}/100 versus risk score ${assessment.riskScore}/100, giving a risk/reward ratio of ${assessment.riskRewardRatio}.`
  ];

  if (market.returns.oneYear !== undefined) {
    thesis.push(`One-year historical return is ${round(market.returns.oneYear * 100, 1)}%.`);
  }

  if (fundamentals?.source) {
    thesis.push(`Fundamental inputs came from ${fundamentals.source}.`);
  }

  return thesis;
}

// generateAISummary asks the configured LLM to synthesize the numeric signals
// into a 2-sentence narrative. Errors are swallowed by the caller so a failed
// AI call never blocks the report.
async function generateAISummary(
  ai: AIProvider,
  assessment: CompanyAssessment
): Promise<string> {
  const { candidate, market, fundamentals } = assessment;
  const { profile, growthArea, trendFitScore, matchedKeywords } = candidate;
  const { rewardScore, riskScore, riskRewardRatio, recommendation } = assessment.assessment;

  const fundLine = fundamentals
    ? `Forward P/E: ${fundamentals.forwardPe ?? "N/A"}. Operating margin: ${
        fundamentals.operatingMarginTtm !== undefined
          ? `${round(fundamentals.operatingMarginTtm * 100, 1)}%`
          : "N/A"
      }. Market cap: ${fundamentals.marketCap ? `$${round(fundamentals.marketCap / 1e9, 1)}B` : "N/A"}.`
    : "Fundamentals unavailable.";

  const prompt = [
    "TASK: Write exactly 2 sentences of plain text (no markdown, no bullets, no labels).",
    "Sentence 1: why the company fits the growth theme + what makes it notable given the numeric signals.",
    "Sentence 2: the single most important risk/uncertainty implied by the data.",
    "",
    `Company: ${profile.name} (${profile.ticker}) — sector: ${profile.sector}.`,
    `Growth theme: ${growthArea.name} — ${growthArea.description}`,
    `Theme fit: ${trendFitScore}/100. Keywords: ${matchedKeywords.join(", ")}.`,
    `Scores: reward ${rewardScore}/100; risk ${riskScore}/100; R/R ${riskRewardRatio}; rec: ${recommendation}.`,
    `1y return: ${market.returns.oneYear !== undefined ? `${round(market.returns.oneYear * 100, 1)}%` : "unavailable"}.`,
    `Volatility: ${market.volatilityAnnualized !== undefined ? `${round(market.volatilityAnnualized * 100, 1)}%` : "unavailable"}.`,
    `Max drawdown: ${market.maxDrawdown !== undefined ? `${round(market.maxDrawdown * 100, 1)}%` : "unavailable"}.`,
    fundLine,
    "",
    "OUTPUT:"
  ].join("\n");

  const raw = await loggedComplete(
    (p, t) => ai.complete(p, t),
    { caller: "risk-reward-summary", provider: ai.modelId, context: candidate.profile.ticker, prompt, maxTokens: 200 }
  );

  return raw.replace(/\s+/g, " ").trim();
}
