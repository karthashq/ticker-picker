import { AIProvider } from "./aiProvider";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { OllamaProvider } from "./providers/ollama";
import { OpenAIProvider } from "./providers/openai";
import { OLLAMA_DEFAULT_BASE_URL } from "../config/urls";

// NullAIProvider is the default. It silently skips all AI enrichment so the
// pipeline works identically to the pre-AI version when no key is configured.
export class NullAIProvider implements AIProvider {
  readonly modelId = "none";

  async complete(_prompt: string): Promise<string> {
    return "";
  }
}

// buildAIProvider reads env vars and returns the configured provider.
// AI_PROVIDER: anthropic | openai | ollama | none (default: none)
// AI_MODEL: overrides each provider's default model
export function buildAIProvider(): AIProvider {
  const name = (process.env.AI_PROVIDER ?? "none").toLowerCase();
  const model = process.env.AI_MODEL;

  if (name === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set.");
    }

    return new AnthropicProvider(key, model ?? "claude-haiku-4-5-20251001");
  }

  if (name === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("AI_PROVIDER=openai requires OPENAI_API_KEY to be set.");
    }

    return new OpenAIProvider(key, model ?? "gpt-4o-mini");
  }

  if (name === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("AI_PROVIDER=gemini requires GEMINI_API_KEY to be set.");
    }

    return new GeminiProvider(key, model ?? "gemini-flash-latest");
  }

  if (name === "ollama") {
    return new OllamaProvider(
      process.env.OLLAMA_BASE_URL ?? OLLAMA_DEFAULT_BASE_URL,
      model ?? "llama3.2"
    );
  }

  return new NullAIProvider();
}

export { AIProvider } from "./aiProvider";
