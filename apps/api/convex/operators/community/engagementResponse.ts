"use node";

/**
 * Community Operator — Engagement Response
 *
 * Handles response generation, tone matching, approval routing,
 * and response posting for community interactions.
 *
 * Phase 8.4.3 — Engagement Response
 */

import type {
  SocialPlatform,
  CommunityMention,
  EngagementResponse,
  CommunityOperatorSettings,
} from "../communityOperator";

// ---------------------------------------------------------------------------
// Response generation types
// ---------------------------------------------------------------------------

/** Tone selection criteria. */
export type ResponseTone = "helpful" | "friendly" | "professional" | "technical" | "empathetic";

/** Platform-specific constraints. */
export interface PlatformConstraints {
  /** Maximum character length */
  maxLength: number;
  /** Whether markdown is supported */
  supportsMarkdown: boolean;
  /** Whether threading is supported */
  supportsThreads: boolean;
  /** Whether mentions/tags are supported */
  supportsMentions: boolean;
  /** Platform-specific formatting notes */
  formattingNotes: string;
}

/** Response validation result. */
export interface ResponseValidation {
  /** Whether the response is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Warnings (non-blocking) */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Platform constraints
// ---------------------------------------------------------------------------

/** Character limits and formatting rules per platform. */
export const PLATFORM_CONSTRAINTS: Record<SocialPlatform, PlatformConstraints> = {
  twitter: {
    maxLength: 280,
    supportsMarkdown: false,
    supportsThreads: true,
    supportsMentions: true,
    formattingNotes: "Use threads for longer responses. Include @mentions.",
  },
  reddit: {
    maxLength: 10000,
    supportsMarkdown: true,
    supportsThreads: true,
    supportsMentions: true,
    formattingNotes: "Use markdown formatting. Match subreddit tone.",
  },
  discord: {
    maxLength: 2000,
    supportsMarkdown: true,
    supportsThreads: true,
    supportsMentions: true,
    formattingNotes: "Use Discord markdown. Respect channel etiquette.",
  },
  hacker_news: {
    maxLength: 5000,
    supportsMarkdown: false,
    supportsThreads: true,
    supportsMentions: false,
    formattingNotes: "Plain text only. Be substantive and technical.",
  },
  github: {
    maxLength: 65536,
    supportsMarkdown: true,
    supportsThreads: true,
    supportsMentions: true,
    formattingNotes: "Full GitHub-flavored markdown. Be precise and technical.",
  },
  linkedin: {
    maxLength: 3000,
    supportsMarkdown: false,
    supportsThreads: false,
    supportsMentions: true,
    formattingNotes: "Professional tone. Use line breaks for readability.",
  },
  dev_to: {
    maxLength: 10000,
    supportsMarkdown: true,
    supportsThreads: true,
    supportsMentions: true,
    formattingNotes: "Developer-focused. Use code blocks where relevant.",
  },
  stack_overflow: {
    maxLength: 30000,
    supportsMarkdown: true,
    supportsThreads: false,
    supportsMentions: false,
    formattingNotes: "Technical and precise. Include code examples. Answer the question directly.",
  },
};

// ---------------------------------------------------------------------------
// Tone selection
// ---------------------------------------------------------------------------

/**
 * Selects the appropriate response tone based on mention attributes.
 */
export function selectTone(mention: CommunityMention, defaultTone: ResponseTone): ResponseTone {
  // Empathetic for negative sentiment or complaints
  if (mention.sentiment === "negative" || mention.type === "complaint") {
    return "empathetic";
  }

  // Technical for bug reports and support requests
  if (mention.type === "bug_report" || mention.type === "support_request") {
    return "technical";
  }

  // Friendly for praise
  if (mention.type === "praise" || mention.sentiment === "positive") {
    return "friendly";
  }

  // Professional for high-influence accounts
  if (mention.authorInfluence > 0.7) {
    return "professional";
  }

  return defaultTone;
}

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

/**
 * Validates a response against platform constraints and quality rules.
 */
export function validateResponse(
  response: EngagementResponse,
  mention: CommunityMention
): ResponseValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const constraints = PLATFORM_CONSTRAINTS[response.platform];

  // Length check
  if (response.content.length > constraints.maxLength) {
    errors.push(
      `Response exceeds ${constraints.maxLength} character limit for ${response.platform} (got ${response.content.length})`
    );
  }

  // Empty check
  if (response.content.trim().length === 0) {
    errors.push("Response content is empty");
  }

