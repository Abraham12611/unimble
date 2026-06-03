import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireWorkspaceAccess } from "../lib/auth";

/**
 * Real-time query for workflows in a workspace
 */
export const workflowsQuery = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    // Authorize workspace access
    await requireWorkspaceAccess(ctx, args.workspaceId);

    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // Enrich with execution counts
    const enrichedWorkflows = await Promise.all(
      workflows.map(async (workflow) => {
        const executions = await ctx.db
          .query("executions")
          .withIndex("by_workflow", (q) => q.eq("workflowId", workflow._id))
          .collect();

        return {
          ...workflow,
          executionCount: executions.length,
        };
      })
    );

    return enrichedWorkflows;
  },
});

/**
 * Real-time query for a specific workflow
 */
export const workflowQuery = query({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) {
      return null;
    }

    // Authorize workspace access
    await requireWorkspaceAccess(ctx, workflow.workspaceId);

    // Get recent executions
    const recentExecutions = await ctx.db
      .query("executions")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .order("desc")
      .take(10);

    return {
      ...workflow,
      recentExecutions,
    };
  },
});

/**
 * Real-time query for workflow versions
 */
export const workflowVersionsQuery = query({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args) => {
    const versions = await ctx.db
      .query("workflowVersions")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .order("desc")
      .collect();

    return versions;
  },
});

/**
 * Real-time query for workflows by status
 */
export const workflowsByStatusQuery = query({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    // Authorize workspace access
    await requireWorkspaceAccess(ctx, args.workspaceId);

    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("status"), args.status))
      .collect();

    return workflows;
  },
});
