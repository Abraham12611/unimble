import { convexValidators } from "./argValidators";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import {
  derivePlatformRole,
  normalizePlatformRole,
  requirePermission,
  type PlatformRole,
} from "./rbac";

export const upsertFromClerk = internalMutation({
  args: {
    clerkId: convexValidators.stringField,
    email: convexValidators.stringField,
    name: convexValidators.optionalString,
    firstName: convexValidators.optionalString,
    lastName: convexValidators.optionalString,
    avatarUrl: convexValidators.optionalString,
    imageUrl: convexValidators.optionalString,
  },
  handler: async (ctx, args) => {
    if (!args.clerkId.trim()) {
      throw new Error("clerkId is required");
    }
    if (!args.email.trim()) {
      throw new Error("email is required");
    }

    const now = Date.now();

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!existing) {
      const platformRole = derivePlatformRole({
        clerkId: args.clerkId,
        email: args.email,
        existingRole: undefined,
      });
      return await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        name: args.name,
        firstName: args.firstName,
        lastName: args.lastName,
        avatarUrl: args.avatarUrl,
        imageUrl: args.imageUrl,
        role: platformRole,
        createdAt: now,
        updatedAt: now,
      });
    }

    const platformRole = derivePlatformRole({
      clerkId: args.clerkId,
      email: args.email,
      existingRole: existing.role,
    });

    await ctx.db.patch(existing._id, {
      email: args.email,
      name: args.name ?? existing.name,
      firstName: args.firstName ?? existing.firstName,
      lastName: args.lastName ?? existing.lastName,
      avatarUrl: args.avatarUrl ?? existing.avatarUrl,
      imageUrl: args.imageUrl ?? existing.imageUrl,
      role: platformRole,
      updatedAt: now,
    });

    return existing._id;
  },
});

export const deleteByClerkId = internalMutation({
  args: {
    clerkId: convexValidators.stringField,
  },
  handler: async (ctx, args) => {
    if (!args.clerkId.trim()) {
      throw new Error("clerkId is required");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!existing) {
      return;
    }

    const userId = existing._id;

    const ownedWorkspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();

    for (const ws of ownedWorkspaces) {
      const members = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", ws._id))
        .collect();

      for (const m of members) {
        if (m.userId !== userId) {
          const memberUser = await ctx.db.get(m.userId);
          if (memberUser?.defaultWorkspaceId === ws._id) {
            await ctx.db.patch(m.userId, {
              defaultWorkspaceId: undefined,
              updatedAt: Date.now(),
            });
          }
        }

        await ctx.db.delete(m._id);
      }

      const invites = await ctx.db
        .query("workspaceInvites")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", ws._id))
        .collect();

      for (const inv of invites) {
        await ctx.db.delete(inv._id);
      }

      await ctx.db.delete(ws._id);
    }

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const m of memberships) {
      await ctx.db.delete(m._id);
    }

    const invitesByUser = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_invited_by", (q) => q.eq("invitedBy", userId))
      .collect();
    for (const inv of invitesByUser) {
      await ctx.db.delete(inv._id);
    }

    const membersByInviter = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_invited_by", (q) => q.eq("invitedBy", userId))
      .collect();
    for (const m of membersByInviter) {
      await ctx.db.patch(m._id, { invitedBy: undefined });
    }

    await ctx.db.delete(userId);
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const clerkId = identity.subject;
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});

export const listUsers = query({
  args: {
    paginationOpts: convexValidators.paginationOpts,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkId = identity.subject;
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    const role = normalizePlatformRole(currentUser.role);
    requirePermission(role, "platform:admin");

    return await ctx.db.query("users").order("desc").paginate(args.paginationOpts);
  },
});

export const getUserById = internalQuery({
  args: {
    id: convexValidators.userId,
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getUserByClerkId = internalQuery({
  args: {
    clerkId: convexValidators.stringField,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

export const updateUser = mutation({
  args: {
    name: convexValidators.optionalNullableString,
    firstName: convexValidators.optionalNullableString,
    lastName: convexValidators.optionalNullableString,
    avatarUrl: convexValidators.optionalNullableString,
    imageUrl: convexValidators.optionalNullableString,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkId = identity.subject;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };

    if (args.name !== undefined) patch.name = args.name === null ? undefined : args.name;
    if (args.firstName !== undefined)
      patch.firstName = args.firstName === null ? undefined : args.firstName;
    if (args.lastName !== undefined)
      patch.lastName = args.lastName === null ? undefined : args.lastName;
    if (args.avatarUrl !== undefined)
      patch.avatarUrl = args.avatarUrl === null ? undefined : args.avatarUrl;
    if (args.imageUrl !== undefined)
      patch.imageUrl = args.imageUrl === null ? undefined : args.imageUrl;

    await ctx.db.patch(user._id, patch);

    return user._id;
  },
});

export const setPlatformRole = mutation({
  args: {
    userId: convexValidators.userId,
    role: convexValidators.platformRole,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkId = identity.subject;
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    const role = normalizePlatformRole(currentUser.role);
    requirePermission(role, "platform:admin");

    if (args.userId === currentUser._id && args.role !== "creator") {
      throw new Error("Cannot demote your own creator account");
    }

    const now = Date.now();
    await ctx.db.patch(args.userId, {
      role: args.role as PlatformRole,
      updatedAt: now,
    });

    return args.userId;
  },
});
