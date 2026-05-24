import http from "http";
import https from "https";
import { AIProvider } from "../aiProvider";
import { log } from "../../utils/logger";

interface OllamaChatResponse {
  message?: { content: string };
}

// OllamaProvider calls a locally-running Ollama instance.
// Set AI_PROVIDER=ollama to activate. No API key needed.
// Override base URL with OLLAMA_BASE_URL and model with AI_MODEL.
export class OllamaProvider implements AIProvider {
  constructor(
    private readonly baseUrl: string,
    readonly modelId: string
  ) {}

  async complete(prompt: string, maxTokens = 400): Promise<string> {
    const start = Date.now();
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    log.debug("ollama request", { model: this.modelId, url, promptChars: prompt.length, maxTokens });

    try {
      const response = await postOllamaJson<OllamaChatResponse>(url, {
        model: this.modelId,
        stream: false,
        options: { num_predict: maxTokens },
        messages: [{ role: "user", content: prompt }]
      });

      const text = response.message?.content?.trim() ?? "";
      log.debug("ollama response", { model: this.modelId, latencyMs: Date.now() - start, responseChars: text.length });
      return text;
    } catch (err) {
      log.error("ollama request failed", { model: this.modelId, url, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
}

// Ollama typically runs over plain HTTP, so we cannot reuse the https-only
// utility in http.ts. This mirrors its logic but picks the right module.
function postOllamaJson<T>(url: string, body: unknown): Promise<T> {
  const mod = url.startsWith("https") ? https : http;
  const bodyText = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyText)
        }
      },
      res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(JSON.parse(text) as T);
          } catch {
            reject(new Error(`Invalid JSON from Ollama: ${text.slice(0, 160)}`));
          }
        });
      }
    );

    req.setTimeout(60000, () => {
      req.destroy(new Error("Ollama request timed out after 60s"));
    });
    req.on("error", reject);
    req.write(bodyText);
    req.end();
  });
}
