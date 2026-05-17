/**
 * Agent Runtime — Self-Correction
 *
 * Provides error detection, self-critique, and correction capabilities:
 * - Output quality checking against configurable criteria
 * - Self-critique prompting for the agent to evaluate its own work
 * - Correction loop that iterates until quality threshold is met
 * - Error pattern detection for common failure modes
 *
 * This module is pure (no DB access) and provides utilities that
 * agents can use during execution. It does NOT run as a standalone
 * agent — it's a mixin/utility for AgentBase subclasses.
 *
 * Phase 7.5.3 — Self-Correction
 */

import type { AgentMessage } from "./types";
import type { LLMCallFn } from "./agentBase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Criteria for evaluating output quality. */
export interface QualityCriteria {
  /** Unique ID for this criterion */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what to check */
  description: string;
  /** Minimum score (0-10) to pass */
  minScore: number;
  /** Weight for overall score calculation */
  weight: number;
}

/** Result of a quality check on a single criterion. */
export interface CriterionResult {
  criterionId: string;
  score: number;
  passed: boolean;
  feedback: string;
}

/** Result of a full quality evaluation. */
export interface QualityEvaluation {
  /** Individual criterion results */
  criteria: CriterionResult[];
  /** Weighted overall score (0-10) */
  overallScore: number;
  /** Whether all criteria passed */
  passed: boolean;
  /** Summary of issues found */
  issues: string[];
  /** Suggested improvements */
  suggestions: string[];
}

/** Configuration for the correction loop. */
export interface CorrectionConfig {
  /** Maximum correction attempts (default: 2) */
  maxAttempts: number;
  /** Minimum overall score to accept (default: 7) */
  minAcceptableScore: number;
  /** Quality criteria to evaluate against */
  criteria: QualityCriteria[];
  /** Whether to include the critique in the correction prompt */
  includeCritiqueInPrompt: boolean;
}

/** Result of a correction attempt. */
export interface CorrectionResult {
  /** The corrected output */
  output: string;
  /** Quality evaluation of the corrected output */
  evaluation: QualityEvaluation;
  /** Number of correction attempts made */
  attempts: number;
  /** Whether the output meets quality standards */
  accepted: boolean;
  /** Total cost of all correction attempts */
  totalCost: number;
}

// ---------------------------------------------------------------------------
// Default quality criteria
// ---------------------------------------------------------------------------

/** Default criteria for content quality evaluation. */
export const DEFAULT_CONTENT_CRITERIA: QualityCriteria[] = [
  {
    id: "accuracy",
    name: "Factual Accuracy",
    description: "Information is correct and well-sourced",
    minScore: 7,
    weight: 3,
  },
  {
    id: "clarity",
    name: "Clarity",
    description: "Writing is clear, concise, and easy to understand",
    minScore: 6,
    weight: 2,
  },
  {
    id: "completeness",
    name: "Completeness",
    description: "All aspects of the request are addressed",
    minScore: 7,
    weight: 2,
  },
  {
    id: "relevance",
    name: "Relevance",
    description: "Content is relevant to the goal and audience",
    minScore: 7,
    weight: 2,
  },
  {
    id: "tone",
    name: "Tone & Voice",
    description: "Tone matches the intended audience and brand",
    minScore: 6,
    weight: 1,
  },
];

/** Default criteria for code/technical output. */
export const DEFAULT_TECHNICAL_CRITERIA: QualityCriteria[] = [
  {
    id: "correctness",
    name: "Correctness",
    description: "The solution is logically correct and handles edge cases",
    minScore: 8,
    weight: 3,
  },
  {
    id: "completeness",
    name: "Completeness",
    description: "All requirements are addressed",
    minScore: 7,
    weight: 2,
  },
  {
    id: "clarity",
    name: "Code Clarity",
    description: "Code is readable and well-structured",
    minScore: 6,
    weight: 1,
  },
];

// ---------------------------------------------------------------------------
// Self-Critique
// ---------------------------------------------------------------------------

/**
 * Generates a self-critique of the agent's output.
 *
 * Asks the LLM to evaluate its own work against the given criteria,
 * returning scores and specific feedback for each criterion.
 */
