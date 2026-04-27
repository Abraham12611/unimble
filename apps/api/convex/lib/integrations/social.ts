"use node";

/**
 * Social Media Abstraction Layer
 *
 * Provides a unified interface for social media operations across
 * Twitter/X, LinkedIn, Reddit, Discord, and Slack via Composio.
 *
 * Operators use these functions to post content, reply to threads,
 * and track engagement across platforms with a consistent API.
 */

import type { IntegrationActionResult, ContentItem } from "./types";
import { createComposioSession } from "../composio";

// ---------------------------------------------------------------------------
// Social-specific types
// ---------------------------------------------------------------------------

/** A social media post across any platform. */
export interface SocialPost extends ContentItem {
  /** Text content of the post */
  content: string;
  /** Platform-specific post type */
  postType: "post" | "thread" | "reply" | "article" | "message";
  /** Media attachments (image/video URLs) */
  mediaUrls?: string[];
  /** Parent post ID (for replies/threads) */
  parentId?: string;
  /** Engagement metrics */
  engagement?: {
    likes?: number;
    shares?: number;
    comments?: number;
    views?: number;
  };
  /** Author handle or username */
  authorHandle?: string;
  /** Platform name for display */
  platform?: string;
}

/** Input for creating a social post. */
export interface CreateSocialPostInput {
  /** Text content */
  content: string;
  /** Media URLs to attach */
  mediaUrls?: string[];
  /** Parent post ID for replies */
  parentId?: string;
  /** Schedule for later (ISO timestamp) */
  scheduledAt?: string;
  /** Platform-specific options */
  options?: Record<string, unknown>;
}

/** Input for replying to a post. */
export interface ReplyToPostInput {
  /** ID of the post to reply to */
  parentId: string;
  /** Reply content */
  content: string;
  /** Media URLs to attach */
  mediaUrls?: string[];
}

