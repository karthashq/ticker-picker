import { AIProvider } from "../ai";
import { GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { articleRelevance } from "./newsProviderUtils";

// AINewsProvider generates thematic news signals from the configured AI model.
// It does not fetch live URLs — it draws on the model's training knowledge to
// produce article-like signals for themes the real-time feeds may miss or
// under-represent. Articles from this provider are clearly labelled so they
// can be traced in the report's evidence section.
export class AINewsProvider implements NewsProvider {
  constructor(private readonly ai: AIProvider) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    const prompt = buildPrompt(topic, maxArticles);
    const raw = await this.ai.complete(prompt, 800).catch(() => "");
    return parseArticles(raw, topic);
  }
}

function buildPrompt(topic: GrowthTopic, maxArticles: number): string {
  return [
    `You are a financial research assistant. Generate ${maxArticles} notable developments for this investment theme:`,
    `Theme: "${topic.name}" (${topic.industry})`,
    `Description: ${topic.description}`,
    `Key focus areas: ${topic.keywords.join(", ")}`,
    "",
    "Include: company announcements, earnings highlights, regulatory changes, sector trends, M&A activity, and macro signals relevant to this theme.",
    "Only include items you are confident about from your training knowledge.",
    "",
    "Respond with a JSON array ONLY — no markdown fences, no explanation, just the array:",
    '[{"title":"Headline here","source":"Publication or source type","publishedAt":"YYYY-MM-DD","url":""}]'
  ].join("\n");
}

interface RawArticle {
  title?: unknown;
  source?: unknown;
  publishedAt?: unknown;
  url?: unknown;
}

function parseArticles(raw: string, topic: GrowthTopic): NewsArticle[] {
  const json = extractJsonArray(raw);
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const today = new Date().toISOString().slice(0, 10);

  return (parsed as RawArticle[])
    .filter(item => typeof item.title === "string" && item.title.trim().length > 0)
    .map(item => {
      const title = String(item.title).trim();
      const source = typeof item.source === "string" ? item.source.trim() : `AI — ${topic.industry}`;
      const publishedAt = parseDate(item.publishedAt) ?? today;
      const url = typeof item.url === "string" ? item.url.trim() : "";

      return {
        title,
        url,
        source: `${source} (AI)`,
        publishedAt,
        matchedTopicId: topic.id,
        relevanceScore: articleRelevance(topic, title)
      } satisfies NewsArticle;
    })
    .filter(article => article.relevanceScore > 0);
}

// Strip markdown fences and extract the first JSON array from the response.
function extractJsonArray(text: string): string {
  const cleaned = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");

  return start !== -1 && end > start ? cleaned.slice(start, end + 1) : "[]";
}

function parseDate(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}
