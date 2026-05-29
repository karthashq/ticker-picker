import { AIProvider } from "../ai";
import { CompanyProfile, GrowthTopic, NewsArticle, NewsProvider, SourceTier } from "../types";
import { log, loggedComplete } from "../utils/logger";
import { getText } from "./http";
import { articleRelevance, parseRssItems, toIsoDate } from "./newsProviderUtils";

interface NewsletterSourceConfig {
  name: string;
  envVarName: string;
  tier: SourceTier;
  role: string;
  focus: string;
  weight: number;
}

interface NewsletterExtraction {
  thesisClaim?: string;
  impliedTickers: string[];
}

interface EnrichedNewsletterArticle {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  description?: string;
  bodyText: string;
  thesisClaim?: string;
  impliedTickers?: string[];
  sourceTier: SourceTier;
  sourceRole: string;
  sourceWeight: number;
}

const TIER_1_SOURCES: NewsletterSourceConfig[] = [
  {
    name: "SemiAnalysis",
    envVarName: "SEMIANALYSIS_RSS_URL",
    tier: "Tier 1 - Thesis generator",
    role: "Thesis generator",
    focus: "Semiconductors and AI hardware",
    weight: 3
  },
  {
    name: "Stratechery",
    envVarName: "STRATECHERY_RSS_URL",
    tier: "Tier 1 - Thesis generator",
    role: "Thesis generator",
    focus: "Technology strategy and platforms",
    weight: 3
  },
  {
    name: "Fabricated Knowledge",
    envVarName: "FABRICATED_KNOWLEDGE_RSS_URL",
    tier: "Tier 1 - Thesis generator",
    role: "Thesis generator",
    focus: "Semiconductor supply chain",
    weight: 3
  },
  {
    name: "Lyn Alden",
    envVarName: "LYN_ALDEN_RSS_URL",
    tier: "Tier 1 - Thesis generator",
    role: "Thesis generator",
    focus: "Macro and value investing",
    weight: 2.5
  },
  {
    name: "Howard Marks Memos",
    envVarName: "HOWARD_MARKS_RSS_URL",
    tier: "Tier 1 - Thesis generator",
    role: "Thesis generator",
    focus: "Risk calibration and market cycles",
    weight: 2.5
  },
  {
    name: "Not Boring",
    envVarName: "NOT_BORING_RSS_URL",
    tier: "Tier 1 - Thesis generator",
    role: "Thesis generator",
    focus: "Growth technology and emerging sectors",
    weight: 2.5
  }
];

const TIER_2_SOURCES: NewsletterSourceConfig[] = [
  {
    name: "Hindenburg Research",
    envVarName: "HINDENBURG_RSS_URL",
    tier: "Tier 2 - Bear / counter-source",
    role: "Bear counter-source",
    focus: "Short seller reports and fraud risk",
    weight: 0.5
  },
  {
    name: "GMO / Grantham",
    envVarName: "GMO_RSS_URL",
    tier: "Tier 2 - Bear / counter-source",
    role: "Bear counter-source",
    focus: "Macro bear theses and valuation bubbles",
    weight: 0.5
  },
  {
    name: "Citron Research",
    envVarName: "CITRON_RSS_URL",
    tier: "Tier 2 - Bear / counter-source",
    role: "Bear counter-source",
    focus: "Short theses and overvaluation",
    weight: 0.5
  }
];

const ALL_NEWSLETTER_SOURCES = [...TIER_1_SOURCES, ...TIER_2_SOURCES];
const DEFAULT_MAX_ARTICLES_PER_SOURCE = 3;
const ARTICLE_TEXT_CHAR_LIMIT = 14000;

export class NewsletterNewsProvider implements NewsProvider {
  readonly warnings: string[] = [];
  private readonly cache = new Map<string, Promise<EnrichedNewsletterArticle[]>>();
  private warnedNoAI = false;
  private warnedMissingSources = new Set<string>();

  constructor(
    private readonly aiProvider: AIProvider,
    private readonly companyUniverse: CompanyProfile[],
    private readonly sources = ALL_NEWSLETTER_SOURCES
  ) {}

