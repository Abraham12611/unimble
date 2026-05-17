"use node";

/**
 * Agent Runtime — Agent Logging
 *
 * Structured logging for agent execution:
 * - Decision logging (what the agent decided and why)
 * - Tool call logging (inputs, outputs, duration)
 * - Memory access logging (reads, writes, relevance scores)
 * - Performance logging (latency, token usage, cost)
 * - Error logging with context
 *
 * Logs are structured JSON for easy querying and can be
 * stored in Convex for the execution detail view, or sent
 * to external logging services.
 *
 * Phase 7.7.2 — Agent Logging
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Log levels. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Categories of agent log entries. */
export type LogCategory =
  | "decision"
  | "llm_call"
  | "tool_call"
  | "memory"
  | "planning"
  | "delegation"
  | "review"
  | "escalation"
  | "performance"
  | "lifecycle";

/** A structured log entry. */
export interface AgentLogEntry {
  /** Timestamp (ISO string) */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Log category */
  category: LogCategory;
  /** Agent ID that produced this log */
  agentId: string;
  /** Execution ID (for correlation) */
  executionId?: string;
  /** Human-readable message */
  message: string;
  /** Structured data payload */
  data?: Record<string, unknown>;
  /** Duration in ms (for timed operations) */
  durationMs?: number;
  /** Cost (for LLM calls) */
  cost?: number;
  /** Error details */
  error?: { message: string; stack?: string };
}

/** Configuration for the agent logger. */
export interface AgentLoggerConfig {
  /** Agent ID */
  agentId: string;
  /** Execution ID */
  executionId?: string;
  /** Minimum log level to capture */
  minLevel?: LogLevel;
  /** Maximum number of entries to keep in memory */
  maxEntries?: number;
  /** Whether to also console.log (for development) */
  consoleOutput?: boolean;
  /** External log sink (called for each entry) */
  sink?: (entry: AgentLogEntry) => void;
}

// ---------------------------------------------------------------------------
// Agent Logger
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured logger for agent execution.
 *
 * Captures all agent decisions, tool calls, memory accesses,
 * and performance metrics in a queryable format.
 *
 * Usage:
 * ```ts
 * const logger = new AgentLogger({ agentId: "content_writer", executionId: "exec_123" });
 * logger.decision("Selected tool: perplexity_search", { reason: "Need current data" });
 * logger.toolCall("perplexity_search", { query: "React hooks" }, result, 1200);
 * const entries = logger.getEntries();
 * ```
 */
export class AgentLogger {
  private config: Required<AgentLoggerConfig>;
  private entries: AgentLogEntry[] = [];

