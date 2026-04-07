import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { normalizePlatformRole } from "./rbac";
import { workspaceValidator } from "./validators/workspace";

function slugify(input: string) {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base.length > 0 ? base : "workspace";
}

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

async function requireOrganizationAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) {
  const { user, isAdmin } = await getCurrentUserOrThrow(ctx);

  const org = await ctx.db.get(organizationId);
  if (!org) {
    throw new Error("Organization not found");
  }

  if (!isAdmin && org.ownerId !== user._id) {
    throw new Error("Forbidden");
  }

  return { org, user, isAdmin };
}

export async function createWorkspaceImpl(
  ctx: MutationCtx,
  args: {
    name: string;
    slug?: string;
    description?: string;
    status?: string;
    plan?: string;
    settings?: unknown;
    organizationId?: Id<"organizations">;
  }
) {
  const { user } = await getCurrentUserOrThrow(ctx);

  const parsed = workspaceValidator.safeParse({
    name: args.name,
    slug: args.slug,
    description: args.description,
    status: args.status,
    plan: args.plan,
    settings: args.settings,
    organizationId: args.organizationId ? String(args.organizationId) : undefined,
  });
  if (!parsed.success) {
    throw new Error("Invalid workspace");
  }

  if (args.organizationId) {
    await requireOrganizationAccess(ctx, args.organizationId);
  }

  const now = Date.now();

  const slugBase = slugify(args.slug?.trim() || args.name);
  let slug = slugBase;

  let slugFound = false;
  for (let i = 0; i < 25; i += 1) {
    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!existing) {
      slugFound = true;
      break;
    }

    slug = `${slugBase}-${i + 2}`;
  }

  if (!slugFound) {
    throw new Error("Could not generate a unique workspace slug after 25 attempts");
  }

  const workspaceId = await ctx.db.insert("workspaces", {
    organizationId: args.organizationId,
    name: parsed.data.name,
    slug,
    description: parsed.data.description,
    ownerId: user._id,
    status: parsed.data.status,
    plan: parsed.data.plan,
    settings: parsed.data.settings,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("workspaceMembers", {
    workspaceId,
    userId: user._id,
    role: "owner",
    joinedAt: now,
  });

  if (!user.defaultWorkspaceId) {
    await ctx.db.patch(user._id, { defaultWorkspaceId: workspaceId, updatedAt: now });
  }

  return workspaceId;
}

export const createWorkspace = mutation({
  args: {
    name: convexValidators.stringField,
    slug: convexValidators.optionalString,
    description: convexValidators.optionalString,
    status: convexValidators.optionalString,
    plan: convexValidators.optionalString,
    settings: v.optional(v.any()),
    organizationId: v.optional(convexValidators.organizationId),
  },
  handler: async (ctx, args) => {
    return await createWorkspaceImpl(ctx, args);
  },
});

export async function getWorkspaceImpl(ctx: QueryCtx, args: { id: Id<"workspaces"> }) {
  const { workspace } = await requireWorkspaceAccess(ctx, args.id);
  return workspace;
}

export const getWorkspace = query({
  args: {
    id: convexValidators.workspaceId,
  },
  handler: async (ctx, args) => {
    return await getWorkspaceImpl(ctx, args);
  },
});

export async function listWorkspacesImpl(ctx: QueryCtx) {
  const { user, isAdmin } = await getCurrentUserOrThrow(ctx);

  if (isAdmin) {
    return await ctx.db.query("workspaces").order("desc").collect();
  }

  const owned = await ctx.db
    .query("workspaces")
    .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
    .order("desc")
    .collect();

  const memberships = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();

  const seen = new Set<string>(owned.map((w) => String(w._id)));
  const memberWorkspaces: typeof owned = [];

  for (const m of memberships) {
    const id = String(m.workspaceId);
    if (seen.has(id)) continue;

    const ws = await ctx.db.get(m.workspaceId);
    if (ws) {
      memberWorkspaces.push(ws);
      seen.add(id);
    }
  }

  const all = [...owned, ...memberWorkspaces];
  all.sort((a, b) => b._creationTime - a._creationTime);
  return all;
}

export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    return await listWorkspacesImpl(ctx);
  },
});

