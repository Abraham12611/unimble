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
        const action = await this.think(llmCall, context);

        // 2. Check if agent wants to give final answer
        if (action.type === "final_answer") {
          const step: AgentStep = {
            iteration: this.state.currentIteration,
            thought: "Providing final answer",
            action,
            timestamp: Date.now(),
            durationMs: Date.now() - stepStart,
            cost: 0,
          };
          this.state.steps.push(step);
          this.state.status = "complete";
          this.state.output = action.content;
          break;
        }

        // 3. Check if agent wants to ask a human
        if (action.type === "ask_human") {
          const step: AgentStep = {
            iteration: this.state.currentIteration,
            thought: "Requesting human input",
            action,
            timestamp: Date.now(),
            durationMs: Date.now() - stepStart,
            cost: 0,
          };
          this.state.steps.push(step);
          this.state.status = "complete";
          this.state.output = { needsHumanInput: true, question: action.question };
          break;
        }

        // 4. Act — execute the tool
        this.state.status = "acting";
        let result: ToolResult;

        if (action.type === "tool_call") {
          result = await toolExecutor(action.toolId, action.params);
        } else if (action.type === "delegate") {
          // Delegation is handled by returning the delegation request
          const step: AgentStep = {
            iteration: this.state.currentIteration,
            thought: `Delegating to agent: ${action.agentId}`,
            action,
            timestamp: Date.now(),
            durationMs: Date.now() - stepStart,
            cost: 0,
          };
          this.state.steps.push(step);
          this.state.status = "complete";
          this.state.output = { delegated: true, agentId: action.agentId, task: action.task };
          break;
        } else {
          result = { success: false, error: "Unknown action type", durationMs: 0 };
        }

        // 5. Observe — process the result
        this.state.status = "observing";
        const observation = this.formatObservation(result);

        // Record the step
        const step: AgentStep = {
          iteration: this.state.currentIteration,
          thought: this.extractThought(),
          action,
          observation,
          timestamp: Date.now(),
          durationMs: Date.now() - stepStart,
          cost: result.cost ?? 0,
        };
        this.state.steps.push(step);
        this.state.totalCost += step.cost;

        // Add tool result to messages
        this.state.messages.push({
          role: "tool",
          content: observation,
          toolCallId: `call_${this.state.currentIteration}`,
          toolName: action.type === "tool_call" ? action.toolId : undefined,
          timestamp: Date.now(),
        });
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
   * Returns the parsed action from the LLM response.
   */
  protected async think(llmCall: LLMCallFn, context: AgentContext): Promise<AgentAction> {
    const tools = context.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.id,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await llmCall(this.state.messages, {
      tools,
      temperature: this.config.temperature ?? 0.7,
      maxTokens: this.config.maxTokens,
      model: this.config.model,
      tier: this.config.modelTier,
    });

    // Parse the LLM response into an action
    return this.parseAction(response);
  }

  /**
   * Parses an LLM response into an AgentAction.
   */
  protected parseAction(response: LLMResponse): AgentAction {
    // If the LLM made a tool call
    if (response.toolCalls && response.toolCalls.length > 0) {
      const call = response.toolCalls[0];
      return {
        type: "tool_call",
        toolId: call.name,
        params: call.arguments,
      };
    }

    // If the response contains a final answer marker
    const content = response.content;

    // Check for structured action markers in the response
    if (content.includes("FINAL_ANSWER:")) {
      const answer = content.split("FINAL_ANSWER:")[1].trim();
      return { type: "final_answer", content: answer };
    }

    if (content.includes("ASK_HUMAN:")) {
      const question = content.split("ASK_HUMAN:")[1].trim();
      return { type: "ask_human", question };
    }

    if (content.includes("DELEGATE:")) {
      const parts = content.split("DELEGATE:")[1].trim().split("|");
      return { type: "delegate", agentId: parts[0]?.trim() ?? "", task: parts[1]?.trim() ?? "" };
    }

    // Default: treat the entire response as a final answer
    // (agent decided to respond without using tools)
    return { type: "final_answer", content };
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

  /**
   * Extracts the thought/reasoning from the last assistant message.
   */
  protected extractThought(): string {
    const lastAssistant = [...this.state.messages].reverse().find((m) => m.role === "assistant");
    return lastAssistant?.content ?? "";
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
