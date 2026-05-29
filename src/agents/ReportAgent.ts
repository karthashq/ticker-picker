import fs from "fs/promises";
import path from "path";
import { AppConfig, CompanyAssessment, GrowthArea, NewsArticle, Recommendation, ResearchRunResult } from "../types";
import { round } from "../utils/math";
import { log, loggedComplete } from "../utils/logger";
import { AIProvider, NullAIProvider } from "../ai";

// ReportAgent is responsible for artifacts only: a human-readable Markdown
// report and a machine-readable JSON snapshot of the same run.
// When an AIProvider is configured, it prepends an AI-generated narrative
// paragraph to the executive summary before the ranking table.
export class ReportAgent {
  constructor(
    private readonly config: AppConfig,
    private readonly aiProvider: AIProvider = new NullAIProvider()
  ) {}

  async writeReport(
    generatedAt: string,
    growthAreas: GrowthArea[],
    assessments: CompanyAssessment[],
    warnings: string[]
  ): Promise<Pick<ResearchRunResult, "reportPath" | "jsonPath">> {
    // Reports are timestamped so scheduled runs keep history. last-run.json is
    // overwritten so other tools can always read the latest result.
    await fs.mkdir(this.config.reportDir, { recursive: true });

    const stamp = generatedAt.replace(/[:.]/g, "-");
    const reportPath = path.join(this.config.reportDir, `ticker-picker-${stamp}.md`);
    const jsonPath = path.join(this.config.reportDir, "last-run.json");

    if (this.aiProvider.modelId !== "none") {
      log.debug("Generating AI executive summary", { model: this.aiProvider.modelId });
    }

    const aiExecSummary =
      this.aiProvider.modelId !== "none"
        ? await generateAIExecSummary(this.aiProvider, growthAreas, assessments).catch(err => {
            log.warn("AI executive summary failed", { error: err instanceof Error ? err.message : String(err) });
            return "";
          })
        : "";

    const markdown = renderMarkdown(
      generatedAt,
      growthAreas,
      assessments,
      warnings,
      aiExecSummary,
      this.aiProvider.modelId
    );

    log.info("Writing report files", { reportPath, jsonPath });
    await fs.writeFile(reportPath, markdown, "utf8");
    await fs.writeFile(
      jsonPath,
      JSON.stringify({ generatedAt, growthAreas, assessments, warnings }, null, 2),
      "utf8"
    );
    log.debug("Report files written", {
      reportPath,
      jsonPath,
      markdownBytes: Buffer.byteLength(markdown)
    });

    return { reportPath, jsonPath };
  }
}