export async function selfCritique(
  output: string,
  goal: string,
  criteria: QualityCriteria[],
  llmCall: LLMCallFn,
  messages: AgentMessage[]
): Promise<{ evaluation: QualityEvaluation; cost: number }> {
  const critiquePrompt: AgentMessage = {
    role: "user",
    content: `Evaluate the following output against these quality criteria. Be critical and honest.

## Goal
${goal}

## Output to Evaluate
${output}

## Criteria
${criteria.map((c) => `- **${c.name}** (min score: ${c.minScore}/10): ${c.description}`).join("\n")}

Respond with a JSON object:
{
  "criteria": [
    { "criterionId": "id", "score": 0-10, "feedback": "specific feedback" }
  ],
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"]
}`,
    timestamp: Date.now(),
  };

  const response = await llmCall([...messages, critiquePrompt], {
    temperature: 0.2, // Low temperature for consistent evaluation
    maxTokens: 1500,
  });

  const evaluation = parseCritiqueResponse(response.content, criteria);

  return { evaluation, cost: response.cost };
}

/**
 * Runs a correction loop: critique → correct → re-critique until quality is met.
 *
 * Returns the best output achieved within the configured attempts.
 */
export async function correctionLoop(
  initialOutput: string,
  goal: string,
  config: CorrectionConfig,
  llmCall: LLMCallFn,
  messages: AgentMessage[]
): Promise<CorrectionResult> {
  let currentOutput = initialOutput;
  let totalCost = 0;
  let bestEvaluation: QualityEvaluation | null = null;
  let bestOutput = initialOutput;
  let bestScore = 0;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    // Critique the current output
    const { evaluation, cost: critiqueCost } = await selfCritique(
      currentOutput,
      goal,
      config.criteria,
      llmCall,
      messages
    );
    totalCost += critiqueCost;

    // Track the best output seen
    if (evaluation.overallScore > bestScore) {
      bestScore = evaluation.overallScore;
      bestOutput = currentOutput;
      bestEvaluation = evaluation;
    }

    // Check if quality is acceptable
    if (evaluation.passed && evaluation.overallScore >= config.minAcceptableScore) {
      return {
        output: currentOutput,
        evaluation,
        attempts: attempt + 1,
        accepted: true,
        totalCost,
      };
    }

    // If this is the last attempt, return the best we have
    if (attempt === config.maxAttempts - 1) {
      return {
        output: bestOutput,
        evaluation: bestEvaluation ?? evaluation,
        attempts: attempt + 1,
        accepted: false,
        totalCost,
      };
    }

    // Generate a correction based on the critique
    const correctionPrompt: AgentMessage = {
      role: "user",
      content: buildCorrectionPrompt(currentOutput, evaluation, goal, config),
      timestamp: Date.now(),
    };

    const correctionResponse = await llmCall([...messages, correctionPrompt], {
      temperature: 0.5,
      maxTokens: 4096,
    });
    totalCost += correctionResponse.cost;

    currentOutput = extractCorrectedOutput(correctionResponse.content);
  }

  // Should not reach here, but just in case
  return {
    output: bestOutput,
    evaluation: bestEvaluation ?? {
      criteria: [],
      overallScore: 0,
      passed: false,
      issues: ["Correction loop completed without evaluation"],
      suggestions: [],
    },
    attempts: config.maxAttempts,
    accepted: false,
    totalCost,
  };
}

// ---------------------------------------------------------------------------
// Error Pattern Detection
// ---------------------------------------------------------------------------

/** Known error patterns that agents commonly produce. */
export interface ErrorPattern {
  id: string;
  name: string;
  /** Regex or string to detect this pattern */
  detector: RegExp | string;
  /** Severity: how bad is this error */
  severity: "low" | "medium" | "high";
  /** Suggested fix approach */
  fixHint: string;
}

/** Default error patterns to detect. */
export const COMMON_ERROR_PATTERNS: ErrorPattern[] = [
  {
    id: "hallucination_url",
    name: "Hallucinated URL",
    detector: /https?:\/\/(?:www\.)?example\.com|https?:\/\/fake|placeholder\.com/i,
    severity: "high",
    fixHint: "Replace placeholder URLs with real, verified URLs or remove them",
  },
  {
    id: "incomplete_sentence",
    name: "Incomplete Sentence",
    detector: /[a-zA-Z]{4,}\s*$/m,
    severity: "low",
    fixHint: "Complete the trailing sentence",
  },
  {
    id: "repetition",
    name: "Excessive Repetition",
    detector: /(.{20,})\1/,
    severity: "medium",
    fixHint: "Remove repeated content and rephrase",
  },
  {
    id: "todo_placeholder",
    name: "TODO/Placeholder Left In",
    detector: /\[TODO\]|\[PLACEHOLDER\]|\[INSERT\]|\[FILL IN\]/i,
    severity: "high",
    fixHint: "Replace placeholders with actual content",
  },
  {
    id: "meta_commentary",
    name: "Meta Commentary",
    detector: /(?:as an ai|i cannot|i don't have access|i'm unable to)/i,
    severity: "medium",
    fixHint: "Remove AI self-references and provide the actual content",
  },
  {
    id: "empty_section",
    name: "Empty Section",
    detector: /##\s+[^\n]+\n\s*\n(?=##|$)/m,
    severity: "low",
    fixHint: "Fill in empty sections or remove them",
  },
];

