/**
 * Growth Operator — Autonomous Growth Experimentation
 *
 * Self-contained operator for growth experiments, A/B testing, campaign
 * execution, and SEO/AEO optimization. Provides:
 * - Experiment types (A/B content, distribution, messaging, timing)
 * - Hypothesis generation and experiment design workflows
 * - Experiment execution with data collection
 * - Statistical analysis and significance testing
 * - SEO/AEO keyword research and optimization
 * - Weekly growth reporting with actionable insights
 *
 * Phase 8.3.1 — Growth Operator Core
 */

import { operatorRegistry } from "./registry";
import type { OperatorType, OperatorTemplate } from "./types";
import type { WorkflowDefinition } from "../engine/types";

// ---------------------------------------------------------------------------
// Growth-specific types
// ---------------------------------------------------------------------------

/** Types of growth experiments the operator can run. */
export type ExperimentType =
  | "ab_content"
  | "distribution_channel"
  | "messaging"
  | "timing"
  | "audience_targeting"
  | "cta_optimization"
  | "seo_test";

/** Experiment lifecycle status. */
export type ExperimentStatus =
  | "hypothesis"
  | "designing"
  | "awaiting_approval"
  | "running"
  | "collecting_data"
  | "analyzing"
  | "completed"
  | "failed"
  | "canceled";

/** A growth experiment definition. */
export interface GrowthExperiment {
  id: string;
  name: string;
  type: ExperimentType;
  status: ExperimentStatus;
  hypothesis: string;
  independentVariable: string;
  dependentVariable: string;
  primaryMetric: string;
  secondaryMetrics: string[];
  control: ExperimentVariant;
  treatments: ExperimentVariant[];
  targetSampleSize: number;
  currentSampleSizes: Record<string, number>;
  minimumDetectableEffect: number;
  significanceThreshold: number;
  durationDays: number;
  startedAt?: string;
  endedAt?: string;
  channels: string[];
  priorityScore: number;
  estimatedImpact: "low" | "medium" | "high";
  estimatedEffort: "low" | "medium" | "high";
  results?: ExperimentResults;
  learnings?: string[];
}

/** A variant in an experiment. */
export interface ExperimentVariant {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
}

/** Results of a completed experiment. */
export interface ExperimentResults {
  isSignificant: boolean;
  winningVariant: string | null;
  confidenceLevel: number;
  liftPercentage: number;
  pValue: number;
  variantMetrics: Record<string, VariantMetrics>;
  recommendation: string;
  insights: string[];
}

/** Metrics for a single variant. */
export interface VariantMetrics {
  sampleSize: number;
  primaryMetricValue: number;
  standardDeviation: number;
  confidenceInterval: [number, number];
}

/** SEO/AEO optimization target. */
export interface SEOTarget {
  keyword: string;
  currentPosition: number | null;
  targetPosition: number;
  searchVolume: number;
  difficulty: number;
  intent: "informational" | "navigational" | "transactional" | "commercial";
  contentUrl?: string;
  aeoVisibility?: number;
}

