"use node";

/**
 * Growth Operator — Experiment Analysis
 *
 * Statistical analysis engine for growth experiments:
 * - Two-proportion z-tests for conversion metrics
 * - Confidence interval calculation
 * - Effect size (lift) computation
 * - Result interpretation and recommendation generation
 * - Learning extraction for operator memory
 *
 * Phase 8.3.4 — Experiment Analysis
 */

import type { GrowthExperiment, ExperimentResults, VariantMetrics } from "../growthOperator";
import type { VariantProgress } from "./experimentExecution";

// ---------------------------------------------------------------------------
// Analysis types
// ---------------------------------------------------------------------------

/** Raw data input for analysis. */
export interface AnalysisInput {
  /** Experiment definition */
  experiment: GrowthExperiment;
  /** Collected data per variant */
  variantData: Record<string, VariantProgress>;
  /** Additional metric data (beyond primary) */
  secondaryMetricData?: Record<string, Record<string, number>>;
}

/** Full analysis output. */
export interface AnalysisOutput {
  /** Experiment results */
  results: ExperimentResults;
  /** Detailed statistical breakdown */
  statisticalDetails: StatisticalDetails;
  /** Extracted learnings */
  learnings: ExtractedLearning[];
  /** Recommendations for next steps */
  recommendations: string[];
}

/** Detailed statistical information. */
export interface StatisticalDetails {
  /** Test type used */
  testType: "two_proportion_z" | "t_test" | "chi_square";
  /** Degrees of freedom (if applicable) */
  degreesOfFreedom?: number;
  /** Test statistic value */
  testStatistic: number;
  /** Critical value at significance level */
  criticalValue: number;
  /** Power achieved */
  achievedPower: number;
  /** Whether minimum sample size was met */
  sampleSizeMet: boolean;
  /** Per-variant detailed stats */
  perVariant: Record<string, DetailedVariantStats>;
}

/** Detailed stats for a single variant. */
export interface DetailedVariantStats {
  /** Sample size */
  n: number;
  /** Mean/rate */
  mean: number;
  /** Standard error */
  standardError: number;
  /** 95% confidence interval */
  ci95: [number, number];
  /** 99% confidence interval */
  ci99: [number, number];
}

/** A learning extracted from experiment results. */
export interface ExtractedLearning {
  /** Learning category */
  category: "what_works" | "what_doesnt" | "audience_insight" | "channel_insight" | "timing";
  /** The insight */
  insight: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Supporting data point */
  evidence: string;
  /** Actionable next step */
  actionItem?: string;
}

// ---------------------------------------------------------------------------
// Core analysis functions
// ---------------------------------------------------------------------------

/**
 * Performs full statistical analysis on experiment data.
 */
