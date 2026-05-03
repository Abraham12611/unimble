/**
 * Phase 6.5 — Retry strategies for step execution.
 *
 * Pure functions with no Convex dependency — safe to unit-test outside the runtime.
 *
 * strategy:
 *   - "none"        : no retries; the step fails immediately on first error
 *   - "fixed"       : constant delay between every attempt
 *   - "exponential" : delay doubles each attempt (classic exponential back-off)
 *   - "linear"      : delay grows linearly with the attempt number
 *
 * jitter (optional): adds up to ±30% random noise to reduce thundering herd.
 */

export type RetryStrategyType = "none" | "fixed" | "exponential" | "linear";

export interface RetryConfig {
  strategy: RetryStrategyType;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  jitter?: boolean;
}

const DEFAULT_MAX_DELAY_MS = 30_000;

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  strategy: "exponential",
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: DEFAULT_MAX_DELAY_MS,
  jitter: true,
};

/**
 * Returns the number of milliseconds to wait before attempt `attemptNumber`,
 * or `null` if no further retries should be attempted.
 *
 * @param config       Retry configuration.
 * @param attemptNumber  1-based attempt index (1 = first retry after the initial failure).
 * @param jitterSeed   Optional 0..1 value used instead of Math.random() for deterministic tests.
 */
export function calculateBackoffMs(
  config: RetryConfig,
  attemptNumber: number,
  jitterSeed?: number
): number | null {
  if (config.strategy === "none") {
    return null;
  }

  if (attemptNumber > config.maxAttempts) {
    return null;
  }

  const maxDelay = config.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  let delay: number;

  switch (config.strategy) {
    case "fixed":
      delay = config.baseDelayMs;
      break;
    case "exponential":
      delay = config.baseDelayMs * Math.pow(2, attemptNumber - 1);
      break;
    case "linear":
      delay = config.baseDelayMs * attemptNumber;
      break;
    default:
      delay = config.baseDelayMs;
  }

  delay = Math.min(delay, maxDelay);

  if (config.jitter) {
    const seed = jitterSeed !== undefined ? jitterSeed : Math.random();
    const noise = seed * 0.3 * delay;
    delay = Math.round(delay + noise);
  }

  return delay;
}

/**
 * Returns `true` if a further retry is permitted given the current attempt count.
 *
 * @param config        Retry configuration.
 * @param attemptNumber Attempts already made (0 = not yet attempted, 1 = first attempt done).
 */
export function shouldRetry(config: RetryConfig, attemptNumber: number): boolean {
  if (config.strategy === "none") return false;
  return attemptNumber < config.maxAttempts;
}
