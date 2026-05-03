/**
 * Phase 7 — Agent Runtime: Agent abstract base class.
 *
 * All specialist agents extend this class. It provides:
 *   - Tool registry attachment and safe dispatch
 *   - Memory accessor (short-term ConversationMemory)
 *   - Structured logging via a pluggable logger
 *   - Cost accumulation across tool calls
 */

import type { AgentContext, AgentResult, AgentStatus, ToolCallRecord, ToolResult } from "../types";
import type { ToolRegistry } from "../tools/index";
import type { ConversationMemory } from "../memory/short-term";

// ---------------------------------------------------------------------------
// Logger interface
// ---------------------------------------------------------------------------

export interface AgentLogger {
  log(event: string, data?: unknown): void;
  error(event: string, err: unknown): void;
}

export const silentLogger: AgentLogger = {
  log: () => {},
  error: () => {},
};

export function consoleLogger(prefix: string): AgentLogger {
  return {
    log: (event, data) => console.log(`[${prefix}] ${event}`, data ?? ""),
    error: (event, err) => console.error(`[${prefix}] ${event}`, err),
  };
}

// ---------------------------------------------------------------------------
// Agent abstract base class
// ---------------------------------------------------------------------------

export abstract class Agent {
  abstract readonly agentType: string;
  abstract readonly description: string;

  protected tools?: ToolRegistry;
  protected memory?: ConversationMemory;
  protected logger: AgentLogger = silentLogger;

  // Accumulated state for a single execute() call
  protected toolCallRecords: ToolCallRecord[] = [];
  protected totalTokensUsed = 0;
  protected totalCostUsd = 0;

  // ---------------------------------------------------------------------------
  // Fluent configuration
  // ---------------------------------------------------------------------------

  withTools(registry: ToolRegistry): this {
    this.tools = registry;
    return this;
  }

  withMemory(memory: ConversationMemory): this {
    this.memory = memory;
    return this;
  }

  withLogger(logger: AgentLogger): this {
    this.logger = logger;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Abstract method
  // ---------------------------------------------------------------------------

  /** Execute a goal in the given context. Must be implemented by subclasses. */
  abstract execute(goal: string, ctx: AgentContext): Promise<AgentResult>;

  // ---------------------------------------------------------------------------
  // Protected helpers
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a named tool with given params.
   * Records the call (name, params, result, duration) for the agent result.
   * Returns ToolResult — never throws, errors are surfaced inside the result.
   */
  protected async useTool(
    name: string,
    params: unknown,
    ctx: AgentContext
  ): Promise<ToolResult> {
    const tool = this.tools?.get(name);
    if (!tool) {
      const errResult: ToolResult = {
        success: false,
        output: null,
        error: `Tool "${name}" not found in registry`,
      };
      this.toolCallRecords.push({ toolName: name, params, result: errResult, durationMs: 0 });
      this.logger.log("tool.missing", { name });
      return errResult;
    }

    const start = Date.now();
    const result = await tool.safeExecute(params, ctx);
    const durationMs = Date.now() - start;

    this.toolCallRecords.push({ toolName: name, params, result, durationMs });
    this.logger.log(result.success ? "tool.success" : "tool.error", {
      name,
      durationMs,
      error: result.error,
    });

    return result;
  }

  /**
   * Build a base AgentResult from accumulated state.
   * Subclasses use this to produce their final return value.
   */
  protected buildResult(
    status: AgentStatus,
    output: unknown,
    extra: Partial<Pick<AgentResult, "reasoning" | "iterations" | "error">> = {}
  ): AgentResult {
    return {
      status,
      output,
      toolCalls: [...this.toolCallRecords],
      tokensUsed: this.totalTokensUsed,
      estimatedCostUsd: this.totalCostUsd,
      ...extra,
    };
  }

  /** Reset accumulated state. Call at the start of execute() for safety. */
  protected resetState(): void {
    this.toolCallRecords = [];
    this.totalTokensUsed = 0;
    this.totalCostUsd = 0;
  }

  /** Accumulate LLM usage for cost tracking. */
  protected trackUsage(tokensUsed: number, costUsd: number): void {
    this.totalTokensUsed += tokensUsed;
    this.totalCostUsd += costUsd;
  }
}