/** Weekly growth report data. */
export interface GrowthReport {
  period: { start: string; end: string };
  traffic: {
    totalVisitors: number;
    changePercent: number;
    topSources: Array<{ source: string; visitors: number; change: number }>;
  };
  experiments: {
    active: number;
    completed: number;
    winRate: number;
    topLearning: string;
  };
  seo: {
    keywordsTracked: number;
    avgPosition: number;
    positionChange: number;
    topMovers: Array<{ keyword: string; from: number; to: number }>;
  };
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Growth Operator Configuration (operator-specific settings)
// ---------------------------------------------------------------------------

/** Growth operator-specific settings. */
export interface GrowthOperatorSettings {
  /** Maximum concurrent experiments */
  maxConcurrentExperiments: number;
  /** Default experiment duration in days */
  defaultExperimentDurationDays: number;
  /** Default significance threshold */
  defaultSignificanceThreshold: number;
  /** Default minimum detectable effect (%) */
  defaultMinDetectableEffect: number;
  /** SEO targets to track */
  seoTargets: SEOTarget[];
  /** Channels available for experiments */
  availableChannels: string[];
  /** Weekly report day (0=Sun, 1=Mon, ...) */
  reportDay: number;
  /** Auto-approve low-risk experiments */
  autoApproveLowRisk: boolean;
  /** ICE scoring weights */
  iceWeights: { impact: number; confidence: number; ease: number };
}

/** Default settings for the Growth Operator. */
export const DEFAULT_GROWTH_SETTINGS: GrowthOperatorSettings = {
  maxConcurrentExperiments: 3,
  defaultExperimentDurationDays: 14,
  defaultSignificanceThreshold: 0.95,
  defaultMinDetectableEffect: 5,
  seoTargets: [],
  availableChannels: ["blog", "social", "email", "paid", "organic"],
  reportDay: 1, // Monday
  autoApproveLowRisk: false,
  iceWeights: { impact: 0.4, confidence: 0.3, ease: 0.3 },
};

// ---------------------------------------------------------------------------
// Growth Operator Class
// ---------------------------------------------------------------------------

/**
 * GrowthOperator — Autonomous growth experimentation and SEO optimization.
 *
 * Manages the full lifecycle of growth experiments:
 * 1. Hypothesis generation (from data, trends, competitor analysis)
 * 2. Experiment design (variants, metrics, sample sizes)
 * 3. Execution (content distribution, A/B testing)
 * 4. Analysis (statistical significance, lift calculation)
 * 5. Learning extraction and application
 *
 * Also handles ongoing SEO/AEO optimization:
 * - Keyword research and tracking
 * - Content optimization recommendations
 * - AI search visibility monitoring
 * - Ranking change alerts
 */
export class GrowthOperator {
  private experiments: Map<string, GrowthExperiment> = new Map();
  private seoTargets: SEOTarget[] = [];
  private settings: GrowthOperatorSettings;
  private metrics: { totalExecutions: number; custom: Record<string, number> };

  constructor(settings?: Partial<GrowthOperatorSettings>) {
    this.settings = { ...DEFAULT_GROWTH_SETTINGS, ...settings };
    this.seoTargets = [...(this.settings.seoTargets ?? [])];
    this.metrics = { totalExecutions: 0, custom: {} };
  }

  // -------------------------------------------------------------------------
  // Core methods
  // -------------------------------------------------------------------------

  getType(): OperatorType {
    return "growth";
  }

  getRequiredIntegrations(): string[] {
    return ["google_analytics", "google_search_console"];
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.settings.maxConcurrentExperiments < 1) {
      errors.push("maxConcurrentExperiments must be at least 1");
    }
    if (this.settings.defaultExperimentDurationDays < 1) {
      errors.push("defaultExperimentDurationDays must be at least 1");
    }
    if (
      this.settings.defaultSignificanceThreshold < 0.5 ||
      this.settings.defaultSignificanceThreshold > 0.99
    ) {
      errors.push("defaultSignificanceThreshold must be between 0.5 and 0.99");
    }
    if (this.settings.availableChannels.length === 0) {
      errors.push("At least one channel must be configured");
    }

    return { valid: errors.length === 0, errors };
  }

  getDefaultWorkflows(): WorkflowDefinition[] {
    return [
      this.buildExperimentDesignWorkflow(),
      this.buildExperimentExecutionWorkflow(),
      this.buildExperimentAnalysisWorkflow(),
      this.buildSeoOptimizationWorkflow(),
      this.buildWeeklyReportWorkflow(),
    ];
  }

  // -------------------------------------------------------------------------
  // Experiment management
  // -------------------------------------------------------------------------

  /** Creates a new experiment from a hypothesis. */
  createExperiment(
    params: Omit<GrowthExperiment, "id" | "status" | "currentSampleSizes" | "priorityScore">
  ): GrowthExperiment {
    const activeCount = this.getActiveExperimentCount();

    if (activeCount >= this.settings.maxConcurrentExperiments) {
      throw new Error(
        `Maximum concurrent experiments (${this.settings.maxConcurrentExperiments}) reached`
      );
    }

    const experiment: GrowthExperiment = {
      ...params,
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: "hypothesis",
      currentSampleSizes: {},
      priorityScore: this.calculatePriorityScore(params),
    };

    this.experiments.set(experiment.id, experiment);
    this.metrics.custom["experiments_created"] =
      (this.metrics.custom["experiments_created"] ?? 0) + 1;
    return experiment;
  }

