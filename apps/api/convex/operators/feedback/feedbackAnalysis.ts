"use node";

/**
 * Feedback Operator — Feedback Analysis
 *
 * Handles categorization, sentiment analysis, theme extraction,
 * and priority scoring for collected feedback items.
 *
 * Phase 8.5.3 — Feedback Analysis
 */

import type {
  FeedbackItem,
  FeedbackCategory,
  FeedbackSentiment,
  FeedbackPriority,
  FeedbackTheme,
} from "../feedbackOperator";

// ---------------------------------------------------------------------------
// Categorization
// ---------------------------------------------------------------------------

/** Category detection patterns. */
const CATEGORY_PATTERNS: Array<{ category: FeedbackCategory; patterns: RegExp[] }> = [
  {
    category: "security",
    patterns: [/\b(security|vulnerab|exploit|hack|breach|auth.*bypass|injection)\b/i],
  },
  {
    category: "bug",
    patterns: [
      /\b(bug|crash(?:es|ed)?|error|broken|doesn't work|not working|fails?|exception|glitch)\b/i,
      /\b(regression|unexpected|wrong|incorrect)\b/i,
    ],
  },
  {
    category: "performance",
    patterns: [/\b(slow|lag|timeout|latency|speed|loading|performance|memory leak)\b/i],
  },
  {
    category: "feature_request",
    patterns: [
      /\b(feature|request|would be nice|please add|wish|suggestion|could you add)\b/i,
      /\b(it would be great|missing|need.*ability|want.*to be able)\b/i,
    ],
  },
  {
    category: "usability",
    patterns: [
      /\b(confus|unintuitive|hard to|difficult|ux|user experience|clunky|awkward)\b/i,
      /\b(can't find|where is|how do i)\b/i,
    ],
  },
  {
    category: "onboarding",
    patterns: [
      /\b(onboard|getting started|setup|first time|new user|tutorial|guide)\b/i,
      /\b(sign.?up|registration|welcome)\b/i,
    ],
  },
  {
    category: "documentation",
    patterns: [/\b(docs?|documentation|readme|api.?ref|example|tutorial|guide)\b/i],
  },
  {
    category: "pricing",
    patterns: [/\b(pric|cost|expensive|cheap|plan|tier|billing|subscription|free)\b/i],
  },
  {
    category: "integration",
    patterns: [/\b(integrat|connect|api|webhook|plugin|extension|third.?party)\b/i],
  },
];

/**
 * Categorizes feedback content using pattern matching.
 * Returns the first matching category, or "other" as default.
 */
export function categorizeFeedback(content: string): FeedbackCategory {
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some((p) => p.test(content))) {
      return category;
    }
  }
  return "other";
}

// ---------------------------------------------------------------------------
// Sentiment analysis
// ---------------------------------------------------------------------------

/** Sentiment signal words with weights. */
const SENTIMENT_SIGNALS = {
  very_positive: [
    "love",
    "amazing",
    "excellent",
    "fantastic",
    "incredible",
    "outstanding",
    "perfect",
    "brilliant",
    "best ever",
    "game changer",
    "blown away",
  ],
  positive: [
    "good",
    "great",
    "nice",
    "helpful",
    "useful",
    "works well",
    "happy",
    "satisfied",
    "impressed",
    "recommend",
    "thank",
    "appreciate",
  ],
  negative: [
    "bad",
    "poor",
    "disappointing",
    "frustrating",
    "annoying",
    "difficult",
    "confusing",
    "slow",
    "broken",
    "doesn't work",
    "issue",
    "problem",
  ],
  very_negative: [
    "terrible",
    "awful",
    "horrible",
    "worst",
    "hate",
    "useless",
    "waste",
    "unacceptable",
    "furious",
    "disgusting",
    "scam",
    "garbage",
    "trash",
  ],
};

/**
 * Analyzes sentiment of feedback content.
 * Returns a sentiment classification based on signal word frequency.
 */
export function analyzeSentiment(content: string): FeedbackSentiment {
  const lower = content.toLowerCase();

  let veryPositive = 0;
  let positive = 0;
  let negative = 0;
  let veryNegative = 0;

  for (const word of SENTIMENT_SIGNALS.very_positive) {
    if (lower.includes(word)) veryPositive++;
  }
  for (const word of SENTIMENT_SIGNALS.positive) {
    if (lower.includes(word)) positive++;
  }
  for (const word of SENTIMENT_SIGNALS.negative) {
    if (lower.includes(word)) negative++;
  }
  for (const word of SENTIMENT_SIGNALS.very_negative) {
    if (lower.includes(word)) veryNegative++;
  }

  const positiveTotal = veryPositive * 2 + positive;
  const negativeTotal = veryNegative * 2 + negative;

  if (veryNegative >= 2 || negativeTotal >= 4) return "very_negative";
  if (veryPositive >= 2 || positiveTotal >= 4) return "very_positive";
  if (negativeTotal > positiveTotal && negativeTotal >= 2) return "negative";
  if (positiveTotal > negativeTotal && positiveTotal >= 2) return "positive";
  return "neutral";
}

/**
 * Converts sentiment to a numeric score (-1 to 1).
 */
export function sentimentToScore(sentiment: FeedbackSentiment): number {
  const scores: Record<FeedbackSentiment, number> = {
    very_negative: -1,
    negative: -0.5,
    neutral: 0,
    positive: 0.5,
    very_positive: 1,
  };
  return scores[sentiment];
}

