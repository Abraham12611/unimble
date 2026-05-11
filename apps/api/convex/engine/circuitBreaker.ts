/**
 * Workflow Engine — Circuit Breaker
 *
 * Per-integration circuit breaker pattern that prevents cascading
 * failures when an external service is down. Tracks failure counts
 * and transitions between closed, open, and half-open states.
 *
 * States:
 * - closed: normal operation, requests pass through
 * - open: service is down, requests fail immediately
 * - half_open: testing if service recovered, limited requests allowed
 *
 * Phase 6.5.3 — Circuit Breaker
 */

import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireWorkspaceAccess, requireWorkspaceMember } from "../lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before transitioning from open to half_open (default: 60000) */
  recoveryTimeMs: number;
  /** Number of successes in half_open before closing (default: 2) */
  halfOpenSuccessThreshold: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeMs: 60_000,
  halfOpenSuccessThreshold: 2,
};

// ---------------------------------------------------------------------------
// Core logic (pure functions for testability)
// ---------------------------------------------------------------------------

/**
 * Determines if a request should be allowed through the circuit breaker.
 */
export function shouldAllowRequest(
  state: CircuitState,
  openedAt: number | undefined,
  recoveryTimeMs: number
): { allowed: boolean; newState?: CircuitState } {
  switch (state) {
    case "closed":
      return { allowed: true };

    case "open": {
      // Check if recovery time has elapsed
      if (openedAt && Date.now() - openedAt >= recoveryTimeMs) {
        return { allowed: true, newState: "half_open" };
      }
      return { allowed: false };
    }

    case "half_open":
      // Allow limited requests to test recovery
      return { allowed: true };

    default:
      return { allowed: true };
  }
}

/**
 * Determines the next state after a success.
 */
export function onSuccess(
  state: CircuitState,
  _successCount: number,
  halfOpenSuccessThreshold: number
): { newState: CircuitState; resetFailures: boolean } {
  switch (state) {
    case "closed":
      return { newState: "closed", resetFailures: false };

    case "half_open":
      // After enough successes in half_open, close the circuit
      if (_successCount >= halfOpenSuccessThreshold) {
        return { newState: "closed", resetFailures: true };
      }
      return { newState: "half_open", resetFailures: false };

    case "open":
      // Shouldn't happen, but treat as recovery
      return { newState: "half_open", resetFailures: false };

    default:
      return { newState: "closed", resetFailures: false };
  }
}

/**
 * Determines the next state after a failure.
 */
export function onFailure(
  state: CircuitState,
  failureCount: number,
  failureThreshold: number
): { newState: CircuitState; shouldOpen: boolean } {
  switch (state) {
    case "closed":
      if (failureCount + 1 >= failureThreshold) {
        return { newState: "open", shouldOpen: true };
      }
      return { newState: "closed", shouldOpen: false };

    case "half_open":
      // Any failure in half_open reopens the circuit
      return { newState: "open", shouldOpen: true };

    case "open":
      return { newState: "open", shouldOpen: false };

    default:
      return { newState: "closed", shouldOpen: false };
  }
}

// ---------------------------------------------------------------------------
// Convex mutations/queries
// ---------------------------------------------------------------------------

/**
 * Checks if a request to an integration should be allowed.
 * Returns the circuit state and whether the request can proceed.
 */
export const checkCircuit = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    integrationKey: v.string(),
  },
  handler: async (ctx, args) => {
    const breaker = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_workspace_and_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("integrationKey", args.integrationKey)
      )
      .first();

    if (!breaker) {
      // No breaker exists — circuit is closed (first use)
      return { allowed: true, state: "closed" as CircuitState };
    }

    const config = (breaker.config as CircuitBreakerConfig) ?? DEFAULT_CONFIG;
    const result = shouldAllowRequest(
      breaker.state as CircuitState,
      breaker.openedAt ?? undefined,
      config.recoveryTimeMs
    );

    // Transition to half_open if recovery time elapsed
    if (result.newState && result.newState !== breaker.state) {
      await ctx.db.patch(breaker._id, {
        state: result.newState,
        halfOpenAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return { allowed: result.allowed, state: (result.newState ?? breaker.state) as CircuitState };
  },
});

