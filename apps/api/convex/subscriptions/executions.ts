import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireWorkspaceAccess } from "../lib/auth";

/**
 * Real-time query for executions in a workspace
 */
export const executionsQuery = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    // Authorize workspace access
    await requireWorkspaceAccess(ctx, args.workspaceId);

    const executions = await ctx.db
      .query("executions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(50);

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

    // Authorize workspace access
    await requireWorkspaceAccess(ctx, execution.workspaceId);

    // Get related data
    const workflow = await ctx.db.get(execution.workflowId);
    const operator = await ctx.db.get(execution.operatorId);
    const steps = await ctx.db
      .query("executionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
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
    const execution = await ctx.db.get(args.executionId);
    if (!execution) {
      return [];
    }

    // Authorize workspace access
    await requireWorkspaceAccess(ctx, execution.workspaceId);

    const steps = await ctx.db
      .query("executionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
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
    // Authorize workspace access
    await requireWorkspaceAccess(ctx, args.workspaceId);

    const executions = await ctx.db
      .query("executions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("status"), args.status))
      .order("desc")
      .take(50);

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
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const workspaceIds = memberships.map((m) => m.workspaceId);

    // Get all pending approvals once (more efficient)
    const allPendingApprovals = await ctx.db
      .query("approvals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    // Get executions for these approvals
    const executionIds = [...new Set(allPendingApprovals.map((a) => a.executionId))];
    const executions = await Promise.all(executionIds.map((id) => ctx.db.get(id)));

    // Filter executions to user's workspaces and check for pending approvals
    const results = executions
      .filter(Boolean)
      .filter((execution) => workspaceIds.includes(execution.workspaceId))
      .map((execution) => {
        const approvals = allPendingApprovals.filter((a) => a.executionId === execution._id);
        return {
          execution,
          approvals,
        };
      })
      .filter((r) => r.approvals.length > 0);

    return results;
  },
});
