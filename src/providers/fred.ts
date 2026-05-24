import { GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { getJson, withQuery } from "./http";
import { articleRelevance } from "./newsProviderUtils";

interface FredObservationsResponse {
  observations?: Array<{
    date: string;
    value: string;
  }>;
}

interface FredSeriesConfig {
  id: string;
  title: string;
  topics: string[];
}

const DEFAULT_FRED_SERIES: FredSeriesConfig[] = [
  { id: "FEDFUNDS", title: "Effective Federal Funds Rate", topics: ["power-grid", "digital-commerce-payments", "automation-robotics"] },
  { id: "DGS10", title: "10-Year Treasury Constant Maturity Rate", topics: ["digital-commerce-payments", "biotech-platforms", "automation-robotics"] },
  { id: "CPIAUCSL", title: "Consumer Price Index", topics: ["obesity-metabolic-health", "digital-commerce-payments"] },
  { id: "UNRATE", title: "Unemployment Rate", topics: ["digital-commerce-payments", "automation-robotics"] },
  { id: "INDPRO", title: "Industrial Production Index", topics: ["automation-robotics", "defense-security"] },
  { id: "MANEMP", title: "Manufacturing Employment", topics: ["automation-robotics", "defense-security"] },
  { id: "PPIACO", title: "Producer Price Index: All Commodities", topics: ["power-grid", "automation-robotics"] },
  { id: "DCOILWTICO", title: "WTI Crude Oil Price", topics: ["power-grid", "defense-security"] }
];

export class FredMacroProvider implements NewsProvider {
  readonly warnings: string[] = [];
  private warnedMissingKey = false;

  constructor(
    private readonly apiKey = process.env.FRED_API_KEY,
    private readonly series = DEFAULT_FRED_SERIES
  ) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    if (!this.apiKey) {
      if (!this.warnedMissingKey) {
        this.warnings.push("FRED skipped: FRED_API_KEY is not configured.");
        this.warnedMissingKey = true;
      }
      return [];
    }

    const relevantSeries = this.series.filter(series =>
      series.topics.includes(topic.id) || articleRelevance(topic, series.title) > 0
    );
    const articles: NewsArticle[] = [];

    for (const series of relevantSeries.slice(0, maxArticles)) {
      try {
        const article = await this.fetchSeriesSignal(topic, series);
        if (article) {
          articles.push(article);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.warnings.push(`FRED failed for ${series.id}: ${message}`);
      }
    }

    return articles;
  }

  private async fetchSeriesSignal(
    topic: GrowthTopic,
    series: FredSeriesConfig
  ): Promise<NewsArticle | undefined> {
    const url = withQuery("https://api.stlouisfed.org/fred/series/observations", {
      api_key: this.apiKey,
      file_type: "json",
      series_id: series.id,
      sort_order: "desc",
      limit: 2
    });
    const response = await getJson<FredObservationsResponse>(url, { timeoutMs: 20000 });
    const observations = (response.observations ?? [])
      .map(observation => ({
        date: observation.date,
        value: Number.parseFloat(observation.value)
      }))
      .filter(observation => Number.isFinite(observation.value));
    const latest = observations[0];
    const previous = observations[1];
    if (!latest) {
      return undefined;
    }

    const change =
      previous && previous.value !== 0
        ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100
        : undefined;
    const changeText = change === undefined ? "" : `, ${change.toFixed(2)}% vs previous observation`;

    return {
      title: `FRED macro signal: ${series.title} was ${latest.value} on ${latest.date}${changeText}`,
      url: `https://fred.stlouisfed.org/series/${series.id}`,
      source: "FRED",
      publishedAt: `${latest.date}T00:00:00Z`,
      matchedTopicId: topic.id,
      relevanceScore: 2 + articleRelevance(topic, series.title)
    };
  }
}
