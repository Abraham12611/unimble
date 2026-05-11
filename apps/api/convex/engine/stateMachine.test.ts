import { describe, expect, test } from "vitest";

import {
  canTransitionExecution,
  canTransitionStep,
  assertExecutionTransition,
  assertStepTransition,
  isExecutionTerminal,
  isStepTerminal,
  isExecutionActive,
  classifyError,
  shouldRetry,
  calculateRetryDelay,
  resolveRetryPolicy,
} from "./stateMachine";
import { DEFAULT_RETRY_POLICY } from "./types";

describe("stateMachine", () => {
  describe("execution transitions", () => {
    test("queued can transition to running or canceled", () => {
      expect(canTransitionExecution("queued", "running")).toBe(true);
      expect(canTransitionExecution("queued", "canceled")).toBe(true);
      expect(canTransitionExecution("queued", "completed")).toBe(false);
      expect(canTransitionExecution("queued", "failed")).toBe(false);
    });

    test("running can transition to completed, failed, canceled, waiting_approval", () => {
      expect(canTransitionExecution("running", "completed")).toBe(true);
      expect(canTransitionExecution("running", "failed")).toBe(true);
      expect(canTransitionExecution("running", "canceled")).toBe(true);
      expect(canTransitionExecution("running", "waiting_approval")).toBe(true);
      expect(canTransitionExecution("running", "queued")).toBe(false);
    });

    test("waiting_approval can transition to running or canceled", () => {
      expect(canTransitionExecution("waiting_approval", "running")).toBe(true);
      expect(canTransitionExecution("waiting_approval", "canceled")).toBe(true);
      expect(canTransitionExecution("waiting_approval", "completed")).toBe(false);
    });

    test("terminal states cannot transition", () => {
      expect(canTransitionExecution("completed", "running")).toBe(false);
      expect(canTransitionExecution("failed", "running")).toBe(false);
      expect(canTransitionExecution("canceled", "running")).toBe(false);
    });

    test("assertExecutionTransition throws on invalid transitions", () => {
      expect(() => assertExecutionTransition("completed", "running")).toThrow("terminal");
      expect(() => assertExecutionTransition("queued", "completed")).toThrow("Invalid");
    });

    test("assertExecutionTransition does not throw on valid transitions", () => {
      expect(() => assertExecutionTransition("queued", "running")).not.toThrow();
      expect(() => assertExecutionTransition("running", "completed")).not.toThrow();
    });
  });

  describe("step transitions", () => {
    test("queued can transition to running, skipped, canceled", () => {
      expect(canTransitionStep("queued", "running")).toBe(true);
      expect(canTransitionStep("queued", "skipped")).toBe(true);
      expect(canTransitionStep("queued", "canceled")).toBe(true);
      expect(canTransitionStep("queued", "completed")).toBe(false);
    });

    test("running can transition to completed, failed, canceled", () => {
      expect(canTransitionStep("running", "completed")).toBe(true);
      expect(canTransitionStep("running", "failed")).toBe(true);
      expect(canTransitionStep("running", "canceled")).toBe(true);
      expect(canTransitionStep("running", "queued")).toBe(false);
    });

    test("terminal step states cannot transition", () => {
      expect(canTransitionStep("completed", "running")).toBe(false);
      expect(canTransitionStep("failed", "running")).toBe(false);
      expect(canTransitionStep("skipped", "running")).toBe(false);
      expect(canTransitionStep("canceled", "running")).toBe(false);
    });

    test("assertStepTransition throws on invalid transitions", () => {
      expect(() => assertStepTransition("completed", "running")).toThrow("terminal");
      expect(() => assertStepTransition("queued", "completed")).toThrow("Invalid");
    });

    test("assertStepTransition does not throw on valid transitions", () => {
      expect(() => assertStepTransition("queued", "running")).not.toThrow();
      expect(() => assertStepTransition("running", "completed")).not.toThrow();
      expect(() => assertStepTransition("running", "failed")).not.toThrow();
    });
  });

  describe("state queries", () => {
    test("isExecutionTerminal identifies terminal states", () => {
      expect(isExecutionTerminal("completed")).toBe(true);
      expect(isExecutionTerminal("failed")).toBe(true);
      expect(isExecutionTerminal("canceled")).toBe(true);
      expect(isExecutionTerminal("queued")).toBe(false);
      expect(isExecutionTerminal("running")).toBe(false);
      expect(isExecutionTerminal("waiting_approval")).toBe(false);
    });

    test("isStepTerminal identifies terminal states", () => {
      expect(isStepTerminal("completed")).toBe(true);
      expect(isStepTerminal("failed")).toBe(true);
      expect(isStepTerminal("skipped")).toBe(true);
      expect(isStepTerminal("canceled")).toBe(true);
      expect(isStepTerminal("queued")).toBe(false);
      expect(isStepTerminal("running")).toBe(false);
    });

    test("isExecutionActive identifies active states", () => {
      expect(isExecutionActive("running")).toBe(true);
      expect(isExecutionActive("waiting_approval")).toBe(true);
      expect(isExecutionActive("queued")).toBe(false);
      expect(isExecutionActive("completed")).toBe(false);
    });
  });

  describe("error classification", () => {
    test("classifies rate limit errors", () => {
      const result = classifyError(new Error("429 Too Many Requests"));
      expect(result.category).toBe("rate_limit");
      expect(result.retryable).toBe(true);
    });

    test("classifies timeout errors", () => {
      const result = classifyError(new Error("Request timed out"));
      expect(result.category).toBe("timeout");
      expect(result.retryable).toBe(true);
    });

    test("classifies server errors", () => {
      const result = classifyError(new Error("500 Internal Server Error"));
      expect(result.category).toBe("server_error");
      expect(result.retryable).toBe(true);
    });

    test("classifies network errors", () => {
      const result = classifyError(new Error("fetch failed: ECONNREFUSED"));
      expect(result.category).toBe("network_error");
      expect(result.retryable).toBe(true);
    });

    test("classifies auth errors as non-retryable", () => {
      const result = classifyError(new Error("401 Unauthorized"));
      expect(result.category).toBe("auth_error");
      expect(result.retryable).toBe(false);
    });

    test("classifies validation errors as non-retryable", () => {
      const result = classifyError(new Error("400 Bad Request: validation failed"));
      expect(result.category).toBe("validation_error");
      expect(result.retryable).toBe(false);
    });

    test("classifies not found errors as non-retryable", () => {
      const result = classifyError(new Error("404 Not Found"));
      expect(result.category).toBe("not_found");
      expect(result.retryable).toBe(false);
    });

    test("classifies budget exceeded as non-retryable", () => {
      const result = classifyError(new Error("Budget limit exceeded"));
      expect(result.category).toBe("budget_exceeded");
      expect(result.retryable).toBe(false);
    });

    test("classifies unknown errors", () => {
      const result = classifyError(new Error("Something weird happened"));
      expect(result.category).toBe("unknown");
      expect(result.retryable).toBe(false);
    });

    test("handles non-Error values", () => {
      const result = classifyError("string error");
      expect(result.category).toBe("unknown");
      expect(result.message).toBe("string error");
    });
  });

  describe("retry logic", () => {
    test("shouldRetry returns true for retryable errors under max attempts", () => {
      const classified = { category: "rate_limit" as const, message: "", retryable: true };
      expect(shouldRetry(classified, DEFAULT_RETRY_POLICY, 0)).toBe(true);
      expect(shouldRetry(classified, DEFAULT_RETRY_POLICY, 1)).toBe(true);
      expect(shouldRetry(classified, DEFAULT_RETRY_POLICY, 2)).toBe(true);
    });

    test("shouldRetry returns false when max attempts reached", () => {
      const classified = { category: "rate_limit" as const, message: "", retryable: true };
      expect(shouldRetry(classified, DEFAULT_RETRY_POLICY, 3)).toBe(false);
    });

    test("shouldRetry returns false for non-retryable errors (via failOn path)", () => {
      const classified = { category: "auth_error" as const, message: "", retryable: false };
      expect(shouldRetry(classified, DEFAULT_RETRY_POLICY, 0)).toBe(false);
    });

    test("shouldRetry uses retryable field when retryOn/failOn are undefined", () => {
      const barePolicy = { ...DEFAULT_RETRY_POLICY, retryOn: undefined, failOn: undefined };
      const nonRetryable = { category: "unknown" as const, message: "", retryable: false };
      expect(shouldRetry(nonRetryable, barePolicy, 0)).toBe(false);

      const retryable = { category: "unknown" as const, message: "", retryable: true };
      expect(shouldRetry(retryable, barePolicy, 0)).toBe(true);
    });

    test("shouldRetry returns false when retryOn is empty array", () => {
      const policy = { ...DEFAULT_RETRY_POLICY, retryOn: [] as string[] };
      const classified = { category: "rate_limit" as const, message: "", retryable: true };
      expect(shouldRetry(classified, policy, 0)).toBe(false);
    });

    test("shouldRetry respects failOn list", () => {
      const policy = { ...DEFAULT_RETRY_POLICY, failOn: ["rate_limit"] };
      const classified = { category: "rate_limit" as const, message: "", retryable: true };
      expect(shouldRetry(classified, policy, 0)).toBe(false);
    });

    test("shouldRetry respects retryOn list", () => {
      const policy = { ...DEFAULT_RETRY_POLICY, retryOn: ["timeout"] };
      const classified = { category: "rate_limit" as const, message: "", retryable: true };
      expect(shouldRetry(classified, policy, 0)).toBe(false);

      const timeout = { category: "timeout" as const, message: "", retryable: true };
      expect(shouldRetry(timeout, policy, 0)).toBe(true);
    });
  });

  describe("retry delay calculation", () => {
    test("fixed backoff returns constant delay", () => {
      const policy = { ...DEFAULT_RETRY_POLICY, backoff: "fixed" as const, initialDelayMs: 1000 };
      const delay = calculateRetryDelay(policy, 0);
      // With ±20% jitter: 800-1200
      expect(delay).toBeGreaterThanOrEqual(800);
      expect(delay).toBeLessThanOrEqual(1200);
    });

    test("linear backoff increases linearly", () => {
      const policy = { ...DEFAULT_RETRY_POLICY, backoff: "linear" as const, initialDelayMs: 1000 };
      const delay0 = calculateRetryDelay(policy, 0);
      const delay2 = calculateRetryDelay(policy, 2);
      // attempt 0: ~1000, attempt 2: ~3000 (before jitter)
      expect(delay0).toBeLessThan(1500);
      expect(delay2).toBeGreaterThan(2000);
    });

    test("exponential backoff doubles each attempt", () => {
      const policy = {
        ...DEFAULT_RETRY_POLICY,
        backoff: "exponential" as const,
        initialDelayMs: 1000,
        maxDelayMs: 60000,
      };
      const delay0 = calculateRetryDelay(policy, 0);
      const delay3 = calculateRetryDelay(policy, 3);
      // attempt 0: ~1000, attempt 3: ~8000
      expect(delay0).toBeLessThan(1500);
      expect(delay3).toBeGreaterThan(5000);
    });

    test("delay is capped at maxDelayMs", () => {
      const policy = {
        ...DEFAULT_RETRY_POLICY,
        backoff: "exponential" as const,
        initialDelayMs: 10000,
        maxDelayMs: 30000,
      };
      const delay = calculateRetryDelay(policy, 10);
      // Even at attempt 10, should not exceed maxDelayMs + jitter
      expect(delay).toBeLessThanOrEqual(36000); // 30000 + 20%
    });
  });

  describe("resolveRetryPolicy", () => {
    test("returns defaults when no override", () => {
      const policy = resolveRetryPolicy(undefined);
      expect(policy.maxAttempts).toBe(3);
      expect(policy.backoff).toBe("exponential");
      expect(policy.initialDelayMs).toBe(1000);
      expect(policy.maxDelayMs).toBe(60000);
      expect(policy.retryOn).toEqual(["rate_limit", "timeout", "server_error", "network_error"]);
      expect(policy.failOn).toEqual(["auth_error", "validation_error", "not_found"]);
    });

    test("merges partial override with defaults", () => {
      const policy = resolveRetryPolicy({ maxAttempts: 5, backoff: "fixed" });
      expect(policy.maxAttempts).toBe(5);
      expect(policy.backoff).toBe("fixed");
      expect(policy.initialDelayMs).toBe(1000); // default
      expect(policy.maxDelayMs).toBe(60000); // default
      expect(policy.retryOn).toEqual(DEFAULT_RETRY_POLICY.retryOn); // default preserved
      expect(policy.failOn).toEqual(DEFAULT_RETRY_POLICY.failOn); // default preserved
    });
  });
});
