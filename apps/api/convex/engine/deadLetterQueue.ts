/**
 * Workflow Engine — Dead Letter Queue
 *
 * Captures failed executions that have exhausted all retry attempts.
 * Provides retry-from-DLQ and discard operations for manual recovery.
 *
 * Phase 6.5.4 — Dead Letter Queue
 */

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireWorkspaceAccess, requireWorkspaceMember } from "../lib/auth";

// ---------------------------------------------------------------------------
// Function references
// ---------------------------------------------------------------------------

const startExecutionRef = makeFunctionReference<"mutation", { executionId: Id<"executions"> }>(
  "engine/stepRunner:startExecution"
);

// ---------------------------------------------------------------------------
// Internal: capture failed execution to DLQ
// ---------------------------------------------------------------------------

/**
 * Captures a failed step/execution to the dead letter queue.
 * Called by failStep when retries are exhausted.
 */
export async function captureToDeadLetterQueue(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    executionId: Id<"executions">;
    workflowId: Id<"workflows">;
    stepId: string;
    error: unknown;
    errorCategory: string;
    retryCount: number;
  }
): Promise<Id<"deadLetterQueue">> {
  const now = Date.now();

  return await ctx.db.insert("deadLetterQueue", {
    workspaceId: args.workspaceId,
    executionId: args.executionId,
    workflowId: args.workflowId,
    stepId: args.stepId,
    error: args.error,
    errorCategory: args.errorCategory,
    retryCount: args.retryCount,
    status: "pending",
    retriedAt: undefined,
    discardedAt: undefined,
    discardedBy: undefined,
    metadata: undefined,
    createdAt: now,
  });
}

/**
 * Internal mutation wrapper for captureToDeadLetterQueue.
 */
export const captureToDLQ = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    executionId: v.id("executions"),
    workflowId: v.id("workflows"),
    stepId: v.string(),
    error: v.any(),
    errorCategory: v.string(),
    retryCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await captureToDeadLetterQueue(ctx, args);
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Lists DLQ entries for a workspace.
 */
export const listDeadLetterQueue = query({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);

    const status = args.status ?? "pending";

    return await ctx.db
      .query("deadLetterQueue")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", status)
      )
      .order("desc")
      .take(100);
  },
});

/**
 * Gets a single DLQ entry with execution context.
 */
export const getDLQEntry = query({
  args: {
    entryId: v.id("deadLetterQueue"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error("DLQ entry not found");

    await requireWorkspaceAccess(ctx, entry.workspaceId);

    const execution = await ctx.db.get(entry.executionId);
    const workflow = await ctx.db.get(entry.workflowId);

    return {
      entry,
      execution: execution
        ? { _id: execution._id, status: execution.status, input: execution.input }
        : null,
      workflow: workflow ? { _id: workflow._id, name: workflow.name } : null,
    };
  },
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Retries a DLQ entry by creating a new execution for the same workflow.
 */
export const retryFromDLQ = mutation({
  args: {
    entryId: v.id("deadLetterQueue"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error("DLQ entry not found");

    await requireWorkspaceMember(ctx, entry.workspaceId);

    if (entry.status !== "pending") {
      throw new Error(`Cannot retry DLQ entry in "${entry.status}" status`);
    }

    // Get the original execution's input
    const originalExecution = await ctx.db.get(entry.executionId);
    const now = Date.now();

    // Create a new execution
    const executionId = await ctx.db.insert("executions", {
      workspaceId: entry.workspaceId,
      workflowId: entry.workflowId,
      operatorId: originalExecution?.operatorId,
      status: "queued",
      input: {
        ...((originalExecution?.input as Record<string, unknown>) ?? {}),
        retriedFromDLQ: true,
        originalExecutionId: entry.executionId,
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

    // Mark DLQ entry as retried
    await ctx.db.patch(args.entryId, {
      status: "retried",
      retriedAt: now,
    });

    // Schedule execution start
    await ctx.scheduler.runAfter(0, startExecutionRef, { executionId });

    return { executionId, dlqEntryId: args.entryId };
  },
});

/**
 * Discards a DLQ entry (acknowledges the failure, no retry).
 */
export const discardFromDLQ = mutation({
  args: {
    entryId: v.id("deadLetterQueue"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error("DLQ entry not found");

    const { user } = await requireWorkspaceMember(ctx, entry.workspaceId);

    if (entry.status !== "pending") {
      throw new Error(`Cannot discard DLQ entry in "${entry.status}" status`);
    }

    await ctx.db.patch(args.entryId, {
      status: "discarded",
      discardedAt: Date.now(),
      discardedBy: user._id,
      metadata: args.reason ? { discardReason: args.reason } : undefined,
    });

    return args.entryId;
  },
});

/**
 * Gets DLQ count for a workspace (badge count).
 */
export const getDLQCount = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);

    const pending = await ctx.db
      .query("deadLetterQueue")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "pending")
      )
      .collect();

    return { count: pending.length };
  },
});
