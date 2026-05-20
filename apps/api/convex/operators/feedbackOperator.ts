"use node";

/**
 * Feedback Operator — Autonomous Product Feedback Intelligence
 *
 * Concrete operator for collecting, analyzing, and synthesizing product
 * feedback from multiple sources. Extends OperatorBase with:
 * - Multi-source feedback collection (support tickets, reviews, social, surveys)
 * - Automated categorization and sentiment analysis
 * - Theme extraction and pattern detection
 * - Priority scoring based on frequency, severity, and user impact
 * - Weekly synthesis reports with actionable insights
 * - Feature request tracking and bug pattern detection
 *
 * Phase 8.5.1 — Feedback Operator Core
 */

import { OperatorBase } from "./operatorBase";
import { operatorRegistry } from "./registry";
import type { OperatorType, OperatorTemplate, OperatorConfiguration } from "./types";
import type { AgentConfig } from "../agent/types";
import type { Persona } from "../agent/personas";
import { getDefaultPersona } from "../agent/personas";
import type { WorkflowDefinition } from "../engine/types";

// ---------------------------------------------------------------------------
// Feedback-specific types
// ---------------------------------------------------------------------------

/** Sources of feedback the operator can ingest. */
export type FeedbackSource =
  | "support_ticket"
  | "app_review"
  | "social_mention"
  | "survey_response"
  | "nps_response"
  | "in_app_feedback"
  | "sales_call"
  | "churn_interview"
  | "community_post";

/** Categories for classifying feedback. */
export type FeedbackCategory =
  | "bug"
  | "feature_request"
  | "usability"
  | "performance"
  | "documentation"
  | "pricing"
  | "onboarding"
  | "integration"
  | "security"
  | "other";

/** Sentiment classification for feedback. */
export type FeedbackSentiment =
  | "very_negative"
  | "negative"
  | "neutral"
  | "positive"
  | "very_positive";

/** Priority level for feedback items. */
export type FeedbackPriority = "critical" | "high" | "medium" | "low";

/** A single feedback item from any source. */
export interface FeedbackItem {
  /** Unique ID */
  id: string;
  /** Source of the feedback */
  source: FeedbackSource;
  /** Category classification */
  category: FeedbackCategory;
  /** Sentiment */
  sentiment: FeedbackSentiment;
  /** Priority */
  priority: FeedbackPriority;
  /** Raw content */
  content: string;
  /** Summarized content (1-2 sentences) */
  summary: string;
  /** Author identifier (anonymized if needed) */
  author?: string;
  /** Author's plan/tier (for impact assessment) */
  authorTier?: string;
  /** Extracted themes/topics */
  themes: string[];
  /** Related feature area */
  featureArea?: string;
  /** External reference (ticket ID, review URL, etc.) */
  externalRef?: string;
  /** Ingested at timestamp */
  ingestedAt: number;
  /** Whether this has been addressed */
  addressed: boolean;
  /** Resolution notes (if addressed) */
  resolutionNotes?: string;
}

/** A detected theme across multiple feedback items. */
export interface FeedbackTheme {
  /** Theme name */
  name: string;
  /** Description */
  description: string;
  /** Number of feedback items mentioning this theme */
  frequency: number;
  /** Average sentiment for this theme */
  avgSentiment: number;
  /** Trend direction */
  trend: "rising" | "stable" | "declining";
  /** Related feedback item IDs */
  feedbackIds: string[];
  /** First detected */
  firstDetectedAt: number;
  /** Last seen */
  lastSeenAt: number;
}

/** A tracked feature request. */
export interface FeatureRequest {
  /** Request ID */
  id: string;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Number of unique requesters */
  requestCount: number;
  /** Priority score (0-1) */
  priorityScore: number;
  /** Status */
  status: "new" | "under_review" | "planned" | "in_progress" | "shipped" | "declined";
  /** Related feedback IDs */
  feedbackIds: string[];
  /** Estimated impact */
  estimatedImpact: "low" | "medium" | "high";
  /** First requested */
  firstRequestedAt: number;
}

