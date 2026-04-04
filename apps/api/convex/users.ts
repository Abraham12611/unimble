import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!existing) {
      return await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        name: args.name,
        firstName: args.firstName,
        lastName: args.lastName,
        avatarUrl: args.avatarUrl,
        imageUrl: args.imageUrl,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(existing._id, {
      email: args.email,
      name: args.name ?? existing.name,
      firstName: args.firstName ?? existing.firstName,
      lastName: args.lastName ?? existing.lastName,
      avatarUrl: args.avatarUrl ?? existing.avatarUrl,
      imageUrl: args.imageUrl ?? existing.imageUrl,
      updatedAt: now,
    });

    return existing._id;
  },
});

export const deleteByClerkId = internalMutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!existing) {
      return;
    }

    await ctx.db.delete(existing._id);
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

export const getUserById = internalQuery({
  args: {
    id: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getUserByClerkId = internalQuery({
  args: {
    clerkId: v.string(),
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
    name: v.optional(v.union(v.string(), v.null())),
    firstName: v.optional(v.union(v.string(), v.null())),
    lastName: v.optional(v.union(v.string(), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    imageUrl: v.optional(v.union(v.string(), v.null())),
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