/** Result of error pattern detection. */
export interface DetectedError {
  pattern: ErrorPattern;
  match: string;
  position: number;
}

/**
 * Scans output for common error patterns.
 * Returns all detected errors sorted by severity.
 */
export function detectErrors(
  output: string,
  patterns: ErrorPattern[] = COMMON_ERROR_PATTERNS
): DetectedError[] {
  const errors: DetectedError[] = [];

  for (const pattern of patterns) {
    const regex =
      typeof pattern.detector === "string"
        ? new RegExp(pattern.detector, "gi")
        : new RegExp(
            pattern.detector.source,
            pattern.detector.flags + (pattern.detector.flags.includes("g") ? "" : "g")
          );

    let match;
    while ((match = regex.exec(output)) !== null) {
      errors.push({
        pattern,
        match: match[0].slice(0, 100),
        position: match.index,
      });
    }
  }

  // Sort by severity (high first)
  const severityOrder = { high: 0, medium: 1, low: 2 };
  errors.sort((a, b) => severityOrder[a.pattern.severity] - severityOrder[b.pattern.severity]);

  return errors;
}

/**
 * Checks if output has any high-severity errors that require correction.
 */
export function hasHighSeverityErrors(output: string): boolean {
  const errors = detectErrors(output);
  return errors.some((e) => e.pattern.severity === "high");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses the LLM's critique response into a QualityEvaluation.
 */
function parseCritiqueResponse(content: string, criteria: QualityCriteria[]): QualityEvaluation {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  let parsed: {
    criteria?: Array<{ criterionId: string; score: number; feedback: string }>;
    issues?: string[];
    suggestions?: string[];
  } | null = null;

  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Fall through to default scoring
    }
  }

  // Build criterion results
  const criterionResults: CriterionResult[] = criteria.map((c) => {
    const found = parsed?.criteria?.find((r) => r.criterionId === c.id);
    const score = found?.score ?? 5; // Default to middle score if parsing fails
    return {
      criterionId: c.id,
      score,
      passed: score >= c.minScore,
      feedback: found?.feedback ?? "Unable to evaluate",
    };
  });

  // Calculate weighted overall score
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const weightedSum = criterionResults.reduce((sum, r) => {
    const criterion = criteria.find((c) => c.id === r.criterionId);
    return sum + r.score * (criterion?.weight ?? 1);
  }, 0);
  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    criteria: criterionResults,
    overallScore,
    passed: criterionResults.every((r) => r.passed),
    issues: parsed?.issues ?? [],
    suggestions: parsed?.suggestions ?? [],
  };
}

/**
 * Builds a correction prompt from the critique results.
 */
function buildCorrectionPrompt(
  output: string,
  evaluation: QualityEvaluation,
  goal: string,
  config: CorrectionConfig
): string {
  const failedCriteria = evaluation.criteria
    .filter((c) => !c.passed)
    .map((c) => `- ${c.criterionId}: ${c.feedback} (score: ${c.score}/10)`)
    .join("\n");

  let prompt = `Please improve the following output. It did not meet quality standards.

## Original Goal
${goal}

## Issues Found
${failedCriteria}
${evaluation.issues.length > 0 ? "\nAdditional issues:\n" + evaluation.issues.map((i) => `- ${i}`).join("\n") : ""}

## Suggestions
${evaluation.suggestions.map((s) => `- ${s}`).join("\n")}
`;

  if (config.includeCritiqueInPrompt) {
    prompt += `\n## Original Output (to improve)\n${output}\n`;
  }

  prompt += `\nProvide the improved version. Output ONLY the corrected content, no explanations.`;

  return prompt;
}

/**
 * Extracts the corrected output from the LLM's correction response.
 * Strips any meta-commentary the LLM might add.
 */
function extractCorrectedOutput(content: string): string {
  // If the response starts with common meta-prefixes, strip them
  const metaPrefixes = [
    /^here(?:'s| is) the (?:improved|corrected|revised) (?:version|output|content)[:\s]*/i,
    /^(?:improved|corrected|revised) (?:version|output)[:\s]*/i,
  ];

  let cleaned = content.trim();
  for (const prefix of metaPrefixes) {
    cleaned = cleaned.replace(prefix, "");
  }

  return cleaned.trim();
}
