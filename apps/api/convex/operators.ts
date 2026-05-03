import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceAccess, requireWorkspaceOwner } from "./lib/auth";
import { operatorValidator } from "./validators/operator";

export async function createOperatorImpl(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    type: string;
    name: string;
    description?: string;
    config?: unknown;
    status?: string;
    memory?: unknown;
    metrics?: unknown;
  }
) {
  await requireWorkspaceOwner(ctx, args.workspaceId);

  const parsed = operatorValidator.safeParse({
    workspaceId: String(args.workspaceId),
    type: args.type,
    name: args.name,
    description: args.description,
    config: args.config,
    status: args.status,
    memory: args.memory,
    metrics: args.metrics,
  });
  if (!parsed.success) {
    throw new Error("Invalid operator");
  }

  const now = Date.now();

  const operatorId = await ctx.db.insert("operators", {
    workspaceId: args.workspaceId,
    type: parsed.data.type,
    name: parsed.data.name,
    description: parsed.data.description,
    config: parsed.data.config,
    status: parsed.data.status,
    memory: parsed.data.memory,
    metrics: parsed.data.metrics,
    createdAt: now,
    updatedAt: now,
  });

  return operatorId;
}

export const createOperator = mutation({
  args: {
    workspaceId: convexValidators.workspaceId,
    type: convexValidators.stringField,
    name: convexValidators.stringField,
    description: convexValidators.optionalString,
    config: v.optional(v.any()),
    status: convexValidators.optionalString,
    memory: v.optional(v.any()),
    metrics: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await createOperatorImpl(ctx, args);
  },
});

export async function getOperatorImpl(ctx: QueryCtx, args: { id: Id<"operators"> }) {
  const op = await ctx.db.get(args.id);
  if (!op) {
    throw new Error("Operator not found");
  }

  await requireWorkspaceAccess(ctx, op.workspaceId);
  return op;
}

export const getOperator = query({
  args: {
    id: convexValidators.operatorId,
  },
  handler: async (ctx, args) => {
    return await getOperatorImpl(ctx, args);
  },
});

export async function listOperatorsImpl(ctx: QueryCtx, args: { workspaceId: Id<"workspaces"> }) {
  await requireWorkspaceAccess(ctx, args.workspaceId);

  return await ctx.db
    .query("operators")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .take(1000);
}

export const listOperators = query({
  args: {
    workspaceId: convexValidators.workspaceId,
  },
  handler: async (ctx, args) => {
    return await listOperatorsImpl(ctx, args);
  },
});

export async function updateOperatorImpl(
  ctx: MutationCtx,
  args: {
    id: Id<"operators">;
    type?: string | null;
    name?: string | null;
    description?: string | null;
    config?: unknown;
    status?: string | null;
    memory?: unknown;
    metrics?: unknown;
  }
) {
  const op = await ctx.db.get(args.id);
  if (!op) {
    throw new Error("Operator not found");
  }

  await requireWorkspaceOwner(ctx, op.workspaceId);

  const patch: Record<string, unknown> = { updatedAt: Date.now() };

  if (args.type !== undefined) {
    const nextType = args.type === null ? "" : String(args.type);
    if (!nextType.trim()) {
      throw new Error("type is required");
    }
    patch.type = nextType;
  }

  if (args.name !== undefined) {
    const nextName = args.name === null ? "" : String(args.name);
    if (!nextName.trim()) {
      throw new Error("name is required");
    }
    patch.name = nextName;
  }

  if (args.description !== undefined) {
    const nextDescription = args.description === null ? undefined : String(args.description);
    if (nextDescription !== undefined && !nextDescription.trim()) {
      throw new Error("description is required");
    }
    patch.description = nextDescription;
  }

  if (args.status !== undefined) patch.status = args.status === null ? undefined : args.status;
  if (args.config !== undefined) patch.config = args.config;
  if (args.memory !== undefined) patch.memory = args.memory;
  if (args.metrics !== undefined) patch.metrics = args.metrics;

  await ctx.db.patch(args.id, patch);
  return args.id;
}

export const updateOperator = mutation({
  args: {
    id: convexValidators.operatorId,
    type: convexValidators.optionalNullableString,
    name: convexValidators.optionalNullableString,
    description: convexValidators.optionalNullableString,
    config: v.optional(v.any()),
    status: convexValidators.optionalNullableString,
    memory: v.optional(v.any()),
    metrics: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await updateOperatorImpl(ctx, args);
  },
});

export async function pauseOperatorImpl(ctx: MutationCtx, args: { id: Id<"operators"> }) {
  const op = await ctx.db.get(args.id);
  if (!op) {
    throw new Error("Operator not found");
  }

  await requireWorkspaceOwner(ctx, op.workspaceId);

  await ctx.db.patch(args.id, { status: "paused", updatedAt: Date.now() });
  return args.id;
}

export const pauseOperator = mutation({
  args: {
    id: convexValidators.operatorId,
  },
  handler: async (ctx, args) => {
    return await pauseOperatorImpl(ctx, args);
  },
});

