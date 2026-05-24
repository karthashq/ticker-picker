import { CompanyProfile, GrowthTopic, NewsArticle } from "../types";

export interface SourceWarningCollector {
  readonly warnings: string[];
}

export function topicSearchText(topic: GrowthTopic): string {
  return topic.keywords.filter(keyword => keyword.trim().length > 0).join(" OR ");
}

export function articleRelevance(topic: GrowthTopic, textValue: string): number {
  const text = textValue.toLowerCase();
  return topic.keywords.reduce((score, keyword) => {
    const normalized = keyword.toLowerCase();
    if (normalized.length <= 2) {
      return score;
    }

    if (text.includes(normalized)) {
      return score + 3;
    }

    const keywordTokens = normalized.split(/[^a-z0-9]+/).filter(token => token.length > 4);
    const tokenHits = keywordTokens.filter(token =>
      tokenVariants(token).some(variant => text.includes(variant))
    ).length;
    return score + tokenHits;
  }, 0);
}

export function companiesForTopic(
  topic: GrowthTopic,
  companies: CompanyProfile[],
  limit: number
): CompanyProfile[] {
  return companies
    .map(company => ({
      company,
      score: company.keywords.reduce((score, keyword) => {
        const key = keyword.toLowerCase();
        const matched = topic.keywords.some(topicKeyword => {
          const topicKey = topicKeyword.toLowerCase();
          return topicKey.includes(key) || key.includes(topicKey);
        });
        return score + (matched ? 1 : 0);
      }, 0)
    }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(match => match.company);
}

export function dedupeNewsArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const unique: NewsArticle[] = [];

  for (const article of articles) {
    const key = article.url || `${article.source}:${article.title}:${article.publishedAt ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(article);
    }
  }

  return unique;
}

export function envList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

export function parseRssItems(xml: string): Array<{
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
}> {
  const items: Array<{ title: string; link: string; pubDate?: string; description?: string }> = [];
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const item of itemMatches) {
    const title = decodeXml(readTag(item, "title") ?? "Untitled");
    const link = decodeXml(readTag(item, "link") ?? "");
    const pubDate = readTag(item, "pubDate");
    const description = decodeXml(readTag(item, "description") ?? "");
    items.push({ title, link, pubDate, description });
  }

  return items;
}

export function toIsoDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function readTag(xml: string, tagName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = xml.match(pattern);
  return match?.[1]?.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function tokenVariants(token: string): string[] {
  if (token.endsWith("ies") && token.length > 4) {
    return [token, `${token.slice(0, -3)}y`];
  }

  if (token.endsWith("s") && token.length > 4) {
    return [token, token.slice(0, -1)];
  }

  return [token];
}