// Render the full Markdown report as a list of sections. Joining arrays keeps
// the layout easy to scan and avoids a very large template string.
function renderMarkdown(
  generatedAt: string,
  growthAreas: GrowthArea[],
  assessments: CompanyAssessment[],
  warnings: string[],
  aiExecSummary: string,
  aiModelId: string
): string {
  const topAssessments = assessments.slice(0, 15);

  return [
    "# Ticker Picker Research Report",
    "",
    `Generated at: ${generatedAt}`,
    "",
    "> This report is for research and education only. It is not financial advice, and it does not account for your objectives, liquidity needs, tax position, or risk tolerance.",
    "",
    "## Executive Summary",
    "",
    ...(aiExecSummary ? [aiExecSummary, ""] : []),
    renderSummary(topAssessments),
    "",
    "## Growth Areas Detected",
    "",
    ...growthAreas.map(renderGrowthArea),
    "",
    "## Stock Candidates",
    "",
    ...topAssessments.map(renderAssessment),
    "",
    "## Methodology",
    "",
    "- News momentum: weighted article volume, source diversity, recency, and keyword density across configured feeds.",
    "- Newsletter intelligence: configured Tier 1 RSS feeds are fetched at full-article depth, then enriched with thesis claims and implied tickers when AI is enabled.",
    "- Aggregation sources: GDELT, SEC EDGAR, FRED, Reddit, Google Trends RSS, Crunchbase, Polygon, Benzinga, TechCrunch, and any licensed RSS/proxy feeds configured through environment variables.",
    "- Company relevance: keyword and industry fit plus LLM-implied ticker evidence from long-form newsletter sources.",
    "- Market performance: monthly adjusted price history, one-year momentum, annualized returns, volatility, and max drawdown.",
    "- Fundamentals: available valuation, margin, cash-flow, leverage, and market-cap data.",
    "- Risk/reward: deterministic scoring that weighs growth-theme fit and quality against volatility, drawdown, valuation, leverage, and missing-data risk.",
    "- Thesis card enforcement: INVEST, ADD, and REDUCE signals require a bear case; otherwise the report displays WATCH.",
    ...(aiModelId !== "none"
      ? [`- AI enrichment: narrative synthesis via ${aiModelId}. All numeric scores are deterministic; AI text is additive.`]
      : []),
    "",
    "## Data Quality Notes",
    "",
    ...(warnings.length > 0 ? warnings.map(warning => `- ${warning}`) : ["- No run-level warnings."]),
    "",
    "## Next Improvements",
    "",
    "- Add explicit validity windows for recommendations.",
    "- Add reconsider/sell triggers based on price, valuation, thesis deterioration, and news reversal.",
    "- Add portfolio constraints, sector concentration checks, and watchlist export.",
    ""
  ].join("\n");
}

// The executive summary is a compact ranking table for quick review.
function renderSummary(assessments: CompanyAssessment[]): string {
  if (assessments.length === 0) {
    return "No candidates passed the configured research thresholds.";
  }

  const rows = [
    "| Rank | Ticker | Company | Theme | Signal | Reward | Risk | R/R |",
    "| ---: | --- | --- | --- | --- | ---: | ---: | ---: |"
  ];

  assessments.slice(0, 10).forEach((assessment, index) => {
    const card = buildThesisCard(assessment);
    rows.push(
      `| ${index + 1} | ${assessment.candidate.profile.ticker} | ${escapePipe(
        assessment.candidate.profile.name
      )} | ${escapePipe(assessment.candidate.growthArea.name)} | ${card.signal} | ${assessment.assessment.rewardScore} | ${assessment.assessment.riskScore} | ${assessment.assessment.riskRewardRatio} |`
    );
  });

  return rows.join("\n");
}

// Growth-area sections show why a theme was detected before showing stocks.
function renderGrowthArea(area: GrowthArea): string {
  const evidence = area.evidence
    .filter(article => article.url)
    .slice(0, 4)
    .map(article => {
      const title = escapeMarkdown(article.title);
      const source = renderSourceLink(article.source, article.url);
      return `  - ${source}: [${title}](${article.url})`;
    });

  return [
    `### ${area.name}`,
    "",
    `Industry: ${area.industry}`,
    "",
    `${area.description}`,
    "",
    `News score: ${area.newsScore}/100. Articles: ${area.articleCount}. Unique sources: ${area.uniqueSourceCount}. Recent articles: ${area.recentArticleCount}.`,
    "",
    evidence.length > 0 ? "Evidence:" : "Evidence: no source links were available.",
    ...evidence,
    ""
  ].join("\n");
}