  /** Transitions an experiment to a new status. */
  transitionExperiment(experimentId: string, newStatus: ExperimentStatus): GrowthExperiment {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    // Validate transition
    const validTransitions: Record<ExperimentStatus, ExperimentStatus[]> = {
      hypothesis: ["designing", "canceled"],
      designing: ["awaiting_approval", "canceled"],
      awaiting_approval: ["running", "designing", "canceled"],
      running: ["collecting_data", "failed", "canceled"],
      collecting_data: ["analyzing", "failed", "canceled"],
      analyzing: ["completed", "failed"],
      completed: [],
      failed: ["hypothesis"], // Can retry
      canceled: [],
    };

    if (!validTransitions[experiment.status]?.includes(newStatus)) {
      throw new Error(`Invalid transition: ${experiment.status} → ${newStatus}`);
    }

    experiment.status = newStatus;

    if (newStatus === "running") {
      experiment.startedAt = new Date().toISOString();
    }
    if (newStatus === "completed" || newStatus === "failed") {
      experiment.endedAt = new Date().toISOString();
    }

    this.experiments.set(experimentId, experiment);
    return experiment;
  }

  /** Returns all experiments with a given status. */
  getExperimentsByStatus(status: ExperimentStatus): GrowthExperiment[] {
    return Array.from(this.experiments.values()).filter((e) => e.status === status);
  }

  /** Returns the count of active (non-terminal) experiments. */
  getActiveExperimentCount(): number {
    const terminalStatuses: ExperimentStatus[] = ["completed", "failed", "canceled"];
    return Array.from(this.experiments.values()).filter((e) => !terminalStatuses.includes(e.status))
      .length;
  }

  // -------------------------------------------------------------------------
  // SEO/AEO management
  // -------------------------------------------------------------------------

  /** Adds a keyword to track. */
  addSeoTarget(target: SEOTarget): void {
    const existingIndex = this.seoTargets.findIndex((t) => t.keyword === target.keyword);
    if (existingIndex >= 0) {
      this.seoTargets[existingIndex] = { ...this.seoTargets[existingIndex], ...target };
    } else {
      this.seoTargets.push(target);
    }
    this.metrics.custom["seo_targets_tracked"] =
      (this.metrics.custom["seo_targets_tracked"] ?? 0) + 1;
  }

  /** Removes a keyword from tracking. */
  removeSeoTarget(keyword: string): void {
    this.seoTargets = this.seoTargets.filter((t) => t.keyword !== keyword);
  }

  /** Returns all tracked SEO targets. */
  getSeoTargets(): SEOTarget[] {
    return [...this.seoTargets];
  }

  /** Updates ranking data for a keyword. */
  updateKeywordRanking(keyword: string, newPosition: number): void {
    const target = this.seoTargets.find((t) => t.keyword === keyword);
    if (target) {
      target.currentPosition = newPosition;
    }
  }

  // -------------------------------------------------------------------------
  // Statistical helpers
  // -------------------------------------------------------------------------

  /** Calculates required sample size for an experiment. */
  calculateRequiredSampleSize(
    baselineRate: number,
    minimumDetectableEffect: number,
    significanceLevel = 0.95,
    power = 0.8
  ): number {
    // Using simplified formula for two-proportion z-test
    const alpha = 1 - significanceLevel;
    const zAlpha = this.zScore(1 - alpha / 2);
    const zBeta = this.zScore(power);

    const p1 = baselineRate;
    const p2 = baselineRate * (1 + minimumDetectableEffect / 100);
    const pBar = (p1 + p2) / 2;

    const numerator = Math.pow(
      zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
      2
    );
    const denominator = Math.pow(p2 - p1, 2);

    return Math.ceil(numerator / denominator);
  }

  /** Performs a two-proportion z-test. */
  performZTest(
    controlConversions: number,
    controlSampleSize: number,
    treatmentConversions: number,
    treatmentSampleSize: number
  ): { zScore: number; pValue: number; isSignificant: boolean } {
    const p1 = controlConversions / controlSampleSize;
    const p2 = treatmentConversions / treatmentSampleSize;
    const pPool =
      (controlConversions + treatmentConversions) / (controlSampleSize + treatmentSampleSize);

    const se = Math.sqrt(pPool * (1 - pPool) * (1 / controlSampleSize + 1 / treatmentSampleSize));

    const z = se === 0 ? 0 : (p2 - p1) / se;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    return {
      zScore: z,
      pValue,
      isSignificant: pValue < 1 - this.settings.defaultSignificanceThreshold,
    };
  }