// ---------------------------------------------------------------------------
// Priority scoring
// ---------------------------------------------------------------------------

/**
 * Calculates priority for a feedback item based on multiple signals.
 */
export function calculatePriority(
  sentiment: FeedbackSentiment,
  category: FeedbackCategory,
  authorTier?: string,
  frequency = 1
): FeedbackPriority {
  let score = 0;

  // Sentiment weight (0-4)
  const sentimentScores: Record<FeedbackSentiment, number> = {
    very_negative: 4,
    negative: 3,
    neutral: 1,
    positive: 0,
    very_positive: 0,
  };
  score += sentimentScores[sentiment];

  // Category weight (1-4)
  const categoryScores: Record<FeedbackCategory, number> = {
    security: 4,
    bug: 3,
    performance: 3,
    usability: 2,
    onboarding: 2,
    pricing: 2,
    integration: 2,
    feature_request: 1,
    documentation: 1,
    other: 1,
  };
  score += categoryScores[category];

  // Author tier weight (0-3)
  if (authorTier === "enterprise") score += 3;
  else if (authorTier === "pro" || authorTier === "scale") score += 2;
  else if (authorTier === "growth") score += 1;

  // Frequency multiplier (0-3)
  if (frequency >= 10) score += 3;
  else if (frequency >= 5) score += 2;
  else if (frequency >= 3) score += 1;

  // Map to priority
  if (score >= 10) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Theme extraction
// ---------------------------------------------------------------------------

/**
 * Extracts themes from a collection of feedback items.
 * Groups items by common topics and returns themes above the threshold.
 */
export function extractThemes(items: FeedbackItem[], threshold: number): FeedbackTheme[] {
  // Extract topic words from each item
  const topicCounts = new Map<string, { items: FeedbackItem[]; sentiments: number[] }>();

  for (const item of items) {
    for (const theme of item.themes) {
      const normalized = theme.toLowerCase().trim();
      if (!normalized) continue;

      const existing = topicCounts.get(normalized) ?? { items: [], sentiments: [] };
      existing.items.push(item);
      existing.sentiments.push(sentimentToScore(item.sentiment));
      topicCounts.set(normalized, existing);
    }
  }

  // Filter by threshold and build theme objects
  const themes: FeedbackTheme[] = [];

  for (const [name, data] of topicCounts) {
    if (data.items.length < threshold) continue;

    const avgSentiment = data.sentiments.reduce((sum, s) => sum + s, 0) / data.sentiments.length;

    const timestamps = data.items.map((i) => i.ingestedAt);
    const firstDetected = Math.min(...timestamps);
    const lastSeen = Math.max(...timestamps);

    themes.push({
      name,
      description: `Theme detected across ${data.items.length} feedback items`,
      frequency: data.items.length,
      avgSentiment,
      trend: determineTrend(data.items),
      feedbackIds: data.items.map((i) => i.id),
      firstDetectedAt: firstDetected,
      lastSeenAt: lastSeen,
    });
  }

  // Sort by frequency descending
  themes.sort((a, b) => b.frequency - a.frequency);

  return themes;
}

/**
 * Determines trend direction based on item timestamps.
 * Rising = more items in recent half than older half.
 */
function determineTrend(items: FeedbackItem[]): "rising" | "stable" | "declining" {
  if (items.length < 4) return "stable";

  const sorted = [...items].sort((a, b) => a.ingestedAt - b.ingestedAt);
  const midpoint = Math.floor(sorted.length / 2);
  const olderHalf = sorted.slice(0, midpoint);
  const recentHalf = sorted.slice(midpoint);

  const ratio = recentHalf.length / Math.max(olderHalf.length, 1);

  if (ratio > 1.5) return "rising";
  if (ratio < 0.67) return "declining";
  return "stable";
}

// ---------------------------------------------------------------------------
// Feature area detection
// ---------------------------------------------------------------------------

/** Common feature area patterns. */
const FEATURE_AREA_PATTERNS: Array<{ area: string; patterns: RegExp[] }> = [
  { area: "authentication", patterns: [/\b(auth|login|sign.?in|password|sso|oauth)\b/i] },
  { area: "billing", patterns: [/\b(bill|payment|invoice|subscription|charge|refund)\b/i] },
  { area: "dashboard", patterns: [/\b(dashboard|home|overview|main page)\b/i] },
  { area: "api", patterns: [/\b(api|endpoint|rest|graphql|webhook)\b/i] },
  { area: "notifications", patterns: [/\b(notif|alert|email|push|message)\b/i] },
  { area: "settings", patterns: [/\b(setting|config|preference|account)\b/i] },
  { area: "search", patterns: [/\b(search|filter|find|query)\b/i] },
  { area: "export", patterns: [/\b(export|download|csv|pdf|report)\b/i] },
];

/**
 * Detects the feature area from feedback content.
 */
export function detectFeatureArea(content: string, customAreas: string[] = []): string | undefined {
  // Check custom areas first (exact word match)
  for (const area of customAreas) {
    const escaped = area.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(content)) {
      return area;
    }
  }

  // Check built-in patterns
  for (const { area, patterns } of FEATURE_AREA_PATTERNS) {
    if (patterns.some((p) => p.test(content))) {
      return area;
    }
  }

  return undefined;
}
