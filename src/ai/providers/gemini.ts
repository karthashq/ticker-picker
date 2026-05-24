import { postJson, withQuery } from "../../providers/http";
import { AIProvider } from "../aiProvider";
import { GEMINI_API_BASE } from "../../config/urls";
import { log } from "../../utils/logger";

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
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
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens }
      });

      const text = response.candidates[0]?.content?.parts[0]?.text?.trim() ?? "";
      log.debug("gemini response", { model: this.modelId, latencyMs: Date.now() - start, responseChars: text.length });
      return text;
    } catch (err) {
      log.error("gemini request failed", { model: this.modelId, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
}
