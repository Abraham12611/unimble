/**
 * Operator Framework — Type Definitions
 *
 * Defines the types for the operator system:
 * - Operator templates (pre-built configurations)
 * - Operator configuration schemas
 * - Operator lifecycle states
 * - Operator metrics and goals
 *
 * Operators are the user-facing abstraction that packages
 * agents, workflows, integrations, and memory into a
 * deployable unit. Users deploy operators; operators
 * internally create workflows and run agents.
 *
 * Phase 8.1 — Operator Framework
 */

// ---------------------------------------------------------------------------
// Operator Types
// ---------------------------------------------------------------------------

/** Built-in operator types. */
export type OperatorType =
  | "content"
  | "growth"
  | "community"
  | "feedback"
  | "documentation"
  | "custom";

/** Operator lifecycle status. */
export type OperatorStatus = "deploying" | "active" | "paused" | "error" | "archived";

/** Trigger types for operator workflows. */
export type WorkflowTriggerType = "cron" | "webhook" | "event" | "api" | "continuous";

// ---------------------------------------------------------------------------
// Operator Configuration
// ---------------------------------------------------------------------------

/** A single setting field in an operator's configuration schema. */
export interface OperatorSettingField {
  /** Field key */
  key: string;
  /** Display label */
  label: string;
  /** Field type */
  type: "text" | "textarea" | "number" | "boolean" | "select" | "multiselect" | "tags" | "file";
  /** Description/help text */
  description?: string;
  /** Default value */
  default?: unknown;
  /** Whether this field is required */
  required?: boolean;
  /** Options for select/multiselect */
  options?: Array<{ value: string; label: string }>;
  /** Validation constraints */
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
}

/** Configuration schema for an operator template. */
export interface OperatorConfigSchema {
  /** Settings grouped by section */
  sections: Array<{
    id: string;
    title: string;
    description?: string;
    fields: OperatorSettingField[];
  }>;
}

/** Resolved operator configuration (user's actual values). */
export interface OperatorConfiguration {
  /** Operator type */
  type: OperatorType;
  /** User-provided settings values */
  settings: Record<string, unknown>;
  /** Connected integrations */
  integrations: OperatorIntegrationConfig[];
  /** Workflow schedules */
  schedules: OperatorScheduleConfig[];
  /** Persona configuration (optional) */
  persona?: string;
  /** Whether human approval is required */
  approvalRequired: boolean;
}

/** Integration connection for an operator. */
export interface OperatorIntegrationConfig {
  /** Integration provider (e.g., "wordpress", "twitter") */
  provider: string;
  /** Integration ID in the integrations table */
  integrationId?: string;
  /** Whether this integration is required */
  required: boolean;
  /** Category (e.g., "cms", "social", "analytics") */
  category: string;
}

/** Schedule configuration for an operator workflow. */
export interface OperatorScheduleConfig {
  /** Workflow ID */
  workflowId: string;
  /** Cron expression */
  cron: string;
  /** Timezone */
  timezone: string;
  /** Whether this schedule is enabled */
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Operator Template
// ---------------------------------------------------------------------------

/** A pre-built operator template that users can deploy. */
export interface OperatorTemplate {
  /** Unique template ID */
  id: string;
  /** Operator type */
  type: OperatorType;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Icon identifier */
  icon: string;
  /** Version */
  version: string;
  /** Whether this is a popular/featured template */
  featured?: boolean;
  /** Capabilities list (for display) */
  capabilities: string[];
  /** Required integrations (by category) */
  requiredIntegrations: Array<{
    category: string;
    providers: string[];
    description: string;
  }>;
  /** Optional integrations */
  optionalIntegrations: Array<{
    category: string;
    providers: string[];
    description: string;
  }>;
  /** Configuration schema */
  configSchema: OperatorConfigSchema;
  /** Default system prompt for the operator's agent */
  defaultSystemPrompt: string;
  /** Default tools available to this operator */
  defaultTools: string[];
  /** Default workflows this operator creates */
  defaultWorkflows: OperatorWorkflowTemplate[];
  /** Metrics this operator tracks */
  metrics: OperatorMetricDefinition[];
}

/** Template for a workflow that an operator creates on deployment. */
export interface OperatorWorkflowTemplate {
  /** Workflow ID (unique within the operator) */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Trigger type */
  triggerType: WorkflowTriggerType;
  /** Default cron schedule (if triggerType is "cron") */
  defaultCron?: string;
  /** Whether this workflow is enabled by default */
  enabledByDefault: boolean;
}

/** Definition of a metric an operator tracks. */
export interface OperatorMetricDefinition {
  /** Metric key */
  key: string;
  /** Display name */
  name: string;
  /** Metric type */
  type: "counter" | "gauge" | "percentage" | "duration";
  /** Goal description (e.g., "> 3 minutes", "2 per week") */
  goal?: string;
  /** Data source */
  source?: string;
}

// ---------------------------------------------------------------------------
// Operator Runtime State
// ---------------------------------------------------------------------------

/** Runtime metrics for a deployed operator. */
export interface OperatorMetrics {
  /** Total executions */
  totalExecutions: number;
  /** Successful executions */
  successfulExecutions: number;
  /** Failed executions */
  failedExecutions: number;
  /** Total cost (USD) */
  totalCost: number;
  /** Last execution timestamp */
  lastExecutionAt?: number;
  /** Next scheduled execution timestamp */
  nextExecutionAt?: number;
  /** Custom metric values */
  custom: Record<string, number>;
}

/** Operator memory state (persisted learnings). */
export interface OperatorMemoryState {
  /** Learned preferences and patterns */
  learnings: Array<{
    key: string;
    value: string;
    source: "learned" | "manual" | "imported";
    createdAt: number;
    updatedAt: number;
  }>;
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

/** Input for deploying a new operator. */
export interface DeployOperatorInput {
  /** Workspace ID */
  workspaceId: string;
  /** Template ID to deploy from */
  templateId: string;
  /** Custom name (overrides template default) */
  name?: string;
  /** Custom icon */
  icon?: string;
  /** Custom persona prompt */
  persona?: string;
  /** User-provided settings */
  settings: Record<string, unknown>;
  /** Connected integration IDs */
  integrations: Array<{ provider: string; integrationId: string }>;
  /** Schedule overrides */
  schedules?: Array<{ workflowId: string; cron: string; timezone: string; enabled: boolean }>;
  /** Whether approval is required */
  approvalRequired?: boolean;
}

/** Result of deploying an operator. */
export interface DeployOperatorResult {
  /** Created operator ID */
  operatorId: string;
  /** Created workflow IDs */
  workflowIds: string[];
  /** Any warnings during deployment */
  warnings: string[];
}

/** Validation error during deployment. */
export interface DeploymentValidationError {
  field: string;
  message: string;
}
