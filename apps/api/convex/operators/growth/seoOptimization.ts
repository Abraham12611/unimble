"use node";

/**
 * Growth Operator — SEO/AEO Optimization
 *
 * Handles keyword research, ranking tracking, content optimization,
 * and AI search (AEO) visibility monitoring. Integrates with:
 * - DataForSEO API for SERP data, keyword metrics, and ranking tracking
 * - Perplexity for competitive research
 * - Google Search Console (via Composio) for first-party data
 *
 * Phase 8.3.5 — SEO/AEO Optimization
 */

import type { SEOTarget } from "../growthOperator";

// ---------------------------------------------------------------------------
// SEO types
// ---------------------------------------------------------------------------

/** Keyword research result. */
export interface KeywordResearchResult {
  /** The keyword */
  keyword: string;
  /** Monthly search volume */
  searchVolume: number;
  /** Keyword difficulty (0-100) */
  difficulty: number;
  /** Cost per click (USD) */
  cpc: number;
  /** Competition level (0-1) */
  competition: number;
  /** Search intent */
  intent: "informational" | "navigational" | "transactional" | "commercial";
  /** SERP features present */
  serpFeatures: string[];
  /** Related keywords */
  relatedKeywords?: string[];
  /** Trend direction */
  trend: "rising" | "stable" | "declining";
}

/** Ranking check result for a tracked keyword. */
export interface RankingCheckResult {
  /** The keyword */
  keyword: string;
  /** Current position (null if not ranking) */
  position: number | null;
  /** Previous position */
  previousPosition: number | null;
  /** Position change (positive = improved) */
  change: number;
  /** URL ranking for this keyword */
  rankingUrl?: string;
  /** SERP features the URL appears in */
  serpFeatures: string[];
  /** Estimated monthly traffic from this keyword */
  estimatedTraffic: number;
  /** Checked at timestamp */
  checkedAt: number;
}

/** AEO (AI Engine Optimization) visibility data. */
export interface AEOVisibilityResult {
  /** The keyword/topic */
  keyword: string;
  /** Platform checked */
  platform: "google_ai_overview" | "chatgpt" | "perplexity" | "gemini";
  /** Whether the domain was mentioned */
  isMentioned: boolean;
  /** Position in AI response (if mentioned) */
  mentionPosition?: number;
  /** Context of the mention */
  mentionContext?: string;
  /** Visibility score (0-1) */
  visibilityScore: number;
  /** Competing domains mentioned */
  competitorsMentioned: string[];
  /** Checked at timestamp */
  checkedAt: number;
}

/** Content optimization recommendation. */
export interface ContentOptimization {
  /** Target URL */
  url: string;
  /** Target keyword */
  keyword: string;
  /** Current ranking */
  currentPosition: number | null;
  /** Optimization type */
  type: "on_page" | "content_gap" | "technical" | "link_building" | "aeo";
  /** Priority (1-5, 1 = highest) */
  priority: number;
  /** Specific recommendation */
  recommendation: string;
  /** Expected impact */
  expectedImpact: "low" | "medium" | "high";
  /** Effort required */
  effort: "low" | "medium" | "high";
}

/** SEO performance summary. */
export interface SEOPerformanceSummary {
  /** Period covered */
  period: { start: string; end: string };
  /** Total keywords tracked */
  keywordsTracked: number;
  /** Keywords in top 3 */
  keywordsTop3: number;
  /** Keywords in top 10 */
  keywordsTop10: number;
  /** Keywords in top 30 */
  keywordsTop30: number;
  /** Average position */
  avgPosition: number;
  /** Position change vs previous period */
  avgPositionChange: number;
  /** Estimated organic traffic */
  estimatedTraffic: number;
  /** Traffic change vs previous period */
  trafficChange: number;
  /** Top movers (improved) */
  topMoversUp: RankingCheckResult[];
  /** Top movers (declined) */
  topMoversDown: RankingCheckResult[];
  /** AEO visibility score (average across keywords) */
  avgAeoVisibility: number;
}

// ---------------------------------------------------------------------------
// DataForSEO API request builders
// ---------------------------------------------------------------------------

/**
 * Builds a DataForSEO Keyword Overview request.
 * Uses: POST https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live
 */
export function buildKeywordOverviewRequest(
  keywords: string[],
  locationCode = 2840, // US
  languageCode = "en"
): DataForSEORequest {
  return {
    endpoint: "/v3/dataforseo_labs/google/keyword_overview/live",
    method: "POST",
    body: [
      {
        keywords,
        location_code: locationCode,
        language_code: languageCode,
        include_clickstream_data: true,
      },
    ],
  };
}

