/**
 * Workflow Engine — Zod Validators
 *
 * Runtime validation for workflow definitions, step configs,
 * and trigger configurations. Used when operators create or
 * update workflows programmatically.
 */

import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(0).max(10).default(3),
  backoff: z.enum(["fixed", "linear", "exponential"]).default("exponential"),
  initialDelayMs: z.number().int().min(100).max(300000).default(1000),
  maxDelayMs: z.number().int().min(1000).max(600000).default(60000),
  retryOn: z.array(z.string()).optional(),
  failOn: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export const scheduleTriggerSchema = z.object({
  type: z.literal("schedule"),
  cron: z.string().min(1),
  timezone: z.string().optional(),
  nextRunAt: z.number().optional(),
  enabled: z.boolean().default(true),
});

export const eventTriggerSchema = z.object({
  type: z.literal("event"),
  eventType: z.string().min(1),
  filter: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().default(true),
});

export const manualTriggerSchema = z.object({
  type: z.literal("manual"),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});

export const webhookTriggerSchema = z.object({
  type: z.literal("webhook"),
  path: z.string().optional(),
  secret: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const workflowTriggerSchema = z.discriminatedUnion("type", [
  scheduleTriggerSchema,
  eventTriggerSchema,
  manualTriggerSchema,
  webhookTriggerSchema,
]);

// ---------------------------------------------------------------------------
// Step base
// ---------------------------------------------------------------------------

const stepBaseSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  retry: retryPolicySchema.partial().optional(),
  timeoutMs: z.number().int().min(1000).max(3600000).optional(),
  continueOnFailure: z.boolean().optional(),
  dependsOn: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Step type configs
// ---------------------------------------------------------------------------

export const agentStepSchema = stepBaseSchema.extend({
  type: z.literal("agent"),
  config: z.object({
    prompt: z.string().min(1),
    modelTier: z.enum(["reasoning", "generation", "fast"]).optional(),
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
    memoryContext: z.array(z.string()).optional(),
    maxTokens: z.number().int().min(1).max(32000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    outputFormat: z.enum(["text", "json", "markdown"]).optional(),
  }),
});

export const toolStepSchema = stepBaseSchema.extend({
  type: z.literal("tool"),
  config: z.object({
    toolName: z.string().min(1),
    params: z.record(z.string(), z.unknown()),
  }),
});

export const conditionalStepSchema = stepBaseSchema.extend({
  type: z.literal("conditional"),
  config: z.object({
    conditions: z
      .array(
        z.object({
          expression: z.string().min(1),
          thenSteps: z.array(z.string().min(1)),
        })
      )
      .min(1),
    elseSteps: z.array(z.string()).optional(),
  }),
});

export const loopStepSchema = stepBaseSchema.extend({
  type: z.literal("loop"),
  config: z.object({
    collection: z.string().min(1),
    bodySteps: z.array(z.string().min(1)),
    maxIterations: z.number().int().min(1).max(1000).optional(),
    parallel: z.boolean().optional(),
    concurrency: z.number().int().min(1).max(50).optional(),
  }),
});

export const parallelStepSchema = stepBaseSchema.extend({
  type: z.literal("parallel"),
  config: z.object({
    branches: z.array(z.string().min(1)).min(2),
    failureStrategy: z.enum(["fail_fast", "wait_all", "best_effort"]).optional(),
    concurrency: z.number().int().min(1).max(50).optional(),
  }),
});

export const waitStepSchema = stepBaseSchema.extend({
  type: z.literal("wait"),
  config: z.object({
    durationMs: z.number().int().min(0).optional(),
    untilTime: z.number().optional(),
    eventType: z.string().optional(),
    eventTimeoutMs: z.number().int().min(0).optional(),
  }),
});

export const approvalStepSchema = stepBaseSchema.extend({
  type: z.literal("approval"),
  config: z.object({
    contentRef: z.string().optional(),
    approvalType: z.string().min(1),
    timeoutMs: z.number().int().min(0).optional(),
    timeoutAction: z.enum(["cancel", "skip", "auto_approve"]).optional(),
  }),
});

export const transformStepSchema = stepBaseSchema.extend({
  type: z.literal("transform"),
  config: z.object({
    expression: z.string().min(1),
    inputs: z.record(z.string(), z.string()),
  }),
});

export const workflowStepSchema = z.discriminatedUnion("type", [
  agentStepSchema,
  toolStepSchema,
  conditionalStepSchema,
  loopStepSchema,
  parallelStepSchema,
  waitStepSchema,
  approvalStepSchema,
  transformStepSchema,
]);

// ---------------------------------------------------------------------------
// Workflow definition
// ---------------------------------------------------------------------------

export const workflowDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  version: z.number().int().min(1),
  trigger: workflowTriggerSchema,
  steps: z.array(workflowStepSchema).min(1),
  config: z.record(z.string(), z.unknown()).optional(),
  defaultRetry: retryPolicySchema.partial().optional(),
  maxDurationMs: z.number().int().min(1000).max(86400000).optional(),
});

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates a workflow definition and returns typed result.
 */
export function validateWorkflowDefinition(input: unknown) {
  return workflowDefinitionSchema.safeParse(input);
}

/**
 * Validates that all step dependencies reference existing step IDs.
 */
export function validateStepDependencies(steps: Array<{ id: string; dependsOn?: string[] }>): {
  valid: boolean;
  errors: string[];
} {
  const stepIds = new Set(steps.map((s) => s.id));
  const errors: string[] = [];

  // Check for duplicate IDs
  if (stepIds.size !== steps.length) {
    const seen = new Set<string>();
    for (const step of steps) {
      if (seen.has(step.id)) {
        errors.push(`Duplicate step ID: "${step.id}"`);
      }
      seen.add(step.id);
    }
  }

  // Check dependencies reference valid step IDs
  for (const step of steps) {
    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          errors.push(`Step "${step.id}" depends on unknown step "${dep}"`);
        }
        if (dep === step.id) {
          errors.push(`Step "${step.id}" cannot depend on itself`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Detects circular dependencies in step graph.
 */
export function detectCircularDependencies(steps: Array<{ id: string; dependsOn?: string[] }>): {
  hasCycle: boolean;
  cycle?: string[];
} {
  const graph = new Map<string, string[]>();
  for (const step of steps) {
    graph.set(step.id, step.dependsOn ?? []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) {
      // Found a cycle
      return true;
    }
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    for (const dep of graph.get(nodeId) ?? []) {
      if (dfs(dep)) return true;
    }

    inStack.delete(nodeId);
    path.pop();
    return false;
  }

  for (const step of steps) {
    if (!visited.has(step.id)) {
      if (dfs(step.id)) {
        return { hasCycle: true, cycle: [...path] };
      }
    }
  }

  return { hasCycle: false };
}
