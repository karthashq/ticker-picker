import { GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { getJson, withQuery } from "./http";
import { articleRelevance } from "./newsProviderUtils";

interface TechCrunchPost {
  date_gmt?: string;
  link?: string;
  title?: {
    rendered?: string;
  };
  excerpt?: {
    rendered?: string;
  };
}

export class TechCrunchProvider implements NewsProvider {
  readonly warnings: string[] = [];

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    try {
      const url = withQuery("https://techcrunch.com/wp-json/wp/v2/posts", {
        search: topic.keywords.slice(0, 3).join(" "),
        per_page: Math.min(maxArticles, 20),
        orderby: "date",
        order: "desc"
      });
      const response = await getJson<TechCrunchPost[]>(url, { timeoutMs: 20000 });
      return response
        .filter(post => post.title?.rendered && post.link)
        .map(post => {
          const title = stripHtml(post.title?.rendered ?? "Untitled");
          const excerpt = stripHtml(post.excerpt?.rendered ?? "");
          return {
            title: `TechCrunch: ${title}`,
            url: post.link ?? "",
            source: "TechCrunch",
            publishedAt: post.date_gmt ? `${post.date_gmt}Z` : undefined,
            matchedTopicId: topic.id,
            relevanceScore: articleRelevance(topic, `${title} ${excerpt}`)
          };
        })
        .filter(article => (article.relevanceScore ?? 0) > 0)
        .slice(0, maxArticles);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.warnings.push(`TechCrunch failed for ${topic.name}: ${message}`);
      return [];
    }
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
