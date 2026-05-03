/**
 * Phase 7 — Agent Runtime: ReAct reasoning loop.
 *
 * Implements the Reason+Act pattern:
 *   Plan → Act (tool call) → Observe (tool result) → repeat until done or max iterations
 *
 * The loop runs inside a single agent execution and uses the LLM client and
 * tool registry that are injected at construction time.
 */

import type { AgentContext, AgentResult, Message, ToolCallRecord } from "./types";
import type { OpenRouterClient } from "./llm";
import type { ToolRegistry } from "./tools/index";
import type { ConversationMemory } from "./memory/short-term";
import type { AgentLogger } from "./agents/base";
import { silentLogger } from "./agents/base";
import { parseResponse, extractFinalAnswer } from "./parser";

// ---------------------------------------------------------------------------
// ReAct loop config
// ---------------------------------------------------------------------------

export interface ReactLoopConfig {
  model: string;
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  stopOnFinalAnswer?: boolean;
}

export interface ReactOptions {
  config: ReactLoopConfig;
  systemPrompt?: string;
  initialMessages?: Message[];
}

// ---------------------------------------------------------------------------
// ReActLoop
// ---------------------------------------------------------------------------

export class ReactLoop {
  private readonly logger: AgentLogger;

  constructor(
    private readonly llm: OpenRouterClient,
    private readonly tools: ToolRegistry,
    logger?: AgentLogger
  ) {
    this.logger = logger ?? silentLogger;
  }

  /**
   * Run the ReAct loop for a given goal.
   *
   * @param goal      High-level natural language goal
   * @param ctx       Agent execution context
   * @param opts      Loop configuration and optional initial messages
   * @param memory    Optional conversation memory to read/write
   */
  async run(
    goal: string,
    ctx: AgentContext,
    opts: ReactOptions,
    memory?: ConversationMemory
  ): Promise<AgentResult> {
    const {
      maxIterations = 10,
      temperature,
      maxTokens,
      stopOnFinalAnswer = true,
    } = opts.config;

    const toolCallRecords: ToolCallRecord[] = [];
    let totalTokens = 0;
    let totalCost = 0;

    // Build initial message list
    const messages: Message[] = [];

    if (opts.systemPrompt) {
      messages.push({ role: "system", content: opts.systemPrompt });
    }

    if (memory) {
      messages.push(...memory.toMessageList());
    } else if (opts.initialMessages) {
      messages.push(...opts.initialMessages);
    }

    messages.push({ role: "user", content: goal });

    if (memory) {
      await memory.add("user", goal);
    }

    const toolDefinitions = this.tools.discover();

    let iteration = 0;
    let finalAnswer: string | null = null;

    while (iteration < maxIterations) {
      iteration++;
      this.logger.log("react.iteration", { iteration, maxIterations });

      let completion;
      try {
        completion = await this.llm.complete({
          model: opts.config.model,
          messages,
          temperature,
          maxTokens,
          tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.logger.error("react.llm_error", err);
        return {
          status: "failed",
          output: null,
          reasoning: messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
          toolCalls: toolCallRecords,
          tokensUsed: totalTokens,
          estimatedCostUsd: totalCost,
          iterations: iteration,
          error,
        };
      }

      totalTokens += completion.usage.totalTokens;
      totalCost += completion.estimatedCostUsd;

      const assistantContent = completion.content;
      messages.push({ role: "assistant", content: assistantContent });
      if (memory) await memory.add("assistant", assistantContent);

      // Parse the response to decide next step
      const parsed = parseResponse(assistantContent, completion.toolCalls);

      // Check for Final Answer (ReAct terminal condition)
      if (parsed.finalAnswer || parsed.type === "react") {
        finalAnswer = parsed.finalAnswer ?? assistantContent;
        if (stopOnFinalAnswer) break;
      }

      // Handle tool calls
      const callsToRun = parsed.toolCalls ?? [];

      if (callsToRun.length === 0) {
        // No tool calls and no final answer — treat as final response
        finalAnswer = assistantContent;
        break;
      }

      // Execute each tool call and append results
      for (const call of callsToRun) {
        const tool = this.tools.get(call.name);
        const start = Date.now();

        let toolResultContent: string;
        let toolResult;

        if (!tool) {
          toolResultContent = `Error: tool "${call.name}" not found`;
          toolResult = {
            success: false as const,
            output: null,
            error: toolResultContent,
          };
        } else {
          toolResult = await tool.safeExecute(call.arguments, ctx);
          toolResultContent = toolResult.success
            ? JSON.stringify(toolResult.output)
            : `Error: ${toolResult.error}`;
        }

        const durationMs = Date.now() - start;
        toolCallRecords.push({
          toolName: call.name,
          params: call.arguments,
          result: toolResult,
          durationMs,
        });

        this.logger.log("react.tool_result", {
          tool: call.name,
          success: toolResult.success,
          durationMs,
        });

        // Append observation
        const observationMsg: Message = {
          role: "tool",
          content: `Observation: ${toolResultContent}`,
          toolCallId: call.id,
          name: call.name,
        };
        messages.push(observationMsg);
        if (memory) await memory.add("tool", observationMsg.content);
      }
    }

    const status =
      finalAnswer !== null
        ? "completed"
        : iteration >= maxIterations
          ? "max_iterations"
          : "completed";

    return {
      status,
      output: finalAnswer ?? messages.at(-1)?.content ?? "",
      reasoning: messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("\n\n"),
      toolCalls: toolCallRecords,
      tokensUsed: totalTokens,
      estimatedCostUsd: totalCost,
      iterations: iteration,
    };
  }
}
