import { GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { postJson } from "./http";
import { articleRelevance } from "./newsProviderUtils";
import { CRUNCHBASE_HOME, CRUNCHBASE_ORG_BASE, CRUNCHBASE_SEARCH_API } from "../config/urls";

interface CrunchbaseSearchResponse {
  entities?: Array<{
    uuid?: string;
    identifier?: {
      uuid?: string;
      value?: string;
      permalink?: string;
    };
    properties?: Record<string, unknown>;
  }>;
}

export class CrunchbaseProvider implements NewsProvider {
  readonly warnings: string[] = [];
  private warnedMissingKey = false;

  constructor(private readonly apiKey = process.env.CRUNCHBASE_API_KEY) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    if (!this.apiKey) {
      if (!this.warnedMissingKey) {
        this.warnings.push("Crunchbase skipped: CRUNCHBASE_API_KEY is not configured.");
        this.warnedMissingKey = true;
      }
      return [];
    }

    const body = {
      field_ids: [
        "identifier",
        "short_description",
        "categories",
        "last_funding_at",
        "funding_total",
        "rank_org"
      ],
      query: [
        {
          type: "predicate",
          field_id: "facet_ids",
          operator_id: "includes",
          values: ["company"]
        },
        {
          type: "predicate",
          field_id: "short_description",
          operator_id: "contains",
          values: [topic.keywords[0] ?? topic.name]
        }
      ],
      limit: maxArticles
    };

    try {
      const response = await postJson<CrunchbaseSearchResponse>(
        CRUNCHBASE_SEARCH_API,
        body,
        {
          timeoutMs: 25000,
          headers: {
            "X-cb-user-key": this.apiKey
          }
        }
      );

      return (response.entities ?? [])
        .map(entity => {
          const name = entity.identifier?.value ?? "Unknown organization";
          const permalink = entity.identifier?.permalink ?? entity.uuid ?? entity.identifier?.uuid ?? "";
          const description = String(entity.properties?.short_description ?? "");
          const lastFundingAt = String(entity.properties?.last_funding_at ?? "");
          const fundingTotal = entity.properties?.funding_total;
          const title = `Crunchbase: ${name}${lastFundingAt ? ` last funded ${lastFundingAt}` : ""}`;

          return {
            title,
            url: permalink
              ? `${CRUNCHBASE_ORG_BASE}/${permalink}`
              : CRUNCHBASE_HOME,
            source: "Crunchbase",
            publishedAt: lastFundingAt ? `${lastFundingAt}T00:00:00Z` : undefined,
            matchedTopicId: topic.id,
            relevanceScore:
              articleRelevance(topic, `${name} ${description}`) +
              (typeof fundingTotal === "number" && fundingTotal > 0 ? 1 : 0)
          };
        })
        .filter(article => (article.relevanceScore ?? 0) > 0)
        .slice(0, maxArticles);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.warnings.push(`Crunchbase failed for ${topic.name}: ${message}`);
      return [];
    }
  }
}
