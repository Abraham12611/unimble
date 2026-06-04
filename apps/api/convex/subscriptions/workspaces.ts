import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { requireWorkspaceAccess } from "../lib/auth";

/**
 * Real-time query for workspace updates
 * Returns workspace data with real-time updates
 */
export const workspaceQuery = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    // Authorize workspace access
    const { workspace } = await requireWorkspaceAccess(ctx, args.workspaceId);

    // Enrich with member count
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    return {
      ...workspace,
      memberCount: members.length,
    };
  },
});

/**
 * Real-time query for all user's workspaces
 */
export const userWorkspacesQuery = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject as Id<"users">;
    if (!userId) {
      return [];
    }

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const workspaceIds = memberships.map((m) => m.workspaceId);
    const workspaces = await Promise.all(workspaceIds.map((id) => ctx.db.get(id)));

    return workspaces.filter(Boolean);
  },
});

/**
 * Real-time query for workspace members
 */
export const workspaceMembersQuery = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    // Authorize workspace access
    await requireWorkspaceAccess(ctx, args.workspaceId);

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // Enrich with user details
    const enrichedMembers = await Promise.all(
      members.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        return {
          ...member,
          user,
        };
      })
    );

    return enrichedMembers;
  },
});