// Candidate sections combine thesis, drivers, risks, historical performance,
// fundamentals, and data caveats for each stock.
function renderAssessment(assessment: CompanyAssessment): string {
  const profile = assessment.candidate.profile;
  const market = assessment.market;
  const fundamentals = assessment.fundamentals;
  const risk = assessment.assessment;
  const thesisCard = buildThesisCard(assessment);

  return [
    `### ${profile.ticker} - ${profile.name}`,
    "",
    `Sector: ${profile.sector}. Industry: ${profile.industry}. Country: ${profile.country}.`,
    "",
    ...renderThesisCard(thesisCard),
    "Score details:",
    `- Risk/reward ratio: ${risk.riskRewardRatio}. Reward score: ${risk.rewardScore}/100. Risk score: ${risk.riskScore}/100 (${risk.riskLevel}).`,
    ...(assessment.aiSummary ? [`- AI context: ${assessment.aiSummary}`] : assessment.thesis.map(item => `- ${item}`)),
    "",
    ...renderAssessmentEvidence(assessment),
    "Reward drivers:",
    ...risk.rewardDrivers.map(item => `- ${item}`),
    "",
    "Risks:",
    ...risk.riskDrivers.map(item => `- ${item}`),
    "",
    "Historical performance:",
    `- Current/last monthly close: ${market.currentPrice ? formatMoney(market.currentPrice) : "Unavailable"}`,
    `- 3-month return: ${formatPercent(market.returns.threeMonth)}`,
    `- 1-year return: ${formatPercent(market.returns.oneYear)}`,
    `- 3-year annualized return: ${formatPercent(market.returns.threeYearAnnualized)}`,
    `- 5-year annualized return: ${formatPercent(market.returns.fiveYearAnnualized)}`,
    `- Annualized volatility: ${formatPercent(market.volatilityAnnualized)}`,
    `- Max drawdown: ${formatPercent(market.maxDrawdown)}`,
    "",
    "Fundamentals:",
    `- Source: ${fundamentals?.source ?? "Unavailable"}`,
    `- Market cap: ${fundamentals?.marketCap ? formatMoney(fundamentals.marketCap) : "Unavailable"}`,
    `- Trailing P/E: ${formatNumber(fundamentals?.trailingPe)}`,
    `- Forward P/E: ${formatNumber(fundamentals?.forwardPe)}`,
    `- Price/sales: ${formatNumber(fundamentals?.priceToSales)}`,
    `- Operating margin: ${formatPercent(fundamentals?.operatingMarginTtm)}`,
    `- Free-cash-flow margin: ${formatPercent(fundamentals?.freeCashFlowMarginTtm)}`,
    `- Debt/equity: ${formatNumber(fundamentals?.debtToEquity)}`,
    "",
    "Data caveats:",
    ...(risk.missingData.length > 0 ? risk.missingData.map(item => `- ${item}`) : ["- None flagged."]),
    ""
  ].join("\n");
}

interface ThesisCard {
  ticker: string;
  signal: Recommendation;
  theBet: string;
  whyNow: string;
  whatBreaksIt: string;
  bearCase: string;
  sources: NewsArticle[];
}

function buildThesisCard(assessment: CompanyAssessment): ThesisCard {
  const profile = assessment.candidate.profile;
  const thesisClaim = bestThesisClaim(assessment);
  const bearCase = buildBearCase(assessment);
  const requiresBearCase = ["INVEST", "ADD", "REDUCE"].includes(assessment.assessment.recommendation);
  const signal = requiresBearCase && !bearCase ? "WATCH" : assessment.assessment.recommendation;

  return {
    ticker: profile.ticker,
    signal,
    theBet:
      thesisClaim ??
      `${profile.name} benefits if ${assessment.candidate.growthArea.name.toLowerCase()} keeps growing because its business is directly tied to that theme.`,
    whyNow: buildWhyNow(assessment),
    whatBreaksIt: buildWhatBreaksIt(assessment),
    bearCase:
      bearCase ??
      "The bear case is not strong enough to support an invest signal yet, so this idea should remain on watch.",
    sources: thesisSources(assessment)
  };
}

function renderThesisCard(card: ThesisCard): string[] {
  return [
    `TICKER:         ${card.ticker}`,
    `SIGNAL:         ${card.signal}`,
    "",
    `THE BET:        ${card.theBet}`,
    `WHY NOW:        ${card.whyNow}`,
    `WHAT BREAKS IT: ${card.whatBreaksIt}`,
    `BEAR CASE:      ${card.bearCase}`,
    "SOURCES:",
    ...card.sources.map(renderThesisSource),
    ""
  ];
}

