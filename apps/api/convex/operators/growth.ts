/**
 * Phase 8 — Growth Operator.
 *
 * Hypothesis-driven growth engine:
 *   hypothesis_gen → experiment_design → distribution → data_collection
 *   → significance_test → learning_extraction → seo_optimisation
 */

import { z } from "zod";
import { Operator } from "./base";
import type {
  IntegrationDescriptor,
  WorkflowDefinition,
} from "./types";

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

export const growthOperatorConfigSchema = z
  .object({
    growthChannels: z
      .array(
        z.enum([
          "organic_search",
          "social",
          "email",
          "paid",
          "referral",
          "product",
        ])
      )
      .min(1)
      .default(["organic_search"]),
    experimentTypes: z
      .array(z.enum(["ab_test", "multivariate", "split_url", "holdout"]))
      .default(["ab_test"]),
    analyticsIntegrations: z
      .array(z.enum(["google_analytics", "mixpanel", "amplitude", "posthog", "none"]))
      .default(["none"]),
    minSampleSize: z.number().int().min(100).default(500),
    confidenceLevel: z.number().min(0.8).max(0.99).default(0.95),
    experimentDurationDays: z.number().int().min(3).max(90).default(14),
    seoTarget: z.string().trim().max(200).optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    timezone: z.string().default("UTC"),
    enabled: z.boolean().default(true),
    approvalRequired: z.boolean().default(false),
  })
  .default({});

export type GrowthOperatorConfig = z.infer<typeof growthOperatorConfigSchema>;

// ---------------------------------------------------------------------------
// GrowthOperator class
// ---------------------------------------------------------------------------

export class GrowthOperator extends Operator<GrowthOperatorConfig> {
  readonly operatorType = "growth" as const;
  readonly version = "1.0.0";
  readonly displayName = "Growth Operator";
  readonly description =
    "Hypothesis-driven growth: A/B experiments, SEO/AEO optimisation, learning extraction.";
  readonly configSchema = growthOperatorConfigSchema;
  readonly memoryNamespace = "growth";
  readonly requiredIntegrations: IntegrationDescriptor[] = [
    { key: "analytics", label: "Analytics platform", required: false },
    { key: "cms", label: "CMS for variant delivery", required: false },
  ];

