"use node";

/**
 * Feedback Operator — Feedback Synthesis
 *
 * Handles weekly report generation, feature request tracking,
 * bug pattern detection, and actionable insight generation.
 *
 * Phase 8.5.4 — Feedback Synthesis
 */

import type {
  FeedbackItem,
  FeedbackTheme,
  FeatureRequest,
  BugPattern,
  FeedbackSynthesisReport,
  FeedbackSource,
  FeedbackCategory,
  FeedbackSentiment,
} from "../feedbackOperator";
import { sentimentToScore } from "./feedbackAnalysis";

// ---------------------------------------------------------------------------
// Feature request tracking
// ---------------------------------------------------------------------------

/**
 * Groups feedback items into feature requests.
 * Items with similar content about feature_request category are merged.
 */
export function groupFeatureRequests(
  items: FeedbackItem[],
  existingRequests: FeatureRequest[] = []
): FeatureRequest[] {
  const featureItems = items.filter((i) => i.category === "feature_request");
  const requests = new Map<string, FeatureRequest>();

  // Load existing requests
  for (const req of existingRequests) {
    requests.set(req.id, { ...req });
  }

  // Group new items by theme similarity
  for (const item of featureItems) {
    const matchingRequest = findMatchingRequest(item, Array.from(requests.values()));

    if (matchingRequest) {
      // Update existing request
      const req = requests.get(matchingRequest.id)!;
      if (!req.feedbackIds.includes(item.id)) {
        req.feedbackIds.push(item.id);
        req.requestCount = req.feedbackIds.length;
        req.priorityScore = calculateFeaturePriority(req);
      }
    } else {
      // Create new request
      const newReq: FeatureRequest = {
        id: `fr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: item.summary || item.content.slice(0, 80),
        description: item.content,
        requestCount: 1,
        priorityScore: 0.3, // Default, recalculated later
        status: "new",
        feedbackIds: [item.id],
        estimatedImpact: "medium",
        firstRequestedAt: item.ingestedAt,
      };
      newReq.priorityScore = calculateFeaturePriority(newReq);
      requests.set(newReq.id, newReq);
    }
  }

  return Array.from(requests.values()).sort((a, b) => b.priorityScore - a.priorityScore);
}

/**
 * Finds an existing feature request that matches a new feedback item.
 * Uses theme overlap for matching.
 */
function findMatchingRequest(
  item: FeedbackItem,
  requests: FeatureRequest[]
): FeatureRequest | null {
  for (const req of requests) {
    // Check if any themes overlap
    const reqThemes = new Set(req.title.toLowerCase().split(/\s+/));
    const itemThemes = new Set(item.themes.map((t) => t.toLowerCase()));

    let overlap = 0;
    for (const theme of itemThemes) {
      if (reqThemes.has(theme)) overlap++;
    }

    // If significant overlap or content similarity
    if (overlap >= 2 || contentSimilarity(item.content, req.description) > 0.6) {
      return req;
    }
  }
  return null;
}

/**
 * Calculates priority score for a feature request (0-1).
 */
export function calculateFeaturePriority(request: FeatureRequest): number {
  let score = 0;

  // Request count (0-0.4)
  if (request.requestCount >= 20) score += 0.4;
  else if (request.requestCount >= 10) score += 0.3;
  else if (request.requestCount >= 5) score += 0.2;
  else if (request.requestCount >= 2) score += 0.1;

  // Impact (0-0.3)
  const impactScores = { high: 0.3, medium: 0.2, low: 0.1 };
  score += impactScores[request.estimatedImpact];

  // Recency (0-0.2) — more recent = higher priority
  const daysSinceFirst = (Date.now() - request.firstRequestedAt) / 86400000;
  if (daysSinceFirst < 7) score += 0.2;
  else if (daysSinceFirst < 30) score += 0.15;
  else if (daysSinceFirst < 90) score += 0.1;

  // Status penalty — already planned/in-progress gets lower priority
  if (request.status === "planned" || request.status === "in_progress") score *= 0.5;
  if (request.status === "shipped" || request.status === "declined") score = 0;

  return Math.min(1, score);
}

// ---------------------------------------------------------------------------
// Bug pattern detection
// ---------------------------------------------------------------------------

/**
 * Detects recurring bug patterns from feedback items.
 */
export function detectBugPatterns(
  items: FeedbackItem[],
  existingPatterns: BugPattern[] = []
): BugPattern[] {
  const bugItems = items.filter((i) => i.category === "bug");
  const patterns = new Map<string, BugPattern>();

  // Load existing patterns
  for (const pattern of existingPatterns) {
    patterns.set(pattern.id, { ...pattern });
  }

  // Group bugs by feature area
  const byArea = new Map<string, FeedbackItem[]>();
  for (const item of bugItems) {
    const area = item.featureArea ?? "unknown";
    const existing = byArea.get(area) ?? [];
    existing.push(item);
    byArea.set(area, existing);
  }

  // Detect patterns within each area
  // Detect patterns within each area
  for (const [area, areaItems] of byArea) {
    // Check if this matches an existing pattern
    const existingPattern = Array.from(patterns.values()).find(
      (p) => p.featureArea === area && !p.resolved
    );

    if (existingPattern) {
      // Always update existing patterns — no minimum threshold for accumulation
      for (const item of areaItems) {
        if (!existingPattern.feedbackIds.includes(item.id)) {
          existingPattern.feedbackIds.push(item.id);
          existingPattern.reportCount = existingPattern.feedbackIds.length;
        }
      }
      existingPattern.severity = assessBugSeverity(areaItems.length, areaItems);
    } else {
      // Need at least 2 reports to create a NEW pattern
      if (areaItems.length < 2) continue;

      // Create new pattern
      const newPattern: BugPattern = {
        id: `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: `Bug in ${area}`,
        description: areaItems[0].summary || areaItems[0].content.slice(0, 120),
        featureArea: area,
        reportCount: areaItems.length,
        severity: assessBugSeverity(areaItems.length, areaItems),
        feedbackIds: areaItems.map((i) => i.id),
        firstReportedAt: Math.min(...areaItems.map((i) => i.ingestedAt)),
        resolved: false,
      };
      patterns.set(newPattern.id, newPattern);
    }
  }

  return Array.from(patterns.values()).sort((a, b) => {
    const severityOrder = { critical: 0, major: 1, minor: 2, cosmetic: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Assesses bug severity based on report count and sentiment.
 */
function assessBugSeverity(reportCount: number, items: FeedbackItem[]): BugPattern["severity"] {
  const avgSentiment =
    items.reduce((sum, i) => sum + sentimentToScore(i.sentiment), 0) / items.length;

  // Critical: many reports with very negative sentiment
  if (reportCount >= 10 && avgSentiment < -0.7) return "critical";
  if (reportCount >= 5 && avgSentiment < -0.5) return "major";
  if (reportCount >= 3 || avgSentiment < -0.3) return "minor";
  return "cosmetic";
}

// ---------------------------------------------------------------------------
// Report generation helpers
// ---------------------------------------------------------------------------

/**
 * Compiles a feedback synthesis report from processed data.
 */
export function compileSynthesisReport(
  items: FeedbackItem[],
  themes: FeedbackTheme[],
  featureRequests: FeatureRequest[],
  bugPatterns: BugPattern[],
  period: { start: string; end: string },
  npsScores?: number[]
): FeedbackSynthesisReport {
  // Count by source
  const bySource: Partial<Record<FeedbackSource, number>> = {};
  for (const item of items) {
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  }

  // Count by category
  const byCategory: Partial<Record<FeedbackCategory, number>> = {};
  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  }

  // Sentiment distribution
  const sentimentDist: Partial<Record<FeedbackSentiment, number>> = {};
  for (const item of items) {
    sentimentDist[item.sentiment] = (sentimentDist[item.sentiment] ?? 0) + 1;
  }

  // NPS
  let npsScore: number | undefined;
  let npsTrend: "improving" | "stable" | "declining" | undefined;
  if (npsScores && npsScores.length > 0) {
    let promoters = 0;
    let detractors = 0;
    for (const score of npsScores) {
      if (score >= 9) promoters++;
      else if (score <= 6) detractors++;
    }
    npsScore = Math.round(((promoters - detractors) / npsScores.length) * 100);
    npsTrend = "stable"; // Would need historical data for real trend
  }

  // Generate insights
  const insights = generateInsights(items, themes, bugPatterns);
  const recommendations = generateRecommendations(themes, featureRequests, bugPatterns);

  return {
    period,
    totalItems: items.length,
    bySource,
    byCategory,
    sentimentDistribution: sentimentDist,
    topThemes: themes.slice(0, 5),
    newFeatureRequests: featureRequests.filter((r) => r.status === "new").slice(0, 5),
    bugPatterns: bugPatterns.filter((p) => !p.resolved).slice(0, 5),
    insights,
    recommendations,
    npsScore,
    npsTrend,
  };
}

/**
 * Generates actionable insights from feedback data.
 */
function generateInsights(
  items: FeedbackItem[],
  themes: FeedbackTheme[],
  bugPatterns: BugPattern[]
): string[] {
  const insights: string[] = [];

  // Overall sentiment insight
  const avgSentiment =
    items.length > 0
      ? items.reduce((sum, i) => sum + sentimentToScore(i.sentiment), 0) / items.length
      : 0;

  if (avgSentiment < -0.3) {
    insights.push(
      `Overall sentiment is negative (${avgSentiment.toFixed(2)}). Focus on addressing top pain points.`
    );
  } else if (avgSentiment > 0.3) {
    insights.push(
      `Overall sentiment is positive (${avgSentiment.toFixed(2)}). Users are generally satisfied.`
    );
  }

  // Rising theme insight
  const risingThemes = themes.filter((t) => t.trend === "rising");
  if (risingThemes.length > 0) {
    insights.push(
      `${risingThemes.length} rising theme(s): ${risingThemes.map((t) => t.name).join(", ")}. These need attention.`
    );
  }

  // Critical bugs insight
  const criticalBugs = bugPatterns.filter((p) => p.severity === "critical" && !p.resolved);
  if (criticalBugs.length > 0) {
    insights.push(
      `${criticalBugs.length} critical bug pattern(s) detected. Immediate action recommended.`
    );
  }

  // Volume insight
  if (items.length > 50) {
    insights.push(
      `High feedback volume (${items.length} items). Consider increasing collection frequency.`
    );
  }

  return insights;
}

/**
 * Generates prioritized recommendations.
 */
function generateRecommendations(
  themes: FeedbackTheme[],
  featureRequests: FeatureRequest[],
  bugPatterns: BugPattern[]
): string[] {
  const recommendations: string[] = [];

  // Critical bugs first
  const criticalBugs = bugPatterns.filter((p) => p.severity === "critical" && !p.resolved);
  for (const bug of criticalBugs.slice(0, 2)) {
    recommendations.push(`[URGENT] Fix: ${bug.title} (${bug.reportCount} reports)`);
  }

  // Top feature requests
  const topRequests = featureRequests.filter((r) => r.status === "new").slice(0, 3);
  for (const req of topRequests) {
    recommendations.push(
      `Consider: ${req.title} (${req.requestCount} requests, impact: ${req.estimatedImpact})`
    );
  }

  // Negative themes
  const negativeThemes = themes.filter((t) => t.avgSentiment < -0.3);
  for (const theme of negativeThemes.slice(0, 2)) {
    recommendations.push(
      `Address: "${theme.name}" — ${theme.frequency} mentions with negative sentiment`
    );
  }

  return recommendations;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple content similarity using word overlap ratio.
 */
function contentSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  return overlap / Math.max(wordsA.size, wordsB.size);
}
