"use node";

/**
 * Content Operator — Content Review
 *
 * Implements the content review workflow using the ReviewerAgent
 * from Phase 7.6. Performs multi-dimensional quality assessment:
 * - Technical review (code accuracy, best practices)
 * - Editorial review (clarity, grammar, tone)
 * - Factual review (accuracy, source verification)
 * - SEO review (keyword optimization, structure)
 *
 * Produces a verdict (approve/revise/reject) with specific
 * revision instructions when needed.
 *
 * Phase 8.2.4 — Content Review
 */

import {
  createReviewerAgent,
  type ReviewerConfig,
  type ReviewInput,
  type ReviewResult,
  type ReviewType,
} from "../../agent/reviewerAgent";
import type { LLMCallFn } from "../../agent/agentBase";
import type { ContentDraft, ContentTopic } from "../contentOperator";
import { analyzeSEO } from "./contentGeneration";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for content review. */
export interface ContentReviewConfig {
  /** Review types to perform */
  reviewTypes: ReviewType[];
  /** Strictness level */
  strictness: ReviewerConfig["strictness"];
  /** Score weights per review type */
  weights?: Partial<Record<ReviewType, number>>;
  /** Threshold to approve */
  approveThreshold?: number;
  /** Threshold to reject */
  rejectThreshold?: number;
  /** Maximum revision rounds before escalating */
  maxRevisionRounds: number;
  /** Target keywords for SEO review */
  targetKeywords?: string[];
  /** Target audience for editorial review */
  targetAudience?: string;
}

/** Result of the content review process. */
export interface ContentReviewResult {
  /** Overall verdict */
  verdict: "approve" | "revise" | "reject";
  /** Overall score (1-10) */
  overallScore: number;
  /** Scores per review type */
  scores: Record<string, number>;
  /** Issues found */
  issues: ContentReviewIssue[];
  /** Revision instructions (if verdict is "revise") */
  revisionInstructions?: string;
  /** SEO analysis (if SEO review was performed) */
  seoAnalysis?: ReturnType<typeof analyzeSEO>;
  /** Review metadata */
  metadata: {
    /** Review duration (ms) */
    durationMs: number;
    /** Review cost */
    cost: number;
    /** Number of review types performed */
    reviewTypesPerformed: number;
  };
}

/** A specific issue found during review. */
export interface ContentReviewIssue {
  /** Severity */
  severity: "must_fix" | "should_fix" | "consider";
  /** Category (review type) */
  category: string;
  /** Description of the issue */
  description: string;
  /** Suggested fix */
  suggestion?: string;
  /** Location in the content (if applicable) */
  location?: string;
}

// ---------------------------------------------------------------------------
// Content Review Functions
// ---------------------------------------------------------------------------

/**
 * Performs a full content review using the ReviewerAgent.
 *
 * Runs multiple review types in sequence and aggregates results
 * into a single verdict with actionable feedback.
 */
export async function reviewContent(
  draft: ContentDraft,
  topic: ContentTopic,
  config: ContentReviewConfig,
  llmCall: LLMCallFn
): Promise<ContentReviewResult> {
  const startTime = Date.now();
  let totalCost = 0;

  // Create the reviewer agent
  const reviewer = createReviewerAgent(
    "content-reviewer",
    config.reviewTypes,
    {
      strictness: config.strictness,
      weights: config.weights,
      approveThreshold: config.approveThreshold,
      rejectThreshold: config.rejectThreshold,
    }
  );

  // Build review input
  const reviewInput: ReviewInput = {
    content: draft.markdown,
    contentType: topic.contentType,
    goal: `Create a high-quality ${topic.contentType} about "${topic.title}" for ${topic.audienceLevel} developers`,
    targetAudience: config.targetAudience ?? `${topic.audienceLevel} developers`,
    keywords: config.targetKeywords ?? topic.keywords,
    wordCountTarget: topic.estimatedWordCount,
    context: {
      title: draft.title,
      metaDescription: draft.metaDescription,
      tags: draft.tags,
      wordCount: draft.wordCount,
      revisionCount: draft.revisionCount,
    },
  };

  // Run the review
  const reviewResult: ReviewResult = await reviewer.review(reviewInput, llmCall);
  totalCost += reviewResult.cost;

  // Convert ReviewResult to ContentReviewResult
  const issues: ContentReviewIssue[] = reviewResult.response.issues.map((issue) => ({
    severity: issue.severity,
    category: issue.category,
    description: issue.description,
    suggestion: issue.suggestion,
  }));

  // Run SEO analysis if SEO review type is included
  let seoAnalysis: ReturnType<typeof analyzeSEO> | undefined;
  if (config.reviewTypes.includes("seo") && config.targetKeywords) {
    seoAnalysis = analyzeSEO(draft, config.targetKeywords);

    // Add SEO-specific issues
    for (const suggestion of seoAnalysis.suggestions) {
      issues.push({
        severity: "should_fix",
        category: "seo",
        description: suggestion,
      });
    }
  }

  return {
    verdict: reviewResult.response.verdict,
    overallScore: reviewResult.response.overallScore,
    scores: reviewResult.response.scores,
    issues,
    revisionInstructions: reviewResult.response.revisionInstructions,
    seoAnalysis,
    metadata: {
      durationMs: Date.now() - startTime,
      cost: totalCost,
      reviewTypesPerformed: config.reviewTypes.length,
    },
  };
}