export async function updateWorkspaceImpl(
  ctx: MutationCtx,
  args: {
    id: Id<"workspaces">;
    name?: string | null;
    slug?: string | null;
    description?: string | null;
    status?: string | null;
    plan?: string | null;
    settings?: unknown;
    organizationId?: Id<"organizations"> | null;
  }
) {
  const { workspace } = await requireWorkspaceOwner(ctx, args.id);

  const patch: Record<string, unknown> = { updatedAt: Date.now() };

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
  if (args.plan !== undefined) patch.plan = args.plan === null ? undefined : args.plan;
  if (args.settings !== undefined) patch.settings = args.settings;

  if (args.organizationId !== undefined) {
    const nextOrgId = args.organizationId === null ? undefined : args.organizationId;
    if (nextOrgId) {
      await requireOrganizationAccess(ctx, nextOrgId);
    }
    patch.organizationId = nextOrgId;
  }

  if (args.slug !== undefined) {
    const nextSlug = args.slug === null ? "" : String(args.slug).trim();
    if (!nextSlug) {
      throw new Error("slug is required");
    }

    if (nextSlug !== workspace.slug) {
      const existing = await ctx.db
        .query("workspaces")
        .withIndex("by_slug", (q) => q.eq("slug", nextSlug))
        .unique();
      if (existing) {
        throw new Error("Workspace slug already exists");
      }
    }

    patch.slug = nextSlug;
  }

  await ctx.db.patch(args.id, patch);
  return args.id;
}

export const updateWorkspace = mutation({
  args: {
    id: convexValidators.workspaceId,
    name: convexValidators.optionalNullableString,
    slug: convexValidators.optionalNullableString,
    description: convexValidators.optionalNullableString,
    status: convexValidators.optionalNullableString,
    plan: convexValidators.optionalNullableString,
    settings: v.optional(v.any()),
    organizationId: v.optional(v.union(convexValidators.organizationId, v.null())),
  },
  handler: async (ctx, args) => {
    return await updateWorkspaceImpl(ctx, args);
  },
});

