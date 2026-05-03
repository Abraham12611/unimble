/**
 * Phase 6.5 — Dead-letter queue
 *
 * A dead-letter record is written when a step has exhausted all retry attempts
 * and can no longer proceed automatically. Operators can inspect, manually fix,
 * and mark entries as resolved to clear them from the queue.
 */

import { v } from "convex/values";

import { convexValidators } from "./argValidators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  requireWorkspaceAccess,
  requireWorkspaceOwnerOrAdmin,
} from "./lib/auth";

// ---------------------------------------------------------------------------
// Impl helpers
// ---------------------------------------------------------------------------

export async function createDeadLetterEntryImpl(
  ctx: MutationCtx,
  args: {
    executionId: Id<"executions">;
    stepId?: string;
    reason: string;
    originalError?: unknown;
    retryCount: number;
  }
) {
  const exe = await ctx.db.get(args.executionId);
  if (!exe) {
    throw new Error("Execution not found");
  }

  await requireWorkspaceOwnerOrAdmin(ctx, exe.workspaceId);

  const reason = String(args.reason ?? "").trim();
  if (!reason) throw new Error("reason is required");

  const retryCount =
    typeof args.retryCount === "number" && args.retryCount >= 0
      ? args.retryCount
      : 0;

  const now = Date.now();

  const entryId = await ctx.db.insert("deadLetterQueue", {
    executionId: args.executionId,
    workspaceId: exe.workspaceId,
    stepId: args.stepId,
    reason,
    originalError: args.originalError,
    retryCount,
    resolvedAt: undefined,
    createdAt: now,
    updatedAt: now,
  });

  return entryId;
}

export async function listDeadLetterEntriesImpl(
  ctx: QueryCtx,
  args: {
    workspaceId: Id<"workspaces">;
    unresolvedOnly?: boolean;
  }
) {
  await requireWorkspaceAccess(ctx, args.workspaceId);

  const all = await ctx.db
    .query("deadLetterQueue")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .take(1000);

  if (args.unresolvedOnly) {
    return all.filter((e) => e.resolvedAt === undefined);
  }

  return all;
}

export async function getDeadLetterEntryImpl(
  ctx: QueryCtx,
  args: { id: Id<"deadLetterQueue"> }
) {
  const entry = await ctx.db.get(args.id);
  if (!entry) {
    throw new Error("Dead-letter entry not found");
  }

  await requireWorkspaceAccess(ctx, entry.workspaceId);
  return entry;
}

export async function resolveDeadLetterEntryImpl(
  ctx: MutationCtx,
  args: { id: Id<"deadLetterQueue"> }
) {
  const entry = await ctx.db.get(args.id);
  if (!entry) {
    throw new Error("Dead-letter entry not found");
  }

  await requireWorkspaceOwnerOrAdmin(ctx, entry.workspaceId);

  if (entry.resolvedAt !== undefined) {
    return args.id;
  }

  const now = Date.now();
  await ctx.db.patch(args.id, { resolvedAt: now, updatedAt: now });
  return args.id;
}

// ---------------------------------------------------------------------------
// Exported mutations & queries
// ---------------------------------------------------------------------------

export const createDeadLetterEntry = mutation({
  args: {
    executionId: convexValidators.executionId,
    stepId: v.optional(v.string()),
    reason: v.string(),
    originalError: v.optional(v.any()),
    retryCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await createDeadLetterEntryImpl(ctx, args);
  },
});

export const listDeadLetterEntries = query({
  args: {
    workspaceId: convexValidators.workspaceId,
    unresolvedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await listDeadLetterEntriesImpl(ctx, {
      workspaceId: args.workspaceId,
      unresolvedOnly: args.unresolvedOnly ?? false,
    });
  },
});

export const getDeadLetterEntry = query({
  args: {
    id: v.id("deadLetterQueue"),
  },
  handler: async (ctx, args) => {
    return await getDeadLetterEntryImpl(ctx, args);
  },
});

export const resolveDeadLetterEntry = mutation({
  args: {
    id: v.id("deadLetterQueue"),
  },
  handler: async (ctx, args) => {
    return await resolveDeadLetterEntryImpl(ctx, args);
  },
});