/** Engagement data for tracking. */
export interface EngagementData {
  postId: string;
  platform: string;
  likes: number;
  shares: number;
  comments: number;
  views: number;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Supported social toolkits
// ---------------------------------------------------------------------------

export const SOCIAL_TOOLKITS = ["twitter", "linkedin", "reddit", "discord", "slack"] as const;

export type SocialToolkit = (typeof SOCIAL_TOOLKITS)[number];

/** Composio action names mapped per social toolkit. */
const SOCIAL_ACTIONS: Record<
  SocialToolkit,
  {
    createPost: string;
    replyToPost: string;
    getPost: string;
    deletePost: string;
    getEngagement?: string;
  }
> = {
  twitter: {
    createPost: "TWITTER_CREATE_TWEET",
    replyToPost: "TWITTER_REPLY_TO_TWEET",
    getPost: "TWITTER_GET_TWEET",
    deletePost: "TWITTER_DELETE_TWEET",
    getEngagement: "TWITTER_GET_TWEET",
  },
  linkedin: {
    createPost: "LINKEDIN_CREATE_POST",
    replyToPost: "LINKEDIN_COMMENT_ON_POST",
    getPost: "LINKEDIN_GET_POST",
    deletePost: "LINKEDIN_DELETE_POST",
  },
  reddit: {
    createPost: "REDDIT_SUBMIT_POST",
    replyToPost: "REDDIT_REPLY_TO_POST",
    getPost: "REDDIT_GET_POST",
    deletePost: "REDDIT_DELETE_POST",
  },
  discord: {
    createPost: "DISCORD_SEND_MESSAGE",
    replyToPost: "DISCORD_SEND_MESSAGE",
    getPost: "DISCORD_GET_MESSAGE",
    deletePost: "DISCORD_DELETE_MESSAGE",
  },
  slack: {
    createPost: "SLACK_SEND_MESSAGE",
    replyToPost: "SLACK_REPLY_TO_THREAD",
    getPost: "SLACK_GET_MESSAGE",
    deletePost: "SLACK_DELETE_MESSAGE",
  },
};

// ---------------------------------------------------------------------------
// Social abstraction functions
// ---------------------------------------------------------------------------

/**
 * Creates a new post on the specified social platform.
 */
export async function socialCreatePost(
  workspaceId: string,
  toolkit: SocialToolkit,
  input: CreateSocialPostInput
): Promise<IntegrationActionResult<SocialPost>> {
  try {
    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = SOCIAL_ACTIONS[toolkit].createPost;

    const result = await session.execute(actionName, {
      text: input.content,
      content: input.content,
      ...(input.mediaUrls?.length ? { media_urls: input.mediaUrls } : {}),
      ...(input.parentId ? { reply_to: input.parentId } : {}),
      ...(input.options ?? {}),
    });

    return {
      ok: true,
      data: normalizeSocialResponse(toolkit, result),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Replies to an existing post on the specified social platform.
 */
export async function socialReplyToPost(
  workspaceId: string,
  toolkit: SocialToolkit,
  input: ReplyToPostInput
): Promise<IntegrationActionResult<SocialPost>> {
  try {
    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = SOCIAL_ACTIONS[toolkit].replyToPost;

    const result = await session.execute(actionName, {
      text: input.content,
      content: input.content,
      reply_to: input.parentId,
      parent_id: input.parentId,
      thread_ts: input.parentId, // Slack uses thread_ts
      ...(input.mediaUrls?.length ? { media_urls: input.mediaUrls } : {}),
    });

    return {
      ok: true,
      data: normalizeSocialResponse(toolkit, result, "reply"),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Deletes a post on the specified social platform.
 */
export async function socialDeletePost(
  workspaceId: string,
  toolkit: SocialToolkit,
  externalId: string
): Promise<IntegrationActionResult<void>> {
  try {
    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = SOCIAL_ACTIONS[toolkit].deletePost;

    await session.execute(actionName, { id: externalId });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Gets engagement metrics for a post.
 */
export async function socialGetEngagement(
  workspaceId: string,
  toolkit: SocialToolkit,
  externalId: string
): Promise<IntegrationActionResult<EngagementData>> {
  try {
    const actionName = SOCIAL_ACTIONS[toolkit].getEngagement;
    if (!actionName) {
      return {
        ok: false,
        error: `Engagement tracking not supported for ${toolkit}`,
      };
    }

    const session = await createComposioSession(workspaceId, [toolkit]);
    const result = await session.execute(actionName, {
      id: externalId,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data ?? result ?? {};

    return {
      ok: true,
      data: {
        postId: externalId,
        platform: toolkit,
        likes: Number(data.favorite_count ?? data.like_count ?? data.likes ?? data.score ?? 0),
        shares: Number(data.retweet_count ?? data.share_count ?? data.shares ?? 0),
        comments: Number(
          data.reply_count ?? data.comment_count ?? data.comments ?? data.num_comments ?? 0
        ),
        views: Number(data.impression_count ?? data.views ?? data.view_count ?? 0),
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Response normalization
// ---------------------------------------------------------------------------

function normalizeSocialResponse(
  toolkit: SocialToolkit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
  postType: SocialPost["postType"] = "post"
): SocialPost {
  const data = raw?.data ?? raw?.response ?? raw ?? {};

  return {
    externalId: String(data.id ?? data.tweet_id ?? data.message_id ?? data.ts ?? ""),
    title: "",
    content: String(data.text ?? data.content ?? data.body ?? data.message ?? ""),
    postType,
    mediaUrls: data.media_urls ?? data.attachments ?? undefined,
    parentId: data.in_reply_to_status_id ?? data.parent_id ?? data.thread_ts ?? undefined,
    engagement: {
      likes: Number(data.favorite_count ?? data.like_count ?? data.score ?? 0),
      shares: Number(data.retweet_count ?? data.share_count ?? 0),
      comments: Number(data.reply_count ?? data.comment_count ?? data.num_comments ?? 0),
      views: Number(data.impression_count ?? data.views ?? 0),
    },
    authorHandle: data.user?.screen_name ?? data.author?.username ?? data.username ?? undefined,
    platform: toolkit,
    url: data.url ?? undefined,
    createdAt: data.created_at ?? data.timestamp ?? data.ts ?? undefined,
  };
}
