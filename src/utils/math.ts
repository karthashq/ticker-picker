export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Rounding is centralized so report-facing numbers are consistent everywhere.
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Simple descriptive stats used by market-performance calculations.
export function mean(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Sample standard deviation is used because the monthly returns are a sample of
// observed market behavior, not a complete population.
export function standardDeviation(values: number[]): number | undefined {
  if (values.length < 2) {
    return undefined;
  }

  const avg = mean(values);
  if (avg === undefined) {
    return undefined;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

// Guard against divide-by-zero or malformed prices before calculating returns.
export function percentageReturn(start: number, end: number): number | undefined {
  if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(end)) {
    return undefined;
  }

  return (end - start) / start;
}

// Annualized return lets stocks with different lengths of history be compared
// on a common yearly basis.
export function annualizedReturn(
  start: number,
  end: number,
  years: number
): number | undefined {
  if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(end) || years <= 0) {
    return undefined;
  }

  return (end / start) ** (1 / years) - 1;
}
