/**
 * Integration Registry — static catalog of all supported integrations.
 *
 * This module defines the metadata, categories, and auth types for every
 * external service Unimble can connect to via Composio. The registry is
 * the single source of truth for the integrations list page, connect
 * modal, and toolkit resolution.
 *
 * Each entry maps a Composio toolkit slug to display metadata.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntegrationAuthType = "oauth" | "api_key" | "bot_token";

export type IntegrationCategory =
  | "content"
  | "social"
  | "analytics"
  | "code"
  | "communication"
  | "crm"
  | "project";

export type IntegrationStatus = "active" | "coming_soon" | "beta";

export interface IntegrationMeta {
  /** Composio toolkit slug (e.g. "github", "gmail") */
  slug: string;
  /** Human-readable name */
  name: string;
  /** Short description shown on the card */
  description: string;
  /** Primary category for filtering */
  category: IntegrationCategory;
  /** Additional categories for cross-listing */
  secondaryCategories?: IntegrationCategory[];
  /** How the user authenticates */
  authType: IntegrationAuthType;
  /** Permissions Unimble requests */
  permissions: string[];
  /** URL to the integration's logo/icon (relative or absolute) */
  iconSlug: string;
  /** Whether this integration is available */
  status: IntegrationStatus;
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

export const INTEGRATION_CATEGORIES: Record<
  IntegrationCategory,
  { label: string; description: string }
> = {
  content: {
    label: "Content & Publishing",
    description: "CMS platforms, blogs, and documentation tools",
  },
  social: {
    label: "Social Media",
    description: "Social platforms for posting and engagement",
  },
  analytics: {
    label: "Analytics",
    description: "Traffic, event, and product analytics platforms",
  },
  code: {
    label: "Code & Development",
    description: "Source control, issue tracking, and dev platforms",
  },
  communication: {
    label: "Communication",
    description: "Email, messaging, and notification services",
  },
  crm: {
    label: "CRM & Support",
    description: "Customer relationship and support platforms",
  },
  project: {
    label: "Project Management",
    description: "Task tracking and project management tools",
  },
};

// ---------------------------------------------------------------------------
// Integration catalog
// ---------------------------------------------------------------------------

