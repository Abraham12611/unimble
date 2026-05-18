"use node";

/**
 * Content Operator — Content Analytics
 *
 * Implements content performance tracking and learning:
 * - Performance metrics collection
 * - Engagement analysis
 * - Learning extraction (what works, what doesn't)
 * - Reporting and insights
 *
 * Phase 8.2.6 — Content Analytics
 */

import type { ContentAnalytics, ContentTopic, ContentDraft } from "../contentOperator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Time period for analytics queries. */
export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

/** A content performance record. */
export interface ContentPerformanceRecord {
  /** Content ID */
  contentId: string;
  /** Title */
  title: string;
  /** Content type */
  contentType: string;
  /** Published date */
  publishedAt: string;
  /** Analytics data */
  analytics: ContentAnalytics;
  /** Topic keywords */
  keywords: string[];
  /** Word count */
  wordCount: number;
}

/** Aggregated performance metrics. */
export interface AggregatedMetrics {
  /** Total content pieces published */
  totalPublished: number;
  /** Total views across all content */
  totalViews: number;
  /** Average views per piece */
  avgViews: number;
  /** Average engagement rate */
  avgEngagementRate: number;
  /** Average time on page (seconds) */
  avgTimeOnPage: number;
  /** Total social shares */
  totalShares: number;
  /** Best performing content */
  topPerformers: ContentPerformanceRecord[];
  /** Worst performing content */
  underperformers: ContentPerformanceRecord[];
  /** Trend direction */
  trend: "improving" | "stable" | "declining";
}

/** A learning extracted from analytics data. */
export interface ContentLearning {
  /** Learning category */
  category: "topic" | "format" | "timing" | "length" | "style" | "keyword";
  /** The insight */
  insight: string;
  /** Confidence level (0-1) */
  confidence: number;
  /** Supporting evidence */
  evidence: string;
  /** Actionable recommendation */
  recommendation: string;
  /** When this learning was extracted */
  extractedAt: string;
}

/** Content performance report. */
export interface ContentReport {
  /** Report period */
  period: AnalyticsPeriod;
  /** Generated at */
  generatedAt: string;
  /** Aggregated metrics */
  metrics: AggregatedMetrics;
  /** Learnings extracted */
  learnings: ContentLearning[];
  /** Recommendations for next period */
  recommendations: string[];
  /** Comparison to previous period */
  comparison?: {
    viewsChange: number;
    engagementChange: number;
    publishedChange: number;
  };
}

// ---------------------------------------------------------------------------
// Analytics Functions
// ---------------------------------------------------------------------------

/**
 * Aggregates performance metrics across all content for a period.
 */
export function aggregateMetrics(
  records: ContentPerformanceRecord[],
  period: AnalyticsPeriod
): AggregatedMetrics {
  const filtered = filterByPeriod(records, period);

  if (filtered.length === 0) {
    return {
      totalPublished: 0,
      totalViews: 0,
      avgViews: 0,
      avgEngagementRate: 0,
      avgTimeOnPage: 0,
      totalShares: 0,
      topPerformers: [],
      underperformers: [],
      trend: "stable",
    };
  }

  const totalViews = filtered.reduce((sum, r) => sum + r.analytics.views, 0);
  const totalShares = filtered.reduce((sum, r) => sum + r.analytics.socialShares, 0);
  const avgTimeOnPage =
    filtered.reduce((sum, r) => sum + r.analytics.avgTimeOnPage, 0) / filtered.length;

  // Calculate engagement rate: (shares + comments) / views
  const totalEngagements = filtered.reduce(
    (sum, r) => sum + r.analytics.socialShares + r.analytics.comments,
    0
  );
  const avgEngagementRate = totalViews > 0 ? totalEngagements / totalViews : 0;

  // Sort by views for top/bottom performers
  const sorted = [...filtered].sort((a, b) => b.analytics.views - a.analytics.views);
  const topPerformers = sorted.slice(0, 5);
  const underperformers = sorted.slice(-3).reverse();

  // Determine trend (compare first half to second half)
  const midpoint = Math.floor(filtered.length / 2);
  const firstHalf = filtered.slice(0, midpoint);
  const secondHalf = filtered.slice(midpoint);
  const trend = determineTrend(firstHalf, secondHalf);

  return {
    totalPublished: filtered.length,
    totalViews,
    avgViews: Math.round(totalViews / filtered.length),
    avgEngagementRate: Math.round(avgEngagementRate * 10000) / 100, // As percentage
    avgTimeOnPage: Math.round(avgTimeOnPage),
    totalShares,
    topPerformers,
    underperformers,
    trend,
  };
}

