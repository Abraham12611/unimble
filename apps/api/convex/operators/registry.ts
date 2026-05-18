/**
 * Operator Framework — Operator Registry
 *
 * Manages the catalog of available operator templates:
 * - Registers built-in operator templates
 * - Provides template discovery and lookup
 * - Supports template versioning
 * - Enables custom operator registration (future marketplace)
 *
 * The registry is a pure in-memory catalog. Templates are
 * registered at module load time and queried during deployment.
 *
 * Phase 8.1.2 — Operator Registry
 */

import type { OperatorTemplate, OperatorType } from "./types";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Registry entry with metadata. */
interface RegistryEntry {
  template: OperatorTemplate;
  registeredAt: number;
  source: "builtin" | "custom" | "marketplace";
}

/**
 * Operator template registry.
 *
 * Stores all available operator templates that users can deploy.
 * Built-in templates are registered at startup; custom templates
 * can be added per workspace (future marketplace feature).
 */
class OperatorRegistry {
  private templates: Map<string, RegistryEntry> = new Map();

  /**
   * Registers an operator template.
   */
  register(template: OperatorTemplate, source: RegistryEntry["source"] = "builtin"): void {
    if (this.templates.has(template.id)) {
      const existing = this.templates.get(template.id)!;
      // Allow re-registration only if version is newer
      if (existing.template.version >= template.version) {
        return;
      }
    }

    this.templates.set(template.id, {
      template,
      registeredAt: Date.now(),
      source,
    });
  }

  /**
   * Gets a template by ID.
   */
  get(templateId: string): OperatorTemplate | undefined {
    return this.templates.get(templateId)?.template;
  }

  /**
   * Lists all registered templates.
   */
  list(): OperatorTemplate[] {
    return [...this.templates.values()].map((e) => e.template);
  }

  /**
   * Lists templates filtered by type.
   */
  listByType(type: OperatorType): OperatorTemplate[] {
    return this.list().filter((t) => t.type === type);
  }

  /**
   * Lists featured templates.
   */
  listFeatured(): OperatorTemplate[] {
    return this.list().filter((t) => t.featured);
  }

  /**
   * Checks if a template exists.
   */
  has(templateId: string): boolean {
    return this.templates.has(templateId);
  }

  /**
   * Removes a template (for custom/marketplace templates).
   */
  unregister(templateId: string): boolean {
    const entry = this.templates.get(templateId);
    if (!entry) return false;
    // Cannot unregister built-in templates
    if (entry.source === "builtin") return false;
    this.templates.delete(templateId);
    return true;
  }

  /**
   * Returns the count of registered templates.
   */
  count(): number {
    return this.templates.size;
  }