export const INTEGRATIONS: IntegrationMeta[] = [
  // ── Content & Publishing ──────────────────────────────────────────
  {
    slug: "wordpress",
    name: "WordPress",
    description: "Publish blog posts and pages",
    category: "content",
    authType: "oauth",
    permissions: [
      "Read posts and pages",
      "Create and edit posts",
      "Upload media",
      "Manage categories and tags",
    ],
    iconSlug: "wordpress",
    status: "active",
  },
  {
    slug: "ghost",
    name: "Ghost",
    description: "Publish to Ghost blogs",
    category: "content",
    authType: "api_key",
    permissions: ["Read content", "Create and edit posts", "Manage tags"],
    iconSlug: "ghost",
    status: "active",
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Create and update Notion pages",
    category: "content",
    secondaryCategories: ["project"],
    authType: "oauth",
    permissions: ["Read pages and databases", "Create and edit pages", "Search workspace"],
    iconSlug: "notion",
    status: "active",
  },
  {
    slug: "hashnode",
    name: "Hashnode",
    description: "Publish to Hashnode",
    category: "content",
    authType: "api_key",
    permissions: ["Read posts", "Create and edit posts", "Manage tags"],
    iconSlug: "hashnode",
    status: "active",
  },
  {
    slug: "devto",
    name: "Dev.to",
    description: "Publish to Dev.to",
    category: "content",
    authType: "api_key",
    permissions: ["Read articles", "Create and edit articles"],
    iconSlug: "devto",
    status: "active",
  },
  {
    slug: "medium",
    name: "Medium",
    description: "Publish to Medium",
    category: "content",
    authType: "oauth",
    permissions: ["Create posts", "Read profile"],
    iconSlug: "medium",
    status: "active",
  },
  {
    slug: "webflow",
    name: "Webflow",
    description: "Manage Webflow CMS content",
    category: "content",
    authType: "oauth",
    permissions: ["Read sites", "Manage CMS items", "Publish sites"],
    iconSlug: "webflow",
    status: "coming_soon",
  },
  {
    slug: "contentful",
    name: "Contentful",
    description: "Manage Contentful entries",
    category: "content",
    authType: "api_key",
    permissions: ["Read entries", "Create and edit entries", "Manage assets"],
    iconSlug: "contentful",
    status: "coming_soon",
  },

  // ── Social Media ──────────────────────────────────────────────────
  {
    slug: "twitter",
    name: "Twitter / X",
    description: "Post tweets, threads, and replies",
    category: "social",
    authType: "oauth",
    permissions: ["Post tweets", "Read timeline", "Manage lists", "Read analytics"],
    iconSlug: "twitter",
    status: "active",
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    description: "Post updates and articles",
    category: "social",
    authType: "oauth",
    permissions: ["Post updates", "Read profile", "Share articles"],
    iconSlug: "linkedin",
    status: "active",
  },
  {
    slug: "reddit",
    name: "Reddit",
    description: "Post and comment on Reddit",
    category: "social",
    authType: "oauth",
    permissions: ["Submit posts", "Comment", "Read subreddits"],
    iconSlug: "reddit",
    status: "active",
  },
  {
    slug: "discord",
    name: "Discord",
    description: "Send messages and manage channels",
    category: "social",
    secondaryCategories: ["communication"],
    authType: "bot_token",
    permissions: ["Send messages", "Read messages", "Manage channels", "Manage roles"],
    iconSlug: "discord",
    status: "active",
  },

  // ── Analytics ─────────────────────────────────────────────────────
  {
    slug: "google_analytics",
    name: "Google Analytics",
    description: "Read traffic and engagement data",
    category: "analytics",
    authType: "oauth",
    permissions: ["Read analytics data", "Read reports"],
    iconSlug: "google-analytics",
    status: "active",
  },
  {
    slug: "mixpanel",
    name: "Mixpanel",
    description: "Read event and funnel data",
    category: "analytics",
    authType: "api_key",
    permissions: ["Read events", "Read funnels", "Read retention"],
    iconSlug: "mixpanel",
    status: "coming_soon",
  },
  {
    slug: "posthog",
    name: "PostHog",
    description: "Read product analytics",
    category: "analytics",
    authType: "api_key",
    permissions: ["Read events", "Read insights", "Read feature flags"],
    iconSlug: "posthog",
    status: "coming_soon",
  },
  {
    slug: "plausible",
    name: "Plausible",
    description: "Privacy-focused web analytics",
    category: "analytics",
    authType: "api_key",
    permissions: ["Read site stats", "Read realtime data"],
    iconSlug: "plausible",
    status: "coming_soon",
  },

  // ── Code & Development ────────────────────────────────────────────
  {
    slug: "github",
    name: "GitHub",
    description: "Repos, issues, and pull requests",
    category: "code",
    authType: "oauth",
    permissions: [
      "Read repositories",
      "Create issues",
      "Create pull requests",
      "Read organization data",
    ],
    iconSlug: "github",
    status: "active",
  },
  {
    slug: "gitlab",
    name: "GitLab",
    description: "Repos, issues, and merge requests",
    category: "code",
    authType: "oauth",
    permissions: ["Read repositories", "Create issues", "Create merge requests"],
    iconSlug: "gitlab",
    status: "coming_soon",
  },

  // ── Communication ─────────────────────────────────────────────────
  {
    slug: "slack",
    name: "Slack",
    description: "Send messages and notifications",
    category: "communication",
    authType: "oauth",
    permissions: ["Send messages", "Read channels", "Upload files", "Manage channels"],
    iconSlug: "slack",
    status: "active",
  },
  {
    slug: "gmail",
    name: "Gmail",
    description: "Send and read emails",
    category: "communication",
    authType: "oauth",
    permissions: ["Send emails", "Read emails", "Manage labels"],
    iconSlug: "gmail",
    status: "active",
  },
  {
    slug: "resend",
    name: "Resend",
    description: "Send transactional emails",
    category: "communication",
    authType: "api_key",
    permissions: ["Send emails", "Read email status"],
    iconSlug: "resend",
    status: "coming_soon",
  },

  // ── CRM & Support ────────────────────────────────────────────────
  {
    slug: "hubspot",
    name: "HubSpot",
    description: "Manage contacts and deals",
    category: "crm",
    authType: "oauth",
    permissions: ["Read contacts", "Create contacts", "Read deals", "Create deals"],
    iconSlug: "hubspot",
    status: "coming_soon",
  },
  {
    slug: "zendesk",
    name: "Zendesk",
    description: "Read and manage support tickets",
    category: "crm",
    authType: "oauth",
    permissions: ["Read tickets", "Create tickets", "Update tickets"],
    iconSlug: "zendesk",
    status: "coming_soon",
  },

  // ── Project Management ────────────────────────────────────────────
  {
    slug: "jira",
    name: "Jira",
    description: "Create and manage issues",
    category: "project",
    authType: "oauth",
    permissions: ["Read issues", "Create issues", "Update issues", "Read projects"],
    iconSlug: "jira",
    status: "coming_soon",
  },
  {
    slug: "linear",
    name: "Linear",
    description: "Create and manage issues",
    category: "project",
    authType: "oauth",
    permissions: ["Read issues", "Create issues", "Update issues", "Read projects"],
    iconSlug: "linear",
    status: "coming_soon",
  },
  {
    slug: "asana",
    name: "Asana",
    description: "Manage tasks and projects",
    category: "project",
    authType: "oauth",
    permissions: ["Read tasks", "Create tasks", "Update tasks", "Read projects"],
    iconSlug: "asana",
    status: "coming_soon",
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const _bySlug = new Map(INTEGRATIONS.map((i) => [i.slug, i]));

/** Get integration metadata by Composio toolkit slug. */
export function getIntegrationBySlug(slug: string): IntegrationMeta | undefined {
  return _bySlug.get(slug);
}

/** Get all integrations in a given category. */
export function getIntegrationsByCategory(category: IntegrationCategory): IntegrationMeta[] {
  return INTEGRATIONS.filter(
    (i) => i.category === category || i.secondaryCategories?.includes(category)
  );
}

/** Get only integrations that are currently available (not coming_soon). */
export function getActiveIntegrations(): IntegrationMeta[] {
  return INTEGRATIONS.filter((i) => i.status !== "coming_soon");
}

/** Search integrations by name (case-insensitive). */
export function searchIntegrations(query: string): IntegrationMeta[] {
  const lower = query.toLowerCase();
  return INTEGRATIONS.filter(
    (i) =>
      i.name.toLowerCase().includes(lower) ||
      i.description.toLowerCase().includes(lower) ||
      i.slug.includes(lower)
  );
}
