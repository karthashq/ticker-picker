import fs from "fs";
import path from "path";

// ── Console logger ────────────────────────────────────────────────────────────
// Supports four levels. Set LOG_LEVEL=debug to see debug output; default is info.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const enabledLevel: LogLevel =
  (process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined) ?? "info";

function emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[enabledLevel]) {
    return;
  }

  const ts = new Date().toISOString().slice(11, 19);
  const tag = level.toUpperCase().padEnd(5);
  const suffix = data && Object.keys(data).length > 0 ? `  ${JSON.stringify(data)}` : "";
  const line = `[${ts}] ${tag}  ${message}${suffix}`;

  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (message: string, data?: Record<string, unknown>) => emit("debug", message, data),
  info:  (message: string, data?: Record<string, unknown>) => emit("info",  message, data),
  warn:  (message: string, data?: Record<string, unknown>) => emit("warn",  message, data),
  error: (message: string, data?: Record<string, unknown>) => emit("error", message, data),

  // Returns a function that returns elapsed milliseconds since the call.
  timer(): () => number {
    const start = Date.now();
    return () => Date.now() - start;
  }
};

// ── AI call file logger ───────────────────────────────────────────────────────

export interface AICallLogEntry {
  timestamp: string;
  caller: "ai-news" | "ai-fundamentals" | "newsletter-intelligence" | "risk-reward-summary" | "exec-summary";
  provider: string;
  context: string;
  promptChars: number;
  maxTokens: number;
  latencyMs: number;
  responseChars: number;
  success: boolean;
  error?: string;
}

const LOG_DIR = path.resolve(process.cwd(), "logs");

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `ai-calls-${date}.log`);
}

export function appendAILog(entry: AICallLogEntry): void {
  try {
    ensureLogDir();
    fs.appendFileSync(logFilePath(), JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Logging must never crash the pipeline.
  }
}

// Wrap an ai.complete() call with timing and log the result.
export async function loggedComplete(
  completeFn: (prompt: string, maxTokens?: number) => Promise<string>,
  opts: {
    caller: AICallLogEntry["caller"];
    provider: string;
    context: string;
    prompt: string;
    maxTokens: number;
  }
): Promise<string> {
  const start = Date.now();
  try {
    const response = await completeFn(opts.prompt, opts.maxTokens);
    appendAILog({
      timestamp: new Date().toISOString(),
      caller: opts.caller,
      provider: opts.provider,
      context: opts.context,
      promptChars: opts.prompt.length,
      maxTokens: opts.maxTokens,
      latencyMs: Date.now() - start,
      responseChars: response.length,
      success: true
    });
    return response;
  } catch (err) {
    appendAILog({
      timestamp: new Date().toISOString(),
      caller: opts.caller,
      provider: opts.provider,
      context: opts.context,
      promptChars: opts.prompt.length,
      maxTokens: opts.maxTokens,
      latencyMs: Date.now() - start,
      responseChars: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err)
    });
    throw err;
  }
}
