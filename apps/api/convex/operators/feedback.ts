/**
 * Phase 8 — Feedback Operator.
 *
 * Ingests feedback from multiple sources, clusters by theme, extracts
 * insights, and delivers a weekly product insights report:
 *   ingest → cluster → extract_insights → generate_report → notify_team
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

export const feedbackOperatorConfigSchema = z
  .object({
    feedbackSources: z
      .array(
        z.enum([
          "intercom",
          "zendesk",
          "typeform",
          "google_forms",
          "slack_channel",
          "email",
          "github_issues",
          "custom_api",
        ])
      )
      .min(1)
      .default(["slack_channel"]),
    reportSchedule: z.string().default("0 9 * * 5"),
    notificationChannels: z
      .array(z.enum(["slack", "discord", "email"]))
      .default(["slack"]),
    clusterCount: z.number().int().min(2).max(20).default(5),
    minFeedbackItems: z.number().int().min(1).default(10),
    lookbackDays: z.number().int().min(1).max(90).default(7),
    name: z.string().optional(),
    description: z.string().optional(),
    timezone: z.string().default("UTC"),
    enabled: z.boolean().default(true),
    approvalRequired: z.boolean().default(false),
  })
  .default({} as any);

export type FeedbackOperatorConfig = z.infer<typeof feedbackOperatorConfigSchema>;

// ---------------------------------------------------------------------------
// FeedbackOperator class
// ---------------------------------------------------------------------------

export class FeedbackOperator extends Operator<FeedbackOperatorConfig> {
  readonly operatorType = "feedback" as const;
  readonly version = "1.0.0";
  readonly displayName = "Feedback Operator";
  readonly description =
    "Ingests multi-source feedback, clusters by theme, and delivers weekly product insights reports.";
  readonly configSchema = feedbackOperatorConfigSchema;
  readonly memoryNamespace = "feedback";
  readonly requiredIntegrations: IntegrationDescriptor[] = [
    { key: "intercom", label: "Intercom", required: false },
    { key: "zendesk", label: "Zendesk", required: false },
    { key: "slack", label: "Slack (notifications)", required: false },
  ];

  defaultWorkflows(): WorkflowDefinition[] {
    const cfg = this.getConfig();

    return [
      {
        name: "Weekly Feedback Insights Report",
        description: `Every week: ingest from ${cfg.feedbackSources.join(", ")}, cluster into ${cfg.clusterCount} themes, generate insights report`,
        trigger: {
          type: "cron",
          config: { cron: cfg.reportSchedule },
        },
        steps: [
          {
            id: "ingest_feedback",
            name: "Ingest Feedback",
            type: "agent",
            agentType: "writer",
            prompt: `Fetch all feedback from the last ${cfg.lookbackDays} days from: ${cfg.feedbackSources.join(", ")}. Return structured list: {id, source, text, author, timestamp, sentiment}.`,
            tools: ["feedback_fetch"],
            outputKey: "raw_feedback",
            config: {
              sources: cfg.feedbackSources,
              lookbackDays: cfg.lookbackDays,
            },
          },
          {
            id: "check_volume",
            name: "Check Feedback Volume",
            type: "condition",
            config: {
              condition: `raw_feedback.length >= ${cfg.minFeedbackItems}`,
              onFalse: "skip_to_notify_low_volume",
            },
            inputMapping: { raw_feedback: "ingest_feedback.raw_feedback" },
            dependsOn: ["ingest_feedback"],
          },
          {
            id: "semantic_clustering",
            name: "Semantic Clustering",
            type: "agent",
            agentType: "writer",
            prompt: `Group the feedback into ${cfg.clusterCount} thematic clusters using semantic similarity. For each cluster: provide a label, representative examples (top 3), and item count.`,
            tools: ["embedding_cluster"],
            inputMapping: { feedback: "ingest_feedback.raw_feedback" },
            outputKey: "clusters",
            dependsOn: ["check_volume"],
          },
          {
            id: "extract_insights",
            name: "Extract Feature Requests & Pain Points",
            type: "agent",
            agentType: "writer",
            prompt:
              "From the clusters, extract: (1) top 5 feature requests by frequency, (2) top 5 pain points by severity, (3) notable praise items. Return structured JSON.",
            inputMapping: { clusters: "semantic_clustering.clusters" },
            outputKey: "insights",
            dependsOn: ["semantic_clustering"],
          },
          {
            id: "generate_report",
            name: "Generate Insights Report",
            type: "agent",
            agentType: "writer",
            prompt:
              "Generate a concise weekly product insights report. Include: executive summary, top themes, feature requests prioritised by votes, pain points with severity, sentiment trend, and recommended actions.",
            inputMapping: {
              insights: "extract_insights.insights",
              clusters: "semantic_clustering.clusters",
            },
            tools: ["memory_write"],
            outputKey: "report",
            dependsOn: ["extract_insights"],
          },
          {
            id: "notify_team",
            name: "Notify Team",
            type: "notification",
            config: {
              channels: cfg.notificationChannels,
              template: "weekly_insights",
            },
            inputMapping: { report: "generate_report.report" },
            outputKey: "notification_ids",
            dependsOn: ["generate_report"],
          },
        ],
      },
    ];
  }
}