/**
 * Extracts learnings from content performance data.
 *
 * Analyzes patterns in what works and what doesn't to
 * inform future content decisions.
 */
export function extractLearnings(
  records: ContentPerformanceRecord[]
): ContentLearning[] {
  const learnings: ContentLearning[] = [];

  if (records.length < 3) {
    return learnings; // Need minimum data for meaningful patterns
  }

  // Sort by engagement for analysis
  const byEngagement = [...records].sort(
    (a, b) =>
      (b.analytics.socialShares + b.analytics.comments) / Math.max(1, b.analytics.views) -
      (a.analytics.socialShares + a.analytics.comments) / Math.max(1, a.analytics.views)
  );

  // Learning: Content type performance
  const typePerformance = analyzeByContentType(records);
  if (typePerformance) learnings.push(typePerformance);

  // Learning: Optimal word count
  const wordCountLearning = analyzeWordCount(records);
  if (wordCountLearning) learnings.push(wordCountLearning);

  // Learning: Best performing keywords
  const keywordLearning = analyzeKeywords(records);
  if (keywordLearning) learnings.push(keywordLearning);

  // Learning: Publishing timing
  const timingLearning = analyzePublishTiming(records);
  if (timingLearning) learnings.push(timingLearning);

  // Learning: Top performer patterns
  const topPatterns = analyzeTopPerformers(byEngagement.slice(0, 3));
  if (topPatterns) learnings.push(topPatterns);

  return learnings;
}

/**
 * Generates a content performance report.
 */
export function generateReport(
  records: ContentPerformanceRecord[],
  period: AnalyticsPeriod,
  previousPeriodRecords?: ContentPerformanceRecord[]
): ContentReport {
  const metrics = aggregateMetrics(records, period);
  const learnings = extractLearnings(records);

  // Generate recommendations based on learnings
  const recommendations = generateRecommendations(metrics, learnings);

  // Calculate comparison if previous period data available
  let comparison: ContentReport["comparison"];
  if (previousPeriodRecords && previousPeriodRecords.length > 0) {
    const prevMetrics = aggregateMetrics(previousPeriodRecords, period);
    comparison = {
      viewsChange: prevMetrics.totalViews > 0
        ? ((metrics.totalViews - prevMetrics.totalViews) / prevMetrics.totalViews) * 100
        : 0,
      engagementChange: prevMetrics.avgEngagementRate > 0
        ? ((metrics.avgEngagementRate - prevMetrics.avgEngagementRate) / prevMetrics.avgEngagementRate) * 100
        : 0,
      publishedChange: prevMetrics.totalPublished > 0
        ? ((metrics.totalPublished - prevMetrics.totalPublished) / prevMetrics.totalPublished) * 100
        : 0,
    };
  }

  return {
    period,
    generatedAt: new Date().toISOString(),
    metrics,
    learnings,
    recommendations,
    comparison,
  };
}

// ---------------------------------------------------------------------------
// Analysis Functions
// ---------------------------------------------------------------------------

/**
 * Analyzes performance by content type.
 */
