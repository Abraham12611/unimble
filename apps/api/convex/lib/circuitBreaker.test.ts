import { describe, expect, test } from "vitest";

import { applyCircuitEvent, isCircuitAllowed } from "./circuitBreaker";
import type { CircuitBreakerConfig, CircuitBreakerSnapshot } from "./circuitBreaker";

const config: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  halfOpenAfterMs: 10_000,
};

const NOW = 1_700_000_000_000;

function closed(
  failureCount = 0,
  successCount = 0
): CircuitBreakerSnapshot {
  return { state: "closed", failureCount, successCount };
}

function open(
  failureCount = 3,
  openedAt = NOW
): CircuitBreakerSnapshot {
  return {
    state: "open",
    failureCount,
    successCount: 0,
    openedAt,
    nextRetryAt: openedAt + config.halfOpenAfterMs,
  };
}

function halfOpen(
  successCount = 0,
  failureCount = 3
): CircuitBreakerSnapshot {
  return { state: "half-open", failureCount, successCount };
}

describe("circuit breaker — applyCircuitEvent", () => {
  test("closed: success resets failure count", () => {
    const next = applyCircuitEvent(closed(2), "success", config, NOW);
    expect(next.state).toBe("closed");
    expect(next.failureCount).toBe(0);
    expect(next.successCount).toBe(0);
  });

  test("closed: failure increments count without opening (below threshold)", () => {
    const next = applyCircuitEvent(closed(1), "failure", config, NOW);
    expect(next.state).toBe("closed");
    expect(next.failureCount).toBe(2);
  });

  test("closed: failure at threshold opens the circuit", () => {
    const next = applyCircuitEvent(closed(2), "failure", config, NOW);
    expect(next.state).toBe("open");
    expect(next.failureCount).toBe(3);
    expect(next.openedAt).toBe(NOW);
    expect(next.nextRetryAt).toBe(NOW + config.halfOpenAfterMs);
  });

  test("open: events are ignored (circuit stays open)", () => {
    const state = open();
    const afterSuccess = applyCircuitEvent(state, "success", config, NOW);
    expect(afterSuccess.state).toBe("open");
    const afterFailure = applyCircuitEvent(state, "failure", config, NOW);
    expect(afterFailure.state).toBe("open");
  });

  test("half-open: success accumulates without closing (below successThreshold)", () => {
    const next = applyCircuitEvent(halfOpen(0), "success", config, NOW);
    expect(next.state).toBe("half-open");
    expect(next.successCount).toBe(1);
  });

  test("half-open: success at successThreshold closes the circuit", () => {
    const next = applyCircuitEvent(halfOpen(1), "success", config, NOW);
    expect(next.state).toBe("closed");
    expect(next.failureCount).toBe(0);
    expect(next.successCount).toBe(0);
  });

  test("half-open: any failure reopens the circuit", () => {
    const next = applyCircuitEvent(halfOpen(1), "failure", config, NOW);
    expect(next.state).toBe("open");
    expect(next.failureCount).toBe(4);
    expect(next.nextRetryAt).toBe(NOW + config.halfOpenAfterMs);
  });
});

describe("circuit breaker — isCircuitAllowed", () => {
  test("closed circuit always allows", () => {
    const { allowed, nextSnapshot } = isCircuitAllowed(closed(), config, NOW);
    expect(allowed).toBe(true);
    expect(nextSnapshot).toBeUndefined();
  });

  test("half-open circuit always allows", () => {
    const { allowed } = isCircuitAllowed(halfOpen(), config, NOW);
    expect(allowed).toBe(true);
  });

  test("open circuit denies before halfOpenAfterMs", () => {
    const state = open(3, NOW);
    const { allowed } = isCircuitAllowed(state, config, NOW + 5_000);
    expect(allowed).toBe(false);
  });

  test("open circuit transitions to half-open after halfOpenAfterMs", () => {
    const state = open(3, NOW);
    const { allowed, nextSnapshot } = isCircuitAllowed(
      state,
      config,
      NOW + config.halfOpenAfterMs
    );
    expect(allowed).toBe(true);
    expect(nextSnapshot).toBeDefined();
    expect(nextSnapshot!.state).toBe("half-open");
    expect(nextSnapshot!.nextRetryAt).toBeUndefined();
  });

  test("open circuit still denies at halfOpenAfterMs - 1ms", () => {
    const state = open(3, NOW);
    const { allowed } = isCircuitAllowed(state, config, NOW + config.halfOpenAfterMs - 1);
    expect(allowed).toBe(false);
  });
});