/**
 * Records a successful request to an integration.
 */
export const recordSuccess = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    integrationKey: v.string(),
  },
  handler: async (ctx, args) => {
    const breaker = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_workspace_and_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("integrationKey", args.integrationKey)
      )
      .first();

    if (!breaker) return; // No breaker — nothing to update

    const config = (breaker.config as CircuitBreakerConfig) ?? DEFAULT_CONFIG;
    const state = breaker.state as CircuitState;
    const now = Date.now();

    // Track half_open successes with a dedicated counter
    const currentHalfOpenSuccesses = (breaker.halfOpenSuccessCount ?? 0) + 1;
    const result = onSuccess(state, currentHalfOpenSuccesses, config.halfOpenSuccessThreshold);

    const patch: Record<string, unknown> = {
      lastSuccessAt: now,
      updatedAt: now,
    };

    if (state === "half_open") {
      patch.halfOpenSuccessCount = currentHalfOpenSuccesses;
    }

    if (result.newState !== state) {
      patch.state = result.newState;
    }
    if (result.resetFailures) {
      patch.failureCount = 0;
      patch.halfOpenSuccessCount = 0;
      patch.openedAt = undefined;
      patch.halfOpenAt = undefined;
    }

    await ctx.db.patch(breaker._id, patch);
  },
});

/**
 * Records a failed request to an integration.
 */
export const recordFailure = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    integrationKey: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const breaker = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_workspace_and_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("integrationKey", args.integrationKey)
      )
      .first();

    if (!breaker) {
      // Create breaker on first failure and check threshold
      const config = DEFAULT_CONFIG;
      const result = onFailure("closed", 0, config.failureThreshold);

      await ctx.db.insert("circuitBreakers", {
        workspaceId: args.workspaceId,
        integrationKey: args.integrationKey,
        state: result.newState,
        failureCount: 1,
        halfOpenSuccessCount: 0,
        lastFailureAt: now,
        lastSuccessAt: undefined,
        openedAt: result.shouldOpen ? now : undefined,
        halfOpenAt: undefined,
        config: DEFAULT_CONFIG,
        updatedAt: now,
      });
      return { state: result.newState, opened: result.shouldOpen };
    }

    const config = (breaker.config as CircuitBreakerConfig) ?? DEFAULT_CONFIG;
    const state = breaker.state as CircuitState;
    const newFailureCount = breaker.failureCount + 1;

    const result = onFailure(state, breaker.failureCount, config.failureThreshold);

    const patch: Record<string, unknown> = {
      failureCount: newFailureCount,
      lastFailureAt: now,
      updatedAt: now,
    };

    if (result.newState !== state) {
      patch.state = result.newState;
    }
    if (result.shouldOpen) {
      patch.openedAt = now;
      patch.halfOpenAt = undefined;
      patch.halfOpenSuccessCount = 0;
    }

    await ctx.db.patch(breaker._id, patch);
    return { state: result.newState, opened: result.shouldOpen };
  },
});

/**
 * Lists circuit breakers for a workspace (dashboard view).
 */
export const listCircuitBreakers = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);

    return await ctx.db
      .query("circuitBreakers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(200);
  },
});

/**
 * Manually resets a circuit breaker (force close).
 */
export const resetCircuitBreaker = mutation({
  args: {
    breakerId: v.id("circuitBreakers"),
  },
  handler: async (ctx, args) => {
    const breaker = await ctx.db.get(args.breakerId);
    if (!breaker) throw new Error("Circuit breaker not found");

    await requireWorkspaceMember(ctx, breaker.workspaceId);

    await ctx.db.patch(args.breakerId, {
      state: "closed",
      failureCount: 0,
      halfOpenSuccessCount: 0,
      openedAt: undefined,
      halfOpenAt: undefined,
      updatedAt: Date.now(),
    });

    return args.breakerId;
  },
});
