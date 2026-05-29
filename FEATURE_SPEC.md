# Ticker Picker — Feature Specification

**Version:** 1.0  
**Date:** 2026-05-26  
**Status:** Agreed — ready for implementation  

---

## Context

Ticker Picker is a personal investment research tool that aggregates news, scores growth themes, and produces stock recommendations. The current pipeline ingests news from headline-level sources (GDELT, SEC, TechCrunch, RSS) and uses keyword matching to surface company candidates.

This document specifies the next two features, agreed through a design session on 2026-05-26.

---

## Feature 1 — Newsletter Intelligence Pipeline (Phase 1)

### Problem Statement

The current news pipeline ingests article headlines and descriptions but cannot extract deep analytical insights from long-form content. Sources like SemiAnalysis publish 10,000-word pieces that contain high-value investment signals, but these signals are only accessible by reading the full article. The tool currently misses the majority of signal from the best sources because it only processes titles and summaries.

Additionally, all source types are treated equally. A SemiAnalysis deep-dive and a TechCrunch press release carry the same weight in the current model, which dilutes the quality of thesis generation.

### Goals

1. The tool reads and understands full newsletter articles, not just headlines.
2. The tool surfaces implied stock beneficiaries — companies that benefit from a thesis even when not explicitly named in the article.
3. Every recommendation includes a thesis that a layman can understand in 30 seconds and explain to a friend at dinner.
4. Every INVEST signal carries a mandatory bearish counter-argument so the user is always aware of what they are betting against.
5. Sources are tiered by analytical depth; deeper sources carry more weight in thesis generation.

### Non-Goals

- **VC deal flow ingestion (Phase 2).** StrictlyVC, Crunchbase, and other VC-focused sources are explicitly out of scope for Phase 1. Deal flow requires an additional private-to-public company mapping layer. Revisit after newsletter pipeline is stable.
- **Thought leader social media (Phase 2).** Parsing Gavin Baker's Twitter threads or Paul Tudor Jones interview transcripts is out of scope. These sources are irregular, unstructured, and harder to validate. Revisit after Phase 1.
- **Real-time alerts.** The pipeline runs on a weekly cadence (Sunday digest), not real-time. Investment decisions do not require sub-hour latency and weekly batching enables better convergence detection across sources.
- **User-facing web interface.** The output remains a markdown report. UI is a separate initiative.
- **Automated trade execution.** The tool produces recommendations only. All investment decisions are made by the user after their own validation.

---

### Source Architecture

Sources are divided into four tiers with distinct roles in the pipeline.

#### Tier 1 — Thesis generators
These are the primary inputs for new investment idea generation. Long-form, analytical, weekly cadence. The LLM inference layer runs on these.

| Source | Access | Focus |
|---|---|---|
| SemiAnalysis | RSS (paid email forward for paywalled pieces) | Semiconductors, AI hardware |
| Stratechery | RSS (paid email forward for paywalled pieces) | Tech business strategy, platforms |
| Fabricated Knowledge | RSS (free) | Semiconductor supply chain |
| Lyn Alden | RSS (free) | Macro, value investing |
| Howard Marks Memos (Oaktree) | RSS (free) | Risk calibration, market cycles |
| Not Boring | RSS (free) | Growth tech, emerging sectors |

#### Tier 2 — Bear / counter-sources
Used exclusively to fulfil the mandatory bearish counter-argument on every INVEST signal. The tool must consult at least one of these for every recommendation above WATCH.

| Source | Access | Focus |
|---|---|---|
| Hindenburg Research | RSS / web scrape (free) | Short seller reports, fraud |
| GMO / Grantham | RSS (free) | Macro bear thesis, valuation bubbles |
| Citron Research | Web (free) | Short theses, overvaluation |

#### Tier 3 — Event triggers
These already exist in the pipeline. They fire thesis re-evaluation signals, not new thesis generation. A TechCrunch article announcing a product launch should prompt "check your thesis on X", not generate a new INVEST signal.

| Source | Role |
|---|---|
| TechCrunch | Product launches, funding events |
| Yahoo Finance | Earnings surprises, executive changes |
| SEC EDGAR | Filings, insider activity |

#### Tier 4 — Phase 2 sources (not in scope now)
| Source | Phase |
|---|---|
| StrictlyVC | Phase 2 — VC deal flow |
| Crunchbase | Phase 2 — VC deal flow |
| Gavin Baker (Twitter/X) | Phase 2 — thought leaders |
| Paul Tudor Jones (interviews/transcripts) | Phase 2 — thought leaders |

---

### Thesis Card Format

Every recommendation the tool produces must follow this exact format. No field may be omitted. All language must be plain English — no jargon, no acronyms without explanation.

