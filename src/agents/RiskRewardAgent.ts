import {
  CandidateCompany,
  CompanyAssessment,
  FundamentalsSnapshot,
  MarketSnapshot,
  Recommendation,
  RiskLevel,
  RiskRewardAssessment
} from "../types";
import { clamp, round } from "../utils/math";

// RiskRewardAgent is the final analytical agent. It combines theme fit,
// historical performance, fundamentals, and data quality into a recommendation.
export class RiskRewardAgent {
  run(
    candidates: CandidateCompany[],
    marketSnapshots: Map<string, MarketSnapshot>,
    fundamentalsSnapshots: Map<string, FundamentalsSnapshot>
  ): CompanyAssessment[] {
    return candidates
      .map(candidate => {
        const ticker = candidate.profile.ticker;
        // Use a defensive missing-market snapshot if the provider failed so the
        // final report can still explain the uncertainty.
        const market = marketSnapshots.get(ticker) ?? missingMarketSnapshot(ticker);
        const fundamentals = fundamentalsSnapshots.get(ticker);
        const assessment = assessCandidate(candidate, market, fundamentals);

        return {
          candidate,
          market,
          fundamentals,
          assessment,
          thesis: buildThesis(candidate, market, fundamentals, assessment),
          evidence: candidate.growthArea.evidence
        };
      })
      .sort((a, b) => b.assessment.riskRewardRatio - a.assessment.riskRewardRatio);
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

// Recommendation labels are conservative. In particular, a stock cannot be
// "High-priority" unless fundamentals were available for this run.
function classifyRecommendation(
  rewardScore: number,
  riskScore: number,
  ratio: number,
  hasFundamentals: boolean
): Recommendation {
  if (hasFundamentals && ratio >= 1.65 && rewardScore >= 68 && riskScore <= 55) {
    return "High-priority research candidate";
  }

  if (ratio >= 1.25 && rewardScore >= 58) {
    return "Consider with position-sizing discipline";
  }

  if (ratio >= 0.9 || rewardScore >= 52) {
    return "Watchlist";
  }

  return "Avoid for now";
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
    `Theme fit is ${candidate.trendFitScore}/100 for ${candidate.growthArea.name}.`,
    `Momentum score is ${market.momentumScore}/100 based on historical price action.`
  ];

  if (qualityScore >= 65) {
    drivers.push(`Quality score is ${qualityScore}/100 from available margin and cash-flow data.`);
  }

  if (fundamentals?.forwardPe && fundamentals.forwardPe < 25) {
    drivers.push(`Forward P/E is ${round(fundamentals.forwardPe, 1)}, which is not extreme for a growth screen.`);
  }

  return drivers;
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
