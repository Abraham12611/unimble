"use node";

/**
 * Agent Runtime — Agent Base Class
 *
 * The core agent execution engine. Implements the ReAct loop
 * (Reasoning + Acting) pattern where the agent:
 * 1. Thinks about what to do next
 * 2. Selects and calls a tool (or provides final answer)
 * 3. Observes the result
 * 4. Repeats until done or max iterations reached
 *
 * Agents run as Convex actions (Node.js runtime) and are
 * invoked by the workflow engine's "agent" step type.
 *
 * Phase 7.1.2 — Agent Base Class
 */

import type {
  AgentConfig,
  AgentContext,
  AgentExecutionState,
  AgentStep,
  AgentAction,
  AgentMessage,
  ToolResult,
} from "./types";

// ---------------------------------------------------------------------------
// Agent Base Class
// ---------------------------------------------------------------------------

/**
 * Base class for all agents. Implements the ReAct execution loop
 * and provides hooks for customization.
 *
 * Usage:
 * ```ts
 * const agent = new AgentBase(config);
 * const result = await agent.execute(context, toolExecutor);
 * ```
 */
export class AgentBase {
  protected config: AgentConfig;
  protected state: AgentExecutionState;

  constructor(config: AgentConfig) {
    this.config = config;
    this.state = this.createInitialState("");
  }

  /**
   * Executes the agent with the given context.
   * Returns the final execution state.
   */
  async execute(
    context: AgentContext,
    llmCall: LLMCallFn,
    toolExecutor: ToolExecutorFn
  ): Promise<AgentExecutionState> {
    const startTime = Date.now();
    this.state = context.previousState ?? this.createInitialState(context.goal);

    // Guard: if previousState is already terminal, return it immediately.
    // Prevents re-executing a completed/failed agent and avoids false failures
    // when currentIteration === maxIterations.
    if (this.state.status === "complete" || this.state.status === "failed") {
      return this.state;
    }

    this.state.status = "thinking";

    // Build initial messages
    if (this.state.messages.length === 0) {
      this.state.messages = this.buildInitialMessages(context);
    }

    const maxIterations = this.config.maxIterations ?? 10;

    try {
      while (this.state.currentIteration < maxIterations) {
        this.state.currentIteration++;
        const stepStart = Date.now();

        // 1. Think — ask the LLM what to do
        this.state.status = "thinking";
        const response = await this.thinkRaw(llmCall, context);

        // Track LLM cost
        const llmCost = response.cost ?? 0;

        // Append assistant message to history (critical for multi-turn).
        // Include toolCalls array when present — required by OpenAI-compatible
        // APIs to match subsequent tool role messages by ID.
        this.state.messages.push({
          role: "assistant",
          content: response.content,
          toolCalls: response.toolCalls?.map((tc, i) => ({
            id: tc.id ?? `call_${this.state.currentIteration}_${i}`,
            name: tc.name,
            arguments: tc.arguments,
          })),
          timestamp: Date.now(),
        });

        // 2. Parse the response into action(s)
        const actions = this.parseActions(response);

        // 3. Handle non-tool actions (final_answer, ask_human, delegate)
        if (actions.length === 1 && actions[0].type !== "tool_call") {
          const action = actions[0];

          if (action.type === "final_answer") {
            const step: AgentStep = {
              iteration: this.state.currentIteration,
              thought: response.content,
              action,
              timestamp: Date.now(),
              durationMs: Date.now() - stepStart,
              cost: llmCost,
            };
            this.state.steps.push(step);
            this.state.totalCost += llmCost;
            this.state.status = "complete";
            this.state.output = action.content;
            break;
          }

          if (action.type === "ask_human") {
            const step: AgentStep = {
              iteration: this.state.currentIteration,
              thought: response.content,
              action,
              timestamp: Date.now(),
              durationMs: Date.now() - stepStart,
              cost: llmCost,
            };
            this.state.steps.push(step);
            this.state.totalCost += llmCost;
            this.state.status = "complete";
            this.state.output = { needsHumanInput: true, question: action.question };
            break;
          }

          if (action.type === "delegate") {
            const step: AgentStep = {
              iteration: this.state.currentIteration,
              thought: `Delegating to agent: ${action.agentId}`,
              action,
              timestamp: Date.now(),
              durationMs: Date.now() - stepStart,
              cost: llmCost,
            };
            this.state.steps.push(step);
            this.state.totalCost += llmCost;
            this.state.status = "complete";
            this.state.output = { delegated: true, agentId: action.agentId, task: action.task };
            break;
          }
        }

        // 4. Execute tool calls (supports parallel tool calls)
        this.state.status = "acting";
        let totalToolCost = 0;
        const observations: string[] = [];

        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          if (action.type !== "tool_call") continue;

          const result = await toolExecutor(action.toolId, action.params);
          totalToolCost += result.cost ?? 0;

          const observation = this.formatObservation(result);
          observations.push(observation);

          // Use the LLM-assigned tool call ID if available, otherwise generate one
          const toolCallId =
            response.toolCalls?.[i]?.id ?? `call_${this.state.currentIteration}_${i}`;

          // Append tool result message with matching ID
          this.state.messages.push({
            role: "tool",
            content: observation,
            toolCallId,
            toolName: action.toolId,
            timestamp: Date.now(),
          });
        }

        // 5. Record the step
        this.state.status = "observing";
        const stepCost = llmCost + totalToolCost;
        const step: AgentStep = {
          iteration: this.state.currentIteration,
          thought: response.content,
          action:
            actions.length === 1
              ? actions[0]
              : { type: "tool_call", toolId: "parallel", params: { calls: actions } },
          observation: observations.join("\n---\n"),
          timestamp: Date.now(),
          durationMs: Date.now() - stepStart,
          cost: stepCost,
        };
        this.state.steps.push(step);
        this.state.totalCost += stepCost;
      }

      // Check if we hit max iterations without completing
      if (this.state.status !== "complete") {
        this.state.status = "failed";
        this.state.error = `Agent reached maximum iterations (${maxIterations}) without completing`;
      }
    } catch (error) {
      this.state.status = "failed";
      this.state.error = error instanceof Error ? error.message : String(error);
    }

