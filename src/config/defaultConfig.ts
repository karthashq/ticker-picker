import { AppConfig, GrowthTopic } from "../types";
import { defaultCompanyUniverse } from "../data/companyUniverse";

// These topics define what "latest happenings" means for the first version of
// the app. Each topic has search keywords plus an industry description for the
// report and company-matching logic.
export const defaultGrowthTopics: GrowthTopic[] = [
  {
    id: "ai-infrastructure",
    name: "AI infrastructure buildout",
    industry: "Technology infrastructure",
    description:
      "Compute, networking, cloud platforms, and physical infrastructure needed for AI workloads.",
    keywords: ["ai", "artificial intelligence", "gpu", "data center", "cloud", "semiconductor"]
  },
  {
    id: "power-grid",
    name: "Power grid and electrification",
    industry: "Energy and industrials",
    description:
      "Electricity demand, grid modernization, nuclear, renewables, and data-center power needs.",
    keywords: ["power grid", "electricity demand", "nuclear", "renewables", "electrification"]
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity escalation",
    industry: "Cybersecurity",
    description:
      "Rising breach activity, AI-enabled attacks, zero-trust adoption, and cloud-security spending.",
    keywords: ["cybersecurity", "ransomware", "zero trust", "cloud security", "data breach"]
  },
  {
    id: "obesity-metabolic-health",
    name: "Obesity and metabolic health",
    industry: "Healthcare",
    description:
      "GLP-1 medicines, obesity treatment, diabetes care, and related healthcare demand shifts.",
    keywords: ["glp-1", "obesity", "diabetes", "weight loss drug", "metabolic health"]
  },
  {
    id: "automation-robotics",
    name: "Automation and robotics",
    industry: "Industrials and healthcare",
    description:
      "Factory automation, robotics, robotic surgery, and productivity-enhancing hardware/software.",
    keywords: ["automation", "robotics", "factory", "robotic surgery", "industrial software"]
  },
  {
    id: "defense-security",
    name: "Defense and geopolitical security",
    industry: "Aerospace and defense",
    description:
      "Defense spending, geopolitical tensions, space systems, missiles, and aerospace demand.",
    keywords: ["defense spending", "geopolitical", "aerospace", "missiles", "space systems"]
  },
  {
    id: "digital-commerce-payments",
    name: "Digital commerce and payments",
    industry: "Financial technology and commerce",
    description:
      "Digital payments, merchant software, cross-border commerce, and emerging-market ecommerce.",
    keywords: ["digital payments", "fintech", "ecommerce", "merchant software", "cross-border"]
  },
  {
    id: "biotech-platforms",
    name: "Biotech platforms and life-sciences tooling",
    industry: "Healthcare",
    description:
      "Biotech innovation, diagnostics, research tooling, gene editing, and drug-discovery platforms.",
    keywords: ["biotech", "gene editing", "diagnostics", "life sciences", "drug discovery"]
  }
];

// Default runtime settings. Environment variables let you widen/narrow a run
// without changing source code, which is useful for scheduled jobs.
export const defaultConfig: AppConfig = {
  reportDir: process.env.REPORT_DIR ?? "reports",
  run: {
    maxArticlesPerTopic: parseIntegerEnv("MAX_ARTICLES_PER_TOPIC", 15),
    maxGrowthAreas: parseIntegerEnv("MAX_GROWTH_AREAS", 6),
    maxCompaniesPerArea: parseIntegerEnv("MAX_COMPANIES_PER_AREA", 4),
    minNewsScore: parseIntegerEnv("MIN_NEWS_SCORE", 15),
    priceHistoryRange: process.env.PRICE_HISTORY_RANGE ?? "5y",
    schedulerIntervalHours: parseIntegerEnv("RUN_INTERVAL_HOURS", 24)
  },
  topics: defaultGrowthTopics,
  companyUniverse: defaultCompanyUniverse
};

// Env parsing is deliberately conservative: invalid or non-positive values fall
// back to known-good defaults instead of changing run behavior unexpectedly.
function parseIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