/** A detected bug pattern. */
export interface BugPattern {
  /** Pattern ID */
  id: string;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Affected feature area */
  featureArea: string;
  /** Number of reports */
  reportCount: number;
  /** Severity */
  severity: "critical" | "major" | "minor" | "cosmetic";
  /** Related feedback IDs */
  feedbackIds: string[];
  /** First reported */
  firstReportedAt: number;
  /** Whether a fix has been shipped */
  resolved: boolean;
}

/** Weekly feedback synthesis report. */
export interface FeedbackSynthesisReport {
  /** Report period */
  period: { start: string; end: string };
  /** Total feedback items processed */
  totalItems: number;
  /** Breakdown by source */
  bySource: Record<FeedbackSource, number>;
  /** Breakdown by category */
  byCategory: Record<FeedbackCategory, number>;
  /** Sentiment distribution */
  sentimentDistribution: Record<FeedbackSentiment, number>;
  /** Top themes this period */
  topThemes: FeedbackTheme[];
  /** New feature requests */
  newFeatureRequests: FeatureRequest[];
  /** Bug patterns detected */
  bugPatterns: BugPattern[];
  /** Actionable insights */
  insights: string[];
  /** Recommended actions */
  recommendations: string[];
  /** NPS score (if available) */
  npsScore?: number;
  /** NPS trend */
  npsTrend?: "improving" | "stable" | "declining";
}

// ---------------------------------------------------------------------------
// Feedback Operator Settings
// ---------------------------------------------------------------------------

/** Feedback operator-specific settings. */
export interface FeedbackOperatorSettings {
  /** Sources to monitor */
  sources: FeedbackSource[];
  /** Feature areas to track */
  featureAreas: string[];
  /** Minimum feedback items before theme detection */
  themeDetectionThreshold: number;
  /** Auto-categorize incoming feedback */
  autoCategorize: boolean;
  /** Auto-prioritize based on frequency and severity */
  autoPrioritize: boolean;
  /** Report day (0=Sun, 1=Mon, ...) */
  reportDay: number;
  /** Whether to track NPS */
  trackNps: boolean;
  /** Notification threshold for critical feedback */
  criticalAlertThreshold: number;
  /** Maximum items to process per collection run */
  maxItemsPerRun: number;
}

/** Default settings for the Feedback Operator. */
export const DEFAULT_FEEDBACK_SETTINGS: FeedbackOperatorSettings = {
  sources: ["support_ticket", "app_review", "in_app_feedback"],
  featureAreas: [],
  themeDetectionThreshold: 3,
  autoCategorize: true,
  autoPrioritize: true,
  reportDay: 1, // Monday
  trackNps: true,
  criticalAlertThreshold: 3,
  maxItemsPerRun: 100,
};

// ---------------------------------------------------------------------------
// Feedback Operator Class
// ---------------------------------------------------------------------------

/**
 * FeedbackOperator — Autonomous product feedback intelligence.
 *
 * Manages the full feedback lifecycle:
 * 1. Collect feedback from multiple sources
 * 2. Categorize, score sentiment, and prioritize
 * 3. Extract themes and detect patterns
 * 4. Track feature requests and bug patterns
 * 5. Generate weekly synthesis reports with actionable insights
 */
export class FeedbackOperator extends OperatorBase {
  constructor(config: OperatorConfiguration) {
    super(config);
  }

  // -------------------------------------------------------------------------
  // Abstract implementations
  // -------------------------------------------------------------------------

  getTemplate(): OperatorTemplate {
    const template = operatorRegistry.get("feedback-operator");
    if (!template) {
      throw new Error("Feedback operator template not found in registry");
    }
    return template;
  }

  getType(): OperatorType {
    return "feedback";
  }

  // -------------------------------------------------------------------------
  // Agent Configuration
  // -------------------------------------------------------------------------

