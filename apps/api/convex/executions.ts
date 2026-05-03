/**
 * Execution management module.
 *
 * Phase 6.4 — Human-in-the-Loop:
 *   createExecutionApproval  — pauses the corresponding execution step
 *   respondExecutionApproval — resumes (approved) or fails (rejected) the step
 *   timeoutExecutionApproval — auth-then-delegate to internal helper
 *   processTimedOutApprovals — scheduler-safe internalMutation; no user-identity
 *     requirement; double-bounded index range prevents starvation
 *
 * Phase 6.5 — Retry & Error Handling:
 *   requeueStepWithRetry — wires RetryConfig backoff to step re-enqueue or DLQ write
 *
 * Phase 6.6 — Observability:
 *   updateExecutionStepStatus emits structured lifecycle logs (inputHash, outputHash,
 *   error metadata) and rolls up cost to the parent execution atomically.
 *   updateExecutionStatus emits execution.completed / execution.failed for
 *   terminal transitions.
 */

import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
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
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash of any JSON-serialisable value.
 * Used to populate inputHash / outputHash in executionLogs for content
 * fingerprinting without storing raw payloads.
 */
function _simpleHash(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const str = JSON.stringify(value);
    if (!str) return undefined;
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  } catch {
    return undefined;
  }
}

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
    inputHash?: string;
    outputHash?: string;
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
    inputHash: args.inputHash,
    outputHash: args.outputHash,
    tokensUsed: args.tokensUsed,
    estimatedCostUsd: args.estimatedCostUsd,
    metadata: args.metadata ?? undefined,
    timestamp: Date.now(),
  });
}

/**
 * Transition the execution step associated with an approval once the approval
 * is resolved (approved → queued / rejected → failed).
 *
 * Design:
 *   - Only operates when the step is in "awaiting-approval" state.
 *   - If no step with the matching stepId is found, silently returns (the
 *     approval may have been created without an associated step).
 */
async function _transitionStepOnApproval(
  ctx: MutationCtx,
  approval: {
    _id: Id<"approvals">;
    executionId: Id<"executions">;
    stepId?: string;
  },
  outcome: "approved" | "rejected" | "escalated",
  feedback?: unknown
) {
  if (!approval.stepId) return;

  const step = await ctx.db
    .query("executionSteps")
    .withIndex("by_execution", (q) => q.eq("executionId", approval.executionId))
    .filter((q) => q.eq(q.field("stepId"), approval.stepId))
    .first();

  if (!step || step.status !== "awaiting-approval") return;

  const now = Date.now();

  if (outcome === "approved") {
    // Resume: re-queue the step so the executor can pick it up
    await ctx.db.patch(step._id, { status: "queued", updatedAt: now });
  } else if (outcome === "rejected") {
    // Fail: mark step failed with rejection context
    await ctx.db.patch(step._id, {
      status: "failed",
      error: { reason: "approval-rejected", approvalId: approval._id, feedback },
      completedAt: now,
      updatedAt: now,
    });
  }
  // "escalated" → leave step in "awaiting-approval" pending the escalation resolution
}

/**
 * Apply timeout behavior to a single approval document.
 *
 * No auth check — called from the batch processor (scheduler path) and also
 * from the public API (after auth is verified by the caller).
 *
 * Idempotent: non-pending approvals and approvals whose timeoutAt has not yet
 * elapsed are silently skipped.
 */