  /** Calculates ICE priority score for an experiment. */
  calculatePriorityScore(
    params: Pick<GrowthExperiment, "estimatedImpact" | "estimatedEffort"> & {
      confidence?: number;
    }
  ): number {
    const impactMap = { low: 0.3, medium: 0.6, high: 0.9 };
    const effortMap = { low: 0.9, medium: 0.6, high: 0.3 }; // Inverted: low effort = high score

    const impact = impactMap[params.estimatedImpact];
    const confidence = params.confidence ?? 0.5;
    const ease = effortMap[params.estimatedEffort];

    return (
      impact * this.settings.iceWeights.impact +
      confidence * this.settings.iceWeights.confidence +
      ease * this.settings.iceWeights.ease
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Approximate z-score for a given probability. */
  private zScore(p: number): number {
    // Rational approximation (Abramowitz & Stegun 26.2.23)
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

  /** Standard normal CDF approximation. */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y =
      1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-absX * absX) / 2);

    return 0.5 * (1.0 + sign * y);
  }

  // -------------------------------------------------------------------------
  // Workflow builders
  // -------------------------------------------------------------------------

  private buildExperimentDesignWorkflow(): WorkflowDefinition {
    return {
      name: "Experiment Design",
      description: "Generates hypotheses, designs experiments with variants and metrics",
      version: 1,
      trigger: { type: "manual", inputSchema: {} },
      steps: [
        {
          id: "generate_hypotheses",
          name: "Generate Hypotheses",
          type: "agent",
          config: {
            prompt:
              "You are a growth strategist. Analyze the provided data and generate testable hypotheses for growth experiments.",
            model: "openrouter/anthropic/claude-sonnet-4",
            tools: ["perplexity_search", "analytics_query"],
          },
        },
        {
          id: "design_experiment",
          name: "Design Experiment",
          type: "agent",
          dependsOn: ["generate_hypotheses"],
          config: {
            prompt:
              "Design a rigorous A/B experiment based on the hypothesis. Define control/treatment variants, primary/secondary metrics, sample size requirements, and duration.",
            model: "openrouter/anthropic/claude-sonnet-4",
            tools: ["sample_size_calculator"],
          },
        },
        {
          id: "approval_gate",
          name: "Approve Experiment",
          type: "approval",
          dependsOn: ["design_experiment"],
          config: {
            approvalType: "experiment_launch",
            timeoutMs: 86400000,
            timeoutAction: "cancel",
          },
        },
      ],
    };
  }

  private buildExperimentExecutionWorkflow(): WorkflowDefinition {
    return {
      name: "Experiment Execution",
      description: "Runs approved experiments, distributes content variants, collects data",
      version: 1,
      trigger: { type: "event", eventType: "experiment.approved", enabled: true },
      steps: [
        {
          id: "setup_variants",
          name: "Setup Variants",
          type: "agent",
          config: {
            prompt:
              "Set up the experiment variants for distribution. Create content variations, configure targeting, and prepare tracking.",
            model: "openrouter/anthropic/claude-sonnet-4",
            tools: ["content_create", "analytics_setup"],
          },
        },
        {
          id: "distribute_content",
          name: "Distribute Content",
          type: "tool",
          dependsOn: ["setup_variants"],
          config: {
            toolName: "content_distribute",
            params: { variants: "{{setup_variants.output.variants}}" },
          },
        },
        {
          id: "collect_data",
          name: "Collect Data",
          type: "wait",
          dependsOn: ["distribute_content"],
          config: {
            durationMs: 604800000, // 7 days default
          },
        },
      ],
    };
  }

  private buildExperimentAnalysisWorkflow(): WorkflowDefinition {
    return {
      name: "Experiment Analysis",
      description: "Analyzes experiment results, calculates significance, extracts learnings",
      version: 1,
      trigger: { type: "event", eventType: "experiment.data_collected", enabled: true },
      steps: [
        {
          id: "gather_metrics",
          name: "Gather Metrics",
          type: "tool",
          config: {
            toolName: "analytics_query",
            params: { experimentId: "{{input.experimentId}}" },
          },
        },
        {
          id: "statistical_analysis",
          name: "Statistical Analysis",
          type: "agent",
          dependsOn: ["gather_metrics"],
          config: {
            prompt:
              "Perform statistical analysis on the experiment data. Calculate p-values, confidence intervals, and determine if results are statistically significant. Use a two-proportion z-test for conversion metrics.",
            model: "openrouter/anthropic/claude-sonnet-4",
            tools: ["statistics_calculator"],
          },
        },
        {
          id: "extract_learnings",
          name: "Extract Learnings",
          type: "agent",
          dependsOn: ["statistical_analysis"],
          config: {
            prompt:
              "Based on the experiment results, extract actionable learnings. What worked? What didn't? What should we test next? Format as structured insights.",
            model: "openrouter/anthropic/claude-sonnet-4",
          },
        },
        {
          id: "generate_report",
          name: "Generate Report",
          type: "agent",
          dependsOn: ["extract_learnings"],
          config: {
            prompt:
              "Generate a concise experiment report with results, statistical significance, key learnings, and next steps.",
            model: "openrouter/anthropic/claude-sonnet-4",
          },
        },
      ],
    };
  }