  buildAgentConfig(operatorId: string, persona?: Persona): AgentConfig {
    const baseConfig = super.buildAgentConfig(operatorId, persona);

    const feedbackTools = [...baseConfig.tools, "composio.execute", "perplexity.search"];

    return {
      ...baseConfig,
      tools: [...new Set(feedbackTools)],
      memoryCategories: [
        "workspace",
        "operator",
        "feedback_history",
        "feature_requests",
        "bug_patterns",
      ],
      maxIterations: 15,
    };
  }

  getDefaultPersona(): Persona | undefined {
    return getDefaultPersona("product-analyst");
  }

  // -------------------------------------------------------------------------
  // Workflow Definitions
  // -------------------------------------------------------------------------

  /**
   * Builds the feedback collection workflow.
   * Runs on schedule to ingest feedback from configured sources.
   */
  buildCollectionWorkflow(): WorkflowDefinition {
    const settings = this.getSettings();

    return {
      name: "Feedback Collection",
      description: "Collect and categorize feedback from all configured sources",
      version: 1,
      trigger: {
        type: "schedule",
        cron: "0 */6 * * *", // Every 6 hours
        timezone: "UTC",
        enabled: true,
      },
      steps: [
        {
          id: "ingest_feedback",
          name: "Ingest Feedback",
          type: "agent",
          config: {
            prompt: this.buildCollectionPrompt(settings),
            modelTier: "fast",
            tools: ["composio.execute", "memory.read"],
            memoryContext: ["feedback_history"],
            outputFormat: "json",
          },
        },
        {
          id: "categorize",
          name: "Categorize & Score",
          type: "agent",
          dependsOn: ["ingest_feedback"],
          config: {
            prompt: `Categorize each feedback item:
1. Assign a category: bug, feature_request, usability, performance, documentation, pricing, onboarding, integration, security, other
2. Analyze sentiment: very_negative, negative, neutral, positive, very_positive
3. Assess priority based on: severity, user tier, frequency of similar reports
4. Extract key themes (1-3 per item)
5. Identify the feature area affected
6. Generate a 1-2 sentence summary

Return JSON array of categorized feedback items.`,
            modelTier: "generation",
            outputFormat: "json",
          },
        },
        {
          id: "detect_critical",
          name: "Detect Critical Issues",
          type: "conditional",
          dependsOn: ["categorize"],
          config: {
            conditions: [
              {
                expression:
                  "{{categorize.output.criticalCount}} >= " + settings.criticalAlertThreshold,
                thenSteps: ["alert_critical"],
              },
            ],
            elseSteps: [],
          },
        },
        {
          id: "alert_critical",
          name: "Alert Critical Feedback",
          type: "tool",
          dependsOn: ["detect_critical"],
          continueOnFailure: true,
          config: {
            toolName: "notification.send",
            params: {
              title: "Critical Feedback Alert",
              message: "Multiple critical feedback items detected. Review required.",
              type: "error",
            },
          },
        },
      ],
      maxDurationMs: 600000, // 10 minutes
    };
  }

