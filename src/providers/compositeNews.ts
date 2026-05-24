import { GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { dedupeNewsArticles } from "./newsProviderUtils";

export class CompositeNewsProvider implements NewsProvider {
  readonly warnings: string[] = [];

  constructor(private readonly providers: NewsProvider[]) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    const settled = await Promise.allSettled(
      this.providers.map(provider => provider.fetchArticles(topic, maxArticles))
    );
    const articles: NewsArticle[] = [];

    settled.forEach((result, index) => {
      const provider = this.providers[index] as NewsProvider & { warnings?: string[] };
      if (Array.isArray(provider.warnings)) {
        this.warnings.push(...provider.warnings.splice(0));
      }

      if (result.status === "fulfilled") {
        articles.push(...result.value);
      } else {
        const providerName = provider.constructor?.name ?? `provider-${index}`;
        const message =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.warnings.push(`${providerName} failed for ${topic.name}: ${message}`);
      }
    });

    return dedupeNewsArticles(articles)
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
      .slice(0, maxArticles * Math.max(this.providers.length, 1));
  }
}

export class OptionalProvider implements NewsProvider {
  readonly warnings: string[] = [];

  constructor(
    private readonly sourceName: string,
    private readonly envVarName: string,
    private readonly enabledProviderFactory: () => NewsProvider
  ) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    if (!process.env[this.envVarName]) {
      this.warnings.push(`${this.sourceName} skipped for ${topic.name}: ${this.envVarName} is not configured.`);
      return [];
    }

    return this.enabledProviderFactory().fetchArticles(topic, maxArticles);
  }
}
