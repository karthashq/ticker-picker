import fs from "fs";
import path from "path";

export interface AICallLogEntry {
  timestamp: string;
  caller: "ai-news" | "ai-fundamentals" | "risk-reward-summary" | "exec-summary";
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