  /**
   * Builds the feedback analysis workflow.
   * Runs weekly to extract themes and detect patterns.
   */
  buildAnalysisWorkflow(): WorkflowDefinition {
    return {
      name: "Feedback Analysis",
      description: "Extract themes, detect patterns, and track feature requests",
      version: 1,
      trigger: {
        type: "schedule",
        cron: "0 7 * * MON,THU", // Monday and Thursday mornings
        timezone: "UTC",
        enabled: true,
      },
      steps: [
        {
          id: "gather_recent",
          name: "Gather Recent Feedback",
          type: "agent",
          config: {
            prompt: `Retrieve all feedback items from the last 3 days from memory.
Group them by category and feature area.
Return structured JSON with all items and their metadata.`,
            modelTier: "fast",
            tools: ["memory.read"],
            memoryContext: ["feedback_history"],
            outputFormat: "json",
          },
        },
        {
          id: "extract_themes",
          name: "Extract Themes",
          type: "agent",
          dependsOn: ["gather_recent"],
          config: {
            prompt: `Analyze the gathered feedback and extract recurring themes:
1. Group similar feedback items by topic
2. Identify themes mentioned by 3+ users
3. Calculate average sentiment per theme
4. Determine trend direction (rising/stable/declining vs previous period)
5. Rank themes by frequency and severity

Return JSON array of themes with: name, description, frequency, avgSentiment, trend, feedbackIds.`,
            modelTier: "generation",
            outputFormat: "json",
          },
        },
        {
          id: "detect_patterns",
          name: "Detect Bug Patterns",
          type: "agent",
          dependsOn: ["gather_recent"],
          config: {
            prompt: `Analyze bug-category feedback for recurring patterns:
1. Group similar bug reports together
2. Identify patterns reported by 2+ users
3. Assess severity (critical/major/minor/cosmetic)
4. Identify the affected feature area
5. Check if any patterns match previously resolved bugs (regression)

Return JSON array of bug patterns with: title, description, featureArea, reportCount, severity, feedbackIds.`,
            modelTier: "generation",
            tools: ["memory.read"],
            memoryContext: ["bug_patterns"],
            outputFormat: "json",
          },
        },
        {
          id: "track_features",
          name: "Track Feature Requests",
          type: "agent",
          dependsOn: ["gather_recent"],
          config: {
            prompt: `Analyze feature_request feedback:
1. Group similar requests together
2. Count unique requesters per feature
3. Calculate priority score based on: request count, user tier, estimated impact
4. Check against existing tracked requests (update counts or create new)
5. Assess estimated impact (low/medium/high)

Return JSON array of feature requests with: title, description, requestCount, priorityScore, estimatedImpact, feedbackIds.`,
            modelTier: "generation",
            tools: ["memory.read"],
            memoryContext: ["feature_requests"],
            outputFormat: "json",
          },
        },
      ],
      maxDurationMs: 600000, // 10 minutes
    };
  }

