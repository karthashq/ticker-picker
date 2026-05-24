import { postJson } from "../../providers/http";
import { AIProvider } from "../aiProvider";

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
    const response = await postJson<AnthropicMessagesResponse>(
      "https://api.anthropic.com/v1/messages",
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
    return block?.text.trim() ?? "";
  }
}