function analyzeByContentType(records: ContentPerformanceRecord[]): ContentLearning | null {
  const typeMap = new Map<string, { views: number; count: number }>();

  for (const record of records) {
    const existing = typeMap.get(record.contentType) ?? { views: 0, count: 0 };
    existing.views += record.analytics.views;
    existing.count += 1;
    typeMap.set(record.contentType, existing);
  }

  if (typeMap.size < 2) return null;

  // Find best performing type
  let bestType = "";
  let bestAvg = 0;
  for (const [type, data] of typeMap) {
    const avg = data.views / data.count;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestType = type;
    }
  }

  return {
    category: "format",
    insight: `"${bestType}" content performs best with ${Math.round(bestAvg)} avg views`,
    confidence: Math.min(0.9, 0.5 + (typeMap.get(bestType)?.count ?? 0) * 0.1),
    evidence: `Based on ${typeMap.get(bestType)?.count} published pieces of type "${bestType}"`,
    recommendation: `Prioritize ${bestType} content in the next content cycle`,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Analyzes optimal word count range.
 */
function analyzeWordCount(records: ContentPerformanceRecord[]): ContentLearning | null {
  if (records.length < 5) return null;

  // Group by word count ranges
  const ranges = [
    { label: "short (< 1000)", min: 0, max: 1000, views: 0, count: 0 },
    { label: "medium (1000-2000)", min: 1000, max: 2000, views: 0, count: 0 },
    { label: "long (2000-3000)", min: 2000, max: 3000, views: 0, count: 0 },
    { label: "very long (3000+)", min: 3000, max: Infinity, views: 0, count: 0 },
  ];

  for (const record of records) {
    const range = ranges.find((r) => record.wordCount >= r.min && record.wordCount < r.max);
    if (range) {
      range.views += record.analytics.views;
      range.count += 1;
    }
  }

  const validRanges = ranges.filter((r) => r.count >= 2);
  if (validRanges.length < 2) return null;

  const best = validRanges.reduce((a, b) =>
    a.views / a.count > b.views / b.count ? a : b
  );

  return {
    category: "length",
    insight: `${best.label} content gets ${Math.round(best.views / best.count)} avg views`,
    confidence: Math.min(0.8, 0.4 + best.count * 0.1),
    evidence: `Based on ${best.count} pieces in the ${best.label} range`,
    recommendation: `Target ${best.min}-${best.max === Infinity ? "3000+" : best.max} words for optimal engagement`,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Analyzes which keywords correlate with high performance.
 */
function analyzeKeywords(records: ContentPerformanceRecord[]): ContentLearning | null {
  const keywordPerformance = new Map<string, { totalViews: number; count: number }>();

  for (const record of records) {
    for (const keyword of record.keywords) {
      const existing = keywordPerformance.get(keyword) ?? { totalViews: 0, count: 0 };
      existing.totalViews += record.analytics.views;
      existing.count += 1;
      keywordPerformance.set(keyword, existing);
    }
  }

  // Find keywords that appear in multiple pieces and have high avg views
  const significantKeywords = [...keywordPerformance.entries()]
    .filter(([, data]) => data.count >= 2)
    .map(([keyword, data]) => ({ keyword, avgViews: data.totalViews / data.count, count: data.count }))
    .sort((a, b) => b.avgViews - a.avgViews);

  if (significantKeywords.length === 0) return null;

  const topKeywords = significantKeywords.slice(0, 3);

  return {
    category: "keyword",
    insight: `Top performing keywords: ${topKeywords.map((k) => `"${k.keyword}" (${Math.round(k.avgViews)} avg views)`).join(", ")}`,
    confidence: 0.7,
    evidence: `Based on keyword analysis across ${records.length} content pieces`,
    recommendation: `Focus on topics involving: ${topKeywords.map((k) => k.keyword).join(", ")}`,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Analyzes publish timing patterns.
 */
function analyzePublishTiming(records: ContentPerformanceRecord[]): ContentLearning | null {
  if (records.length < 5) return null;

  const dayPerformance = new Map<string, { views: number; count: number }>();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  for (const record of records) {
    const date = new Date(record.publishedAt);
    const day = days[date.getDay()];
    const existing = dayPerformance.get(day) ?? { views: 0, count: 0 };
    existing.views += record.analytics.views;
    existing.count += 1;
    dayPerformance.set(day, existing);
  }

  const validDays = [...dayPerformance.entries()].filter(([, data]) => data.count >= 2);
  if (validDays.length < 2) return null;

  const bestDay = validDays.reduce((a, b) =>
    a[1].views / a[1].count > b[1].views / b[1].count ? a : b
  );

  return {
    category: "timing",
    insight: `Content published on ${bestDay[0]} gets ${Math.round(bestDay[1].views / bestDay[1].count)} avg views`,
    confidence: Math.min(0.7, 0.3 + bestDay[1].count * 0.1),
    evidence: `Based on ${bestDay[1].count} pieces published on ${bestDay[0]}`,
    recommendation: `Schedule content publication for ${bestDay[0]}s`,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Analyzes patterns in top-performing content.
 */
function analyzeTopPerformers(topRecords: ContentPerformanceRecord[]): ContentLearning | null {
  if (topRecords.length < 2) return null;

  const patterns: string[] = [];

  // Check common content types
  const types = topRecords.map((r) => r.contentType);
  const commonType = findMostCommon(types);
  if (commonType && types.filter((t) => t === commonType).length >= 2) {
    patterns.push(`content type: ${commonType}`);
  }

  // Check word count range
  const avgWordCount = topRecords.reduce((sum, r) => sum + r.wordCount, 0) / topRecords.length;
  patterns.push(`avg word count: ${Math.round(avgWordCount)}`);

  if (patterns.length === 0) return null;

  return {
    category: "style",
    insight: `Top performers share: ${patterns.join(", ")}`,
    confidence: 0.6,
    evidence: `Analysis of top ${topRecords.length} performing content pieces`,
    recommendation: `Replicate patterns from top performers: ${patterns.join("; ")}`,
    extractedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

/**
 * Generates actionable recommendations from metrics and learnings.
 */
function generateRecommendations(
  metrics: AggregatedMetrics,
  learnings: ContentLearning[]
): string[] {
  const recommendations: string[] = [];

  // Based on trend
  if (metrics.trend === "declining") {
    recommendations.push("Views are declining — consider refreshing content strategy or increasing publishing frequency");
  }

  // Based on engagement
  if (metrics.avgEngagementRate < 2) {
    recommendations.push("Engagement rate is below 2% — add more CTAs, questions, and interactive elements");
  }

  // Based on learnings
  for (const learning of learnings.filter((l) => l.confidence >= 0.6)) {
    recommendations.push(learning.recommendation);
  }

  // Based on underperformers
  if (metrics.underperformers.length > 0) {
    const underTypes = metrics.underperformers.map((r) => r.contentType);
    const commonUnderType = findMostCommon(underTypes);
    if (commonUnderType) {
      recommendations.push(`Consider reducing "${commonUnderType}" content — it consistently underperforms`);
    }
  }

  return recommendations.slice(0, 7); // Max 7 recommendations
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filters records by time period.
 */
function filterByPeriod(
  records: ContentPerformanceRecord[],
  period: AnalyticsPeriod
): ContentPerformanceRecord[] {
  if (period === "all") return records;

  const now = Date.now();
  const periodMs: Record<string, number> = {
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };

  const cutoff = now - (periodMs[period] ?? periodMs["30d"]);

  return records.filter((r) => new Date(r.publishedAt).getTime() >= cutoff);
}

/**
 * Determines trend direction from two halves of data.
 */
function determineTrend(
  firstHalf: ContentPerformanceRecord[],
  secondHalf: ContentPerformanceRecord[]
): "improving" | "stable" | "declining" {
  if (firstHalf.length === 0 || secondHalf.length === 0) return "stable";

  const firstAvg = firstHalf.reduce((sum, r) => sum + r.analytics.views, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, r) => sum + r.analytics.views, 0) / secondHalf.length;

  const changePercent = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

  if (changePercent > 10) return "improving";
  if (changePercent < -10) return "declining";
  return "stable";
}

/**
 * Finds the most common element in an array.
 */
function findMostCommon<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;

  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }

  let maxCount = 0;
  let maxItem: T | null = null;
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }

  return maxItem;
}
