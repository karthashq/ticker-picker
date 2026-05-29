import { GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { getJson, withQuery } from "./http";
import { GDELT_API } from "../config/urls";

interface GdeltArticle {
  title?: string;
  url?: string;
  domain?: string;
  sourcecountry?: string;
  language?: string;
  seendate?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

// GDELT is a free global news source, but it is strict about request pacing and
// query syntax. This provider normalizes its response into NewsArticle objects.
export class GdeltNewsProvider implements NewsProvider {
  static lastRequestAt = 0;

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    // GDELT rejects OR groups unless they are wrapped in parentheses. We also
    // skip very short single-word terms because they are too broad for GDELT.
    const queryTerms = topic.keywords.flatMap(formatGdeltTerm);
    const query = `(${queryTerms.length > 0 ? queryTerms.join(" OR ") : `"${topic.name}"`})`;
    const url = withQuery(GDELT_API, {
      query,
      mode: "artlist",
      format: "json",
      maxrecords: Math.min(maxArticles, 50),
      sort: "datedesc"
    });

    const response = await this.fetchWithRateLimit(url);
    return (response.articles ?? [])
      .filter(article => article.title && article.url)
      .map(article => ({
        title: article.title ?? "Untitled",
        url: article.url ?? "",
        source: article.domain ?? "unknown",
        country: article.sourcecountry,
        language: article.language,
        publishedAt: parseGdeltDate(article.seendate),
        matchedTopicId: topic.id,
        sourceTier: "Tier 3 - Event trigger" as const,
        sourceRole: "Event trigger",
        sourceWeight: 1,
        relevanceScore: calculateArticleRelevance(topic, article.title ?? "")
      }))
      // Keep the report readable and avoid recommending stocks from articles
      // the user cannot easily inspect because of language mismatch.
      .filter(article => isEnglishArticle(article))
      // Sorting by title relevance keeps the strongest article evidence first.
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
  }

  private async fetchWithRateLimit(url: string): Promise<GdeltResponse> {
    // The free GDELT endpoint asks clients to stay below one request every five
    // seconds. Respecting that limit makes scheduled runs more reliable.
    await waitForGdeltSlot();
    try {
      return await getJson<GdeltResponse>(url, { timeoutMs: 25000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("HTTP 429")) {
        throw error;
      }

      // A 429 means the provider still thinks we are moving too quickly. Wait a
      // little longer, then retry once so transient pacing issues do not kill a run.
      await sleep(6500);
      await waitForGdeltSlot();
      return getJson<GdeltResponse>(url, { timeoutMs: 25000 });
    }
  }
}

// ResilientNewsProvider turns provider failures into run warnings. The rest of
// the pipeline can continue with partial data instead of failing the whole job.
export class ResilientNewsProvider implements NewsProvider {
  readonly warnings: string[] = [];

  constructor(private readonly primary: NewsProvider) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    try {
      return await this.primary.fetchArticles(topic, maxArticles);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.warnings.push(`News fetch failed for ${topic.name}: ${message}`);
      return [];
    }
  }
}

// Gate all GDELT calls through a single timestamp so sequential topic fetches
// do not accidentally violate the endpoint's rate limit.
async function waitForGdeltSlot(): Promise<void> {
  const minDelayMs = 5500;
  const now = Date.now();
  const elapsed = now - GdeltNewsProvider.lastRequestAt;
  if (elapsed < minDelayMs) {
    await sleep(minDelayMs - elapsed);
  }

  GdeltNewsProvider.lastRequestAt = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// GDELT date strings are compact, so convert them to ISO timestamps for easier
// recency comparisons later in GrowthAreaAgent.
function parseGdeltDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
  if (!match) {
    return value;
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

// GDELT phrase matching is useful for multi-word concepts, while bare words are
// better for longer single terms such as "cybersecurity" or "robotics".
function formatGdeltTerm(keyword: string): string[] {
  const trimmed = keyword.trim().toLowerCase();
  const tokens = trimmed.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  if (tokens.length === 1) {
    return tokens[0].length >= 5 ? [tokens[0]] : [];
  }

  return [`"${trimmed}"`];
}

// Prefer GDELT's language metadata when available. If it is absent, use a simple
// ASCII ratio as a fallback heuristic for English-language article titles.
function isEnglishArticle(article: NewsArticle): boolean {
  const language = article.language?.toLowerCase();
  if (language) {
    return language.includes("english") || language === "en";
  }

  const asciiCount = [...article.title].filter(char => char.charCodeAt(0) <= 127).length;
  return asciiCount / Math.max(article.title.length, 1) > 0.85;
}

// Relevance is based on title matches because titles are what the report shows
// as evidence. GDELT may match body text, but a relevant title is easier to audit.
function calculateArticleRelevance(topic: GrowthTopic, titleValue: string): number {
  const title = titleValue.toLowerCase();
  return topic.keywords.reduce((score, keyword) => {
    const normalized = keyword.toLowerCase();
    if (normalized.length <= 2) {
      return score;
    }

    if (title.includes(normalized)) {
      return score + 3;
    }

    const keywordTokens = normalized.split(/[^a-z0-9]+/).filter(token => token.length > 4);
    const tokenHits = keywordTokens.filter(token =>
      tokenVariants(token).some(variant => title.includes(variant))
    ).length;
    return score + tokenHits;
  }, 0);
}

// Basic singular/plural variants make title matching less brittle without
// introducing a heavy stemming dependency.
function tokenVariants(token: string): string[] {
  if (token.endsWith("ies") && token.length > 4) {
    return [token, `${token.slice(0, -3)}y`];
  }

  if (token.endsWith("s") && token.length > 4) {
    return [token, token.slice(0, -1)];
  }

  return [token];
}
