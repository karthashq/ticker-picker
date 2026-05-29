import { CompanyProfile, GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { getJson, withQuery } from "./http";
import { articleRelevance, companiesForTopic } from "./newsProviderUtils";
import { POLYGON_NEWS_API } from "../config/urls";
import { log } from "../utils/logger";

interface PolygonNewsResponse {
  results?: Array<{
    id?: string;
    title?: string;
    article_url?: string;
    published_utc?: string;
    publisher?: {
      name?: string;
    };
    tickers?: string[];
    description?: string;
  }>;
}

export class PolygonNewsProvider implements NewsProvider {
  readonly warnings: string[] = [];
  private warnedMissingKey = false;

  constructor(
    private readonly companyUniverse: CompanyProfile[],
    private readonly apiKey = process.env.POLYGON_API_KEY
  ) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    if (!this.apiKey) {
      if (!this.warnedMissingKey) {
        this.warnings.push("Polygon skipped: POLYGON_API_KEY is not configured.");
        this.warnedMissingKey = true;
      }
      return [];
    }

    const companies = companiesForTopic(topic, this.companyUniverse, 6);
    const articles: NewsArticle[] = [];
    log.debug("polygon fetch", { topic: topic.id, companies: companies.length });

    for (const company of companies) {
      const start = Date.now();
      try {
        const url = withQuery(POLYGON_NEWS_API, {
          ticker: company.ticker,
          limit: Math.max(3, Math.ceil(maxArticles / 2)),
          sort: "published_utc",
          order: "desc",
          apiKey: this.apiKey
        });
        const response = await getJson<PolygonNewsResponse>(url, { timeoutMs: 20000 });
        const before = articles.length;
        for (const item of response.results ?? []) {
          if (!item.title || !item.article_url) {
            continue;
          }

          articles.push({
            title: `Polygon: ${item.title}`,
            url: item.article_url,
            source: item.publisher?.name ? `Polygon / ${item.publisher.name}` : "Polygon",
            publishedAt: item.published_utc,
            matchedTopicId: topic.id,
            sourceTier: "Tier 3 - Event trigger",
            sourceRole: "Event trigger",
            sourceWeight: 1,
            relevanceScore: articleRelevance(topic, `${item.title} ${item.description ?? ""} ${company.name}`)
          });
        }
        log.debug("polygon ticker fetched", { topic: topic.id, ticker: company.ticker, count: articles.length - before, latencyMs: Date.now() - start });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("polygon ticker failed", { topic: topic.id, ticker: company.ticker, latencyMs: Date.now() - start, error: message });
        this.warnings.push(`Polygon failed for ${company.ticker}: ${message}`);
      }
    }

    return articles
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, maxArticles);
  }
}
