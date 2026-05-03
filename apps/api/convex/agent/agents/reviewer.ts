/**
 * Phase 7 — Agent Runtime: Reviewer agents.
 *
 * Four reviewer types: technical, editorial, factual, SEO.
 * Each produces a ReviewResult with a 0–100 score, must-fix issues,
 * and suggestions.
 *
 * ReviewerPipeline runs all four in parallel (or a selected subset) and
 * aggregates results into an AggregatedReview.
 */

import type {
  AgentContext,
  AgentResult,
  AggregatedReview,
  ReviewIssue,
  ReviewResult,
  ReviewType,
} from "../types";
import type { OpenRouterClient } from "../llm";
import type { AgentLogger } from "./base";
import { Agent, silentLogger } from "./base";
import { extractJson } from "../parser";

// ---------------------------------------------------------------------------
// Reviewer prompt templates (inline for reviewer-specific logic)
// ---------------------------------------------------------------------------

const REVIEWER_PROMPTS: Record<ReviewType, { focus: string; criteria: string }> = {
  technical: {
    focus: "technical accuracy, logical consistency, and factual correctness of technical claims",
    criteria: `- Verify all technical claims, statistics, and code snippets
- Flag inaccurate or misleading technical statements (must-fix)
- Note outdated information (suggestion)
- Check logical flow and internal consistency`,
  },
  editorial: {
    focus: "writing quality, tone, structure, and clarity",
    criteria: `- Evaluate sentence structure, readability, and flow
- Check tone consistency and audience-appropriateness
- Flag grammar, spelling, and punctuation errors (must-fix if significant)
- Note opportunities to improve clarity (suggestion)`,
  },
  factual: {
    focus: "factual accuracy, source credibility, and verifiability",
    criteria: `- Identify claims that require citations but lack them (must-fix)
- Flag potentially incorrect facts or statistics
- Note outdated data that should be refreshed
- Check for misleading framing or selective presentation`,
  },
  seo: {
    focus: "SEO optimisation, keyword usage, meta elements, and search intent",
    criteria: `- Check for target keyword presence in title, headings, and body
- Evaluate keyword density (not over-stuffed, not absent)
- Flag missing or weak meta description, title length issues (must-fix)
- Note internal linking opportunities (suggestion)
- Assess content comprehensiveness for search intent`,
  },
};

// ---------------------------------------------------------------------------
// ReviewerAgent
// ---------------------------------------------------------------------------

export class ReviewerAgent extends Agent {
  readonly agentType: string;
  readonly description: string;
  readonly reviewType: ReviewType;

  constructor(
    private readonly llm: OpenRouterClient,
    reviewType: ReviewType,
    logger?: AgentLogger
  ) {
    super();
    this.reviewType = reviewType;
    this.agentType = `reviewer:${reviewType}`;
    this.description = `Reviews content for ${REVIEWER_PROMPTS[reviewType].focus}`;
    this.logger = logger ?? silentLogger;
  }

