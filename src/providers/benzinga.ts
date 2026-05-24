import { CompanyProfile, GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { getJson, withQuery } from "./http";
import { articleRelevance, companiesForTopic } from "./newsProviderUtils";

type BenzingaNewsItem = {
  id?: number | string;
  title?: string;
  url?: string;
  created?: string;
  updated?: string;
  stocks?: Array<{ name?: string }>;
  teasers?: string[];
  channels?: Array<{ name?: string }>;
};

export class BenzingaNewsProvider implements NewsProvider {
  readonly warnings: string[] = [];
  private warnedMissingKey = false;

  constructor(
    private readonly companyUniverse: CompanyProfile[],
    private readonly apiKey = process.env.BENZINGA_API_KEY
  ) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    if (!this.apiKey) {
      if (!this.warnedMissingKey) {
        this.warnings.push("Benzinga skipped: BENZINGA_API_KEY is not configured.");
        this.warnedMissingKey = true;
      }
      return [];
    }

    const tickers = companiesForTopic(topic, this.companyUniverse, 8)
      .map(company => company.ticker)
      .join(",");
    if (!tickers) {
      return [];
    }

    try {
      const url = withQuery("https://api.benzinga.com/api/v2/news", {
        token: this.apiKey,
        tickers,
        pageSize: maxArticles,
        displayOutput: "full"
      });
      const response = await getJson<BenzingaNewsItem[]>(url, { timeoutMs: 25000 });
      return response
        .filter(item => item.title && item.url)
        .map(item => {
          const teaser = Array.isArray(item.teasers) ? item.teasers.join(" ") : "";
          return {
            title: `Benzinga: ${item.title}`,
            url: item.url ?? "",
            source: "Benzinga",
            publishedAt: item.created ?? item.updated,
            matchedTopicId: topic.id,
            relevanceScore: articleRelevance(topic, `${item.title} ${teaser}`)
          };
        })
        .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
        .slice(0, maxArticles);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.warnings.push(`Benzinga failed for ${topic.name}: ${message}`);
      return [];
    }
  }
}
