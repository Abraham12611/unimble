"use node";

/**
 * Community Operator — Autonomous Community Engagement
 *
 * Concrete operator for social monitoring, community engagement,
 * and developer relations. Extends OperatorBase with:
 * - Social platform monitoring (Twitter/X, Reddit, Discord, HN)
 * - Mention detection and sentiment analysis
 * - Automated engagement response generation
 * - GitHub issue triage and contributor engagement
 * - Tone-matched response with approval routing
 * - Weekly community health reporting
 *
 * Phase 8.4.1 — Community Operator Core
 */

import { OperatorBase } from "./operatorBase";
import { operatorRegistry } from "./registry";
import type { OperatorType, OperatorTemplate, OperatorConfiguration } from "./types";
import type { AgentConfig } from "../agent/types";
import type { Persona } from "../agent/personas";
import { getDefaultPersona } from "../agent/personas";
import type { WorkflowDefinition } from "../engine/types";

// ---------------------------------------------------------------------------
// Community-specific types
// ---------------------------------------------------------------------------

/** Platforms the community operator monitors. */
export type SocialPlatform =
  | "twitter"
  | "reddit"
  | "discord"
  | "hacker_news"
  | "github"
  | "linkedin"
  | "dev_to"
  | "stack_overflow";

/** Types of community interactions. */
export type InteractionType =
  | "mention"
  | "question"
  | "feedback"
  | "bug_report"
  | "feature_request"
  | "praise"
  | "complaint"
  | "discussion"
  | "support_request";

/** Sentiment classification. */
export type Sentiment = "positive" | "neutral" | "negative" | "mixed";

/** Priority level for engagement. */
export type EngagementPriority = "critical" | "high" | "medium" | "low" | "skip";

/** A detected social mention or interaction. */
export interface CommunityMention {
  /** Unique ID */
  id: string;
  /** Platform where detected */
  platform: SocialPlatform;
  /** Type of interaction */
  type: InteractionType;
  /** Author username */
  author: string;
  /** Author follower/karma count (for prioritization) */
  authorInfluence: number;
  /** Content of the mention */
  content: string;
  /** URL to the original post */
  url: string;
  /** Detected sentiment */
  sentiment: Sentiment;
  /** Engagement priority */
  priority: EngagementPriority;
  /** Whether a response has been generated */
  responseGenerated: boolean;
  /** Whether the response has been posted */
  responsePosted: boolean;
  /** Detected at timestamp */
  detectedAt: number;
  /** Topics/keywords detected */
  topics: string[];
  /** Thread context (if part of a conversation) */
  threadContext?: string;
}

/** A generated response to a community mention. */
export interface EngagementResponse {
  /** Mention this responds to */
  mentionId: string;
  /** Platform for the response */
  platform: SocialPlatform;
  /** Generated response text */
  content: string;
  /** Tone used */
  tone: "helpful" | "friendly" | "professional" | "technical" | "empathetic";
  /** Whether this needs human approval before posting */
  requiresApproval: boolean;
  /** Approval status */
  approvalStatus: "pending" | "approved" | "rejected" | "auto_approved";
  /** Generated at timestamp */
  generatedAt: number;
  /** Posted at timestamp (if posted) */
  postedAt?: number;
}

/** GitHub-specific interaction data. */
export interface GitHubInteraction {
  /** Repository (owner/name) */
  repo: string;
  /** Issue or PR number */
  number: number;
  /** Type */
  type: "issue" | "pull_request" | "discussion";
  /** Title */
  title: string;
  /** Body content */
  body: string;
  /** Labels */
  labels: string[];
  /** Author */
  author: string;
  /** Whether this is from a first-time contributor */
  isFirstTimeContributor: boolean;
  /** Triage result */
  triageLabel?: string;
  /** Priority */
  priority: EngagementPriority;
}