export function analyzeExperiment(input: AnalysisInput): AnalysisOutput {
  const { experiment, variantData } = input;

  // Get control data
  const controlData = variantData[experiment.control.id];
  if (!controlData) {
    throw new Error("Control variant data not found");
  }

  // Analyze each treatment vs control
  const variantMetrics: Record<string, VariantMetrics> = {};
  const perVariantStats: Record<string, DetailedVariantStats> = {};
  let bestTreatmentId: string | null = null;
  let bestLift = -Infinity;
  let overallPValue = 1;

  // Control metrics
  const controlRate = controlData.conversions / controlData.samplesCollected;
  const controlSE = Math.sqrt((controlRate * (1 - controlRate)) / controlData.samplesCollected);

  variantMetrics[experiment.control.id] = {
    sampleSize: controlData.samplesCollected,
    primaryMetricValue: controlRate,
    standardDeviation: Math.sqrt(controlRate * (1 - controlRate)),
    confidenceInterval: wilsonConfidenceInterval(
      controlData.conversions,
      controlData.samplesCollected,
      0.95
    ),
  };

  perVariantStats[experiment.control.id] = {
    n: controlData.samplesCollected,
    mean: controlRate,
    standardError: controlSE,
    ci95: wilsonConfidenceInterval(controlData.conversions, controlData.samplesCollected, 0.95),
    ci99: wilsonConfidenceInterval(controlData.conversions, controlData.samplesCollected, 0.99),
  };

  // Treatment metrics
  for (const treatment of experiment.treatments) {
    const treatmentData = variantData[treatment.id];
    if (!treatmentData) continue;

    const treatmentRate = treatmentData.conversions / treatmentData.samplesCollected;
    const treatmentSE = Math.sqrt(
      (treatmentRate * (1 - treatmentRate)) / treatmentData.samplesCollected
    );

    // Two-proportion z-test
    const testResult = twoProportionZTest(
      controlData.conversions,
      controlData.samplesCollected,
      treatmentData.conversions,
      treatmentData.samplesCollected
    );

    const lift = controlRate > 0 ? ((treatmentRate - controlRate) / controlRate) * 100 : 0;

    if (lift > bestLift) {
      bestLift = lift;
      bestTreatmentId = treatment.id;
      overallPValue = testResult.pValue;
    }

    variantMetrics[treatment.id] = {
      sampleSize: treatmentData.samplesCollected,
      primaryMetricValue: treatmentRate,
      standardDeviation: Math.sqrt(treatmentRate * (1 - treatmentRate)),
      confidenceInterval: wilsonConfidenceInterval(
        treatmentData.conversions,
        treatmentData.samplesCollected,
        0.95
      ),
    };

    perVariantStats[treatment.id] = {
      n: treatmentData.samplesCollected,
      mean: treatmentRate,
      standardError: treatmentSE,
      ci95: wilsonConfidenceInterval(
        treatmentData.conversions,
        treatmentData.samplesCollected,
        0.95
      ),
      ci99: wilsonConfidenceInterval(
        treatmentData.conversions,
        treatmentData.samplesCollected,
        0.99
      ),
    };
  }

  const isSignificant = overallPValue < 1 - experiment.significanceThreshold;
  const winningVariant = isSignificant && bestLift > 0 ? bestTreatmentId : null;

  // Calculate achieved power
  const achievedPower = calculateAchievedPower(
    controlRate,
    bestLift,
    controlData.samplesCollected,
    experiment.significanceThreshold
  );

  const results: ExperimentResults = {
    isSignificant,
    winningVariant,
    confidenceLevel: 1 - overallPValue,
    liftPercentage: bestLift,
    pValue: overallPValue,
    variantMetrics,
    recommendation: generateRecommendation(isSignificant, bestLift, winningVariant),
    insights: generateInsights(experiment, variantMetrics, isSignificant),
  };

  const statisticalDetails: StatisticalDetails = {
    testType: "two_proportion_z",
    testStatistic: approximateZFromP(overallPValue),
    criticalValue: approximateZScore(1 - (1 - experiment.significanceThreshold) / 2),
    achievedPower,
    sampleSizeMet: controlData.samplesCollected >= experiment.targetSampleSize,
    perVariant: perVariantStats,
  };

  const learnings = extractLearnings(experiment, results);
  const recommendations = generateNextSteps(experiment, results);

  return { results, statisticalDetails, learnings, recommendations };
}

// ---------------------------------------------------------------------------
// Statistical tests
// ---------------------------------------------------------------------------

/** Two-proportion z-test result. */
interface ZTestResult {
  zScore: number;
  pValue: number;
  isSignificant: boolean;
}

/**
 * Performs a two-proportion z-test (two-tailed).
 */
function twoProportionZTest(
  controlConversions: number,
  controlN: number,
  treatmentConversions: number,
  treatmentN: number
): ZTestResult {
  const p1 = controlConversions / controlN;
  const p2 = treatmentConversions / treatmentN;
  const pPool = (controlConversions + treatmentConversions) / (controlN + treatmentN);

  const se = Math.sqrt(pPool * (1 - pPool) * (1 / controlN + 1 / treatmentN));
  const z = se === 0 ? 0 : (p2 - p1) / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return { zScore: z, pValue, isSignificant: pValue < 0.05 };
}

/**
 * Wilson score confidence interval for a proportion.
 * More accurate than the normal approximation for small samples.
 */