/**
 * Builds a DataForSEO Keyword Suggestions request.
 * Uses: POST https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live
 */
export function buildKeywordSuggestionsRequest(
  seedKeyword: string,
  locationCode = 2840,
  languageCode = "en",
  limit = 50
): DataForSEORequest {
  return {
    endpoint: "/v3/dataforseo_labs/google/keyword_suggestions/live",
    method: "POST",
    body: [
      {
        keyword: seedKeyword,
        location_code: locationCode,
        language_code: languageCode,
        limit,
        include_clickstream_data: true,
      },
    ],
  };
}

/**
 * Builds a DataForSEO Ranked Keywords request.
 * Uses: POST https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live
 */
export function buildRankedKeywordsRequest(
  target: string,
  locationCode = 2840,
  languageCode = "en",
  limit = 100
): DataForSEORequest {
  return {
    endpoint: "/v3/dataforseo_labs/google/ranked_keywords/live",
    method: "POST",
    body: [
      {
        target,
        location_code: locationCode,
        language_code: languageCode,
        limit,
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
      },
    ],
  };
}

/**
 * Builds a DataForSEO SERP Competitors request.
 * Uses: POST https://api.dataforseo.com/v3/dataforseo_labs/google/serp_competitors/live
 */
export function buildSerpCompetitorsRequest(
  keywords: string[],
  locationCode = 2840,
  languageCode = "en"
): DataForSEORequest {
  return {
    endpoint: "/v3/dataforseo_labs/google/serp_competitors/live",
    method: "POST",
    body: [
      {
        keywords,
        location_code: locationCode,
        language_code: languageCode,
      },
    ],
  };
}

/**
 * Builds a DataForSEO LLM Mentions request for AEO visibility.
 * Uses: POST https://api.dataforseo.com/v3/ai_optimization/llm_mentions/search/live
 */
export function buildLLMMentionsRequest(
  targets: string[],
  platform: "google" | "chat_gpt" = "google",
  locationCode = 2840,
  languageCode = "en"
): DataForSEORequest {
  return {
    endpoint: "/v3/ai_optimization/llm_mentions/search/live",
    method: "POST",
    body: [
      {
        target: targets,
        platform,
        location_code: locationCode,
        language_code: languageCode,
      },
    ],
  };
}

/**
 * Builds a DataForSEO Search Volume request.
 * Uses: POST https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live
 */
export function buildSearchVolumeRequest(
  keywords: string[],
  locationCode = 2840,
  languageCode = "en"
): DataForSEORequest {
  return {
    endpoint: "/v3/keywords_data/google_ads/search_volume/live",
    method: "POST",
    body: [
      {
        keywords,
        location_code: locationCode,
        language_code: languageCode,
      },
    ],
  };
}

/**
 * Builds a DataForSEO Bulk Traffic Estimation request.
 * Uses: POST https://api.dataforseo.com/v3/dataforseo_labs/google/bulk_traffic_estimation/live
 */
export function buildBulkTrafficRequest(
  targets: string[],
  locationCode = 2840,
  languageCode = "en"
): DataForSEORequest {
  return {
    endpoint: "/v3/dataforseo_labs/google/bulk_traffic_estimation/live",
    method: "POST",
    body: [
      {
        targets,
        location_code: locationCode,
        language_code: languageCode,
      },
    ],
  };
}

/** Generic DataForSEO request shape. */
export interface DataForSEORequest {
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
}

// ---------------------------------------------------------------------------
// Response parsers
// ---------------------------------------------------------------------------

/**
 * Parses DataForSEO keyword overview response into our KeywordResearchResult format.
 */
export function parseKeywordOverviewResponse(response: unknown): KeywordResearchResult[] {
  const results: KeywordResearchResult[] = [];

  // DataForSEO response structure: { tasks: [{ result: [{ items: [...] }] }] }
  const tasks = (response as Record<string, unknown>)?.tasks as unknown[];
  if (!Array.isArray(tasks)) return results;

  for (const task of tasks) {
    const taskResult = (task as Record<string, unknown>)?.result as unknown[];
    if (!Array.isArray(taskResult)) continue;

    for (const result of taskResult) {
      const items = (result as Record<string, unknown>)?.items as unknown[];
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const data = item as Record<string, unknown>;
        const keywordInfo = data.keyword_info as Record<string, unknown> | undefined;
        const searchIntent = data.search_intent_info as Record<string, unknown> | undefined;

        if (!keywordInfo) continue;

        results.push({
          keyword: (data.keyword as string) ?? "",
          searchVolume: (keywordInfo.search_volume as number) ?? 0,
          difficulty: (data.keyword_difficulty as number) ?? 0,
          cpc: (keywordInfo.cpc as number) ?? 0,
          competition: (keywordInfo.competition as number) ?? 0,
          intent: mapSearchIntent(searchIntent?.main_intent as string),
          serpFeatures: extractSerpFeatures(data),
          trend: determineTrend(keywordInfo.monthly_searches as unknown[]),
        });
      }
    }
  }

  return results;
}

