"use node";

/**
 * Developer Platforms Abstraction Layer
 *
 * Provides a unified interface for developer platform operations across
 * GitHub, GitLab, Dev.to, Hashnode, and Medium via Composio.
 *
 * Covers two main use cases:
 * 1. Code platforms (GitHub, GitLab): issues, PRs, repos
 * 2. Dev blogs (Dev.to, Hashnode, Medium): article publishing
 *
 * Dev blog publishing overlaps with the CMS layer — this module
 * focuses on the developer-specific actions (issues, PRs, repos)
 * while the CMS layer handles the content publishing side.
 */

import type { IntegrationActionResult, ContentItem } from "./types";
import { createComposioSession } from "../composio";

// ---------------------------------------------------------------------------
// Dev platform types
// ---------------------------------------------------------------------------

/** A GitHub/GitLab issue. */
export interface DevIssue extends ContentItem {
  /** Issue number */
  number: number;
  /** Issue body/description */
  body: string;
  /** Issue state */
  state: "open" | "closed";
  /** Labels */
  labels?: string[];
  /** Assignees */
  assignees?: string[];
  /** Repository (owner/repo format) */
  repository: string;
  /** Author username */
  author?: string;
  /** Comment count */
  commentCount?: number;
}

/** Input for creating an issue. */
export interface CreateIssueInput {
  /** Repository in owner/repo format */
  repository: string;
  /** Issue title */
  title: string;
  /** Issue body (markdown) */
  body: string;
  /** Labels to apply */
  labels?: string[];
  /** Assignees (usernames) */
  assignees?: string[];
}

/** A pull request / merge request. */
export interface DevPullRequest extends ContentItem {
  /** PR number */
  number: number;
  /** PR body/description */
  body: string;
  /** PR state */
  state: "open" | "closed" | "merged";
  /** Source branch */
  sourceBranch: string;
  /** Target branch */
  targetBranch: string;
  /** Repository (owner/repo format) */
  repository: string;
  /** Author username */
  author?: string;
  /** Review status */
  reviewStatus?: "pending" | "approved" | "changes_requested";
  /** Is draft */
  isDraft?: boolean;
}

/** A repository. */
export interface DevRepository extends ContentItem {
  /** Full name (owner/repo) */
  fullName: string;
  /** Description */
  description: string;
  /** Primary language */
  language?: string;
  /** Star count */
  stars?: number;
  /** Fork count */
  forks?: number;
  /** Open issue count */
  openIssues?: number;
  /** Is private */
  isPrivate?: boolean;
  /** Default branch */
  defaultBranch?: string;
}

// ---------------------------------------------------------------------------
// Supported dev platform toolkits
// ---------------------------------------------------------------------------

export const DEV_PLATFORM_TOOLKITS = ["github", "gitlab"] as const;

export type DevPlatformToolkit = (typeof DEV_PLATFORM_TOOLKITS)[number];

/** Composio action names mapped per dev platform toolkit. */
const DEV_ACTIONS: Record<
  DevPlatformToolkit,
  {
    createIssue: string;
    getIssue: string;
    listIssues: string;
    closeIssue: string;
    createPr: string;
    getPr: string;
    listPrs: string;
    getRepo: string;
    listRepos: string;
  }
> = {
  github: {
    createIssue: "GITHUB_CREATE_ISSUE",
    getIssue: "GITHUB_GET_ISSUE",
    listIssues: "GITHUB_LIST_ISSUES",
    closeIssue: "GITHUB_UPDATE_ISSUE",
    createPr: "GITHUB_CREATE_PULL_REQUEST",
    getPr: "GITHUB_GET_PULL_REQUEST",
    listPrs: "GITHUB_LIST_PULL_REQUESTS",
    getRepo: "GITHUB_GET_REPOSITORY",
    listRepos: "GITHUB_LIST_REPOSITORIES",
  },
  gitlab: {
    createIssue: "GITLAB_CREATE_ISSUE",
    getIssue: "GITLAB_GET_ISSUE",
    listIssues: "GITLAB_LIST_ISSUES",
    closeIssue: "GITLAB_UPDATE_ISSUE",
    createPr: "GITLAB_CREATE_MERGE_REQUEST",
    getPr: "GITLAB_GET_MERGE_REQUEST",
    listPrs: "GITLAB_LIST_MERGE_REQUESTS",
    getRepo: "GITLAB_GET_PROJECT",
    listRepos: "GITLAB_LIST_PROJECTS",
  },
};

// ---------------------------------------------------------------------------
// Dev platform abstraction functions
// ---------------------------------------------------------------------------

/**
 * Validates and parses a repository string in "owner/repo" format.
 * Returns an error result if the format is invalid.
 */
