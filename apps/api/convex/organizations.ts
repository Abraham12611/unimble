import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { normalizePlatformRole } from "./rbac";
import { organizationValidator } from "./validators/organization";

function slugify(input: string) {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base.length > 0 ? base : "organization";
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

async function requireOrgAccess(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
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

export async function createOrganizationImpl(
  ctx: MutationCtx,
  args: {
    name: string;
    slug?: string;
    plan?: string;
    status?: string;
    settings?: unknown;
  }
) {
  const { user } = await getCurrentUserOrThrow(ctx);

  const parsed = organizationValidator.safeParse(args);
  if (!parsed.success) {
    throw new Error("Invalid organization");
  }

  const now = Date.now();

  const slugBase = slugify(args.slug?.trim() || args.name);
  let slug = slugBase;

  let slugFound = false;
  for (let i = 0; i < 25; i += 1) {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!existing) {
      slugFound = true;
      break;
    }

    slug = `${slugBase}-${i + 2}`;
  }

  if (!slugFound) {
    throw new Error("Could not generate a unique organization slug after 25 attempts");
  }

  const organizationId = await ctx.db.insert("organizations", {
    name: parsed.data.name,
    slug,
    ownerId: user._id,
    plan: parsed.data.plan,
    status: parsed.data.status,
    settings: parsed.data.settings,
    createdAt: now,
    updatedAt: now,
  });

  return organizationId;
}

export const createOrganization = mutation({
  args: {
    name: convexValidators.stringField,
    slug: convexValidators.optionalString,
    plan: convexValidators.optionalString,
    status: convexValidators.optionalString,
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await createOrganizationImpl(ctx, args);
  },
});

export async function getOrganizationImpl(ctx: QueryCtx, args: { id: Id<"organizations"> }) {
  const { org } = await requireOrgAccess(ctx, args.id);
  return org;
}

export const getOrganization = query({
  args: {
    id: convexValidators.organizationId,
  },
  handler: async (ctx, args) => {
    return await getOrganizationImpl(ctx, args);
  },
});

export async function getOrganizationBySlugImpl(ctx: QueryCtx, args: { slug: string }) {
  const { user, isAdmin } = await getCurrentUserOrThrow(ctx);

  const org = await ctx.db
    .query("organizations")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug))
    .unique();

  if (!org) {
    return null;
  }

  if (!isAdmin && org.ownerId !== user._id) {
    throw new Error("Forbidden");
  }

  return org;
}

export const getOrganizationBySlug = query({
  args: {
    slug: convexValidators.stringField,
  },
  handler: async (ctx, args) => {
    return await getOrganizationBySlugImpl(ctx, args);
  },
});

export async function listOrganizationsImpl(ctx: QueryCtx) {
  const { user, isAdmin } = await getCurrentUserOrThrow(ctx);

  if (isAdmin) {
    return await ctx.db.query("organizations").order("desc").collect();
  }

  return await ctx.db
    .query("organizations")
    .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
    .order("desc")
    .collect();
}

export const listOrganizations = query({
  args: {},
  handler: async (ctx) => {
    return await listOrganizationsImpl(ctx);
  },
});

export async function updateOrganizationImpl(
  ctx: MutationCtx,
  args: {
    id: Id<"organizations">;
    name?: string | null;
    slug?: string | null;
    plan?: string | null;
    status?: string | null;
    settings?: unknown;
  }
) {
  const { org } = await requireOrgAccess(ctx, args.id);

  const patch: Record<string, unknown> = { updatedAt: Date.now() };

  if (args.name !== undefined) {
    const nextName = args.name === null ? "" : String(args.name);
    if (!nextName.trim()) {
      throw new Error("name is required");
    }
    patch.name = nextName;
  }

  if (args.plan !== undefined) patch.plan = args.plan === null ? undefined : args.plan;
  if (args.status !== undefined) patch.status = args.status === null ? undefined : args.status;
  if (args.settings !== undefined) patch.settings = args.settings;

  if (args.slug !== undefined) {
    const nextSlug = args.slug === null ? "" : String(args.slug).trim();
    if (!nextSlug) {
      throw new Error("slug is required");
    }

    if (nextSlug !== org.slug) {
      const existing = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", nextSlug))
        .unique();
      if (existing) {
        throw new Error("Organization slug already exists");
      }
    }

    patch.slug = nextSlug;
  }

  await ctx.db.patch(args.id, patch);
  return args.id;
}

export const updateOrganization = mutation({
  args: {
    id: convexValidators.organizationId,
    name: convexValidators.optionalNullableString,
    slug: convexValidators.optionalNullableString,
    plan: convexValidators.optionalNullableString,
    status: convexValidators.optionalNullableString,
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await updateOrganizationImpl(ctx, args);
  },
});

export async function deleteOrganizationImpl(ctx: MutationCtx, args: { id: Id<"organizations"> }) {
  await requireOrgAccess(ctx, args.id);

  const now = Date.now();
  const workspaces = await ctx.db
    .query("workspaces")
    .withIndex("by_organization", (q) => q.eq("organizationId", args.id))
    .collect();

  for (const ws of workspaces) {
    await ctx.db.patch(ws._id, { organizationId: undefined, updatedAt: now });
  }

  await ctx.db.delete(args.id);
  return args.id;
}

export const deleteOrganization = mutation({
  args: {
    id: convexValidators.organizationId,
  },
  handler: async (ctx, args) => {
    return await deleteOrganizationImpl(ctx, args);
  },
});
