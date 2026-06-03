import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Real-time query for workflows in a workspace
 */
export const workflowsQuery = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace", args.workspaceId)
      .collect();

    // Enrich with execution counts
    const enrichedWorkflows = await Promise.all(
      workflows.map(async (workflow) => {
        const executions = await ctx.db
          .query("executions")
          .withIndex("by_workflow", workflow._id)
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

    // Get recent executions
    const recentExecutions = await ctx.db
      .query("executions")
      .withIndex("by_workflow", args.workflowId)
      .order("desc")
      .take(10)
      .collect();

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
      .withIndex("by_workflow", args.workflowId)
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
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace", args.workspaceId)
      .filter((wf) => wf.status === args.status)
      .collect();

    return workflows;
  },
});
