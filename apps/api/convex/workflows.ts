import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { normalizePlatformRole } from "./rbac";
import { workflowValidator } from "./validators/workflow";

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

export async function createWorkflowImpl(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    operatorId?: Id<"operators">;
    name: string;
    description?: string;
    trigger?: unknown;
    steps?: unknown;
    status?: string;
  }
) {
  const { user } = await requireWorkspaceOwner(ctx, args.workspaceId);

  const parsed = workflowValidator.safeParse({
    workspaceId: String(args.workspaceId),
    operatorId: args.operatorId ? String(args.operatorId) : undefined,
    name: args.name,
    description: args.description,
    trigger: args.trigger,
    steps: args.steps,
    status: args.status,
    version: 1,
  });
  if (!parsed.success) {
    throw new Error("Invalid workflow");
  }

  const now = Date.now();

  const workflowId = await ctx.db.insert("workflows", {
    workspaceId: args.workspaceId,
    operatorId: args.operatorId,
    name: parsed.data.name,
    description: parsed.data.description,
    trigger: parsed.data.trigger,
    steps: parsed.data.steps,
    status: parsed.data.status,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("workflowVersions", {
    workflowId,
    workspaceId: args.workspaceId,
    operatorId: args.operatorId,
    name: parsed.data.name,
    description: parsed.data.description,
    trigger: parsed.data.trigger,
    steps: parsed.data.steps,
    status: parsed.data.status,
    version: 1,
    createdAt: now,
    createdBy: user._id,
  });

  return workflowId;
}

export const createWorkflow = mutation({
  args: {
    workspaceId: convexValidators.workspaceId,
    operatorId: v.optional(convexValidators.operatorId),
    name: convexValidators.stringField,
    description: convexValidators.optionalString,
    trigger: v.optional(v.any()),
    steps: v.optional(v.any()),
    status: convexValidators.optionalString,
  },
  handler: async (ctx, args) => {
    return await createWorkflowImpl(ctx, args);
  },
});

export async function getWorkflowImpl(ctx: QueryCtx, args: { id: Id<"workflows"> }) {
  const wf = await ctx.db.get(args.id);
  if (!wf) {
    throw new Error("Workflow not found");
  }

  await requireWorkspaceAccess(ctx, wf.workspaceId);
  return wf;
}

export const getWorkflow = query({
  args: {
    id: convexValidators.workflowId,
  },
  handler: async (ctx, args) => {
    return await getWorkflowImpl(ctx, args);
  },
});

export async function listWorkflowsImpl(ctx: QueryCtx, args: { workspaceId: Id<"workspaces"> }) {
  await requireWorkspaceAccess(ctx, args.workspaceId);

  return await ctx.db
    .query("workflows")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .collect();
}

export const listWorkflows = query({
  args: {
    workspaceId: convexValidators.workspaceId,
  },
  handler: async (ctx, args) => {
    return await listWorkflowsImpl(ctx, args);
  },
});

export async function updateWorkflowImpl(
  ctx: MutationCtx,
  args: {
    id: Id<"workflows">;
    operatorId?: Id<"operators"> | null;
    name?: string | null;
    description?: string | null;
    trigger?: unknown;
    steps?: unknown;
    status?: string | null;
  }
) {
  const wf = await ctx.db.get(args.id);
  if (!wf) {
    throw new Error("Workflow not found");
  }

  const { user } = await requireWorkspaceOwner(ctx, wf.workspaceId);

  const patch: Record<string, unknown> = { updatedAt: Date.now() };

  if (args.operatorId !== undefined) {
    patch.operatorId = args.operatorId === null ? undefined : args.operatorId;
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
  if (args.trigger !== undefined) patch.trigger = args.trigger;
  if (args.steps !== undefined) patch.steps = args.steps;

  const prevVersion = typeof wf.version === "number" && wf.version > 0 ? wf.version : 1;
  const nextVersion = prevVersion + 1;
  patch.version = nextVersion;

  await ctx.db.patch(args.id, patch);

  const next = await ctx.db.get(args.id);
  if (!next) {
    throw new Error("Workflow not found");
  }

  await ctx.db.insert("workflowVersions", {
    workflowId: next._id,
    workspaceId: next.workspaceId,
    operatorId: next.operatorId,
    name: next.name,
    description: next.description,
    trigger: next.trigger,
    steps: next.steps,
    status: next.status,
    version: nextVersion,
    createdAt: Date.now(),
    createdBy: user._id,
  });

  return args.id;
}

export const updateWorkflow = mutation({
  args: {
    id: convexValidators.workflowId,
    operatorId: v.optional(v.union(convexValidators.operatorId, v.null())),
    name: convexValidators.optionalNullableString,
    description: convexValidators.optionalNullableString,
    trigger: v.optional(v.any()),
    steps: v.optional(v.any()),
    status: convexValidators.optionalNullableString,
  },
  handler: async (ctx, args) => {
    return await updateWorkflowImpl(ctx, args);
  },
});

export async function duplicateWorkflowImpl(
  ctx: MutationCtx,
  args: {
    id: Id<"workflows">;
    name?: string;
  }
) {
  const wf = await ctx.db.get(args.id);
  if (!wf) {
    throw new Error("Workflow not found");
  }

  const { user } = await requireWorkspaceOwner(ctx, wf.workspaceId);

  const nextName = String(args.name ?? `${wf.name} Copy`);
  if (!nextName.trim()) {
    throw new Error("name is required");
  }

  const now = Date.now();

  const newWorkflowId = await ctx.db.insert("workflows", {
    workspaceId: wf.workspaceId,
    operatorId: wf.operatorId,
    name: nextName,
    description: wf.description,
    trigger: wf.trigger,
    steps: wf.steps,
    status: wf.status,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("workflowVersions", {
    workflowId: newWorkflowId,
    workspaceId: wf.workspaceId,
    operatorId: wf.operatorId,
    name: nextName,
    description: wf.description,
    trigger: wf.trigger,
    steps: wf.steps,
    status: wf.status,
    version: 1,
    createdAt: now,
    createdBy: user._id,
  });

  return newWorkflowId;
}

export const duplicateWorkflow = mutation({
  args: {
    id: convexValidators.workflowId,
    name: convexValidators.optionalString,
  },
  handler: async (ctx, args) => {
    return await duplicateWorkflowImpl(ctx, args);
  },
});

export async function deleteWorkflowImpl(ctx: MutationCtx, args: { id: Id<"workflows"> }) {
  const wf = await ctx.db.get(args.id);
  if (!wf) {
    throw new Error("Workflow not found");
  }

  await requireWorkspaceOwner(ctx, wf.workspaceId);

  const versions = await ctx.db
    .query("workflowVersions")
    .withIndex("by_workflow", (q) => q.eq("workflowId", wf._id))
    .collect();
  for (const v of versions) {
    await ctx.db.delete(v._id);
  }

  const executions = await ctx.db
    .query("executions")
    .withIndex("by_workflow", (q) => q.eq("workflowId", wf._id))
    .collect();

  for (const exe of executions) {
    const steps = await ctx.db
      .query("executionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", exe._id))
      .collect();

    for (const step of steps) {
      await ctx.db.delete(step._id);
    }

    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_execution", (q) => q.eq("executionId", exe._id))
      .collect();

    for (const approval of approvals) {
      await ctx.db.delete(approval._id);
    }

    await ctx.db.delete(exe._id);
  }

  await ctx.db.delete(args.id);
  return args.id;
}

export const deleteWorkflow = mutation({
  args: {
    id: convexValidators.workflowId,
  },
  handler: async (ctx, args) => {
    return await deleteWorkflowImpl(ctx, args);
  },
});

export async function listWorkflowVersionsImpl(
  ctx: QueryCtx,
  args: { workflowId: Id<"workflows"> }
) {
  const wf = await ctx.db.get(args.workflowId);
  if (!wf) {
    throw new Error("Workflow not found");
  }

  await requireWorkspaceAccess(ctx, wf.workspaceId);

  return await ctx.db
    .query("workflowVersions")
    .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
    .order("desc")
    .collect();
}

export const listWorkflowVersions = query({
  args: {
    workflowId: convexValidators.workflowId,
  },
  handler: async (ctx, args) => {
    return await listWorkflowVersionsImpl(ctx, args);
  },
});
