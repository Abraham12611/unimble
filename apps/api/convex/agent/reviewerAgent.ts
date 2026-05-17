"use node";

/**
 * Agent Runtime — Reviewer Agent
 *
 * Specialized agent for quality review of other agents' outputs.
 * Supports multiple review types:
 * - Technical review (code accuracy, best practices)
 * - Editorial review (clarity, grammar, tone)
 * - Factual review (accuracy, source verification)
 * - SEO/AEO review (keyword optimization, structure)
 *
 * The Reviewer Agent uses the selfCritique system from Phase 7.5
 * but wraps it in a configurable, multi-dimensional review process.
 * It produces structured ReviewResponsePayload messages that the
 * Lead Agent uses to decide whether content is ready to publish.
 *
 * Phase 7.6.2 — Reviewer Agent
 */

import { AgentBase } from "./agentBase";
import type { LLMCallFn, ToolExecutorFn } from "./agentBase";
import type {
  AgentConfig,
  AgentContext,
  AgentExecutionState,
  AgentMessage,
  AgentStep,
} from "./types";
import type { QualityCriteria, QualityEvaluation } from "./selfCorrection";
import {
  selfCritique,
  DEFAULT_CONTENT_CRITERIA,
  DEFAULT_TECHNICAL_CRITERIA,
} from "./selfCorrection";
import type { ReviewResponsePayload, ReviewIssue } from "./communication";
import { createReviewResponse } from "./communication";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Types of review the Reviewer Agent can perform. */
export type ReviewType = "technical" | "editorial" | "factual" | "seo" | "comprehensive";

/** Configuration for the Reviewer Agent. */
export interface ReviewerConfig {
  /** Types of review to perform */
  reviewTypes: ReviewType[];
  /** Strictness level (affects scoring thresholds) */
  strictness: "low" | "medium" | "high";
  /** Score weights per review type */
  weights?: Partial<Record<ReviewType, number>>;
  /** Threshold to approve (overall score must be >= this) */
  approveThreshold?: number;
  /** Threshold below which content is rejected (below this = reject) */
  rejectThreshold?: number;
  /** Maximum time for review (ms) */
  maxReviewTimeMs?: number;
}