function bestThesisClaim(assessment: CompanyAssessment): string | undefined {
  const article = [...assessment.evidence, ...assessment.candidate.growthArea.evidence]
    .find(item => item.thesisClaim && item.impliedTickers?.includes(assessment.candidate.profile.ticker));
  return article?.thesisClaim ? plainSentence(article.thesisClaim) : undefined;
}

function buildWhyNow(assessment: CompanyAssessment): string {
  const tier1Sources = independentTierSources(assessment, "Tier 1 - Thesis generator");
  if (tier1Sources.length >= 2) {
    return `${tier1Sources.length} independent thesis sources this week point toward ${assessment.candidate.profile.ticker}, showing convergence around ${assessment.candidate.growthArea.name.toLowerCase()}.`;
  }

  const sourceNames = thesisSources(assessment).map(article => article.source);
  const uniqueSourceNames = [...new Set(sourceNames)];
  const sourceText = uniqueSourceNames.length > 0 ? uniqueSourceNames.slice(0, 2).join(" and ") : "recent source evidence";
  return `${sourceText} surfaced this idea while the broader ${assessment.candidate.growthArea.name.toLowerCase()} theme is scoring ${assessment.candidate.growthArea.newsScore}/100.`;
}

function buildWhatBreaksIt(assessment: CompanyAssessment): string {
  const theme = assessment.candidate.growthArea.name.toLowerCase();
  if (assessment.market.returns.oneYear !== undefined && assessment.market.returns.oneYear < -0.15) {
    return `The thesis breaks if the weak share-price trend continues while evidence for ${theme} fails to improve.`;
  }

  return `The thesis breaks if demand tied to ${theme} slows or the company's reported fundamentals stop supporting the story.`;
}

function buildBearCase(assessment: CompanyAssessment): string | undefined {
  const ticker = assessment.candidate.profile.ticker;
  const bearArticle = [...assessment.evidence, ...assessment.candidate.growthArea.evidence]
    .find(article =>
      article.sourceTier === "Tier 2 - Bear / counter-source" &&
      (article.impliedTickers?.includes(ticker) || (article.relevanceScore ?? 0) > 0)
    );

  if (bearArticle?.thesisClaim) {
    return plainSentence(bearArticle.thesisClaim);
  }

  const valuationRisk = assessment.assessment.riskDrivers.find(driver =>
    driver.toLowerCase().includes("valuation")
  );
  if (valuationRisk) {
    return `The strongest counter-argument is valuation risk: ${lowercaseFirst(valuationRisk)}`;
  }

  const firstRisk = assessment.assessment.riskDrivers[0];
  if (firstRisk) {
    return `The strongest counter-argument is that ${lowercaseFirst(firstRisk)}`;
  }

  return undefined;
}

function thesisSources(assessment: CompanyAssessment): NewsArticle[] {
  const candidates = assessment.evidence.length > 0
    ? assessment.evidence
    : assessment.candidate.growthArea.evidence;
  return candidates
    .filter(article => article.url)
    .filter((article, index, articles) =>
      articles.findIndex(existing => existing.url === article.url) === index
    )
    .slice(0, 5);
}

function renderThesisSource(article: NewsArticle): string {
  const date = article.publishedAt ? article.publishedAt.slice(0, 10) : "date unavailable";
  const tier = article.sourceTier ?? "Tier 3 - Event trigger";
  return `- ${renderSourceLink(article.source, article.url)} - ${date} - ${tier}`;
}

function independentTierSources(assessment: CompanyAssessment, tier: string): string[] {
  const sources = new Set<string>();
  for (const article of [...assessment.evidence, ...assessment.candidate.growthArea.evidence]) {
    if (article.sourceTier === tier && article.impliedTickers?.includes(assessment.candidate.profile.ticker)) {
      sources.add(article.source);
    }
  }

  return [...sources];
}

