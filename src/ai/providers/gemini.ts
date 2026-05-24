import { postJson, withQuery } from "../../providers/http";
import { AIProvider } from "../aiProvider";
import { GEMINI_API_BASE } from "../../config/urls";

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
    const url = withQuery(
      `${GEMINI_API_BASE}/${this.modelId}:generateContent`,
      { key: this.apiKey }
    );

    const response = await postJson<GeminiResponse>(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    });

    return response.candidates[0]?.content?.parts[0]?.text?.trim() ?? "";
  }
}
