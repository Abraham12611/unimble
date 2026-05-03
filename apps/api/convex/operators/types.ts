/**
 * Phase 8 — Pre-built Operators: shared type definitions.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums / literals
// ---------------------------------------------------------------------------

export type OperatorType =
  | "content"
  | "growth"
  | "community"
  | "feedback"
  | "documentation";

export type OperatorStatus = "idle" | "active" | "paused" | "deleted";

export type StepType =
  | "agent"
  | "approval"
  | "transform"
  | "condition"
  | "trigger"
  | "notification";

export type TriggerType = "cron" | "webhook" | "manual" | "event";

// ---------------------------------------------------------------------------
// Workflow definitions (pure data; stored in `workflows.steps`)
// ---------------------------------------------------------------------------

export interface ApprovalConfig {
  timeoutMs: number;
  message: string;
  fallback: "reject" | "auto_approve";
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  agentType?: string;
  prompt?: string;
  tools?: string[];
  approvalConfig?: ApprovalConfig;
  inputMapping?: Record<string, string>;
  outputKey?: string;
  dependsOn?: string[];
  config?: Record<string, unknown>;
}

export interface WorkflowTrigger {
  type: TriggerType;
  config?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
}

// ---------------------------------------------------------------------------
// Operator metrics
// ---------------------------------------------------------------------------

export interface OperatorMetrics {
  executionsRun: number;
  lastRunAt: number | null;
  errors: number;
  tokensUsed: number;
  costUsd: number;
}

export const emptyMetrics = (): OperatorMetrics => ({
  executionsRun: 0,
  lastRunAt: null,
  errors: 0,
  tokensUsed: 0,
  costUsd: 0,
});

// ---------------------------------------------------------------------------
// Deploy result
// ---------------------------------------------------------------------------

export interface DeployResult {
  operatorId: string;
  workflowIds: string[];
}

// ---------------------------------------------------------------------------
// Integration descriptor (for UI / discovery)
// ---------------------------------------------------------------------------

export interface IntegrationDescriptor {
  key: string;
  label: string;
  required: boolean;
}

// ---------------------------------------------------------------------------
// Shared base config schema (all operators extend this)
// ---------------------------------------------------------------------------

export const baseOperatorConfigSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  timezone: z.string().default("UTC"),
  enabled: z.boolean().default(true),
  approvalRequired: z.boolean().default(false),
});

export type BaseOperatorConfig = z.infer<typeof baseOperatorConfigSchema>;