  async fetchArticles(topic: GrowthTopic, maxArticles: number): Promise<NewsArticle[]> {
    const configuredSources = this.sources.filter(source => Boolean(process.env[source.envVarName]));
    for (const source of this.sources) {
      if (!process.env[source.envVarName] && !this.warnedMissingSources.has(source.envVarName)) {
        this.warnedMissingSources.add(source.envVarName);
        this.warnings.push(`${source.name} skipped: ${source.envVarName} is not configured.`);
      }
    }

    if (configuredSources.length === 0) {
      return [];
    }

    if (this.aiProvider.modelId === "none" && !this.warnedNoAI) {
      this.warnedNoAI = true;
      this.warnings.push("Newsletter intelligence ran without AI: full article bodies were fetched, but impliedTickers and thesisClaim were not extracted.");
    }

    const batches = await Promise.all(
      configuredSources.map(source => this.fetchSourceArticles(source))
    );

    return batches
      .flat()
      .map(article => this.articleForTopic(article, topic))
      .filter(article => (article.relevanceScore ?? 0) > 0 || (article.impliedTickers?.length ?? 0) > 0)
      .sort((a, b) => weightedRelevance(b) - weightedRelevance(a))
      .slice(0, maxArticles);
  }

  private fetchSourceArticles(source: NewsletterSourceConfig): Promise<EnrichedNewsletterArticle[]> {
    const existing = this.cache.get(source.envVarName);
    if (existing) {
      return existing;
    }

    const promise = this.loadSourceArticles(source);
    this.cache.set(source.envVarName, promise);
    return promise;
  }

  private async loadSourceArticles(source: NewsletterSourceConfig): Promise<EnrichedNewsletterArticle[]> {
    const rssUrl = process.env[source.envVarName];
    if (!rssUrl) {
      return [];
    }

    const maxPerSource = Number(process.env.NEWSLETTER_MAX_ARTICLES_PER_SOURCE ?? DEFAULT_MAX_ARTICLES_PER_SOURCE);
    const start = Date.now();
    log.debug("newsletter rss fetch", { source: source.name, maxPerSource });

    try {
      const xml = await getText(rssUrl, { timeoutMs: 25000 });
      const items = parseRssItems(xml)
        .filter(item => item.link)
        .slice(0, Number.isFinite(maxPerSource) ? maxPerSource : DEFAULT_MAX_ARTICLES_PER_SOURCE);

      const articles = await Promise.all(
        items.map(item => this.enrichItem(source, item))
      );

      log.debug("newsletter rss fetched", {
        source: source.name,
        count: articles.length,
        latencyMs: Date.now() - start
      });
      return articles;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn("newsletter rss failed", { source: source.name, latencyMs: Date.now() - start, error: message });
      this.warnings.push(`${source.name} newsletter failed: ${message}`);
      return [];
    }
  }

