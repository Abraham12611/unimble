/**
 * Workflow Engine — Step Runner
 *
 * The core execution engine that picks up queued executions,
 * resolves step inputs via {{...}} templates, dispatches to
 * the correct step handler, captures output, and manages
 * timeouts and cancellation.
 *
 * This module contains only Convex mutations and internal
 * functions (no external calls). Step handlers that make
 * external calls live in stepHandlers.ts (a "use node" action).
 */

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import type { StepContext, WorkflowDefinition, WorkflowStepDef } from "./types";
import { resolveRetryPolicy } from "./stateMachine";

// ---------------------------------------------------------------------------
// Function references for scheduling (avoids dependency on generated types)
// ---------------------------------------------------------------------------

const advanceExecutionRef = makeFunctionReference<
  "mutation",
  { executionId: Id<"executions">; stepId: string }
>("engine/stepRunner:advanceExecution");

const executeStepActionRef = makeFunctionReference<
  "mutation",
  { executionId: Id<"executions">; stepRecordId: Id<"executionSteps">; stepContext: unknown }
>("engine/stepRunner:executeStepAction");

const runStepRef = makeFunctionReference<
  "action",
  { executionId: Id<"executions">; stepRecordId: Id<"executionSteps">; stepContext: unknown }
>("engine/stepHandlers:runStep");

const handleApprovalTimeoutRef = makeFunctionReference<
  "mutation",
  { executionId: Id<"executions">; stepRecordId: Id<"executionSteps">; timeoutAction: string }
>("engine/stepRunner:handleApprovalTimeout");

const notifyApprovalRequestedRef = makeFunctionReference<
  "mutation",
  {
    workspaceId: Id<"workspaces">;
    executionId: Id<"executions">;
    stepId: string;
    approvalType: string;
    content?: unknown;
  }
>("engine/humanLoop:notifyApprovalRequested");

// ---------------------------------------------------------------------------
// Input resolution — {{stepId.path}} template expansion
// ---------------------------------------------------------------------------

/**
 * Resolves `{{stepId.path.to.value}}` references in a value tree.
 *
 * Supports:
 *  - `{{stepId.output}}` — full output of a completed step
 *  - `{{stepId.output.key}}` — nested property access
 *  - `{{input.key}}` — workflow execution input
 *  - `{{config.key}}` — workflow-level config
 *
 * Non-string values and strings without `{{` are returned as-is.
 */
export function resolveInputs(
  value: unknown,
  stepOutputs: Record<string, unknown>,
  executionInput: unknown,
  workflowConfig: Record<string, unknown>
): unknown {
  if (typeof value === "string") {
    return resolveStringTemplate(value, stepOutputs, executionInput, workflowConfig);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveInputs(item, stepOutputs, executionInput, workflowConfig));
  }

  if (value !== null && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      resolved[k] = resolveInputs(v, stepOutputs, executionInput, workflowConfig);
    }
    return resolved;
  }

  return value;
}

/**
 * Resolves a single string that may contain `{{...}}` templates.
 *
 * If the entire string is a single template (e.g. `"{{step1.output}}"`)
 * the resolved value is returned as its native type (object, array, etc.).
 *
 * If the string contains mixed text and templates (e.g. `"Hello {{step1.output.name}}"`)
 * all templates are stringified and interpolated.
 */
function resolveStringTemplate(
  template: string,
  stepOutputs: Record<string, unknown>,
  executionInput: unknown,
  workflowConfig: Record<string, unknown>
): unknown {
  // Fast path: no templates
  if (!template.includes("{{")) return template;

  // Check if the entire string is a single template
  const singleMatch = /^\{\{(.+?)\}\}$/.exec(template);
  if (singleMatch) {
    return resolvePath(singleMatch[1].trim(), stepOutputs, executionInput, workflowConfig);
  }

  // Mixed text + templates — stringify each resolved value
  return template.replace(/\{\{(.+?)\}\}/g, (_match, path: string) => {
    const resolved = resolvePath(path.trim(), stepOutputs, executionInput, workflowConfig);
    if (resolved === undefined || resolved === null) return "";
    if (typeof resolved === "object") return JSON.stringify(resolved);
    return String(resolved);
  });
}