  // Don't respond to yourself
  if (response.content.toLowerCase().includes("as an ai")) {
    warnings.push("Response contains 'as an AI' — may break character");
  }

  // Check for overly promotional language
  const promotionalPatterns = [
    /buy now/i,
    /sign up today/i,
    /limited time/i,
    /exclusive offer/i,
    /click here/i,
  ];
  if (promotionalPatterns.some((p) => p.test(response.content))) {
    warnings.push("Response contains potentially promotional language");
  }

  // Platform-specific checks
  if (response.platform === "twitter" && response.content.length > 260) {
    warnings.push("Response is close to Twitter character limit — consider shortening");
  }

  // Tone mismatch check
  if (mention.sentiment === "negative" && response.tone === "friendly") {
    warnings.push("Friendly tone may seem dismissive for negative sentiment — consider empathetic");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Approval routing
// ---------------------------------------------------------------------------

/**
 * Determines whether a response requires human approval.
 */
export function requiresApproval(
  mention: CommunityMention,
  settings: CommunityOperatorSettings
): boolean {
  // Always require approval if auto-respond is disabled
  if (!settings.autoRespondLowRisk) return true;

  // Always require approval for critical/high priority
  if (mention.priority === "critical" || mention.priority === "high") return true;

  // Always require approval for negative sentiment
  if (mention.sentiment === "negative") return true;

  // Always require approval for competitor mentions (word-boundary match)
  if (
    settings.competitorNames.some((c) => {
      const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`\\b${escaped}\\b`, "i");
      return pattern.test(mention.content);
    })
  ) {
    return true;
  }

  // Always require approval for mixed sentiment (ambiguous tone needs human judgment)
  if (mention.sentiment === "mixed") return true;

  // Auto-approve low-risk positive/neutral mentions
  return false;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Tracks daily response counts per platform. */
export interface DailyResponseTracker {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Responses posted per platform */
  counts: Record<SocialPlatform, number>;
  /** Total responses posted today */
  total: number;
}

/**
 * Checks if we can still post responses today.
 */
export function canPostResponse(
  tracker: DailyResponseTracker,
  platform: SocialPlatform,
  maxDaily: number
): { allowed: boolean; reason?: string } {
  if (tracker.total >= maxDaily) {
    return {
      allowed: false,
      reason: `Daily response limit reached (${maxDaily})`,
    };
  }

  // Platform-specific sub-limits (prevent flooding one platform)
  const platformLimit = Math.ceil(maxDaily * 0.6); // No more than 60% on one platform
  if ((tracker.counts[platform] ?? 0) >= platformLimit) {
    return {
      allowed: false,
      reason: `Platform limit reached for ${platform} (${platformLimit})`,
    };
  }

  return { allowed: true };
}

/**
 * Creates a fresh daily tracker.
 */
export function createDailyTracker(): DailyResponseTracker {
  const today = new Date().toISOString().split("T")[0];
  return {
    date: today,
    counts: {} as Record<SocialPlatform, number>,
    total: 0,
  };
}

/**
 * Records a posted response in the tracker.
 */
export function recordResponse(
  tracker: DailyResponseTracker,
  platform: SocialPlatform
): DailyResponseTracker {
  return {
    ...tracker,
    counts: {
      ...tracker.counts,
      [platform]: (tracker.counts[platform] ?? 0) + 1,
    },
    total: tracker.total + 1,
  };
}

// ---------------------------------------------------------------------------
// Response formatting
// ---------------------------------------------------------------------------

/**
 * Formats a response for a specific platform.
 * Truncates if needed and adds platform-appropriate formatting.
 */
export function formatForPlatform(content: string, platform: SocialPlatform): string {
  const constraints = PLATFORM_CONSTRAINTS[platform];

  // Strip markdown first if platform doesn't support it
  let formatted = constraints.supportsMarkdown ? content : stripMarkdown(content);

  // Then truncate if needed
  if (formatted.length > constraints.maxLength) {
    formatted = formatted.slice(0, constraints.maxLength - 3) + "...";
  }

  return formatted;
}

/**
 * Strips markdown formatting from text.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1") // Bold
    .replace(/\*(.*?)\*/g, "$1") // Italic
    .replace(/`(.*?)`/g, "$1") // Inline code
    .replace(/```[\s\S]*?```/g, "") // Code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links
    .replace(/^#+\s/gm, "") // Headers
    .replace(/^[-*]\s/gm, "• ") // List items
    .trim();
}