/** Input for a review task. */
export interface ReviewInput {
  /** The content to review */
  content: string;
  /** Type of content */
  contentType: string;
  /** The original goal/brief */
  goal: string;
  /** Target audience */
  targetAudience?: string;
  /** Keywords to check for */
  keywords?: string[];
  /** Word count target */
  wordCountTarget?: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

/** Full review result from the Reviewer Agent. */
export interface ReviewResult {
  /** Structured review response (for communication protocol) */
  response: ReviewResponsePayload;
  /** Detailed evaluations per review type */
  evaluations: Record<ReviewType, QualityEvaluation>;
  /** Total cost of the review */
  cost: number;
  /** Duration in ms */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Review Criteria by Type
// ---------------------------------------------------------------------------

/** Criteria for editorial review. */
const EDITORIAL_CRITERIA: QualityCriteria[] = [
  {
    id: "clarity",
    name: "Clarity & Readability",
    description: "Writing is clear, concise, and easy to understand for the target audience",
    minScore: 7,
    weight: 3,
  },
  {
    id: "grammar",
    name: "Grammar & Spelling",
    description: "No grammatical errors, typos, or awkward phrasing",
    minScore: 8,
    weight: 2,
  },
  {
    id: "tone",
    name: "Tone Consistency",
    description: "Tone matches the intended brand voice and audience",
    minScore: 6,
    weight: 2,
  },
  {
    id: "structure",
    name: "Structure & Flow",
    description: "Content is well-organized with logical progression",
    minScore: 7,
    weight: 2,
  },
  {
    id: "engagement",
    name: "Engagement",
    description: "Content is interesting and holds the reader's attention",
    minScore: 6,
    weight: 1,
  },
];

/** Criteria for factual review. */
const FACTUAL_CRITERIA: QualityCriteria[] = [
  {
    id: "accuracy",
    name: "Factual Accuracy",
    description: "All claims are verifiable and correct",
    minScore: 9,
    weight: 4,
  },
  {
    id: "sources",
    name: "Source Quality",
    description: "Claims are backed by reliable, current sources",
    minScore: 7,
    weight: 2,
  },
  {
    id: "currency",
    name: "Information Currency",
    description: "Information is up-to-date and not outdated",
    minScore: 7,
    weight: 2,
  },
  {
    id: "hallucination",
    name: "Hallucination Check",
    description: "No fabricated facts, URLs, or statistics",
    minScore: 9,
    weight: 3,
  },
];

/** Criteria for SEO/AEO review. */
const SEO_CRITERIA: QualityCriteria[] = [
  {
    id: "keywords",
    name: "Keyword Integration",
    description: "Target keywords are included naturally without stuffing",
    minScore: 6,
    weight: 2,
  },
  {
    id: "structure_seo",
    name: "SEO Structure",
    description: "Proper heading hierarchy, meta-friendly structure",
    minScore: 6,
    weight: 2,
  },
  {
    id: "snippets",
    name: "Featured Snippet Potential",
    description: "Content is structured for AI/search engine featured snippets",
    minScore: 5,
    weight: 1,
  },
  {
    id: "internal_links",
    name: "Internal Linking",
    description: "Opportunities for internal links are utilized",
    minScore: 5,
    weight: 1,
  },
];

/**
 * Gets the criteria set for a given review type.
 */
export function getCriteriaForType(reviewType: ReviewType): QualityCriteria[] {
  switch (reviewType) {
    case "technical":
      return DEFAULT_TECHNICAL_CRITERIA;
    case "editorial":
      return EDITORIAL_CRITERIA;
    case "factual":
      return FACTUAL_CRITERIA;
    case "seo":
      return SEO_CRITERIA;
    case "comprehensive":
      return [
        ...DEFAULT_CONTENT_CRITERIA,
        ...EDITORIAL_CRITERIA.filter((c) => c.id !== "clarity" && c.id !== "tone"),
      ];
  }
}

// ---------------------------------------------------------------------------
// Reviewer Agent Class
// ---------------------------------------------------------------------------

/**
 * Agent specialized in reviewing content produced by other agents.
 *
 * Unlike the general AgentBase which uses a ReAct loop, the Reviewer
 * Agent follows a structured evaluation process:
 * 1. Parse the review request
 * 2. Run each configured review type
 * 3. Aggregate scores
 * 4. Produce a verdict (approve/revise/reject)
 * 5. Generate revision instructions if needed
 */
export class ReviewerAgent extends AgentBase {
  private reviewerConfig: ReviewerConfig;

  constructor(agentConfig: AgentConfig, reviewerConfig: ReviewerConfig) {
    super(agentConfig);
    this.reviewerConfig = reviewerConfig;
  }

