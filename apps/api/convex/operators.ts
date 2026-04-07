import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { normalizePlatformRole } from "./rbac";
import { operatorValidator } from "./validators/operator";

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
    .collect();
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

  const workflows = await ctx.db
    .query("workflows")
    .withIndex("by_workspace_and_operator", (q) =>
      q.eq("workspaceId", op.workspaceId).eq("operatorId", args.id)
    )
    .collect();

  for (const wf of workflows) {
    await ctx.db.patch(wf._id, { operatorId: undefined, updatedAt: now });
  }

  const executions = await ctx.db
    .query("executions")
    .withIndex("by_workspace_and_operator", (q) =>
      q.eq("workspaceId", op.workspaceId).eq("operatorId", args.id)
    )
    .collect();

  for (const exe of executions) {
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
