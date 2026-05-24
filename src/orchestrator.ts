import { GrowthAreaAgent } from "./agents/GrowthAreaAgent";
import { CompanyDiscoveryAgent } from "./agents/CompanyDiscoveryAgent";
import { FundamentalsAgent } from "./agents/FundamentalsAgent";
import { MarketPerformanceAgent } from "./agents/MarketPerformanceAgent";
import { ReportAgent } from "./agents/ReportAgent";
import { RiskRewardAgent } from "./agents/RiskRewardAgent";
import { WorldNewsAgent } from "./agents/WorldNewsAgent";
import { defaultConfig } from "./config/defaultConfig";
import {
  AppConfig,
  FundamentalsProvider,
  MarketDataProvider,
  NewsProvider,
  ResearchRunResult
} from "./types";
import {
  CompositeFundamentalsProvider,
  FinancialModelingPrepFundamentalsProvider,
  YahooFundamentalsProvider,
  YahooMarketDataProvider
} from "./providers/marketData";
import { BenzingaNewsProvider } from "./providers/benzinga";
import { CompositeNewsProvider } from "./providers/compositeNews";
import { CrunchbaseProvider } from "./providers/crunchbase";
import { FredMacroProvider } from "./providers/fred";
import { GoogleTrendsRssProvider } from "./providers/googleTrends";
import { GdeltNewsProvider } from "./providers/news";
import { PolygonNewsProvider } from "./providers/polygonNews";
import { RedditProvider } from "./providers/reddit";
import { ConfiguredRssNewsProvider } from "./providers/rssNews";
import { SecEdgarProvider } from "./providers/secEdgar";
import { TechCrunchProvider } from "./providers/techCrunch";

// Dependencies can be injected for tests or future provider swaps. In normal
// use, the orchestrator builds the default live providers itself.
export interface OrchestratorDependencies {
  newsProvider?: NewsProvider;
  marketDataProvider?: MarketDataProvider;
  fundamentalsProvider?: FundamentalsProvider;
}

// ResearchOrchestrator wires the agents together in the order data flows:
// news -> growth areas -> companies -> market/fundamentals -> risk/report.
export class ResearchOrchestrator {
  private readonly config: AppConfig;
  private readonly newsProvider: NewsProvider;
  private readonly worldNewsAgent: WorldNewsAgent;
  private readonly growthAreaAgent: GrowthAreaAgent;
  private readonly companyDiscoveryAgent: CompanyDiscoveryAgent;
  private readonly marketPerformanceAgent: MarketPerformanceAgent;
  private readonly fundamentalsAgent: FundamentalsAgent;
  private readonly riskRewardAgent: RiskRewardAgent;
  private readonly reportAgent: ReportAgent;

  constructor(
    config: AppConfig = defaultConfig,
    dependencies: OrchestratorDependencies = {}
  ) {
    this.config = config;
    const newsProvider =
      dependencies.newsProvider ?? buildDefaultNewsProvider(config);
    const marketDataProvider =
      dependencies.marketDataProvider ?? new YahooMarketDataProvider();
    const fundamentalsProvider =
      dependencies.fundamentalsProvider ?? buildDefaultFundamentalsProvider();

    this.newsProvider = newsProvider;
    this.worldNewsAgent = new WorldNewsAgent(config, newsProvider);
    this.growthAreaAgent = new GrowthAreaAgent(config);
    this.companyDiscoveryAgent = new CompanyDiscoveryAgent(config);
    this.marketPerformanceAgent = new MarketPerformanceAgent(
      marketDataProvider,
      config.run.priceHistoryRange
    );
    this.fundamentalsAgent = new FundamentalsAgent(fundamentalsProvider);
    this.riskRewardAgent = new RiskRewardAgent();
    this.reportAgent = new ReportAgent(config);
  }

  async run(): Promise<ResearchRunResult> {
    const generatedAt = new Date().toISOString();
    const warnings: string[] = [];
    // Step 1: collect recent news for each configured growth topic.
    const newsByTopic = await this.worldNewsAgent.run();
    warnings.push(...collectProviderWarnings(this.newsProvider));
    // Step 2: convert article signals into ranked growth areas.
    const growthAreas = this.growthAreaAgent.run(newsByTopic);

    if (growthAreas.length === 0) {
      warnings.push("No growth areas passed the configured news-score threshold.");
    }

    // Step 3: map the strongest themes to companies in the curated universe.
    const candidates = this.companyDiscoveryAgent.run(growthAreas);
    if (candidates.length === 0) {
      warnings.push("No company candidates matched the detected growth areas.");
    }

    // Step 4: market history and fundamentals are independent, so run them
    // together to reduce total runtime.
    const [marketSnapshots, fundamentalsSnapshots] = await Promise.all([
      this.marketPerformanceAgent.run(candidates),
      this.fundamentalsAgent.run(candidates)
    ]);
    // Step 5: score each company and write the final artifacts.
    const assessments = this.riskRewardAgent.run(
      candidates,
      marketSnapshots,
      fundamentalsSnapshots
    );
    const paths = await this.reportAgent.writeReport(
      generatedAt,
      growthAreas,
      assessments,
      warnings
    );

    return {
      generatedAt,
      growthAreas,
      assessments,
      warnings,
      ...paths
    };
  }
}

// Some providers expose warning arrays. This helper copies those warnings into
// the run result without forcing every provider interface to support warnings.
function collectProviderWarnings(provider: NewsProvider): string[] {
  const maybeWithWarnings = provider as { warnings?: unknown };
  return Array.isArray(maybeWithWarnings.warnings)
    ? maybeWithWarnings.warnings.filter(
        (warning): warning is string => typeof warning === "string"
      )
    : [];
}

function buildDefaultNewsProvider(config: AppConfig): NewsProvider {
  return new CompositeNewsProvider([
    new GdeltNewsProvider(),
    new SecEdgarProvider(config.companyUniverse),
    new FredMacroProvider(),
    new RedditProvider(),
    new GoogleTrendsRssProvider(),
    new CrunchbaseProvider(),
    new PolygonNewsProvider(config.companyUniverse),
    new BenzingaNewsProvider(config.companyUniverse),
    new TechCrunchProvider(),
    new ConfiguredRssNewsProvider("Bloomberg", "BLOOMBERG_RSS_URL"),
    new ConfiguredRssNewsProvider("FactSet", "FACTSET_RSS_URL"),
    new ConfiguredRssNewsProvider("Quartr", "QUARTR_RSS_URL"),
    new ConfiguredRssNewsProvider("PitchBook", "PITCHBOOK_RSS_URL"),
    new ConfiguredRssNewsProvider("Reuters", "REUTERS_RSS_URL"),
    new ConfiguredRssNewsProvider("CrunchSpace", "CRUNCHSPACE_RSS_URL")
  ]);
}

// Default fundamentals prefer richer FMP data when the user provides an API key,
// then fall back to Yahoo quote data when available.
function buildDefaultFundamentalsProvider(): FundamentalsProvider {
  const providers: FundamentalsProvider[] = [];
  if (process.env.FMP_API_KEY) {
    providers.push(new FinancialModelingPrepFundamentalsProvider(process.env.FMP_API_KEY));
  }

  providers.push(new YahooFundamentalsProvider());
  return new CompositeFundamentalsProvider(providers);
}