export async function deleteWorkspaceImpl(ctx: MutationCtx, args: { id: Id<"workspaces"> }) {
  await requireWorkspaceOwner(ctx, args.id);

  const members = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
    .collect();

  for (const m of members) {
    const memberUser = await ctx.db.get(m.userId);
    if (memberUser?.defaultWorkspaceId === args.id) {
      await ctx.db.patch(m.userId, {
        defaultWorkspaceId: undefined,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(m._id);
  }

  const invites = await ctx.db
    .query("workspaceInvites")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
    .collect();

  for (const inv of invites) {
    await ctx.db.delete(inv._id);
  }

  const operators = await ctx.db
    .query("operators")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
    .collect();
  for (const op of operators) {
    await ctx.db.delete(op._id);
  }

  const workflows = await ctx.db
    .query("workflows")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
    .collect();
  for (const wf of workflows) {
    await ctx.db.delete(wf._id);
  }

  const executions = await ctx.db
    .query("executions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
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

  const integrations = await ctx.db
    .query("integrations")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
    .collect();
  for (const i of integrations) {
    await ctx.db.delete(i._id);
  }

  const events = await ctx.db
    .query("events")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
    .collect();
  for (const e of events) {
    await ctx.db.delete(e._id);
  }

  const learnings = await ctx.db
    .query("learnings")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
    .collect();
  for (const l of learnings) {
    await ctx.db.delete(l._id);
  }

  const workflowVersions = await ctx.db
    .query("workflowVersions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
    .collect();
  for (const v of workflowVersions) {
    await ctx.db.delete(v._id);
  }

  await ctx.db.delete(args.id);
  return args.id;
}

export const deleteWorkspace = mutation({
  args: {
    id: convexValidators.workspaceId,
  },
  handler: async (ctx, args) => {
    return await deleteWorkspaceImpl(ctx, args);
  },
});

function normalizeEmailOrThrow(raw: string) {
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new Error("email is required");
  }
  if (email.length > 320) {
    throw new Error("email is too long");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email");
  }
  return email;
}

export async function inviteWorkspaceMemberImpl(
  ctx: MutationCtx,
  args: { workspaceId: Id<"workspaces">; email: string; expiresAt?: number | null }
) {
  const { user } = await requireWorkspaceOwner(ctx, args.workspaceId);

  const email = normalizeEmailOrThrow(args.email);
  const now = Date.now();

  const existing = await ctx.db
    .query("workspaceInvites")
    .withIndex("by_workspace_and_email", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("email", email)
    )
    .unique();

  if (existing && existing.status === "pending") {
    return existing._id;
  }

  if (existing) {
    await ctx.db.delete(existing._id);
  }

  const inviteId = await ctx.db.insert("workspaceInvites", {
    workspaceId: args.workspaceId,
    email,
    invitedBy: user._id,
    status: "pending",
    expiresAt: args.expiresAt === null ? undefined : args.expiresAt,
    createdAt: now,
  });

  return inviteId;
}

export const inviteWorkspaceMember = mutation({
  args: {
    workspaceId: convexValidators.workspaceId,
    email: convexValidators.stringField,
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    return await inviteWorkspaceMemberImpl(ctx, args);
  },
});

export async function listWorkspaceInvitesImpl(
  ctx: QueryCtx,
  args: { workspaceId: Id<"workspaces"> }
) {
  await requireWorkspaceOwner(ctx, args.workspaceId);

  return await ctx.db
    .query("workspaceInvites")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .collect();
}

export const listWorkspaceInvites = query({
  args: {
    workspaceId: convexValidators.workspaceId,
  },
  handler: async (ctx, args) => {
    return await listWorkspaceInvitesImpl(ctx, args);
  },
});

export async function acceptWorkspaceInviteImpl(
  ctx: MutationCtx,
  args: { workspaceId: Id<"workspaces"> }
) {
  const { user } = await getCurrentUserOrThrow(ctx);

  const email = normalizeEmailOrThrow(user.email);

  const invite = await ctx.db
    .query("workspaceInvites")
    .withIndex("by_workspace_and_email", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("email", email)
    )
    .unique();

  if (!invite || invite.status !== "pending") {
    throw new Error("Invite not found");
  }

  if (invite.expiresAt && invite.expiresAt < Date.now()) {
    await ctx.db.delete(invite._id);
    throw new Error("Invite expired");
  }

  const existingMember = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_and_user", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("userId", user._id)
    )
    .unique();

  const now = Date.now();

  if (!existingMember) {
    await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      userId: user._id,
      role: "member",
      joinedAt: now,
    });
  }

  await ctx.db.delete(invite._id);

  if (!user.defaultWorkspaceId) {
    await ctx.db.patch(user._id, {
      defaultWorkspaceId: args.workspaceId,
      updatedAt: now,
    });
  }

  return args.workspaceId;
}

export const acceptWorkspaceInvite = mutation({
  args: {
    workspaceId: convexValidators.workspaceId,
  },
  handler: async (ctx, args) => {
    return await acceptWorkspaceInviteImpl(ctx, args);
  },
});

export async function listWorkspaceMembersImpl(
  ctx: QueryCtx,
  args: { workspaceId: Id<"workspaces"> }
) {
  await requireWorkspaceAccess(ctx, args.workspaceId);

  return await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .collect();
}

export const listWorkspaceMembers = query({
  args: {
    workspaceId: convexValidators.workspaceId,
  },
  handler: async (ctx, args) => {
    return await listWorkspaceMembersImpl(ctx, args);
  },
});

export async function removeWorkspaceMemberImpl(
  ctx: MutationCtx,
  args: { workspaceId: Id<"workspaces">; userId: Id<"users"> }
) {
  const { workspace } = await requireWorkspaceOwner(ctx, args.workspaceId);

  if (args.userId === workspace.ownerId) {
    throw new Error("Cannot remove owner");
  }

  const existing = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_and_user", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("userId", args.userId)
    )
    .unique();

  if (!existing) {
    return;
  }

  const memberUser = await ctx.db.get(args.userId);
  if (memberUser?.defaultWorkspaceId === args.workspaceId) {
    await ctx.db.patch(args.userId, {
      defaultWorkspaceId: undefined,
      updatedAt: Date.now(),
    });
  }

  await ctx.db.delete(existing._id);
}

export const removeWorkspaceMember = mutation({
  args: {
    workspaceId: convexValidators.workspaceId,
    userId: convexValidators.userId,
  },
  handler: async (ctx, args) => {
    return await removeWorkspaceMemberImpl(ctx, args);
  },
});
