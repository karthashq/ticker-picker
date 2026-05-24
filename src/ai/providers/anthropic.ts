import { postJson } from "../../providers/http";
import { AIProvider } from "../aiProvider";
import { ANTHROPIC_API } from "../../config/urls";
import { log } from "../../utils/logger";

interface AnthropicMessagesResponse {
  content: Array<{ type: string; text: string }>;
}

// AnthropicProvider calls the Claude Messages API.
// Set AI_PROVIDER=anthropic and ANTHROPIC_API_KEY to activate.
// Override the default model with AI_MODEL.
export class AnthropicProvider implements AIProvider {
  constructor(
    private readonly apiKey: string,
    readonly modelId: string
  ) {}

  async complete(prompt: string, maxTokens = 400): Promise<string> {
    const start = Date.now();
    log.debug("anthropic request", { model: this.modelId, promptChars: prompt.length, maxTokens });

    try {
      const response = await postJson<AnthropicMessagesResponse>(
        ANTHROPIC_API,
        {
          model: this.modelId,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }]
        },
        {
          headers: {
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01"
          }
        }
      );

      const block = response.content.find(c => c.type === "text");
      const text = block?.text.trim() ?? "";
      log.debug("anthropic response", { model: this.modelId, latencyMs: Date.now() - start, responseChars: text.length });
      return text;
    } catch (err) {
      log.error("anthropic request failed", { model: this.modelId, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
}
