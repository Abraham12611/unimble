"use node";

/**
 * Agent Runtime — LangSmith Tracing Integration
 *
 * Lightweight LangSmith client for agent observability:
 * - Trace creation for agent executions
 * - Span tracking for individual steps (LLM calls, tool calls)
 * - Metadata capture (model, tokens, cost, duration)
 * - Error tracking with stack traces
 * - Cost aggregation per trace
 *
 * This is a direct HTTP integration with the LangSmith API —
 * we don't use the full LangChain SDK to keep the dependency
 * footprint minimal in the Convex serverless environment.
 *
 * Configuration:
 * - LANGCHAIN_API_KEY: LangSmith API key
 * - LANGCHAIN_TRACING_V2: "true" to enable tracing
 * - LANGCHAIN_PROJECT: Project name (default: "unimble")
 * - LANGCHAIN_ENDPOINT: API endpoint (default: "https://api.smith.langchain.com")
 *
 * Phase 7.7.1 — LangSmith Integration
 */

import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Run types supported by LangSmith. */
export type RunType = "chain" | "llm" | "tool" | "retriever" | "embedding";

/** Status of a run. */
export type RunStatus = "pending" | "success" | "error";

/** A trace run to send to LangSmith. */
export interface TraceRun {
  /** Unique run ID */
  id: string;
  /** Parent run ID (for nesting) */
  parentRunId?: string;
  /** Run name (e.g., agent name, tool name) */
  name: string;
  /** Run type */
  runType: RunType;
  /** Start time (ISO string) */
  startTime: string;
  /** End time (ISO string, set on completion) */
  endTime?: string;
  /** Input data */
  inputs: Record<string, unknown>;
  /** Output data (set on completion) */
  outputs?: Record<string, unknown>;
  /** Error message (set on failure) */
  error?: string;
  /** Additional metadata */
  extra?: Record<string, unknown>;
  /** Tags for filtering */
  tags?: string[];
  /** Status */
  status: RunStatus;
}

/** Configuration for the tracer. */
export interface TracerConfig {
  /** LangSmith API key */
  apiKey?: string;
  /** Whether tracing is enabled */
  enabled?: boolean;
  /** Project name */
  project?: string;
  /** API endpoint */
  endpoint?: string;
  /** Additional default tags */
  defaultTags?: string[];
  /** Whether to batch sends (reduces API calls) */
  batchMode?: boolean;
  /** Batch flush interval in ms (default: 1000) */
  batchIntervalMs?: number;
}

/** Span metadata for LLM calls. */
export interface LLMSpanMetadata {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  temperature?: number;
  maxTokens?: number;
}

/** Span metadata for tool calls. */
export interface ToolSpanMetadata {
  toolId: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Tracer Class
// ---------------------------------------------------------------------------

/**
 * LangSmith tracer for agent observability.
 *
 * Usage:
 * ```ts
 * const tracer = new AgentTracer();
 * const traceId = tracer.startTrace("ContentOperator", { goal: "Write blog" });
 * const spanId = tracer.startSpan(traceId, "llm_call", "llm", { model: "claude" });
 * tracer.endSpan(spanId, { content: "..." });
 * tracer.endTrace(traceId, { output: "Blog post" });
 * await tracer.flush();
 * ```
 */
export class AgentTracer {
  private config: Required<TracerConfig>;
  private runs: Map<string, TraceRun> = new Map();
  private pendingBatch: TraceRun[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config?: TracerConfig) {
    this.config = {
      apiKey: config?.apiKey ?? process.env.LANGCHAIN_API_KEY ?? "",
      enabled: config?.enabled ?? process.env.LANGCHAIN_TRACING_V2 === "true",
      project: config?.project ?? process.env.LANGCHAIN_PROJECT ?? "unimble",
      endpoint:
        config?.endpoint ?? process.env.LANGCHAIN_ENDPOINT ?? "https://api.smith.langchain.com",
      defaultTags: config?.defaultTags ?? [],
      batchMode: config?.batchMode ?? true,
      batchIntervalMs: config?.batchIntervalMs ?? 1000,
    };
  }

  /**
   * Whether tracing is enabled and configured.
   */
  isEnabled(): boolean {
    return this.config.enabled && this.config.apiKey.length > 0;
  }