  /**
   * Clears all templates (for testing).
   */
  clear(): void {
    this.templates.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

/** Global operator registry instance. */
export const operatorRegistry = new OperatorRegistry();

// ---------------------------------------------------------------------------
// Built-in Templates
// ---------------------------------------------------------------------------

/**
 * Content Operator template.
 */
const CONTENT_OPERATOR_TEMPLATE: OperatorTemplate = {
  id: "content-operator",
  type: "content",
  name: "Content Operator",
  description: "Autonomous content creation for blogs, tutorials, and documentation.",
  icon: "pencil",
  version: "1.0.0",
  featured: true,
  capabilities: [
    "Topic research and trend detection",
    "Blog post and tutorial generation",
    "SEO optimization",
    "Multi-platform publishing",
    "Performance tracking and learning",
  ],
  requiredIntegrations: [
    {
      category: "cms",
      providers: ["wordpress", "ghost", "notion", "hashnode", "devto"],
      description: "At least one CMS for publishing",
    },
  ],
  optionalIntegrations: [
    {
      category: "social",
      providers: ["twitter", "linkedin"],
      description: "Social media for content promotion",
    },
    {
      category: "analytics",
      providers: ["google_analytics", "posthog", "plausible"],
      description: "Analytics for performance tracking",
    },
  ],
  configSchema: {
    sections: [
      {
        id: "content",
        title: "Content Settings",
        fields: [
          {
            key: "content_style",
            label: "Content Style",
            type: "select",
            default: "technical",
            options: [
              { value: "technical", label: "Technical" },
              { value: "conversational", label: "Conversational" },
              { value: "tutorial", label: "Tutorial" },
              { value: "reference", label: "Reference" },
            ],
          },
          {
            key: "target_audience",
            label: "Target Audience",
            type: "select",
            default: "intermediate",
            options: [
              { value: "beginner", label: "Beginner" },
              { value: "intermediate", label: "Intermediate" },
              { value: "advanced", label: "Advanced" },
              { value: "mixed", label: "Mixed" },
            ],
          },
          {
            key: "weekly_content_target",
            label: "Weekly Content Target",
            type: "number",
            default: 2,
            description: "Number of content pieces to produce per week",
            validation: { min: 1, max: 10 },
          },
          {
            key: "topics_focus",
            label: "Topics Focus",
            type: "tags",
            description: "Topics to focus on (e.g., React Native, subscriptions)",
          },
        ],
      },
      {
        id: "approval",
        title: "Approval Settings",
        fields: [
          {
            key: "approval_required",
            label: "Require Approval Before Publishing",
            type: "boolean",
            default: true,
            description: "Content must be approved by a human before publishing",
          },
        ],
      },
    ],
  },
  defaultSystemPrompt: `You are a technical content creator specializing in developer education.
You write clearly, use code examples liberally, and focus on practical value.
Your tone is friendly but professional, never condescending.
You research topics thoroughly before writing and optimize for SEO.`,
  defaultTools: ["perplexity.search", "firecrawl.scrape", "memory.read", "memory.write"],
  defaultWorkflows: [
    {
      id: "weekly-content-pipeline",
      name: "Weekly Content Pipeline",
      description: "Research, write, review, and publish content weekly",
      triggerType: "cron",
      defaultCron: "0 9 * * MON",
      enabledByDefault: true,
    },
    {
      id: "content-on-demand",
      name: "On-Demand Content",
      description: "Generate content on a specific topic",
      triggerType: "api",
      enabledByDefault: true,
    },
  ],
  metrics: [
    { key: "articles_published", name: "Articles Published", type: "counter", goal: "2 per week" },
    { key: "total_views", name: "Total Views", type: "gauge", source: "analytics" },
    { key: "avg_engagement", name: "Avg Engagement", type: "percentage", goal: "> 3%" },
  ],
};

/**
 * Growth Operator template.
 */
const GROWTH_OPERATOR_TEMPLATE: OperatorTemplate = {
  id: "growth-operator",
  type: "growth",
  name: "Growth Operator",
  description: "Runs growth experiments, manages campaigns, and optimizes acquisition.",
  icon: "trending-up",
  version: "1.0.0",
  featured: false,
  capabilities: [
    "Experiment design and hypothesis generation",
    "A/B content testing",
    "Social campaign execution",
    "SEO/AEO optimization",
    "Weekly growth reporting",
  ],
  requiredIntegrations: [
    {
      category: "analytics",
      providers: ["google_analytics", "posthog", "mixpanel", "amplitude"],
      description: "Analytics for measuring experiment results",
    },
  ],
  optionalIntegrations: [
    {
      category: "social",
      providers: ["twitter", "linkedin", "reddit"],
      description: "Social channels for distribution experiments",
    },
    {
      category: "email",
      providers: ["resend", "sendgrid", "mailchimp"],
      description: "Email for campaign experiments",
    },
  ],
  configSchema: {
    sections: [
      {
        id: "experiments",
        title: "Experiment Settings",
        fields: [
          {
            key: "weekly_experiment_target",
            label: "Weekly Experiment Target",
            type: "number",
            default: 1,
            validation: { min: 1, max: 5 },
          },
          {
            key: "channels",
            label: "Growth Channels",
            type: "multiselect",
            default: ["twitter", "linkedin"],
            options: [
              { value: "twitter", label: "Twitter/X" },
              { value: "linkedin", label: "LinkedIn" },
              { value: "reddit", label: "Reddit" },
              { value: "hackernews", label: "Hacker News" },
              { value: "devto", label: "Dev.to" },
              { value: "producthunt", label: "Product Hunt" },
            ],
          },
          {
            key: "experiment_approval",
            label: "Require Experiment Approval",
            type: "boolean",
            default: true,
          },
        ],
      },
    ],
  },
  defaultSystemPrompt: `You are a data-driven growth marketer focused on developer audiences.
You design experiments with clear hypotheses and success metrics.
You prioritize high-impact, low-effort opportunities.
You always measure results and extract learnings.`,
  defaultTools: ["perplexity.search", "memory.read", "memory.write"],
  defaultWorkflows: [
    {
      id: "weekly-experiment-cycle",
      name: "Weekly Experiment Cycle",
      description: "Design, execute, and analyze one growth experiment per week",
      triggerType: "cron",
      defaultCron: "0 10 * * MON",
      enabledByDefault: true,
    },
    {
      id: "weekly-report",
      name: "Weekly Growth Report",
      description: "Generate weekly growth metrics and insights report",
      triggerType: "cron",
      defaultCron: "0 17 * * FRI",
      enabledByDefault: true,
    },
  ],
  metrics: [
    { key: "experiments_run", name: "Experiments Run", type: "counter", goal: "1 per week" },
    { key: "website_traffic", name: "Website Traffic", type: "gauge", source: "analytics" },
    { key: "social_impressions", name: "Social Impressions", type: "counter" },
  ],
};

/**
 * Community Operator template.
 */
const COMMUNITY_OPERATOR_TEMPLATE: OperatorTemplate = {
  id: "community-operator",
  type: "community",
  name: "Community Operator",
  description: "Manages community engagement across Discord, GitHub, and social platforms.",
  icon: "users",
  version: "1.0.0",
  featured: true,
  capabilities: [
    "Question answering with documentation context",
    "Issue triage and routing",
    "Relationship building and memory",
    "Sentiment monitoring",
    "Community insights synthesis",
  ],
  requiredIntegrations: [
    {
      category: "community",
      providers: ["discord", "slack", "github"],
      description: "At least one community platform",
    },
  ],
  optionalIntegrations: [
    {
      category: "social",
      providers: ["twitter", "reddit"],
      description: "Social platforms for broader engagement",
    },
  ],
  configSchema: {
    sections: [
      {
        id: "engagement",
        title: "Engagement Settings",
        fields: [
          {
            key: "response_style",
            label: "Response Style",
            type: "select",
            default: "friendly",
            options: [
              { value: "formal", label: "Formal" },
              { value: "friendly", label: "Friendly" },
              { value: "casual", label: "Casual" },
            ],
          },
          {
            key: "auto_respond",
            label: "Auto-Respond",
            type: "boolean",
            default: false,
            description: "Respond automatically without human approval",
          },
          {
            key: "confidence_threshold",
            label: "Auto-Respond Confidence Threshold",
            type: "number",
            default: 0.9,
            description: "Only auto-respond when confidence is above this (0.5-1.0)",
            validation: { min: 0.5, max: 1.0 },
          },
          {
            key: "response_time_target",
            label: "Response Time Target",
            type: "select",
            default: "1h",
            options: [
              { value: "15m", label: "15 minutes" },
              { value: "1h", label: "1 hour" },
              { value: "4h", label: "4 hours" },
              { value: "24h", label: "24 hours" },
            ],
          },
        ],
      },
    ],
  },
  defaultSystemPrompt: `You are a helpful community manager who genuinely cares about developers.
You answer questions accurately, admit when you don't know something,
and always point to official documentation when relevant.
You remember past interactions and build ongoing relationships.`,
  defaultTools: ["perplexity.search", "firecrawl.scrape", "memory.read", "memory.write"],
  defaultWorkflows: [
    {
      id: "continuous-monitoring",
      name: "Continuous Monitoring",
      description: "Monitor community channels for questions and discussions",
      triggerType: "continuous",
      enabledByDefault: true,
    },
    {
      id: "weekly-insights",
      name: "Weekly Community Insights",
      description: "Synthesize community feedback into actionable insights",
      triggerType: "cron",
      defaultCron: "0 10 * * MON",
      enabledByDefault: true,
    },
  ],
  metrics: [
    {
      key: "interactions_handled",
      name: "Interactions Handled",
      type: "counter",
      goal: "50+ per week",
    },
    { key: "avg_response_time", name: "Avg Response Time", type: "duration", goal: "< 1 hour" },
    { key: "satisfaction_score", name: "Satisfaction Score", type: "percentage", goal: "> 80%" },
  ],
};

/**
 * Feedback Operator template.
 */
const FEEDBACK_OPERATOR_TEMPLATE: OperatorTemplate = {
  id: "feedback-operator",
  type: "feedback",
  name: "Feedback Operator",
  description: "Collects, synthesizes, and structures product feedback from all sources.",
  icon: "message-square",
  version: "1.0.0",
  featured: false,
  capabilities: [
    "Multi-source feedback aggregation",
    "Automatic categorization and tagging",
    "Deduplication via semantic similarity",
    "Priority scoring (frequency × impact × effort)",
    "Weekly synthesis reports",
  ],
  requiredIntegrations: [
    {
      category: "feedback",
      providers: ["github", "discord", "intercom", "zendesk"],
      description: "At least one feedback source",
    },
  ],
  optionalIntegrations: [
    {
      category: "project_management",
      providers: ["linear", "jira", "notion"],
      description: "For creating issues from high-priority feedback",
    },
  ],
  configSchema: {
    sections: [
      {
        id: "feedback",
        title: "Feedback Settings",
        fields: [
          {
            key: "categories",
            label: "Feedback Categories",
            type: "tags",
            default: ["bug", "feature_request", "ux_issue", "documentation", "pricing"],
          },
          {
            key: "report_frequency",
            label: "Report Frequency",
            type: "select",
            default: "weekly",
            options: [
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "biweekly", label: "Biweekly" },
            ],
          },
          {
            key: "auto_create_issues",
            label: "Auto-Create Issues",
            type: "boolean",
            default: false,
            description: "Automatically create issues for high-priority feedback",
          },
        ],
      },
    ],
  },
  defaultSystemPrompt: `You are a product analyst who excels at finding signal in noise.
You identify patterns across disparate feedback sources.
You present findings objectively with supporting evidence.
You categorize, deduplicate, and prioritize feedback systematically.`,
  defaultTools: ["perplexity.search", "memory.read", "memory.write"],
  defaultWorkflows: [
    {
      id: "weekly-synthesis",
      name: "Weekly Feedback Synthesis",
      description: "Aggregate and synthesize feedback into actionable insights",
      triggerType: "cron",
      defaultCron: "0 9 * * MON",
      enabledByDefault: true,
    },
  ],
  metrics: [
    { key: "feedback_processed", name: "Feedback Processed", type: "counter" },
    { key: "unique_issues", name: "Unique Issues Identified", type: "counter" },
    { key: "issues_shipped", name: "Feedback → Shipped", type: "counter" },
  ],
};

/**
 * Documentation Operator template.
 */
const DOCUMENTATION_OPERATOR_TEMPLATE: OperatorTemplate = {
  id: "documentation-operator",
  type: "documentation",
  name: "Documentation Operator",
  description: "Keeps documentation in sync with code, generates API references and guides.",
  icon: "book-open",
  version: "1.0.0",
  featured: false,
  capabilities: [
    "Code analysis and API surface extraction",
    "API reference generation",
    "Tutorial and guide creation",
    "Documentation freshness auditing",
    "Broken link detection",
  ],
  requiredIntegrations: [
    {
      category: "code",
      providers: ["github", "gitlab"],
      description: "Code repository to monitor",
    },
  ],
  optionalIntegrations: [
    {
      category: "docs",
      providers: ["gitbook", "readme", "notion", "docusaurus"],
      description: "Documentation platform for publishing",
    },
  ],
  configSchema: {
    sections: [
      {
        id: "docs",
        title: "Documentation Settings",
        fields: [
          {
            key: "doc_style",
            label: "Documentation Style",
            type: "select",
            default: "mixed",
            options: [
              { value: "reference", label: "Reference" },
              { value: "tutorial", label: "Tutorial" },
              { value: "conceptual", label: "Conceptual" },
              { value: "mixed", label: "Mixed" },
            ],
          },
          {
            key: "auto_update",
            label: "Auto-Update on Code Changes",
            type: "boolean",
            default: false,
            description: "Automatically update docs when code changes are detected",
          },
        ],
      },
    ],
  },
  defaultSystemPrompt: `You are a technical writer who values clarity and accuracy above all.
You write documentation that developers actually want to read.
You include working code examples for every concept.
You maintain consistency across all documentation pages.`,
  defaultTools: ["perplexity.search", "firecrawl.scrape", "memory.read", "memory.write"],
  defaultWorkflows: [
    {
      id: "weekly-audit",
      name: "Weekly Documentation Audit",
      description: "Check for outdated docs, broken links, and coverage gaps",
      triggerType: "cron",
      defaultCron: "0 10 * * MON",
      enabledByDefault: true,
    },
    {
      id: "release-docs",
      name: "Release Documentation",
      description: "Generate docs for new releases",
      triggerType: "webhook",
      enabledByDefault: true,
    },
  ],
  metrics: [
    { key: "pages_updated", name: "Pages Updated", type: "counter" },
    { key: "broken_links", name: "Broken Links", type: "gauge", goal: "0" },
    { key: "doc_coverage", name: "API Coverage", type: "percentage", goal: "> 95%" },
  ],
};

// ---------------------------------------------------------------------------
// Register all built-in templates
// ---------------------------------------------------------------------------

operatorRegistry.register(CONTENT_OPERATOR_TEMPLATE);
operatorRegistry.register(GROWTH_OPERATOR_TEMPLATE);
operatorRegistry.register(COMMUNITY_OPERATOR_TEMPLATE);
operatorRegistry.register(FEEDBACK_OPERATOR_TEMPLATE);
operatorRegistry.register(DOCUMENTATION_OPERATOR_TEMPLATE);

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { OperatorRegistry };
