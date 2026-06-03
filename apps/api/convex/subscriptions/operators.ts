import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Real-time query for operators in a workspace
 */
export const operatorsQuery = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const operators = await ctx.db
      .query("operators")
      .withIndex("by_workspace", args.workspaceId)
      .collect();

    return operators;
  },
});

/**
 * Real-time query for a specific operator
 */
export const operatorQuery = query({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    if (!operator) {
      return null;
    }

    // Enrich with execution count
    const executions = await ctx.db
      .query("executions")
      .withIndex("by_operator", args.operatorId)
      .collect();

    return {
      ...operator,
      executionCount: executions.length,
    };
  },
});

/**
 * Real-time query for operators by status
 */
export const operatorsByStatusQuery = query({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const operators = await ctx.db
      .query("operators")
      .withIndex("by_workspace", args.workspaceId)
      .filter((op) => op.status === args.status)
      .collect();

    return operators;
  },
});
