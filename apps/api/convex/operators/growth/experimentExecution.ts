"use node";

/**
 * Growth Operator — Experiment Execution
 *
 * Handles the runtime execution of growth experiments:
 * - A/B test variant distribution
 * - Content distribution across channels
 * - Data collection and progress tracking
 * - Early stopping rules (futility/superiority)
 *
 * Phase 8.3.3 — Experiment Execution
 */

import type { GrowthExperiment, ExperimentVariant } from "../growthOperator";

// ---------------------------------------------------------------------------
// Execution types
// ---------------------------------------------------------------------------

/** Configuration for running an experiment. */
export interface ExecutionConfig {
  /** Experiment to execute */
  experiment: GrowthExperiment;
  /** Traffic allocation per variant (must sum to 1.0) */
  trafficAllocation: Record<string, number>;
  /** Whether to enable early stopping */
  earlyStoppingEnabled: boolean;
  /** Check interval for early stopping (ms) */
  earlyStoppingCheckIntervalMs: number;
  /** Minimum samples before early stopping can trigger */
  earlyStoppingMinSamples: number;
}

/** Real-time execution state. */
export interface ExecutionState {
  /** Experiment ID */
  experimentId: string;
  /** Current status */
  status: "initializing" | "distributing" | "collecting" | "stopping" | "done";
  /** Per-variant data collection progress */
  variantProgress: Record<string, VariantProgress>;
  /** Total elapsed time (ms) */
  elapsedMs: number;
  /** Estimated time remaining (ms) */
  estimatedRemainingMs: number;
  /** Early stopping triggered? */
  earlyStopTriggered: boolean;
  /** Early stop reason (if triggered) */
  earlyStopReason?: string;
  /** Errors encountered */
  errors: ExecutionError[];
}

/** Progress for a single variant. */
export interface VariantProgress {
  /** Variant ID */
  variantId: string;
  /** Samples collected */
  samplesCollected: number;
  /** Target samples */
  targetSamples: number;
  /** Completion percentage (0-100) */
  completionPercent: number;
  /** Raw metric values collected */
  metricValues: number[];
  /** Running conversion count (for proportion tests) */
  conversions: number;
}

/** An error during execution. */
export interface ExecutionError {
  /** Timestamp */
  timestamp: number;
  /** Error message */
  message: string;
  /** Severity */
  severity: "warning" | "error" | "fatal";
  /** Whether execution can continue */
  recoverable: boolean;
}

// ---------------------------------------------------------------------------
// Distribution
// ---------------------------------------------------------------------------

/** Content distribution request. */
export interface DistributionRequest {
  /** Variant to distribute */
  variant: ExperimentVariant;
  /** Channel to distribute on */
  channel: string;
  /** Traffic percentage (0-1) */
  trafficPercent: number;
  /** Targeting criteria */
  targeting?: Record<string, unknown>;
  /** Schedule (immediate or delayed) */
  scheduleAt?: string;
}

/** Result of a distribution action. */
export interface DistributionResult {
  /** Whether distribution was successful */
  success: boolean;
  /** Channel used */
  channel: string;
  /** Variant ID */
  variantId: string;
  /** External reference (post ID, campaign ID, etc.) */
  externalRef?: string;
  /** Error message if failed */
  error?: string;
  /** Timestamp */
  distributedAt: number;
}

/**
 * Validates traffic allocation sums to 1.0 (within floating point tolerance).
 */
export function validateTrafficAllocation(allocation: Record<string, number>): {
  valid: boolean;
  error?: string;
} {
  const total = Object.values(allocation).reduce((sum, v) => sum + v, 0);
  if (Math.abs(total - 1.0) > 0.001) {
    return {
      valid: false,
      error: `Traffic allocation must sum to 1.0, got ${total.toFixed(4)}`,
    };
  }

  for (const [variantId, percent] of Object.entries(allocation)) {
    if (percent < 0 || percent > 1) {
      return {
        valid: false,
        error: `Variant ${variantId} allocation must be between 0 and 1`,
      };
    }
  }

  return { valid: true };
}

