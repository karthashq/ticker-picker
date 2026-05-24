import { GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { getText } from "./http";
import { articleRelevance, parseRssItems, toIsoDate } from "./newsProviderUtils";
import { GOOGLE_TRENDS_RSS } from "../config/urls";
import { log } from "../utils/logger";

export class GoogleTrendsRssProvider implements NewsProvider {
  readonly warnings: string[] = [];

  constructor(
    private readonly rssUrl = process.env.GOOGLE_TRENDS_RSS_URL ?? GOOGLE_TRENDS_RSS
  ) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    const start = Date.now();
    log.debug("google trends fetch", { topic: topic.id });

    try {
      const xml = await getText(this.rssUrl, { timeoutMs: 20000 });
      const articles = parseRssItems(xml)
        .map(item => ({
          title: `Google Trends: ${item.title}`,
          url: item.link,
          source: "Google Trends",
          publishedAt: toIsoDate(item.pubDate),
          matchedTopicId: topic.id,
          relevanceScore: articleRelevance(topic, `${item.title} ${item.description ?? ""}`)
        }))
        .filter(article => (article.relevanceScore ?? 0) > 0)
        .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
        .slice(0, maxArticles);
      log.debug("google trends fetched", { topic: topic.id, count: articles.length, latencyMs: Date.now() - start });
      return articles;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn("google trends failed", { topic: topic.id, latencyMs: Date.now() - start, error: message });
      this.warnings.push(`Google Trends RSS failed for ${topic.name}: ${message}`);
      return [];
    }
  }
}