  private buildSeoOptimizationWorkflow(): WorkflowDefinition {
    return {
      name: "SEO/AEO Optimization",
      description:
        "Keyword research, ranking tracking, content optimization, and AI search visibility",
      version: 1,
      trigger: {
        type: "schedule",
        cron: "0 6 * * MON,THU",
        timezone: "UTC",
        enabled: true,
      },
      steps: [
        {
          id: "check_rankings",
          name: "Check Rankings",
          type: "tool",
          config: {
            toolName: "dataforseo_ranked_keywords",
            params: { targets: "{{config.seoTargets}}" },
          },
        },
        {
          id: "keyword_research",
          name: "Keyword Research",
          type: "agent",
          dependsOn: ["check_rankings"],
          config: {
            prompt:
              "Analyze current rankings and identify new keyword opportunities. Use DataForSEO for search volume, difficulty, and SERP features. Prioritize keywords with high volume and low difficulty.",
            model: "openrouter/anthropic/claude-sonnet-4",
            tools: [
              "dataforseo_keyword_suggestions",
              "dataforseo_search_volume",
              "dataforseo_serp_competitors",
            ],
          },
        },
        {
          id: "aeo_visibility",
          name: "Check AEO Visibility",
          type: "tool",
          dependsOn: ["check_rankings"],
          config: {
            toolName: "dataforseo_llm_mentions",
            params: { targets: "{{config.seoTargets}}" },
          },
        },
        {
          id: "optimization_recommendations",
          name: "Generate Recommendations",
          type: "agent",
          dependsOn: ["keyword_research", "aeo_visibility"],
          config: {
            prompt:
              "Based on ranking data, keyword research, and AEO visibility, generate specific content optimization recommendations. Include on-page SEO fixes, new content ideas, and AI search optimization strategies.",
            model: "openrouter/anthropic/claude-sonnet-4",
          },
        },
      ],
    };
  }

