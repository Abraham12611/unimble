/**
 * Operator Framework — Shared Type Definitions
 *
 * Defines the TypeScript types for operator configuration, templates,
 * lifecycle, and metadata. Used by all concrete operator implementations.
 *
 * Phase 8.1.1 — Operator Base Class Types
 */

import type { WorkflowDefinition } from "../engine/types";

// ---------------------------------------------------------------------------
// Operator lifecycle
// ---------------------------------------------------------------------------

export type OperatorStatus = "draft" | "deploying" | "active" | "paused" | "error" | "archived";

export type OperatorType =
  | "content"
  | "growth"
  | "community"
  | "feedback"
  | "documentation"
  | "custom";

// ---------------------------------------------------------------------------
// Operator configuration
// ---------------------------------------------------------------------------

/** Configuration schema for an operator instance. */
export interface OperatorConfiguration {
  /** Operator type */
  type: OperatorType;
  /** Human-readable name */
  name: string;
  /** Description of what this operator does */
  description?: string;
  /** Schedule configuration (cron expressions) */
  schedule?: OperatorSchedule;
  /** Integration slugs this operator requires */
  requiredIntegrations: string[];
  /** Optional integration slugs that enhance functionality */
  optionalIntegrations?: string[];
  /** Operator-specific settings (varies by type) */
  settings: Record<string, unknown>;
  /** Approval gates configuration */
  approvalGates?: ApprovalGateConfig[];
  /** Notification preferences */
  notifications?: NotificationConfig;
}

/** Schedule for operator execution. */
export interface OperatorSchedule {
  /** Primary execution cron (e.g., "0 9 * * MON" for weekly Monday 9am) */
  primaryCron?: string;
  /** Additional scheduled tasks */
  additionalCrons?: Array<{ name: string; cron: string; workflow: string }>;
  /** Timezone for cron evaluation */
  timezone: string;
  /** Whether scheduling is enabled */
  enabled: boolean;
}

/** Approval gate configuration. */
export interface ApprovalGateConfig {
  /** Gate identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** When this gate triggers */
  trigger: "before_publish" | "before_execute" | "high_cost" | "custom";
  /** Who can approve */
  approvers: "workspace_owner" | "workspace_admin" | "any_member";
  /** Auto-approve after timeout (ms), null = wait forever */
  autoApproveAfterMs?: number | null;
  /** Action on timeout if no auto-approve */
  timeoutAction?: "cancel" | "escalate";
}

/** Notification configuration. */
export interface NotificationConfig {
  /** Notify on successful execution */
  onSuccess: boolean;
  /** Notify on failure */
  onFailure: boolean;
  /** Notify when approval is needed */
  onApprovalNeeded: boolean;
  /** Weekly summary report */
  weeklySummary: boolean;
  /** Channels to notify */
  channels: Array<"email" | "slack" | "discord" | "in_app">;
}

// ---------------------------------------------------------------------------
// Operator template (for the registry/marketplace)
// ---------------------------------------------------------------------------

/** Template for deploying an operator. */
export interface OperatorTemplate {
  /** Unique template ID */
  id: string;
  /** Operator type */
  type: OperatorType;
  /** Template version (semver) */
  version: string;
  /** Human-readable name */
  name: string;
  /** Short description */
  description: string;
  /** Long description (markdown) */
  longDescription?: string;
  /** Category tags */
  tags: string[];
  /** Default configuration */
  defaultConfig: OperatorConfiguration;
  /** Default workflows this operator creates */
  defaultWorkflows: WorkflowDefinition[];
  /** Required integrations for this template */
  requiredIntegrations: string[];
  /** Icon identifier */
  icon: string;
  /** Whether this is an official Unimble template */
  isOfficial: boolean;
}

// ---------------------------------------------------------------------------
// Operator metrics
// ---------------------------------------------------------------------------

/** Runtime metrics for an operator instance. */
export interface OperatorMetrics {
  /** Total workflow executions */
  totalExecutions: number;
  /** Successful executions */
  successfulExecutions: number;
  /** Failed executions */
  failedExecutions: number;
  /** Total cost (USD) */
  totalCostUsd: number;
  /** Average execution duration (ms) */
  avgDurationMs: number;
  /** Last execution timestamp */
  lastExecutionAt?: number;
  /** Custom metrics (operator-specific) */
  custom: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Operator memory
// ---------------------------------------------------------------------------

/** Long-term memory for an operator instance. */
export interface OperatorMemory {
  /** Learnings extracted from past executions */
  learnings: OperatorLearning[];
  /** Preferences refined over time */
  preferences: Record<string, unknown>;
  /** Historical context (last N execution summaries) */
  executionHistory: ExecutionSummary[];
  /** Custom memory entries (operator-specific) */
  custom: Record<string, unknown>;
}

/** A learning extracted from operator execution. */
export interface OperatorLearning {
  /** Learning ID */
  id: string;
  /** What was learned */
  insight: string;
  /** Confidence (0-1) */
  confidence: number;
  /** When this was learned */
  learnedAt: number;
  /** Source execution ID */
  sourceExecutionId?: string;
  /** Category */
  category: string;
}

/** Summary of a past execution. */
export interface ExecutionSummary {
  /** Execution ID */
  executionId: string;
  /** Workflow name */
  workflowName: string;
  /** Outcome */
  outcome: "success" | "failure" | "partial";
  /** Duration (ms) */
  durationMs: number;
  /** Cost (USD) */
  costUsd: number;
  /** Key outputs */
  outputs: Record<string, unknown>;
  /** Timestamp */
  completedAt: number;
}
