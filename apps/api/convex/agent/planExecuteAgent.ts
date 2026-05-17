"use node";

/**
 * Agent Runtime — Plan-Execute Agent
 *
 * Extends AgentBase with a two-phase execution model:
 * 1. PLAN: Decompose the goal into ordered steps
 * 2. EXECUTE: Run each step sequentially, revising the plan if needed
 *
 * This is the "plan_execute" mode defined in AgentConfig.
 * Unlike the ReAct agent which decides one action at a time,
 * the PlanExecuteAgent creates a full plan upfront and tracks
 * progress through it.
 *
 * Phase 7.5.2 — Planning Agent
 */

import { AgentBase } from "./agentBase";
import type { LLMCallFn, ToolExecutorFn } from "./agentBase";
import type {
  AgentConfig,
  AgentContext,
  AgentExecutionState,
  AgentMessage,
  AgentStep,
} from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single step in the agent's plan. */
export interface PlanStep {
  /** Step number (1-indexed) */
  index: number;
  /** What this step should accomplish */
  description: string;
  /** Which tool to use (if known) */
  toolHint?: string;
  /** Status of this step */
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  /** Output from this step (set after completion) */
  output?: string;
  /** Error if step failed */
  error?: string;
}

/** The full plan created by the planning phase. */
export interface ExecutionPlan {
  /** The original goal */
  goal: string;
  /** Ordered steps to achieve the goal */
  steps: PlanStep[];
  /** Current step index being executed */
  currentStepIndex: number;
  /** Number of plan revisions made */
  revisionCount: number;
  /** Whether the plan has been completed */
  completed: boolean;
}

// ---------------------------------------------------------------------------
// Plan-Execute Agent
// ---------------------------------------------------------------------------

/**
 * Agent that plans before executing.
 *
 * Execution flow:
 * 1. Generate a plan (list of steps) from the goal
 * 2. Execute each step using the ReAct loop
 * 3. After each step, check if the plan needs revision
 * 4. If revision needed, regenerate remaining steps
 * 5. Complete when all steps are done or goal is achieved
 */
export class PlanExecuteAgent extends AgentBase {
  private plan: ExecutionPlan | null = null;
  private maxRevisions: number;

  constructor(config: AgentConfig) {
    super(config);
    this.maxRevisions = 3;
  }