  private buildWeeklyReportWorkflow(): WorkflowDefinition {
    return {
      name: "Weekly Growth Report",
      description: "Generates a weekly summary of growth metrics, experiments, and SEO performance",
      version: 1,
      trigger: {
        type: "schedule",
        cron: "0 9 * * MON",
        timezone: "UTC",
        enabled: true,
      },
      steps: [
        {
          id: "gather_traffic",
          name: "Gather Traffic Data",
          type: "tool",
          config: {
            toolName: "analytics_query",
            params: { period: "last_7_days", metrics: "visitors,sources" },
          },
        },
        {
          id: "gather_experiment_data",
          name: "Gather Experiment Data",
          type: "tool",
          config: {
            toolName: "internal_experiments_summary",
            params: { period: "last_7_days" },
          },
        },
        {
          id: "gather_seo_data",
          name: "Gather SEO Data",
          type: "tool",
          config: {
            toolName: "dataforseo_ranked_keywords",
            params: { targets: "{{config.seoTargets}}" },
          },
        },
        {
          id: "compile_report",
          name: "Compile Report",
          type: "agent",
          dependsOn: ["gather_traffic", "gather_experiment_data", "gather_seo_data"],
          config: {
            prompt:
              "Compile a weekly growth report. Include traffic trends, experiment results, SEO ranking changes, and 3-5 actionable recommendations for next week. Be concise and data-driven.",
            model: "openrouter/anthropic/claude-sonnet-4",
          },
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Register the Growth Operator template
// ---------------------------------------------------------------------------

export const GROWTH_OPERATOR_TEMPLATE: OperatorTemplate = {
  id: "growth_operator_v1",
  type: "growth",
  version: "1.0.0",
  name: "Growth Operator",
  description: "Autonomous growth experimentation, A/B testing, and SEO/AEO optimization",
  icon: "chart-line-up",
  featured: true,
  capabilities: [
    "Hypothesis generation from analytics and competitor data",
    "A/B experiment design with statistical rigor",
    "Automated experiment execution and data collection",
    "Statistical significance testing and result interpretation",
    "SEO keyword research and ranking tracking",
    "AEO (AI Engine Optimization) visibility monitoring",
    "Weekly growth reports with actionable recommendations",
  ],
  requiredIntegrations: [
    {
      category: "analytics",
      providers: ["google_analytics"],
      description: "Traffic and conversion data for experiment measurement",
    },
    {
      category: "search",
      providers: ["google_search_console"],
      description: "Search performance data for SEO tracking",
    },
  ],
  optionalIntegrations: [
    {
      category: "seo",
      providers: ["dataforseo", "semrush", "ahrefs"],
      description: "Advanced keyword research and competitor analysis",
    },
  ],
  configSchema: {
    sections: [
      {
        id: "experiments",
        title: "Experiment Settings",
        fields: [
          {
            key: "maxConcurrentExperiments",
            label: "Max Concurrent Experiments",
            type: "number",
            description: "Maximum number of experiments running simultaneously",
            default: 3,
            required: true,
            validation: { min: 1, max: 10 },
          },
          {
            key: "defaultExperimentDurationDays",
            label: "Default Experiment Duration (days)",
            type: "number",
            description: "Default duration for new experiments",
            default: 14,
            required: true,
            validation: { min: 7, max: 90 },
          },
          {
            key: "defaultSignificanceThreshold",
            label: "Significance Threshold",
            type: "number",
            description: "Statistical significance level (0.90 = 90%)",
            default: 0.95,
            validation: { min: 0.8, max: 0.99 },
          },
          {
            key: "autoApproveLowRisk",
            label: "Auto-approve Low Risk Experiments",
            type: "boolean",
            description: "Automatically approve experiments with low estimated risk",
            default: false,
          },
        ],
      },
      {
        id: "seo",
        title: "SEO/AEO Settings",
        fields: [
          {
            key: "targetDomain",
            label: "Target Domain",
            type: "text",
            description: "Your domain to track rankings for",
            required: true,
            validation: { minLength: 3 },
          },
          {
            key: "reportDay",
            label: "Weekly Report Day",
            type: "select",
            description: "Day of week to generate the growth report",
            default: "monday",
            options: [
              { value: "monday", label: "Monday" },
              { value: "tuesday", label: "Tuesday" },
              { value: "wednesday", label: "Wednesday" },
              { value: "thursday", label: "Thursday" },
              { value: "friday", label: "Friday" },
            ],
          },
        ],
      },
    ],
  },
  defaultSystemPrompt:
    "You are a growth strategist and data analyst. You design, execute, and analyze growth experiments with statistical rigor. You track SEO/AEO performance and provide actionable recommendations based on data.",
  defaultTools: [
    "perplexity_search",
    "dataforseo_keyword_overview",
    "dataforseo_ranked_keywords",
    "dataforseo_llm_mentions",
    "analytics_query",
  ],
  defaultWorkflows: [
    {
      id: "experiment_design",
      name: "Experiment Design",
      description: "Generate hypotheses and design A/B experiments",
      triggerType: "api",
      enabledByDefault: true,
    },
    {
      id: "experiment_execution",
      name: "Experiment Execution",
      description: "Run approved experiments and collect data",
      triggerType: "event",
      enabledByDefault: true,
    },
    {
      id: "experiment_analysis",
      name: "Experiment Analysis",
      description: "Analyze results and extract learnings",
      triggerType: "event",
      enabledByDefault: true,
    },
    {
      id: "seo_optimization",
      name: "SEO/AEO Optimization",
      description: "Track rankings, research keywords, monitor AI visibility",
      triggerType: "cron",
      defaultCron: "0 6 * * MON,THU",
      enabledByDefault: true,
    },
    {
      id: "weekly_report",
      name: "Weekly Growth Report",
      description: "Compile traffic, experiment, and SEO data into a report",
      triggerType: "cron",
      defaultCron: "0 9 * * MON",
      enabledByDefault: true,
    },
  ],
  metrics: [
    { key: "experiments_created", name: "Experiments Created", type: "counter" },
    { key: "experiments_completed", name: "Experiments Completed", type: "counter" },
    { key: "experiment_win_rate", name: "Experiment Win Rate", type: "percentage", goal: "> 30%" },
    { key: "keywords_tracked", name: "Keywords Tracked", type: "gauge" },
    { key: "avg_position", name: "Average Position", type: "gauge", goal: "< 10" },
    { key: "aeo_visibility", name: "AEO Visibility Score", type: "percentage", goal: "> 50%" },
  ],
};

// Register on module load
operatorRegistry.register(GROWTH_OPERATOR_TEMPLATE);
