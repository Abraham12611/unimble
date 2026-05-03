/**
 * Phase 6.5 — Circuit breaker state machine.
 *
 * Pure functions with no Convex dependency — safe to unit-test outside the runtime.
 *
 * States:
 *   closed    → normal operation; failures are counted
 *   open      → downstream is presumed unavailable; all calls are rejected immediately
 *   half-open → trial period; one batch of requests is allowed through to probe health
 *
 * Transitions:
 *   closed    --[failures >= threshold]--> open
 *   open      --[halfOpenAfterMs elapsed]--> half-open (triggered on the next check)
 *   half-open --[successes >= successThreshold]--> closed
 *   half-open --[any failure]--> open (reset timer)
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  halfOpenAfterMs: number;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  halfOpenAfterMs: 60_000,
};

export interface CircuitBreakerSnapshot {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  openedAt?: number;
  nextRetryAt?: number;
}

/**
 * Compute the next circuit breaker state after recording a success or failure event.
 */
export function applyCircuitEvent(
  current: CircuitBreakerSnapshot,
  event: "success" | "failure",
  config: CircuitBreakerConfig,
  now: number
): CircuitBreakerSnapshot {
  switch (current.state) {
    case "closed": {
      if (event === "success") {
        return { ...current, failureCount: 0, successCount: 0 };
      }
      const nextFailures = current.failureCount + 1;
      if (nextFailures >= config.failureThreshold) {
        return {
          state: "open",
          failureCount: nextFailures,
          successCount: 0,
          openedAt: now,
          nextRetryAt: now + config.halfOpenAfterMs,
        };
      }
      return { ...current, failureCount: nextFailures };
    }

    case "open": {
      return current;
    }

    case "half-open": {
      if (event === "success") {
        const nextSuccesses = current.successCount + 1;
        if (nextSuccesses >= config.successThreshold) {
          return { state: "closed", failureCount: 0, successCount: 0 };
        }
        return { ...current, successCount: nextSuccesses };
      }
      return {
        state: "open",
        failureCount: current.failureCount + 1,
        successCount: 0,
        openedAt: now,
        nextRetryAt: now + config.halfOpenAfterMs,
      };
    }
  }
}

/**
 * Returns whether the next call should be allowed through, and — if the circuit
 * is transitioning from open to half-open — the updated snapshot to persist.
 */
export function isCircuitAllowed(
  current: CircuitBreakerSnapshot,
  config: CircuitBreakerConfig,
  now: number
): { allowed: boolean; nextSnapshot?: CircuitBreakerSnapshot } {
  if (current.state === "closed" || current.state === "half-open") {
    return { allowed: true };
  }

  if (current.nextRetryAt !== undefined && now >= current.nextRetryAt) {
    const nextSnapshot: CircuitBreakerSnapshot = {
      ...current,
      state: "half-open",
      successCount: 0,
      nextRetryAt: undefined,
    };
    return { allowed: true, nextSnapshot };
  }

  return { allowed: false };
}