/** Community health metrics for reporting. */
export interface CommunityHealthReport {
  /** Report period */
  period: { start: string; end: string };
  /** Mentions by platform */
  mentionsByPlatform: Record<SocialPlatform, number>;
  /** Sentiment breakdown */
  sentimentBreakdown: Record<Sentiment, number>;
  /** Response rate (responded / total actionable) */
  responseRate: number;
  /** Average response time (ms) */
  avgResponseTimeMs: number;
  /** Top topics discussed */
  topTopics: Array<{ topic: string; count: number; sentiment: Sentiment }>;
  /** Notable interactions (high influence or viral) */
  notableInteractions: CommunityMention[];
  /** GitHub stats */
  github: {
    issuesTriaged: number;
    prsReviewed: number;
    newContributorsWelcomed: number;
    avgTriageTimeMs: number;
  };
  /** Recommendations */
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Community Operator Settings
// ---------------------------------------------------------------------------

/** Community operator-specific settings. */
export interface CommunityOperatorSettings {
  /** Platforms to monitor */
  platforms: SocialPlatform[];
  /** Keywords/phrases to monitor */
  monitorKeywords: string[];
  /** Brand names to track */
  brandNames: string[];
  /** Competitor names to track */
  competitorNames: string[];
  /** GitHub repositories to monitor */
  githubRepos: string[];
  /** Auto-respond to low-risk mentions */
  autoRespondLowRisk: boolean;
  /** Maximum daily responses (to avoid spam) */
  maxDailyResponses: number;
  /** Minimum author influence to engage (0-1 normalized) */
  minInfluenceThreshold: number;
  /** Response tone preference */
  defaultTone: "helpful" | "friendly" | "professional" | "technical";
  /** Whether to engage with competitor mentions */
  engageCompetitorMentions: boolean;
  /** Report day (0=Sun, 1=Mon, ...) */
  reportDay: number;
}

/** Default settings for the Community Operator. */
export const DEFAULT_COMMUNITY_SETTINGS: CommunityOperatorSettings = {
  platforms: ["twitter", "reddit", "github"],
  monitorKeywords: [],
  brandNames: [],
  competitorNames: [],
  githubRepos: [],
  autoRespondLowRisk: false,
  maxDailyResponses: 50,
  minInfluenceThreshold: 0.1,
  defaultTone: "helpful",
  engageCompetitorMentions: false,
  reportDay: 1, // Monday
};

// ---------------------------------------------------------------------------
// Community Operator Class
// ---------------------------------------------------------------------------

/**
 * CommunityOperator — Autonomous community engagement and social monitoring.
 *
 * Manages the full community engagement lifecycle:
 * 1. Monitor social platforms for mentions and discussions
 * 2. Detect sentiment and classify interaction type
 * 3. Prioritize based on influence, sentiment, and type
 * 4. Generate tone-matched responses
 * 5. Route for approval or auto-post
 * 6. Track GitHub issues and welcome contributors
 * 7. Generate weekly community health reports
 */
export class CommunityOperator extends OperatorBase {
  constructor(config: OperatorConfiguration) {
    super(config);
  }

  // -------------------------------------------------------------------------
  // Abstract implementations
  // -------------------------------------------------------------------------

  getTemplate(): OperatorTemplate {
    const template = operatorRegistry.get("community-operator");
    if (!template) {
      throw new Error("Community operator template not found in registry");
    }
    return template;
  }

  getType(): OperatorType {
    return "community";
  }

  // -------------------------------------------------------------------------
  // Agent Configuration
  // -------------------------------------------------------------------------

  buildAgentConfig(operatorId: string, persona?: Persona): AgentConfig {
    const baseConfig = super.buildAgentConfig(operatorId, persona);

    const communityTools = [
      ...baseConfig.tools,
      "firehose.monitor",
      "composio.execute",
      "perplexity.search",
    ];

    return {
      ...baseConfig,
      tools: [...new Set(communityTools)],
      memoryCategories: ["workspace", "operator", "community_interactions", "response_history"],
      maxIterations: 15,
    };
  }

  getDefaultPersona(): Persona | undefined {
    return getDefaultPersona("community-manager");
  }

  // -------------------------------------------------------------------------
  // Workflow Definitions
  // -------------------------------------------------------------------------