  private async enrichItem(
    source: NewsletterSourceConfig,
    item: { title: string; link: string; pubDate?: string; description?: string }
  ): Promise<EnrichedNewsletterArticle> {
    const bodyText = await this.fetchArticleText(item.link).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      this.warnings.push(`${source.name} full article fetch failed for ${item.title}: ${message}`);
      return item.description ?? item.title;
    });
    const extraction =
      this.aiProvider.modelId === "none"
        ? { impliedTickers: [] }
        : await this.extractNewsletterSignals(source, item.title, bodyText).catch(error => {
            const message = error instanceof Error ? error.message : String(error);
            this.warnings.push(`${source.name} AI extraction failed for ${item.title}: ${message}`);
            return { impliedTickers: [] };
          });

    return {
      title: `${source.name}: ${item.title}`,
      url: item.link,
      source: source.name,
      publishedAt: toIsoDate(item.pubDate),
      description: item.description,
      bodyText,
      thesisClaim: extraction.thesisClaim,
      impliedTickers: extraction.impliedTickers.slice(0, 5),
      sourceTier: source.tier,
      sourceRole: source.role,
      sourceWeight: source.weight
    };
  }

  private async fetchArticleText(url: string): Promise<string> {
    const html = await getText(url, { timeoutMs: 30000 });
    return extractReadableText(html).slice(0, ARTICLE_TEXT_CHAR_LIMIT);
  }

  private async extractNewsletterSignals(
    source: NewsletterSourceConfig,
    title: string,
    bodyText: string
  ): Promise<NewsletterExtraction> {
    const prompt = [
      "Extract investment research signals from this newsletter article.",
      "Return only valid JSON with this shape:",
      "{\"thesisClaim\":\"one plain-English sentence\",\"impliedTickers\":[\"TICKER1\",\"TICKER2\"]}",
      "",
      "Rules:",
      "- impliedTickers must contain at most 10 publicly traded tickers ranked by relevance.",
      "- Include tickers that are likely beneficiaries even if the article does not name them.",
      "- Use only tickers from the allowed universe.",
      "- If no ticker is clearly implied, return an empty impliedTickers array.",
      "- thesisClaim must be one sentence a non-expert can understand.",
      "",
      `Source: ${source.name}`,
      `Source role: ${source.role}`,
      `Source focus: ${source.focus}`,
      `Article title: ${title}`,
      "",
      "Allowed universe:",
      this.companyUniverse.map(company => `${company.ticker}: ${company.name} - ${company.industry} (${company.keywords.join(", ")})`).join("\n"),
      "",
      "Article text:",
      bodyText.slice(0, ARTICLE_TEXT_CHAR_LIMIT)
    ].join("\n");

    const raw = await loggedComplete(
      (p, t) => this.aiProvider.complete(p, t),
      {
        caller: "newsletter-intelligence",
        provider: this.aiProvider.modelId,
        context: source.name,
        prompt,
        maxTokens: 700
      }
    );

    return normalizeExtraction(raw, this.companyUniverse);
  }

  private articleForTopic(article: EnrichedNewsletterArticle, topic: GrowthTopic): NewsArticle {
    const relevanceText = [
      article.title,
      article.description,
      article.bodyText.slice(0, 2500),
      article.thesisClaim
    ].filter(Boolean).join(" ");
    const relevanceScore = articleRelevance(topic, relevanceText);

    return {
      title: article.title,
      url: article.url,
      source: article.source,
      publishedAt: article.publishedAt,
      matchedTopicId: topic.id,
      relevanceScore,
      impliedTickers: article.impliedTickers,
      thesisClaim: article.thesisClaim,
      sourceTier: article.sourceTier,
      sourceRole: article.sourceRole,
      sourceWeight: article.sourceWeight
    };
  }
}

function normalizeExtraction(raw: string, companies: CompanyProfile[]): NewsletterExtraction {
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return { impliedTickers: [] };
  }

  const allowed = new Set(companies.map(company => company.ticker.toUpperCase()));
  const impliedTickers = Array.isArray(parsed.impliedTickers)
    ? parsed.impliedTickers
        .map(value => String(value).toUpperCase().replace(/[^A-Z0-9.-]/g, ""))
        .filter(ticker => allowed.has(ticker))
        .filter((ticker, index, values) => values.indexOf(ticker) === index)
        .slice(0, 5)
    : [];

  const thesisClaim =
    typeof parsed.thesisClaim === "string"
      ? oneSentence(parsed.thesisClaim)
      : undefined;

  return { impliedTickers, thesisClaim };
}

function parseJsonObject(raw: string): { thesisClaim?: unknown; impliedTickers?: unknown } | undefined {
  try {
    return JSON.parse(raw) as { thesisClaim?: unknown; impliedTickers?: unknown };
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return undefined;
    }

    try {
      return JSON.parse(match[0]) as { thesisClaim?: unknown; impliedTickers?: unknown };
    } catch {
      return undefined;
    }
  }
}

function oneSentence(value: string): string {
  const normalized = normalizeWhitespace(value);
  const match = normalized.match(/^.*?[.!?](?:\s|$)/);
  return (match?.[0] ?? normalized).trim();
}

function extractReadableText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const articleMatch = withoutScripts.match(/<article[\s\S]*?<\/article>/i);
  const bodyMatch = withoutScripts.match(/<body[\s\S]*?<\/body>/i);
  const textSource = articleMatch?.[0] ?? bodyMatch?.[0] ?? withoutScripts;
  return normalizeWhitespace(decodeHtml(textSource.replace(/<[^>]+>/g, " ")));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function weightedRelevance(article: NewsArticle): number {
  return (article.relevanceScore ?? 0) * (article.sourceWeight ?? 1);
}
