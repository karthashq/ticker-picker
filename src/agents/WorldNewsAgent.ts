import { AppConfig, GrowthTopic, NewsArticle, NewsProvider } from "../types";

// WorldNewsAgent is the first agent in the pipeline. It asks the configured
// news provider for articles for every growth topic.
export class WorldNewsAgent {
  constructor(
    private readonly config: AppConfig,
    private readonly newsProvider: NewsProvider
  ) {}

  async run(): Promise<Map<string, NewsArticle[]>> {
    // A Map keeps topic ids attached to article lists without duplicating topic
    // metadata in every downstream step.
    const result = new Map<string, NewsArticle[]>();

    for (const topic of this.config.topics) {
      const articles = await this.fetchTopic(topic);
      result.set(topic.id, dedupeArticles(articles));
    }

    return result;
  }

  private async fetchTopic(topic: GrowthTopic): Promise<NewsArticle[]> {
    return this.newsProvider.fetchArticles(topic, this.config.run.maxArticlesPerTopic);
  }
}

// Deduplication avoids overweighting the same article when a provider returns
// duplicated URLs or multiple versions of the same headline.
function dedupeArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const unique: NewsArticle[] = [];

  for (const article of articles) {
    const key = article.url || `${article.source}:${article.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(article);
    }
  }

  return unique;
}
