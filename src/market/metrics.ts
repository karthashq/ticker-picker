import { MarketSnapshot, PricePoint } from "../types";
import { annualizedReturn, clamp, percentageReturn, round, standardDeviation } from "../utils/math";

// Convert raw monthly prices into the market metrics used by the risk/reward
// model. The output intentionally includes both raw prices and derived scores.
export function buildMarketSnapshot(ticker: string, prices: PricePoint[]): MarketSnapshot {
  // Sort defensively in case a provider returns records out of order.
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const dataQualityWarnings: string[] = [];

  if (sorted.length < 12) {
    dataQualityWarnings.push("Less than 12 monthly price points were available.");
  }

  const latest = sorted[sorted.length - 1];
  // Use multiple time horizons so the model can distinguish recent momentum
  // from longer-term compounding.
  const returns = {
    threeMonth: returnFromMonthsAgo(sorted, 3),
    oneYear: returnFromMonthsAgo(sorted, 12),
    threeYearAnnualized: annualizedFromMonthsAgo(sorted, 36),
    fiveYearAnnualized: annualizedFromMonthsAgo(sorted, 60)
  };
  const monthlyReturns = calculateMonthlyReturns(sorted);
  const monthlyVolatility = standardDeviation(monthlyReturns);
  // Monthly standard deviation is annualized with sqrt(12), the standard
  // approximation for independent monthly returns.
  const volatilityAnnualized =
    monthlyVolatility === undefined ? undefined : monthlyVolatility * Math.sqrt(12);
  const maxDrawdown = calculateMaxDrawdown(sorted);

  return {
    ticker,
    asOf: latest?.date ? new Date(`${latest.date}T00:00:00Z`).toISOString() : new Date().toISOString(),
    currentPrice: latest?.close,
    prices: sorted,
    returns,
    volatilityAnnualized: volatilityAnnualized === undefined ? undefined : round(volatilityAnnualized, 4),
    maxDrawdown: maxDrawdown === undefined ? undefined : round(maxDrawdown, 4),
    momentumScore: calculateMomentumScore(returns.oneYear, returns.threeYearAnnualized),
    stabilityScore: calculateStabilityScore(volatilityAnnualized, maxDrawdown),
    dataQualityWarnings
  };
}

// Price-to-price returns are the building block for volatility.
export function calculateMonthlyReturns(prices: PricePoint[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < prices.length; index += 1) {
    const previous = prices[index - 1].close;
    const current = prices[index].close;
    const value = percentageReturn(previous, current);
    if (value !== undefined && Number.isFinite(value)) {
      returns.push(value);
    }
  }

  return returns;
}

// Max drawdown measures the largest peak-to-trough decline in the available
// history, which is often more intuitive than volatility for downside risk.
export function calculateMaxDrawdown(prices: PricePoint[]): number | undefined {
  if (prices.length === 0) {
    return undefined;
  }

  let peak = prices[0].close;
  let maxDrawdown = 0;

  for (const price of prices) {
    peak = Math.max(peak, price.close);
    const drawdown = peak > 0 ? (price.close - peak) / peak : 0;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
  }

  return Math.abs(maxDrawdown);
}

// Return from a specific monthly lookback. If there is not enough history, the
// caller receives undefined and the scoring model applies a neutral fallback.
function returnFromMonthsAgo(prices: PricePoint[], months: number): number | undefined {
  if (prices.length < months + 1) {
    return undefined;
  }

  const start = prices[prices.length - 1 - months].close;
  const end = prices[prices.length - 1].close;
  const result = percentageReturn(start, end);
  return result === undefined ? undefined : round(result, 4);
}

// Convert multi-year price growth into a yearly compounded return.
function annualizedFromMonthsAgo(prices: PricePoint[], months: number): number | undefined {
  if (prices.length < months + 1) {
    return undefined;
  }

  const start = prices[prices.length - 1 - months].close;
  const end = prices[prices.length - 1].close;
  const result = annualizedReturn(start, end, months / 12);
  return result === undefined ? undefined : round(result, 4);
}

// Momentum blends one-year and three-year performance. The clamp prevents a
// single extreme return from overwhelming the rest of the risk/reward model.
function calculateMomentumScore(oneYear?: number, threeYearAnnualized?: number): number {
  const oneYearComponent = oneYear === undefined ? 45 : clamp(50 + oneYear * 100, 0, 100);
  const threeYearComponent =
    threeYearAnnualized === undefined ? 45 : clamp(50 + threeYearAnnualized * 160, 0, 100);

  return round(oneYearComponent * 0.6 + threeYearComponent * 0.4, 1);
}

// Stability rewards lower volatility and shallower drawdowns. Missing data gets
// a cautious-but-not-zero fallback so the report can still be generated.
function calculateStabilityScore(volatility?: number, maxDrawdown?: number): number {
  const volatilityComponent =
    volatility === undefined ? 45 : clamp(100 - volatility * 180, 0, 100);
  const drawdownComponent =
    maxDrawdown === undefined ? 45 : clamp(100 - maxDrawdown * 160, 0, 100);

  return round(volatilityComponent * 0.55 + drawdownComponent * 0.45, 1);
}