  /**
   * Executes the agent with plan-then-execute strategy.
   */
  async execute(
    context: AgentContext,
    llmCall: LLMCallFn,
    toolExecutor: ToolExecutorFn
  ): Promise<AgentExecutionState> {
    const startTime = Date.now();
    this.state = context.previousState ?? this.createInitialState(context.goal);

    if (this.state.status === "complete" || this.state.status === "failed") {
      return this.state;
    }

    // Restore plan from previousState if available (re-entry support)
    if (context.previousState && !this.plan) {
      const savedPlan = (context.previousState as unknown as { _plan?: ExecutionPlan })._plan;
      if (savedPlan) {
        this.plan = savedPlan;
      }
    }

    // Build initial messages if needed
    if (this.state.messages.length === 0) {
      this.state.messages = this.buildPlanningMessages(context);
    }

    const maxIterations = this.config.maxIterations ?? 15;

    try {
      // Phase 1: Generate the plan
      if (!this.plan) {
        this.state.status = "thinking";
        this.plan = await this.generatePlan(llmCall, context);

        // Record the planning step
        const planStep: AgentStep = {
          iteration: ++this.state.currentIteration,
          thought: `Generated plan with ${this.plan.steps.length} steps`,
          action: {
            type: "final_answer",
            content: JSON.stringify(this.plan.steps.map((s) => s.description)),
            format: "json",
          },
          timestamp: Date.now(),
          durationMs: Date.now() - startTime,
          cost: 0,
        };
        this.state.steps.push(planStep);
      }

      // Phase 2: Execute each step
      while (
        this.plan.currentStepIndex < this.plan.steps.length &&
        this.state.currentIteration < maxIterations
      ) {
        const currentStep = this.plan.steps[this.plan.currentStepIndex];
        currentStep.status = "in_progress";

        this.state.currentIteration++;
        const stepStart = Date.now();

        // Execute the current plan step using the ReAct approach
        this.state.status = "thinking";
        const response = await this.executeStep(llmCall, toolExecutor, currentStep, context);

        if (response.completed) {
          currentStep.status = "completed";
          currentStep.output = response.output;
          this.plan.currentStepIndex++;

          const step: AgentStep = {
            iteration: this.state.currentIteration,
            thought: `Completed step ${currentStep.index}: ${currentStep.description}`,
            action: { type: "tool_call", toolId: "plan_step", params: { step: currentStep.index } },
            observation: response.output,
            timestamp: Date.now(),
            durationMs: Date.now() - stepStart,
            cost: response.cost,
          };
          this.state.steps.push(step);
          this.state.totalCost += response.cost;

          // Check if plan needs revision after this step
          if (this.plan.currentStepIndex < this.plan.steps.length && response.needsRevision) {
            await this.revisePlan(llmCall, context);
          }
        } else if (response.failed) {
          currentStep.status = "failed";
          currentStep.error = response.error;

          const step: AgentStep = {
            iteration: this.state.currentIteration,
            thought: `Step ${currentStep.index} failed: ${response.error}`,
            action: { type: "tool_call", toolId: "plan_step", params: { step: currentStep.index } },
            observation: `Error: ${response.error}`,
            timestamp: Date.now(),
            durationMs: Date.now() - stepStart,
            cost: response.cost,
          };
          this.state.steps.push(step);
          this.state.totalCost += response.cost;

          // Try to revise the plan to work around the failure
          if (this.plan.revisionCount < this.maxRevisions) {
            await this.revisePlan(llmCall, context);
          } else {
            this.state.status = "failed";
            this.state.error = `Plan failed at step ${currentStep.index}: ${response.error}. Max revisions (${this.maxRevisions}) exhausted.`;
            break;
          }
        }
      }

      // Check completion
      if (this.plan.currentStepIndex >= this.plan.steps.length) {
        this.plan.completed = true;
        this.state.status = "complete";

        // Generate final output from completed steps
        const completedOutputs = this.plan.steps
          .filter((s) => s.status === "completed" && s.output)
          .map((s) => s.output)
          .join("\n\n");

        this.state.output = completedOutputs || "Plan completed successfully.";
      } else if (this.state.status !== "failed") {
        this.state.status = "failed";
        this.state.error = `Agent reached maximum iterations (${maxIterations}) before completing the plan`;
      }
    } catch (error) {
      this.state.status = "failed";
      this.state.error = error instanceof Error ? error.message : String(error);
    }

    this.state.totalDurationMs = Date.now() - startTime;

    // Persist plan into state for re-entry support
    if (this.plan) {
      (this.state as unknown as { _plan: ExecutionPlan })._plan = this.plan;
    }

    return this.state;
  }

  /**
   * Returns the current plan (for inspection/debugging).
   */
  getPlan(): ExecutionPlan | null {
    return this.plan;
  }

  // ---------------------------------------------------------------------------
  // Planning
  // ---------------------------------------------------------------------------

