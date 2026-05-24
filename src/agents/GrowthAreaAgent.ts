import { AppConfig, GrowthArea, NewsArticle } from "../types";
import { clamp, round } from "../utils/math";

const RECENT_WINDOW_DAYS = 10;

// GrowthAreaAgent converts raw article lists into ranked industry/theme signals.
// It does not pick stocks yet; it only decides which themes are active enough.
export class GrowthAreaAgent {
  constructor(private readonly config: AppConfig) {}

  run(newsByTopic: Map<string, NewsArticle[]>): GrowthArea[] {
    const now = new Date();

    return this.config.topics
      .map(topic => {
        const articles = newsByTopic.get(topic.id) ?? [];
        // Relevant articles are those whose titles match the topic. Provider
        // body matches still count lightly through article volume, but title
        // relevance drives source diversity, recency, and evidence.
        const relevantArticles = articles.filter(article => (article.relevanceScore ?? 0) > 0);
        const uniqueSources = new Set(
          relevantArticles.map(article => article.source).filter(Boolean)
        );
        // Recent article count favors themes that are alive right now, not only
        // topics with stale historical coverage.
        const recentArticles = relevantArticles.filter(article => {
          if (!article.publishedAt) {
            return false;
          }

          const ageMs = now.getTime() - new Date(article.publishedAt).getTime();
          return ageMs >= 0 && ageMs <= RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        });
        const keywordDensity = calculateKeywordDensity(topic.keywords, relevantArticles);
        // The news score intentionally combines breadth, recency, and title
        // relevance. A small article-volume component keeps body-matched GDELT
        // results from becoming invisible, but direct title evidence dominates.
        const evidence =
          relevantArticles.length > 0
            ? relevantArticles.slice(0, 6)
            : articles.slice(0, 6);
        const newsScore = round(
          clamp(
            relevantArticles.length * 5 +
              uniqueSources.size * 1.2 +
              recentArticles.length * 2 +
              keywordDensity * 35 +
              articles.length * 0.2,
            0,
            100
          ),
          1
        );

        return {
          id: topic.id,
          name: topic.name,
          industry: topic.industry,
          description: topic.description,
          keywords: topic.keywords,
          newsScore,
          articleCount: articles.length,
          uniqueSourceCount: uniqueSources.size,
          recentArticleCount: recentArticles.length,
          detectedAt: now.toISOString(),
          evidence
        };
      })
      .filter(area => area.newsScore >= this.config.run.minNewsScore)
      .sort((a, b) => b.newsScore - a.newsScore)
      .slice(0, this.config.run.maxGrowthAreas);
  }
}

// Keyword density is a simple explainable proxy for whether headlines and
// sources repeatedly mention the topic's search terms.
function calculateKeywordDensity(keywords: string[], articles: NewsArticle[]): number {
  if (articles.length === 0 || keywords.length === 0) {
    return 0;
  }

  const corpus = articles
    .map(article => `${article.title} ${article.source}`.toLowerCase())
    .join(" ");
  const hits = keywords.filter(keyword => corpus.includes(keyword.toLowerCase())).length;
  return hits / keywords.length;
}
