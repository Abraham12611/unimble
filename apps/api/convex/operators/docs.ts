/**
 * Phase 8 — Documentation Operator.
 *
 * Monitors changelog/commit feed and keeps docs fresh:
 *   fetch_changelog → generate_entry → detect_stale → cross_ref_api → publish_docs
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

export const docsOperatorConfigSchema = z
  .object({
    repo: z.string().trim().min(1).default("owner/repo"),
    branch: z.string().trim().min(1).default("main"),
    docsPlatform: z
      .enum(["gitbook", "readme", "docusaurus", "mintlify", "notion", "none"])
      .default("none"),
    changelogFormat: z.enum(["keepachangelog", "conventional_commits", "custom"]).default("keepachangelog"),
    staleThresholdDays: z.number().int().min(1).max(365).default(90),
    apiSpecPath: z.string().trim().default("openapi.yaml"),
    publishBranch: z.string().trim().default("docs/auto-update"),
    watchPaths: z.array(z.string()).default(["src/", "api/"]),
    name: z.string().optional(),
    description: z.string().optional(),
    timezone: z.string().default("UTC"),
    enabled: z.boolean().default(true),
    approvalRequired: z.boolean().default(false),
  })
  .default({});

export type DocsOperatorConfig = z.infer<typeof docsOperatorConfigSchema>;

// ---------------------------------------------------------------------------
// DocumentationOperator class
// ---------------------------------------------------------------------------

export class DocumentationOperator extends Operator<DocsOperatorConfig> {
  readonly operatorType = "documentation" as const;
  readonly version = "1.0.0";
  readonly displayName = "Documentation Operator";
  readonly description =
    "Auto-generates and keeps documentation fresh from commits, changelogs, and API specs.";
  readonly configSchema = docsOperatorConfigSchema;
  readonly memoryNamespace = "documentation";
  readonly requiredIntegrations: IntegrationDescriptor[] = [
    { key: "github", label: "GitHub token", required: true },
    { key: "docs_platform", label: "Docs platform API", required: false },
  ];

  defaultWorkflows(): WorkflowDefinition[] {
    const cfg = this.getConfig();

    return [
      // ----- Workflow 1: changelog → docs entry -----
      {
        name: "Docs: Changelog Entry Generator",
        description: `Triggered on push to ${cfg.repo}:${cfg.branch}. Generates changelog entries and publishes to ${cfg.docsPlatform}.`,
        trigger: {
          type: "webhook",
          config: {
            event: "push",
            repo: cfg.repo,
            branch: cfg.branch,
            watchPaths: cfg.watchPaths,
          },
        },
        steps: [
          {
            id: "fetch_commits",
            name: "Fetch Commits",
            type: "agent",
            agentType: "writer",
            prompt: `Fetch commits since the last changelog entry for ${cfg.repo}:${cfg.branch}. Watch paths: ${cfg.watchPaths.join(", ")}. Return structured list: {sha, message, author, timestamp, files_changed}.`,
            tools: ["github_fetch"],
            outputKey: "commits",
            config: { repo: cfg.repo, branch: cfg.branch },
          },
          {
            id: "generate_changelog_entry",
            name: "Generate Changelog Entry",
            type: "agent",
            agentType: "writer",
            prompt: `Generate a changelog entry in ${cfg.changelogFormat} format from the commits. Group by type: Added, Changed, Fixed, Removed. Use clear, user-facing language.`,
            inputMapping: { commits: "fetch_commits.commits" },
            outputKey: "changelog_entry",
            dependsOn: ["fetch_commits"],
          },
          {
            id: "detect_stale_docs",
            name: "Detect Stale Documentation",
            type: "agent",
            agentType: "writer",
            prompt: `Scan documentation pages for content last updated more than ${cfg.staleThresholdDays} days ago that may be affected by these commits. Return list of stale doc paths with suggested updates.`,
            tools: ["docs_fetch", "memory_recall"],
            inputMapping: { commits: "fetch_commits.commits" },
            outputKey: "stale_docs",
            dependsOn: ["fetch_commits"],
          },
          {
            id: "cross_ref_api_spec",
            name: "Cross-Reference API Spec",
            type: "agent",
            agentType: "writer",
            prompt: `Compare the API spec at ${cfg.apiSpecPath} with the documentation. Identify any undocumented endpoints or parameters introduced by recent commits.`,
            tools: ["github_fetch"],
            inputMapping: {
              commits: "fetch_commits.commits",
              stale: "detect_stale_docs.stale_docs",
            },
            outputKey: "api_gaps",
            dependsOn: ["detect_stale_docs"],
            config: { apiSpecPath: cfg.apiSpecPath },
          },
          {
            id: "draft_doc_updates",
            name: "Draft Documentation Updates",
            type: "agent",
            agentType: "writer",
            prompt:
              "Draft updated documentation sections for stale docs and API gaps. Use clear, concise technical writing. Include code examples where relevant.",
            inputMapping: {
              stale_docs: "detect_stale_docs.stale_docs",
              api_gaps: "cross_ref_api_spec.api_gaps",
              changelog: "generate_changelog_entry.changelog_entry",
            },
            outputKey: "doc_drafts",
            dependsOn: ["cross_ref_api_spec", "generate_changelog_entry"],
          },
          ...(cfg.approvalRequired
            ? [
                {
                  id: "docs_approval",
                  name: "Approve Documentation Updates",
                  type: "approval" as const,
                  approvalConfig: {
                    timeoutMs: 48 * 60 * 60 * 1000,
                    message: "Review documentation updates before publishing.",
                    fallback: "reject" as const,
                  },
                  inputMapping: { drafts: "draft_doc_updates.doc_drafts" },
                  dependsOn: ["draft_doc_updates"],
                },
              ]
            : []),
          {
            id: "publish_docs",
            name: "Publish Documentation",
            type: "agent",
            agentType: "writer",
            prompt: `Publish updated documentation to ${cfg.docsPlatform}. Create a PR to branch ${cfg.publishBranch} with all doc changes.`,
            tools: ["docs_publish", "github_pr"],
            inputMapping: { drafts: "draft_doc_updates.doc_drafts" },
            outputKey: "publish_result",
            dependsOn: cfg.approvalRequired ? ["docs_approval"] : ["draft_doc_updates"],
            config: {
              docsPlatform: cfg.docsPlatform,
              publishBranch: cfg.publishBranch,
            },
          },
        ],
      },

      // ----- Workflow 2: weekly stale doc scan -----
      {
        name: "Docs: Weekly Stale Content Scan",
        description: `Weekly scan for documentation older than ${cfg.staleThresholdDays} days`,
        trigger: { type: "cron", config: { cron: "0 8 * * 1" } },
        steps: [
          {
            id: "scan_all_docs",
            name: "Scan All Documentation",
            type: "agent",
            agentType: "writer",
            prompt: `Scan all documentation pages on ${cfg.docsPlatform}. Identify pages not updated in the last ${cfg.staleThresholdDays} days. Return list with last_updated, traffic_estimate, and staleness_score.`,
            tools: ["docs_fetch", "analytics_fetch"],
            outputKey: "stale_list",
            config: { docsPlatform: cfg.docsPlatform },
          },
          {
            id: "prioritise_updates",
            name: "Prioritise Updates",
            type: "agent",
            agentType: "writer",
            prompt:
              "Rank stale docs by priority = staleness_score × traffic_estimate. Generate an update backlog with recommended actions for the top 10.",
            inputMapping: { stale_list: "scan_all_docs.stale_list" },
            tools: ["memory_write"],
            outputKey: "update_backlog",
            dependsOn: ["scan_all_docs"],
          },
        ],
      },
    ];
  }
}