function wilsonConfidenceInterval(
  successes: number,
  n: number,
  confidenceLevel: number
): [number, number] {
  if (n === 0) return [0, 0];

  const z = approximateZScore(1 - (1 - confidenceLevel) / 2);
  const pHat = successes / n;
  const denominator = 1 + (z * z) / n;

  const center = (pHat + (z * z) / (2 * n)) / denominator;
  const margin = (z / denominator) * Math.sqrt((pHat * (1 - pHat)) / n + (z * z) / (4 * n * n));

  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/**
 * Calculates achieved statistical power.
 */
function calculateAchievedPower(
  controlRate: number,
  liftPercent: number,
  sampleSize: number,
  significanceLevel: number
): number {
  const alpha = 1 - significanceLevel;
  const zAlpha = approximateZScore(1 - alpha / 2);

  const p1 = controlRate;
  const p2 = controlRate * (1 + liftPercent / 100);
  const se = Math.sqrt((p1 * (1 - p1)) / sampleSize + (p2 * (1 - p2)) / sampleSize);

  if (se === 0) return 0;

  const zBeta = (Math.abs(p2 - p1) - zAlpha * se) / se;
  return normalCDF(zBeta);
}

// ---------------------------------------------------------------------------
// Interpretation and recommendations
// ---------------------------------------------------------------------------

/**
 * Generates a human-readable recommendation based on results.
 */
function generateRecommendation(
  isSignificant: boolean,
  liftPercent: number,
  winningVariant: string | null
): string {
  if (!isSignificant) {
    if (Math.abs(liftPercent) < 2) {
      return "No meaningful difference detected. Consider testing a bolder variation or increasing sample size.";
    }
    return "Results trending positive but not statistically significant. Consider extending the experiment or increasing traffic.";
  }

  if (winningVariant && liftPercent > 0) {
    if (liftPercent > 20) {
      return `Strong winner found (+${liftPercent.toFixed(1)}% lift). Implement the winning variant immediately and explore similar variations.`;
    }
    if (liftPercent > 5) {
      return `Clear winner (+${liftPercent.toFixed(1)}% lift). Implement the winning variant and design a follow-up experiment to compound gains.`;
    }
    return `Modest improvement (+${liftPercent.toFixed(1)}% lift). Implement if low effort, otherwise test a more impactful variation.`;
  }

  return "Control performed better. Revert to control and investigate why the treatment underperformed.";
}

/**
 * Generates key insights from the experiment.
 */
function generateInsights(
  experiment: GrowthExperiment,
  variantMetrics: Record<string, VariantMetrics>,
  isSignificant: boolean
): string[] {
  const insights: string[] = [];

  const controlMetric = variantMetrics[experiment.control.id];
  if (controlMetric) {
    insights.push(
      `Baseline ${experiment.primaryMetric}: ${(controlMetric.primaryMetricValue * 100).toFixed(2)}%`
    );
  }

  if (isSignificant) {
    insights.push("Results are statistically significant — safe to act on.");
  } else {
    insights.push(
      "Results are not statistically significant — more data needed for confident decisions."
    );
  }

  // Check if any variant had notably different performance
  const rates = Object.values(variantMetrics).map((v) => v.primaryMetricValue);
  const maxRate = Math.max(...rates);
  const minRate = Math.min(...rates);
  if (maxRate - minRate > 0.05) {
    insights.push(
      `Large variance between variants (${((maxRate - minRate) * 100).toFixed(1)}pp spread) suggests the variable being tested has meaningful impact.`
    );
  }

  return insights;
}

/**
 * Extracts structured learnings from experiment results.
 */
function extractLearnings(
  experiment: GrowthExperiment,
  results: ExperimentResults
): ExtractedLearning[] {
  const learnings: ExtractedLearning[] = [];

  if (results.isSignificant && results.winningVariant) {
    learnings.push({
      category: "what_works",
      insight: `${experiment.type} experiment showed ${results.liftPercentage.toFixed(1)}% improvement`,
      confidence: results.confidenceLevel,
      evidence: `p-value: ${results.pValue.toFixed(4)}, sample size: ${results.variantMetrics[results.winningVariant]?.sampleSize ?? 0}`,
      actionItem: "Apply winning variant to production",
    });
  } else if (!results.isSignificant) {
    learnings.push({
      category: "what_doesnt",
      insight: `${experiment.type} variation did not produce significant results`,
      confidence: 0.5,
      evidence: `p-value: ${results.pValue.toFixed(4)}, lift: ${results.liftPercentage.toFixed(1)}%`,
      actionItem: "Test a more differentiated variation or different variable",
    });
  }

  // Channel insight
  if (experiment.channels.length > 0) {
    learnings.push({
      category: "channel_insight",
      insight: `Experiment ran on: ${experiment.channels.join(", ")}`,
      confidence: 0.7,
      evidence: `Duration: ${experiment.durationDays} days`,
    });
  }

  return learnings;
}

/**
 * Generates next-step recommendations.
 */
function generateNextSteps(experiment: GrowthExperiment, results: ExperimentResults): string[] {
  const steps: string[] = [];

  if (results.isSignificant && results.liftPercentage > 0) {
    steps.push("Implement winning variant in production");
    steps.push("Design follow-up experiment to compound gains");
    steps.push("Test winning approach on other channels");
  } else if (!results.isSignificant) {
    steps.push("Consider increasing sample size or experiment duration");
    steps.push("Test a more differentiated variation");
    steps.push("Verify tracking is correctly capturing the metric");
  } else {
    steps.push("Revert to control variant");
    steps.push("Investigate why treatment underperformed");
    steps.push("Consider testing the opposite direction");
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

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

function approximateZFromP(pValue: number): number {
  return approximateZScore(1 - pValue / 2);
}
