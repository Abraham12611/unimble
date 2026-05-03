/**
 * Phase 6.5 — Circuit breaker Convex persistence layer
 *
 * The pure state machine lives in lib/circuitBreaker.ts.
 * This module provides Convex mutations/queries that persist and update
 * circuit breaker state per workspace + integration key.
 *
 * Usage pattern:
 *   Before calling a downstream service:
 *     1. checkCircuitAllowed() — if not allowed, skip the call and return a synthetic error
 *   After the call:
 *     2. recordCircuitEvent("success" | "failure") — update state accordingly
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
import {
  DEFAULT_CIRCUIT_CONFIG,
  applyCircuitEvent,
  isCircuitAllowed,
} from "./lib/circuitBreaker";
import type { CircuitBreakerConfig } from "./lib/circuitBreaker";

// ---------------------------------------------------------------------------
// Impl helpers
// ---------------------------------------------------------------------------

async function getOrCreateCircuitBreaker(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  key: string,
  config: CircuitBreakerConfig
) {
  const existing = await ctx.db
    .query("circuitBreakers")
    .withIndex("by_workspace_and_key", (q) =>
      q.eq("workspaceId", workspaceId).eq("key", key)
    )
    .unique();

  if (existing) return existing;

  const now = Date.now();
  const newId = await ctx.db.insert("circuitBreakers", {
    workspaceId,
    key,
    state: "closed",
    failureCount: 0,
    successCount: 0,
    lastFailureAt: undefined,
    openedAt: undefined,
    nextRetryAt: undefined,
    threshold: config.failureThreshold,
    createdAt: now,
    updatedAt: now,
  });

  return (await ctx.db.get(newId))!;
}

export async function recordCircuitEventImpl(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    key: string;
    event: "success" | "failure";
    config?: CircuitBreakerConfig;
  }
) {
  await requireWorkspaceOwnerOrAdmin(ctx, args.workspaceId);

  const config = args.config ?? DEFAULT_CIRCUIT_CONFIG;
  const key = String(args.key ?? "").trim();
  if (!key) throw new Error("key is required");

  const cb = await getOrCreateCircuitBreaker(ctx, args.workspaceId, key, config);

  const now = Date.now();
  const nextSnapshot = applyCircuitEvent(
    {
      state: cb.state as "closed" | "open" | "half-open",
      failureCount: cb.failureCount,
      successCount: cb.successCount,
      openedAt: cb.openedAt,
      nextRetryAt: cb.nextRetryAt,
    },
    args.event,
    config,
    now
  );

  const patch: Record<string, unknown> = {
    state: nextSnapshot.state,
    failureCount: nextSnapshot.failureCount,
    successCount: nextSnapshot.successCount,
    updatedAt: now,
  };

  if (args.event === "failure") patch.lastFailureAt = now;
  if (nextSnapshot.openedAt !== undefined) patch.openedAt = nextSnapshot.openedAt;
  if (nextSnapshot.nextRetryAt !== undefined) patch.nextRetryAt = nextSnapshot.nextRetryAt;
  if (nextSnapshot.state === "closed") {
    patch.openedAt = undefined;
    patch.nextRetryAt = undefined;
    patch.lastFailureAt = undefined;
  }

  await ctx.db.patch(cb._id, patch);
  return { id: cb._id, state: nextSnapshot.state };
}

export async function checkCircuitAllowedImpl(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    key: string;
    config?: CircuitBreakerConfig;
  }
) {
  await requireWorkspaceOwnerOrAdmin(ctx, args.workspaceId);

  const config = args.config ?? DEFAULT_CIRCUIT_CONFIG;
  const key = String(args.key ?? "").trim();
  if (!key) throw new Error("key is required");

  const cb = await getOrCreateCircuitBreaker(ctx, args.workspaceId, key, config);

  const now = Date.now();
  const { allowed, nextSnapshot } = isCircuitAllowed(
    {
      state: cb.state as "closed" | "open" | "half-open",
      failureCount: cb.failureCount,
      successCount: cb.successCount,
      openedAt: cb.openedAt,
      nextRetryAt: cb.nextRetryAt,
    },
    config,
    now
  );

  if (nextSnapshot) {
    await ctx.db.patch(cb._id, {
      state: nextSnapshot.state,
      successCount: nextSnapshot.successCount,
      nextRetryAt: nextSnapshot.nextRetryAt,
      updatedAt: now,
    });
  }

  return { allowed, state: nextSnapshot?.state ?? cb.state };
}

export async function getCircuitBreakerImpl(
  ctx: QueryCtx,
  args: {
    workspaceId: Id<"workspaces">;
    key: string;
  }
) {
  await requireWorkspaceAccess(ctx, args.workspaceId);

  const key = String(args.key ?? "").trim();

  return await ctx.db
    .query("circuitBreakers")
    .withIndex("by_workspace_and_key", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("key", key)
    )
    .unique();
}

export async function listCircuitBreakersImpl(
  ctx: QueryCtx,
  args: { workspaceId: Id<"workspaces"> }
) {
  await requireWorkspaceAccess(ctx, args.workspaceId);

  return await ctx.db
    .query("circuitBreakers")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .take(1000);
}

// ---------------------------------------------------------------------------
// Exported mutations & queries
// ---------------------------------------------------------------------------

export const recordCircuitEvent = mutation({
  args: {
    workspaceId: convexValidators.workspaceId,
    key: v.string(),
    event: v.union(v.literal("success"), v.literal("failure")),
    failureThreshold: v.optional(v.number()),
    successThreshold: v.optional(v.number()),
    halfOpenAfterMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const config: CircuitBreakerConfig = {
      failureThreshold: args.failureThreshold ?? DEFAULT_CIRCUIT_CONFIG.failureThreshold,
      successThreshold: args.successThreshold ?? DEFAULT_CIRCUIT_CONFIG.successThreshold,
      halfOpenAfterMs: args.halfOpenAfterMs ?? DEFAULT_CIRCUIT_CONFIG.halfOpenAfterMs,
    };
    return await recordCircuitEventImpl(ctx, {
      workspaceId: args.workspaceId,
      key: args.key,
      event: args.event,
      config,
    });
  },
});

export const checkCircuitAllowed = mutation({
  args: {
    workspaceId: convexValidators.workspaceId,
    key: v.string(),
    failureThreshold: v.optional(v.number()),
    successThreshold: v.optional(v.number()),
    halfOpenAfterMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const config: CircuitBreakerConfig = {
      failureThreshold: args.failureThreshold ?? DEFAULT_CIRCUIT_CONFIG.failureThreshold,
      successThreshold: args.successThreshold ?? DEFAULT_CIRCUIT_CONFIG.successThreshold,
      halfOpenAfterMs: args.halfOpenAfterMs ?? DEFAULT_CIRCUIT_CONFIG.halfOpenAfterMs,
    };
    return await checkCircuitAllowedImpl(ctx, {
      workspaceId: args.workspaceId,
      key: args.key,
      config,
    });
  },
});

export const getCircuitBreaker = query({
  args: {
    workspaceId: convexValidators.workspaceId,
    key: v.string(),
  },
  handler: async (ctx, args) => {
    return await getCircuitBreakerImpl(ctx, args);
  },
});

export const listCircuitBreakers = query({
  args: {
    workspaceId: convexValidators.workspaceId,
  },
  handler: async (ctx, args) => {
    return await listCircuitBreakersImpl(ctx, args);
  },
});
