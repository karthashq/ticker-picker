import { postJson, withQuery } from "../../providers/http";
import { AIProvider } from "../aiProvider";
import { GEMINI_API_BASE } from "../../config/urls";
import { log } from "../../utils/logger";

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text?: string; thought?: boolean }> };
  }>;
}

// GeminiProvider calls the Google Generative Language REST API.
// Set AI_PROVIDER=gemini and GEMINI_API_KEY to activate.
// Override the default model with AI_MODEL.
export class GeminiProvider implements AIProvider {
  constructor(
    private readonly apiKey: string,
    readonly modelId: string
  ) {}

  async complete(prompt: string, maxTokens = 400): Promise<string> {
    const start = Date.now();
    log.debug("gemini request", { model: this.modelId, promptChars: prompt.length, maxTokens });

    try {
      const url = withQuery(
        `${GEMINI_API_BASE}/${this.modelId}:generateContent`,
        { key: this.apiKey }
      );

      const response = await postJson<GeminiResponse>(url, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          // Gemini 2.5/3.x models can spend most of the output budget on
          // thinking tokens, causing the visible answer to truncate early.
          // Disable thinking so maxOutputTokens is reserved for the response.
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      const parts = response.candidates[0]?.content?.parts ?? [];
      const text = parts
        .filter(part => !part.thought)
        .map(part => part.text ?? "")
        .join("")
        .trim();
      log.debug("gemini response", { model: this.modelId, latencyMs: Date.now() - start, responseChars: text.length });
      return text;
    } catch (err) {
      log.error("gemini request failed", { model: this.modelId, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
}