/**
 * Creates a default equal-split traffic allocation for all variants.
 */
export function createEqualAllocation(
  control: ExperimentVariant,
  treatments: ExperimentVariant[]
): Record<string, number> {
  const allVariants = [control, ...treatments];
  const perVariant = 1.0 / allVariants.length;
  const allocation: Record<string, number> = {};

  for (const variant of allVariants) {
    allocation[variant.id] = perVariant;
  }

  return allocation;
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

/**
 * Initializes execution state for an experiment.
 */
export function initializeExecutionState(experiment: GrowthExperiment): ExecutionState {
  const variantProgress: Record<string, VariantProgress> = {};

  // Control
  variantProgress[experiment.control.id] = {
    variantId: experiment.control.id,
    samplesCollected: 0,
    targetSamples: experiment.targetSampleSize,
    completionPercent: 0,
    metricValues: [],
    conversions: 0,
  };

  // Treatments
  for (const treatment of experiment.treatments) {
    variantProgress[treatment.id] = {
      variantId: treatment.id,
      samplesCollected: 0,
      targetSamples: experiment.targetSampleSize,
      completionPercent: 0,
      metricValues: [],
      conversions: 0,
    };
  }

  return {
    experimentId: experiment.id,
    status: "initializing",
    variantProgress,
    elapsedMs: 0,
    estimatedRemainingMs: experiment.durationDays * 86400000,
    earlyStopTriggered: false,
    errors: [],
  };
}

/**
 * Updates progress for a variant with new data.
 * Returns a new state object without mutating the input.
 */
export function updateVariantProgress(
  state: ExecutionState,
  variantId: string,
  newSamples: number,
  newConversions: number
): ExecutionState {
  const existing = state.variantProgress[variantId];
  if (!existing) {
    return state;
  }

  const samplesCollected = existing.samplesCollected + newSamples;
  const conversions = existing.conversions + newConversions;
  const completionPercent = Math.min(100, (samplesCollected / existing.targetSamples) * 100);

  return {
    ...state,
    variantProgress: {
      ...state.variantProgress,
      [variantId]: {
        ...existing,
        samplesCollected,
        conversions,
        completionPercent,
      },
    },
  };
}

/**
 * Checks if all variants have reached their target sample size.
 */
export function isDataCollectionComplete(state: ExecutionState): boolean {
  return Object.values(state.variantProgress).every((p) => p.samplesCollected >= p.targetSamples);
}

// ---------------------------------------------------------------------------
// Early stopping
// ---------------------------------------------------------------------------

/** Early stopping decision. */
export interface EarlyStopDecision {
  /** Whether to stop early */
  shouldStop: boolean;
  /** Reason for stopping */
  reason: "futility" | "superiority" | "none";
  /** Confidence in the decision */
  confidence: number;
  /** Explanation */
  explanation: string;
}

/**
 * Evaluates whether an experiment should be stopped early.
 *
 * Uses O'Brien-Fleming-like spending function:
 * - The boundary is STRICTEST early (requires very strong evidence)
 *   and relaxes as more data accumulates toward the target sample size.
 * - Formula: adjustedAlpha = baseAlpha * sqrt(completionRatio)
 *   At 25% completion: threshold = alpha * 0.5 (very strict)
 *   At 100% completion: threshold = alpha (normal significance level)
 *
 * Stopping rules:
 * - Superiority: Treatment is clearly better with high confidence
 * - Futility: Treatment is unlikely to catch up given remaining samples
 */
export function evaluateEarlyStopping(
  state: ExecutionState,
  minSamplesPerVariant: number,
  significanceThreshold = 0.95
): EarlyStopDecision {
  const variants = Object.values(state.variantProgress);
  const baseAlpha = 1 - significanceThreshold;

  // Need minimum samples in all variants
  if (variants.some((v) => v.samplesCollected < minSamplesPerVariant)) {
    return {
      shouldStop: false,
      reason: "none",
      confidence: 0,
      explanation: "Insufficient samples for early stopping evaluation",
    };
  }

  // Find control and best treatment
  const controlProgress = variants[0]; // First variant is always control
  if (!controlProgress) {
    return {
      shouldStop: false,
      reason: "none",
      confidence: 0,
      explanation: "No control variant found",
    };
  }

  const controlRate = controlProgress.conversions / controlProgress.samplesCollected;

  // Find the best-performing treatment variant
  let bestTreatmentProgress: VariantProgress | null = null;
  let bestTreatmentRate = 0;
  for (let i = 1; i < variants.length; i++) {
    const rate = variants[i].conversions / variants[i].samplesCollected;
    if (rate > bestTreatmentRate) {
      bestTreatmentRate = rate;
      bestTreatmentProgress = variants[i];
    }
  }

  if (!bestTreatmentProgress) {
    return {
      shouldStop: false,
      reason: "none",
      confidence: 0,
      explanation: "No treatment variants found",
    };
  }

  // O'Brien-Fleming spending function: strictest early, relaxes with more data.
  // adjustedAlpha = baseAlpha * sqrt(completionRatio)
  // At 25% data: adjustedAlpha = baseAlpha * 0.5 (very hard to stop)
  // At 100% data: adjustedAlpha = baseAlpha (normal threshold)
  const completionRatio = controlProgress.samplesCollected / controlProgress.targetSamples;
  const adjustedAlpha = baseAlpha * Math.sqrt(completionRatio);

  // Check superiority (one-sided test: treatment > control)
  if (bestTreatmentRate > controlRate) {
    const pooledRate =
      (controlProgress.conversions + bestTreatmentProgress.conversions) /
      (controlProgress.samplesCollected + bestTreatmentProgress.samplesCollected);
    const se = Math.sqrt(
      pooledRate *
        (1 - pooledRate) *
        (1 / controlProgress.samplesCollected + 1 / bestTreatmentProgress.samplesCollected)
    );
    const z = se > 0 ? (bestTreatmentRate - controlRate) / se : 0;
    // One-sided p-value (right tail)
    const pValueOneSided = 1 - normalCDF(z);

    // Compare one-sided p-value against adjustedAlpha/2 to maintain
    // consistency with the two-sided final analysis in analyzeExperiment.
    // This ensures early stopping fires only when the two-sided p-value
    // would also be below the adjusted threshold.
    if (pValueOneSided < adjustedAlpha / 2) {
      return {
        shouldStop: true,
        reason: "superiority",
        confidence: 1 - 2 * pValueOneSided, // Convert to two-sided confidence
        explanation: `Treatment is significantly better (p_two_sided=${(2 * pValueOneSided).toFixed(4)}, adjusted α=${adjustedAlpha.toFixed(4)})`,
      };
    }
  }

  // Check futility (treatment is worse and unlikely to catch up)
  if (bestTreatmentRate < controlRate && completionRatio > 0.5) {
    const deficit = controlRate - bestTreatmentRate;
    const remainingSamples = controlProgress.targetSamples - controlProgress.samplesCollected;

    // If deficit is large relative to remaining opportunity
    if (deficit > 0.1 && remainingSamples < controlProgress.samplesCollected) {
      return {
        shouldStop: true,
        reason: "futility",
        confidence: 0.8,
        explanation: `Treatment unlikely to overcome ${(deficit * 100).toFixed(1)}% deficit with remaining samples`,
      };
    }
  }

  return {
    shouldStop: false,
    reason: "none",
    confidence: 0,
    explanation: "Experiment should continue collecting data",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard normal CDF approximation. */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-absX * absX) / 2);

  return 0.5 * (1.0 + sign * y);
}