/**
 * Creates a default review configuration for the content operator.
 */
export function createDefaultReviewConfig(
  topic: ContentTopic,
  operatorSettings: Record<string, unknown>
): ContentReviewConfig {
  // Determine review types based on content type
  const reviewTypes: ReviewType[] = ["editorial", "factual"];

  // Add technical review for tutorials and documentation
  if (
    topic.contentType === "tutorial" ||
    topic.contentType === "documentation" ||
    topic.contentType === "guide"
  ) {
    reviewTypes.unshift("technical");
  }

  // Always include SEO review
  reviewTypes.push("seo");

  return {
    reviewTypes,
    strictness: "medium",
    weights: {
      technical: 3,
      editorial: 2,
      factual: 3,
      seo: 1,
    },
    approveThreshold: 7.5,
    rejectThreshold: 4.0,
    maxRevisionRounds: 3,
    targetKeywords: topic.keywords,
    targetAudience: `${topic.audienceLevel} developers`,
  };
}

/**
 * Determines if content should be sent for another revision round
 * or if it should be escalated to a human.
 */
export function shouldRevise(
  reviewResult: ContentReviewResult,
  currentRevisionCount: number,
  maxRevisions: number
): { action: "revise" | "escalate" | "approve" | "reject"; reason: string } {
  if (reviewResult.verdict === "approve") {
    return { action: "approve", reason: "Content meets quality standards" };
  }

  if (reviewResult.verdict === "reject") {
    return {
      action: "reject",
      reason: `Content scored ${reviewResult.overallScore}/10, below rejection threshold`,
    };
  }

  // Verdict is "revise"
  if (currentRevisionCount >= maxRevisions) {
    return {
      action: "escalate",
      reason: `Content has been revised ${currentRevisionCount} times without reaching approval threshold. Human review needed.`,
    };
  }

  // Check if the issues are fixable
  const mustFixCount = reviewResult.issues.filter((i) => i.severity === "must_fix").length;
  if (mustFixCount > 5) {
    return {
      action: "escalate",
      reason: `Too many critical issues (${mustFixCount}). Content may need to be rewritten from scratch.`,
    };
  }

  return {
    action: "revise",
    reason: `${reviewResult.issues.length} issues found. Revision ${currentRevisionCount + 1}/${maxRevisions}.`,
  };
}

/**
 * Builds revision instructions from review results.
 * Prioritizes must_fix issues and provides clear, actionable guidance.
 */
export function buildRevisionInstructions(
  reviewResult: ContentReviewResult
): string {
  const lines: string[] = [];

  lines.push(`# Revision Required (Score: ${reviewResult.overallScore}/10)`);
  lines.push("");

  // Must fix
  const mustFix = reviewResult.issues.filter((i) => i.severity === "must_fix");
  if (mustFix.length > 0) {
    lines.push("## Must Fix (blocking)");
    for (let i = 0; i < mustFix.length; i++) {
      const issue = mustFix[i];
      lines.push(`${i + 1}. **[${issue.category}]** ${issue.description}`);
      if (issue.suggestion) lines.push(`   → ${issue.suggestion}`);
      if (issue.location) lines.push(`   📍 ${issue.location}`);
    }
    lines.push("");
  }

  // Should fix
  const shouldFix = reviewResult.issues.filter((i) => i.severity === "should_fix");
  if (shouldFix.length > 0) {
    lines.push("## Should Fix (recommended)");
    for (let i = 0; i < shouldFix.length; i++) {
      const issue = shouldFix[i];
      lines.push(`${i + 1}. **[${issue.category}]** ${issue.description}`);
      if (issue.suggestion) lines.push(`   → ${issue.suggestion}`);
    }
    lines.push("");
  }

  // Consider
  const consider = reviewResult.issues.filter((i) => i.severity === "consider");
  if (consider.length > 0) {
    lines.push("## Consider (optional improvements)");
    for (const issue of consider.slice(0, 5)) {
      lines.push(`- [${issue.category}] ${issue.description}`);
    }
  }

  return lines.join("\n");
}