async function _applyTimeoutToApprovalNoAuth(
  ctx: MutationCtx,
  approvalId: Id<"approvals">
): Promise<Id<"approvals">> {
  const approval = await ctx.db.get(approvalId);
  if (!approval) throw new Error("Approval not found");

  const exe = await ctx.db.get(approval.executionId);
  if (!exe) throw new Error("Execution not found");

  if (approval.status !== "pending") return approvalId;
  if (typeof approval.timeoutAt !== "number" || Date.now() < approval.timeoutAt) {
    return approvalId;
  }

  const behavior = approval.timeoutBehavior ?? "auto-reject";
  const now = Date.now();

  if (behavior === "auto-approve") {
    const fb = { timedOut: true, autoApproved: true, timedOutAt: now };
    await ctx.db.patch(approvalId, {
      status: "approved",
      feedback: fb,
      respondedAt: now,
      updatedAt: now,
    });
    // Transition step: resume
    await _transitionStepOnApproval(ctx, approval, "approved", fb);
    await _emitLog(ctx, {
      executionId: approval.executionId,
      workspaceId: exe.workspaceId,
      stepId: approval.stepId,
      event: "approval.timed-out",
      level: "warn",
      message: `Approval gate auto-approved after timeout`,
      metadata: { behavior, approvalId: approval._id },
    });
    return approvalId;
  }

  if (behavior === "auto-reject") {
    const fb = { timedOut: true, autoRejected: true, timedOutAt: now };
    await ctx.db.patch(approvalId, {
      status: "rejected",
      feedback: fb,
      respondedAt: now,
      updatedAt: now,
    });
    // Transition step: fail
    await _transitionStepOnApproval(ctx, approval, "rejected", fb);
    await _emitLog(ctx, {
      executionId: approval.executionId,
      workspaceId: exe.workspaceId,
      stepId: approval.stepId,
      event: "approval.timed-out",
      level: "warn",
      message: `Approval gate auto-rejected after timeout`,
      metadata: { behavior, approvalId: approval._id },
    });
    return approvalId;
  }

  // behavior === "escalate"
  await ctx.db.patch(approvalId, {
    status: "escalated",
    feedback: { timedOut: true, escalated: true, timedOutAt: now },
    respondedAt: now,
    updatedAt: now,
  });
  // Escalated: step remains "awaiting-approval" pending new escalation approval
  await _transitionStepOnApproval(ctx, approval, "escalated");

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

  // Delete steps
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
 * Phase 6.6 — Update step status and emit a structured lifecycle log.
 *
 * Meaningful transitions emit:
 *   running   → step.started  (info)  — includes inputHash
 *   completed → step.completed (info) — includes inputHash, outputHash, cost fields
 *   failed    → step.failed   (error) — includes inputHash, error details in metadata
 *   skipped   → step.skipped  (warn)
 *
 * On completed/failed transitions with estimatedCostUsd > 0, the cost is rolled
 * up to execution.cost atomically within the same mutation.
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
    // Phase 6.6 cost tracking
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

  const effectiveStartedAt =
    args.startedAt ?? (status === "running" ? now : step.startedAt);
  if (effectiveStartedAt !== undefined) patch.startedAt = effectiveStartedAt;

  const terminalStepStatuses = new Set(["completed", "failed", "canceled", "skipped"]);
  const isTerminalStep = terminalStepStatuses.has(status);

  if (isTerminalStep) {
    patch.completedAt = args.completedAt ?? now;
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
      isTerminalStep && effectiveStartedAt !== undefined
        ? Math.max(0, now - (effectiveStartedAt as number))
        : undefined;

    const inputHash = _simpleHash(step.input);
    const outputHash =
      status === "completed"
        ? _simpleHash(args.output ?? step.output)
        : undefined;

    let logMetadata: unknown;
    if (status === "failed") {
      logMetadata = {
        error: args.error,
        ...(args.toolCallCount !== undefined ? { toolCallCount: args.toolCallCount } : {}),
      };
    } else if (args.toolCallCount !== undefined) {
      logMetadata = { toolCallCount: args.toolCallCount };
    }

    await _emitLog(ctx, {
      executionId: step.executionId,
      workspaceId: exe.workspaceId,
      stepId: step.stepId,
      event: logInfo.event,
      level: logInfo.level,
      message: `Step "${step.name}": ${status}`,
      durationMs,
      inputHash,
      outputHash,
      tokensUsed: args.tokensUsed,
      estimatedCostUsd: args.estimatedCostUsd,
      metadata: logMetadata,
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
      inputHash: _simpleHash(step.input),
      metadata: { dlq: true, retryAttempt, maxAttempts, strategy, dlqEntryId },
    });

    return { enqueued: false, retryAttempt, dlqEntryId } as const;
  }

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
    inputHash: _simpleHash(step.input),
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

/**
 * Create an approval gate and pause the corresponding execution step.
 *
 * When a stepId is provided and a matching executionStep is in "queued" or
 * "running" state, the step is transitioned to "awaiting-approval" so the
 * executor knows to halt and wait for the human decision.
 */
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

  // Phase 6.4 — pause the corresponding execution step while awaiting human decision
  const matchingStep = await ctx.db
    .query("executionSteps")
    .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
    .filter((q) => q.eq(q.field("stepId"), stepId))
    .first();

  if (matchingStep && (matchingStep.status === "queued" || matchingStep.status === "running")) {
    await ctx.db.patch(matchingStep._id, { status: "awaiting-approval", updatedAt: now });
  }

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

/**
 * Respond to an approval gate (approved / rejected) and transition the
 * corresponding execution step accordingly:
 *   approved → step re-queued (executor resumes work)
 *   rejected → step marked failed (execution halted)
 */
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

  // Phase 6.4 — transition the paused execution step based on decision
  await _transitionStepOnApproval(
    ctx,
    approval,
    status as "approved" | "rejected",
    args.feedback
  );

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
 * Phase 6.4 — Apply timeout behavior to a single pending approval (public API).
 *
 * Verifies workspace ownership, then delegates to `_applyTimeoutToApprovalNoAuth`.
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

  return _applyTimeoutToApprovalNoAuth(ctx, args.id);
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
 * Phase 6.4 — Scheduler-safe batch timeout processor.
 *
 * Exported as `internalMutation` — only callable from Convex crons and other
 * internal functions (not from external API clients), ensuring this system
 * operation cannot be triggered by arbitrary users.
 *
 * Design decisions:
 *   • No end-user identity requirement (scheduler/cron context has none).
 *   • Double-bounded index range `.gte("timeoutAt", 1).lte("timeoutAt", now)`
 *     excludes documents where timeoutAt is undefined (they sort below 1 in
 *     the B-tree), preventing timeout starvation when many approvals lack a
 *     timeout value.
 *   • Per-approval try-catch: a failure in one workspace cannot block
 *     approvals in other workspaces (cross-tenant isolation).
 *   • Returns processedCount + optional failedIds for observability.
 */
export async function processTimedOutApprovalsImpl(
  ctx: MutationCtx,
  args: { batchSize?: number }
) {
  const batchSize = args.batchSize && args.batchSize > 0 ? args.batchSize : 100;
  const now = Date.now();

  // Double-bounded range on the compound index:
  //   status = "pending" AND 1 <= timeoutAt <= now
  // The lower bound of 1 excludes rows where timeoutAt is undefined/null
  // (those sort to the very bottom of the B-tree, below any real timestamp).
  const toProcess = await ctx.db
    .query("approvals")
    .withIndex("by_status_and_timeout", (q) =>
      q.eq("status", "pending").gte("timeoutAt", 1).lte("timeoutAt", now)
    )
    .order("asc")
    .take(batchSize);

  let processedCount = 0;
  const failedIds: string[] = [];

  for (const approval of toProcess) {
    try {
      await _applyTimeoutToApprovalNoAuth(ctx, approval._id);
      processedCount++;
    } catch {
      // Record failure but continue — one bad workspace cannot block another
      failedIds.push(String(approval._id));
    }
  }

  return {
    processedCount,
    ...(failedIds.length > 0 ? { failedIds } : {}),
  };
}

/**
 * Exported as internalMutation — not callable by external API clients.
 * Invoke from Convex cron or scheduler only.
 */
export const processTimedOutApprovals = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await processTimedOutApprovalsImpl(ctx, args);
  },
});