```
TICKER:         [e.g. AMAT]
SIGNAL:         [INVEST / WATCH / HOLD / REDUCE / EXIT]

THE BET:        One sentence. The core reason to be in this stock.
                "Advanced packaging demand is growing 3x and AMAT is 
                 the only company that makes the critical deposition 
                 tools required."

WHY NOW:        One sentence. The specific catalyst or convergence that 
                makes this timely.
                "Three independent sources this week all pointed at 
                 CoWoS capacity as the binding constraint for AI chip 
                 production."

WHAT BREAKS IT: One sentence. The specific condition that would 
                invalidate the thesis.
                "TSMC deprioritises advanced packaging capacity in favour 
                 of leading-edge node expansion, reducing AMAT's order 
                 visibility."

BEAR CASE:      One sentence. The strongest argument against this position.
                "AMAT trades at 28x forward earnings — any slowdown in 
                 hyperscaler capex would compress multiples sharply."

SOURCES:        [List of source names and dates that contributed to this card]
```

**Design rule:** if the thesis cannot be expressed in this format, the signal is not ready to surface. Complexity in the thesis is a sign of insufficient conviction, not sophistication.

---

### Recommendation Labels

The current labels (High-priority research candidate / Consider with position-sizing discipline / Watchlist) are replaced with the following six-state system. Every label must be accompanied by the one-sentence justification field from the thesis card.

| Label | Meaning |
|---|---|
| **WATCH** | Signal emerging, insufficient cross-source convergence yet |
| **INVEST** | Strong convergence across ≥2 independent sources, thesis clear, bear case understood |
| **ADD** | Already in portfolio — new signals strengthen the existing thesis |
| **HOLD** | No material change to thesis since last evaluation |
| **REDUCE** | Thesis weakening but not broken — one or more assumptions under pressure |
| **EXIT** | Thesis broken — specific falsification condition has been met |

---

### Mandatory Bear Counter-Source Rule

Every recommendation carrying an **INVEST**, **ADD**, or **REDUCE** label must include a populated `BEAR CASE` field in the thesis card. This field must be sourced from a Tier 2 source (Hindenburg, GMO, Citron) or, if no specific short report exists, from the strongest publicly available counter-argument.

The purpose of this rule is not to prevent investment — it is to ensure the user consciously engages with what they are betting against before acting. A thesis that cannot survive contact with the bear case is not a thesis; it is a hope.

This rule is enforced at report generation time in `ReportAgent`. Any assessment with an INVEST/ADD/REDUCE signal that has no bear case populated must be downgraded to WATCH until a counter-source is found.

---

### User Stories

**As the sole user of this tool**, I want the newsletter pipeline to run automatically each week so that I receive a Sunday digest without having to manually check each source.

**As the sole user**, I want the tool to surface stock ideas implied by newsletter content — even when the stock is not explicitly named — so that I can find opportunities that other readers miss.

**As the sole user**, I want every recommendation to include a one-sentence plain-English thesis I can explain to a friend so that I understand the idea well enough to do my own validation before investing.

**As the sole user**, I want every INVEST signal to show me the strongest bear case against it so that I am never surprised by a risk I had not considered.

**As the sole user**, I want source weighting to favour deep analytical content over press release journalism so that the recommendations are driven by insight, not noise volume.

---

### Requirements

#### P0 — Must ship

| # | Requirement | Acceptance Criteria |
|---|---|---|
| P0-1 | Full article body fetch | The tool fetches the complete text of newsletter articles, not just the RSS title and description |
| P0-2 | LLM-based implied ticker extraction | Given a full article, the LLM identifies publicly traded companies likely affected by the article's thesis, including companies not explicitly named |
| P0-3 | `impliedTickers` field on `NewsArticle` | `NewsArticle` type has an optional `impliedTickers: string[]` field populated by the newsletter provider |
| P0-4 | `thesisClaim` field on `NewsArticle` | `NewsArticle` type has an optional `thesisClaim: string` field — one sentence extracted by the LLM |
| P0-5 | `CompanyDiscoveryAgent` respects implied tickers | If an article has `impliedTickers`, those companies are scored as candidates regardless of keyword match |
| P0-6 | Thesis card format in report | Every company assessment in the report renders in the 6-field thesis card format (TICKER, SIGNAL, THE BET, WHY NOW, WHAT BREAKS IT, BEAR CASE, SOURCES) |
| P0-7 | Six-state recommendation labels | Report uses WATCH / INVEST / ADD / HOLD / REDUCE / EXIT instead of current labels |
| P0-8 | Bear counter-source enforcement | Any INVEST/ADD/REDUCE signal with no bear case is automatically downgraded to WATCH |
| P0-9 | Tier 1 sources configurable via env vars | Each newsletter source is added via an environment variable (e.g. `SEMIANALYSIS_RSS_URL`) without code changes |

#### P1 — Nice to have for v1

| # | Requirement |
|---|---|
| P1-1 | Source tier label shown in report (e.g. "Tier 1 — Thesis generator") |
| P1-2 | Convergence indicator: flag when ≥2 independent Tier 1 sources point at the same ticker in the same week |
| P1-3 | Paywalled newsletter support via email forwarding (dedicated inbox → tool parses raw email body) |
| P1-4 | Per-source weight multiplier in the news scoring formula (Tier 1 articles count more than Tier 3) |

