"use node";

/**
 * Content Operator — Content Publishing
 *
 * Implements the content publishing workflow:
 * - CMS integration via Composio (WordPress, Ghost, Hashnode, Dev.to)
 * - Content scheduling
 * - Cross-posting to multiple platforms
 * - Social media promotion
 *
 * Phase 8.2.5 — Content Publishing
 */

import { cmsCreatePost, cmsUpdatePost, type CmsToolkit, type CreatePostInput } from "../../lib/integrations/cms";
import type { ContentDraft } from "../contentOperator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for content publishing. */
export interface PublishingConfig {
  /** Workspace ID for Composio session */
  workspaceId: string;
  /** Primary CMS to publish to */
  primaryCms: CmsToolkit;
  /** Additional platforms for cross-posting */
  crossPostPlatforms?: CmsToolkit[];
  /** Whether to publish immediately or as draft */
  publishStatus: "draft" | "published" | "scheduled";
  /** Scheduled publish time (ISO string). When set and in the future, overrides publishStatus to "scheduled". */
  scheduledAt?: string;
  /** Social media promotion config */
  socialPromotion?: SocialPromotionConfig;
}

/** Configuration for social media promotion. */
export interface SocialPromotionConfig {
  /** Platforms to promote on */
  platforms: ("twitter" | "linkedin" | "reddit" | "hackernews")[];
  /** Whether to auto-post or queue for approval */
  autoPost: boolean;
  /** Custom messages per platform (optional) */
  customMessages?: Partial<Record<string, string>>;
}

/** Result of a publish operation. */
export interface PublishResult {
  /** Whether the publish was successful */
  success: boolean;
  /** Published URL (if available) */
  url?: string;
  /** External post ID on the CMS */
  externalId?: string;
  /** Platform that was published to */
  platform: string;
  /** Error message (if failed) */
  error?: string;
  /** Timestamp of publication */
  publishedAt?: string;
}

/** Result of the full publishing workflow. */
export interface PublishingWorkflowResult {
  /** Primary publish result */
  primary: PublishResult;
  /** Cross-post results */
  crossPosts: PublishResult[];
  /** Social promotion results */
  socialPromotions: SocialPromotionResult[];
  /** Overall success */
  success: boolean;
  /** Summary message */
  summary: string;
}

/** Result of a social media promotion. */
export interface SocialPromotionResult {
  /** Platform */
  platform: string;
  /** Whether the post was created */
  success: boolean;
  /** Post URL (if available) */
  url?: string;
  /** Error message (if failed) */
  error?: string;
}

// ---------------------------------------------------------------------------
// Publishing Functions
// ---------------------------------------------------------------------------

/**
 * Publishes content through the full publishing workflow.
 *
 * 1. Publish to primary CMS (or schedule for future publication)
 * 2. Cross-post to additional platforms
 * 3. Queue social media promotion
 */
export async function publishContent(
  draft: ContentDraft,
  config: PublishingConfig
): Promise<PublishingWorkflowResult> {
  // Determine effective status: if scheduledAt is in the future, use "scheduled"
  let effectiveStatus = config.publishStatus;
  let scheduledAt: string | undefined;

  if (config.scheduledAt) {
    const scheduledTime = new Date(config.scheduledAt).getTime();
    if (scheduledTime > Date.now()) {
      effectiveStatus = "scheduled";
      scheduledAt = config.scheduledAt;
    }
    // If scheduledAt is in the past, publish immediately (effectiveStatus unchanged)
  }

  // Step 1: Publish to primary CMS
  const primary = await publishToCms(
    draft,
    config.workspaceId,
    config.primaryCms,
    effectiveStatus,
    undefined,
    scheduledAt
  );

  // Step 2: Cross-post (only if primary succeeded and not scheduled)
  const crossPosts: PublishResult[] = [];
  if (primary.success && config.crossPostPlatforms && effectiveStatus !== "scheduled") {
    for (const platform of config.crossPostPlatforms) {
      const result = await publishToCms(
        draft,
        config.workspaceId,
        platform,
        config.publishStatus,
        primary.url // Set canonical URL to primary
      );
      crossPosts.push(result);
    }
  }

  // Step 3: Social promotion (only if primary succeeded and published immediately)
  const socialPromotions: SocialPromotionResult[] = [];
  if (primary.success && config.socialPromotion && effectiveStatus !== "scheduled") {
    const promotions = await promoteSocially(
      draft,
      primary.url ?? "",
      config.workspaceId,
      config.socialPromotion
    );
    socialPromotions.push(...promotions);
  }

  // Build summary
  const successCount = [primary, ...crossPosts].filter((r) => r.success).length;
  const totalPlatforms = 1 + (config.crossPostPlatforms?.length ?? 0);
  const socialSuccess = socialPromotions.filter((r) => r.success).length;

  let summary: string;
  if (!primary.success) {
    summary = `Publishing failed: ${primary.error}`;
  } else if (effectiveStatus === "scheduled") {
    summary = `Scheduled for publication at ${scheduledAt} on ${config.primaryCms}.`;
  } else {
    summary = `Published to ${successCount}/${totalPlatforms} platforms.${socialSuccess > 0 ? ` ${socialSuccess} social promotions sent.` : ""}`;
  }

  return {
    primary,
    crossPosts,
    socialPromotions,
    success: primary.success,
    summary,
  };
}

