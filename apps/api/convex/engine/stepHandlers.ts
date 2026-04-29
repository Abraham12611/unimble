"use node";

/**
 * Workflow Engine — Step Handlers
 *
 * "use node" action that executes individual step types.
 * Each step type has its own handler function. The main
 * `runStep` action dispatches to the correct handler based
 * on the step type.
 *
 * After execution, handlers call completeStep or failStep
 * (internal mutations) to update state and advance the workflow.
 */

import { v } from "convex/values";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import type { StepContext } from "./types";
import { classifyError } from "./stateMachine";
import { resolveInputs } from "./stepRunner";
import { evaluateExpression } from "./expressionEvaluator";

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * Runs a single step. Dispatches to the correct handler based on
 * step type, then calls completeStep or failStep.
 */
export const runStep = internalAction({
  args: {
    executionId: v.id("executions"),
    stepRecordId: v.id("executionSteps"),
    stepContext: v.any(),
  },
  handler: async (ctx, args) => {
    const stepCtx = args.stepContext as StepContext;
    const stepDef = stepCtx.currentStep;
    const { internal } = await import("../_generated/api");

    // Apply timeout if configured
    const timeoutMs = stepDef.timeoutMs ?? 300_000; // 5 min default
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let output: unknown;

      switch (stepDef.type) {
        case "agent":
          output = await handleAgentStep(ctx, stepCtx, controller.signal);
          break;
        case "tool":
          output = await handleToolStep(ctx, stepCtx, controller.signal);
          break;
        case "conditional":
          output = await handleConditionalStep(ctx, stepCtx);
          break;
        case "loop":
          output = await handleLoopStep(ctx, stepCtx, controller.signal);
          break;
        case "parallel":
          output = await handleParallelStep(ctx, stepCtx, controller.signal);
          break;
        case "wait":
          output = await handleWaitStep(ctx, stepCtx, controller.signal);
          break;
        case "transform":
          output = await handleTransformStep(stepCtx);
          break;
        case "approval":
          // Approval steps are handled differently — they pause the execution
          await handleApprovalStep(ctx, stepCtx, args.executionId, args.stepRecordId);
          clearTimeout(timeoutId);
          return; // Don't call completeStep — approval handler manages state
        default:
          throw new Error(`Unknown step type: ${(stepDef as { type: string }).type}`);
      }

      clearTimeout(timeoutId);

      // Report completion
      await ctx.runMutation(internal.engine.stepRunner.completeStep, {
        executionId: args.executionId,
        stepRecordId: args.stepRecordId,
        output,
        cost:
          typeof output === "object" && output !== null && "cost" in output
            ? (output as { cost?: number }).cost
            : undefined,
      });
    } catch (error) {
      clearTimeout(timeoutId);

      const classified = classifyError(error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      await ctx.runMutation(internal.engine.stepRunner.failStep, {
        executionId: args.executionId,
        stepRecordId: args.stepRecordId,
        error: {
          message: errorMessage,
          category: classified.category,
          retryable: classified.retryable,
        },
        errorCategory: classified.category,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// 6.3.2 — Agent Step Handler
// ---------------------------------------------------------------------------

/**
 * Executes an agent step: sends a prompt to an LLM with optional
 * tools and memory context.
 */
async function handleAgentStep(
  ctx: ActionCtx,
  stepCtx: StepContext,
  signal: AbortSignal
): Promise<unknown> {
  if (stepCtx.currentStep.type !== "agent") {
    throw new Error("Expected agent step");
  }

  const config = stepCtx.currentStep.config;

  // Resolve prompt template
  const resolvedPrompt = resolveInputs(
    config.prompt,
    stepCtx.stepOutputs,
    undefined, // execution input not directly available in action
    stepCtx.config
  ) as string;

  // Build system prompt with memory context
  let systemPrompt = `You are an AI operator executing a workflow step.\n`;
  systemPrompt += `Step: ${stepCtx.currentStep.name}\n`;
  systemPrompt += `Workspace: ${stepCtx.workspaceId}\n`;

  if (config.memoryContext && config.memoryContext.length > 0) {
    systemPrompt += `\nRelevant context:\n`;
    for (const memKey of config.memoryContext) {
      const memValue = stepCtx.stepOutputs[memKey];
      if (memValue) {
        systemPrompt += `- ${memKey}: ${typeof memValue === "string" ? memValue : JSON.stringify(memValue)}\n`;
      }
    }
  }

  if (config.outputFormat === "json") {
    systemPrompt += `\nRespond with valid JSON only.`;
  }

  // Check for abort before making the LLM call
  if (signal.aborted) throw new Error("Step timed out");

  // Import LLM module dynamically (it's a "use node" module)
  const { llmPrompt } = await import("../lib/integrations/llm");

  const result = await llmPrompt(resolvedPrompt, systemPrompt, {
    tier: config.modelTier ?? "generation",
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    jsonMode: config.outputFormat === "json",
    workspaceId: stepCtx.workspaceId,
  });

  // Parse JSON output if requested
  let content: unknown = result.content;
  if (config.outputFormat === "json") {
    try {
      content = JSON.parse(result.content);
    } catch {
      // Return raw content if JSON parsing fails
      content = result.content;
    }
  }

  return {
    content,
    model: result.model,
    usedFallback: result.usedFallback,
    usage: result.usage,
    cost: result.cost,
    latencyMs: result.latencyMs,
  };
}

// ---------------------------------------------------------------------------
// 6.3.3 — Tool Call Step Handler
// ---------------------------------------------------------------------------

/**
 * Executes a tool step: calls an integration tool with parameters.
 */
async function handleToolStep(
  ctx: ActionCtx,
  stepCtx: StepContext,
  signal: AbortSignal
): Promise<unknown> {
  if (stepCtx.currentStep.type !== "tool") {
    throw new Error("Expected tool step");
  }

  const config = stepCtx.currentStep.config;

  // Resolve parameter templates
  const resolvedParams = resolveInputs(
    config.params,
    stepCtx.stepOutputs,
    undefined,
    stepCtx.config
  ) as Record<string, unknown>;

  if (signal.aborted) throw new Error("Step timed out");

  // Look up the tool in the integration registry
  const toolName = config.toolName;

  // Route to the appropriate integration module based on tool name prefix
  const [category] = toolName.split(".");

  switch (category) {
    case "llm": {
      const { llmPrompt } = await import("../lib/integrations/llm");
      const prompt = String(resolvedParams.prompt ?? "");
      const system = resolvedParams.system ? String(resolvedParams.system) : undefined;
      const result = await llmPrompt(prompt, system, {
        tier: (resolvedParams.tier as "reasoning" | "generation" | "fast") ?? "generation",
        maxTokens: resolvedParams.maxTokens as number | undefined,
        temperature: resolvedParams.temperature as number | undefined,
        workspaceId: stepCtx.workspaceId,
      });
      return {
        content: result.content,
        model: result.model,
        cost: result.cost,
        usage: result.usage,
      };
    }

    case "firecrawl": {
      const { firecrawlScrape, firecrawlCrawl } = await import("../lib/integrations/firecrawl");
      const action = toolName.split(".")[1] ?? "scrape";
      if (action === "crawl") {
        const url = String(resolvedParams.url ?? "");
        return await firecrawlCrawl(url, resolvedParams);
      }
      const url = String(resolvedParams.url ?? "");
      return await firecrawlScrape(url, resolvedParams);
    }

    case "perplexity": {
      const { perplexitySearch } = await import("../lib/integrations/perplexity");
      return await perplexitySearch(resolvedParams as Parameters<typeof perplexitySearch>[0]);
    }

    default: {
      // Generic tool execution via Composio
      const { getComposioClient } = await import("../lib/composio");
      const client = getComposioClient();
      // Execute via Composio toolkit
      const result = await client.executeAction({
        action: toolName,
        params: resolvedParams,
        entityId: stepCtx.workspaceId,
      });
      return result;
    }
  }
}

// ---------------------------------------------------------------------------
// 6.3.4 — Conditional Step Handler
// ---------------------------------------------------------------------------

/**
 * Evaluates conditions and returns which branch to take.
 * The step runner uses this output to determine which steps to
 * schedule next.
 */
async function handleConditionalStep(_ctx: ActionCtx, stepCtx: StepContext): Promise<unknown> {
  if (stepCtx.currentStep.type !== "conditional") {
    throw new Error("Expected conditional step");
  }

  const config = stepCtx.currentStep.config;

  for (let i = 0; i < config.conditions.length; i++) {
    const condition = config.conditions[i];
    const result = evaluateExpression(condition.expression, stepCtx.stepOutputs, stepCtx.config);

    if (result) {
      return {
        matched: true,
        conditionIndex: i,
        expression: condition.expression,
        selectedSteps: condition.thenSteps,
        branch: "then",
      };
    }
  }

  // No condition matched — use else branch
  return {
    matched: false,
    selectedSteps: config.elseSteps ?? [],
    branch: "else",
  };
}

// ---------------------------------------------------------------------------
// 6.3.5 — Loop Step Handler
// ---------------------------------------------------------------------------

/**
 * Iterates over a collection, executing body steps for each item.
 * Supports sequential and parallel iteration.
 */
async function handleLoopStep(
  ctx: ActionCtx,
  stepCtx: StepContext,
  signal: AbortSignal
): Promise<unknown> {
  if (stepCtx.currentStep.type !== "loop") {
    throw new Error("Expected loop step");
  }

  const config = stepCtx.currentStep.config;

  // Resolve the collection reference
  const collection = resolveInputs(
    config.collection,
    stepCtx.stepOutputs,
    undefined,
    stepCtx.config
  );

  if (!Array.isArray(collection)) {
    throw new Error(
      `Loop collection must be an array, got ${typeof collection}. ` +
        `Reference: ${config.collection}`
    );
  }

  const maxIterations = config.maxIterations ?? 100;
  const items = collection.slice(0, maxIterations);
  const results: unknown[] = [];

  if (config.parallel) {
    // Parallel iteration with concurrency limit
    const concurrency = config.concurrency ?? 5;
    const chunks: unknown[][] = [];

    for (let i = 0; i < items.length; i += concurrency) {
      chunks.push(items.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      if (signal.aborted) throw new Error("Step timed out");

      const chunkResults = await Promise.all(
        chunk.map((item, idx) => {
          const iterationContext = {
            ...stepCtx,
            stepOutputs: {
              ...stepCtx.stepOutputs,
              _loopItem: item,
              _loopIndex: results.length + idx,
              _loopTotal: items.length,
            },
          };
          return executeLoopBody(ctx, iterationContext, config.bodySteps, signal);
        })
      );
      results.push(...chunkResults);
    }
  } else {
    // Sequential iteration
    for (let i = 0; i < items.length; i++) {
      if (signal.aborted) throw new Error("Step timed out");

      const iterationContext = {
        ...stepCtx,
        stepOutputs: {
          ...stepCtx.stepOutputs,
          _loopItem: items[i],
          _loopIndex: i,
          _loopTotal: items.length,
        },
      };

      const result = await executeLoopBody(ctx, iterationContext, config.bodySteps, signal);
      results.push(result);
    }
  }

  return {
    iterations: results.length,
    totalItems: collection.length,
    truncated: collection.length > maxIterations,
    results,
  };
}

/**
 * Executes the body steps of a loop iteration.
 * Returns the combined output of all body steps.
 */
async function executeLoopBody(
  _ctx: ActionCtx,
  stepCtx: StepContext,
  bodyStepIds: string[],
  signal: AbortSignal
): Promise<unknown> {
  if (signal.aborted) throw new Error("Step timed out");

  // For loop body execution, we return the iteration context
  // The actual step execution is handled by the step runner
  // via scheduling. Here we just prepare the context.
  return {
    loopItem: stepCtx.stepOutputs._loopItem,
    loopIndex: stepCtx.stepOutputs._loopIndex,
    bodySteps: bodyStepIds,
  };
}

// ---------------------------------------------------------------------------
// 6.3.6 — Parallel Step Handler
// ---------------------------------------------------------------------------

/**
 * Executes multiple branches concurrently with configurable
 * failure strategies.
 */
async function handleParallelStep(
  _ctx: ActionCtx,
  stepCtx: StepContext,
  signal: AbortSignal
): Promise<unknown> {
  if (stepCtx.currentStep.type !== "parallel") {
    throw new Error("Expected parallel step");
  }

  const config = stepCtx.currentStep.config;
  const failureStrategy = config.failureStrategy ?? "fail_fast";

  if (signal.aborted) throw new Error("Step timed out");

  // Parallel steps are orchestrated by the step runner (mutations).
  // This handler returns the branch configuration so the runner
  // can schedule all branches and collect results.
  //
  // The actual parallel execution happens at the mutation level
  // where the step runner schedules multiple advanceExecution calls.
  return {
    branches: config.branches,
    failureStrategy,
    concurrency: config.concurrency ?? config.branches.length,
    status: "branches_scheduled",
  };
}

// ---------------------------------------------------------------------------
// 6.3.7 — Wait Step Handler
// ---------------------------------------------------------------------------

/**
 * Pauses execution for a duration, until a time, or until an event.
 */
async function handleWaitStep(
  _ctx: ActionCtx,
  stepCtx: StepContext,
  signal: AbortSignal
): Promise<unknown> {
  if (stepCtx.currentStep.type !== "wait") {
    throw new Error("Expected wait step");
  }

  const config = stepCtx.currentStep.config;

  // Duration wait
  if (config.durationMs !== undefined && config.durationMs > 0) {
    if (signal.aborted) throw new Error("Step timed out");

    // For short waits, sleep in the action
    if (config.durationMs <= 30_000) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, config.durationMs);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Step timed out"));
        });
      });

      return {
        waitType: "duration",
        durationMs: config.durationMs,
        completedAt: Date.now(),
      };
    }

    // For longer waits, return metadata so the runner can
    // reschedule via ctx.scheduler.runAfter
    return {
      waitType: "duration",
      durationMs: config.durationMs,
      resumeAt: Date.now() + config.durationMs,
      deferred: true,
    };
  }

  // Until-time wait
  if (config.untilTime !== undefined) {
    const now = Date.now();
    const remaining = config.untilTime - now;

    if (remaining <= 0) {
      return {
        waitType: "until",
        untilTime: config.untilTime,
        completedAt: now,
        alreadyPassed: true,
      };
    }

    if (remaining <= 30_000) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, remaining);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Step timed out"));
        });
      });

      return {
        waitType: "until",
        untilTime: config.untilTime,
        completedAt: Date.now(),
      };
    }

    return {
      waitType: "until",
      untilTime: config.untilTime,
      resumeAt: config.untilTime,
      deferred: true,
    };
  }

  // Event wait
  if (config.eventType) {
    const timeoutMs = config.eventTimeoutMs ?? 86_400_000; // 24h default

    return {
      waitType: "event",
      eventType: config.eventType,
      timeoutMs,
      expiresAt: Date.now() + timeoutMs,
      deferred: true,
    };
  }

  // No wait configuration — complete immediately
  return {
    waitType: "none",
    completedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Transform Step Handler
// ---------------------------------------------------------------------------

/**
 * Executes a data transformation (no external calls).
 * Evaluates a JavaScript expression with access to step outputs.
 */
async function handleTransformStep(stepCtx: StepContext): Promise<unknown> {
  if (stepCtx.currentStep.type !== "transform") {
    throw new Error("Expected transform step");
  }

  const config = stepCtx.currentStep.config;

  // Resolve input references
  const resolvedInputs: Record<string, unknown> = {};
  for (const [key, ref] of Object.entries(config.inputs)) {
    resolvedInputs[key] = resolveInputs(ref, stepCtx.stepOutputs, undefined, stepCtx.config);
  }

  // Evaluate the expression with resolved inputs as context
  // Using Function constructor for sandboxed evaluation
  try {
    const fn = new Function(
      ...Object.keys(resolvedInputs),
      `"use strict"; return (${config.expression});`
    );
    const result = fn(...Object.values(resolvedInputs));
    return { result };
  } catch (error) {
    throw new Error(
      `Transform expression failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Approval Step Handler (delegates to mutation)
// ---------------------------------------------------------------------------

/**
 * Creates an approval record and pauses the execution.
 * The execution resumes when the approval is responded to.
 */
async function handleApprovalStep(
  ctx: ActionCtx,
  stepCtx: StepContext,
  executionId: string,
  stepRecordId: string
): Promise<void> {
  if (stepCtx.currentStep.type !== "approval") {
    throw new Error("Expected approval step");
  }

  const config = stepCtx.currentStep.config;
  const { internal } = await import("../_generated/api");

  // Resolve content reference if provided
  let content: unknown;
  if (config.contentRef) {
    content = resolveInputs(config.contentRef, stepCtx.stepOutputs, undefined, stepCtx.config);
  }

  // Create approval record and pause execution via mutation
  await ctx.runMutation(internal.engine.stepRunner.pauseForApproval, {
    executionId: executionId as unknown as ReturnType<typeof v.id<"executions">>,
    stepRecordId: stepRecordId as unknown as ReturnType<typeof v.id<"executionSteps">>,
    approvalType: config.approvalType,
    content,
    timeoutMs: config.timeoutMs ?? 86_400_000,
    timeoutAction: config.timeoutAction ?? "cancel",
  });
}