/**
 * Parses DataForSEO ranked keywords response into RankingCheckResult format.
 */
export function parseRankedKeywordsResponse(
  response: unknown,
  previousRankings: Map<string, number>
): RankingCheckResult[] {
  const results: RankingCheckResult[] = [];
  const now = Date.now();

  const tasks = (response as Record<string, unknown>)?.tasks as unknown[];
  if (!Array.isArray(tasks)) return results;

  for (const task of tasks) {
    const taskResult = (task as Record<string, unknown>)?.result as unknown[];
    if (!Array.isArray(taskResult)) continue;

    for (const result of taskResult) {
      const items = (result as Record<string, unknown>)?.items as unknown[];
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const data = item as Record<string, unknown>;
        const keywordData = data.keyword_data as Record<string, unknown> | undefined;
        const rankedElement = data.ranked_serp_element as Record<string, unknown> | undefined;

        if (!keywordData) continue;

        const keyword = (keywordData.keyword as string) ?? "";
        const position = (rankedElement?.serp_item as Record<string, unknown>)?.rank_absolute as
          | number
          | undefined;
        const previousPosition = previousRankings.get(keyword) ?? null;

        results.push({
          keyword,
          position: position ?? null,
          previousPosition,
          change:
            previousPosition !== null && position !== undefined ? previousPosition - position : 0,
          rankingUrl: (rankedElement?.serp_item as Record<string, unknown>)?.url as
            | string
            | undefined,
          serpFeatures: [],
          estimatedTraffic: (data.estimated_traffic as number) ?? 0,
          checkedAt: now,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Optimization logic
// ---------------------------------------------------------------------------

/**
 * Generates content optimization recommendations based on ranking data.
 */
export function generateOptimizations(
  targets: SEOTarget[],
  rankings: RankingCheckResult[],
  aeoData?: AEOVisibilityResult[]
): ContentOptimization[] {
  const optimizations: ContentOptimization[] = [];

  for (const target of targets) {
    const ranking = rankings.find((r) => r.keyword === target.keyword);
    const aeo = aeoData?.find((a) => a.keyword === target.keyword);

    // Not ranking at all — content gap
    if (!ranking?.position) {
      optimizations.push({
        url: target.contentUrl ?? "",
        keyword: target.keyword,
        currentPosition: null,
        type: "content_gap",
        priority: target.searchVolume > 1000 ? 1 : 2,
        recommendation: `Create targeted content for "${target.keyword}" (${target.searchVolume} monthly searches, difficulty: ${target.difficulty})`,
        expectedImpact: target.searchVolume > 5000 ? "high" : "medium",
        effort: target.difficulty > 70 ? "high" : "medium",
      });
      continue;
    }

    // Ranking but not in target position — on-page optimization
    if (ranking.position > target.targetPosition) {
      const gap = ranking.position - target.targetPosition;
      optimizations.push({
        url: ranking.rankingUrl ?? target.contentUrl ?? "",
        keyword: target.keyword,
        currentPosition: ranking.position,
        type: "on_page",
        priority: gap > 10 ? 2 : 1,
        recommendation: `Optimize content for "${target.keyword}" — currently #${ranking.position}, target #${target.targetPosition}`,
        expectedImpact: ranking.position <= 20 ? "high" : "medium",
        effort: "medium",
      });
    }

    // Low AEO visibility — AI search optimization
    if (aeo && aeo.visibilityScore < 0.3) {
      optimizations.push({
        url: ranking.rankingUrl ?? target.contentUrl ?? "",
        keyword: target.keyword,
        currentPosition: ranking.position,
        type: "aeo",
        priority: 2,
        recommendation: `Improve AI search visibility for "${target.keyword}" — current score: ${(aeo.visibilityScore * 100).toFixed(0)}%. Add structured data, improve content clarity, and ensure factual accuracy.`,
        expectedImpact: "medium",
        effort: "medium",
      });
    }

    // Position declining — needs attention
    if (ranking.change < -3) {
      optimizations.push({
        url: ranking.rankingUrl ?? target.contentUrl ?? "",
        keyword: target.keyword,
        currentPosition: ranking.position,
        type: "on_page",
        priority: 1,
        recommendation: `Ranking declining for "${target.keyword}" (dropped ${Math.abs(ranking.change)} positions). Update content freshness and check for technical issues.`,
        expectedImpact: "high",
        effort: "low",
      });
    }
  }

  // Sort by priority
  optimizations.sort((a, b) => a.priority - b.priority);

  return optimizations;
}

/**
 * Builds an SEO performance summary from ranking data.
 */
export function buildPerformanceSummary(
  rankings: RankingCheckResult[],
  aeoResults: AEOVisibilityResult[],
  period: { start: string; end: string }
): SEOPerformanceSummary {
  const rankedKeywords = rankings.filter((r) => r.position !== null);
  const positions = rankedKeywords.map((r) => r.position!);

  const avgPosition =
    positions.length > 0 ? positions.reduce((sum, p) => sum + p, 0) / positions.length : 0;

  const avgPositionChange =
    rankedKeywords.length > 0
      ? rankedKeywords.reduce((sum, r) => sum + r.change, 0) / rankedKeywords.length
      : 0;

  const estimatedTraffic = rankings.reduce((sum, r) => sum + r.estimatedTraffic, 0);

  const avgAeoVisibility =
    aeoResults.length > 0
      ? aeoResults.reduce((sum, a) => sum + a.visibilityScore, 0) / aeoResults.length
      : 0;

  // Top movers
  const sorted = [...rankedKeywords].sort((a, b) => b.change - a.change);
  const topMoversUp = sorted.filter((r) => r.change > 0).slice(0, 5);
  const topMoversDown = sorted
    .filter((r) => r.change < 0)
    .slice(-5)
    .reverse();

  return {
    period,
    keywordsTracked: rankings.length,
    keywordsTop3: positions.filter((p) => p <= 3).length,
    keywordsTop10: positions.filter((p) => p <= 10).length,
    keywordsTop30: positions.filter((p) => p <= 30).length,
    avgPosition,
    avgPositionChange,
    estimatedTraffic,
    trafficChange: 0, // Would need historical data
    topMoversUp,
    topMoversDown,
    avgAeoVisibility,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapSearchIntent(
  intent: string | undefined
): "informational" | "navigational" | "transactional" | "commercial" {
  switch (intent?.toLowerCase()) {
    case "navigational":
      return "navigational";
    case "transactional":
      return "transactional";
    case "commercial":
      return "commercial";
    default:
      return "informational";
  }
}

function extractSerpFeatures(data: Record<string, unknown>): string[] {
  const features: string[] = [];
  const serpInfo = data.serp_info as Record<string, unknown> | undefined;
  if (!serpInfo) return features;

  const featureMap: Record<string, string> = {
    featured_snippet: "Featured Snippet",
    knowledge_panel: "Knowledge Panel",
    local_pack: "Local Pack",
    people_also_ask: "People Also Ask",
    top_stories: "Top Stories",
    video: "Video",
    images: "Images",
    ai_overview: "AI Overview",
  };

  for (const [key, label] of Object.entries(featureMap)) {
    if (serpInfo[key]) {
      features.push(label);
    }
  }

  return features;
}

function determineTrend(monthlySearches: unknown[] | undefined): "rising" | "stable" | "declining" {
  if (!Array.isArray(monthlySearches) || monthlySearches.length < 3) {
    return "stable";
  }

  // Compare last 3 months average to previous 3 months
  const recent = monthlySearches.slice(-3);
  const previous = monthlySearches.slice(-6, -3);

  const recentAvg =
    recent.reduce((sum: number, m: unknown) => {
      const val = (m as Record<string, unknown>)?.search_volume as number;
      return sum + (val ?? 0);
    }, 0) / recent.length;

  const previousAvg =
    previous.reduce((sum: number, m: unknown) => {
      const val = (m as Record<string, unknown>)?.search_volume as number;
      return sum + (val ?? 0);
    }, 0) / Math.max(previous.length, 1);

  if (previousAvg === 0) return "stable";

  const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;

  if (changePercent > 15) return "rising";
  if (changePercent < -15) return "declining";
  return "stable";
}