  /**
   * Starts a new trace (top-level run).
   * Returns the trace ID.
   */
  startTrace(
    name: string,
    inputs: Record<string, unknown>,
    options?: {
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): string {
    const id = randomUUID();
    const run: TraceRun = {
      id,
      name,
      runType: "chain",
      startTime: new Date().toISOString(),
      inputs,
      extra: {
        ...options?.metadata,
        project: this.config.project,
      },
      tags: [...this.config.defaultTags, ...(options?.tags ?? [])],
      status: "pending",
    };

    this.runs.set(id, run);
    this.enqueueRun(run);
    return id;
  }

  /**
   * Starts a child span within a trace.
   * Returns the span ID.
   */
  startSpan(
    parentId: string,
    name: string,
    runType: RunType,
    inputs: Record<string, unknown>,
    options?: {
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): string {
    const id = randomUUID();
    const run: TraceRun = {
      id,
      parentRunId: parentId,
      name,
      runType,
      startTime: new Date().toISOString(),
      inputs,
      extra: options?.metadata,
      tags: options?.tags,
      status: "pending",
    };

    this.runs.set(id, run);
    this.enqueueRun(run);
    return id;
  }

  /**
   * Ends a span or trace with success.
   */
  endSpan(id: string, outputs: Record<string, unknown>, metadata?: Record<string, unknown>): void {
    const run = this.runs.get(id);
    if (!run) return;

    run.endTime = new Date().toISOString();
    run.outputs = outputs;
    run.status = "success";
    if (metadata) {
      run.extra = { ...run.extra, ...metadata };
    }

    this.enqueueUpdate(run);
  }

  /**
   * Ends a span or trace with an error.
   */
  endSpanWithError(id: string, error: string, metadata?: Record<string, unknown>): void {
    const run = this.runs.get(id);
    if (!run) return;

    run.endTime = new Date().toISOString();
    run.error = error;
    run.status = "error";
    if (metadata) {
      run.extra = { ...run.extra, ...metadata };
    }

    this.enqueueUpdate(run);
  }

  /**
   * Convenience: ends a trace (alias for endSpan at the top level).
   */
  endTrace(id: string, outputs: Record<string, unknown>, metadata?: Record<string, unknown>): void {
    this.endSpan(id, outputs, metadata);
  }

  /**
   * Convenience: ends a trace with error.
   */
  endTraceWithError(id: string, error: string, metadata?: Record<string, unknown>): void {
    this.endSpanWithError(id, error, metadata);
  }

  /**
   * Records an LLM call span (convenience method).
   */
  recordLLMCall(
    parentId: string,
    name: string,
    inputs: { messages: unknown[]; model: string; temperature?: number },
    outputs: { content: string; toolCalls?: unknown[] },
    meta: LLMSpanMetadata
  ): string {
    const spanId = this.startSpan(parentId, name, "llm", {
      messages: inputs.messages,
      model: inputs.model,
      temperature: inputs.temperature,
    });

    this.endSpan(
      spanId,
      {
        content: outputs.content,
        toolCalls: outputs.toolCalls,
      },
      {
        model: meta.model,
        prompt_tokens: meta.promptTokens,
        completion_tokens: meta.completionTokens,
        total_tokens: meta.totalTokens,
        cost: meta.cost,
        temperature: meta.temperature,
        max_tokens: meta.maxTokens,
      }
    );

    return spanId;
  }

  /**
   * Records a tool call span (convenience method).
   */
  recordToolCall(
    parentId: string,
    name: string,
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown>,
    meta: ToolSpanMetadata
  ): string {
    const spanId = this.startSpan(parentId, name, "tool", inputs);

    if (meta.success) {
      this.endSpan(spanId, outputs, {
        tool_id: meta.toolId,
        duration_ms: meta.durationMs,
      });
    } else {
      this.endSpanWithError(spanId, meta.error ?? "Tool execution failed", {
        tool_id: meta.toolId,
        duration_ms: meta.durationMs,
      });
    }

    return spanId;
  }

  /**
   * Flushes all pending runs to LangSmith.
   * Call this at the end of an agent execution.
   */
  async flush(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.pendingBatch.length === 0) return;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = [...this.pendingBatch];
    this.pendingBatch = [];

    await this.sendBatch(batch);
  }

  /**
   * Returns all tracked runs (for testing/inspection).
   */
  getRuns(): TraceRun[] {
    return [...this.runs.values()];
  }

  /**
   * Clears all tracked runs (for testing).
   */
  clear(): void {
    this.runs.clear();
    this.pendingBatch = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private enqueueRun(run: TraceRun): void {
    if (!this.isEnabled()) return;
    this.pendingBatch.push({ ...run });
    this.scheduleFlush();
  }

  private enqueueUpdate(run: TraceRun): void {
    if (!this.isEnabled()) return;
    this.pendingBatch.push({ ...run });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (!this.config.batchMode) {
      // Immediate mode — flush on next tick
      void this.flush();
      return;
    }

    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.config.batchIntervalMs);
  }

  /**
   * Sends a batch of runs to the LangSmith API.
   *
   * Uses a single request with both `post` (creates) and `patch` (updates)
   * in one body. This ensures LangSmith processes creates before patches
   * atomically, avoiding the race condition where a PATCH arrives before
   * its corresponding POST.
   */
  private async sendBatch(runs: TraceRun[]): Promise<void> {
    if (runs.length === 0) return;

    // Separate creates (no endTime) from updates (has endTime)
    const creates = runs.filter((r) => !r.endTime);
    const updates = runs.filter((r) => r.endTime);

    const postPayload = creates.map((run) => ({
      id: run.id,
      name: run.name,
      run_type: run.runType,
      start_time: run.startTime,
      inputs: run.inputs,
      extra: run.extra,
      tags: run.tags,
      parent_run_id: run.parentRunId,
      session_name: this.config.project,
    }));

    const patchPayload = updates.map((run) => ({
      id: run.id,
      end_time: run.endTime,
      outputs: run.outputs,
      error: run.error,
      extra: run.extra,
    }));

    // Send as a single atomic request — LangSmith processes post[] before patch[]
    const body: Record<string, unknown> = {};
    if (postPayload.length > 0) body.post = postPayload;
    if (patchPayload.length > 0) body.patch = patchPayload;

    try {
      await fetch(`${this.config.endpoint}/runs/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch {
      // Silently fail — tracing should never break agent execution
    }

    // Evict completed runs from the Map to prevent unbounded memory growth.
    // Only runs that have been flushed with an endTime are safe to evict.
    for (const run of updates) {
      this.runs.delete(run.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a tracer instance from environment variables.
 * Returns a no-op tracer if tracing is disabled.
 */
export function createTracer(config?: TracerConfig): AgentTracer {
  return new AgentTracer(config);
}
