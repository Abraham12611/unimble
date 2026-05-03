/**
 * Phase 6.6 — Observability & Monitoring
 *
 * Structured execution log emission and per-step cost tracking.
 * Every step lifecycle transition writes an `executionLogs` record.
 * Token/tool-call costs are aggregated from step → execution → operator.
 *
 * Log events:
 *   execution.started | execution.completed | execution.failed
 *   step.started | step.completed | step.failed | step.retried | step.skipped
 *   approval.requested | approval.responded | approval.timed-out | approval.escalated
 */

import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  requireWorkspaceAccess,
  requireWorkspaceOwnerOrAdmin,
} from "./lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogEvent =
  | "execution.started"
  | "execution.completed"
  | "execution.failed"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "step.retried"
  | "step.skipped"
  | "approval.requested"
  | "approval.responded"
  | "approval.timed-out"
  | "approval.escalated";

export type LogLevel = "debug" | "info" | "warn" | "error";

// ---------------------------------------------------------------------------
// Impl helpers
// ---------------------------------------------------------------------------

export async function emitExecutionLogImpl(
  ctx: MutationCtx,
  args: {
    executionId: Id<"executions">;
    stepId?: string;
    event: string;
    level: string;
    message: string;
    durationMs?: number;
    inputHash?: string;
    outputHash?: string;
    tokensUsed?: number;
    estimatedCostUsd?: number;
    metadata?: unknown;
  }
) {
  const exe = await ctx.db.get(args.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceOwnerOrAdmin(ctx, exe.workspaceId);

  const event = String(args.event ?? "").trim();
  const level = String(args.level ?? "info").trim();
  const message = String(args.message ?? "").trim();

  if (!event) throw new Error("event is required");
  if (!message) throw new Error("message is required");

  const now = Date.now();

  const logId = await ctx.db.insert("executionLogs", {
    executionId: args.executionId,
    workspaceId: exe.workspaceId,
    stepId: args.stepId,
    event,
    level,
    message,
    durationMs: args.durationMs,
    inputHash: args.inputHash,
    outputHash: args.outputHash,
    tokensUsed: args.tokensUsed,
    estimatedCostUsd: args.estimatedCostUsd,
    metadata: args.metadata,
    timestamp: now,
  });

  return logId;
}

export async function trackStepCostImpl(
  ctx: MutationCtx,
  args: {
    executionId: Id<"executions">;
    stepDocId: Id<"executionSteps">;
    tokensUsed?: number;
    estimatedCostUsd?: number;
    toolCallCount?: number;
  }
) {
  const exe = await ctx.db.get(args.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceOwnerOrAdmin(ctx, exe.workspaceId);

  const step = await ctx.db.get(args.stepDocId);
  if (!step) {
    throw new Error("Execution step not found");
  }

  if (step.executionId !== args.executionId) {
    throw new Error("Step does not belong to this execution");
  }

  const now = Date.now();

  // Roll up cost to execution
  if (args.estimatedCostUsd !== undefined && args.estimatedCostUsd > 0) {
    const currentCost = typeof exe.cost === "number" ? exe.cost : 0;
    await ctx.db.patch(args.executionId, {
      cost: currentCost + args.estimatedCostUsd,
      updatedAt: now,
    });
  }

  // Emit a cost log event
  const tokensDesc =
    args.tokensUsed !== undefined ? ` tokens=${args.tokensUsed}` : "";
  const costDesc =
    args.estimatedCostUsd !== undefined
      ? ` cost=$${args.estimatedCostUsd.toFixed(6)}`
      : "";
  const toolsDesc =
    args.toolCallCount !== undefined ? ` tool_calls=${args.toolCallCount}` : "";

  const logId = await ctx.db.insert("executionLogs", {
    executionId: args.executionId,
    workspaceId: exe.workspaceId,
    stepId: step.stepId,
    event: "step.completed",
    level: "info",
    message: `Step cost tracked: step=${step.name}${tokensDesc}${costDesc}${toolsDesc}`,
    tokensUsed: args.tokensUsed,
    estimatedCostUsd: args.estimatedCostUsd,
    metadata: { toolCallCount: args.toolCallCount, stepDocId: args.stepDocId },
    timestamp: now,
  });

  return logId;
}

export async function listExecutionLogsImpl(
  ctx: QueryCtx,
  args: {
    executionId: Id<"executions">;
    event?: string;
  }
) {
  const exe = await ctx.db.get(args.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceAccess(ctx, exe.workspaceId);

  const event = args.event ? String(args.event).trim() : "";

  if (event) {
    return await ctx.db
      .query("executionLogs")
      .withIndex("by_execution_and_event", (q) =>
        q.eq("executionId", args.executionId).eq("event", event)
      )
      .order("desc")
      .take(1000);
  }

  return await ctx.db
    .query("executionLogs")
    .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
    .order("desc")
    .take(1000);
}

export async function getExecutionCostSummaryImpl(
  ctx: QueryCtx,
  args: { executionId: Id<"executions"> }
) {
  const exe = await ctx.db.get(args.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceAccess(ctx, exe.workspaceId);

  const logs = await ctx.db
    .query("executionLogs")
    .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
    .collect();

  let totalTokens = 0;
  let totalCostUsd = 0;
  let totalToolCalls = 0;

  for (const log of logs) {
    if (typeof log.tokensUsed === "number") totalTokens += log.tokensUsed;
    if (typeof log.estimatedCostUsd === "number") totalCostUsd += log.estimatedCostUsd;
    const meta = log.metadata as Record<string, unknown> | undefined;
    if (meta && typeof meta.toolCallCount === "number") {
      totalToolCalls += meta.toolCallCount;
    }
  }

  return {
    executionId: args.executionId,
    totalTokens,
    totalCostUsd,
    totalToolCalls,
    logCount: logs.length,
  };
}

export async function getOperatorCostSummaryImpl(
  ctx: QueryCtx,
  args: {
    workspaceId: Id<"workspaces">;
    operatorId: Id<"operators">;
  }
) {
  await requireWorkspaceAccess(ctx, args.workspaceId);

  const executions = await ctx.db
    .query("executions")
    .withIndex("by_workspace_and_operator", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("operatorId", args.operatorId)
    )
    .collect();

  let totalCostUsd = 0;
  let totalTokens = 0;
  let totalToolCalls = 0;

  for (const exe of executions) {
    const logs = await ctx.db
      .query("executionLogs")
      .withIndex("by_execution", (q) => q.eq("executionId", exe._id))
      .collect();

    for (const log of logs) {
      if (typeof log.tokensUsed === "number") totalTokens += log.tokensUsed;
      if (typeof log.estimatedCostUsd === "number") totalCostUsd += log.estimatedCostUsd;
      const meta = log.metadata as Record<string, unknown> | undefined;
      if (meta && typeof meta.toolCallCount === "number") {
        totalToolCalls += meta.toolCallCount;
      }
    }
  }

  return {
    workspaceId: args.workspaceId,
    operatorId: args.operatorId,
    executionCount: executions.length,
    totalTokens,
    totalCostUsd,
    totalToolCalls,
  };
}

// ---------------------------------------------------------------------------
// Exported mutations & queries
// ---------------------------------------------------------------------------

export const emitExecutionLog = mutation({
  args: {
    executionId: convexValidators.executionId,
    stepId: v.optional(v.string()),
    event: v.string(),
    level: v.optional(v.string()),
    message: v.string(),
    durationMs: v.optional(v.number()),
    inputHash: v.optional(v.string()),
    outputHash: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await emitExecutionLogImpl(ctx, {
      ...args,
      level: args.level ?? "info",
    });
  },
});

export const trackStepCost = mutation({
  args: {
    executionId: convexValidators.executionId,
    stepDocId: v.id("executionSteps"),
    tokensUsed: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    toolCallCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await trackStepCostImpl(ctx, args);
  },
});

export const listExecutionLogs = query({
  args: {
    executionId: convexValidators.executionId,
    event: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await listExecutionLogsImpl(ctx, args);
  },
});

export const getExecutionCostSummary = query({
  args: {
    executionId: convexValidators.executionId,
  },
  handler: async (ctx, args) => {
    return await getExecutionCostSummaryImpl(ctx, args);
  },
});

export const getOperatorCostSummary = query({
  args: {
    workspaceId: convexValidators.workspaceId,
    operatorId: convexValidators.operatorId,
  },
  handler: async (ctx, args) => {
    return await getOperatorCostSummaryImpl(ctx, args);
  },
});
