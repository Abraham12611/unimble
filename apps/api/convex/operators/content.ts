/**
 * Phase 8 — Content Operator.
 *
 * Orchestrates the full content lifecycle:
 *   topic_research → outline → draft → multi_review → approval → publish
 *   → schedule_promotion → performance_analytics
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

export const contentOperatorConfigSchema = z
  .object({
    niche: z.string().trim().min(1).max(200).default("general"),
    targetAudience: z.string().trim().min(1).max(500).default("developers"),
    contentTypes: z
      .array(z.enum(["blog_post", "newsletter", "linkedin", "twitter_thread"]))
      .min(1)
      .default(["blog_post"]),
    cmsIntegration: z
      .enum(["ghost", "wordpress", "contentful", "webflow", "none"])
      .default("none"),
    socialIntegrations: z
      .array(z.enum(["twitter", "linkedin", "slack"]))
      .default([]),
    publishSchedule: z.string().default("0 9 * * 1"),
    analyticsLookbackDays: z.number().int().min(1).max(90).default(7),
    reviewers: z
      .array(z.enum(["technical", "editorial", "seo"]))
      .min(1)
      .default(["editorial"]),
    name: z.string().optional(),
    description: z.string().optional(),
    timezone: z.string().default("UTC"),
    enabled: z.boolean().default(true),
    approvalRequired: z.boolean().default(true),
  })
  .default({});

export type ContentOperatorConfig = z.infer<typeof contentOperatorConfigSchema>;

// ---------------------------------------------------------------------------
// ContentOperator class
// ---------------------------------------------------------------------------

export class ContentOperator extends Operator<ContentOperatorConfig> {
  readonly operatorType = "content" as const;
  readonly version = "1.0.0";
  readonly displayName = "Content Operator";
  readonly description =
    "End-to-end content strategy: research, draft, review, approve, publish, promote.";
  readonly configSchema = contentOperatorConfigSchema;
  readonly memoryNamespace = "content";
  readonly requiredIntegrations: IntegrationDescriptor[] = [
    { key: "perplexity", label: "Perplexity (research)", required: false },
    { key: "cms", label: "CMS platform", required: false },
    { key: "social", label: "Social media", required: false },
  ];

  defaultWorkflows(): WorkflowDefinition[] {
    const cfg = this.getConfig();
    const workflows: WorkflowDefinition[] = [];

    // ----- Workflow 1: weekly content pipeline -----
    workflows.push({
      name: "Content Weekly Pipeline",
      description:
        "Weekly automated pipeline: research → draft → review → approval → publish → promote",
      trigger: { type: "cron", config: { cron: cfg.publishSchedule } },
      steps: [
        {
          id: "topic_research",
          name: "Topic Research",
          type: "agent",
          agentType: "writer",
          prompt: `Research trending topics in "${cfg.niche}" relevant to "${cfg.targetAudience}". Return top 5 topic ideas with headlines and brief rationale.`,
          tools: ["web_search", "memory_recall"],
          outputKey: "topics",
        },
        {
          id: "select_topic",
          name: "Select Best Topic",
          type: "agent",
          agentType: "writer",
          prompt:
            "From the researched topics, select the single best topic. Justify your choice based on relevance, timeliness, and SEO potential.",
          inputMapping: { topics: "topic_research.topics" },
          outputKey: "selected_topic",
          dependsOn: ["topic_research"],
        },
        {
          id: "outline",
          name: "Generate Outline",
          type: "agent",
          agentType: "writer",
          prompt:
            "Generate a detailed outline for the selected topic including H2/H3 sections, key points per section, and estimated word count.",
          inputMapping: { topic: "select_topic.selected_topic" },
          outputKey: "outline",
          dependsOn: ["select_topic"],
        },
        {
          id: "draft",
          name: "Write Draft",
          type: "agent",
          agentType: "writer",
          prompt: `Write a full ${cfg.contentTypes[0] ?? "blog_post"} based on the outline. Target audience: "${cfg.targetAudience}". Be detailed, engaging, and include actionable advice.`,
          inputMapping: { outline: "outline.outline" },
          tools: ["web_search", "memory_recall"],
          outputKey: "draft",
          dependsOn: ["outline"],
        },
        ...cfg.reviewers.map((reviewer) => ({
          id: `review_${reviewer}`,
          name: `${reviewer.charAt(0).toUpperCase() + reviewer.slice(1)} Review`,
          type: "agent" as const,
          agentType: "reviewer",
          prompt: `Perform a ${reviewer} review of the draft. Score 1-10 and provide specific actionable feedback.`,
          inputMapping: { draft: "draft.draft" },
          outputKey: `review_${reviewer}`,
          dependsOn: ["draft"],
          config: { reviewerType: reviewer },
        })),
        {
          id: "incorporate_feedback",
          name: "Incorporate Feedback",
          type: "agent",
          agentType: "writer",
          prompt: "Incorporate reviewer feedback into an improved final draft.",
          inputMapping: { draft: "draft.draft" },
          outputKey: "final_draft",
          dependsOn: cfg.reviewers.map((r) => `review_${r}`),
        },
        ...(cfg.approvalRequired
          ? [
              {
                id: "human_approval",
                name: "Human Approval Gate",
                type: "approval" as const,
                approvalConfig: {
                  timeoutMs: 72 * 60 * 60 * 1000,
                  message: "Please review and approve the content draft before publishing.",
                  fallback: "reject" as const,
                },
                inputMapping: { content: "incorporate_feedback.final_draft" },
                outputKey: "approval_result",
                dependsOn: ["incorporate_feedback"],
              },
            ]
          : []),
        {
          id: "publish",
          name: "Publish to CMS",
          type: "agent",
          agentType: "writer",
          prompt: `Publish the approved content to ${cfg.cmsIntegration}. Format for the platform and add metadata tags.`,
          tools: ["cms_publish"],
          inputMapping: { content: "incorporate_feedback.final_draft" },
          outputKey: "published_url",
          dependsOn: cfg.approvalRequired ? ["human_approval"] : ["incorporate_feedback"],
          config: { cmsIntegration: cfg.cmsIntegration },
        },
        ...(cfg.socialIntegrations.length > 0
          ? [
              {
                id: "social_promotion",
                name: "Social Promotion",
                type: "agent" as const,
                agentType: "writer",
                prompt: `Create social media promotion posts for: ${cfg.socialIntegrations.join(", ")}. Adapt tone and format for each platform.`,
                tools: ["social_post"],
                inputMapping: {
                  content: "incorporate_feedback.final_draft",
                  url: "publish.published_url",
                },
                outputKey: "social_posts",
                dependsOn: ["publish"],
                config: { platforms: cfg.socialIntegrations },
              },
            ]
          : []),
      ],
    });

    // ----- Workflow 2: performance analytics -----
    workflows.push({
      name: "Content Performance Analytics",
      description: "Weekly performance report on published content",
      trigger: {
        type: "cron",
        config: { cron: "0 9 * * 1", offsetDays: cfg.analyticsLookbackDays },
      },
      steps: [
        {
          id: "fetch_metrics",
          name: "Fetch Content Metrics",
          type: "agent",
          agentType: "writer",
          prompt: `Fetch performance metrics for published content from the last ${cfg.analyticsLookbackDays} days: views, time-on-page, shares, conversions.`,
          tools: ["analytics_fetch"],
          outputKey: "metrics",
        },
        {
          id: "generate_report",
          name: "Generate Performance Report",
          type: "agent",
          agentType: "writer",
          prompt:
            "Analyse the metrics and generate a performance report with insights and recommendations for next week's content.",
          inputMapping: { metrics: "fetch_metrics.metrics" },
          tools: ["memory_write"],
          outputKey: "report",
          dependsOn: ["fetch_metrics"],
        },
      ],
    });

    return workflows;
  }
}