  /**
   * Builds the weekly synthesis report workflow.
   */
  buildSynthesisWorkflow(): WorkflowDefinition {
    return {
      name: "Weekly Feedback Synthesis",
      description: "Generate a weekly synthesis report with insights and recommendations",
      version: 1,
      trigger: {
        type: "schedule",
        cron: "0 9 * * MON",
        timezone: "UTC",
        enabled: true,
      },
      steps: [
        {
          id: "gather_week_data",
          name: "Gather Weekly Data",
          type: "agent",
          config: {
            prompt: `Compile all feedback data from the past 7 days:
1. Total items by source and category
2. Sentiment distribution
3. Current themes and their trends
4. Feature requests (new and updated)
5. Bug patterns (new and resolved)
6. NPS data if available

Return comprehensive JSON summary.`,
            modelTier: "fast",
            tools: ["memory.read"],
            memoryContext: ["feedback_history", "feature_requests", "bug_patterns"],
            outputFormat: "json",
          },
        },
        {
          id: "generate_insights",
          name: "Generate Insights",
          type: "agent",
          dependsOn: ["gather_week_data"],
          config: {
            prompt: `Based on the weekly feedback data, generate actionable insights:
1. What are users most frustrated about? (top pain points)
2. What are users most happy about? (strengths to maintain)
3. Are there emerging issues that need immediate attention?
4. What feature requests have the highest impact-to-effort ratio?
5. Are there any concerning trends in sentiment or NPS?

Generate 5-8 specific, actionable insights. Each should include:
- The insight itself
- Supporting data (numbers, quotes)
- Recommended action
- Priority (immediate/this_sprint/backlog)`,
            modelTier: "generation",
            outputFormat: "json",
          },
        },
        {
          id: "compile_report",
          name: "Compile Report",
          type: "agent",
          dependsOn: ["generate_insights"],
          config: {
            prompt: `Compile the weekly feedback synthesis report:

Include:
1. Executive summary (3-4 sentences)
2. Key metrics: total items, sentiment score, NPS
3. Top 5 themes with trends
4. Top 5 feature requests by priority
5. Bug patterns requiring attention
6. Actionable recommendations (prioritized)
7. Comparison to previous week

Format as a structured report suitable for product team review.
Be concise, data-driven, and action-oriented.`,
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

  private buildCollectionPrompt(settings: FeedbackOperatorSettings): string {
    return `Collect new feedback from the following sources:

## Sources
${settings.sources.map((s) => `- ${s}`).join("\n")}

## Instructions
1. Query each configured source for new feedback since last collection
2. For support tickets: fetch unprocessed tickets via integration
3. For app reviews: check app store reviews via integration
4. For in-app feedback: query the feedback table
5. For social mentions: check community operator's detected mentions
6. Deduplicate against previously processed items (check memory)
7. Maximum items per run: ${settings.maxItemsPerRun}

## Feature Areas to Track
${settings.featureAreas.length > 0 ? settings.featureAreas.map((a) => `- ${a}`).join("\n") : "- (auto-detect from content)"}

Return JSON array of raw feedback items with: source, content, author, authorTier, externalRef, timestamp.`;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private getSettings(): FeedbackOperatorSettings {
    return {
      ...DEFAULT_FEEDBACK_SETTINGS,
      ...(this.config.settings as Partial<FeedbackOperatorSettings>),
    };
  }

  /**
   * Calculates priority score for a feedback item.
   */
  static calculatePriority(
    sentiment: FeedbackSentiment,
    category: FeedbackCategory,
    authorTier?: string,
    frequency = 1
  ): FeedbackPriority {
    let score = 0;

    // Sentiment weight
    const sentimentScores: Record<FeedbackSentiment, number> = {
      very_negative: 4,
      negative: 3,
      neutral: 1,
      positive: 0,
      very_positive: 0,
    };
    score += sentimentScores[sentiment];

    // Category weight
    const categoryScores: Record<FeedbackCategory, number> = {
      bug: 3,
      security: 4,
      performance: 3,
      feature_request: 1,
      usability: 2,
      onboarding: 2,
      documentation: 1,
      pricing: 2,
      integration: 2,
      other: 1,
    };
    score += categoryScores[category];

    // Author tier weight
    if (authorTier === "enterprise") score += 3;
    else if (authorTier === "pro" || authorTier === "scale") score += 2;
    else if (authorTier === "growth") score += 1;

    // Frequency multiplier
    if (frequency >= 10) score += 3;
    else if (frequency >= 5) score += 2;
    else if (frequency >= 3) score += 1;

    // Map score to priority
    if (score >= 10) return "critical";
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    return "low";
  }

  /**
   * Calculates a sentiment score from -1 to 1.
   */
  static sentimentToScore(sentiment: FeedbackSentiment): number {
    const scores: Record<FeedbackSentiment, number> = {
      very_negative: -1,
      negative: -0.5,
      neutral: 0,
      positive: 0.5,
      very_positive: 1,
    };
    return scores[sentiment];
  }

  /**
   * Calculates NPS from a set of scores (0-10).
   */
  static calculateNps(scores: number[]): number {
    if (scores.length === 0) return 0;

    let promoters = 0;
    let detractors = 0;

    for (const score of scores) {
      if (score >= 9) promoters++;
      else if (score <= 6) detractors++;
    }

    return Math.round(((promoters - detractors) / scores.length) * 100);
  }
}

// ---------------------------------------------------------------------------
// Register the Feedback Operator template
// ---------------------------------------------------------------------------

export const FEEDBACK_OPERATOR_TEMPLATE: OperatorTemplate = {
  id: "feedback-operator",
  type: "feedback",
  version: "1.0.0",
  name: "Feedback Operator",
  description: "Autonomous product feedback collection, analysis, and synthesis",
  icon: "chat-circle-text",
  featured: true,
  capabilities: [
    "Multi-source feedback collection (tickets, reviews, social, surveys)",
    "Automated categorization and sentiment analysis",
    "Theme extraction and trend detection",
    "Feature request tracking with priority scoring",
    "Bug pattern detection and regression alerts",
    "Weekly synthesis reports with actionable insights",
    "NPS tracking and trend analysis",
  ],
  requiredIntegrations: [
    {
      category: "crm",
      providers: ["intercom", "zendesk", "freshdesk"],
      description: "Support ticket ingestion for feedback collection",
    },
  ],
  optionalIntegrations: [
    {
      category: "analytics",
      providers: ["mixpanel", "amplitude", "posthog"],
      description: "Product analytics for usage context",
    },
    {
      category: "project",
      providers: ["linear", "jira", "notion"],
      description: "Issue tracking for feature request sync",
    },
  ],
  configSchema: {
    sections: [
      {
        id: "collection",
        title: "Collection Settings",
        fields: [
          {
            key: "feature_areas",
            label: "Feature Areas",
            type: "tags",
            description: "Product areas to track (e.g., auth, billing, dashboard)",
          },
          {
            key: "max_items_per_run",
            label: "Max Items Per Run",
            type: "number",
            description: "Maximum feedback items to process per collection cycle",
            default: 100,
            validation: { min: 10, max: 500 },
          },
          {
            key: "critical_alert_threshold",
            label: "Critical Alert Threshold",
            type: "number",
            description: "Number of critical items before alerting",
            default: 3,
            validation: { min: 1, max: 20 },
          },
        ],
      },
      {
        id: "analysis",
        title: "Analysis Settings",
        fields: [
          {
            key: "theme_detection_threshold",
            label: "Theme Detection Threshold",
            type: "number",
            description: "Minimum mentions before a theme is detected",
            default: 3,
            validation: { min: 2, max: 10 },
          },
          {
            key: "auto_categorize",
            label: "Auto-Categorize",
            type: "boolean",
            description: "Automatically categorize incoming feedback",
            default: true,
          },
          {
            key: "auto_prioritize",
            label: "Auto-Prioritize",
            type: "boolean",
            description: "Automatically assign priority based on signals",
            default: true,
          },
          {
            key: "track_nps",
            label: "Track NPS",
            type: "boolean",
            description: "Track Net Promoter Score from survey responses",
            default: true,
          },
        ],
      },
    ],
  },
  defaultSystemPrompt:
    "You are a product analyst specializing in customer feedback. You collect, categorize, and synthesize feedback from multiple sources to surface actionable insights for the product team. You are thorough, data-driven, and focused on identifying patterns that drive product decisions.",
  defaultTools: ["composio.execute", "perplexity.search", "memory.read", "memory.write"],
  defaultWorkflows: [
    {
      id: "feedback-collection",
      name: "Feedback Collection",
      description: "Collect and categorize feedback from all sources every 6 hours",
      triggerType: "cron",
      defaultCron: "0 */6 * * *",
      enabledByDefault: true,
    },
    {
      id: "feedback-analysis",
      name: "Feedback Analysis",
      description: "Extract themes and detect patterns twice weekly",
      triggerType: "cron",
      defaultCron: "0 7 * * MON,THU",
      enabledByDefault: true,
    },
    {
      id: "weekly-synthesis",
      name: "Weekly Feedback Synthesis",
      description: "Generate weekly report with insights and recommendations",
      triggerType: "cron",
      defaultCron: "0 9 * * MON",
      enabledByDefault: true,
    },
  ],
  metrics: [
    { key: "items_collected", name: "Items Collected", type: "counter" },
    { key: "themes_detected", name: "Themes Detected", type: "gauge" },
    { key: "feature_requests_tracked", name: "Feature Requests", type: "gauge" },
    { key: "bug_patterns_detected", name: "Bug Patterns", type: "gauge" },
    { key: "nps_score", name: "NPS Score", type: "gauge", goal: "> 50" },
    { key: "avg_sentiment", name: "Avg Sentiment", type: "gauge" },
    { key: "critical_items", name: "Critical Items", type: "counter" },
  ],
};

// Register on module load
operatorRegistry.register(FEEDBACK_OPERATOR_TEMPLATE);
