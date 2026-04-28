/**
 * Workflow Engine — Type Definitions
 *
 * Defines the TypeScript types for workflow definitions, step
 * configurations, triggers, and execution state. These types are
 * used by operators to define workflows programmatically.
 *
 * Workflows are internal — operators create them, users don't.
 */

// ---------------------------------------------------------------------------
// Execution states
// ---------------------------------------------------------------------------

export type ExecutionStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "canceled";

export type StepStatus = "queued" | "running" | "completed" | "failed" | "skipped" | "canceled";

export const TERMINAL_EXECUTION_STATUSES = new Set<ExecutionStatus>([
  "completed",
  "failed",
  "canceled",
]);

export const TERMINAL_STEP_STATUSES = new Set<StepStatus>([
  "completed",
  "failed",
  "skipped",
  "canceled",
]);

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

export type StepType =
  | "agent"
  | "tool"
  | "conditional"
  | "loop"
  | "parallel"
  | "wait"
  | "approval"
  | "transform";

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

export type BackoffStrategy = "fixed" | "linear" | "exponential";

export interface RetryPolicy {
  /** Max number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Backoff strategy (default: exponential) */
  backoff: BackoffStrategy;
  /** Initial delay in ms (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in ms (default: 60000) */
  maxDelayMs: number;
  /** Error categories that should be retried */
  retryOn?: string[];
  /** Error categories that should NOT be retried */
  failOn?: string[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: "exponential",
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  retryOn: ["rate_limit", "timeout", "server_error", "network_error"],
  failOn: ["auth_error", "validation_error", "not_found"],
};

// ---------------------------------------------------------------------------
// Trigger definitions
// ---------------------------------------------------------------------------

export type TriggerType = "schedule" | "event" | "manual" | "webhook";

export interface ScheduleTrigger {
  type: "schedule";
  /** Cron expression (e.g. "0 9 * * MON") */
  cron: string;
  /** IANA timezone (e.g. "America/New_York") */
  timezone?: string;
  /** Next scheduled run (epoch ms) */
  nextRunAt?: number;
  /** Whether the schedule is active */
  enabled: boolean;
}

export interface EventTrigger {
  type: "event";
  /** Event type to listen for (e.g. "operator.goal_set") */
  eventType: string;
  /** Optional filter on event data */
  filter?: Record<string, unknown>;
  /** Whether the trigger is active */
  enabled: boolean;
}

export interface ManualTrigger {
  type: "manual";
  /** Input schema for manual trigger (JSON Schema) */
  inputSchema?: Record<string, unknown>;
}

export interface WebhookTrigger {
  type: "webhook";
  /** Generated webhook URL path */
  path?: string;
  /** Secret for signature verification */
  secret?: string;
  /** Whether the trigger is active */
  enabled: boolean;
}

export type WorkflowTrigger = ScheduleTrigger | EventTrigger | ManualTrigger | WebhookTrigger;

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

/** Base fields shared by all step types. */
interface StepBase {
  /** Unique step ID within the workflow */
  id: string;
  /** Human-readable step name */
  name: string;
  /** Step type */
  type: StepType;
  /** Retry policy override (uses default if not set) */
  retry?: Partial<RetryPolicy>;
  /** Timeout in ms for this step (default: 300000 = 5min) */
  timeoutMs?: number;
  /** Whether to continue workflow if this step fails */
  continueOnFailure?: boolean;
  /** Dependencies — step IDs that must complete first */
  dependsOn?: string[];
}

/** LLM call with tools and memory. */
export interface AgentStepDef extends StepBase {
  type: "agent";
  config: {
    /** System prompt or prompt template */
    prompt: string;
    /** Model tier to use */
    modelTier?: "reasoning" | "generation" | "fast";
    /** Specific model override */
    model?: string;
    /** Tool names the agent can use */
    tools?: string[];
    /** Memory categories to inject */
    memoryContext?: string[];
    /** Max tokens to generate */
    maxTokens?: number;
    /** Temperature */
    temperature?: number;
    /** Expected output format */
    outputFormat?: "text" | "json" | "markdown";
  };
}

/** Direct tool/integration call. */
export interface ToolStepDef extends StepBase {
  type: "tool";
  config: {
    /** Tool name (from integration registry) */
    toolName: string;
    /** Parameters to pass to the tool */
    params: Record<string, unknown>;
  };
}

/** Evaluate condition and select a branch. */
export interface ConditionalStepDef extends StepBase {
  type: "conditional";
  config: {
    /** Conditions to evaluate in order */
    conditions: Array<{
      /** Expression to evaluate (references step outputs) */
      expression: string;
      /** Step IDs to execute if condition is true */
      thenSteps: string[];
    }>;
    /** Step IDs to execute if no condition matches */
    elseSteps?: string[];
  };
}

/** Iterate over a collection. */
export interface LoopStepDef extends StepBase {
  type: "loop";
  config: {
    /** Reference to the collection to iterate over */
    collection: string;
    /** Step IDs to execute for each item */
    bodySteps: string[];
    /** Max iterations (safety limit, default: 100) */
    maxIterations?: number;
    /** Whether to run iterations in parallel */
    parallel?: boolean;
    /** Max concurrency for parallel iterations */
    concurrency?: number;
  };
}

/** Execute multiple steps concurrently. */
export interface ParallelStepDef extends StepBase {
  type: "parallel";
  config: {
    /** Step IDs to execute in parallel */
    branches: string[];
    /** How to handle partial failures */
    failureStrategy?: "fail_fast" | "wait_all" | "best_effort";
    /** Max concurrent branches */
    concurrency?: number;
  };
}

/** Pause execution for a duration or until an event. */
export interface WaitStepDef extends StepBase {
  type: "wait";
  config: {
    /** Wait for a fixed duration (ms) */
    durationMs?: number;
    /** Wait until a specific time (epoch ms) */
    untilTime?: number;
    /** Wait for an event type */
    eventType?: string;
    /** Timeout for event wait (ms, default: 86400000 = 24h) */
    eventTimeoutMs?: number;
  };
}

/** Human approval gate. */
export interface ApprovalStepDef extends StepBase {
  type: "approval";
  config: {
    /** What to show the approver */
    contentRef?: string;
    /** Approval type (e.g. "content_review", "publish") */
    approvalType: string;
    /** Timeout in ms (default: 86400000 = 24h) */
    timeoutMs?: number;
    /** What to do on timeout */
    timeoutAction?: "cancel" | "skip" | "auto_approve";
  };
}

/** Data transformation (no external calls). */
export interface TransformStepDef extends StepBase {
  type: "transform";
  config: {
    /** JavaScript expression or function body */
    expression: string;
    /** Input references */
    inputs: Record<string, string>;
  };
}

export type WorkflowStepDef =
  | AgentStepDef
  | ToolStepDef
  | ConditionalStepDef
  | LoopStepDef
  | ParallelStepDef
  | WaitStepDef
  | ApprovalStepDef
  | TransformStepDef;

// ---------------------------------------------------------------------------
// Workflow definition
// ---------------------------------------------------------------------------

export interface WorkflowDefinition {
  /** Workflow name */
  name: string;
  /** Description of what this workflow does */
  description?: string;
  /** Version number */
  version: number;
  /** How this workflow is triggered */
  trigger: WorkflowTrigger;
  /** Ordered list of step definitions */
  steps: WorkflowStepDef[];
  /** Global configuration */
  config?: Record<string, unknown>;
  /** Default retry policy for all steps */
  defaultRetry?: Partial<RetryPolicy>;
  /** Maximum execution time in ms (default: 3600000 = 1h) */
  maxDurationMs?: number;
}

// ---------------------------------------------------------------------------
// Execution context (passed to step handlers)
// ---------------------------------------------------------------------------

export interface StepContext {
  /** The execution ID */
  executionId: string;
  /** The workspace ID */
  workspaceId: string;
  /** The operator ID (if any) */
  operatorId?: string;
  /** The workflow definition */
  workflow: WorkflowDefinition;
  /** Outputs from completed steps (stepId → output) */
  stepOutputs: Record<string, unknown>;
  /** The current step definition */
  currentStep: WorkflowStepDef;
  /** Workflow-level config */
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export type ErrorCategory =
  | "rate_limit"
  | "timeout"
  | "server_error"
  | "network_error"
  | "auth_error"
  | "validation_error"
  | "not_found"
  | "budget_exceeded"
  | "unknown";

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  originalError?: unknown;
}
