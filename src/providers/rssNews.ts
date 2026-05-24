import { GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { getText } from "./http";
import { articleRelevance, parseRssItems, toIsoDate } from "./newsProviderUtils";
import { log } from "../utils/logger";

export class ConfiguredRssNewsProvider implements NewsProvider {
  readonly warnings: string[] = [];
  private warnedMissingUrl = false;

  constructor(
    private readonly sourceName: string,
    private readonly envVarName: string
  ) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    const rssUrl = process.env[this.envVarName];
    if (!rssUrl) {
      if (!this.warnedMissingUrl) {
        this.warnings.push(`${this.sourceName} skipped: ${this.envVarName} is not configured.`);
        this.warnedMissingUrl = true;
      }
      return [];
    }

    const start = Date.now();
    log.debug("rss fetch", { source: this.sourceName, topic: topic.id });

    try {
      const xml = await getText(rssUrl, { timeoutMs: 20000 });
      const articles = parseRssItems(xml)
        .map(item => ({
          title: `${this.sourceName}: ${item.title}`,
          url: item.link,
          source: this.sourceName,
          publishedAt: toIsoDate(item.pubDate),
          matchedTopicId: topic.id,
          relevanceScore: articleRelevance(topic, `${item.title} ${item.description ?? ""}`)
        }))
        .filter(article => (article.relevanceScore ?? 0) > 0)
        .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
        .slice(0, maxArticles);
      log.debug("rss fetched", { source: this.sourceName, topic: topic.id, count: articles.length, latencyMs: Date.now() - start });
      return articles;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn("rss failed", { source: this.sourceName, topic: topic.id, latencyMs: Date.now() - start, error: message });
      this.warnings.push(`${this.sourceName} RSS failed for ${topic.name}: ${message}`);
      return [];
    }
  }
}