/**
 * Publishes a draft to a specific CMS platform.
 */
async function publishToCms(
  draft: ContentDraft,
  workspaceId: string,
  toolkit: CmsToolkit,
  status: "draft" | "published" | "scheduled",
  canonicalUrl?: string,
  scheduledAt?: string
): Promise<PublishResult> {
  const input: CreatePostInput = {
    title: draft.title,
    content: draft.markdown,
    markdown: draft.markdown,
    excerpt: draft.excerpt,
    tags: draft.tags,
    status: status === "scheduled" ? "scheduled" : status,
    slug: draft.slug,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    ...(scheduledAt ? { scheduledAt } : {}),
  };

  const result = await cmsCreatePost(workspaceId, toolkit, input);

  if (result.ok && result.data) {
    return {
      success: true,
      url: result.data.url ?? result.data.canonicalUrl,
      externalId: result.data.externalId,
      platform: toolkit,
      publishedAt: scheduledAt ?? new Date().toISOString(),
    };
  }

  return {
    success: false,
    platform: toolkit,
    error: result.error ?? "Unknown publishing error",
  };
}

/**
 * Promotes content on social media platforms via Composio.
 *
 * Attempts to post to each configured platform using the workspace's
 * connected social integrations. Returns per-platform results with
 * actual success/failure status.
 */
async function promoteSocially(
  draft: ContentDraft,
  publishedUrl: string,
  workspaceId: string,
  config: SocialPromotionConfig
): Promise<SocialPromotionResult[]> {
  const { createComposioSession } = await import("../../lib/composio");
  const results: SocialPromotionResult[] = [];

  for (const platform of config.platforms) {
    const message =
      config.customMessages?.[platform] ??
      generatePromotionMessage(draft, publishedUrl, platform);

    try {
      const session = await createComposioSession(workspaceId, [platform]);
      const actionName = getSocialPostAction(platform);

      // For Twitter, the URL is passed separately (not in text body) so
      // Composio can attach it as a t.co-shortened link.
      // For other platforms, the URL is already in the message text.
      const params: Record<string, unknown> =
        platform === "twitter"
          ? { text: message, url: publishedUrl }
          : { text: message };

      const postResult = await session.execute(actionName, params);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const postData = postResult as any;
      results.push({
        platform,
        success: true,
        url: postData?.url ?? postData?.link ?? undefined,
      });
    } catch (error) {
      results.push({
        platform,
        success: false,
        error: error instanceof Error ? error.message : "Social posting failed",
      });
    }
  }

  return results;
}

/**
 * Maps a social platform to its Composio action name.
 */
function getSocialPostAction(platform: string): string {
  switch (platform) {
    case "twitter":
      return "TWITTER_CREATE_TWEET";
    case "linkedin":
      return "LINKEDIN_CREATE_POST";
    case "reddit":
      return "REDDIT_SUBMIT_LINK";
    case "hackernews":
      return "HACKERNEWS_SUBMIT";
    default:
      return `${platform.toUpperCase()}_CREATE_POST`;
  }
}

