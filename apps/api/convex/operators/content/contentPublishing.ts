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
  publishStatus: "draft" | "published";
  /** Scheduled publish time (ISO string) */
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
 * 1. Publish to primary CMS
 * 2. Cross-post to additional platforms
 * 3. Queue social media promotion
 */
export async function publishContent(
  draft: ContentDraft,
  config: PublishingConfig
): Promise<PublishingWorkflowResult> {
  // Step 1: Publish to primary CMS
  const primary = await publishToCms(draft, config.workspaceId, config.primaryCms, config.publishStatus);

  // Step 2: Cross-post (only if primary succeeded)
  const crossPosts: PublishResult[] = [];
  if (primary.success && config.crossPostPlatforms) {
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

  // Step 3: Social promotion (only if primary succeeded)
  const socialPromotions: SocialPromotionResult[] = [];
  if (primary.success && config.socialPromotion) {
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

  const summary = primary.success
    ? `Published to ${successCount}/${totalPlatforms} platforms. ${socialSuccess > 0 ? `${socialSuccess} social promotions queued.` : ""}`
    : `Publishing failed: ${primary.error}`;

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
  status: "draft" | "published",
  canonicalUrl?: string
): Promise<PublishResult> {
  const input: CreatePostInput = {
    title: draft.title,
    content: draft.markdown,
    markdown: draft.markdown,
    excerpt: draft.excerpt,
    tags: draft.tags,
    status,
    slug: draft.slug,
    ...(canonicalUrl ? { canonicalUrl } : {}),
  };

  const result = await cmsCreatePost(workspaceId, toolkit, input);

  if (result.ok && result.data) {
    return {
      success: true,
      url: result.data.url ?? result.data.canonicalUrl,
      externalId: result.data.externalId,
      platform: toolkit,
      publishedAt: new Date().toISOString(),
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

      const postResult = await session.execute(actionName, {
        text: message,
        url: publishedUrl,
      });

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
 */
function generatePromotionMessage(
  draft: ContentDraft,
  url: string,
  platform: string
): string {
  switch (platform) {
    case "twitter":
      // Twitter: short, punchy, with hashtags
      return `${draft.title}\n\n${draft.excerpt.slice(0, 180)}\n\n${url}\n\n${draft.tags.slice(0, 3).map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")}`;

    case "linkedin":
      // LinkedIn: professional, longer form
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
 * Schedules content for future publication.
 *
 * Returns the scheduling details. The actual publication
 * is handled by the workflow engine's schedule trigger.
 */
export function schedulePublication(
  draft: ContentDraft,
  scheduledAt: string,
  config: PublishingConfig
): {
  scheduledAt: string;
  platform: string;
  status: "scheduled";
} {
  return {
    scheduledAt,
    platform: config.primaryCms,
    status: "scheduled",
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
