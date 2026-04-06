import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { derivePlatformRole } from "./rbac";

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

function sanitizeHttpsUrl(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? raw : "";
  } catch {
    return "";
  }
}

export const completeOnboarding = mutation({
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

    const validCompanySizes = ["1-10", "11-50", "51-200", "201-500", "500+"];
    const validUseCases = ["DevRel", "Content", "GTM", "Community", "Other"];

    const fullName = args.fullName.trim();
    const companyName = args.companyName.trim();
    const workspaceName = args.workspaceName.trim();
    const avatarUrl = sanitizeHttpsUrl(args.avatarUrl);

    if (!fullName) {
      throw new Error("fullName is required");
    }
    if (!companyName) {
      throw new Error("companyName is required");
    }
    if (!workspaceName) {
      throw new Error("workspaceName is required");
    }

    if (fullName.length > 120) {
      throw new Error("fullName is too long");
    }
    if (companyName.length > 120) {
      throw new Error("companyName is too long");
    }
    if (workspaceName.length > 120) {
      throw new Error("workspaceName is too long");
    }

    if (args.inviteEmails.length > 5_000) {
      throw new Error("inviteEmails is too long");
    }

    if (!validCompanySizes.includes(args.companySize)) {
      throw new Error("Invalid companySize");
    }

    if (!validUseCases.includes(args.useCase)) {
      throw new Error("Invalid useCase");
    }

    const inviteParts = splitEmails(args.inviteEmails);
    const invalidInvite = inviteParts.find((e) => !isLikelyEmail(e));
    if (invalidInvite) {
      throw new Error("One or more invite emails are invalid");
    }

    const now = Date.now();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    const [firstName, ...rest] = fullName.split(/\s+/g);
    const lastName = rest.length > 0 ? rest.join(" ") : undefined;

    const onboardingPayload = {
      fullName,
      avatarUrl,
      companyName,
      companySize: args.companySize,
      useCase: args.useCase,
      workspaceName,
      inviteEmails: args.inviteEmails,
      completedAt: now,
    };

    let userId: Id<"users">;
    if (!existingUser) {
      const platformRole = derivePlatformRole({ clerkId, email, existingRole: undefined });
      userId = await ctx.db.insert("users", {
        clerkId,
        email,
        firstName: firstName || undefined,
        lastName,
        avatarUrl: avatarUrl || undefined,
        imageUrl: avatarUrl || identity.pictureUrl || undefined,
        role: platformRole,
        onboardingComplete: false,
        onboarding: onboardingPayload,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      userId = existingUser._id;

      const platformRole = derivePlatformRole({
        clerkId,
        email,
        existingRole: existingUser.role,
      });
      await ctx.db.patch(userId, {
        email,
        firstName: firstName || existingUser.firstName,
        lastName: lastName ?? existingUser.lastName,
        avatarUrl: avatarUrl || existingUser.avatarUrl,
        imageUrl: avatarUrl || existingUser.imageUrl,
        role: platformRole,
        onboarding: onboardingPayload,
        updatedAt: now,
      });

      if (existingUser.onboardingComplete && existingUser.defaultWorkspaceId) {
        return {
          workspaceId: existingUser.defaultWorkspaceId,
        };
      }
    }

    const rawWorkspaceName = workspaceName || companyName || "Workspace";

    const slugBase = slugify(rawWorkspaceName);
    let slug = slugBase;

    let slugFound = false;
    for (let i = 0; i < 25; i += 1) {
      const existingWorkspace = await ctx.db
        .query("workspaces")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();

      if (!existingWorkspace) {
        slugFound = true;
        break;
      }

      slug = `${slugBase}-${i + 2}`;
    }

    if (!slugFound) {
      throw new Error("Could not generate a unique workspace slug after 25 attempts");
    }

    const workspaceId = await ctx.db.insert("workspaces", {
      name: rawWorkspaceName,
      slug,
      ownerId: userId,
      plan: "free",
      settings: {
        useCase: args.useCase,
        companyName,
        companySize: args.companySize,
      },
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
      joinedAt: now,
    });

    const invites = inviteParts.filter((e) => e !== email.toLowerCase());

    for (const inviteEmail of invites) {
      const existingInvite = await ctx.db
        .query("workspaceInvites")
        .withIndex("by_workspace_and_email", (q) =>
          q.eq("workspaceId", workspaceId).eq("email", inviteEmail)
        )
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
