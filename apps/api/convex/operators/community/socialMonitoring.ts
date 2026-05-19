"use node";

/**
 * Community Operator — Social Monitoring
 *
 * Handles real-time monitoring of social platforms for mentions,
 * discussions, and engagement opportunities. Integrates with:
 * - Firehose API for real-time web monitoring via SSE
 * - Composio for platform-specific API access
 * - Perplexity for context enrichment
 *
 * Phase 8.4.2 — Social Monitoring
 */

import type {
  SocialPlatform,
  InteractionType,
  Sentiment,
  CommunityMention,
  EngagementPriority,
} from "../communityOperator";

// ---------------------------------------------------------------------------
// Monitoring types
// ---------------------------------------------------------------------------

/** Configuration for a monitoring rule. */
export interface MonitoringRule {
  /** Rule ID */
  id: string;
  /** Platforms to apply this rule on */
  platforms: SocialPlatform[];
  /** Keywords to match (OR logic) */
  keywords: string[];
  /** Exclude keywords */
  excludeKeywords?: string[];
  /** Minimum author influence (0-1) */
  minInfluence?: number;
  /** Whether this rule is active */
  enabled: boolean;
}

/** Raw mention before classification. */
export interface RawMention {
  /** Platform source */
  platform: SocialPlatform;
  /** Author username */
  author: string;
  /** Content text */
  content: string;
  /** URL to original */
  url: string;
  /** Timestamp (epoch ms) */
  timestamp: number;
  /** Platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/** Firehose query configuration. */
export interface FirehoseQuery {
  /** Lucene query string */
  query: string;
  /** Content types to include */
  contentTypes: string[];
  /** Languages to include */
  languages: string[];
  /** Whether to include diffs */
  includeDiffs: boolean;
}

// ---------------------------------------------------------------------------
// Firehose query builders
// ---------------------------------------------------------------------------

/**
 * Builds a Firehose API query from monitoring keywords and brand names.
 *
 * Firehose uses Lucene query syntax. We combine keywords with OR
 * and wrap phrases in quotes.
 */
export function buildFirehoseQuery(
  keywords: string[],
  brandNames: string[],
  excludeKeywords: string[] = []
): FirehoseQuery {
  const allTerms = [...keywords, ...brandNames];

  // Build Lucene query: ("term1" OR "term2") NOT ("exclude1" OR "exclude2")
  const includeClause = allTerms
    .map((term) => (term.includes(" ") ? `"${term}"` : term))
    .join(" OR ");

  let query = `(${includeClause})`;

  if (excludeKeywords.length > 0) {
    const excludeClause = excludeKeywords
      .map((term) => (term.includes(" ") ? `"${term}"` : term))
      .join(" OR ");
    query += ` NOT (${excludeClause})`;
  }

  return {
    query,
    contentTypes: ["social_post", "forum_post", "comment", "article"],
    languages: ["en"],
    includeDiffs: false,
  };
}

// ---------------------------------------------------------------------------
// Mention detection and deduplication
// ---------------------------------------------------------------------------

/**
 * Deduplicates mentions based on content similarity and URL.
 * Uses a simple hash-based approach to avoid processing the same mention twice.
 */
export function deduplicateMentions(
  newMentions: RawMention[],
  existingIds: Set<string>
): RawMention[] {
  const seen = new Set<string>();
  const unique: RawMention[] = [];

  for (const mention of newMentions) {
    const hash = computeMentionHash(mention);
    if (!seen.has(hash) && !existingIds.has(hash)) {
      seen.add(hash);
      unique.push(mention);
    }
  }

  return unique;
}

/**
 * Computes a hash for deduplication.
 * Uses URL + first 100 chars of content as the key.
 */
function computeMentionHash(mention: RawMention): string {
  const key = `${mention.platform}:${mention.url}:${mention.content.slice(0, 100)}`;
  // Simple string hash (djb2)
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i);
  }
  return `mh_${(hash >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Sentiment analysis helpers
// ---------------------------------------------------------------------------

/** Sentiment signal words for quick classification. */
const SENTIMENT_SIGNALS = {
  positive: [
    "love",
    "great",
    "awesome",
    "amazing",
    "excellent",
    "fantastic",
    "helpful",
    "thank",
    "thanks",
    "perfect",
    "brilliant",
    "impressed",
    "recommend",
    "best",
    "wonderful",
    "solved",
    "works",
  ],
  negative: [
    "hate",
    "terrible",
    "awful",
    "broken",
    "bug",
    "crash",
    "worst",
    "frustrated",
    "annoying",
    "useless",
    "disappointed",
    "slow",
    "doesn't work",
    "can't",
    "won't",
    "fail",
    "error",
    "issue",
  ],
};

/**
 * Quick sentiment classification based on keyword signals.
 * This is a fast heuristic — the agent step does deeper analysis.
 */
export function quickSentimentClassify(content: string): Sentiment {
  const lower = content.toLowerCase();

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of SENTIMENT_SIGNALS.positive) {
    if (lower.includes(word)) positiveCount++;
  }
  for (const word of SENTIMENT_SIGNALS.negative) {
    if (lower.includes(word)) negativeCount++;
  }

  if (positiveCount > 0 && negativeCount > 0) return "mixed";
  if (positiveCount > negativeCount) return "positive";
  if (negativeCount > positiveCount) return "negative";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Interaction type detection
// ---------------------------------------------------------------------------

/** Patterns for detecting interaction types. */
const INTERACTION_PATTERNS: Array<{ type: InteractionType; patterns: RegExp[] }> = [
  {
    type: "question",
    patterns: [/\?$/, /how (do|can|to)/i, /what (is|are)/i, /why (does|is)/i, /anyone know/i],
  },
  {
    type: "bug_report",
    patterns: [/bug/i, /crash/i, /error/i, /broken/i, /doesn't work/i, /not working/i],
  },
  {
    type: "feature_request",
    patterns: [/feature request/i, /would be nice/i, /wish.*had/i, /please add/i, /suggestion/i],
  },
  {
    type: "support_request",
    patterns: [/help/i, /how do i/i, /stuck/i, /can't figure/i, /need assistance/i],
  },
  {
    type: "praise",
    patterns: [/love this/i, /amazing/i, /great job/i, /thank you/i, /awesome/i, /impressed/i],
  },
  {
    type: "complaint",
    patterns: [/frustrated/i, /disappointed/i, /terrible/i, /worst/i, /unacceptable/i],
  },
];

/**
 * Detects the interaction type from content using pattern matching.
 * Returns the first matching type, or "mention" as default.
 */
export function detectInteractionType(content: string): InteractionType {
  for (const { type, patterns } of INTERACTION_PATTERNS) {
    if (patterns.some((p) => p.test(content))) {
      return type;
    }
  }
  return "mention";
}

// ---------------------------------------------------------------------------
// Priority calculation
// ---------------------------------------------------------------------------

/**
 * Calculates engagement priority for a mention.
 */
export function calculateEngagementPriority(
  sentiment: Sentiment,
  interactionType: InteractionType,
  authorInfluence: number,
  minInfluenceThreshold: number
): EngagementPriority {
  // Skip low-influence neutral mentions
  if (authorInfluence < minInfluenceThreshold && sentiment === "neutral") {
    return "skip";
  }

  // Critical: negative from high-influence
  if (sentiment === "negative" && authorInfluence > 0.8) return "critical";

  // High: bugs, support, or high-influence
  if (interactionType === "bug_report" || interactionType === "support_request") return "high";
  if (authorInfluence > 0.7) return "high";

  // Medium: questions, feature requests, moderate influence
  if (interactionType === "question" || interactionType === "feature_request") return "medium";
  if (authorInfluence > 0.3) return "medium";

  // Low: everything else
  return "low";
}

/**
 * Converts a raw mention into a classified CommunityMention.
 */
export function classifyMention(
  raw: RawMention,
  authorInfluence: number,
  minInfluenceThreshold: number
): CommunityMention {
  const sentiment = quickSentimentClassify(raw.content);
  const type = detectInteractionType(raw.content);
  const priority = calculateEngagementPriority(
    sentiment,
    type,
    authorInfluence,
    minInfluenceThreshold
  );

  return {
    id: computeMentionHash(raw),
    platform: raw.platform,
    type,
    author: raw.author,
    authorInfluence,
    content: raw.content,
    url: raw.url,
    sentiment,
    priority,
    responseGenerated: false,
    responsePosted: false,
    detectedAt: raw.timestamp,
    topics: extractTopics(raw.content),
  };
}

/**
 * Extracts topic keywords from content (simple word frequency approach).
 */
function extractTopics(content: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "shall",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "it",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
    "my",
    "your",
    "his",
    "her",
    "its",
    "our",
    "their",
    "and",
    "or",
    "but",
    "not",
    "so",
    "if",
  ]);

  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  // Count frequency
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  // Return top 5 by frequency
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}