function renderAssessmentEvidence(assessment: CompanyAssessment): string[] {
  const evidence = assessment.evidence
    .filter(article => article.title || article.url)
    .slice(0, 4);

  if (evidence.length === 0) {
    return [
      "Highlighted evidence:",
      "- No source links were available for this candidate; selection came from theme/company keyword fit.",
      ""
    ];
  }

  return [
    "Highlighted evidence:",
    ...evidence.map(article => {
      const date = article.publishedAt ? article.publishedAt.slice(0, 10) : "date unavailable";
      const source = renderSourceLink(article.source || "Unknown source", article.url);
      const title = escapeMarkdown(article.title || article.url);
      const linkedTitle = article.url ? `[${title}](${article.url})` : title;
      const score = article.relevanceScore === undefined ? "" : ` - relevance ${round(article.relevanceScore, 1)}`;
      return `- Original source: ${source} (${date}${score}) - ${linkedTitle}`;
    }),
    ""
  ];
}

function renderSourceLink(source: string, url?: string): string {
  const label = escapeMarkdown(source || "Unknown source");
  return url ? `[${label}](${url})` : label;
}

function plainSentence(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^.*?[.!?](?:\s|$)/);
  const sentence = (match?.[0] ?? normalized).trim();
  return sentence.endsWith(".") || sentence.endsWith("!") || sentence.endsWith("?")
    ? sentence
    : `${sentence}.`;
}

function lowercaseFirst(value: string): string {
  return value.length === 0 ? value : `${value[0].toLowerCase()}${value.slice(1)}`;
}

// Formatting helpers keep report values readable and consistent.
function formatPercent(value?: number): string {
  return value === undefined ? "Unavailable" : `${round(value * 100, 1)}%`;
}

function formatNumber(value?: number): string {
  return value === undefined ? "Unavailable" : String(round(value, 2));
}

function formatMoney(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `$${round(value / 1_000_000_000_000, 2)}T`;
  }

  if (value >= 1_000_000_000) {
    return `$${round(value / 1_000_000_000, 2)}B`;
  }

  if (value >= 1_000_000) {
    return `$${round(value / 1_000_000, 2)}M`;
  }

  return `$${round(value, 2)}`;
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function escapeMarkdown(value: string): string {
  return value.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

// generateAIExecSummary asks the LLM for a concise narrative opening paragraph
// that synthesizes the top themes and candidates into prose. This is a single
// API call regardless of how many candidates are in the report.
async function generateAIExecSummary(
  ai: AIProvider,
  growthAreas: GrowthArea[],
  assessments: CompanyAssessment[]
): Promise<string> {
  const areaLines = growthAreas
    .map(a => `- ${a.name} (news score: ${a.newsScore}/100, ${a.articleCount} articles)`)
    .join("\n");

  const top5 = assessments.slice(0, 5);
  const candidateLines = top5
    .map(
      (a, i) =>
        `${i + 1}. ${a.candidate.profile.ticker} (${a.candidate.profile.name}) — ${a.candidate.growthArea.name} — ${a.assessment.recommendation} — R/R ${a.assessment.riskRewardRatio}`
    )
    .join("\n");

  const prompt = [
    "You are writing the opening paragraph for a growth stock screening report.",
    "",
    "Detected growth themes:",
    areaLines,
    "",
    "Top candidates by risk/reward:",
    candidateLines,
    "",
    "Write 3 sentences: (1) which themes are most active and what is driving them, (2) which candidates stand out and what they share, (3) the primary cross-portfolio risk. Be analytical and specific. Do not give financial advice."
  ].join("\n");

  return loggedComplete(
    (p, t) => ai.complete(p, t),
    { caller: "exec-summary", provider: ai.modelId, context: "exec-summary", prompt, maxTokens: 300 }
  );
}
