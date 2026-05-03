import { describe, expect, test } from "vitest";

import { calculateBackoffMs, shouldRetry } from "./retry";
import type { RetryConfig } from "./retry";

describe("retry strategies", () => {
  test("none strategy: calculateBackoffMs returns null", () => {
    const config: RetryConfig = { strategy: "none", maxAttempts: 5, baseDelayMs: 1000 };
    expect(calculateBackoffMs(config, 1)).toBeNull();
    expect(calculateBackoffMs(config, 3)).toBeNull();
  });

  test("none strategy: shouldRetry always returns false", () => {
    const config: RetryConfig = { strategy: "none", maxAttempts: 5, baseDelayMs: 1000 };
    expect(shouldRetry(config, 0)).toBe(false);
    expect(shouldRetry(config, 1)).toBe(false);
  });

  test("fixed strategy: constant delay each attempt", () => {
    const config: RetryConfig = {
      strategy: "fixed",
      maxAttempts: 4,
      baseDelayMs: 500,
    };
    expect(calculateBackoffMs(config, 1)).toBe(500);
    expect(calculateBackoffMs(config, 2)).toBe(500);
    expect(calculateBackoffMs(config, 3)).toBe(500);
  });

  test("exponential strategy: doubles delay each attempt", () => {
    const config: RetryConfig = {
      strategy: "exponential",
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 100_000,
    };
    expect(calculateBackoffMs(config, 1)).toBe(1000);
    expect(calculateBackoffMs(config, 2)).toBe(2000);
    expect(calculateBackoffMs(config, 3)).toBe(4000);
    expect(calculateBackoffMs(config, 4)).toBe(8000);
  });

  test("linear strategy: delay grows linearly", () => {
    const config: RetryConfig = {
      strategy: "linear",
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 100_000,
    };
    expect(calculateBackoffMs(config, 1)).toBe(1000);
    expect(calculateBackoffMs(config, 2)).toBe(2000);
    expect(calculateBackoffMs(config, 3)).toBe(3000);
  });

  test("maxDelayMs caps the computed delay", () => {
    const config: RetryConfig = {
      strategy: "exponential",
      maxAttempts: 10,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
    };
    const delay = calculateBackoffMs(config, 5);
    expect(delay).toBeLessThanOrEqual(5000);
    expect(delay).not.toBeNull();
  });

  test("returns null when attemptNumber exceeds maxAttempts", () => {
    const config: RetryConfig = {
      strategy: "exponential",
      maxAttempts: 3,
      baseDelayMs: 1000,
    };
    expect(calculateBackoffMs(config, 4)).toBeNull();
    expect(calculateBackoffMs(config, 100)).toBeNull();
  });

  test("jitter adds non-negative noise but stays within 130% of base delay", () => {
    const config: RetryConfig = {
      strategy: "fixed",
      maxAttempts: 10,
      baseDelayMs: 1000,
      jitter: true,
    };
    for (let seed = 0; seed <= 1; seed += 0.1) {
      const delay = calculateBackoffMs(config, 1, seed);
      expect(delay).not.toBeNull();
      expect(delay!).toBeGreaterThanOrEqual(1000);
      expect(delay!).toBeLessThanOrEqual(1300);
    }
  });

  test("shouldRetry returns true while attempts < maxAttempts", () => {
    const config: RetryConfig = {
      strategy: "exponential",
      maxAttempts: 3,
      baseDelayMs: 1000,
    };
    expect(shouldRetry(config, 0)).toBe(true);
    expect(shouldRetry(config, 1)).toBe(true);
    expect(shouldRetry(config, 2)).toBe(true);
    expect(shouldRetry(config, 3)).toBe(false);
    expect(shouldRetry(config, 4)).toBe(false);
  });

  test("shouldRetry with none strategy is always false regardless of count", () => {
    const config: RetryConfig = { strategy: "none", maxAttempts: 10, baseDelayMs: 0 };
    expect(shouldRetry(config, 0)).toBe(false);
    expect(shouldRetry(config, 5)).toBe(false);
  });
});
