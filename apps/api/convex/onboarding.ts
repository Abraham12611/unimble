import { mutationGeneric } from "convex/server";
import { v } from "convex/values";

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

function splitEmails(input: string) {
  return input
    .split(/[\n,;]+/g)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isLikelyEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

export const completeOnboarding = mutationGeneric({
  args: {
    fullName: v.string(),
    avatarUrl: v.string(),
    companyName: v.string(),
    companySize: v.string(),
    useCase: v.string(),
    workspaceName: v.string(),
    inviteEmails: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkId = identity.subject;
    const email = identity.email;
    if (!email) {
      throw new Error("Missing email");
    }

    const now = Date.now();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    const [firstName, ...rest] = args.fullName.trim().split(/\s+/g);
    const lastName = rest.length > 0 ? rest.join(" ") : undefined;

    const onboardingPayload = {
      fullName: args.fullName,
      avatarUrl: args.avatarUrl,
      companyName: args.companyName,
      companySize: args.companySize,
      useCase: args.useCase,
      workspaceName: args.workspaceName,
      inviteEmails: args.inviteEmails,
      completedAt: now,
    };

    let userId;
    if (!existingUser) {
      userId = await ctx.db.insert("users", {
        clerkId,
        email,
        firstName: firstName || undefined,
        lastName,
        imageUrl: args.avatarUrl || identity.pictureUrl || undefined,
        role: "owner",
        onboardingComplete: false,
        onboarding: onboardingPayload,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      userId = existingUser._id;
      await ctx.db.patch(userId, {
        email,
        firstName: firstName || existingUser.firstName,
        lastName: lastName ?? existingUser.lastName,
        imageUrl: args.avatarUrl || existingUser.imageUrl,
        onboarding: onboardingPayload,
        updatedAt: now,
      });

      if (existingUser.onboardingComplete && existingUser.defaultWorkspaceId) {
        return {
          workspaceId: existingUser.defaultWorkspaceId,
        };
      }
    }

    const rawWorkspaceName = args.workspaceName.trim() || args.companyName.trim() || "Workspace";

    const slugBase = slugify(rawWorkspaceName);
    let slug = slugBase;

    for (let i = 0; i < 25; i += 1) {
      const existingWorkspace = await ctx.db
        .query("workspaces")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();

      if (!existingWorkspace) break;
      slug = `${slugBase}-${i + 2}`;
    }

    const workspaceId = await ctx.db.insert("workspaces", {
      name: rawWorkspaceName,
      slug,
      ownerId: userId,
      plan: "free",
      settings: {
        useCase: args.useCase,
        companyName: args.companyName,
        companySize: args.companySize,
      },
      createdAt: now,
      updatedAt: now,
    });

    const existingMember = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .unique();

    if (!existingMember) {
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId,
        role: "owner",
        joinedAt: now,
      });
    }

    const invites = splitEmails(args.inviteEmails)
      .filter((e) => isLikelyEmail(e))
      .filter((e) => e !== email.toLowerCase());

    for (const inviteEmail of invites) {
      const existingInvite = await ctx.db
        .query("workspaceInvites")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .filter((q) => q.eq(q.field("email"), inviteEmail))
        .unique();

      if (existingInvite) continue;

      await ctx.db.insert("workspaceInvites", {
        workspaceId,
        email: inviteEmail,
        invitedBy: userId,
        status: "pending",
        createdAt: now,
      });
    }

    await ctx.db.patch(userId, {
      onboardingComplete: true,
      defaultWorkspaceId: workspaceId,
      onboarding: onboardingPayload,
      updatedAt: now,
    });

    return {
      workspaceId,
    };
  },
});