  defaultWorkflows(): WorkflowDefinition[] {
    const cfg = this.getConfig();
    const workflows: WorkflowDefinition[] = [];

    // ----- Workflow 1: growth experiment cycle -----
    workflows.push({
      name: "Growth Experiment Cycle",
      description:
        "Full experiment lifecycle: hypothesis → design → distribute → collect → analyse → learn",
      trigger: { type: "manual" },
      steps: [
        {
          id: "hypothesis_generation",
          name: "Generate Hypotheses",
          type: "agent",
          agentType: "writer",
          prompt: `Analyse existing data for ${cfg.growthChannels.join(", ")} channels. Generate 3 growth hypotheses ranked by ICE score (Impact, Confidence, Ease).`,
          tools: ["analytics_fetch", "memory_recall"],
          outputKey: "hypotheses",
        },
        {
          id: "select_hypothesis",
          name: "Select Top Hypothesis",
          type: "agent",
          agentType: "writer",
          prompt: "Select the highest-ICE hypothesis to test. Output the full hypothesis statement and expected outcome.",
          inputMapping: { hypotheses: "hypothesis_generation.hypotheses" },
          outputKey: "selected_hypothesis",
          dependsOn: ["hypothesis_generation"],
        },
        {
          id: "experiment_design",
          name: "Design Experiment",
          type: "agent",
          agentType: "writer",
          prompt: `Design a ${cfg.experimentTypes[0] ?? "ab_test"} experiment. Define: control, variant(s), success metric, minimum sample size (>=${cfg.minSampleSize}), duration (${cfg.experimentDurationDays} days), confidence level (${cfg.confidenceLevel}).`,
          inputMapping: { hypothesis: "select_hypothesis.selected_hypothesis" },
          outputKey: "experiment_design",
          dependsOn: ["select_hypothesis"],
        },
        ...(cfg.approvalRequired
          ? [
              {
                id: "experiment_approval",
                name: "Approve Experiment",
                type: "approval" as const,
                approvalConfig: {
                  timeoutMs: 48 * 60 * 60 * 1000,
                  message: "Review and approve the experiment design before launch.",
                  fallback: "reject" as const,
                },
                dependsOn: ["experiment_design"],
              },
            ]
          : []),
        {
          id: "distribute_experiment",
          name: "Distribute Experiment",
          type: "agent",
          agentType: "writer",
          prompt: "Set up and launch the experiment across the configured channels. Confirm traffic split and tracking are live.",
          tools: ["experiment_launch", "analytics_setup"],
          inputMapping: { design: "experiment_design.experiment_design" },
          outputKey: "experiment_id",
          dependsOn: cfg.approvalRequired ? ["experiment_approval"] : ["experiment_design"],
        },
        {
          id: "collect_data",
          name: "Collect Experiment Data",
          type: "agent",
          agentType: "writer",
          prompt: `Wait for sufficient data (min sample: ${cfg.minSampleSize} per variant). Poll analytics until sample size reached or ${cfg.experimentDurationDays} day duration expires.`,
          tools: ["analytics_fetch"],
          inputMapping: { experimentId: "distribute_experiment.experiment_id" },
          outputKey: "raw_data",
          dependsOn: ["distribute_experiment"],
        },
        {
          id: "significance_test",
          name: "Statistical Significance Test",
          type: "agent",
          agentType: "writer",
          prompt: `Run statistical significance test at ${cfg.confidenceLevel * 100}% confidence level. Calculate p-value, effect size, and confidence intervals. Declare winner if significant.`,
          inputMapping: {
            data: "collect_data.raw_data",
            design: "experiment_design.experiment_design",
          },
          outputKey: "test_result",
          dependsOn: ["collect_data"],
        },
        {
          id: "extract_learnings",
          name: "Extract Learnings",
          type: "agent",
          agentType: "writer",
          prompt: "Interpret results. Document learnings, recommended next steps, and whether to ship the variant. Write learnings to long-term memory.",
          tools: ["memory_write"],
          inputMapping: {
            testResult: "significance_test.test_result",
            hypothesis: "select_hypothesis.selected_hypothesis",
          },
          outputKey: "learnings",
          dependsOn: ["significance_test"],
        },
      ],
    });

    // ----- Workflow 2: SEO/AEO optimisation -----
    workflows.push({
      name: "SEO/AEO Optimisation",
      description: "Weekly keyword research, content gap analysis, and optimisation recommendations",
      trigger: { type: "cron", config: { cron: "0 8 * * 1" } },
      steps: [
        {
          id: "keyword_research",
          name: "Keyword Research",
          type: "agent",
          agentType: "writer",
          prompt: `Research high-opportunity keywords for ${cfg.seoTarget ?? cfg.growthChannels[0] ?? "organic search"}. Include search volume, difficulty, and relevance scores.`,
          tools: ["web_search", "seo_tools"],
          outputKey: "keywords",
        },
        {
          id: "content_gap_analysis",
          name: "Content Gap Analysis",
          type: "agent",
          agentType: "writer",
          prompt: "Identify content gaps based on keyword research vs existing content. Rank opportunities by traffic potential.",
          inputMapping: { keywords: "keyword_research.keywords" },
          tools: ["memory_recall"],
          outputKey: "gaps",
          dependsOn: ["keyword_research"],
        },
        {
          id: "optimisation_report",
          name: "Optimisation Report",
          type: "agent",
          agentType: "writer",
          prompt: "Generate actionable SEO/AEO recommendations: meta tag updates, content additions, internal linking, and new article ideas.",
          inputMapping: { gaps: "content_gap_analysis.gaps" },
          tools: ["memory_write"],
          outputKey: "report",
          dependsOn: ["content_gap_analysis"],
        },
      ],
    });

    return workflows;
  }
}