function parseRepository(
  repository: string
): { ok: true; owner: string; repo: string } | { ok: false; error: string } {
  const slashIndex = repository.indexOf("/");
  if (slashIndex <= 0 || slashIndex === repository.length - 1) {
    return {
      ok: false,
      error: `Invalid repository format "${repository}". Expected "owner/repo".`,
    };
  }
  return {
    ok: true,
    owner: repository.substring(0, slashIndex),
    repo: repository.substring(slashIndex + 1),
  };
}

/**
 * Creates a new issue on the specified dev platform.
 */
export async function devCreateIssue(
  workspaceId: string,
  toolkit: DevPlatformToolkit,
  input: CreateIssueInput
): Promise<IntegrationActionResult<DevIssue>> {
  try {
    const parsed = parseRepository(input.repository);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = DEV_ACTIONS[toolkit].createIssue;

    const result = await session.execute(actionName, {
      owner: parsed.owner,
      repo: parsed.repo,
      title: input.title,
      body: input.body,
      ...(input.labels?.length ? { labels: input.labels } : {}),
      ...(input.assignees?.length ? { assignees: input.assignees } : {}),
    });

    return {
      ok: true,
      data: normalizeIssueResponse(toolkit, result, input.repository),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Lists issues for a repository.
 */
export async function devListIssues(
  workspaceId: string,
  toolkit: DevPlatformToolkit,
  repository: string,
  state?: "open" | "closed" | "all"
): Promise<IntegrationActionResult<DevIssue[]>> {
  try {
    const parsed = parseRepository(repository);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = DEV_ACTIONS[toolkit].listIssues;

    const result = await session.execute(actionName, {
      owner: parsed.owner,
      repo: parsed.repo,
      state: state ?? "open",
    });

    // Filter out null/undefined items
    const rawItems = Array.isArray(result) ? result : result ? [result] : [];
    const items = rawItems
      .filter((item: unknown) => item != null)
      .map((item: unknown) => normalizeIssueResponse(toolkit, item, repository));

    return { ok: true, data: items };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Closes an issue on the specified dev platform.
 */
export async function devCloseIssue(
  workspaceId: string,
  toolkit: DevPlatformToolkit,
  repository: string,
  issueNumber: number
): Promise<IntegrationActionResult<void>> {
  try {
    const parsed = parseRepository(repository);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = DEV_ACTIONS[toolkit].closeIssue;

    await session.execute(actionName, {
      owner: parsed.owner,
      repo: parsed.repo,
      issue_number: issueNumber,
      state: "closed",
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Lists repositories for the authenticated user.
 */
export async function devListRepos(
  workspaceId: string,
  toolkit: DevPlatformToolkit
): Promise<IntegrationActionResult<DevRepository[]>> {
  try {
    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = DEV_ACTIONS[toolkit].listRepos;

    const result = await session.execute(actionName, {});

    const rawItems = Array.isArray(result) ? result : result ? [result] : [];
    const items = rawItems
      .filter((item: unknown) => item != null)
      .map((item: unknown) => normalizeRepoResponse(toolkit, item));

    return { ok: true, data: items };
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

function normalizeIssueResponse(
  _toolkit: DevPlatformToolkit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
  repository: string
): DevIssue {
  const data = raw?.data ?? raw?.response ?? raw ?? {};

  return {
    externalId: String(data.id ?? data.iid ?? ""),
    title: String(data.title ?? ""),
    body: String(data.body ?? data.description ?? ""),
    number: Number(data.number ?? data.iid ?? 0),
    state: data.state === "closed" ? "closed" : "open",
    labels: Array.isArray(data.labels)
      ? data.labels.map((l: unknown) =>
          typeof l === "string" ? l : ((l as { name?: string })?.name ?? "")
        )
      : undefined,
    assignees: Array.isArray(data.assignees)
      ? data.assignees.map(
          (a: unknown) =>
            (a as { login?: string; username?: string })?.login ??
            (a as { username?: string })?.username ??
            ""
        )
      : undefined,
    repository,
    author: data.user?.login ?? data.author?.username ?? undefined,
    commentCount: data.comments ?? data.user_notes_count ?? undefined,
    url: data.html_url ?? data.web_url ?? undefined,
    createdAt: data.created_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
  };
}

function normalizeRepoResponse(
  _toolkit: DevPlatformToolkit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any
): DevRepository {
  const data = raw?.data ?? raw?.response ?? raw ?? {};

  return {
    externalId: String(data.id ?? ""),
    title: String(data.name ?? ""),
    fullName: String(data.full_name ?? data.path_with_namespace ?? ""),
    description: String(data.description ?? ""),
    language: data.language ?? undefined,
    stars: data.stargazers_count ?? data.star_count ?? undefined,
    forks: data.forks_count ?? data.forks ?? undefined,
    openIssues: data.open_issues_count ?? data.open_issues ?? undefined,
    isPrivate: data.private ?? data.visibility === "private",
    defaultBranch: data.default_branch ?? data.default_branch_name ?? undefined,
    url: data.html_url ?? data.web_url ?? undefined,
    createdAt: data.created_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
  };
}