  /**
   * Builds the continuous social monitoring workflow.
   * Runs on a frequent schedule to detect new mentions.
   */
  buildSocialMonitoringWorkflow(): WorkflowDefinition {
    const settings = this.getSettings();

    return {
      name: "Social Monitoring",
      description: "Monitor social platforms for mentions, questions, and discussions",
      version: 1,
      trigger: {
        type: "schedule",
        cron: "0 */2 * * *", // Every 2 hours
        timezone: "UTC",
        enabled: true,
      },
      steps: [
        {
          id: "scan_platforms",
          name: "Scan Platforms",
          type: "agent",
          config: {
            prompt: this.buildMonitoringPrompt(settings),
            modelTier: "fast",
            tools: ["firehose.monitor", "perplexity.search", "memory.read"],
            memoryContext: ["community_interactions"],
            outputFormat: "json",
          },
        },
        {
          id: "classify_mentions",
          name: "Classify & Prioritize",
          type: "agent",
          dependsOn: ["scan_platforms"],
          config: {
            prompt: `Classify each detected mention:
1. Determine interaction type (mention, question, feedback, bug_report, feature_request, praise, complaint, support_request)
2. Analyze sentiment (positive, neutral, negative, mixed)
3. Assess priority based on: author influence, sentiment severity, topic relevance, potential virality
4. Extract key topics and thread context

Return JSON array of classified mentions with all fields populated.`,
            modelTier: "fast",
            outputFormat: "json",
          },
        },
        {
          id: "filter_actionable",
          name: "Filter Actionable",
          type: "conditional",
          dependsOn: ["classify_mentions"],
          config: {
            conditions: [
              {
                expression: "{{classify_mentions.output.length}} > 0",
                thenSteps: ["generate_responses"],
              },
            ],
            elseSteps: [],
          },
        },
        {
          id: "generate_responses",
          name: "Generate Responses",
          type: "agent",
          dependsOn: ["filter_actionable"],
          config: {
            prompt: this.buildResponseGenerationPrompt(settings),
            modelTier: "generation",
            tools: ["perplexity.search", "memory.read"],
            memoryContext: ["response_history", "workspace"],
            outputFormat: "json",
          },
        },
      ],
      maxDurationMs: 600000, // 10 minutes
    };
  }

  /**
   * Builds the engagement response workflow.
   * Handles approval routing and posting of responses.
   */
  buildEngagementResponseWorkflow(): WorkflowDefinition {
    return {
      name: "Engagement Response",
      description: "Route responses for approval and post to platforms",
      version: 1,
      trigger: {
        type: "event",
        eventType: "community.responses_generated",
        enabled: true,
      },
      steps: [
        // Route based on per-response requiresApproval flag.
        // This always respects the per-response flag regardless of
        // operator-level approvalRequired setting.
        {
          id: "route_responses",
          name: "Route Responses",
          type: "conditional",
          config: {
            conditions: [
              {
                expression: "{{input.requiresApproval}} === true",
                thenSteps: ["human_approval"],
              },
            ],
            elseSteps: ["auto_post"],
          },
        },
        // Approval path — always present so per-response flags are honored
        {
          id: "human_approval",
          name: "Human Approval",
          type: "approval",
          dependsOn: ["route_responses"],
          config: {
            contentRef: "{{input.responses}}",
            approvalType: "community_response",
            timeoutMs: 14400000, // 4 hours
            timeoutAction: "skip" as const,
          },
        },
        {
          id: "post_approved",
          name: "Post Approved Responses",
          type: "agent",
          dependsOn: ["human_approval"],
          config: {
            prompt: `Post the approved community responses to their respective platforms.
Use the appropriate API for each platform. Respect rate limits and platform-specific formatting.
Return the posted URLs and any errors.`,
            modelTier: "fast",
            tools: ["composio.execute"],
            outputFormat: "json",
          },
        },
        // Auto-post path — only reached via elseSteps (requiresApproval === false)
        {
          id: "auto_post",
          name: "Auto-Post Responses",
          type: "agent",
          dependsOn: ["route_responses"],
          config: {
            prompt: `Post the auto-approved community responses to their respective platforms.
These are low-risk responses that don't require human review.
Use the appropriate API for each platform. Respect rate limits.
Return the posted URLs and any errors.`,
            modelTier: "fast",
            tools: ["composio.execute"],
            outputFormat: "json",
          },
        },
      ],
      maxDurationMs: 300000, // 5 minutes
    };
  }

