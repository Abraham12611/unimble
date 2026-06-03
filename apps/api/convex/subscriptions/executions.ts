import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Real-time query for executions in a workspace
 */
export const executionsQuery = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const executions = await ctx.db
      .query("executions")
      .withIndex("by_workspace", args.workspaceId)
      .order("desc")
      .take(50)
      .collect();

    // Enrich with workflow and operator details
    const enrichedExecutions = await Promise.all(
      executions.map(async (execution) => {
        const workflow = await ctx.db.get(execution.workflowId);
        const operator = await ctx.db.get(execution.operatorId);

        return {
          ...execution,
          workflow,
          operator,
        };
      })
    );

    return enrichedExecutions;
  },
});

/**
 * Real-time query for a specific execution
 */
export const executionQuery = query({
  args: { executionId: v.id("executions") },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) {
      return null;
    }

    // Get related data
    const workflow = await ctx.db.get(execution.workflowId);
    const operator = await ctx.db.get(execution.operatorId);
    const steps = await ctx.db
      .query("executionSteps")
      .withIndex("by_execution", args.executionId)
      .order("asc")
      .collect();

    return {
      ...execution,
      workflow,
      operator,
      steps,
    };
  },
});

/**
 * Real-time query for execution steps
 */
export const executionStepsQuery = query({
  args: { executionId: v.id("executions") },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query("executionSteps")
      .withIndex("by_execution", args.executionId)
      .order("asc")
      .collect();

    return steps;
  },
});

/**
 * Real-time query for executions by status
 */
export const executionsByStatusQuery = query({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const executions = await ctx.db
      .query("executions")
      .withIndex("by_workspace", args.workspaceId)
      .filter((ex) => ex.status === args.status)
      .order("desc")
      .take(50)
      .collect();

    return executions;
  },
});

/**
 * Real-time query for pending approvals
 */
export const pendingApprovalsQuery = query({
  args: {},
  handler: async (ctx) => {
    const userId = ctx.auth.getUserId();
    if (!userId) {
      return [];
    }

    // Get user's workspaces
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", userId)
      .collect();

    const workspaceIds = memberships.map((m) => m.workspaceId);

    // Get executions in user's workspaces that need approval
    const executions = await ctx.db
      .query("executions")
      .collect()
      .then((exs) =>
        exs.filter(
          (ex) => workspaceIds.includes(ex.workspaceId) && ex.status === "awaiting_approval"
        )
      );

    // Get approvals for these executions
    const approvalPromises = executions.map(async (execution) => {
      const approvals = await ctx.db
        .query("approvals")
        .withIndex("by_execution", execution._id)
        .collect();

      return {
        execution,
        approvals: approvals.filter((a) => a.status === "pending"),
      };
    });

    const results = await Promise.all(approvalPromises);

    // Filter to only show executions with pending approvals
    return results.filter((r) => r.approvals.length > 0);
  },
});