  constructor(config: AgentLoggerConfig) {
    this.config = {
      agentId: config.agentId,
      executionId: config.executionId ?? "",
      minLevel: config.minLevel ?? "info",
      maxEntries: config.maxEntries ?? 1000,
      consoleOutput: config.consoleOutput ?? false,
      sink: config.sink ?? (() => {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Category-specific logging methods
  // ---------------------------------------------------------------------------

  /**
   * Logs an agent decision (thought, action selection).
   */
  decision(message: string, data?: Record<string, unknown>): void {
    this.log("info", "decision", message, data);
  }

  /**
   * Logs an LLM call with token/cost details.
   */
  llmCall(
    model: string,
    promptTokens: number,
    completionTokens: number,
    cost: number,
    durationMs: number,
    data?: Record<string, unknown>
  ): void {
    this.log("info", "llm_call", `LLM call to ${model}`, {
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost,
      durationMs,
      ...data,
    });
  }

  /**
   * Logs a tool call with inputs, outputs, and timing.
   */
  toolCall(
    toolId: string,
    inputs: Record<string, unknown>,
    success: boolean,
    durationMs: number,
    data?: Record<string, unknown>
  ): void {
    const level = success ? "info" : "warn";
    this.log(level, "tool_call", `Tool call: ${toolId} (${success ? "success" : "failed"})`, {
      toolId,
      inputs,
      success,
      durationMs,
      ...data,
    });
  }

  /**
   * Logs a memory access (read or write).
   */
  memoryAccess(
    operation: "read" | "write" | "search",
    category: string,
    count: number,
    data?: Record<string, unknown>
  ): void {
    this.log("debug", "memory", `Memory ${operation}: ${count} entries (${category})`, {
      operation,
      category,
      count,
      ...data,
    });
  }

  /**
   * Logs a planning event (plan creation, revision).
   */
  planning(message: string, data?: Record<string, unknown>): void {
    this.log("info", "planning", message, data);
  }

  /**
   * Logs a delegation event (task sent to sub-agent).
   */
  delegation(
    targetAgentId: string,
    task: string,
    status: "sent" | "completed" | "failed" | "timed_out",
    data?: Record<string, unknown>
  ): void {
    const level = status === "failed" || status === "timed_out" ? "warn" : "info";
    this.log(level, "delegation", `Delegation to ${targetAgentId}: ${status}`, {
      targetAgentId,
      task,
      status,
      ...data,
    });
  }

  /**
   * Logs a review event.
   */
  review(verdict: string, score: number, issueCount: number, data?: Record<string, unknown>): void {
    this.log("info", "review", `Review: ${verdict} (score: ${score}, issues: ${issueCount})`, {
      verdict,
      score,
      issueCount,
      ...data,
    });
  }

  /**
   * Logs an escalation event.
   */
  escalation(reason: string, requiresHuman: boolean, data?: Record<string, unknown>): void {
    this.log("warn", "escalation", `Escalation: ${reason}`, {
      reason,
      requiresHuman,
      ...data,
    });
  }

  /**
   * Logs a performance metric.
   */
  performance(metric: string, value: number, unit: string, data?: Record<string, unknown>): void {
    this.log("debug", "performance", `${metric}: ${value}${unit}`, {
      metric,
      value,
      unit,
      ...data,
    });
  }

  /**
   * Logs a lifecycle event (start, complete, fail).
   */
  lifecycle(
    event: "start" | "complete" | "fail" | "resume",
    message: string,
    data?: Record<string, unknown>
  ): void {
    const level = event === "fail" ? "error" : "info";
    this.log(level, "lifecycle", `[${event}] ${message}`, { event, ...data });
  }

  // ---------------------------------------------------------------------------
  // Generic logging
  // ---------------------------------------------------------------------------

  /**
   * Logs a debug message.
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", "lifecycle", message, data);
  }

  /**
   * Logs an info message.
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", "lifecycle", message, data);
  }

  /**
   * Logs a warning.
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", "lifecycle", message, data);
  }

  /**
   * Logs an error with optional stack trace.
   */
  logError(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log("error", "lifecycle", message, data, error);
  }

  // ---------------------------------------------------------------------------
  // Entry management
  // ---------------------------------------------------------------------------

  /**
   * Returns all log entries.
   */
  getEntries(): AgentLogEntry[] {
    return [...this.entries];
  }

  /**
   * Returns entries filtered by category.
   */
  getEntriesByCategory(category: LogCategory): AgentLogEntry[] {
    return this.entries.filter((e) => e.category === category);
  }

  /**
   * Returns entries filtered by level.
   */
  getEntriesByLevel(level: LogLevel): AgentLogEntry[] {
    const minOrder = LEVEL_ORDER[level];
    return this.entries.filter((e) => LEVEL_ORDER[e.level] >= minOrder);
  }

  /**
   * Returns a summary of the log (counts by category and level).
   */
  getSummary(): {
    totalEntries: number;
    byCategory: Record<string, number>;
    byLevel: Record<string, number>;
    totalCost: number;
    totalDurationMs: number;
    errors: number;
  } {
    const byCategory: Record<string, number> = {};
    const byLevel: Record<string, number> = {};
    let totalCost = 0;
    let totalDurationMs = 0;
    let errors = 0;

    for (const entry of this.entries) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
      byLevel[entry.level] = (byLevel[entry.level] ?? 0) + 1;
      if (entry.cost) totalCost += entry.cost;
      if (entry.durationMs) totalDurationMs += entry.durationMs;
      if (entry.level === "error") errors++;
    }

    return {
      totalEntries: this.entries.length,
      byCategory,
      byLevel,
      totalCost,
      totalDurationMs,
      errors,
    };
  }

  /**
   * Clears all entries.
   */
  clear(): void {
    this.entries = [];
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    // Check minimum level
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.config.minLevel]) {
      return;
    }

    const entry: AgentLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      agentId: this.config.agentId,
      executionId: this.config.executionId || undefined,
      message,
      data,
      durationMs: typeof data?.durationMs === "number" ? data.durationMs : undefined,
      cost: typeof data?.cost === "number" ? data.cost : undefined,
      error: error ? { message: error.message, stack: error.stack } : undefined,
    };

    // Add to entries (with cap)
    this.entries.push(entry);
    if (this.entries.length > this.config.maxEntries) {
      this.entries.shift();
    }

    // Console output (development)
    if (this.config.consoleOutput) {
      this.consoleLog(entry);
    }

    // External sink
    try {
      this.config.sink(entry);
    } catch {
      // Silently swallow sink errors — logging must never crash agent execution
    }
  }

  private consoleLog(entry: AgentLogEntry): void {
    const prefix = `[${entry.level.toUpperCase()}][${entry.category}][${entry.agentId}]`;
    const msg = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case "debug":
        console.debug(msg, entry.data ?? "");
        break;
      case "info":
        console.info(msg, entry.data ?? "");
        break;
      case "warn":
        console.warn(msg, entry.data ?? "");
        break;
      case "error":
        console.error(msg, entry.error ?? entry.data ?? "");
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an agent logger with sensible defaults.
 */
export function createAgentLogger(
  agentId: string,
  executionId?: string,
  options?: {
    minLevel?: LogLevel;
    consoleOutput?: boolean;
    sink?: (entry: AgentLogEntry) => void;
  }
): AgentLogger {
  return new AgentLogger({
    agentId,
    executionId,
    minLevel: options?.minLevel ?? "info",
    consoleOutput: options?.consoleOutput ?? false,
    sink: options?.sink,
  });
}