/**
 * Resolves a dot-separated path against the available contexts.
 *
 * Paths:
 *  - `input.key` → executionInput.key
 *  - `config.key` → workflowConfig.key
 *  - `stepId.output.key` → stepOutputs[stepId].key
 */
function resolvePath(
  path: string,
  stepOutputs: Record<string, unknown>,
  executionInput: unknown,
  workflowConfig: Record<string, unknown>
): unknown {
  const parts = path.split(".");
  if (parts.length === 0) return undefined;

  const root = parts[0];
  let value: unknown;

  if (root === "input") {
    value = executionInput;
    return drillDown(value, parts.slice(1));
  }

  if (root === "config") {
    value = workflowConfig;
    return drillDown(value, parts.slice(1));
  }

  // Assume it's a step ID reference
  value = stepOutputs[root];
  return drillDown(value, parts.slice(1));
}

/**
 * Drills into a nested value using dot-separated path segments.
 */
function drillDown(value: unknown, parts: string[]): unknown {
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Step context builder
// ---------------------------------------------------------------------------

/**
 * Builds the StepContext passed to every step handler.
 */
export function buildStepContext(args: {
  executionId: string;
  workspaceId: string;
  operatorId?: string;
  workflow: WorkflowDefinition;
  stepOutputs: Record<string, unknown>;
  currentStep: WorkflowStepDef;
  config: Record<string, unknown>;
}): StepContext {
  return {
    executionId: args.executionId,
    workspaceId: args.workspaceId,
    operatorId: args.operatorId,
    workflow: args.workflow,
    stepOutputs: args.stepOutputs,
    currentStep: args.currentStep,
    config: args.config,
  };
}

// ---------------------------------------------------------------------------
// Topological sort — determines step execution order
// ---------------------------------------------------------------------------

/**
 * Returns step IDs in a valid execution order (topological sort).
 * Steps with no dependencies come first. Throws on cycles.
 */
export function topologicalSort(steps: WorkflowStepDef[]): string[] {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const step of steps) {
    graph.set(step.id, []);
    inDegree.set(step.id, 0);
  }

  for (const step of steps) {
    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        graph.get(dep)?.push(step.id);
        inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of graph.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== steps.length) {
    throw new Error("Circular dependency detected in workflow steps");
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Execution orchestrator — internal mutations
// ---------------------------------------------------------------------------

/**
 * Starts a queued execution: transitions to "running", creates
 * step records, and schedules the first step(s) for execution.
 *
 * Called by triggers (schedule, event, manual, webhook) after
 * creating the execution record.
 */
export const startExecution = internalMutation({
  args: {
    executionId: v.id("executions"),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) throw new Error("Execution not found");
    if (execution.status !== "queued") {
      throw new Error(`Cannot start execution in "${execution.status}" state`);
    }

    // Load the workflow definition
    const workflow = await ctx.db.get(execution.workflowId);
    if (!workflow) throw new Error("Workflow not found");

    const definition = workflow.steps as unknown as WorkflowDefinition | undefined;
    if (!definition || !definition.steps || definition.steps.length === 0) {
      // No steps — mark as completed immediately
      const now = Date.now();
      await ctx.db.patch(args.executionId, {
        status: "completed",
        output: { message: "No steps to execute" },
        completedAt: now,
        duration: Math.max(0, now - execution.startedAt),
        updatedAt: now,
      });
      return;
    }

    // Transition to running
    await ctx.db.patch(args.executionId, {
      status: "running",
      updatedAt: Date.now(),
    });

    // Create step records for all steps
    const now = Date.now();
    for (const stepDef of definition.steps) {
      await ctx.db.insert("executionSteps", {
        executionId: args.executionId,
        stepId: stepDef.id,
        name: stepDef.name,
        type: stepDef.type,
        status: "queued",
        input: stepDef,
        output: undefined,
        error: undefined,
        startedAt: undefined,
        completedAt: undefined,
        retryCount: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Determine which steps are ready (no dependencies)
    const readySteps = definition.steps.filter((s) => !s.dependsOn || s.dependsOn.length === 0);

    // Schedule ready steps for execution
    for (const step of readySteps) {
      await ctx.scheduler.runAfter(0, advanceExecutionRef, {
        executionId: args.executionId,
        stepId: step.id,
      });
    }
  },
});

/**
 * Advances execution by running the next ready step.
 *
 * This is the main loop of the engine. After a step completes,
 * it checks for newly-ready steps and schedules them, or
 * completes/fails the execution if all steps are done.
 */
export const advanceExecution = internalMutation({
  args: {
    executionId: v.id("executions"),
    stepId: v.string(),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) return;
    if (execution.status !== "running") return;

    // Load workflow definition
    const workflow = await ctx.db.get(execution.workflowId);
    if (!workflow) return;

    const definition = workflow.steps as unknown as WorkflowDefinition | undefined;
    if (!definition) return;

    const stepDef = definition.steps.find((s) => s.id === args.stepId);
    if (!stepDef) return;

    // Find the step record
    const stepRecords = await ctx.db
      .query("executionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .collect();

    const stepRecord = stepRecords.find((r) => r.stepId === args.stepId);
    if (!stepRecord) return;
    if (stepRecord.status !== "queued") return;

    // Check dependencies are all completed
    if (stepDef.dependsOn && stepDef.dependsOn.length > 0) {
      const allDepsComplete = stepDef.dependsOn.every((depId) => {
        const dep = stepRecords.find((r) => r.stepId === depId);
        return dep && (dep.status === "completed" || dep.status === "skipped");
      });
      if (!allDepsComplete) return; // Not ready yet
    }

    // Collect outputs from completed steps
    const stepOutputs: Record<string, unknown> = {};
    for (const record of stepRecords) {
      if (record.status === "completed" && record.output !== undefined) {
        stepOutputs[record.stepId] = record.output;
      }
    }

    // Mark step as running
    const now = Date.now();
    await ctx.db.patch(stepRecord._id, {
      status: "running",
      startedAt: now,
      updatedAt: now,
    });

    // Build step context
    const stepContext: StepContext = {
      executionId: args.executionId as string,
      workspaceId: execution.workspaceId as string,
      operatorId: execution.operatorId as string | undefined,
      workflow: definition,
      stepOutputs,
      currentStep: stepDef,
      config: (definition.config ?? {}) as Record<string, unknown>,
    };

    // Schedule the step handler action
    // The handler action will call completeStep or failStep when done
    await ctx.scheduler.runAfter(0, executeStepActionRef, {
      executionId: args.executionId,
      stepRecordId: stepRecord._id,
      stepContext: stepContext as unknown as Record<string, unknown>,
    });
  },
});

/**
 * Placeholder for the step handler action dispatcher.
 * This schedules the actual "use node" action that runs step logic.
 * Defined here as an internal mutation that delegates to the action.
 */
export const executeStepAction = internalMutation({
  args: {
    executionId: v.id("executions"),
    stepRecordId: v.id("executionSteps"),
    stepContext: v.any(),
  },
  handler: async (ctx, args) => {
    // Delegate to the "use node" step handler action via function reference.
    await ctx.scheduler.runAfter(0, runStepRef, {
      executionId: args.executionId,
      stepRecordId: args.stepRecordId,
      stepContext: args.stepContext,
    });
  },
});

// ---------------------------------------------------------------------------
// Step completion / failure — called by step handlers
// ---------------------------------------------------------------------------

/**
 * Marks a step as completed and advances the execution.
 */
export const completeStep = internalMutation({
  args: {
    executionId: v.id("executions"),
    stepRecordId: v.id("executionSteps"),
    output: v.optional(v.any()),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "running") return;

    const stepRecord = await ctx.db.get(args.stepRecordId);
    if (!stepRecord || stepRecord.status !== "running") return;

    const now = Date.now();
    await ctx.db.patch(args.stepRecordId, {
      status: "completed",
      output: args.output,
      completedAt: now,
      updatedAt: now,
    });

    // Update execution cost
    if (args.cost && args.cost > 0) {
      const currentCost = execution.cost ?? 0;
      await ctx.db.patch(args.executionId, {
        cost: currentCost + args.cost,
        updatedAt: now,
      });
    }

    // Check if execution is complete or if more steps are ready
    await checkExecutionProgress(ctx, args.executionId);
  },
});

/**
 * Marks a step as failed. Applies retry logic if configured.
 */
export const failStep = internalMutation({
  args: {
    executionId: v.id("executions"),
    stepRecordId: v.id("executionSteps"),
    error: v.any(),
    errorCategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "running") return;

    const stepRecord = await ctx.db.get(args.stepRecordId);
    if (!stepRecord || stepRecord.status !== "running") return;

    // Load workflow to get step definition and retry policy
    const workflow = await ctx.db.get(execution.workflowId);
    const definition = workflow?.steps as unknown as WorkflowDefinition | undefined;
    const stepDef = definition?.steps.find((s) => s.id === stepRecord.stepId);

    const retryPolicy = resolveRetryPolicy(stepDef?.retry ?? definition?.defaultRetry);
    const currentRetry = stepRecord.retryCount ?? 0;

    // Check if we should retry.
    // When retryOn is configured, only retry errors in that list.
    // When retryOn is absent, fall back to the classified error's
    // retryable flag (which covers the default categories).
    const classified = args.errorCategory ?? "unknown";
    let isRetryable: boolean;

    if (retryPolicy.failOn?.includes(classified)) {
      // Explicitly non-retryable
      isRetryable = false;
    } else if (retryPolicy.retryOn && retryPolicy.retryOn.length > 0) {
      // Explicit allow-list — only retry if category is listed
      isRetryable = retryPolicy.retryOn.includes(classified);
    } else {
      // No allow-list — retry if under max attempts
      isRetryable = currentRetry < retryPolicy.maxAttempts;
    }

    if (isRetryable && currentRetry < retryPolicy.maxAttempts) {
      // Re-queue for retry
      const now = Date.now();
      await ctx.db.patch(args.stepRecordId, {
        status: "queued",
        error: args.error,
        retryCount: currentRetry + 1,
        completedAt: undefined,
        startedAt: undefined,
        updatedAt: now,
      });

      // Calculate delay and schedule retry
      const delay = calculateDelay(retryPolicy, currentRetry);
      await ctx.scheduler.runAfter(delay, advanceExecutionRef, {
        executionId: args.executionId,
        stepId: stepRecord.stepId,
      });
      return;
    }

    // No more retries — mark step as failed
    const now = Date.now();
    await ctx.db.patch(args.stepRecordId, {
      status: "failed",
      error: args.error,
      completedAt: now,
      updatedAt: now,
    });

    // Check if step has continueOnFailure
    if (stepDef?.continueOnFailure) {
      await checkExecutionProgress(ctx, args.executionId);
    } else {
      // Fail the entire execution
      await ctx.db.patch(args.executionId, {
        status: "failed",
        error: {
          stepId: stepRecord.stepId,
          stepName: stepRecord.name,
          error: args.error,
          category: args.errorCategory ?? "unknown",
        },
        completedAt: now,
        duration: Math.max(0, now - execution.startedAt),
        updatedAt: now,
      });

      // Cancel any remaining queued/running steps
      await cancelRemainingSteps(ctx, args.executionId);
    }
  },
});

/**
 * Marks a step as skipped and advances the execution.
 */
export const skipStep = internalMutation({
  args: {
    executionId: v.id("executions"),
    stepRecordId: v.id("executionSteps"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "running") return;

    const stepRecord = await ctx.db.get(args.stepRecordId);
    if (!stepRecord) return;

    const now = Date.now();
    await ctx.db.patch(args.stepRecordId, {
      status: "skipped",
      output: args.reason ? { reason: args.reason } : undefined,
      completedAt: now,
      updatedAt: now,
    });

    await checkExecutionProgress(ctx, args.executionId);
  },
});

// ---------------------------------------------------------------------------
// Execution progress checker
// ---------------------------------------------------------------------------
// Execution progress checker
// ---------------------------------------------------------------------------

/**
 * Schedulable wrapper for checkExecutionProgress.
 * Used by humanLoop.ts mutations (approveWithEdits, submitFeedback)
 * to advance the workflow after resuming from approval/feedback.
 */
export const scheduleCheckProgress = internalMutation({
  args: {
    executionId: v.id("executions"),
  },
  handler: async (ctx, args) => {
    await checkExecutionProgress(ctx, args.executionId);
  },
});

/**
 * Checks if the execution is complete or if more steps are ready.
 * Called after every step completion/skip/failure.
 */
async function checkExecutionProgress(
  ctx: MutationCtx,
  executionId: Id<"executions">
): Promise<void> {
  const execution = await ctx.db.get(executionId);
  if (!execution || execution.status !== "running") return;

  const workflow = await ctx.db.get(execution.workflowId);
  const definition = workflow?.steps as unknown as WorkflowDefinition | undefined;
  if (!definition) return;

  const stepRecords = await ctx.db
    .query("executionSteps")
    .withIndex("by_execution", (q) => q.eq("executionId", executionId))
    .collect();

  const statusMap = new Map(stepRecords.map((r) => [r.stepId, r.status]));

  // Check if all steps are in terminal states
  const allTerminal = stepRecords.every((r) =>
    ["completed", "failed", "skipped", "canceled"].includes(r.status)
  );

  if (allTerminal) {
    // Execution is done — collect outputs
    const outputs: Record<string, unknown> = {};
    for (const record of stepRecords) {
      if (record.output !== undefined) {
        outputs[record.stepId] = record.output;
      }
    }

    const hasFailed = stepRecords.some((r) => r.status === "failed");
    const now = Date.now();

    await ctx.db.patch(executionId, {
      status: hasFailed ? "failed" : "completed",
      output: outputs,
      completedAt: now,
      duration: Math.max(0, now - execution.startedAt),
      updatedAt: now,
    });
    return;
  }

  // Find steps that are ready to run (queued + all deps satisfied)
  for (const stepDef of definition.steps) {
    const record = stepRecords.find((r) => r.stepId === stepDef.id);
    if (!record || record.status !== "queued") continue;

    if (stepDef.dependsOn && stepDef.dependsOn.length > 0) {
      const allDepsComplete = stepDef.dependsOn.every((depId) => {
        const depStatus = statusMap.get(depId);
        return depStatus === "completed" || depStatus === "skipped";
      });
      if (!allDepsComplete) continue;
    }

    // This step is ready — schedule it
    await ctx.scheduler.runAfter(0, advanceExecutionRef, {
      executionId,
      stepId: stepDef.id,
    });
  }
}

// ---------------------------------------------------------------------------
// Approval gate — pause execution for human approval
// ---------------------------------------------------------------------------

/**
 * Pauses an execution at an approval gate step.
 * Creates an approval record and transitions execution to waiting_approval.
 */
export const pauseForApproval = internalMutation({
  args: {
    executionId: v.id("executions"),
    stepRecordId: v.id("executionSteps"),
    approvalType: v.string(),
    content: v.optional(v.any()),
    timeoutMs: v.number(),
    timeoutAction: v.string(),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "running") return;

    const stepRecord = await ctx.db.get(args.stepRecordId);
    if (!stepRecord || stepRecord.status !== "running") return;

    const now = Date.now();

    // Create approval record
    await ctx.db.insert("approvals", {
      executionId: args.executionId,
      stepId: stepRecord.stepId,
      type: args.approvalType,
      content: args.content,
      status: "pending",
      requestedAt: now,
      respondedAt: undefined,
      respondedBy: undefined,
      feedback: undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Transition execution to waiting_approval
    await ctx.db.patch(args.executionId, {
      status: "waiting_approval",
      updatedAt: now,
    });

    // Notify workspace approvers (owners/admins)
    await ctx.scheduler.runAfter(0, notifyApprovalRequestedRef, {
      workspaceId: execution.workspaceId,
      executionId: args.executionId,
      stepId: stepRecord.stepId,
      approvalType: args.approvalType,
      content: args.content,
    });

    // Schedule timeout handler
    if (args.timeoutMs > 0) {
      await ctx.scheduler.runAfter(args.timeoutMs, handleApprovalTimeoutRef, {
        executionId: args.executionId,
        stepRecordId: args.stepRecordId,
        timeoutAction: args.timeoutAction,
      });
    }
  },
});

/**
 * Handles approval timeout. Applies the configured timeout action.
 */
export const handleApprovalTimeout = internalMutation({
  args: {
    executionId: v.id("executions"),
    stepRecordId: v.id("executionSteps"),
    timeoutAction: v.string(),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "waiting_approval") return;

    const stepRecord = await ctx.db.get(args.stepRecordId);
    if (!stepRecord || stepRecord.status !== "running") return;

    // Check if approval was already responded to
    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .filter((q) => q.eq(q.field("stepId"), stepRecord.stepId))
      .collect();

    const pendingApproval = approvals.find((a) => a.status === "pending");
    if (!pendingApproval) return; // Already responded

    const now = Date.now();

    switch (args.timeoutAction) {
      case "auto_approve": {
        // Auto-approve and resume
        await ctx.db.patch(pendingApproval._id, {
          status: "approved",
          feedback: { autoApproved: true, reason: "timeout" },
          respondedAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(args.stepRecordId, {
          status: "completed",
          output: { approved: true, autoApproved: true },
          completedAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(args.executionId, {
          status: "running",
          updatedAt: now,
        });
        await checkExecutionProgress(ctx, args.executionId);
        break;
      }

      case "skip": {
        // Skip the step and continue
        await ctx.db.patch(pendingApproval._id, {
          status: "rejected",
          feedback: { skipped: true, reason: "timeout" },
          respondedAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(args.stepRecordId, {
          status: "skipped",
          output: { skipped: true, reason: "approval_timeout" },
          completedAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(args.executionId, {
          status: "running",
          updatedAt: now,
        });
        await checkExecutionProgress(ctx, args.executionId);
        break;
      }

      case "cancel":
      default: {
        // Cancel the execution
        await ctx.db.patch(pendingApproval._id, {
          status: "rejected",
          feedback: { canceled: true, reason: "timeout" },
          respondedAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(args.stepRecordId, {
          status: "canceled",
          completedAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(args.executionId, {
          status: "canceled",
          error: { reason: "approval_timeout", stepId: stepRecord.stepId },
          completedAt: now,
          duration: Math.max(0, now - execution.startedAt),
          updatedAt: now,
        });
        await cancelRemainingSteps(ctx, args.executionId);
        break;
      }
    }
  },
});

/**
 * Resumes an execution after an approval response.
 * Called when a user approves or rejects via the dashboard.
 */
export const resumeAfterApproval = internalMutation({
  args: {
    executionId: v.id("executions"),
    stepRecordId: v.id("executionSteps"),
    approved: v.boolean(),
    feedback: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "waiting_approval") return;

    const stepRecord = await ctx.db.get(args.stepRecordId);
    if (!stepRecord || stepRecord.status !== "running") return;

    const now = Date.now();

    if (args.approved) {
      await ctx.db.patch(args.stepRecordId, {
        status: "completed",
        output: { approved: true, feedback: args.feedback },
        completedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(args.stepRecordId, {
        status: "failed",
        error: { rejected: true, feedback: args.feedback },
        completedAt: now,
        updatedAt: now,
      });
    }

    // Resume execution
    await ctx.db.patch(args.executionId, {
      status: "running",
      updatedAt: now,
    });

    await checkExecutionProgress(ctx, args.executionId);
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cancels all remaining queued/running steps in an execution.
 */
async function cancelRemainingSteps(
  ctx: MutationCtx,
  executionId: Id<"executions">
): Promise<void> {
  const steps = await ctx.db
    .query("executionSteps")
    .withIndex("by_execution", (q) => q.eq("executionId", executionId))
    .collect();

  const now = Date.now();
  for (const step of steps) {
    if (step.status === "queued" || step.status === "running") {
      await ctx.db.patch(step._id, {
        status: "canceled",
        completedAt: now,
        updatedAt: now,
      });
    }
  }
}

/**
 * Calculates retry delay with exponential backoff and jitter.
 */
function calculateDelay(
  policy: { backoff: string; initialDelayMs: number; maxDelayMs: number },
  attempt: number
): number {
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

  delay = Math.min(delay, policy.maxDelayMs);

  // ±20% jitter
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(delay + jitter));
}
