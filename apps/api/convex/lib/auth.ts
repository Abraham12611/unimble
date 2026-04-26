/**
 * Shared authentication and authorization helpers.
 *
 * All workspace-scoped queries and mutations should use these helpers
 * instead of duplicating the logic in each module.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizePlatformRole } from "../rbac";

export async function getCurrentUserOrThrow(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const clerkId = String(identity.subject ?? "").trim();
  if (!clerkId) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  const role = normalizePlatformRole(user.role);
  const isAdmin = role === "creator";

  return { user, isAdmin };
}

export async function requireWorkspaceAccess(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
) {
  const { user, isAdmin } = await getCurrentUserOrThrow(ctx);

  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const isOwner = workspace.ownerId === user._id;

  let isMember = false;
  let memberRole: string | undefined;
  if (!isAdmin && !isOwner) {
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", user._id)
      )
      .unique();
    isMember = Boolean(membership);
    memberRole = membership?.role;

    if (!isMember) {
      throw new Error("Forbidden");
    }
  } else if (isOwner) {
    memberRole = "owner";
  }

  return { workspace, user, isAdmin, isOwner, isMember, memberRole };
}

export async function requireWorkspaceOwner(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
) {
  const access = await requireWorkspaceAccess(ctx, workspaceId);
  if (!access.isAdmin && !access.isOwner) {
    throw new Error("Forbidden");
  }

  return access;
}

/**
 * Requires workspace owner, workspace admin role, or platform creator.
 * Use for team management and execution management operations.
 */
export async function requireWorkspaceOwnerOrAdmin(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
) {
  const access = await requireWorkspaceAccess(ctx, workspaceId);
  if (!access.isAdmin && !access.isOwner && access.memberRole !== "admin") {
    throw new Error("Forbidden");
  }

  return access;
}

/**
 * Requires workspace access with at least member role.
 * Members can run operators and manage executions.
 * Use for execution creation and operator run operations.
 */
export async function requireWorkspaceMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
) {
  // requireWorkspaceAccess already ensures the user is at least a member
  return await requireWorkspaceAccess(ctx, workspaceId);
}

export function slugify(input: string) {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base.length > 0 ? base : "workspace";
}
