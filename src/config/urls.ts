// Single source of truth for all external URLs used by the application.
// Grouped by service. Dynamic segments (ticker, CIK, model) are appended by callers.

// === News providers ===
export const GDELT_API = "https://api.gdeltproject.org/api/v2/doc/doc";
export const BENZINGA_API = "https://api.benzinga.com/api/v2/news";
export const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
export const REDDIT_OAUTH_BASE = "https://oauth.reddit.com";
export const REDDIT_WEB_BASE = "https://www.reddit.com";
export const GOOGLE_TRENDS_RSS = "https://trends.google.com/trending/rss?geo=US";
export const TECHCRUNCH_API = "https://techcrunch.com/wp-json/wp/v2/posts";
export const POLYGON_NEWS_API = "https://api.polygon.io/v2/reference/news";
export const CRUNCHBASE_SEARCH_API = "https://api.crunchbase.com/api/v4/searches/organizations";
export const CRUNCHBASE_ORG_BASE = "https://www.crunchbase.com/organization";
export const CRUNCHBASE_HOME = "https://www.crunchbase.com/";

// === Market data ===
export const YAHOO_CHART_API_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
export const YAHOO_QUOTE_API = "https://query1.finance.yahoo.com/v7/finance/quote";
export const FMP_API_BASE = "https://financialmodelingprep.com/api/v3";

// === Macro data ===
export const FRED_OBSERVATIONS_API = "https://api.stlouisfed.org/fred/series/observations";
export const FRED_SERIES_BASE = "https://fred.stlouisfed.org/series";

// === SEC EDGAR ===
export const SEC_SUBMISSIONS_BASE = "https://data.sec.gov/submissions";
export const SEC_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data";

// === AI providers ===
export const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
export const OPENAI_API = "https://api.openai.com/v1/chat/completions";
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";

// === Application ===
export const APP_URL = "https://local.app";
