import { AIProvider } from "../ai";
import { loggedComplete } from "../utils/logger";
import { FundamentalsProvider, FundamentalsSnapshot } from "../types";

// AIFundamentalsProvider generates approximate financial metrics from the AI
// model's training knowledge. It is used as a last-resort fallback when no
// real data provider returns a snapshot for a ticker, so the scoring pipeline
// is not forced to treat well-known companies as entirely unknown.
//
// Every snapshot from this provider carries a data-quality warning so the
// report clearly distinguishes AI-estimated figures from reported financials.
export class AIFundamentalsProvider implements FundamentalsProvider {
  constructor(private readonly ai: AIProvider) {}

  async fetchFundamentals(ticker: string): Promise<FundamentalsSnapshot | undefined> {
    const prompt = buildPrompt(ticker);
    const raw = await loggedComplete(
      (p, t) => this.ai.complete(p, t),
      { caller: "ai-fundamentals", provider: this.ai.modelId, context: ticker, prompt, maxTokens: 400 }
    ).catch(() => "");
    return parseSnapshot(raw, ticker, this.ai.modelId);
  }
}

function buildPrompt(ticker: string): string {
  return [
    `You are a financial research assistant. Provide your best estimate of the following metrics for ${ticker} based on your training knowledge.`,
    "Return approximate figures useful for screening — do not guess; use null for any field you are uncertain about.",
    "",
    "Respond with a JSON object ONLY — no markdown, no explanation:",
    JSON.stringify({
      marketCap: "<number in USD or null>",
      trailingPe: "<number or null>",
      forwardPe: "<number or null>",
      priceToSales: "<number or null>",
      grossMarginTtm: "<decimal 0–1 or null>",
      operatingMarginTtm: "<decimal 0–1 or null>",
      freeCashFlowMarginTtm: "<decimal 0–1 or null>",
      debtToEquity: "<number or null>"
    })
  ].join("\n");
}

interface RawFundamentals {
  marketCap?: number | null;
  trailingPe?: number | null;
  forwardPe?: number | null;
  priceToSales?: number | null;
  grossMarginTtm?: number | null;
  operatingMarginTtm?: number | null;
  freeCashFlowMarginTtm?: number | null;
  debtToEquity?: number | null;
}

function parseSnapshot(
  raw: string,
  ticker: string,
  modelId: string
): FundamentalsSnapshot | undefined {
  const json = extractJsonObject(raw);
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }

  const data = parsed as RawFundamentals;

  // If every field is null/missing the model had no knowledge — skip to avoid
  // a snapshot that only adds misleading data-risk penalties.
  const hasAnyValue = [
    data.marketCap,
    data.trailingPe,
    data.forwardPe,
    data.priceToSales,
    data.grossMarginTtm,
    data.operatingMarginTtm,
    data.freeCashFlowMarginTtm,
    data.debtToEquity
  ].some(v => v !== null && v !== undefined);

  if (!hasAnyValue) {
    return undefined;
  }

  return {
    ticker,
    asOf: new Date().toISOString(),
    source: `AI estimate (${modelId})`,
    marketCap: toPositiveNumber(data.marketCap),
    trailingPe: toPositiveNumber(data.trailingPe),
    forwardPe: toPositiveNumber(data.forwardPe),
    priceToSales: toPositiveNumber(data.priceToSales),
    grossMarginTtm: toBoundedDecimal(data.grossMarginTtm),
    operatingMarginTtm: toDecimal(data.operatingMarginTtm),
    freeCashFlowMarginTtm: toDecimal(data.freeCashFlowMarginTtm),
    debtToEquity: toPositiveNumber(data.debtToEquity),
    dataQualityWarnings: [
      `Fundamentals are AI-estimated from ${modelId} training data — verify against a live source before acting.`
    ]
  };
}

// Extract the first JSON object from a potentially verbose AI response.
function extractJsonObject(text: string): string {
  const cleaned = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  return start !== -1 && end > start ? cleaned.slice(start, end + 1) : "{}";
}

function toPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function toBoundedDecimal(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
}

function toDecimal(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(-1, Math.min(1, value));
}
