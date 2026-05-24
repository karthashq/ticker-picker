import { CompanyProfile, GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { getJson, withQuery } from "./http";
import { articleRelevance, companiesForTopic } from "./newsProviderUtils";
import { POLYGON_NEWS_API } from "../config/urls";

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

    for (const company of companies) {
      try {
        const url = withQuery(POLYGON_NEWS_API, {
          ticker: company.ticker,
          limit: Math.max(3, Math.ceil(maxArticles / 2)),
          sort: "published_utc",
          order: "desc",
          apiKey: this.apiKey
        });
        const response = await getJson<PolygonNewsResponse>(url, { timeoutMs: 20000 });
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
            relevanceScore: articleRelevance(topic, `${item.title} ${item.description ?? ""} ${company.name}`)
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.warnings.push(`Polygon failed for ${company.ticker}: ${message}`);
      }
    }

    return articles
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, maxArticles);
  }
}