/**
 * Generates a platform-appropriate promotion message.
 *
 * For Twitter: the URL is NOT included in the text body — it's passed
 * separately via the `url` parameter to Composio, which attaches it as
 * a t.co-shortened link (23 chars). The text budget is 280 - 23 - 1 = 256 chars.
 */
function generatePromotionMessage(
  draft: ContentDraft,
  url: string,
  platform: string
): string {
  switch (platform) {
    case "twitter": {
      // Twitter: URL is passed separately (counts as 23 chars via t.co).
      // Budget: 280 - 23 (t.co link) - 1 (space before link) = 256 chars for text.
      const TWITTER_TEXT_BUDGET = 256;
      const hashtags = draft.tags
        .slice(0, 3)
        .map((t) => `#${t.replace(/\s+/g, "")}`)
        .join(" ");
      const title = draft.title.slice(0, 100);
      // Reserve space for title + newlines + hashtags
      const reservedChars = title.length + 2 + hashtags.length + 2; // "\n\n" between sections
      const excerptBudget = Math.max(0, TWITTER_TEXT_BUDGET - reservedChars);
      const excerpt = excerptBudget > 30 ? draft.excerpt.slice(0, excerptBudget) : "";

      const parts = [title];
      if (excerpt) parts.push(excerpt);
      if (hashtags) parts.push(hashtags);
      return parts.join("\n\n");
    }

    case "linkedin":
      // LinkedIn: professional, longer form. URL included in text (no char limit concern).
      return `📝 New article: ${draft.title}\n\n${draft.excerpt}\n\nKey takeaways:\n${draft.tags.slice(0, 5).map((t) => `• ${t}`).join("\n")}\n\nRead more: ${url}`;

    case "reddit":
      // Reddit: informative title, no self-promotion feel
      return draft.title;

    case "hackernews":
      // HN: just the title
      return draft.title;

    default:
      return `${draft.title} - ${url}`;
  }
}

/**
 * Creates scheduling metadata for future publication.
 *
 * This does NOT publish — it returns the scheduling details that the
 * workflow engine uses to defer the actual `publishContent` call.
 * The workflow engine's schedule trigger handles the delayed execution.
 *
 * To actually publish with scheduling, pass `scheduledAt` in the
 * `PublishingConfig` when calling `publishContent` — the CMS will
 * receive the scheduled status and date.
 */
export function schedulePublication(
  scheduledAt: string,
  config: PublishingConfig
): {
  scheduledAt: string;
  platform: string;
  status: "scheduled";
  workspaceId: string;
} {
  return {
    scheduledAt,
    platform: config.primaryCms,
    status: "scheduled",
    workspaceId: config.workspaceId,
  };
}

/**
 * Determines the optimal publish time based on analytics data.
 *
 * Uses past performance data to suggest the best day/time
 * for publishing content of this type.
 */
export function suggestPublishTime(
  contentType: string,
  timezone: string
): { dayOfWeek: string; hour: number; reason: string } {
  // Default optimal times based on content marketing research
  // These would be refined by the learning system over time
  const defaults: Record<string, { day: string; hour: number; reason: string }> = {
    blog_post: {
      day: "Tuesday",
      hour: 10,
      reason: "Tuesday mornings have highest engagement for blog content",
    },
    tutorial: {
      day: "Wednesday",
      hour: 9,
      reason: "Mid-week mornings work best for educational content",
    },
    documentation: {
      day: "Monday",
      hour: 11,
      reason: "Developers look for docs at the start of the work week",
    },
    guide: {
      day: "Thursday",
      hour: 10,
      reason: "Comprehensive guides perform well on Thursdays",
    },
    newsletter: {
      day: "Tuesday",
      hour: 8,
      reason: "Newsletters get highest open rates on Tuesday mornings",
    },
  };

  const suggestion = defaults[contentType] ?? defaults.blog_post;

  return {
    dayOfWeek: suggestion.day,
    hour: suggestion.hour,
    reason: `${suggestion.reason} (${timezone})`,
  };
}
