import { describe, expect, test } from "vitest";

import { shouldAllowRequest, onSuccess, onFailure } from "./circuitBreaker";

describe("circuitBreaker", () => {
  describe("shouldAllowRequest", () => {
    test("closed circuit allows all requests", () => {
      const result = shouldAllowRequest("closed", undefined, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.newState).toBeUndefined();
    });

    test("open circuit blocks requests before recovery time", () => {
      const openedAt = Date.now() - 30_000; // 30s ago
      const result = shouldAllowRequest("open", openedAt, 60_000);
      expect(result.allowed).toBe(false);
      expect(result.newState).toBeUndefined();
    });

    test("open circuit transitions to half_open after recovery time", () => {
      const openedAt = Date.now() - 90_000; // 90s ago, recovery is 60s
      const result = shouldAllowRequest("open", openedAt, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.newState).toBe("half_open");
    });

    test("half_open circuit allows requests (testing recovery)", () => {
      const result = shouldAllowRequest("half_open", undefined, 60_000);
      expect(result.allowed).toBe(true);
    });
  });

  describe("onSuccess", () => {
    test("closed state stays closed", () => {
      const result = onSuccess("closed", 1, 2);
      expect(result.newState).toBe("closed");
      expect(result.resetFailures).toBe(false);
    });

    test("half_open closes after enough successes", () => {
      const result = onSuccess("half_open", 2, 2);
      expect(result.newState).toBe("closed");
      expect(result.resetFailures).toBe(true);
    });

    test("half_open stays half_open before threshold", () => {
      const result = onSuccess("half_open", 1, 3);
      expect(result.newState).toBe("half_open");
      expect(result.resetFailures).toBe(false);
    });
  });

  describe("onFailure", () => {
    test("closed stays closed below threshold", () => {
      const result = onFailure("closed", 2, 5);
      expect(result.newState).toBe("closed");
      expect(result.shouldOpen).toBe(false);
    });

    test("closed opens at threshold", () => {
      const result = onFailure("closed", 4, 5);
      expect(result.newState).toBe("open");
      expect(result.shouldOpen).toBe(true);
    });

    test("half_open reopens on any failure", () => {
      const result = onFailure("half_open", 0, 5);
      expect(result.newState).toBe("open");
      expect(result.shouldOpen).toBe(true);
    });

    test("open stays open", () => {
      const result = onFailure("open", 10, 5);
      expect(result.newState).toBe("open");
      expect(result.shouldOpen).toBe(false);
    });
  });
});