  /**
   * Builds the GitHub engagement workflow.
   * Handles issue triage, PR review, and contributor engagement.
   */
  buildGitHubEngagementWorkflow(): WorkflowDefinition {
    const settings = this.getSettings();

    return {
      name: "GitHub Engagement",
      description: "Triage issues, review PRs, and welcome new contributors",
      version: 1,
      trigger: {
        type: "schedule",
        cron: "0 */4 * * *", // Every 4 hours
        timezone: "UTC",
        enabled: true,
      },
      steps: [
        {
          id: "scan_github",
          name: "Scan GitHub Activity",
          type: "agent",
          config: {
            prompt: `Scan the following GitHub repositories for new activity:
Repos: ${settings.githubRepos.join(", ")}

Look for:
1. New issues without labels (need triage)
2. New PRs without reviews
3. First-time contributors
4. Stale issues that need follow-up
5. Discussions needing responses

Return structured JSON with all findings.`,
            modelTier: "fast",
            tools: ["composio.execute", "memory.read"],
            memoryContext: ["community_interactions"],
            outputFormat: "json",
          },
        },
        {
          id: "triage_issues",
          name: "Triage Issues",
          type: "agent",
          dependsOn: ["scan_github"],
          config: {
            prompt: `For each new issue found:
1. Read the issue title and body carefully
2. Classify: bug, feature_request, question, documentation, enhancement
3. Assess priority: critical (production down), high (blocking), medium (important), low (nice-to-have)
4. Suggest labels
5. If it's a question, draft a helpful response
6. If it's a bug, ask for reproduction steps if missing

Return JSON with triage decisions and any responses to post.`,
            modelTier: "generation",
            tools: ["composio.execute", "perplexity.search"],
            outputFormat: "json",
          },
        },
        {
          id: "welcome_contributors",
          name: "Welcome New Contributors",
          type: "agent",
          dependsOn: ["scan_github"],
          config: {
            prompt: `For each first-time contributor found:
1. Welcome them warmly to the project
2. Thank them for their contribution
3. Offer guidance if their PR needs changes
4. Point them to contributing guidelines if relevant

Keep responses genuine, warm, and specific to their contribution.
Do NOT use generic templates — reference their actual PR/issue.`,
            modelTier: "generation",
            tools: ["composio.execute"],
            outputFormat: "json",
          },
        },
        {
          id: "post_github_responses",
          name: "Post GitHub Responses",
          type: "agent",
          dependsOn: ["triage_issues", "welcome_contributors"],
          config: {
            prompt: `Post the generated responses to GitHub:
- Apply labels to triaged issues
- Post triage comments
- Post welcome messages to first-time contributors
- Add review comments to PRs if needed

Use the GitHub API via Composio. Return results.`,
            modelTier: "fast",
            tools: ["composio.execute"],
            outputFormat: "json",
          },
        },
      ],
      maxDurationMs: 600000, // 10 minutes
    };
  }

  /**
   * Builds the weekly community health report workflow.
   */
  buildWeeklyReportWorkflow(): WorkflowDefinition {
    return {
      name: "Weekly Community Report",
      description: "Generate a weekly summary of community health and engagement",
      version: 1,
      trigger: {
        type: "schedule",
        cron: "0 9 * * MON",
        timezone: "UTC",
        enabled: true,
      },
      steps: [
        {
          id: "gather_metrics",
          name: "Gather Community Metrics",
          type: "agent",
          config: {
            prompt: `Gather community metrics for the past 7 days:
1. Total mentions by platform
2. Sentiment breakdown
3. Response rate and average response time
4. Top discussed topics
5. Notable interactions (high influence, viral, or critical)
6. GitHub: issues triaged, PRs reviewed, new contributors welcomed

Query memory for interaction history and compile statistics.`,
            modelTier: "fast",
            tools: ["memory.read", "composio.execute"],
            memoryContext: ["community_interactions", "response_history"],
            outputFormat: "json",
          },
        },
        {
          id: "compile_report",
          name: "Compile Report",
          type: "agent",
          dependsOn: ["gather_metrics"],
          config: {
            prompt: `Compile a weekly community health report from the gathered metrics.

Include:
1. Executive summary (2-3 sentences)
2. Mentions & sentiment trends (vs previous week)
3. Top 5 topics being discussed
4. Notable interactions that need attention
5. GitHub engagement summary
6. 3-5 actionable recommendations for next week

Be concise and data-driven. Highlight wins and areas needing attention.`,
            modelTier: "generation",
            outputFormat: "json",
          },
        },
      ],
      maxDurationMs: 300000, // 5 minutes
    };
  }

  // -------------------------------------------------------------------------
  // Prompt Builders
  // -------------------------------------------------------------------------

