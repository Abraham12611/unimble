/**
 * Growth Operator — Unit Tests
 *
 * Tests for:
 * - GrowthOperator class (core, lifecycle, experiment management)
 * - Experiment design (sample size, validation, metrics)
 * - Experiment execution (allocation, progress, early stopping)
 * - Experiment analysis (z-test, confidence intervals, learnings)
 * - SEO optimization (request builders, parsers, recommendations)
 *
 * Phase 8.3 — Growth Operator Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GrowthOperator, DEFAULT_GROWTH_SETTINGS } from "../growthOperator";
import type { GrowthOperatorSettings } from "../growthOperator";
import {
  calculateSampleSize,
  estimateDuration,
  validateExperimentDesign,
  getSuggestedMetrics,
  buildHypothesisPromptContext,
} from "./experimentDesign";
import type { ExperimentDesignOutput } from "./experimentDesign";
import {
  validateTrafficAllocation,
  createEqualAllocation,
  initializeExecutionState,
  updateVariantProgress,
  isDataCollectionComplete,
  evaluateEarlyStopping,
} from "./experimentExecution";
import { analyzeExperiment } from "./experimentAnalysis";
import {
  buildKeywordOverviewRequest,
  buildKeywordSuggestionsRequest,
  buildRankedKeywordsRequest,
  buildLLMMentionsRequest,
  generateOptimizations,
  buildPerformanceSummary,
  parseKeywordOverviewResponse,
} from "./seoOptimization";
import type { GrowthExperiment } from "../growthOperator";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestConfig(): Partial<GrowthOperatorSettings> {
  return { ...DEFAULT_GROWTH_SETTINGS };
}

function createTestExperiment(): GrowthExperiment {
  return {
    id: "exp_test_001",
    name: "Test Headline Experiment",
    type: "ab_content",
    status: "hypothesis",
    hypothesis: "Shorter headlines will increase CTR by 10%",
    independentVariable: "headline_length",
    dependentVariable: "click_through_rate",
    primaryMetric: "click_through_rate",
    secondaryMetrics: ["time_on_page", "bounce_rate"],
    control: { id: "ctrl_1", name: "Control", description: "Original headline", config: {} },
    treatments: [
      { id: "treat_1", name: "Short Headline", description: "Shorter version", config: {} },
    ],
    targetSampleSize: 1000,
    currentSampleSizes: {},
    minimumDetectableEffect: 10,
    significanceThreshold: 0.95,
    durationDays: 14,
    channels: ["blog"],
    priorityScore: 0.7,
    estimatedImpact: "medium",
    estimatedEffort: "low",
  };
}

// ---------------------------------------------------------------------------
// GrowthOperator class tests
// ---------------------------------------------------------------------------

describe("GrowthOperator", () => {
  let operator: GrowthOperator;

  beforeEach(() => {
    operator = new GrowthOperator(createTestConfig());
  });

  describe("core", () => {
    it("should return correct operator type", () => {
      expect(operator.getType()).toBe("growth");
    });

    it("should return required integrations", () => {
      const integrations = operator.getRequiredIntegrations();
      expect(integrations).toContain("google_analytics");
      expect(integrations).toContain("google_search_console");
    });

    it("should validate valid config", () => {
      const result = operator.validateConfig();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid config", () => {
      const badOperator = new GrowthOperator({
        ...DEFAULT_GROWTH_SETTINGS,
        maxConcurrentExperiments: 0,
        availableChannels: [],
      });
      const result = badOperator.validateConfig();
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should return default workflows", () => {
      const workflows = operator.getDefaultWorkflows();
      expect(workflows.length).toBe(5);
      expect(workflows.map((w) => w.name)).toContain("Experiment Design");
      expect(workflows.map((w) => w.name)).toContain("SEO/AEO Optimization");
      expect(workflows.map((w) => w.name)).toContain("Weekly Growth Report");
    });
  });

  describe("experiment management", () => {
    it("should create an experiment", () => {
      const exp = operator.createExperiment({
        name: "Test",
        type: "ab_content",
        hypothesis: "Test hypothesis",
        independentVariable: "headline",
        dependentVariable: "ctr",
        primaryMetric: "click_through_rate",
        secondaryMetrics: [],
        control: { id: "c1", name: "Control", description: "Original", config: {} },
        treatments: [{ id: "t1", name: "Treatment", description: "New", config: {} }],
        targetSampleSize: 500,
        minimumDetectableEffect: 10,
        significanceThreshold: 0.95,
        durationDays: 14,
        channels: ["blog"],
        estimatedImpact: "medium",
        estimatedEffort: "low",
      });

      expect(exp.id).toMatch(/^exp_/);
      expect(exp.status).toBe("hypothesis");
      expect(exp.priorityScore).toBeGreaterThan(0);
    });

    it("should enforce max concurrent experiments", () => {
      const op = new GrowthOperator({ maxConcurrentExperiments: 1 });

      op.createExperiment({
        name: "First",
        type: "ab_content",
        hypothesis: "H1",
        independentVariable: "x",
        dependentVariable: "y",
        primaryMetric: "ctr",
        secondaryMetrics: [],
        control: { id: "c1", name: "Control", description: "Ctrl", config: {} },
        treatments: [{ id: "t1", name: "T1", description: "Treat", config: {} }],
        targetSampleSize: 100,
        minimumDetectableEffect: 5,
        significanceThreshold: 0.95,
        durationDays: 7,
        channels: ["blog"],
        estimatedImpact: "low",
        estimatedEffort: "low",
      });

      expect(() =>
        op.createExperiment({
          name: "Second",
          type: "ab_content",
          hypothesis: "H2",
          independentVariable: "x",
          dependentVariable: "y",
          primaryMetric: "ctr",
          secondaryMetrics: [],
          control: { id: "c2", name: "Control", description: "Ctrl", config: {} },
          treatments: [{ id: "t2", name: "T2", description: "Treat", config: {} }],
          targetSampleSize: 100,
          minimumDetectableEffect: 5,
          significanceThreshold: 0.95,
          durationDays: 7,
          channels: ["blog"],
          estimatedImpact: "low",
          estimatedEffort: "low",
        })
      ).toThrow(/Maximum concurrent experiments/);
    });

    it("should transition experiment status correctly", () => {
      const exp = operator.createExperiment({
        name: "Transition Test",
        type: "ab_content",
        hypothesis: "H",
        independentVariable: "x",
        dependentVariable: "y",
        primaryMetric: "ctr",
        secondaryMetrics: [],
        control: { id: "c1", name: "Control", description: "Ctrl", config: {} },
        treatments: [{ id: "t1", name: "T1", description: "Treat", config: {} }],
        targetSampleSize: 100,
        minimumDetectableEffect: 5,
        significanceThreshold: 0.95,
        durationDays: 7,
        channels: ["blog"],
        estimatedImpact: "low",
        estimatedEffort: "low",
      });

      const designed = operator.transitionExperiment(exp.id, "designing");
      expect(designed.status).toBe("designing");

      const approved = operator.transitionExperiment(exp.id, "awaiting_approval");
      expect(approved.status).toBe("awaiting_approval");
    });

    it("should reject invalid transitions", () => {
      const exp = operator.createExperiment({
        name: "Invalid Transition",
        type: "ab_content",
        hypothesis: "H",
        independentVariable: "x",
        dependentVariable: "y",
        primaryMetric: "ctr",
        secondaryMetrics: [],
        control: { id: "c1", name: "Control", description: "Ctrl", config: {} },
        treatments: [{ id: "t1", name: "T1", description: "Treat", config: {} }],
        targetSampleSize: 100,
        minimumDetectableEffect: 5,
        significanceThreshold: 0.95,
        durationDays: 7,
        channels: ["blog"],
        estimatedImpact: "low",
        estimatedEffort: "low",
      });

      expect(() => operator.transitionExperiment(exp.id, "completed")).toThrow(
        /Invalid transition/
      );
    });
  });

  describe("SEO management", () => {
    it("should add and retrieve SEO targets", () => {
      operator.addSeoTarget({
        keyword: "test keyword",
        currentPosition: 15,
        targetPosition: 5,
        searchVolume: 1000,
        difficulty: 45,
        intent: "informational",
      });

      const targets = operator.getSeoTargets();
      expect(targets).toHaveLength(1);
      expect(targets[0].keyword).toBe("test keyword");
    });

    it("should update existing SEO target", () => {
      operator.addSeoTarget({
        keyword: "test",
        currentPosition: 15,
        targetPosition: 5,
        searchVolume: 1000,
        difficulty: 45,
        intent: "informational",
      });

      operator.addSeoTarget({
        keyword: "test",
        currentPosition: 10,
        targetPosition: 3,
        searchVolume: 1200,
        difficulty: 45,
        intent: "informational",
      });

      const targets = operator.getSeoTargets();
      expect(targets).toHaveLength(1);
      expect(targets[0].currentPosition).toBe(10);
    });

    it("should remove SEO target", () => {
      operator.addSeoTarget({
        keyword: "remove-me",
        currentPosition: 20,
        targetPosition: 10,
        searchVolume: 500,
        difficulty: 30,
        intent: "informational",
      });

      operator.removeSeoTarget("remove-me");
      expect(operator.getSeoTargets()).toHaveLength(0);
    });
  });

  describe("statistical helpers", () => {
    it("should calculate sample size", () => {
      const n = operator.calculateRequiredSampleSize(0.05, 20, 0.95, 0.8);
      expect(n).toBeGreaterThan(100);
      expect(n).toBeLessThan(10000);
    });

    it("should perform z-test correctly", () => {
      // Clear winner: 5% vs 8% conversion
      const result = operator.performZTest(50, 1000, 80, 1000);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.isSignificant).toBe(true);
      expect(result.zScore).toBeGreaterThan(0);
    });

    it("should detect non-significant results", () => {
      // Very close: 5% vs 5.1%
      const result = operator.performZTest(50, 1000, 51, 1000);
      expect(result.isSignificant).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Experiment Design tests
// ---------------------------------------------------------------------------

describe("Experiment Design", () => {
  it("should calculate sample size for given parameters", () => {
    const n = calculateSampleSize(0.05, 20, 0.95, 0.8);
    expect(n).toBeGreaterThan(0);
    expect(Number.isFinite(n)).toBe(true);
  });

  it("should estimate duration based on traffic", () => {
    const days = estimateDuration(1000, 200, 2);
    expect(days).toBe(10); // 2000 total / 200 per day = 10 days
  });

  it("should cap duration at 90 days", () => {
    const days = estimateDuration(10000, 10, 2);
    expect(days).toBeLessThanOrEqual(90);
  });

  it("should enforce minimum 7 days", () => {
    const days = estimateDuration(100, 10000, 2);
    expect(days).toBeGreaterThanOrEqual(7);
  });

  it("should validate experiment design", () => {
    const result = validateExperimentDesign(
      {
        name: "Test",
        control: { id: "c1", name: "Control", description: "Ctrl", config: {} },
        treatments: [{ id: "t1", name: "T1", description: "Treat", config: {} }],
        requiredSampleSize: 500,
        recommendedDurationDays: 14,
        independentVariable: "headline",
        dependentVariable: "ctr",
        channels: ["blog"],
      },
      DEFAULT_GROWTH_SETTINGS
    );
    expect(result.valid).toBe(true);
  });

  it("should reject design without control", () => {
    const result = validateExperimentDesign(
      {
        name: "Test",
        control: undefined as unknown as ExperimentDesignOutput["control"],
        treatments: [{ id: "t1", name: "T1", description: "Treat", config: {} }],
        requiredSampleSize: 500,
        recommendedDurationDays: 14,
        independentVariable: "headline",
        dependentVariable: "ctr",
        channels: ["blog"],
      },
      DEFAULT_GROWTH_SETTINGS
    );
    expect(result.valid).toBe(false);
  });

  it("should return suggested metrics for experiment types", () => {
    const metrics = getSuggestedMetrics("ab_content");
    expect(metrics.primary).toBe("click_through_rate");
    expect(metrics.secondary).toContain("time_on_page");
  });

  it("should build hypothesis prompt context", () => {
    const context = buildHypothesisPromptContext({
      currentMetrics: { ctr: 0.05, bounce_rate: 0.6 },
      competitorInsights: ["Competitor A uses shorter headlines"],
      channels: ["blog", "social"],
    });
    expect(context).toContain("ctr: 0.05");
    expect(context).toContain("Competitor A");
    expect(context).toContain("blog, social");
  });
});

// ---------------------------------------------------------------------------
// Experiment Execution tests
// ---------------------------------------------------------------------------

describe("Experiment Execution", () => {
  it("should validate traffic allocation summing to 1", () => {
    const result = validateTrafficAllocation({ ctrl: 0.5, treat: 0.5 });
    expect(result.valid).toBe(true);
  });

  it("should reject allocation not summing to 1", () => {
    const result = validateTrafficAllocation({ ctrl: 0.5, treat: 0.3 });
    expect(result.valid).toBe(false);
  });

  it("should create equal allocation", () => {
    const allocation = createEqualAllocation(
      { id: "c1", name: "Control", description: "", config: {} },
      [
        { id: "t1", name: "T1", description: "", config: {} },
        { id: "t2", name: "T2", description: "", config: {} },
      ]
    );
    expect(Object.keys(allocation)).toHaveLength(3);
    const total = Object.values(allocation).reduce((s, v) => s + v, 0);
    expect(Math.abs(total - 1.0)).toBeLessThan(0.001);
  });

  it("should initialize execution state", () => {
    const experiment = createTestExperiment();
    const state = initializeExecutionState(experiment);
    expect(state.experimentId).toBe(experiment.id);
    expect(state.status).toBe("initializing");
    expect(Object.keys(state.variantProgress)).toHaveLength(2);
  });

  it("should update variant progress", () => {
    const experiment = createTestExperiment();
    let state = initializeExecutionState(experiment);
    state = updateVariantProgress(state, "ctrl_1", 100, 5);
    expect(state.variantProgress["ctrl_1"].samplesCollected).toBe(100);
    expect(state.variantProgress["ctrl_1"].conversions).toBe(5);
  });

  it("should detect data collection completion", () => {
    const experiment = createTestExperiment();
    experiment.targetSampleSize = 10;
    let state = initializeExecutionState(experiment);
    expect(isDataCollectionComplete(state)).toBe(false);

    state = updateVariantProgress(state, "ctrl_1", 10, 1);
    state = updateVariantProgress(state, "treat_1", 10, 2);
    expect(isDataCollectionComplete(state)).toBe(true);
  });

  it("should not trigger early stopping with insufficient samples", () => {
    const experiment = createTestExperiment();
    let state = initializeExecutionState(experiment);
    state = updateVariantProgress(state, "ctrl_1", 5, 1);
    state = updateVariantProgress(state, "treat_1", 5, 2);

    const decision = evaluateEarlyStopping(state, 100);
    expect(decision.shouldStop).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Experiment Analysis tests
// ---------------------------------------------------------------------------

describe("Experiment Analysis", () => {
  it("should analyze a significant experiment", () => {
    const experiment = createTestExperiment();
    experiment.targetSampleSize = 1000;

    const result = analyzeExperiment({
      experiment,
      variantData: {
        ctrl_1: {
          variantId: "ctrl_1",
          samplesCollected: 1000,
          targetSamples: 1000,
          completionPercent: 100,
          metricValues: [],
          conversions: 50, // 5% conversion
        },
        treat_1: {
          variantId: "treat_1",
          samplesCollected: 1000,
          targetSamples: 1000,
          completionPercent: 100,
          metricValues: [],
          conversions: 80, // 8% conversion
        },
      },
    });

    expect(result.results.isSignificant).toBe(true);
    expect(result.results.winningVariant).toBe("treat_1");
    expect(result.results.liftPercentage).toBeGreaterThan(0);
    expect(result.results.pValue).toBeLessThan(0.05);
    expect(result.learnings.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("should analyze a non-significant experiment", () => {
    const experiment = createTestExperiment();

    const result = analyzeExperiment({
      experiment,
      variantData: {
        ctrl_1: {
          variantId: "ctrl_1",
          samplesCollected: 100,
          targetSamples: 1000,
          completionPercent: 10,
          metricValues: [],
          conversions: 5,
        },
        treat_1: {
          variantId: "treat_1",
          samplesCollected: 100,
          targetSamples: 1000,
          completionPercent: 10,
          metricValues: [],
          conversions: 6,
        },
      },
    });

    expect(result.results.isSignificant).toBe(false);
    expect(result.results.winningVariant).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SEO Optimization tests
// ---------------------------------------------------------------------------

describe("SEO Optimization", () => {
  it("should build keyword overview request", () => {
    const req = buildKeywordOverviewRequest(["test keyword", "another keyword"]);
    expect(req.endpoint).toContain("keyword_overview");
    expect(req.method).toBe("POST");
    expect(req.body).toBeDefined();
  });

  it("should build keyword suggestions request", () => {
    const req = buildKeywordSuggestionsRequest("ai tools");
    expect(req.endpoint).toContain("keyword_suggestions");
  });

  it("should build ranked keywords request", () => {
    const req = buildRankedKeywordsRequest("example.com");
    expect(req.endpoint).toContain("ranked_keywords");
  });

  it("should build LLM mentions request", () => {
    const req = buildLLMMentionsRequest(["example.com"], "google");
    expect(req.endpoint).toContain("llm_mentions");
  });

  it("should generate content gap optimization", () => {
    const optimizations = generateOptimizations(
      [
        {
          keyword: "new keyword",
          currentPosition: null,
          targetPosition: 5,
          searchVolume: 2000,
          difficulty: 40,
          intent: "informational",
        },
      ],
      [
        {
          keyword: "new keyword",
          position: null,
          previousPosition: null,
          change: 0,
          serpFeatures: [],
          estimatedTraffic: 0,
          checkedAt: Date.now(),
        },
      ]
    );

    expect(optimizations.length).toBeGreaterThan(0);
    expect(optimizations[0].type).toBe("content_gap");
  });

  it("should generate on-page optimization for declining keywords", () => {
    const optimizations = generateOptimizations(
      [
        {
          keyword: "declining keyword",
          currentPosition: 15,
          targetPosition: 5,
          searchVolume: 1000,
          difficulty: 30,
          intent: "informational",
        },
      ],
      [
        {
          keyword: "declining keyword",
          position: 15,
          previousPosition: 8,
          change: -7,
          serpFeatures: [],
          estimatedTraffic: 50,
          checkedAt: Date.now(),
        },
      ]
    );

    const declining = optimizations.find((o) => o.recommendation.includes("declining"));
    expect(declining).toBeDefined();
    expect(declining!.priority).toBe(1);
  });

  it("should build performance summary", () => {
    const summary = buildPerformanceSummary(
      [
        {
          keyword: "test",
          position: 5,
          previousPosition: 8,
          change: 3,
          serpFeatures: [],
          estimatedTraffic: 200,
          checkedAt: Date.now(),
        },
        {
          keyword: "test2",
          position: 12,
          previousPosition: 10,
          change: -2,
          serpFeatures: [],
          estimatedTraffic: 100,
          checkedAt: Date.now(),
        },
      ],
      [],
      { start: "2026-05-12", end: "2026-05-19" }
    );

    expect(summary.keywordsTracked).toBe(2);
    expect(summary.keywordsTop10).toBe(1);
    expect(summary.estimatedTraffic).toBe(300);
  });

  it("should parse empty DataForSEO response gracefully", () => {
    const results = parseKeywordOverviewResponse({});
    expect(results).toHaveLength(0);
  });
});
