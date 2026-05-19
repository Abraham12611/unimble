"use node";

/**
 * Growth Operator — Experiment Design
 *
 * Handles hypothesis generation, experiment planning, metric selection,
 * and sample size calculation. Uses Perplexity for research and the
 * agent runtime for creative hypothesis generation.
 *
 * Phase 8.3.2 — Experiment Design
 */

import type { ExperimentType, ExperimentVariant, GrowthOperatorSettings } from "../growthOperator";

// ---------------------------------------------------------------------------
// Hypothesis generation
// ---------------------------------------------------------------------------

/** Input for hypothesis generation. */
export interface HypothesisInput {
  /** Current performance data */
  currentMetrics: Record<string, number>;
  /** Competitor insights (from Perplexity/Firehose) */
  competitorInsights?: string[];
  /** Past experiment learnings */
  pastLearnings?: string[];
  /** Focus area (optional) */
  focusArea?: ExperimentType;
  /** Available channels */
  channels: string[];
}

/** A generated hypothesis ready for experiment design. */
export interface GeneratedHypothesis {
  /** Hypothesis statement */
  statement: string;
  /** Rationale */
  rationale: string;
  /** Suggested experiment type */
  suggestedType: ExperimentType;
  /** Suggested primary metric */
  suggestedMetric: string;
  /** Estimated impact */
  estimatedImpact: "low" | "medium" | "high";
  /** Estimated effort */
  estimatedEffort: "low" | "medium" | "high";
  /** Confidence in hypothesis (0-1) */
  confidence: number;
  /** Supporting evidence */
  evidence: string[];
}

/**
 * Generates experiment hypotheses from available data.
 *
 * This function prepares the prompt context for the agent step
 * that actually calls the LLM. It structures the input data
 * into a format the agent can reason about.
 */
export function buildHypothesisPromptContext(input: HypothesisInput): string {
  const sections: string[] = [];

  sections.push("## Current Performance Metrics");
  for (const [key, value] of Object.entries(input.currentMetrics)) {
    sections.push(`- ${key}: ${value}`);
  }

  if (input.competitorInsights?.length) {
    sections.push("\n## Competitor Insights");
    for (const insight of input.competitorInsights) {
      sections.push(`- ${insight}`);
    }
  }

  if (input.pastLearnings?.length) {
    sections.push("\n## Past Experiment Learnings");
    for (const learning of input.pastLearnings) {
      sections.push(`- ${learning}`);
    }
  }

  sections.push(`\n## Available Channels: ${input.channels.join(", ")}`);

  if (input.focusArea) {
    sections.push(`\n## Focus Area: ${input.focusArea}`);
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Experiment planning
// ---------------------------------------------------------------------------

/** Parameters for designing an experiment from a hypothesis. */
export interface ExperimentDesignParams {
  /** The hypothesis to test */
  hypothesis: string;
  /** Experiment type */
  type: ExperimentType;
  /** Primary metric to measure */
  primaryMetric: string;
  /** Secondary metrics */
  secondaryMetrics?: string[];
  /** Baseline conversion rate (for sample size calc) */
  baselineRate: number;
  /** Operator settings */
  settings: GrowthOperatorSettings;
}

/** Output of experiment design. */
export interface ExperimentDesignOutput {
  /** Experiment name */
  name: string;
  /** Control variant */
  control: ExperimentVariant;
  /** Treatment variants */
  treatments: ExperimentVariant[];
  /** Required sample size per variant */
  requiredSampleSize: number;
  /** Recommended duration in days */
  recommendedDurationDays: number;
  /** Independent variable */
  independentVariable: string;
  /** Dependent variable */
  dependentVariable: string;
  /** Channels to use */
  channels: string[];
}

/**
 * Calculates the required sample size for a two-proportion z-test.
 *
 * Uses the formula:
 * n = (Zα/2 * √(2p̄q̄) + Zβ * √(p1q1 + p2q2))² / (p2 - p1)²
 */
export function calculateSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  significanceLevel: number,
  power = 0.8
): number {
  const alpha = 1 - significanceLevel;
  const zAlpha = approximateZScore(1 - alpha / 2);
  const zBeta = approximateZScore(power);

  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minimumDetectableEffect / 100);
  const pBar = (p1 + p2) / 2;

  if (p2 === p1) return Infinity; // No effect to detect

  const numerator = Math.pow(
    zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
    2
  );
  const denominator = Math.pow(p2 - p1, 2);

  return Math.ceil(numerator / denominator);
}

/**
 * Estimates experiment duration based on sample size and expected traffic.
 */
export function estimateDuration(
  requiredSampleSize: number,
  dailyTraffic: number,
  variantCount: number
): number {
  if (dailyTraffic <= 0) return 90; // Cap at 90 days if no traffic data
  const totalSamplesNeeded = requiredSampleSize * variantCount;
  const days = Math.ceil(totalSamplesNeeded / dailyTraffic);
  return Math.min(Math.max(days, 7), 90); // Between 7 and 90 days
}

/**
 * Validates that an experiment design is sound.
 */
export function validateExperimentDesign(
  design: ExperimentDesignOutput,
  settings: GrowthOperatorSettings
): { valid: boolean; warnings: string[]; errors: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!design.control) {
    errors.push("Experiment must have a control variant");
  }
  if (design.treatments.length === 0) {
    errors.push("Experiment must have at least one treatment variant");
  }
  if (design.requiredSampleSize < 100) {
    warnings.push("Sample size below 100 may produce unreliable results");
  }
  if (design.recommendedDurationDays > 60) {
    warnings.push("Experiment duration exceeds 60 days — consider reducing scope");
  }
  if (design.treatments.length > 4) {
    warnings.push("More than 4 variants increases required sample size significantly");
  }
  if (design.channels.length === 0) {
    errors.push("At least one distribution channel must be selected");
  }

  // Check against settings
  if (design.recommendedDurationDays > settings.defaultExperimentDurationDays * 3) {
    warnings.push("Duration significantly exceeds default — ensure sufficient traffic");
  }

  return { valid: errors.length === 0, warnings, errors };
}

// ---------------------------------------------------------------------------
// Metric selection helpers
// ---------------------------------------------------------------------------

/** Common metrics by experiment type. */
export const SUGGESTED_METRICS: Record<ExperimentType, { primary: string; secondary: string[] }> = {
  ab_content: {
    primary: "click_through_rate",
    secondary: ["time_on_page", "bounce_rate", "shares", "conversions"],
  },
  distribution_channel: {
    primary: "traffic_volume",
    secondary: ["cost_per_acquisition", "engagement_rate", "conversion_rate"],
  },
  messaging: {
    primary: "conversion_rate",
    secondary: ["click_through_rate", "open_rate", "unsubscribe_rate"],
  },
  timing: {
    primary: "engagement_rate",
    secondary: ["open_rate", "click_through_rate", "reach"],
  },
  audience_targeting: {
    primary: "conversion_rate",
    secondary: ["cost_per_click", "relevance_score", "return_rate"],
  },
  cta_optimization: {
    primary: "click_through_rate",
    secondary: ["conversion_rate", "bounce_rate", "scroll_depth"],
  },
  seo_test: {
    primary: "organic_traffic",
    secondary: ["ranking_position", "click_through_rate", "impressions"],
  },
};

/**
 * Returns suggested metrics for a given experiment type.
 */
export function getSuggestedMetrics(type: ExperimentType): {
  primary: string;
  secondary: string[];
} {
  return SUGGESTED_METRICS[type];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Approximate inverse normal CDF (z-score). */
function approximateZScore(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  return p < 0.5 ? -z : z;
}