  /**
   * Performs a structured review of the given content.
   * Returns a ReviewResult with scores, issues, and verdict.
   */
  async review(input: ReviewInput, llmCall: LLMCallFn): Promise<ReviewResult> {
    const startTime = Date.now();
    let totalCost = 0;

    const evaluations: Partial<Record<ReviewType, QualityEvaluation>> = {};
    const allIssues: ReviewIssue[] = [];
    const allScores: Record<string, number> = {};

    // Run each review type
    for (const reviewType of this.reviewerConfig.reviewTypes) {
      const criteria = this.adjustCriteriaForStrictness(
        getCriteriaForType(reviewType),
        this.reviewerConfig.strictness
      );

      // Build review-specific messages
      const messages = this.buildReviewMessages(input, reviewType);

      // Use selfCritique for the evaluation
      const { evaluation, cost } = await selfCritique(
        input.content,
        this.buildReviewGoal(input, reviewType),
        criteria,
        llmCall,
        messages
      );

      totalCost += cost;
      evaluations[reviewType] = evaluation;
      allScores[reviewType] = evaluation.overallScore;

      // Convert evaluation issues to ReviewIssues
      for (const issue of evaluation.issues) {
        allIssues.push({
          severity: this.issueSeverityFromScore(evaluation.overallScore),
          category: reviewType,
          description: issue,
        });
      }

      // Add criterion-level issues for failed criteria
      for (const criterion of evaluation.criteria) {
        if (!criterion.passed) {
          allIssues.push({
            severity: criterion.score < 4 ? "must_fix" : "should_fix",
            category: reviewType,
            description: `${criterion.criterionId}: ${criterion.feedback}`,
            suggestion: evaluation.suggestions.find((s) =>
              s.toLowerCase().includes(criterion.criterionId.toLowerCase())
            ),
          });
        }
      }
    }

    // Calculate weighted overall score
    const overallScore = this.calculateWeightedScore(allScores);

    // Determine verdict
    const approveThreshold =
      this.reviewerConfig.approveThreshold ?? this.getDefaultApproveThreshold();
    const rejectThreshold = this.reviewerConfig.rejectThreshold ?? this.getDefaultRejectThreshold();
    const verdict = this.determineVerdict(overallScore, approveThreshold, rejectThreshold);

    // Generate revision instructions if needed
    let revisionInstructions: string | undefined;
    if (verdict === "revise") {
      revisionInstructions = this.generateRevisionInstructions(allIssues);
    }

    const response = createReviewResponse(
      verdict,
      overallScore,
      allScores,
      allIssues,
      revisionInstructions
    );

    return {
      response,
      evaluations: evaluations as Record<ReviewType, QualityEvaluation>,
      cost: totalCost,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Executes the reviewer as a standard agent (for use in the workflow engine).
   * Wraps the review() method in the AgentBase execution pattern.
   */
  async execute(
    context: AgentContext,
    llmCall: LLMCallFn,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    toolExecutor: ToolExecutorFn
  ): Promise<AgentExecutionState> {
    const startTime = Date.now();
    this.state = this.createInitialState(context.goal);
    this.state.status = "thinking";

    try {
      // Extract review input from context
      const input = this.extractReviewInput(context);

      // Perform the review
      const result = await this.review(input, llmCall);

      // Record as a single step
      const step: AgentStep = {
        iteration: 1,
        thought: `Reviewing ${input.contentType} content across ${this.reviewerConfig.reviewTypes.length} dimensions`,
        action: {
          type: "final_answer",
          content: JSON.stringify(result.response),
          format: "json",
        },
        timestamp: Date.now(),
        durationMs: result.durationMs,
        cost: result.cost,
      };

      this.state.steps.push(step);
      this.state.currentIteration = 1;
      this.state.totalCost = result.cost;
      this.state.status = "complete";
      this.state.output = result.response;
    } catch (error) {
      this.state.status = "failed";
      this.state.error = error instanceof Error ? error.message : String(error);
    }

    this.state.totalDurationMs = Date.now() - startTime;
    return this.state;
  }

  // ---------------------------------------------------------------------------
  // Internal Methods
  // ---------------------------------------------------------------------------

  /**
   * Adjusts criteria min scores based on strictness level.
   */
  private adjustCriteriaForStrictness(
    criteria: QualityCriteria[],
    strictness: ReviewerConfig["strictness"]
  ): QualityCriteria[] {
    const adjustment = strictness === "high" ? 1 : strictness === "low" ? -1 : 0;

    return criteria.map((c) => ({
      ...c,
      minScore: Math.max(1, Math.min(10, c.minScore + adjustment)),
    }));
  }

  /**
   * Builds review-specific messages for the LLM.
   */
  private buildReviewMessages(input: ReviewInput, reviewType: ReviewType): AgentMessage[] {
    const now = Date.now();
    const messages: AgentMessage[] = [];

    messages.push({
      role: "system",
      content: `You are an expert ${reviewType} reviewer. Your job is to critically evaluate content and provide specific, actionable feedback. Be thorough but fair.${input.targetAudience ? `\n\nTarget audience: ${input.targetAudience}` : ""}`,
      timestamp: now,
    });

    if (input.context && Object.keys(input.context).length > 0) {
      messages.push({
        role: "user",
        content: `Additional context:\n${JSON.stringify(input.context, null, 2)}`,
        timestamp: now,
      });
    }

    return messages;
  }

  /**
   * Builds a review-specific goal string for selfCritique.
   */
  private buildReviewGoal(input: ReviewInput, reviewType: ReviewType): string {
    let goal = `Review this ${input.contentType} for ${reviewType} quality.`;
    goal += `\n\nOriginal brief: ${input.goal}`;

    if (input.targetAudience) {
      goal += `\nTarget audience: ${input.targetAudience}`;
    }
    if (input.keywords && input.keywords.length > 0) {
      goal += `\nTarget keywords: ${input.keywords.join(", ")}`;
    }
    if (input.wordCountTarget) {
      goal += `\nWord count target: ${input.wordCountTarget}`;
    }

    return goal;
  }

  /**
   * Calculates weighted overall score from individual review type scores.
   */
  private calculateWeightedScore(scores: Record<string, number>): number {
    const weights = this.reviewerConfig.weights ?? {};
    const defaultWeights: Record<ReviewType, number> = {
      technical: 3,
      editorial: 2,
      factual: 3,
      seo: 1,
      comprehensive: 2,
    };

    let totalWeight = 0;
    let weightedSum = 0;

    for (const [type, score] of Object.entries(scores)) {
      const weight = weights[type as ReviewType] ?? defaultWeights[type as ReviewType] ?? 1;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
  }

  /**
   * Determines the verdict based on overall score and thresholds.
   */
  private determineVerdict(
    score: number,
    approveThreshold: number,
    rejectThreshold: number
  ): "approve" | "revise" | "reject" {
    if (score >= approveThreshold) return "approve";
    if (score < rejectThreshold) return "reject";
    return "revise";
  }

  /**
   * Gets the default approve threshold based on strictness.
   */
  private getDefaultApproveThreshold(): number {
    switch (this.reviewerConfig.strictness) {
      case "high":
        return 8.5;
      case "medium":
        return 7.5;
      case "low":
        return 6.5;
    }
  }

  /**
   * Gets the default reject threshold based on strictness.
   */
  private getDefaultRejectThreshold(): number {
    switch (this.reviewerConfig.strictness) {
      case "high":
        return 5.0;
      case "medium":
        return 4.0;
      case "low":
        return 3.0;
    }
  }

  /**
   * Maps a score to an issue severity.
   */
  private issueSeverityFromScore(score: number): ReviewIssue["severity"] {
    if (score < 4) return "must_fix";
    if (score < 7) return "should_fix";
    return "consider";
  }

  /**
   * Generates revision instructions from the issues found.
   */
  private generateRevisionInstructions(issues: ReviewIssue[]): string {
    const mustFix = issues.filter((i) => i.severity === "must_fix");
    const shouldFix = issues.filter((i) => i.severity === "should_fix");

    const lines: string[] = [];

    if (mustFix.length > 0) {
      lines.push("## Must Fix (blocking)");
      for (let i = 0; i < mustFix.length; i++) {
        const issue = mustFix[i];
        lines.push(
          `${i + 1}. [${issue.category}] ${issue.description}${issue.suggestion ? ` → ${issue.suggestion}` : ""}`
        );
      }
    }

    if (shouldFix.length > 0) {
      lines.push("\n## Should Fix (recommended)");
      for (let i = 0; i < shouldFix.length; i++) {
        const issue = shouldFix[i];
        lines.push(
          `${i + 1}. [${issue.category}] ${issue.description}${issue.suggestion ? ` → ${issue.suggestion}` : ""}`
        );
      }
    }

    return lines.join("\n");
  }

  /**
   * Extracts ReviewInput from an AgentContext.
   */
  private extractReviewInput(context: AgentContext): ReviewInput {
    const input = context.input ?? {};

    return {
      content: (input.content as string) ?? "",
      contentType: (input.contentType as string) ?? "unknown",
      goal: context.goal,
      targetAudience: input.targetAudience as string | undefined,
      keywords: input.keywords as string[] | undefined,
      wordCountTarget: input.wordCountTarget as number | undefined,
      context: input.context as Record<string, unknown> | undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a ReviewerAgent with sensible defaults.
 */
export function createReviewerAgent(
  id: string,
  reviewTypes: ReviewType[],
  options?: {
    strictness?: ReviewerConfig["strictness"];
    weights?: Partial<Record<ReviewType, number>>;
    approveThreshold?: number;
    rejectThreshold?: number;
    model?: string;
  }
): ReviewerAgent {
  const agentConfig: AgentConfig = {
    id,
    name: `Reviewer (${reviewTypes.join(", ")})`,
    description: `Reviews content for ${reviewTypes.join(", ")} quality`,
    systemPrompt: `You are an expert content reviewer. Evaluate content critically and provide specific, actionable feedback.`,
    modelTier: "generation",
    mode: "single_shot",
    tools: [],
    maxIterations: 1,
    temperature: 0.2,
    model: options?.model,
  };

  const reviewerConfig: ReviewerConfig = {
    reviewTypes,
    strictness: options?.strictness ?? "medium",
    weights: options?.weights,
    approveThreshold: options?.approveThreshold,
    rejectThreshold: options?.rejectThreshold,
  };

  return new ReviewerAgent(agentConfig, reviewerConfig);
}
