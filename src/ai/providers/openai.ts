import { postJson } from "../../providers/http";
import { AIProvider } from "../aiProvider";
import { OPENAI_API } from "../../config/urls";
import { log } from "../../utils/logger";

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
}

// OpenAIProvider calls the Chat Completions API.
// Set AI_PROVIDER=openai and OPENAI_API_KEY to activate.
// Override the default model with AI_MODEL.
export class OpenAIProvider implements AIProvider {
  constructor(
    private readonly apiKey: string,
    readonly modelId: string
  ) {}

  async complete(prompt: string, maxTokens = 400): Promise<string> {
    const start = Date.now();
    log.debug("openai request", { model: this.modelId, promptChars: prompt.length, maxTokens });

    try {
      const response = await postJson<OpenAIChatResponse>(
        OPENAI_API,
        {
          model: this.modelId,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }]
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`
          }
        }
      );

      const text = response.choices[0]?.message?.content?.trim() ?? "";
      log.debug("openai response", { model: this.modelId, latencyMs: Date.now() - start, responseChars: text.length });
      return text;
    } catch (err) {
      log.error("openai request failed", { model: this.modelId, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
}