  async execute(goal: string, ctx: AgentContext): Promise<AgentResult> {
    this.resetState();

    // `goal` is the content to review for reviewer agents
    const content = goal;
    const prompt = this._buildPrompt(content);

    let completion;
    try {
      completion = await this.llm.complete({
        model: "anthropic/claude-3-5-sonnet",
        messages: [
          { role: "system", content: this._systemPrompt() },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 2048,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return this.buildResult("failed", null, { error });
    }

    this.trackUsage(completion.usage.totalTokens, completion.estimatedCostUsd);

    const reviewResult = this._parseReview(completion.content);

    return this.buildResult("completed", reviewResult, {
      reasoning: completion.content,
    });
  }

  /** Run a review and return a typed ReviewResult directly (convenience method). */
  async review(content: string, ctx: AgentContext): Promise<ReviewResult> {
    const result = await this.execute(content, ctx);
    if (result.status !== "completed" || !result.output) {
      return this._fallbackReview(result.error);
    }
    return result.output as ReviewResult;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _systemPrompt(): string {
    return `You are a professional ${this.reviewType} content reviewer. ${this.description}.

Return ONLY a valid JSON object with this exact structure:
{
  "type": "${this.reviewType}",
  "score": <number 0-100>,
  "summary": "<1-2 sentence overview>",
  "issues": [
    {
      "severity": "must-fix" | "suggestion" | "info",
      "description": "<description>",
      "location": "<optional: where in the content>"
    }
  ]
}`;
  }

  private _buildPrompt(content: string): string {
    const { focus, criteria } = REVIEWER_PROMPTS[this.reviewType];
    return `Review the following content focusing on ${focus}.

Evaluation criteria:
${criteria}

Content to review:
---
${content}
---

Provide your assessment as a JSON object.`;
  }

  private _parseReview(raw: string): ReviewResult {
    const json = extractJson(raw) as Record<string, unknown> | null;

    if (!json || typeof json.score !== "number") {
      return this._fallbackReview("Failed to parse review JSON");
    }

    const issues = (json.issues as Record<string, unknown>[] | undefined) ?? [];
    const parsedIssues: ReviewIssue[] = issues.map((i) => ({
      severity: (i.severity as ReviewIssue["severity"]) ?? "info",
      description: String(i.description ?? ""),
      location: i.location ? String(i.location) : undefined,
    }));

    return {
      type: this.reviewType,
      score: Math.max(0, Math.min(100, Number(json.score))),
      summary: String(json.summary ?? ""),
      issues: parsedIssues,
      mustFix: parsedIssues.filter((i) => i.severity === "must-fix"),
      suggestions: parsedIssues.filter((i) => i.severity === "suggestion"),
    };
  }

  private _fallbackReview(error?: string): ReviewResult {
    return {
      type: this.reviewType,
      score: 0,
      summary: error ?? "Review failed",
      issues: [],
      mustFix: [],
      suggestions: [],
      metadata: { error },
    };
  }
}

// ---------------------------------------------------------------------------
// ReviewerPipeline — run multiple reviewers and aggregate
// ---------------------------------------------------------------------------

export interface ReviewerPipelineConfig {
  /** Review types to run. Default: all four */
  reviewTypes?: ReviewType[];
  /** Score weights per review type. Default: equal weight */
  weights?: Partial<Record<ReviewType, number>>;
  /** Minimum score to consider the content approved. Default: 70 */
  approvalThreshold?: number;
}

export class ReviewerPipeline {
  private readonly reviewers: ReviewerAgent[];
  private readonly weights: Record<ReviewType, number>;
  private readonly approvalThreshold: number;

  constructor(
    llm: OpenRouterClient,
    config: ReviewerPipelineConfig = {},
    logger?: AgentLogger
  ) {
    const types = config.reviewTypes ?? ["technical", "editorial", "factual", "seo"];
    this.reviewers = types.map((t) => new ReviewerAgent(llm, t, logger));

    const defaultWeight = 1 / types.length;
    this.weights = {
      technical: defaultWeight,
      editorial: defaultWeight,
      factual: defaultWeight,
      seo: defaultWeight,
      ...config.weights,
    };
    this.approvalThreshold = config.approvalThreshold ?? 70;
  }

  /**
   * Run all reviewer agents in parallel and aggregate the results.
   */
  async run(content: string, ctx: AgentContext): Promise<AggregatedReview> {
    const reviews = await Promise.all(
      this.reviewers.map((r) => r.review(content, ctx))
    );

    // Weighted average score
    let totalWeight = 0;
    let weightedScore = 0;
    for (const review of reviews) {
      const w = this.weights[review.type] ?? 0.25;
      weightedScore += review.score * w;
      totalWeight += w;
    }
    const overallScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

    const allMustFix = reviews.flatMap((r) => r.mustFix);
    const allSuggestions = reviews.flatMap((r) => r.suggestions);

    return {
      overallScore,
      reviews,
      mustFix: allMustFix,
      suggestions: allSuggestions,
      approved: overallScore >= this.approvalThreshold && allMustFix.length === 0,
    };
  }
}
