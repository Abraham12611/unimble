import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Real-time query for workspace updates
 * Returns workspace data with real-time updates
 */
export const workspaceQuery = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) {
      return null;
    }

    // Enrich with member count
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", args.workspaceId)
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
    const userId = ctx.auth.getUserId();
    if (!userId) {
      return [];
    }

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", userId)
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
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", args.workspaceId)
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
