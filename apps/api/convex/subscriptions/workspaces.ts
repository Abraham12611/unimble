import { v } from "convex/values";
import { subscription } from "../_generated/server";

/**
 * Real-time subscription for workspace updates
 * Subscribes to a specific workspace and returns real-time updates
 */
export const workspaceSubscription = subscription({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) {
      return null;
    }
    return workspace;
  },
});

/**
 * Real-time subscription for all workspaces a user has access to
 * Returns a list of workspaces with real-time updates
 */
export const userWorkspacesSubscription = subscription({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const clerkId = String(identity.subject ?? "").trim();
    if (!clerkId) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) {
      return [];
    }

    // Get owned workspaces
    const ownedWorkspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    // Get workspaces where user is a member
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const memberWorkspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId);
        return workspace;
      })
    );

    // Combine and deduplicate
    const allWorkspaces = [...ownedWorkspaces, ...memberWorkspaces.filter(Boolean)];
    const uniqueWorkspaces = allWorkspaces.filter(
      (workspace, index, self) =>
        workspace && self.findIndex((w) => w?._id === workspace._id) === index
    );

    return uniqueWorkspaces;
  },
});

/**
 * Real-time subscription for workspace members
 * Returns member list with real-time updates
 */
export const workspaceMembersSubscription = subscription({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // Enrich with user details
    const enrichedMembers = await Promise.all(
      members.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        const invitedBy = member.invitedBy ? await ctx.db.get(member.invitedBy) : null;
        return {
          ...member,
          user,
          invitedBy,
        };
      })
    );

    return enrichedMembers;
  },
});