export async function resumeOperatorImpl(ctx: MutationCtx, args: { id: Id<"operators"> }) {
  const op = await ctx.db.get(args.id);
  if (!op) {
    throw new Error("Operator not found");
  }

  await requireWorkspaceOwner(ctx, op.workspaceId);

  await ctx.db.patch(args.id, { status: "active", updatedAt: Date.now() });
  return args.id;
}

export const resumeOperator = mutation({
  args: {
    id: convexValidators.operatorId,
  },
  handler: async (ctx, args) => {
    return await resumeOperatorImpl(ctx, args);
  },
});

export async function deleteOperatorImpl(ctx: MutationCtx, args: { id: Id<"operators"> }) {
  const op = await ctx.db.get(args.id);
  if (!op) {
    throw new Error("Operator not found");
  }

  await requireWorkspaceOwner(ctx, op.workspaceId);

  const now = Date.now();

  // Unlink workflows from this operator (loop pattern — safe for >16,384 docs)

  while (true) {
    const wf = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_and_operator", (q) =>
        q.eq("workspaceId", op.workspaceId).eq("operatorId", args.id)
      )
      .first();
    if (!wf) break;
    await ctx.db.patch(wf._id, { operatorId: undefined, updatedAt: now });
  }

  // Unlink executions from this operator

  while (true) {
    const exe = await ctx.db
      .query("executions")
      .withIndex("by_workspace_and_operator", (q) =>
        q.eq("workspaceId", op.workspaceId).eq("operatorId", args.id)
      )
      .first();
    if (!exe) break;
    await ctx.db.patch(exe._id, { operatorId: undefined, updatedAt: now });
  }

  await ctx.db.delete(args.id);
  return args.id;
}

export const deleteOperator = mutation({
  args: {
    id: convexValidators.operatorId,
  },
  handler: async (ctx, args) => {
    return await deleteOperatorImpl(ctx, args);
  },
});

// ---------------------------------------------------------------------------
// deployOperator — Phase 8 wizard mutation
// ---------------------------------------------------------------------------
//
// Validates raw config against the operator's Zod schema (via the registry),
// creates the operator record, instantiates default workflow definitions, and
// persists workflow records linked to the operator.
//
// Trigger scheduling model: trigger definitions are stored as data on each
// workflow row (trigger.type, trigger.config). The execution engine polls
// active workflow rows and fires cron/webhook/event triggers; no explicit
// scheduler-enqueue call is needed at deploy time. This is consistent with
// how workflows created via createWorkflowImpl work throughout the app.
//

import { operatorRegistry } from "./operators/index";
import type { WorkflowDefinition } from "./operators/types";

export async function deployOperatorImpl(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    type: string;
    rawConfig?: unknown;
  }
): Promise<{ operatorId: Id<"operators">; workflowIds: Id<"workflows">[] }> {
  const { user } = await requireWorkspaceOwner(ctx, args.workspaceId);

  // Validate type is a known operator
  const validation = operatorRegistry.validateConfig(
    args.type as Parameters<typeof operatorRegistry.validateConfig>[0],
    args.rawConfig ?? {}
  );
  if (!validation.success) {
    throw new Error(`Invalid operator config: ${(validation as { success: false; error: string }).error}`);
  }

  // Instantiate to get display name + default workflows
  const instance = operatorRegistry.instantiate(
    args.type as Parameters<typeof operatorRegistry.instantiate>[0],
    args.rawConfig ?? {}
  );

  const now = Date.now();

  // Create the operator record
  const operatorId = await ctx.db.insert("operators", {
    workspaceId: args.workspaceId,
    type: args.type,
    name: (instance.getConfig() as { name?: string }).name ?? instance.displayName,
    description: instance.description,
    config: instance.getConfig(),
    status: "active",
    memory: { namespace: instance.memoryNamespace },
    metrics: instance.getMetrics(),
    createdAt: now,
    updatedAt: now,
  });

  // Create workflow records for each default workflow definition
  const workflowIds: Id<"workflows">[] = [];
  const defaultWorkflows: WorkflowDefinition[] = instance.defaultWorkflows();

  for (const wfDef of defaultWorkflows) {
    const workflowId = await ctx.db.insert("workflows", {
      workspaceId: args.workspaceId,
      operatorId,
      name: wfDef.name,
      description: wfDef.description,
      trigger: wfDef.trigger,
      steps: wfDef.steps,
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    workflowIds.push(workflowId);

    // Persist version snapshot — include createdBy for provenance parity
    // with createWorkflowImpl.
    await ctx.db.insert("workflowVersions", {
      workflowId,
      workspaceId: args.workspaceId,
      operatorId,
      name: wfDef.name,
      description: wfDef.description,
      trigger: wfDef.trigger,
      steps: wfDef.steps,
      status: "active",
      version: 1,
      createdAt: now,
      createdBy: user._id,
    });
  }

  return { operatorId, workflowIds };
}

export const deployOperator = mutation({
  args: {
    workspaceId: convexValidators.workspaceId,
    type: convexValidators.stringField,
    rawConfig: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await deployOperatorImpl(ctx, args);
  },
});
