import { CompanyProfile, GrowthTopic, NewsArticle, NewsProvider } from "../types";
import { getJson } from "./http";
import { articleRelevance, companiesForTopic } from "./newsProviderUtils";

interface SecSubmissionsResponse {
  cik?: string;
  name?: string;
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      reportDate?: string[];
      form?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
    };
  };
}

const DEFAULT_SEC_USER_AGENT =
  "TickerPicker/0.1 investment-research contact@example.com";

const IMPORTANT_FORMS = new Set([
  "10-K",
  "10-Q",
  "8-K",
  "S-1",
  "S-3",
  "S-4",
  "DEF 14A",
  "SC 13D",
  "SC 13G",
  "4"
]);

const TICKER_CIK: Record<string, string> = {
  AAPL: "0000320193",
  AMD: "0000002488",
  AMZN: "0001018724",
  AVGO: "0001730168",
  CAT: "0000018230",
  CEG: "0001868275",
  CRWD: "0001535527",
  ETN: "0001551182",
  GOOGL: "0001652044",
  ISRG: "0001035267",
  LLY: "0000059478",
  LMT: "0000936468",
  MA: "0001141391",
  MSFT: "0000789019",
  NEE: "0000753308",
  NET: "0001477333",
  NVDA: "0001045810",
  PANW: "0001327567",
  ROK: "0001024478",
  RTX: "0000101829",
  TER: "0000097210",
  TMO: "0000097745",
  V: "0001403161",
  VRT: "0001674101",
  VRTX: "0000875320",
  ZS: "0001713683"
};

export class SecEdgarProvider implements NewsProvider {
  readonly warnings: string[] = [];

  constructor(
    private readonly companyUniverse: CompanyProfile[],
    private readonly userAgent = process.env.SEC_USER_AGENT ?? DEFAULT_SEC_USER_AGENT
  ) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    const companies = companiesForTopic(topic, this.companyUniverse, 8);
    const articles: NewsArticle[] = [];

    for (const company of companies) {
      const cik = TICKER_CIK[company.ticker.toUpperCase()];
      if (!cik) {
        continue;
      }

      try {
        const filings = await this.fetchCompanyFilings(company, cik, topic, maxArticles);
        articles.push(...filings);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.warnings.push(`SEC EDGAR failed for ${company.ticker}: ${message}`);
      }
    }

    return articles
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, maxArticles);
  }

  private async fetchCompanyFilings(
    company: CompanyProfile,
    cik: string,
    topic: GrowthTopic,
    maxArticles: number
  ): Promise<NewsArticle[]> {
    const response = await getJson<SecSubmissionsResponse>(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      {
        timeoutMs: 25000,
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json"
        }
      }
    );
    const recent = response.filings?.recent;
    if (!recent) {
      return [];
    }

    const articles: NewsArticle[] = [];
    const forms = recent.form ?? [];
    for (let index = 0; index < forms.length && articles.length < maxArticles; index += 1) {
      const form = forms[index];
      if (!IMPORTANT_FORMS.has(form)) {
        continue;
      }

      const filingDate = recent.filingDate?.[index];
      const accession = recent.accessionNumber?.[index];
      const primaryDocument = recent.primaryDocument?.[index];
      if (!filingDate || !accession || !primaryDocument) {
        continue;
      }

      const description = recent.primaryDocDescription?.[index] || form;
      const accessionPath = accession.replace(/-/g, "");
      const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionPath}/${primaryDocument}`;
      const title = `${company.ticker} ${form}: ${description}`;

      articles.push({
        title,
        url,
        source: "SEC EDGAR",
        publishedAt: `${filingDate}T00:00:00Z`,
        matchedTopicId: topic.id,
        relevanceScore: 4 + articleRelevance(topic, `${title} ${company.name} ${company.keywords.join(" ")}`)
      });
    }

    return articles;
  }
}