  /**
   * Generates an execution plan from the goal.
   */
  private async generatePlan(llmCall: LLMCallFn, context: AgentContext): Promise<ExecutionPlan> {
    const planPrompt: AgentMessage = {
      role: "user",
      content: `Break down this goal into a numbered list of concrete steps. Each step should be a single action that can be accomplished with the available tools.

Goal: ${context.goal}

Available tools: ${context.tools.map((t) => `${t.id} (${t.description})`).join(", ")}

Respond with a JSON array of step descriptions:
["Step 1 description", "Step 2 description", ...]

Keep the plan concise (3-7 steps). Each step should be independently verifiable.`,
      timestamp: Date.now(),
    };

    this.state.messages.push(planPrompt);

    const response = await llmCall(this.state.messages, {
      temperature: 0.3, // Lower temperature for more structured planning
      maxTokens: this.config.maxTokens,
      model: this.config.model,
      tier: this.config.modelTier,
    });

    this.state.messages.push({
      role: "assistant",
      content: response.content,
      timestamp: Date.now(),
    });

    this.state.totalCost += response.cost;

    // Parse the plan from the response
    const steps = this.parsePlanSteps(response.content);

    return {
      goal: context.goal,
      steps,
      currentStepIndex: 0,
      revisionCount: 0,
      completed: false,
    };
  }

  /**
   * Revises the remaining plan steps based on execution results so far.
   */
  private async revisePlan(llmCall: LLMCallFn, context: AgentContext): Promise<void> {
    if (!this.plan) return;

    this.plan.revisionCount++;

    const completedSteps = this.plan.steps
      .filter((s) => s.status === "completed" || s.status === "failed")
      .map(
        (s) => `${s.index}. [${s.status}] ${s.description}${s.error ? ` (Error: ${s.error})` : ""}`
      )
      .join("\n");

    const revisionPrompt: AgentMessage = {
      role: "user",
      content: `The plan needs revision. Here's the progress so far:

Completed/Failed steps:
${completedSteps}

Original goal: ${context.goal}

Please provide revised remaining steps as a JSON array:
["Revised step description", ...]

Consider what has already been accomplished and any errors encountered.`,
      timestamp: Date.now(),
    };

    this.state.messages.push(revisionPrompt);

    const response = await llmCall(this.state.messages, {
      temperature: 0.3,
      maxTokens: this.config.maxTokens,
      model: this.config.model,
      tier: this.config.modelTier,
    });

    this.state.messages.push({
      role: "assistant",
      content: response.content,
      timestamp: Date.now(),
    });

    this.state.totalCost += response.cost;

    // Replace remaining steps with revised ones
    const revisedSteps = this.parsePlanSteps(response.content);
    const completedCount = this.plan.currentStepIndex;

    // Keep completed steps, replace the rest
    this.plan.steps = [
      ...this.plan.steps.slice(0, completedCount),
      ...revisedSteps.map((s, i) => ({ ...s, index: completedCount + i + 1 })),
    ];
  }

  // ---------------------------------------------------------------------------
  // Step Execution
  // ---------------------------------------------------------------------------

  /**
   * Executes a single plan step using tool calls.
   */
  private async executeStep(
    llmCall: LLMCallFn,
    toolExecutor: ToolExecutorFn,
    planStep: PlanStep,
    context: AgentContext
  ): Promise<{
    completed: boolean;
    failed: boolean;
    output: string;
    error?: string;
    cost: number;
    needsRevision: boolean;
  }> {
    const stepPrompt: AgentMessage = {
      role: "user",
      content: `Execute this step of the plan: "${planStep.description}"

Use the available tools to accomplish this step. When done, provide the result with FINAL_ANSWER: prefix.
If you cannot complete this step, explain why.`,
      timestamp: Date.now(),
    };

    this.state.messages.push(stepPrompt);

    // Use a mini ReAct loop for this step (max 3 iterations)
    let totalCost = 0;
    for (let i = 0; i < 3; i++) {
      const response = await llmCall(this.state.messages, {
        tools: context.tools.map((t) => ({
          type: "function" as const,
          function: { name: t.id, description: t.description, parameters: t.parameters },
        })),
        temperature: this.config.temperature ?? 0.7,
        maxTokens: this.config.maxTokens,
        model: this.config.model,
        tier: this.config.modelTier,
      });

      totalCost += response.cost;

      this.state.messages.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls?.map((tc, idx) => ({
          id: tc.id ?? `call_step_${planStep.index}_${i}_${idx}`,
          name: tc.name,
          arguments: tc.arguments,
        })),
        timestamp: Date.now(),
      });