#### P2 — Phase 2 (explicitly out of scope now, design should not preclude)

| # | Requirement |
|---|---|
| P2-1 | VC deal flow ingestion (StrictlyVC, Crunchbase) with private-to-public comp mapping |
| P2-2 | Thought leader social media ingestion (Twitter/X threads, interview transcripts) |
| P2-3 | Thesis monitoring for existing positions (see Feature 2 below) |
| P2-4 | Sector-level convergence scoring across a rolling 4-week window |

---

### Technical Approach

The following describes the intended implementation approach, agreed before coding begins.

**New file: `src/providers/newsletterNews.ts`**  
A `NewsletterProvider` class that:
1. Reads newsletter RSS feed URLs from env vars
2. Fetches full article body content (not just title/description from the feed)
3. Runs a single LLM call per article to extract: up to 10 candidate implied tickers (ranked by relevance), `thesisClaim`
4. Keeps only the top 5 ranked implied tickers — remainder are discarded
5. If the LLM returns 0 implied tickers, the article is still used for theme scoring via normal keyword matching — zero implied tickers is a valid outcome, not an error
6. Returns enriched `NewsArticle` objects with the new fields populated

**Modified file: `src/types.ts`**  
Add two optional fields to `NewsArticle`:
```typescript
impliedTickers?: string[]   // LLM-inferred beneficiary tickers
thesisClaim?: string        // one-sentence thesis extracted from article
```

**Modified file: `src/agents/CompanyDiscoveryAgent.ts`**  
Add a secondary scoring path: if any article for a growth area has `impliedTickers` that includes a company in the universe, score that company directly without requiring keyword overlap.

**Modified file: `src/agents/ReportAgent.ts`**  
Update report template to render thesis cards in the new 6-field format and apply the bear counter-source enforcement rule before finalising labels.

**No changes required:** `GrowthAreaAgent`, `MarketPerformanceAgent`, `FundamentalsAgent`, `RiskRewardAgent`, `orchestrator.ts`. The newsletter signals flow through the existing pipeline as enriched `NewsArticle` objects.

**Estimated scope:** ~150 lines of new code in `newsletterNews.ts`, ~30 lines of changes across the other three files.

---

## Feature 2 — Thesis Monitoring (Phase 2)

> **Status: Documented for awareness only. Not in scope for current build.**

### Problem Statement

Most investment losses happen not because a stock was a bad pick initially, but because the investor held too long after the thesis changed. There is currently no mechanism in Ticker Picker to monitor whether the conditions that justified a position still hold.

### Concept

Each stock the user invests in would have a defined thesis (generated by the thesis card). The tool monitors incoming news weekly for events that contradict the thesis's "WHAT BREAKS IT" condition. When such an event is detected, the recommendation automatically moves from HOLD to REDUCE or EXIT.

### Why Phase 2

This feature requires persistent storage of user positions and their associated thesis cards — architecture that does not exist today. It is better to ship Phase 1 cleanly and add position tracking as a deliberate second step.

### High-level design (for awareness)

- User marks a ticker as "in portfolio" after reading the recommendation
- The thesis card (including WHAT BREAKS IT) is stored alongside the position
- Weekly pipeline checks incoming news against each stored falsification condition
- If the LLM determines the condition has been met, label changes to REDUCE or EXIT with a specific reason

---

## Open Questions

| # | Question | Owner | Status | Decision |
|---|---|---|---|---|
| OQ-1 | Which newsletters are behind paywalls vs. freely accessible via RSS? Determines whether email forwarding (P1-3) is needed for Phase 1. | Karthik | Open | Start with free RSS sources, add email forwarding in a follow-up |
| OQ-2 | Should the Tier 2 bear sources be fetched for every report run, or only when an INVEST signal exists? | Engineering | Open | Fetch on demand to reduce API cost |
| OQ-3 | Should `impliedTickers` be capped to prevent the LLM from hallucinating a large list? | Karthik | ✅ Resolved | LLM generates up to 10 candidates, ranked by relevance. Top 5 are kept. |
| OQ-4 | How should the tool handle a newsletter article that generates 0 implied tickers? | Karthik | ✅ Resolved | Zero implied tickers is a valid and expected outcome — do not force it. The article still contributes to theme scoring via normal keyword matching. AI inference is the mechanism; if it finds nothing, nothing is added. |

---

## Success Criteria

The feature is considered successfully shipped when:

1. At least 3 Tier 1 newsletter sources are ingested and producing `thesisClaim` + `impliedTickers` output on each weekly run.
2. At least one recommendation per weekly run is surfaced via implied inference (ticker not explicitly named in source article).
3. Every report contains zero INVEST/ADD/REDUCE signals without a populated BEAR CASE field.
4. All thesis cards are readable and understandable without financial background (validated by Karthik reading them cold).
5. The six-state label system replaces the current label system with no regression in report quality.

---

*This document represents the agreed scope for the newsletter intelligence pipeline. Any changes to P0 requirements require explicit agreement before implementation begins.*
