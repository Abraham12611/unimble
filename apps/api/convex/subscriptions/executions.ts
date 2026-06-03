import { v } from "convex/values";
import { subscription } from "../_generated/server";

/**
 * Real-time subscription for executions in a workspace
 * Returns executions list with real-time updates
 */
export const executionsSubscription = subscription({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const executions = await ctx.db
      .query("executions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // Enrich with workflow and operator details
    const enrichedExecutions = await Promise.all(
      executions.map(async (execution) => {
        const workflow = await ctx.db.get(execution.workflowId);
        const operator = execution.operatorId ? await ctx.db.get(execution.operatorId) : null;
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
 * Real-time subscription for a specific execution
 * Returns execution with real-time updates
 */
export const executionSubscription = subscription({
  args: { executionId: v.id("executions") },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) {
      return null;
    }

    // Enrich with workflow and operator details
    const workflow = await ctx.db.get(execution.workflowId);
    const operator = execution.operatorId ? await ctx.db.get(execution.operatorId) : null;

    return {
      ...execution,
      workflow,
      operator,
    };
  },
});

/**
 * Real-time subscription for execution steps
 * Returns steps of an execution with real-time updates
 */
export const executionStepsSubscription = subscription({
  args: { executionId: v.id("executions") },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query("executionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .collect();

    return steps;
  },
});

/**
 * Real-time subscription for executions by status
 * Returns executions filtered by status with real-time updates
 */
export const executionsByStatusSubscription = subscription({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const executions = await ctx.db
      .query("executions")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", args.status)
      )
      .collect();

    return executions;
  },
});

/**
 * Real-time subscription for pending approvals
 * Returns pending approvals for a user with real-time updates
 */
export const pendingApprovalsSubscription = subscription({
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

    // Get user's workspaces
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const workspaceIds = memberships.map((m) => m.workspaceId);

    // Get pending approvals for user's workspaces
    const approvals = await Promise.all(
      workspaceIds.map(async (workspaceId) => {
        const workspaceApprovals = await ctx.db
          .query("approvals")
          .withIndex("by_status", (q) => q.eq("status", "pending"))
          .collect();

        // Filter by workspace and enrich with execution details
        const filteredApprovals = await Promise.all(
          workspaceApprovals.map(async (approval) => {
            const execution = await ctx.db.get(approval.executionId);
            if (execution && execution.workspaceId === workspaceId) {
              return {
                ...approval,
                execution,
                workspaceId,
              };
            }
            return null;
          })
        );

        return filteredApprovals.filter(Boolean);
      })
    );

    return approvals.flat();
  },
});
