"use node";

/**
 * CMS Abstraction Layer
 *
 * Provides a unified interface for content management operations across
 * WordPress, Ghost, Notion, Hashnode, Dev.to, and Medium via Composio.
 *
 * Operators use these functions instead of calling Composio directly,
 * getting a consistent API regardless of the underlying CMS platform.
 *
 * Each function:
 * 1. Creates a Composio session scoped to the workspace
 * 2. Gets the tools for the specific toolkit
 * 3. Executes the appropriate Composio action
 * 4. Normalizes the response into our standard types
 */

import type {
  IntegrationActionResult,
  ContentItem,
  PaginationParams,
  PaginatedResult,
} from "./types";
import { createComposioSession } from "../composio";

// ---------------------------------------------------------------------------
// CMS-specific types
// ---------------------------------------------------------------------------

/** A blog post or article across any CMS. */
export interface CmsPost extends ContentItem {
  /** Raw or HTML content body */
  content: string;
  /** Markdown content (if available) */
  markdown?: string;
  /** Post excerpt or summary */
  excerpt?: string;
  /** Tags or categories */
  tags?: string[];
  /** Publication status */
  status: "draft" | "published" | "scheduled" | "archived";
  /** Author name or ID */
  author?: string;
  /** Featured image URL */
  featuredImage?: string;
  /** SEO slug */
  slug?: string;
  /** Canonical URL */
  canonicalUrl?: string;
}

/** Input for creating a new post. */
export interface CreatePostInput {
  title: string;
  content: string;
  markdown?: string;
  excerpt?: string;
  tags?: string[];
  status?: "draft" | "published" | "scheduled";
  /** ISO date string for scheduled publication (CMS-dependent support) */
  scheduledAt?: string;
  featuredImage?: string;
  slug?: string;
  canonicalUrl?: string;
}

/** Input for updating an existing post. */
export interface UpdatePostInput {
  externalId: string;
  title?: string;
  content?: string;
  markdown?: string;
  excerpt?: string;
  tags?: string[];
  status?: "draft" | "published" | "archived";
  featuredImage?: string;
  slug?: string;
  canonicalUrl?: string;
}

// ---------------------------------------------------------------------------
// Supported CMS toolkits
// ---------------------------------------------------------------------------

export const CMS_TOOLKITS = [
  "wordpress",
  "ghost",
  "notion",
  "hashnode",
  "devto",
  "medium",
] as const;

export type CmsToolkit = (typeof CMS_TOOLKITS)[number];

/** Composio action names mapped per CMS toolkit. */
const CMS_ACTIONS: Record<
  CmsToolkit,
  {
    createPost: string;
    updatePost: string;
    deletePost: string;
    getPost: string;
    listPosts: string;
  }
> = {
  wordpress: {
    createPost: "WORDPRESS_CREATE_POST",
    updatePost: "WORDPRESS_UPDATE_POST",
    deletePost: "WORDPRESS_DELETE_POST",
    getPost: "WORDPRESS_GET_POST",
    listPosts: "WORDPRESS_LIST_POSTS",
  },
  ghost: {
    createPost: "GHOST_CREATE_POST",
    updatePost: "GHOST_UPDATE_POST",
    deletePost: "GHOST_DELETE_POST",
    getPost: "GHOST_GET_POST",
    listPosts: "GHOST_LIST_POSTS",
  },
  notion: {
    createPost: "NOTION_CREATE_PAGE",
    updatePost: "NOTION_UPDATE_PAGE",
    deletePost: "NOTION_ARCHIVE_PAGE",
    getPost: "NOTION_GET_PAGE",
    listPosts: "NOTION_SEARCH_PAGES",
  },
  hashnode: {
    createPost: "HASHNODE_CREATE_POST",
    updatePost: "HASHNODE_UPDATE_POST",
    deletePost: "HASHNODE_DELETE_POST",
    getPost: "HASHNODE_GET_POST",
    listPosts: "HASHNODE_LIST_POSTS",
  },
  devto: {
    createPost: "DEVTO_CREATE_ARTICLE",
    updatePost: "DEVTO_UPDATE_ARTICLE",
    deletePost: "DEVTO_DELETE_ARTICLE",
    getPost: "DEVTO_GET_ARTICLE",
    listPosts: "DEVTO_LIST_ARTICLES",
  },
  medium: {
    createPost: "MEDIUM_CREATE_POST",
    updatePost: "MEDIUM_CREATE_POST", // Medium doesn't support update
    deletePost: "MEDIUM_CREATE_POST", // Medium doesn't support delete
    getPost: "MEDIUM_GET_USER",
    listPosts: "MEDIUM_GET_USER",
  },
};

// ---------------------------------------------------------------------------
// CMS abstraction functions
// ---------------------------------------------------------------------------

/**
 * Creates a new post on the specified CMS platform.
 */
