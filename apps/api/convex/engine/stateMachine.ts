/**
 * Workflow Engine — Execution State Machine
 *
 * Manages state transitions for executions and steps with
 * validation, persistence, and recovery. All transitions are
 * atomic Convex mutations.
 *
 * State transitions are the core correctness guarantee of the
 * engine — invalid transitions are rejected, and every transition
 * is persisted to the DB before any side effects occur.
 */

import type { ExecutionStatus, StepStatus, ClassifiedError, RetryPolicy } from "./types";
import { TERMINAL_EXECUTION_STATUSES, TERMINAL_STEP_STATUSES, DEFAULT_RETRY_POLICY } from "./types";

// ---------------------------------------------------------------------------
// Valid state transitions
// ---------------------------------------------------------------------------

/** Valid execution state transitions. */
const EXECUTION_TRANSITIONS: Record<ExecutionStatus, Set<ExecutionStatus>> = {
  queued: new Set(["running", "canceled"]),
  running: new Set(["completed", "failed", "canceled", "waiting_approval"]),
  waiting_approval: new Set(["running", "canceled"]),
  completed: new Set(), // terminal
  failed: new Set(), // terminal (use retry to reset)
  canceled: new Set(), // terminal
};

/** Valid step state transitions. */
const STEP_TRANSITIONS: Record<StepStatus, Set<StepStatus>> = {
  queued: new Set(["running", "skipped"]),
  running: new Set(["completed", "failed"]),
  completed: new Set(), // terminal
  failed: new Set(), // terminal
  skipped: new Set(), // terminal
};

// ---------------------------------------------------------------------------
// Transition validation
// ---------------------------------------------------------------------------

/**
 * Checks if an execution state transition is valid.
 */
export function canTransitionExecution(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return EXECUTION_TRANSITIONS[from]?.has(to) ?? false;
}

/**
 * Checks if a step state transition is valid.
 */
export function canTransitionStep(from: StepStatus, to: StepStatus): boolean {
  return STEP_TRANSITIONS[from]?.has(to) ?? false;
}

/**
 * Validates and returns the transition, or throws with a clear message.
 */
export function assertExecutionTransition(from: ExecutionStatus, to: ExecutionStatus): void {
  if (!canTransitionExecution(from, to)) {
    if (TERMINAL_EXECUTION_STATUSES.has(from)) {
      throw new Error(
        `Execution is in terminal state "${from}" — ` +
          `cannot transition to "${to}". Use retry to reset.`
      );
    }
    throw new Error(`Invalid execution transition: "${from}" → "${to}"`);
  }
}

/**
 * Validates and returns the step transition, or throws.
 */
export function assertStepTransition(from: StepStatus, to: StepStatus): void {
  if (!canTransitionStep(from, to)) {
    if (TERMINAL_STEP_STATUSES.has(from)) {
      throw new Error(`Step is in terminal state "${from}" — ` + `cannot transition to "${to}".`);
    }
    throw new Error(`Invalid step transition: "${from}" → "${to}"`);
  }
}

// ---------------------------------------------------------------------------
// State queries
// ---------------------------------------------------------------------------

export function isExecutionTerminal(status: ExecutionStatus): boolean {
  return TERMINAL_EXECUTION_STATUSES.has(status);
}

export function isStepTerminal(status: StepStatus): boolean {
  return TERMINAL_STEP_STATUSES.has(status);
}

export function isExecutionActive(status: ExecutionStatus): boolean {
  return status === "running" || status === "waiting_approval";
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Classifies an error into a category for retry decisions.
 */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Rate limiting
    if (msg.includes("429") || msg.includes("rate limit")) {
      return {
        category: "rate_limit",
        message: error.message,
        retryable: true,
        originalError: error,
      };
    }

    // Timeout
    if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("aborted")) {
      return {
        category: "timeout",
        message: error.message,
        retryable: true,
        originalError: error,
      };
    }

    // Server errors
    if (
      msg.includes("500") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("server error")
    ) {
      return {
        category: "server_error",
        message: error.message,
        retryable: true,
        originalError: error,
      };
    }

    // Auth errors
    if (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("auth")
    ) {
      return {
        category: "auth_error",
        message: error.message,
        retryable: false,
        originalError: error,
      };
    }

    // Validation errors
    if (msg.includes("validation") || msg.includes("invalid") || msg.includes("400")) {
      return {
        category: "validation_error",
        message: error.message,
        retryable: false,
        originalError: error,
      };
    }

    // Not found
    if (msg.includes("404") || msg.includes("not found")) {
      return {
        category: "not_found",
        message: error.message,
        retryable: false,
        originalError: error,
      };
    }

    // Network errors
    if (
      msg.includes("network") ||
      msg.includes("econnrefused") ||
      msg.includes("dns") ||
      msg.includes("fetch failed")
    ) {
      return {
        category: "network_error",
        message: error.message,
        retryable: true,
        originalError: error,
      };
    }
  }

  // Unknown error
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";

  return {
    category: "unknown",
    message,
    retryable: false,
    originalError: error,
  };
}

/**
 * Determines if an error should be retried based on the retry policy.
 */
export function shouldRetry(
  classified: ClassifiedError,
  policy: RetryPolicy,
  currentAttempt: number
): boolean {
  if (currentAttempt >= policy.maxAttempts) return false;

  // Check explicit fail-on list
  if (policy.failOn?.includes(classified.category)) return false;

  // Check explicit retry-on list
  if (policy.retryOn?.length) {
    return policy.retryOn.includes(classified.category);
  }

  // Default: retry if the error is classified as retryable
  return classified.retryable;
}

// ---------------------------------------------------------------------------
// Retry delay calculation
// ---------------------------------------------------------------------------

/**
 * Calculates the delay before the next retry attempt.
 * Includes ±20% jitter to prevent thundering herd.
 */
export function calculateRetryDelay(policy: RetryPolicy, attempt: number): number {
  let delay: number;

  switch (policy.backoff) {
    case "fixed":
      delay = policy.initialDelayMs;
      break;
    case "linear":
      delay = policy.initialDelayMs * (attempt + 1);
      break;
    case "exponential":
      delay = policy.initialDelayMs * Math.pow(2, attempt);
      break;
    default:
      delay = policy.initialDelayMs;
  }

  // Cap at max delay
  delay = Math.min(delay, policy.maxDelayMs);

  // Add ±20% jitter
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  delay = Math.max(0, Math.round(delay + jitter));

  return delay;
}

/**
 * Merges a partial retry policy with the defaults.
 */
export function resolveRetryPolicy(override?: Partial<RetryPolicy>): RetryPolicy {
  if (!override) return { ...DEFAULT_RETRY_POLICY };
  return {
    maxAttempts: override.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
    backoff: override.backoff ?? DEFAULT_RETRY_POLICY.backoff,
    initialDelayMs: override.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs,
    maxDelayMs: override.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
    retryOn: override.retryOn ?? DEFAULT_RETRY_POLICY.retryOn,
    failOn: override.failOn ?? DEFAULT_RETRY_POLICY.failOn,
  };
}
