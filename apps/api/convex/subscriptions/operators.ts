import { v } from "convex/values";
import { subscription } from "../_generated/server";

/**
 * Real-time subscription for operators in a workspace
 * Returns operators list with real-time updates
 */
export const operatorsSubscription = subscription({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const operators = await ctx.db
      .query("operators")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    return operators;
  },
});

/**
 * Real-time subscription for a specific operator
 * Returns operator with real-time updates
 */
export const operatorSubscription = subscription({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    if (!operator) {
      return null;
    }
    return operator;
  },
});

/**
 * Real-time subscription for operators by status
 * Returns operators filtered by status with real-time updates
 */
export const operatorsByStatusSubscription = subscription({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const operators = await ctx.db
      .query("operators")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", args.status)
      )
      .collect();

    return operators;
  },
});
