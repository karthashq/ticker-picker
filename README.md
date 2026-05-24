# Ticker Picker

Ticker Picker is a TypeScript multi-agent research application. It periodically scans global news signals, identifies growth themes, maps them to relevant public companies, reviews historical price performance and available fundamentals, then writes a detailed stock-research report with risk/reward scoring.

This is research software, not financial advice. The report is designed to help you decide what to investigate further.

## Agent Flow

1. `WorldNewsAgent` collects recent global news by growth-topic queries.
2. `GrowthAreaAgent` ranks industries and themes showing strong news momentum.
3. `CompanyDiscoveryAgent` maps those themes to a configurable public-company universe.
4. `MarketPerformanceAgent` reviews historical share-price performance, volatility, and drawdown.
5. `FundamentalsAgent` enriches the candidate with available valuation and balance-sheet data.
6. `RiskRewardAgent` scores reward potential against volatility, valuation, leverage, and data-quality risk.
7. `ReportAgent` writes a timestamped Markdown report plus a `last-run.json` artifact.

## News And Signal Sources

The aggregation layer is source-aware. It now pulls or can pull from:

- GDELT: global news search, enabled by default.
- SEC EDGAR: recent company filings for matched public companies, enabled by default. Set `SEC_USER_AGENT` to your contact string.
- FRED: macroeconomic series signals, requires `FRED_API_KEY`.
- Reddit: subreddit discussion signals, requires `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`.
- Google Trends: trending RSS signal matching, enabled by default through `GOOGLE_TRENDS_RSS_URL`.
- Crunchbase: startup/private-market signals, requires `CRUNCHBASE_API_KEY`.
- Polygon: ticker news, requires `POLYGON_API_KEY`.
- Benzinga: financial news, requires `BENZINGA_API_KEY`.
- TechCrunch: technology/startup news, enabled by default through TechCrunch's public WordPress JSON feed.
- Bloomberg, FactSet, Quartr, PitchBook, Reuters, and CrunchSpace: supported as licensed/custom RSS or proxy feeds via `*_RSS_URL` environment variables.

If a source is not configured, the report records a data-quality warning rather than pretending that the source was checked.

## Setup

```bash
npm install
npm run build
```

## Run Once

```bash
npm run start
```

Reports are written to `reports/` by default.

## Run Periodically

```bash
RUN_INTERVAL_HOURS=24 npm run schedule
```

The scheduler runs immediately, then repeats at the configured interval.

## Optional Data

The app runs with free, no-key sources where possible:

- GDELT for global news articles.
- SEC EDGAR for public filing metadata.
- Google Trends RSS for public trending searches.
- TechCrunch public post feed.
- Yahoo Finance chart/quote endpoints for historical prices and basic valuation fields.

For richer fundamentals and higher-quality aggregation, add keys:

```bash
FMP_API_KEY=your_key npm run start
```

Common optional keys:

```bash
FRED_API_KEY=your_key
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
CRUNCHBASE_API_KEY=your_key
POLYGON_API_KEY=your_key
BENZINGA_API_KEY=your_key
```

## Customize

Edit the growth topics and company universe in:

- `src/config/defaultConfig.ts`
- `src/data/companyUniverse.ts`

Later improvements can add explicit recommendation-expiry windows, sell/reconsider triggers, portfolio constraints, and a broker/watchlist integration.
