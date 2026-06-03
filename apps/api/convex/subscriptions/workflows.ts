import { v } from "convex/values";
import { subscription } from "../_generated/server";

/**
 * Real-time subscription for workflows in a workspace
 * Returns workflows list with real-time updates
 */
export const workflowsSubscription = subscription({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    return workflows;
  },
});

/**
 * Real-time subscription for a specific workflow
 * Returns workflow with real-time updates
 */
export const workflowSubscription = subscription({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) {
      return null;
    }
    return workflow;
  },
});

/**
 * Real-time subscription for workflow versions
 * Returns versions of a workflow with real-time updates
 */
export const workflowVersionsSubscription = subscription({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const versions = await ctx.db
      .query("workflowVersions")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();

    return versions;
  },
});

/**
 * Real-time subscription for workflows by status
 * Returns workflows filtered by status with real-time updates
 */
export const workflowsByStatusSubscription = subscription({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", args.status)
      )
      .collect();

    return workflows;
  },
});
