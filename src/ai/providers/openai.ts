import { postJson } from "../../providers/http";
import { AIProvider } from "../aiProvider";
import { OPENAI_API } from "../../config/urls";

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

    return response.choices[0]?.message?.content?.trim() ?? "";
  }
}