    this.state.totalDurationMs = Date.now() - startTime;
    return this.state;
  }

  // ---------------------------------------------------------------------------
  // Core methods (can be overridden by subclasses)
  // ---------------------------------------------------------------------------

  /**
   * Asks the LLM to decide the next action.
   * Returns the raw LLM response for message history tracking.
   */
  protected async thinkRaw(llmCall: LLMCallFn, context: AgentContext): Promise<LLMResponse> {
    const tools = context.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.id,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    return await llmCall(this.state.messages, {
      tools,
      temperature: this.config.temperature ?? 0.7,
      maxTokens: this.config.maxTokens,
      model: this.config.model,
      tier: this.config.modelTier,
    });
  }

  /**
   * Parses an LLM response into one or more AgentActions.
   * Supports parallel tool calls (multiple actions in one response).
   */
  protected parseActions(response: LLMResponse): AgentAction[] {
    // If the LLM made tool calls, return ALL of them
    if (response.toolCalls && response.toolCalls.length > 0) {
      return response.toolCalls.map((call) => ({
        type: "tool_call" as const,
        toolId: call.name,
        params: call.arguments,
      }));
    }

    // Parse text-based actions
    const content = response.content;

    if (content.includes("FINAL_ANSWER:")) {
      const answer = content.split("FINAL_ANSWER:")[1].trim();
      return [{ type: "final_answer", content: answer }];
    }

    if (content.includes("ASK_HUMAN:")) {
      const question = content.split("ASK_HUMAN:")[1].trim();
      return [{ type: "ask_human", question }];
    }

    if (content.includes("DELEGATE:")) {
      const parts = content.split("DELEGATE:")[1].trim().split("|");
      return [{ type: "delegate", agentId: parts[0]?.trim() ?? "", task: parts[1]?.trim() ?? "" }];
    }

    // Default: treat the entire response as a final answer
    return [{ type: "final_answer", content }];
  }

  /**
   * Formats a tool result into a human-readable observation string.
   */
  protected formatObservation(result: ToolResult): string {
    if (!result.success) {
      return `Error: ${result.error ?? "Tool execution failed"}`;
    }

    if (typeof result.data === "string") {
      return result.data;
    }

    if (result.data === null || result.data === undefined) {
      return "Tool executed successfully (no output)";
    }

    return JSON.stringify(result.data, null, 2);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds the initial message array for the agent.
   */
  protected buildInitialMessages(context: AgentContext): AgentMessage[] {
    const messages: AgentMessage[] = [];
    const now = Date.now();

    // System prompt
    let systemContent = context.config.systemPrompt;

    // Inject memory context
    if (context.memories.length > 0) {
      systemContent += "\n\n## Relevant Context (from memory)\n";
      for (const mem of context.memories) {
        systemContent += `- [${mem.category}] ${mem.content}\n`;
      }
    }

    // Inject available tools description
    if (context.tools.length > 0) {
      systemContent += "\n\n## Available Tools\n";
      for (const tool of context.tools) {
        systemContent += `- **${tool.name}** (${tool.id}): ${tool.description}\n`;
      }
    }

    // Add action format instructions
    systemContent += `\n\n## Response Format
When you have enough information to answer, prefix your response with FINAL_ANSWER:
If you need to ask the user a question, prefix with ASK_HUMAN:
If you need to delegate to another agent, prefix with DELEGATE: agentId | task description
Otherwise, use the available tools to gather information.`;

    messages.push({ role: "system", content: systemContent, timestamp: now });

    // User goal
    let userContent = context.goal;
    if (context.input && Object.keys(context.input).length > 0) {
      userContent += `\n\nAdditional context:\n${JSON.stringify(context.input, null, 2)}`;
    }

    messages.push({ role: "user", content: userContent, timestamp: now });

    return messages;
  }

  /**
   * Creates the initial execution state.
   */
  protected createInitialState(goal: string): AgentExecutionState {
    return {
      agentId: this.config.id,
      status: "idle",
      goal,
      steps: [],
      currentIteration: 0,
      totalCost: 0,
      totalDurationMs: 0,
      messages: [],
    };
  }

  /**
   * Returns the current execution state (for persistence).
   */
  getState(): AgentExecutionState {
    return this.state;
  }
}

// ---------------------------------------------------------------------------
// Function types for dependency injection
// ---------------------------------------------------------------------------

/** Tool call format for LLM function calling. */
export interface LLMToolCall {
  /** LLM-assigned tool call ID (e.g., "call_abc123") */
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** LLM response with optional tool calls. */
export interface LLMResponse {
  content: string;
  toolCalls?: LLMToolCall[];
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  cost: number;
}

/** Options for LLM calls. */
export interface LLMCallOptions {
  tools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: unknown };
  }>;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  tier?: string;
}

/** Function type for making LLM calls (injected dependency). */
export type LLMCallFn = (messages: AgentMessage[], options: LLMCallOptions) => Promise<LLMResponse>;

/** Function type for executing tools (injected dependency). */
export type ToolExecutorFn = (
  toolId: string,
  params: Record<string, unknown>
) => Promise<ToolResult>;
