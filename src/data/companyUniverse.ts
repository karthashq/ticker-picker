import { CompanyProfile } from "../types";

// This curated universe is the first stock-selection boundary. The discovery
// agent only recommends companies listed here, which makes the system easier to
// audit before adding broader screeners or broker/watchlist integrations.
export const defaultCompanyUniverse: CompanyProfile[] = [
  {
    ticker: "NVDA",
    name: "NVIDIA",
    sector: "Technology",
    industry: "AI semiconductors",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "mega",
    keywords: ["ai", "gpu", "accelerators", "data center", "semiconductor"]
  },
  {
    ticker: "AMD",
    name: "Advanced Micro Devices",
    sector: "Technology",
    industry: "AI semiconductors",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "large",
    keywords: ["ai", "gpu", "cpu", "accelerators", "semiconductor"]
  },
  {
    ticker: "AVGO",
    name: "Broadcom",
    sector: "Technology",
    industry: "AI networking and chips",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "mega",
    keywords: ["ai", "networking", "custom silicon", "semiconductor", "data center"]
  },
  {
    ticker: "TSM",
    name: "Taiwan Semiconductor Manufacturing",
    sector: "Technology",
    industry: "Semiconductor foundry",
    country: "Taiwan",
    exchange: "NYSE",
    marketCapCategory: "mega",
    keywords: ["ai", "foundry", "semiconductor", "advanced nodes", "chips"]
  },
  {
    ticker: "ASML",
    name: "ASML Holding",
    sector: "Technology",
    industry: "Semiconductor equipment",
    country: "Netherlands",
    exchange: "NASDAQ",
    marketCapCategory: "large",
    keywords: ["semiconductor", "euv", "lithography", "advanced nodes", "chips"]
  },
  {
    ticker: "MSFT",
    name: "Microsoft",
    sector: "Technology",
    industry: "Cloud and AI platforms",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "mega",
    keywords: ["ai", "cloud", "software", "enterprise", "data center"]
  },
  {
    ticker: "GOOGL",
    name: "Alphabet",
    sector: "Communication Services",
    industry: "AI platforms and digital advertising",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "mega",
    keywords: ["ai", "cloud", "search", "advertising", "models"]
  },
  {
    ticker: "AMZN",
    name: "Amazon",
    sector: "Consumer Discretionary",
    industry: "Cloud, commerce, and AI infrastructure",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "mega",
    keywords: ["cloud", "ai", "commerce", "logistics", "data center"]
  },
  {
    ticker: "VRT",
    name: "Vertiv",
    sector: "Industrials",
    industry: "Data-center power and cooling",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "large",
    keywords: ["data center", "cooling", "power", "ai infrastructure", "electrical"]
  },
  {
    ticker: "ETN",
    name: "Eaton",
    sector: "Industrials",
    industry: "Electrical equipment",
    country: "Ireland",
    exchange: "NYSE",
    marketCapCategory: "large",
    keywords: ["electrification", "power", "grid", "data center", "electrical"]
  },
  {
    ticker: "CEG",
    name: "Constellation Energy",
    sector: "Utilities",
    industry: "Clean power generation",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "large",
    keywords: ["nuclear", "clean energy", "power", "data center", "electricity"]
  },
  {
    ticker: "NEE",
    name: "NextEra Energy",
    sector: "Utilities",
    industry: "Renewable energy and utilities",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "large",
    keywords: ["renewables", "grid", "clean energy", "electricity", "power"]
  },
  {
    ticker: "CRWD",
    name: "CrowdStrike",
    sector: "Technology",
    industry: "Cybersecurity",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "large",
    keywords: ["cybersecurity", "endpoint", "cloud security", "identity", "threat"]
  },
  {
    ticker: "PANW",
    name: "Palo Alto Networks",
    sector: "Technology",
    industry: "Cybersecurity",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "large",
    keywords: ["cybersecurity", "firewall", "cloud security", "soc", "threat"]
  },
  {
    ticker: "ZS",
    name: "Zscaler",
    sector: "Technology",
    industry: "Zero-trust cybersecurity",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "large",
    keywords: ["zero trust", "cybersecurity", "secure access", "cloud security"]
  },
  {
    ticker: "NET",
    name: "Cloudflare",
    sector: "Technology",
    industry: "Edge cloud and security",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "large",
    keywords: ["edge", "cybersecurity", "developer platform", "cloud", "network"]
  },
  {
    ticker: "LLY",
    name: "Eli Lilly",
    sector: "Healthcare",
    industry: "Obesity and diabetes medicines",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "mega",
    keywords: ["glp-1", "obesity", "diabetes", "pharma", "medicine"]
  },
  {
    ticker: "NVO",
    name: "Novo Nordisk",
    sector: "Healthcare",
    industry: "Obesity and diabetes medicines",
    country: "Denmark",
    exchange: "NYSE",
    marketCapCategory: "mega",
    keywords: ["glp-1", "obesity", "diabetes", "pharma", "medicine"]
  },
  {
    ticker: "ISRG",
    name: "Intuitive Surgical",
    sector: "Healthcare",
    industry: "Robotic surgery",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "large",
    keywords: ["robotics", "surgery", "medical devices", "automation", "healthcare"]
  },
  {
    ticker: "TMO",
    name: "Thermo Fisher Scientific",
    sector: "Healthcare",
    industry: "Life-sciences tools",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "large",
    keywords: ["biotech", "life sciences", "diagnostics", "research tools"]
  },
  {
    ticker: "VRTX",
    name: "Vertex Pharmaceuticals",
    sector: "Healthcare",
    industry: "Biotechnology",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "large",
    keywords: ["biotech", "gene editing", "rare disease", "medicine"]
  },
  {
    ticker: "CAT",
    name: "Caterpillar",
    sector: "Industrials",
    industry: "Industrial automation and infrastructure",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "large",
    keywords: ["infrastructure", "automation", "mining", "construction", "energy"]
  },
  {
    ticker: "ROK",
    name: "Rockwell Automation",
    sector: "Industrials",
    industry: "Factory automation",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "large",
    keywords: ["automation", "robotics", "factory", "industrial software"]
  },
  {
    ticker: "TER",
    name: "Teradyne",
    sector: "Technology",
    industry: "Semiconductor testing and robotics",
    country: "US",
    exchange: "NASDAQ",
    marketCapCategory: "mid",
    keywords: ["semiconductor", "testing", "robotics", "automation"]
  },
  {
    ticker: "LMT",
    name: "Lockheed Martin",
    sector: "Industrials",
    industry: "Defense and aerospace",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "large",
    keywords: ["defense", "aerospace", "missiles", "space", "security"]
  },
  {
    ticker: "RTX",
    name: "RTX",
    sector: "Industrials",
    industry: "Defense and aerospace",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "large",
    keywords: ["defense", "aerospace", "engines", "missiles", "security"]
  },
  {
    ticker: "V",
    name: "Visa",
    sector: "Financial Services",
    industry: "Payments networks",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "mega",
    keywords: ["payments", "fintech", "commerce", "digital payments"]
  },
  {
    ticker: "MA",
    name: "Mastercard",
    sector: "Financial Services",
    industry: "Payments networks",
    country: "US",
    exchange: "NYSE",
    marketCapCategory: "mega",
    keywords: ["payments", "fintech", "commerce", "digital payments"]
  },
  {
    ticker: "MELI",
    name: "MercadoLibre",
    sector: "Consumer Discretionary",
    industry: "Latin American commerce and fintech",
    country: "Uruguay",
    exchange: "NASDAQ",
    marketCapCategory: "large",
    keywords: ["ecommerce", "fintech", "payments", "logistics", "latin america"]
  },
  {
    ticker: "SHOP",
    name: "Shopify",
    sector: "Technology",
    industry: "Commerce software",
    country: "Canada",
    exchange: "NASDAQ",
    marketCapCategory: "large",
    keywords: ["commerce", "software", "payments", "ai", "merchant"]
  }
];
