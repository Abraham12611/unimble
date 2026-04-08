import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { normalizePlatformRole } from "./rbac";
import { executionValidator } from "./validators/execution";

async function getCurrentUserOrThrow(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const clerkId = String(identity.subject ?? "").trim();
  if (!clerkId) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  const role = normalizePlatformRole(user.role);
  const isAdmin = role === "creator";

  return { user, isAdmin };
}

async function requireWorkspaceAccess(ctx: QueryCtx | MutationCtx, workspaceId: Id<"workspaces">) {
  const { user, isAdmin } = await getCurrentUserOrThrow(ctx);

  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const isOwner = workspace.ownerId === user._id;

  let isMember = false;
  if (!isAdmin && !isOwner) {
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", user._id)
      )
      .unique();

    isMember = Boolean(membership);
    if (!isMember) {
      throw new Error("Forbidden");
    }
  }

  return { workspace, user, isAdmin, isOwner, isMember };
}

async function requireWorkspaceOwner(ctx: QueryCtx | MutationCtx, workspaceId: Id<"workspaces">) {
  const access = await requireWorkspaceAccess(ctx, workspaceId);
  if (!access.isAdmin && !access.isOwner) {
    throw new Error("Forbidden");
  }

  return access;
}

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
  await requireWorkspaceOwner(ctx, args.workspaceId);

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
      .collect();
  }

  return await ctx.db
    .query("executions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .collect();
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

  await requireWorkspaceOwner(ctx, exe.workspaceId);

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

  const terminalStatuses = new Set(["completed", "failed", "canceled"]);
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

  await requireWorkspaceOwner(ctx, exe.workspaceId);

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

  await requireWorkspaceOwner(ctx, exe.workspaceId);

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

  const steps = await ctx.db
    .query("executionSteps")
    .withIndex("by_execution", (q) => q.eq("executionId", args.id))
    .collect();

  for (const s of steps) {
    await ctx.db.delete(s._id);
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

  await requireWorkspaceOwner(ctx, exe.workspaceId);

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
      .collect();
  }

  return await ctx.db
    .query("executionSteps")
    .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
    .collect();
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

  await requireWorkspaceOwner(ctx, exe.workspaceId);

  const status = String(args.status ?? "").trim();
  if (!status) {
    throw new Error("status is required");
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
  },
  handler: async (ctx, args) => {
    return await updateExecutionStepStatusImpl(ctx, args);
  },
});
