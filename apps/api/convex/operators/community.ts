/**
 * Phase 8 — Community Operator.
 *
 * Monitors community channels and drafts contextual responses:
 *   fetch_messages → classify_intent → retrieve_context → draft_response
 *   → [approval?] → post_response → track_engagement
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

export const communityOperatorConfigSchema = z
  .object({
    monitoredChannels: z
      .array(
        z.enum(["discord", "reddit", "github_issues", "twitter", "slack", "hacker_news"])
      )
      .min(1)
      .default(["discord"]),
    responsePersonas: z
      .array(
        z.object({
          channel: z.string(),
          tone: z.enum(["friendly", "technical", "professional", "casual"]),
          signOff: z.string().optional(),
        })
      )
      .default([{ channel: "default", tone: "friendly" }]),
    intentFilters: z
      .array(z.enum(["question", "bug_report", "praise", "feature_request", "spam"]))
      .default(["question", "bug_report"]),
    pollIntervalMinutes: z.number().int().min(5).max(120).default(15),
    maxResponsesPerRun: z.number().int().min(1).max(50).default(10),
    name: z.string().optional(),
    description: z.string().optional(),
    timezone: z.string().default("UTC"),
    enabled: z.boolean().default(true),
    approvalRequired: z.boolean().default(false),
  })
  .default({} as any);

export type CommunityOperatorConfig = z.infer<typeof communityOperatorConfigSchema>;

// ---------------------------------------------------------------------------
// CommunityOperator class
// ---------------------------------------------------------------------------

export class CommunityOperator extends Operator<CommunityOperatorConfig> {
  readonly operatorType = "community" as const;
  readonly version = "1.0.0";
  readonly displayName = "Community Operator";
  readonly description =
    "Monitors community channels, classifies intent, drafts and posts contextual responses.";
  readonly configSchema = communityOperatorConfigSchema;
  readonly memoryNamespace = "community";
  readonly requiredIntegrations: IntegrationDescriptor[] = [
    { key: "discord", label: "Discord bot", required: false },
    { key: "reddit", label: "Reddit API", required: false },
    { key: "github", label: "GitHub token", required: false },
    { key: "twitter", label: "Twitter/X API", required: false },
  ];

  defaultWorkflows(): WorkflowDefinition[] {
    const cfg = this.getConfig();

    return [
      {
        name: "Community Monitor & Respond",
        description: `Poll ${cfg.monitoredChannels.join(", ")} every ${cfg.pollIntervalMinutes} minutes, classify intent, and draft responses.`,
        trigger: {
          type: "cron",
          config: { cron: `*/${cfg.pollIntervalMinutes} * * * *` },
        },
        steps: [
          {
            id: "fetch_messages",
            name: "Fetch New Messages",
            type: "agent",
            agentType: "writer",
            prompt: `Fetch new unresponded messages from: ${cfg.monitoredChannels.join(", ")}. Limit to ${cfg.maxResponsesPerRun} messages. Return structured list with message id, channel, author, content, timestamp.`,
            tools: ["community_fetch"],
            outputKey: "messages",
            config: { channels: cfg.monitoredChannels },
          },
          {
            id: "classify_intent",
            name: "Classify Intent",
            type: "agent",
            agentType: "writer",
            prompt: `Classify each message's intent: ${cfg.intentFilters.join(", ")}. Filter out spam and messages outside the intent filters. Return structured list with message_id, intent, urgency (1-5), and summary.`,
            inputMapping: { messages: "fetch_messages.messages" },
            outputKey: "classified",
            dependsOn: ["fetch_messages"],
          },
          {
            id: "retrieve_context",
            name: "Retrieve Context",
            type: "agent",
            agentType: "writer",
            prompt:
              "For each classified message, retrieve relevant context from long-term memory: previous answers, product documentation references, known issues.",
            tools: ["memory_recall"],
            inputMapping: { classified: "classify_intent.classified" },
            outputKey: "enriched",
            dependsOn: ["classify_intent"],
          },
          {
            id: "draft_responses",
            name: "Draft Responses",
            type: "agent",
            agentType: "writer",
            prompt: `Draft a response for each message. Use the appropriate persona tone per channel. Be helpful, accurate, and concise. Personas: ${JSON.stringify(cfg.responsePersonas)}.`,
            inputMapping: { enriched: "retrieve_context.enriched" },
            outputKey: "drafts",
            dependsOn: ["retrieve_context"],
          },
          ...(cfg.approvalRequired
            ? [
                {
                  id: "approval_gate",
                  name: "Response Approval",
                  type: "approval" as const,
                  approvalConfig: {
                    timeoutMs: 2 * 60 * 60 * 1000,
                    message: "Review community response drafts before posting.",
                    fallback: "reject" as const,
                  },
                  inputMapping: { drafts: "draft_responses.drafts" },
                  dependsOn: ["draft_responses"],
                },
              ]
            : []),
          {
            id: "post_responses",
            name: "Post Responses",
            type: "agent",
            agentType: "writer",
            prompt: "Post each approved response to its respective channel. Record the response ID and timestamp.",
            tools: ["community_post"],
            inputMapping: { drafts: "draft_responses.drafts" },
            outputKey: "posted",
            dependsOn: cfg.approvalRequired ? ["approval_gate"] : ["draft_responses"],
            config: { channels: cfg.monitoredChannels },
          },
          {
            id: "track_engagement",
            name: "Track Engagement",
            type: "agent",
            agentType: "writer",
            prompt:
              "Record response metadata (channel, intent, response_id) to memory for engagement tracking and future context retrieval.",
            tools: ["memory_write"],
            inputMapping: { posted: "post_responses.posted" },
            outputKey: "tracked",
            dependsOn: ["post_responses"],
          },
        ],
      },
    ];
  }
}
