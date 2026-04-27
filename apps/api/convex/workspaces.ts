import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { deleteWorkflowImpl } from "./workflows";
import { workspaceValidator } from "./validators/workspace";
import {
  getCurrentUserOrThrow,
  requireWorkspaceAccess,
  requireWorkspaceOwner,
  requireWorkspaceOwnerOrAdmin,
  slugify,
} from "./lib/auth";

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

  // Delete members (loop pattern — safe for >16,384 documents)

  while (true) {
    const m = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .first();
    if (!m) break;

    const memberUser = await ctx.db.get(m.userId);
    if (memberUser?.defaultWorkspaceId === args.id) {
      await ctx.db.patch(m.userId, {
        defaultWorkspaceId: undefined,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(m._id);
  }

  // Delete invites

  while (true) {
    const inv = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .first();
    if (!inv) break;
    await ctx.db.delete(inv._id);
  }

  // Delete operators

  while (true) {
    const op = await ctx.db
      .query("operators")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .first();
    if (!op) break;
    await ctx.db.delete(op._id);
  }

  // Delete workflows (uses deleteWorkflowImpl for cascade)

  while (true) {
    const wf = await ctx.db
      .query("workflows")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .first();
    if (!wf) break;
    await deleteWorkflowImpl(ctx, { id: wf._id });
  }

  // Delete integrations

  while (true) {
    const i = await ctx.db
      .query("integrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .first();
    if (!i) break;
    await ctx.db.delete(i._id);
  }

  // Delete events

  while (true) {
    const e = await ctx.db
      .query("events")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .first();
    if (!e) break;
    await ctx.db.delete(e._id);
  }

  // Delete learnings

  while (true) {
    const l = await ctx.db
      .query("learnings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .first();
    if (!l) break;
    await ctx.db.delete(l._id);
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
  const { user } = await requireWorkspaceOwnerOrAdmin(ctx, args.workspaceId);

  const email = normalizeEmailOrThrow(args.email);
  const now = Date.now();

  const existing = await ctx.db
    .query("workspaceInvites")
    .withIndex("by_workspace_and_email", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("email", email)
    )
    .unique();

  // Only short-circuit if the existing invite is both pending AND not expired
  const isActiveAndPending =
    existing?.status === "pending" && (!existing.expiresAt || existing.expiresAt >= now);

  if (isActiveAndPending) {
    return existing!._id;
  }

  if (existing) {
    await ctx.db.delete(existing._id);
  }

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const defaultExpiresAt = now + SEVEN_DAYS_MS;

  const inviteId = await ctx.db.insert("workspaceInvites", {
    workspaceId: args.workspaceId,
    email,
    invitedBy: user._id,
    status: "pending",
    expiresAt: args.expiresAt === null ? undefined : (args.expiresAt ?? defaultExpiresAt),
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
  await requireWorkspaceAccess(ctx, args.workspaceId);

  const now = Date.now();
  const all = await ctx.db
    .query("workspaceInvites")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .collect();

  // Exclude invites whose expiry has passed
  return all.filter((inv) => !inv.expiresAt || inv.expiresAt >= now);
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

/**
 * Lists workspace members enriched with user profile data (name, email, avatar).
 */
export async function listWorkspaceMembersWithProfilesImpl(
  ctx: QueryCtx,
  args: { workspaceId: Id<"workspaces"> }
) {
  await requireWorkspaceAccess(ctx, args.workspaceId);

  const members = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .collect();

  const enriched = [];
  for (const member of members) {
    const user = await ctx.db.get(member.userId);
    enriched.push({
      ...member,
      user: user
        ? {
            email: user.email,
            name: user.name ?? user.firstName ?? undefined,
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatarUrl ?? user.imageUrl ?? undefined,
          }
        : null,
    });
  }

  return enriched;
}

export const listWorkspaceMembersWithProfiles = query({
  args: {
    workspaceId: convexValidators.workspaceId,
  },
  handler: async (ctx, args) => {
    return await listWorkspaceMembersWithProfilesImpl(ctx, args);
  },
});

export async function removeWorkspaceMemberImpl(
  ctx: MutationCtx,
  args: { workspaceId: Id<"workspaces">; userId: Id<"users"> }
) {
  const { workspace } = await requireWorkspaceOwnerOrAdmin(ctx, args.workspaceId);

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
