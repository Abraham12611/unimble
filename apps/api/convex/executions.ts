/**
 * Execution management module.
 *
 * Phase 6.4 — Human-in-the-Loop:
 *   createExecutionApproval, respondExecutionApproval, timeoutExecutionApproval,
 *   processTimedOutApprovals (batch timeout processor for scheduler integration)
 *
 * Phase 6.5 — Retry & Error Handling:
 *   requeueStepWithRetry — wires RetryConfig backoff to step re-enqueue or DLQ write
 *
 * Phase 6.6 — Observability:
 *   updateExecutionStepStatus emits a structured executionLogs event on every
 *   meaningful status transition (step.started, step.completed, step.failed,
 *   step.skipped).  When the step completes or fails with cost data, it also
 *   rolls up the cost to the parent execution atomically.
 *   updateExecutionStatus emits execution.completed / execution.failed for terminal
 *   transitions.
 */

import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { executionValidator } from "./validators/execution";
import {
  getCurrentUserOrThrow,
  requireWorkspaceAccess,
  requireWorkspaceMember,
  requireWorkspaceOwnerOrAdmin,
} from "./lib/auth";
import { calculateBackoffMs, shouldRetry } from "./lib/retry";
import type { RetryConfig } from "./lib/retry";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Emit a structured lifecycle event into executionLogs (no auth check — internal). */
async function _emitLog(
  ctx: MutationCtx,
  args: {
    executionId: Id<"executions">;
    workspaceId: Id<"workspaces">;
    stepId?: string;
    event: string;
    level: string;
    message: string;
    durationMs?: number;
    tokensUsed?: number;
    estimatedCostUsd?: number;
    metadata?: unknown;
  }
) {
  await ctx.db.insert("executionLogs", {
    executionId: args.executionId,
    workspaceId: args.workspaceId,
    stepId: args.stepId,
    event: args.event,
    level: args.level,
    message: args.message,
    durationMs: args.durationMs,
    tokensUsed: args.tokensUsed,
    estimatedCostUsd: args.estimatedCostUsd,
    metadata: args.metadata ?? undefined,
    timestamp: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Execution CRUD
// ---------------------------------------------------------------------------

export async function createExecutionImpl(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    workflowId: Id<"workflows">;
    operatorId?: Id<"operators">;
    status?: string;
    input?: unknown;
  }
) {
  await requireWorkspaceMember(ctx, args.workspaceId);

  const wf = await ctx.db.get(args.workflowId);
  if (!wf) {
    throw new Error("Workflow not found");
  }
  if (wf.workspaceId !== args.workspaceId) {
    throw new Error("Forbidden");
  }

  if (args.operatorId) {
    const op = await ctx.db.get(args.operatorId);
    if (!op) {
      throw new Error("Operator not found");
    }
    if (op.workspaceId !== args.workspaceId) {
      throw new Error("Forbidden");
    }
  }

  const nextStatus = String(args.status ?? "queued").trim();
  if (!nextStatus) {
    throw new Error("status is required");
  }

  const parsed = executionValidator.safeParse({
    workspaceId: String(args.workspaceId),
    workflowId: String(args.workflowId),
    operatorId: args.operatorId ? String(args.operatorId) : undefined,
    status: nextStatus,
    input: args.input,
  });
  if (!parsed.success) {
    throw new Error("Invalid execution");
  }

  const now = Date.now();

  const executionId = await ctx.db.insert("executions", {
    workspaceId: args.workspaceId,
    workflowId: args.workflowId,
    operatorId: args.operatorId,
    status: nextStatus,
    input: args.input,
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
}

export const createExecution = mutation({
  args: {
    workspaceId: convexValidators.workspaceId,
    workflowId: convexValidators.workflowId,
    operatorId: v.optional(convexValidators.operatorId),
    status: v.optional(v.string()),
    input: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await createExecutionImpl(ctx, args);
  },
});

export async function getExecutionImpl(ctx: QueryCtx, args: { id: Id<"executions"> }) {
  const exe = await ctx.db.get(args.id);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceAccess(ctx, exe.workspaceId);
  return exe;
}

export const getExecution = query({
  args: {
    id: convexValidators.executionId,
  },
  handler: async (ctx, args) => {
    return await getExecutionImpl(ctx, args);
  },
});

export async function listExecutionsImpl(
  ctx: QueryCtx,
  args: {
    workspaceId: Id<"workspaces">;
    status?: string;
  }
) {
  await requireWorkspaceAccess(ctx, args.workspaceId);

  const status = args.status ? String(args.status).trim() : "";

  if (status) {
    return await ctx.db
      .query("executions")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", status)
      )
      .order("desc")
      .take(1000);
  }

  return await ctx.db
    .query("executions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .take(1000);
}

export const listExecutions = query({
  args: {
    workspaceId: convexValidators.workspaceId,
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await listExecutionsImpl(ctx, args);
  },
});

export async function updateExecutionStatusImpl(
  ctx: MutationCtx,
  args: {
    id: Id<"executions">;
    status: string;
    output?: unknown;
    error?: unknown;
    cost?: number;
    completedAt?: number;
  }
) {
  const exe = await ctx.db.get(args.id);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceOwnerOrAdmin(ctx, exe.workspaceId);

  const terminalStatuses = new Set(["completed", "failed", "canceled"]);

  if (terminalStatuses.has(exe.status)) {
    throw new Error("Cannot update status of a terminal execution; use retryExecution instead");
  }

  const nextStatus = String(args.status ?? "").trim();
  if (!nextStatus) {
    throw new Error("status is required");
  }

  const now = Date.now();

  const patch: Record<string, unknown> = {
    status: nextStatus,
    updatedAt: now,
  };

  if (args.output !== undefined) patch.output = args.output;
  if (args.error !== undefined) patch.error = args.error;
  if (args.cost !== undefined) patch.cost = args.cost;

  const isTerminal = terminalStatuses.has(nextStatus);

  if (isTerminal) {
    const nextCompletedAt = args.completedAt ?? now;
    patch.completedAt = nextCompletedAt;
    patch.duration = Math.max(0, nextCompletedAt - exe.startedAt);
  } else {
    if (exe.completedAt !== undefined) {
      patch.completedAt = undefined;
    }
    if (exe.duration !== undefined) {
      patch.duration = undefined;
    }
  }

  await ctx.db.patch(args.id, patch);

  // Phase 6.6 — emit lifecycle log for terminal execution transitions
  if (isTerminal && (nextStatus === "completed" || nextStatus === "failed")) {
    const duration =
      typeof patch.completedAt === "number"
        ? Math.max(0, (patch.completedAt as number) - exe.startedAt)
        : undefined;
    await _emitLog(ctx, {
      executionId: args.id,
      workspaceId: exe.workspaceId,
      event: nextStatus === "completed" ? "execution.completed" : "execution.failed",
      level: nextStatus === "completed" ? "info" : "error",
      message: `Execution ${nextStatus}`,
      durationMs: duration,
      metadata: nextStatus === "failed" ? { error: args.error } : undefined,
    });
  }

  return args.id;
}

export const updateExecutionStatus = mutation({
  args: {
    id: convexValidators.executionId,
    status: v.string(),
    output: v.optional(v.any()),
    error: v.optional(v.any()),
    cost: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await updateExecutionStatusImpl(ctx, args);
  },
});

export async function cancelExecutionImpl(
  ctx: MutationCtx,
  args: {
    id: Id<"executions">;
    reason?: unknown;
  }
) {
  const exe = await ctx.db.get(args.id);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceMember(ctx, exe.workspaceId);

  const cancelableStatuses = new Set(["queued", "running"]);
  if (!cancelableStatuses.has(exe.status)) {
    throw new Error("Only queued or running executions can be canceled");
  }

  const now = Date.now();

  await ctx.db.patch(args.id, {
    status: "canceled",
    error: args.reason,
    completedAt: now,
    duration: Math.max(0, now - exe.startedAt),
    updatedAt: now,
  });

  return args.id;
}

export const cancelExecution = mutation({
  args: {
    id: convexValidators.executionId,
    reason: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await cancelExecutionImpl(ctx, args);
  },
});

export async function retryExecutionImpl(ctx: MutationCtx, args: { id: Id<"executions"> }) {
  const exe = await ctx.db.get(args.id);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceMember(ctx, exe.workspaceId);

  const terminalStatuses = new Set(["completed", "failed", "canceled"]);
  if (!terminalStatuses.has(exe.status)) {
    throw new Error("Only completed, failed, or canceled executions can be retried");
  }

  const now = Date.now();

  await ctx.db.patch(args.id, {
    status: "queued",
    output: undefined,
    error: undefined,
    completedAt: undefined,
    duration: undefined,
    cost: undefined,
    startedAt: now,
    updatedAt: now,
  });

  // Delete steps (loop pattern — safe for >16,384 documents)
  while (true) {
    const step = await ctx.db
      .query("executionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", args.id))
      .first();
    if (!step) break;
    await ctx.db.delete(step._id);
  }

  // Delete approvals
  while (true) {
    const approval = await ctx.db
      .query("approvals")
      .withIndex("by_execution", (q) => q.eq("executionId", args.id))
      .first();
    if (!approval) break;
    await ctx.db.delete(approval._id);
  }

  // Delete execution logs
  while (true) {
    const log = await ctx.db
      .query("executionLogs")
      .withIndex("by_execution", (q) => q.eq("executionId", args.id))
      .first();
    if (!log) break;
    await ctx.db.delete(log._id);
  }

  // Delete dead-letter entries
  while (true) {
    const dlq = await ctx.db
      .query("deadLetterQueue")
      .withIndex("by_execution", (q) => q.eq("executionId", args.id))
      .first();
    if (!dlq) break;
    await ctx.db.delete(dlq._id);
  }

  return args.id;
}

export const retryExecution = mutation({
  args: {
    id: convexValidators.executionId,
  },
  handler: async (ctx, args) => {
    return await retryExecutionImpl(ctx, args);
  },
});

// ---------------------------------------------------------------------------
// Execution steps
// ---------------------------------------------------------------------------

export async function createExecutionStepImpl(
  ctx: MutationCtx,
  args: {
    executionId: Id<"executions">;
    stepId: string;
    name: string;
    type: string;
    status?: string;
    input?: unknown;
  }
) {
  const exe = await ctx.db.get(args.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceOwnerOrAdmin(ctx, exe.workspaceId);

  const terminalStatuses = new Set(["completed", "failed", "canceled"]);
  if (terminalStatuses.has(exe.status)) {
    throw new Error("Cannot add steps to a terminal execution");
  }

  const stepId = String(args.stepId ?? "").trim();
  const name = String(args.name ?? "").trim();
  const type = String(args.type ?? "").trim();
  const status = String(args.status ?? "queued").trim();

  if (!stepId) throw new Error("stepId is required");
  if (!name) throw new Error("name is required");
  if (!type) throw new Error("type is required");
  if (!status) throw new Error("status is required");

  const now = Date.now();

  const stepDocId = await ctx.db.insert("executionSteps", {
    executionId: args.executionId,
    stepId,
    name,
    type,
    status,
    input: args.input,
    output: undefined,
    error: undefined,
    startedAt: undefined,
    completedAt: undefined,
    retryCount: undefined,
    retryAfter: undefined,
    createdAt: now,
    updatedAt: now,
  });

  return stepDocId;
}

export const createExecutionStep = mutation({
  args: {
    executionId: convexValidators.executionId,
    stepId: v.string(),
    name: v.string(),
    type: v.string(),
    status: v.optional(v.string()),
    input: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await createExecutionStepImpl(ctx, args);
  },
});

export async function getExecutionStepImpl(ctx: QueryCtx, args: { id: Id<"executionSteps"> }) {
  const step = await ctx.db.get(args.id);
  if (!step) {
    throw new Error("Execution step not found");
  }

  const exe = await ctx.db.get(step.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceAccess(ctx, exe.workspaceId);
  return step;
}

export const getExecutionStep = query({
  args: {
    id: v.id("executionSteps"),
  },
  handler: async (ctx, args) => {
    return await getExecutionStepImpl(ctx, args);
  },
});

export async function listExecutionStepsImpl(
  ctx: QueryCtx,
  args: {
    executionId: Id<"executions">;
    status?: string;
  }
) {
  const exe = await ctx.db.get(args.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceAccess(ctx, exe.workspaceId);

  const status = args.status ? String(args.status).trim() : "";

  if (status) {
    return await ctx.db
      .query("executionSteps")
      .withIndex("by_execution_and_status", (q) =>
        q.eq("executionId", args.executionId).eq("status", status)
      )
      .order("desc")
      .take(1000);
  }

  return await ctx.db
    .query("executionSteps")
    .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
    .order("desc")
    .take(1000);
}

export const listExecutionSteps = query({
  args: {
    executionId: convexValidators.executionId,
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await listExecutionStepsImpl(ctx, args);
  },
});

/**
 * Phase 6.6 — Update step status and emit structured lifecycle log.
 *
 * Meaningful transitions emit:
 *   running  → step.started (info)
 *   completed → step.completed (info)  — also rolls up cost to execution
 *   failed   → step.failed (error)    — also rolls up cost to execution
 *   skipped  → step.skipped (warn)
 *
 * Optional cost parameters (tokensUsed, estimatedCostUsd, toolCallCount) are
 * included in the log and rolled up atomically on completion/failure.
 */
export async function updateExecutionStepStatusImpl(
  ctx: MutationCtx,
  args: {
    id: Id<"executionSteps">;
    status: string;
    output?: unknown;
    error?: unknown;
    startedAt?: number;
    completedAt?: number;
    retryCount?: number;
    // Phase 6.6 cost tracking (wired into step completion)
    tokensUsed?: number;
    estimatedCostUsd?: number;
    toolCallCount?: number;
  }
) {
  const step = await ctx.db.get(args.id);
  if (!step) {
    throw new Error("Execution step not found");
  }

  const exe = await ctx.db.get(step.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceOwnerOrAdmin(ctx, exe.workspaceId);

  const terminalStatuses = new Set(["completed", "failed", "canceled"]);
  if (terminalStatuses.has(exe.status)) {
    throw new Error("Cannot update steps on a terminal execution");
  }

  const status = String(args.status ?? "").trim();
  if (!status) {
    throw new Error("status is required");
  }

  // Guard against re-opening a terminal step
  const TERMINAL_STEP_STATUSES = new Set(["completed", "failed", "canceled", "skipped"]);
  if (TERMINAL_STEP_STATUSES.has(step.status) && !TERMINAL_STEP_STATUSES.has(status)) {
    throw new Error("Cannot reopen a terminal step; create a new step instead");
  }

  const now = Date.now();

  const patch: Record<string, unknown> = {
    status,
    updatedAt: now,
  };

  if (args.output !== undefined) patch.output = args.output;
  if (args.error !== undefined) patch.error = args.error;
  if (args.retryCount !== undefined) patch.retryCount = args.retryCount;

  const startedAt = args.startedAt ?? (status === "running" ? now : step.startedAt);
  if (startedAt !== undefined) patch.startedAt = startedAt;

  const terminalStepStatuses = new Set(["completed", "failed", "canceled", "skipped"]);
  const isTerminalStep = terminalStepStatuses.has(status);

  if (isTerminalStep) {
    const completedAt = args.completedAt ?? now;
    patch.completedAt = completedAt;
  } else {
    if (step.completedAt !== undefined) {
      patch.completedAt = undefined;
    }
  }

  await ctx.db.patch(args.id, patch);

  // Phase 6.6 — emit structured lifecycle log for meaningful transitions
  const logEventMap: Record<string, { event: string; level: string }> = {
    running: { event: "step.started", level: "info" },
    completed: { event: "step.completed", level: "info" },
    failed: { event: "step.failed", level: "error" },
    skipped: { event: "step.skipped", level: "warn" },
  };

  const logInfo = logEventMap[status];
  if (logInfo) {
    const durationMs =
      isTerminalStep && startedAt !== undefined
        ? Math.max(0, now - (startedAt as number))
        : undefined;

    await _emitLog(ctx, {
      executionId: step.executionId,
      workspaceId: exe.workspaceId,
      stepId: step.stepId,
      event: logInfo.event,
      level: logInfo.level,
      message: `Step "${step.name}": ${status}`,
      durationMs,
      tokensUsed: args.tokensUsed,
      estimatedCostUsd: args.estimatedCostUsd,
      metadata:
        args.toolCallCount !== undefined
          ? { toolCallCount: args.toolCallCount }
          : undefined,
    });

    // Roll up cost to parent execution atomically on completion/failure
    if (
      (status === "completed" || status === "failed") &&
      args.estimatedCostUsd !== undefined &&
      args.estimatedCostUsd > 0
    ) {
      const currentCost = typeof exe.cost === "number" ? exe.cost : 0;
      await ctx.db.patch(step.executionId, {
        cost: currentCost + args.estimatedCostUsd,
        updatedAt: now,
      });
    }
  }

  return args.id;
}

export const updateExecutionStepStatus = mutation({
  args: {
    id: v.id("executionSteps"),
    status: v.string(),
    output: v.optional(v.any()),
    error: v.optional(v.any()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    retryCount: v.optional(v.number()),
    tokensUsed: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    toolCallCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await updateExecutionStepStatusImpl(ctx, args);
  },
});

// ---------------------------------------------------------------------------
// Phase 6.5 — Retry orchestration
// ---------------------------------------------------------------------------

/**
 * Re-enqueue a failed step with backoff, or move it to the dead-letter queue
 * when retry attempts are exhausted.
 *
 * Backoff calculation uses the pure `calculateBackoffMs` utility; strategy
 * options are: "none" | "fixed" | "exponential" | "linear" (with optional jitter).
 *
 * Flow:
 *   1. Verify step is in "failed" state (only failed steps can be retried here).
 *   2. Compute nextAttemptNumber = (step.retryCount ?? 0) + 1.
 *   3. shouldRetry → false:
 *        Write dead-letter entry; step stays "failed"; emit step.failed log with
 *        metadata { dlq: true, retryCount }.
 *   4. shouldRetry → true:
 *        Calculate backoff delay; update step to "queued" with retryCount and
 *        retryAfter; emit step.retried log.
 *
 * Returns:
 *   { enqueued: true,  retryAttempt, delayMs, retryAfter }  — requeued
 *   { enqueued: false, retryAttempt, dlqEntryId }           — exhausted → DLQ
 */
export async function requeueStepWithRetryImpl(
  ctx: MutationCtx,
  args: {
    stepDocId: Id<"executionSteps">;
    strategy: string;
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs?: number;
    jitter?: boolean;
    error?: unknown;
  }
) {
  const step = await ctx.db.get(args.stepDocId);
  if (!step) {
    throw new Error("Execution step not found");
  }

  const exe = await ctx.db.get(step.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceOwnerOrAdmin(ctx, exe.workspaceId);

  if (step.status !== "failed") {
    throw new Error("Only failed steps can be requeued with retry");
  }

  const strategy = String(args.strategy ?? "exponential").trim() as RetryConfig["strategy"];
  const maxAttempts = Math.max(1, args.maxAttempts);
  const baseDelayMs = Math.max(0, args.baseDelayMs);

  const config: RetryConfig = {
    strategy,
    maxAttempts,
    baseDelayMs,
    maxDelayMs: args.maxDelayMs,
    jitter: args.jitter ?? false,
  };

  const retryAttempt = (step.retryCount ?? 0) + 1;
  const now = Date.now();

  if (!shouldRetry(config, retryAttempt)) {
    // Exhausted — write dead-letter entry, leave step as "failed"
    const dlqEntryId = await ctx.db.insert("deadLetterQueue", {
      executionId: step.executionId,
      workspaceId: exe.workspaceId,
      stepId: step.stepId,
      reason: "Max retry attempts exhausted",
      originalError: args.error ?? step.error,
      retryCount: retryAttempt,
      resolvedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await _emitLog(ctx, {
      executionId: step.executionId,
      workspaceId: exe.workspaceId,
      stepId: step.stepId,
      event: "step.failed",
      level: "error",
      message: `Step "${step.name}" sent to dead-letter queue after ${retryAttempt} attempt(s)`,
      metadata: { dlq: true, retryAttempt, maxAttempts, strategy, dlqEntryId },
    });

    return { enqueued: false, retryAttempt, dlqEntryId } as const;
  }

  // Requeue with backoff
  const delayMs = calculateBackoffMs(config, retryAttempt) ?? 0;
  const retryAfter = now + delayMs;

  await ctx.db.patch(args.stepDocId, {
    status: "queued",
    retryCount: retryAttempt,
    retryAfter,
    error: args.error ?? step.error,
    completedAt: undefined,
    updatedAt: now,
  });

  await _emitLog(ctx, {
    executionId: step.executionId,
    workspaceId: exe.workspaceId,
    stepId: step.stepId,
    event: "step.retried",
    level: "info",
    message: `Step "${step.name}" re-queued (attempt ${retryAttempt}/${maxAttempts}, delay ${delayMs}ms)`,
    durationMs: delayMs,
    metadata: { retryAttempt, maxAttempts, strategy, delayMs, retryAfter },
  });

  return { enqueued: true, retryAttempt, delayMs, retryAfter } as const;
}

export const requeueStepWithRetry = mutation({
  args: {
    stepDocId: v.id("executionSteps"),
    strategy: v.string(),
    maxAttempts: v.number(),
    baseDelayMs: v.number(),
    maxDelayMs: v.optional(v.number()),
    jitter: v.optional(v.boolean()),
    error: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await requeueStepWithRetryImpl(ctx, args);
  },
});

// ---------------------------------------------------------------------------
// Execution step approvals
// ---------------------------------------------------------------------------

export async function listExecutionApprovalsImpl(
  ctx: QueryCtx,
  args: {
    executionId: Id<"executions">;
    status?: string;
  }
) {
  const exe = await ctx.db.get(args.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceAccess(ctx, exe.workspaceId);

  const status = args.status ? String(args.status).trim() : "";

  if (status) {
    return await ctx.db
      .query("approvals")
      .withIndex("by_execution_and_status", (q) =>
        q.eq("executionId", args.executionId).eq("status", status)
      )
      .order("desc")
      .take(1000);
  }

  return await ctx.db
    .query("approvals")
    .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
    .order("desc")
    .take(1000);
}

export const listExecutionApprovals = query({
  args: {
    executionId: convexValidators.executionId,
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await listExecutionApprovalsImpl(ctx, args);
  },
});

// ---------------------------------------------------------------------------
// Phase 6.4 — Human-in-the-Loop
// ---------------------------------------------------------------------------

export async function createExecutionApprovalImpl(
  ctx: MutationCtx,
  args: {
    executionId: Id<"executions">;
    stepId: string;
    type: string;
    content?: unknown;
    status?: string;
    timeoutAt?: number;
    timeoutBehavior?: string;
    escalationChannel?: string;
  }
) {
  const exe = await ctx.db.get(args.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceOwnerOrAdmin(ctx, exe.workspaceId);

  const terminalStatuses = new Set(["completed", "failed", "canceled"]);
  if (terminalStatuses.has(exe.status)) {
    throw new Error("Cannot add approvals to a terminal execution");
  }

  const stepId = String(args.stepId ?? "").trim();
  const type = String(args.type ?? "").trim();
  const status = String(args.status ?? "pending").trim();

  if (!stepId) throw new Error("stepId is required");
  if (!type) throw new Error("type is required");
  if (!status) throw new Error("status is required");
  if (status !== "pending") throw new Error("status must be pending");

  const validTimeoutBehaviors = new Set(["auto-approve", "auto-reject", "escalate"]);
  if (args.timeoutBehavior !== undefined && !validTimeoutBehaviors.has(args.timeoutBehavior)) {
    throw new Error("timeoutBehavior must be one of: auto-approve, auto-reject, escalate");
  }

  const now = Date.now();

  const approvalId = await ctx.db.insert("approvals", {
    executionId: args.executionId,
    stepId,
    type,
    content: args.content,
    status,
    requestedAt: now,
    respondedAt: undefined,
    respondedBy: undefined,
    feedback: undefined,
    timeoutAt: args.timeoutAt,
    timeoutBehavior: args.timeoutBehavior,
    escalationChannel: args.escalationChannel,
    createdAt: now,
    updatedAt: now,
  });

  return approvalId;
}

export const createExecutionApproval = mutation({
  args: {
    executionId: convexValidators.executionId,
    stepId: v.string(),
    type: v.string(),
    content: v.optional(v.any()),
    status: v.optional(v.literal("pending")),
    timeoutAt: v.optional(v.number()),
    timeoutBehavior: v.optional(v.string()),
    escalationChannel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await createExecutionApprovalImpl(ctx, args);
  },
});

export async function respondExecutionApprovalImpl(
  ctx: MutationCtx,
  args: {
    id: Id<"approvals">;
    status: string;
    feedback?: unknown;
  }
) {
  const approval = await ctx.db.get(args.id);
  if (!approval) {
    throw new Error("Approval not found");
  }

  const exe = await ctx.db.get(approval.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  const { user } = await requireWorkspaceMember(ctx, exe.workspaceId);

  const status = String(args.status ?? "").trim();
  if (!status) throw new Error("status is required");

  const allowedStatuses = new Set(["approved", "rejected"]);
  if (!allowedStatuses.has(status)) {
    throw new Error("status must be 'approved' or 'rejected'");
  }

  if (approval.status !== "pending") {
    if (approval.status === status) return args.id;
    throw new Error("Approval has already been responded to");
  }

  const now = Date.now();
  await ctx.db.patch(args.id, {
    status,
    feedback: args.feedback,
    respondedAt: now,
    respondedBy: user._id,
    updatedAt: now,
  });

  return args.id;
}

export const respondExecutionApproval = mutation({
  args: {
    id: v.id("approvals"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    feedback: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await respondExecutionApprovalImpl(ctx, args);
  },
});

/**
 * Phase 6.4 — Apply timeout behavior to a pending approval whose timeoutAt has elapsed.
 *
 * Behaviors:
 *   auto-approve → status "approved",  { timedOut: true } feedback
 *   auto-reject  → status "rejected",  { timedOut: true } feedback
 *   escalate     → status "escalated"; creates a new "escalation" approval; emits
 *                  approval.escalated log (notification stub — production would also
 *                  dispatch to the escalationChannel here)
 *
 * If the approval is not yet timed out, or is already in a non-pending state,
 * returns the same approvalId unchanged.
 */
export async function timeoutExecutionApprovalImpl(
  ctx: MutationCtx,
  args: { id: Id<"approvals"> }
) {
  const approval = await ctx.db.get(args.id);
  if (!approval) throw new Error("Approval not found");

  const exe = await ctx.db.get(approval.executionId);
  if (!exe) throw new Error("Execution not found");

  await requireWorkspaceOwnerOrAdmin(ctx, exe.workspaceId);

  if (approval.status !== "pending") return args.id;
  if (approval.timeoutAt === undefined || Date.now() < approval.timeoutAt) return args.id;

  const behavior = approval.timeoutBehavior ?? "auto-reject";
  const now = Date.now();

  if (behavior === "auto-approve") {
    await ctx.db.patch(args.id, {
      status: "approved",
      feedback: { timedOut: true, autoApproved: true, timedOutAt: now },
      respondedAt: now,
      updatedAt: now,
    });

    await _emitLog(ctx, {
      executionId: approval.executionId,
      workspaceId: exe.workspaceId,
      stepId: approval.stepId,
      event: "approval.timed-out",
      level: "warn",
      message: `Approval gate auto-approved after timeout`,
      metadata: { behavior, approvalId: approval._id },
    });

    return args.id;
  }

  if (behavior === "auto-reject") {
    await ctx.db.patch(args.id, {
      status: "rejected",
      feedback: { timedOut: true, autoRejected: true, timedOutAt: now },
      respondedAt: now,
      updatedAt: now,
    });

    await _emitLog(ctx, {
      executionId: approval.executionId,
      workspaceId: exe.workspaceId,
      stepId: approval.stepId,
      event: "approval.timed-out",
      level: "warn",
      message: `Approval gate auto-rejected after timeout`,
      metadata: { behavior, approvalId: approval._id },
    });

    return args.id;
  }

  // behavior === "escalate"
  await ctx.db.patch(args.id, {
    status: "escalated",
    feedback: { timedOut: true, escalated: true, timedOutAt: now },
    respondedAt: now,
    updatedAt: now,
  });

  const escalationId = await ctx.db.insert("approvals", {
    executionId: approval.executionId,
    stepId: approval.stepId,
    type: "escalation",
    content: {
      originalApprovalId: approval._id,
      originalContent: approval.content,
      escalatedAt: now,
      channel: approval.escalationChannel ?? "default",
    },
    status: "pending",
    requestedAt: now,
    respondedAt: undefined,
    respondedBy: undefined,
    feedback: undefined,
    timeoutAt: undefined,
    timeoutBehavior: undefined,
    escalationChannel: approval.escalationChannel,
    createdAt: now,
    updatedAt: now,
  });

  // Phase 6.6 — emit escalation log event (notification dispatch would happen here
  // in production, e.g., POST to Slack/PagerDuty via escalationChannel)
  await _emitLog(ctx, {
    executionId: approval.executionId,
    workspaceId: exe.workspaceId,
    stepId: approval.stepId,
    event: "approval.escalated",
    level: "warn",
    message: `Approval gate timed out and escalated (channel: ${approval.escalationChannel ?? "default"})`,
    metadata: {
      originalApprovalId: approval._id,
      escalationId,
      channel: approval.escalationChannel ?? "default",
    },
  });

  return escalationId;
}

export const timeoutExecutionApproval = mutation({
  args: {
    id: v.id("approvals"),
  },
  handler: async (ctx, args) => {
    return await timeoutExecutionApprovalImpl(ctx, args);
  },
});

/**
 * Phase 6.4 — Batch timeout processor for scheduler integration.
 *
 * Scans all pending approvals whose timeoutAt ≤ now and applies the configured
 * timeout behavior.  Designed to be called from a Convex cron or an external
 * job scheduler every 1–5 minutes.
 *
 * Returns the count of approvals processed in this invocation.
 * Safe to call repeatedly; already-processed approvals are skipped (idempotent).
 */
export async function processTimedOutApprovalsImpl(
  ctx: MutationCtx,
  args: { batchSize?: number }
) {
  await getCurrentUserOrThrow(ctx);

  const batchSize = args.batchSize && args.batchSize > 0 ? args.batchSize : 100;
  const now = Date.now();

  // Scan up to batchSize * 2 candidates via the timeout index (undefined values
  // sort to the lower bound in Convex, so they appear first; filter them out).
  const candidates = await ctx.db
    .query("approvals")
    .withIndex("by_timeout_at")
    .order("asc")
    .take(batchSize * 2);

  const toProcess = candidates.filter(
    (a) =>
      a.status === "pending" &&
      typeof a.timeoutAt === "number" &&
      a.timeoutAt <= now
  );

  const batch = toProcess.slice(0, batchSize);
  let processedCount = 0;

  for (const approval of batch) {
    await timeoutExecutionApprovalImpl(ctx, { id: approval._id });
    processedCount++;
  }

  return { processedCount };
}

export const processTimedOutApprovals = mutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await processTimedOutApprovalsImpl(ctx, args);
  },
});
