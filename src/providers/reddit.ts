import { GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { getJson, postForm, withQuery } from "./http";
import { articleRelevance, envList } from "./newsProviderUtils";
import { REDDIT_OAUTH_BASE, REDDIT_TOKEN_URL, REDDIT_WEB_BASE } from "../config/urls";
import { log } from "../utils/logger";

interface RedditListingResponse {
  data?: {
    children?: Array<{
      data?: {
        title?: string;
        permalink?: string;
        url?: string;
        subreddit?: string;
        created_utc?: number;
        score?: number;
        num_comments?: number;
      };
    }>;
  };
}

interface RedditTokenResponse {
  access_token?: string;
  expires_in?: number;
}

const DEFAULT_SUBREDDITS = [
  "investing",
  "stocks",
  "SecurityAnalysis",
  "Economics",
  "technology",
  "Futurology",
  "wallstreetbets",
  "biotech",
  "energy"
];

export class RedditProvider implements NewsProvider {
  readonly warnings: string[] = [];
  private accessToken?: string;
  private tokenExpiresAt = 0;
  private warnedMissingCredentials = false;

  constructor(
    private readonly clientId = process.env.REDDIT_CLIENT_ID,
    private readonly clientSecret = process.env.REDDIT_CLIENT_SECRET,
    private readonly subreddits = envList("REDDIT_SUBREDDITS", DEFAULT_SUBREDDITS)
  ) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    if (!this.clientId || !this.clientSecret) {
      if (!this.warnedMissingCredentials) {
        this.warnings.push("Reddit skipped: REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are not configured.");
        this.warnedMissingCredentials = true;
      }
      return [];
    }

    const token = await this.getAccessToken();
    const articles: NewsArticle[] = [];
    const query = topic.keywords.slice(0, 4).join(" OR ");
    log.debug("reddit fetch", { topic: topic.id, subreddits: this.subreddits.slice(0, 6).length });

    for (const subreddit of this.subreddits.slice(0, 6)) {
      const start = Date.now();
      try {
        const url = withQuery(`${REDDIT_OAUTH_BASE}/r/${subreddit}/search`, {
          q: query,
          restrict_sr: "1",
          sort: "new",
          t: "week",
          limit: Math.max(3, Math.ceil(maxArticles / 2))
        });
        const response = await getJson<RedditListingResponse>(url, {
          timeoutMs: 20000,
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "TickerPicker/0.1 by local-user"
          }
        });

        const before = articles.length;
        for (const child of response.data?.children ?? []) {
          const post = child.data;
          if (!post?.title || !post.permalink) {
            continue;
          }

          const title = `r/${post.subreddit ?? subreddit}: ${post.title}`;
          articles.push({
            title,
            url: `${REDDIT_WEB_BASE}${post.permalink}`,
            source: "Reddit",
            publishedAt: post.created_utc
              ? new Date(post.created_utc * 1000).toISOString()
              : undefined,
            matchedTopicId: topic.id,
            relevanceScore:
              articleRelevance(topic, title) +
              Math.min(((post.score ?? 0) + (post.num_comments ?? 0)) / 100, 5)
          });
        }
        log.debug("reddit subreddit fetched", { topic: topic.id, subreddit, count: articles.length - before, latencyMs: Date.now() - start });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("reddit subreddit failed", { topic: topic.id, subreddit, latencyMs: Date.now() - start, error: message });
        this.warnings.push(`Reddit failed for r/${subreddit}: ${message}`);
      }
    }

    return articles
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
      .slice(0, maxArticles);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    log.debug("reddit token fetch");
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const text = await postForm(
      REDDIT_TOKEN_URL,
      { grant_type: "client_credentials" },
      {
        timeoutMs: 20000,
        headers: {
          Authorization: `Basic ${basic}`,
          "User-Agent": "TickerPicker/0.1 by local-user"
        }
      }
    );
    const tokenResponse = JSON.parse(text) as RedditTokenResponse;
    if (!tokenResponse.access_token) {
      throw new Error("Reddit token response did not include access_token.");
    }

    this.accessToken = tokenResponse.access_token;
    this.tokenExpiresAt = Date.now() + Math.max((tokenResponse.expires_in ?? 3600) - 60, 60) * 1000;
    log.debug("reddit token acquired", { expiresInSeconds: tokenResponse.expires_in ?? 3600 });
    return this.accessToken;
  }
}