  private buildMonitoringPrompt(settings: CommunityOperatorSettings): string {
    return `Monitor the following platforms for mentions and discussions:

## Platforms
${settings.platforms.map((p) => `- ${p}`).join("\n")}

## Keywords to Track
${settings.monitorKeywords.map((k) => `- "${k}"`).join("\n")}

## Brand Names
${settings.brandNames.map((b) => `- "${b}"`).join("\n")}

${settings.engageCompetitorMentions ? `## Competitor Names\n${settings.competitorNames.map((c) => `- "${c}"`).join("\n")}` : ""}

## Instructions
1. Search each platform for recent mentions (last 2 hours)
2. Include direct mentions, keyword matches, and relevant discussions
3. Capture: author, content, URL, timestamp, platform
4. Skip obvious spam and bot accounts
5. Include thread context for conversations

Return a JSON array of raw mentions found.`;
  }

  private buildResponseGenerationPrompt(settings: CommunityOperatorSettings): string {
    return `Generate responses for the classified community mentions.

## Response Guidelines
- Default tone: ${settings.defaultTone}
- Maximum daily responses: ${settings.maxDailyResponses}
- Auto-respond threshold: ${settings.autoRespondLowRisk ? "enabled for low-risk" : "all require approval"}

## Rules
1. Be genuinely helpful — don't be salesy or promotional
2. Match the tone of the conversation
3. For questions: provide a clear, accurate answer with links if relevant
4. For feedback: acknowledge, thank, and explain next steps
5. For complaints: empathize, apologize if warranted, offer resolution
6. For praise: thank warmly and engage further
7. For bug reports: acknowledge, ask for details if needed, link to issue tracker
8. Keep responses concise — respect platform character limits
9. Never argue or be defensive
10. If unsure, flag for human review

## Platform-Specific Rules
- Twitter/X: Max 280 chars, use threads for longer responses
- Reddit: Match subreddit tone, use markdown formatting
- Discord: Use appropriate channel etiquette
- GitHub: Be technical and precise

## Output
For each mention, return:
- mentionId, platform, content (response text), tone, requiresApproval (true for high-priority or negative sentiment)`;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private getSettings(): CommunityOperatorSettings {
    return {
      ...DEFAULT_COMMUNITY_SETTINGS,
      ...(this.config.settings as Partial<CommunityOperatorSettings>),
    };
  }

  /**
   * Calculates engagement priority based on mention attributes.
   */
  static calculatePriority(mention: Partial<CommunityMention>): EngagementPriority {
    const sentiment = mention.sentiment ?? "neutral";
    const influence = mention.authorInfluence ?? 0;
    const type = mention.type ?? "mention";

    // Critical: negative sentiment from high-influence accounts
    if (sentiment === "negative" && influence > 0.8) return "critical";

    // High: bug reports, support requests, or high-influence mentions
    if (type === "bug_report" || type === "support_request") return "high";
    if (influence > 0.7) return "high";

    // Medium: questions, feature requests, or moderate influence
    if (type === "question" || type === "feature_request") return "medium";
    if (influence > 0.3) return "medium";

    // Low: praise, general discussion
    if (type === "praise" || type === "discussion") return "low";

    // Skip: very low influence neutral mentions
    if (influence < 0.1 && sentiment === "neutral") return "skip";

    return "low";
  }

  /**
   * Determines if a response should be auto-approved.
   */
  static shouldAutoApprove(
    mention: CommunityMention,
    settings: CommunityOperatorSettings
  ): boolean {
    if (!settings.autoRespondLowRisk) return false;

    // Never auto-approve for negative sentiment or high priority
    if (mention.sentiment === "negative") return false;
    if (mention.priority === "critical" || mention.priority === "high") return false;

    // Auto-approve for positive/neutral low-priority mentions
    return mention.priority === "low" && mention.sentiment !== "mixed";
  }
}

// ---------------------------------------------------------------------------
// Register the Community Operator template
// ---------------------------------------------------------------------------

export const COMMUNITY_OPERATOR_TEMPLATE: OperatorTemplate = {
  id: "community-operator",
  type: "community",
  version: "1.0.0",
  name: "Community Operator",
  description: "Autonomous community engagement, social monitoring, and developer relations",
  icon: "users-three",
  featured: true,
  capabilities: [
    "Real-time social platform monitoring (Twitter, Reddit, Discord, HN)",
    "Mention detection with sentiment analysis",
    "Automated response generation with tone matching",
    "GitHub issue triage and contributor welcoming",
    "Approval routing for high-risk responses",
    "Weekly community health reporting",
  ],
  requiredIntegrations: [
    {
      category: "social",
      providers: ["twitter"],
      description: "Post and monitor Twitter/X mentions",
    },
  ],
  optionalIntegrations: [
    {
      category: "social",
      providers: ["reddit", "discord", "linkedin"],
      description: "Monitor and engage on additional social platforms",
    },
    {
      category: "code",
      providers: ["github"],
      description: "Issue triage, PR review, and contributor engagement",
    },
  ],
  configSchema: {
    sections: [
      {
        id: "monitoring",
        title: "Monitoring Settings",
        fields: [
          {
            key: "monitor_keywords",
            label: "Keywords to Monitor",
            type: "tags",
            description: "Keywords and phrases to track across platforms",
            required: true,
          },
          {
            key: "brand_names",
            label: "Brand Names",
            type: "tags",
            description: "Your brand names and product names to track",
            required: true,
          },
          {
            key: "competitor_names",
            label: "Competitor Names",
            type: "tags",
            description: "Competitor names to optionally track",
          },
          {
            key: "github_repos",
            label: "GitHub Repositories",
            type: "tags",
            description: "Repositories to monitor (format: owner/repo)",
          },
        ],
      },
      {
        id: "engagement",
        title: "Engagement Settings",
        fields: [
          {
            key: "default_tone",
            label: "Default Response Tone",
            type: "select",
            description: "Default tone for generated responses",
            default: "helpful",
            options: [
              { value: "helpful", label: "Helpful" },
              { value: "friendly", label: "Friendly" },
              { value: "professional", label: "Professional" },
              { value: "technical", label: "Technical" },
            ],
          },
          {
            key: "max_daily_responses",
            label: "Max Daily Responses",
            type: "number",
            description: "Maximum responses per day to avoid spam",
            default: 50,
            validation: { min: 1, max: 200 },
          },
          {
            key: "auto_respond_low_risk",
            label: "Auto-Respond to Low Risk",
            type: "boolean",
            description: "Automatically post responses to low-risk positive mentions",
            default: false,
          },
          {
            key: "engage_competitor_mentions",
            label: "Engage Competitor Mentions",
            type: "boolean",
            description: "Respond to discussions mentioning competitors",
            default: false,
          },
        ],
      },
    ],
  },
  defaultSystemPrompt:
    "You are a community manager and developer advocate. You monitor social platforms, engage authentically with the community, triage GitHub issues, and welcome new contributors. You are helpful, empathetic, and never defensive.",
  defaultTools: [
    "firehose.monitor",
    "composio.execute",
    "perplexity.search",
    "memory.read",
    "memory.write",
  ],
  defaultWorkflows: [
    {
      id: "social-monitoring",
      name: "Social Monitoring",
      description: "Monitor platforms for mentions and discussions every 2 hours",
      triggerType: "cron",
      defaultCron: "0 */2 * * *",
      enabledByDefault: true,
    },
    {
      id: "engagement-response",
      name: "Engagement Response",
      description: "Route and post approved responses",
      triggerType: "event",
      enabledByDefault: true,
    },
    {
      id: "github-engagement",
      name: "GitHub Engagement",
      description: "Triage issues, review PRs, welcome contributors",
      triggerType: "cron",
      defaultCron: "0 */4 * * *",
      enabledByDefault: true,
    },
    {
      id: "weekly-community-report",
      name: "Weekly Community Report",
      description: "Generate weekly community health summary",
      triggerType: "cron",
      defaultCron: "0 9 * * MON",
      enabledByDefault: true,
    },
  ],
  metrics: [
    { key: "mentions_detected", name: "Mentions Detected", type: "counter" },
    { key: "responses_posted", name: "Responses Posted", type: "counter" },
    { key: "response_rate", name: "Response Rate", type: "percentage", goal: "> 80%" },
    { key: "avg_response_time", name: "Avg Response Time", type: "duration", goal: "< 2h" },
    { key: "sentiment_score", name: "Community Sentiment", type: "gauge" },
    { key: "issues_triaged", name: "Issues Triaged", type: "counter" },
    { key: "contributors_welcomed", name: "Contributors Welcomed", type: "counter" },
  ],
};

// Register on module load
operatorRegistry.register(COMMUNITY_OPERATOR_TEMPLATE);