export async function cmsCreatePost(
  workspaceId: string,
  toolkit: CmsToolkit,
  input: CreatePostInput
): Promise<IntegrationActionResult<CmsPost>> {
  try {
    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = CMS_ACTIONS[toolkit].createPost;

    const result = await session.execute(actionName, {
      title: input.title,
      content: input.content ?? input.markdown,
      tags: input.tags?.join(","),
      status: input.status ?? "draft",
      ...(input.slug ? { slug: input.slug } : {}),
      ...(input.excerpt ? { excerpt: input.excerpt } : {}),
      ...(input.featuredImage ? { featured_image: input.featuredImage } : {}),
      ...(input.canonicalUrl ? { canonical_url: input.canonicalUrl } : {}),
      ...(input.scheduledAt ? { scheduled_at: input.scheduledAt, date: input.scheduledAt } : {}),
    });

    return {
      ok: true,
      data: normalizeCmsResponse(toolkit, result),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Updates an existing post on the specified CMS platform.
 */
export async function cmsUpdatePost(
  workspaceId: string,
  toolkit: CmsToolkit,
  input: UpdatePostInput
): Promise<IntegrationActionResult<CmsPost>> {
  try {
    if (toolkit === "medium") {
      return {
        ok: false,
        error: "Medium does not support post updates",
      };
    }

    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = CMS_ACTIONS[toolkit].updatePost;

    const result = await session.execute(actionName, {
      id: input.externalId,
      ...(input.title ? { title: input.title } : {}),
      ...(input.content ? { content: input.content } : {}),
      ...(input.tags ? { tags: input.tags.join(",") } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.slug ? { slug: input.slug } : {}),
      ...(input.excerpt ? { excerpt: input.excerpt } : {}),
      ...(input.featuredImage ? { featured_image: input.featuredImage } : {}),
    });

    return {
      ok: true,
      data: normalizeCmsResponse(toolkit, result),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Deletes (or archives) a post on the specified CMS platform.
 */
export async function cmsDeletePost(
  workspaceId: string,
  toolkit: CmsToolkit,
  externalId: string
): Promise<IntegrationActionResult<void>> {
  try {
    if (toolkit === "medium") {
      return {
        ok: false,
        error: "Medium does not support post deletion",
      };
    }

    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = CMS_ACTIONS[toolkit].deletePost;

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
 * Gets a single post by its external ID.
 */
export async function cmsGetPost(
  workspaceId: string,
  toolkit: CmsToolkit,
  externalId: string
): Promise<IntegrationActionResult<CmsPost>> {
  try {
    if (toolkit === "medium") {
      return {
        ok: false,
        error: "Medium does not support fetching individual posts",
      };
    }

    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = CMS_ACTIONS[toolkit].getPost;

    const result = await session.execute(actionName, {
      id: externalId,
    });

    return {
      ok: true,
      data: normalizeCmsResponse(toolkit, result),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Lists posts from the specified CMS platform.
 */
export async function cmsListPosts(
  workspaceId: string,
  toolkit: CmsToolkit,
  pagination?: PaginationParams
): Promise<IntegrationActionResult<PaginatedResult<CmsPost>>> {
  try {
    if (toolkit === "medium") {
      return {
        ok: false,
        error: "Medium does not support listing posts",
      };
    }

    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = CMS_ACTIONS[toolkit].listPosts;

    const limit = pagination?.limit ?? 20;

    const result = await session.execute(actionName, {
      ...(limit ? { limit } : {}),
      ...(pagination?.cursor ? { cursor: pagination.cursor } : {}),
    });

    // Filter out null/undefined items from the response
    const rawItems = Array.isArray(result) ? result : result ? [result] : [];
    const items = rawItems
      .filter((item: unknown) => item != null)
      .map((item: unknown) => normalizeCmsResponse(toolkit, item));

    // Detect pagination: if we got exactly `limit` items, there may be more
    const hasMore = items.length >= limit;

    return {
      ok: true,
      data: {
        items,
        hasMore,
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

/**
 * Normalizes a provider-specific response into our standard CmsPost type.
 * Each CMS returns data in a different shape — this maps them all to
 * a consistent structure.
 */
function normalizeCmsResponse(
  toolkit: CmsToolkit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any
): CmsPost {
  const data = raw?.data ?? raw?.response ?? raw ?? {};

  return {
    externalId: String(data.id ?? data.post_id ?? data.article_id ?? data.page_id ?? ""),
    title: String(data.title ?? data.name ?? ""),
    content: String(data.content ?? data.html ?? data.body_html ?? ""),
    markdown: data.markdown ?? data.body_markdown ?? undefined,
    excerpt: data.excerpt ?? data.description ?? data.custom_excerpt ?? undefined,
    tags: Array.isArray(data.tags)
      ? data.tags.map((t: unknown) =>
          typeof t === "string" ? t : ((t as { name?: string })?.name ?? "")
        )
      : data.tag_list
        ? String(data.tag_list)
            .split(",")
            .map((s: string) => s.trim())
        : undefined,
    status: normalizeStatus(data.status ?? data.published ?? "draft"),
    author: data.author ?? data.user?.name ?? data.user?.username ?? undefined,
    featuredImage: data.featured_image ?? data.cover_image ?? data.feature_image ?? undefined,
    slug: data.slug ?? undefined,
    url: data.url ?? data.canonical_url ?? data.link ?? undefined,
    canonicalUrl: data.canonical_url ?? undefined,
    createdAt: data.created_at ?? data.createdTime ?? undefined,
    updatedAt: data.updated_at ?? data.last_edited_time ?? data.edited_at ?? undefined,
  };
}

function normalizeStatus(raw: unknown): "draft" | "published" | "scheduled" | "archived" {
  const s = String(raw).toLowerCase();
  if (s === "publish" || s === "published" || s === "true" || s === "1") return "published";
  if (s === "scheduled" || s === "future") return "scheduled";
  if (s === "archived" || s === "trashed" || s === "trash") return "archived";
  return "draft";
}
