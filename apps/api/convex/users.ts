import { internalMutation } from "./_generated/server";
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
