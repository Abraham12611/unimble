/**
 * Workflow Engine — Manual Trigger
 *
 * Allows authenticated users to manually trigger a workflow
 * execution via API. Used by operators to run workflows on
 * demand, and by the dashboard "Run Now" button.
 */

import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireWorkspaceMember } from "../lib/auth";

/**
 * Manually triggers a workflow execution.
 *
 * Requires workspace membership. Creates a new execution record
 * with status "queued" and the provided input data.
 */
export const triggerWorkflow = mutation({
  args: {
    workflowId: v.id("workflows"),
    input: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    await requireWorkspaceMember(ctx, workflow.workspaceId);

    // Verify workflow is active
    if (workflow.status !== "active") {
      throw new Error(`Cannot trigger workflow in "${workflow.status}" status`);
    }

    const now = Date.now();

    const executionId = await ctx.db.insert("executions", {
      workspaceId: workflow.workspaceId,
      workflowId: workflow._id,
      operatorId: workflow.operatorId,
      status: "queued",
      input: {
        triggeredBy: "manual",
        ...(args.input ? { data: args.input } : {}),
      },
      output: undefined,
      error: undefined,
      startedAt: now,
      completedAt: undefined,
      duration: undefined,
      cost: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return executionId;
  },
});

/**
 * Manually triggers an operator's default workflow.
 *
 * Finds the first active workflow for the operator and triggers it.
 * This is the "Run Now" button on the operator detail page.
 */
export const triggerOperator = mutation({
  args: {
    operatorId: v.id("operators"),
    input: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    if (!operator) {
      throw new Error("Operator not found");
    }

    await requireWorkspaceMember(ctx, operator.workspaceId);

    if (operator.status !== "active") {
      throw new Error(`Cannot trigger operator in "${operator.status}" status`);
    }

    // Find the first active workflow for this operator
    const workflow = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_and_operator", (q) =>
        q.eq("workspaceId", operator.workspaceId).eq("operatorId", args.operatorId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!workflow) {
      throw new Error("No active workflow found for this operator");
    }

    const now = Date.now();

    const executionId = await ctx.db.insert("executions", {
      workspaceId: operator.workspaceId,
      workflowId: workflow._id,
      operatorId: args.operatorId,
      status: "queued",
      input: {
        triggeredBy: "manual",
        operatorTriggered: true,
        ...(args.input ? { data: args.input } : {}),
      },
      output: undefined,
      error: undefined,
      startedAt: now,
      completedAt: undefined,
      duration: undefined,
      cost: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return executionId;
  },
});