      // Check for final answer
      if (response.content.includes("FINAL_ANSWER:")) {
        const answer = response.content.split("FINAL_ANSWER:")[1].trim();
        return {
          completed: true,
          failed: false,
          output: answer,
          cost: totalCost,
          needsRevision: false,
        };
      }

      // Execute tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        let stepFailed = false;
        let failError = "";

        for (let j = 0; j < response.toolCalls.length; j++) {
          const tc = response.toolCalls[j];
          const toolCallId = tc.id ?? `call_step_${planStep.index}_${i}_${j}`;

          if (stepFailed) {
            // Push synthetic error for skipped calls (maintains OpenAI API contract)
            this.state.messages.push({
              role: "tool",
              content: `Skipped: previous tool call in this batch failed.`,
              toolCallId,
              toolName: tc.name,
              timestamp: Date.now(),
            });
            continue;
          }

          const result = await toolExecutor(tc.name, tc.arguments);
          totalCost += result.cost ?? 0;

          this.state.messages.push({
            role: "tool",
            content: result.success
              ? typeof result.data === "string"
                ? result.data
                : JSON.stringify(result.data)
              : `Error: ${result.error}`,
            toolCallId,
            toolName: tc.name,
            timestamp: Date.now(),
          });

          // If tool failed, mark but continue to push results for remaining calls
          if (!result.success) {
            stepFailed = true;
            failError = result.error ?? "Tool execution failed";
          }
        }

        // If any tool in the batch failed, return failure
        if (stepFailed) {
          return {
            completed: false,
            failed: true,
            output: "",
            error: failError,
            cost: totalCost,
            needsRevision: true,
          };
        }
      } else if (!response.toolCalls || response.toolCalls.length === 0) {
        // No tool calls and no final answer — treat content as the output
        return {
          completed: true,
          failed: false,
          output: response.content,
          cost: totalCost,
          needsRevision: false,
        };
      }
    }

    // Exhausted mini-loop iterations — treat as incomplete so the outer
    // loop can trigger a plan revision rather than silently accepting a
    // placeholder as the step output.
    return {
      completed: false,
      failed: true,
      output: "",
      error: "Step did not produce a result within the allowed iterations",
      cost: totalCost,
      needsRevision: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds initial messages for the planning phase.
   */
  private buildPlanningMessages(context: AgentContext): AgentMessage[] {
    const messages: AgentMessage[] = [];
    const now = Date.now();

    let systemContent = context.config.systemPrompt;
    systemContent += `\n\nYou are operating in PLAN-EXECUTE mode. You will:
1. First create a plan to achieve the goal
2. Then execute each step of the plan
3. Revise the plan if needed based on results`;

    if (context.memories.length > 0) {
      systemContent += "\n\n## Relevant Context (from memory)\n";
      for (const mem of context.memories) {
        systemContent += `- [${mem.category}] ${mem.content}\n`;
      }
    }

    messages.push({ role: "system", content: systemContent, timestamp: now });

    return messages;
  }

  /**
   * Parses plan steps from LLM response (expects JSON array of strings).
   */
  private parsePlanSteps(content: string): PlanStep[] {
    // Try to extract JSON array from the response
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.map((desc: string, i: number) => ({
            index: i + 1,
            description: String(desc),
            status: "pending" as const,
          }));
        }
      } catch {
        // Fall through to line-based parsing
      }
    }

    // Fallback: parse numbered list
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+[\.\)]\s/.test(l))
      .map((l) => l.replace(/^\d+[\.\)]\s*/, ""));

    if (lines.length > 0) {
      return lines.map((desc, i) => ({
        index: i + 1,
        description: desc,
        status: "pending" as const,
      }));
    }

    // Last resort: treat the whole response as a single step
    return [{ index: 1, description: content.slice(0, 200), status: "pending" as const }];
  }
}
