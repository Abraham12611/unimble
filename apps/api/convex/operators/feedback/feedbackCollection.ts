"use node";

/**
 * Feedback Operator — Feedback Collection
 *
 * Handles ingestion of feedback from multiple sources:
 * - Support tickets (Intercom, Zendesk, Freshdesk)
 * - App store reviews (iOS, Android)
 * - In-app feedback widgets
 * - Social mentions (from Community Operator)
 * - Survey responses (NPS, CSAT)
 * - Sales call notes
 *
 * Phase 8.5.2 — Feedback Collection
 */

import type { FeedbackSource } from "../feedbackOperator";

// ---------------------------------------------------------------------------
// Collection types
// ---------------------------------------------------------------------------

/** Raw feedback before processing. */
export interface RawFeedback {
  /** Source */
  source: FeedbackSource;
  /** Raw content text */
  content: string;
  /** Author identifier */
  author?: string;
  /** Author's subscription tier */
  authorTier?: string;
  /** External reference (ticket ID, review ID, etc.) */
  externalRef?: string;
  /** Original timestamp */
  timestamp: number;
  /** Platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/** Collection run result. */
export interface CollectionResult {
  /** Source that was collected */
  source: FeedbackSource;
  /** Number of new items found */
  newItems: number;
  /** Number of duplicates skipped */
  duplicatesSkipped: number;
  /** Errors encountered */
  errors: string[];
  /** Duration (ms) */
  durationMs: number;
}

/** Deduplication check result. */
export interface DeduplicationResult {
  /** Whether this is a duplicate */
  isDuplicate: boolean;
  /** Existing item ID if duplicate */
  existingId?: string;
  /** Similarity score (0-1) */
  similarity: number;
}

// ---------------------------------------------------------------------------
// Source-specific ingestion helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes raw feedback from different sources into a consistent format.
 */
export function normalizeRawFeedback(
  source: FeedbackSource,
  rawData: Record<string, unknown>
): RawFeedback {
  switch (source) {
    case "support_ticket":
      return normalizeSupportTicket(rawData);
    case "app_review":
      return normalizeAppReview(rawData);
    case "survey_response":
    case "nps_response":
      return normalizeSurveyResponse(rawData, source);
    case "in_app_feedback":
      return normalizeInAppFeedback(rawData);
    case "social_mention":
      return normalizeSocialMention(rawData);
    case "sales_call":
    case "churn_interview":
      return normalizeCallNotes(rawData, source);
    case "community_post":
      return normalizeCommunityPost(rawData);
    default:
      return {
        source,
        content: String(rawData.content ?? rawData.text ?? rawData.body ?? ""),
        author: String(rawData.author ?? rawData.user ?? ""),
        timestamp: (rawData.timestamp as number) ?? Date.now(),
      };
  }
}

function normalizeSupportTicket(data: Record<string, unknown>): RawFeedback {
  return {
    source: "support_ticket",
    content: String(data.subject ?? "") + "\n\n" + String(data.body ?? data.description ?? ""),
    author: String(data.requester_email ?? data.customer_email ?? data.author ?? ""),
    authorTier: String(data.plan ?? data.tier ?? ""),
    externalRef: String(data.id ?? data.ticket_id ?? ""),
    timestamp: (data.created_at as number) ?? (data.timestamp as number) ?? Date.now(),
    metadata: { tags: data.tags, priority: data.priority, status: data.status },
  };
}

function normalizeAppReview(data: Record<string, unknown>): RawFeedback {
  return {
    source: "app_review",
    content:
      String(data.title ?? "") + "\n\n" + String(data.body ?? data.text ?? data.review ?? ""),
    author: String(data.author ?? data.reviewer ?? ""),
    externalRef: String(data.review_id ?? data.id ?? ""),
    timestamp: (data.date as number) ?? (data.timestamp as number) ?? Date.now(),
    metadata: { rating: data.rating, platform: data.platform, version: data.app_version },
  };
}

function normalizeSurveyResponse(
  data: Record<string, unknown>,
  source: FeedbackSource
): RawFeedback {
  const score = data.score ?? data.rating ?? data.nps_score;
  const comment = String(data.comment ?? data.feedback ?? data.text ?? "");

  return {
    source,
    content: score !== undefined ? `Score: ${score}/10. ${comment}` : comment,
    author: String(data.respondent ?? data.email ?? data.user ?? ""),
    authorTier: String(data.plan ?? data.tier ?? ""),
    externalRef: String(data.response_id ?? data.id ?? ""),
    timestamp: (data.submitted_at as number) ?? (data.timestamp as number) ?? Date.now(),
    metadata: { score, survey_type: data.survey_type },
  };
}

function normalizeInAppFeedback(data: Record<string, unknown>): RawFeedback {
  return {
    source: "in_app_feedback",
    content: String(data.message ?? data.feedback ?? data.text ?? ""),
    author: String(data.user_id ?? data.email ?? ""),
    authorTier: String(data.plan ?? data.tier ?? ""),
    externalRef: String(data.feedback_id ?? data.id ?? ""),
    timestamp: (data.created_at as number) ?? (data.timestamp as number) ?? Date.now(),
    metadata: { page: data.page, category: data.category, screenshot: data.screenshot_url },
  };
}

function normalizeSocialMention(data: Record<string, unknown>): RawFeedback {
  return {
    source: "social_mention",
    content: String(data.content ?? data.text ?? ""),
    author: String(data.author ?? data.username ?? ""),
    externalRef: String(data.url ?? data.id ?? ""),
    timestamp: (data.detected_at as number) ?? (data.timestamp as number) ?? Date.now(),
    metadata: { platform: data.platform, sentiment: data.sentiment },
  };
}

function normalizeCallNotes(data: Record<string, unknown>, source: FeedbackSource): RawFeedback {
  return {
    source,
    content: String(data.notes ?? data.summary ?? data.transcript ?? ""),
    author: String(data.customer ?? data.contact ?? ""),
    authorTier: String(data.plan ?? data.tier ?? data.arr ?? ""),
    externalRef: String(data.call_id ?? data.meeting_id ?? data.id ?? ""),
    timestamp: (data.date as number) ?? (data.timestamp as number) ?? Date.now(),
    metadata: { duration: data.duration, outcome: data.outcome, rep: data.rep },
  };
}

function normalizeCommunityPost(data: Record<string, unknown>): RawFeedback {
  return {
    source: "community_post",
    content: String(data.content ?? data.body ?? data.text ?? ""),
    author: String(data.author ?? data.username ?? ""),
    externalRef: String(data.url ?? data.post_id ?? data.id ?? ""),
    timestamp: (data.posted_at as number) ?? (data.timestamp as number) ?? Date.now(),
    metadata: { platform: data.platform, thread_id: data.thread_id },
  };
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Checks if a feedback item is a duplicate of an existing one.
 * Uses content similarity and external reference matching.
 */
export function checkDuplicate(
  newItem: RawFeedback,
  existingItems: Array<{
    id: string;
    content: string;
    externalRef?: string;
    source: FeedbackSource;
  }>
): DeduplicationResult {
  // Exact external reference match
  if (newItem.externalRef) {
    const refMatch = existingItems.find(
      (e) => e.externalRef === newItem.externalRef && e.source === newItem.source
    );
    if (refMatch) {
      return { isDuplicate: true, existingId: refMatch.id, similarity: 1.0 };
    }
  }

  // Content similarity check (simple Jaccard on word sets)
  const newWords = extractWordSet(newItem.content);
  for (const existing of existingItems) {
    const existingWords = extractWordSet(existing.content);
    const similarity = jaccardSimilarity(newWords, existingWords);
    if (similarity > 0.85) {
      return { isDuplicate: true, existingId: existing.id, similarity };
    }
  }

  return { isDuplicate: false, similarity: 0 };
}

/**
 * Extracts a set of meaningful words from text for similarity comparison.
 */
function extractWordSet(text: string): Set<string> {
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
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
    "my",
    "your",
    "and",
    "or",
    "but",
    "not",
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
  );
}

/**
 * Calculates Jaccard similarity between two word sets.
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// NPS helpers
// ---------------------------------------------------------------------------

/**
 * Extracts NPS score from survey response content.
 */
export function extractNpsScore(content: string): number | null {
  const match = content.match(/(?:score|nps|rating):\s*(\d+)/i);
  if (match) {
    const score = parseInt(match[1], 10);
    if (score >= 0 && score <= 10) return score;
  }
  return null;
}

/**
 * Classifies an NPS respondent.
 */
export function classifyNpsRespondent(score: number): "promoter" | "passive" | "detractor" {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}
