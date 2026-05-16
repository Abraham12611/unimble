"use node";

/**
 * Agent Runtime — Tool Registry & Executor
 *
 * Central registry for all tools available to agents. Provides:
 * - Tool registration and discovery
 * - Tool execution with timeout, retry, and logging
 * - Category-based filtering and wildcard resolution
 * - Composio tool bridge for 850+ external integrations
 * - Parallel tool execution support
 *
 * Phase 7.3 — Tool System (7.3.1 Registry, 7.3.2 Definition,
 * 7.3.5 Execution)
 */

import type { ToolDefinition, ToolResult, ToolCategory } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Handler function that executes a tool. */
export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolResult>;

/** Context passed to tool handlers during execution. */
export interface ToolExecutionContext {
  /** Workspace ID for scoping */
  workspaceId?: string;
  /** Operator ID (if tool is called by an operator) */
  operatorId?: string;
  /** Execution ID (for tracing) */
  executionId?: string;
  /** Abort signal for timeout support */
  signal?: AbortSignal;
}

/** Options for tool execution. */
export interface ToolExecutionOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Number of retries on transient failure (default: 1) */
  maxRetries?: number;
  /** Whether to cache the result (default: false) */
  cache?: boolean;
  /** Cache TTL in milliseconds (default: 60000) */
  cacheTtlMs?: number;
}

/** A registered tool with its handler. */
interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  options?: ToolExecutionOptions;
}

/** Result of executing multiple tools in parallel. */
export interface ParallelToolResults {
  results: Array<{ toolId: string; result: ToolResult }>;
  totalDurationMs: number;
  totalCost: number;
}

// ---------------------------------------------------------------------------
// Tool Registry
// ---------------------------------------------------------------------------

/**
 * Central registry for all agent tools.
 *
 * Tools are registered with a definition (schema for the LLM) and
 * a handler (function that executes the tool). The registry supports:
 * - Registration and deregistration
 * - Lookup by ID, category, or wildcard
 * - Execution with timeout, retry, and error handling
 * - Parallel execution of multiple tools
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private cache: Map<string, { result: ToolResult; expiresAt: number }> = new Map();

  /**
   * Registers a tool with its handler.
   * Throws if a tool with the same ID is already registered.
   */
  register(definition: ToolDefinition, handler: ToolHandler, options?: ToolExecutionOptions): void {
    if (this.tools.has(definition.id)) {
      throw new Error(`Tool "${definition.id}" is already registered`);
    }
    this.tools.set(definition.id, { definition, handler, options });
  }

  /**
   * Deregisters a tool by ID.
   * Returns true if the tool was found and removed.
   */
  deregister(toolId: string): boolean {
    return this.tools.delete(toolId);
  }

  /**
   * Checks if a tool is registered.
   */
  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Gets a tool definition by ID.
   */
  getDefinition(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId)?.definition;
  }

  /**
   * Gets all registered tool definitions.
   */
  getAllDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  /**
   * Gets tool definitions filtered by category.
   */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    return [...this.tools.values()]
      .filter((t) => t.definition.category === category)
      .map((t) => t.definition);
  }

  /**
   * Resolves tool IDs (with wildcard support) to definitions.
   * - "*" → all tools
   * - "category.*" → all tools in that category prefix
   * - "exact.id" → specific tool
   */
  resolve(toolIds: string[]): ToolDefinition[] {
    if (toolIds.includes("*")) {
      return this.getAllDefinitions();
    }

    const resolved: ToolDefinition[] = [];
    const seen = new Set<string>();

    for (const id of toolIds) {
      if (id.endsWith(".*")) {
        // Category wildcard: "memory.*" matches "memory.read", "memory.write"
        const prefix = id.slice(0, -2);
        for (const [toolId, tool] of this.tools) {
          if (toolId.startsWith(prefix + ".") && !seen.has(toolId)) {
            resolved.push(tool.definition);
            seen.add(toolId);
          }
        }
      } else {
        const tool = this.tools.get(id);
        if (tool && !seen.has(id)) {
          resolved.push(tool.definition);
          seen.add(id);
        }
      }
    }

    return resolved;
  }

  /**
   * Executes a single tool by ID with the given parameters.
   * Handles timeout, retry, and error wrapping.
   */
  async execute(
    toolId: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext = {},
    options?: ToolExecutionOptions
  ): Promise<ToolResult> {
    const registered = this.tools.get(toolId);
    if (!registered) {
      return {
        success: false,
        error: `Tool "${toolId}" is not registered`,
        durationMs: 0,
      };
    }

    const opts = { ...registered.options, ...options };
    const timeoutMs = opts?.timeoutMs ?? 30000;
    const maxRetries = opts?.maxRetries ?? 1;

    // Check cache
    if (opts?.cache) {
      const cacheKey = this.buildCacheKey(toolId, params);
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { ...cached.result, durationMs: 0 };
      }
    }

    // Execute with retry
    let lastError: string | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.executeOnce(registered, params, context, timeoutMs);

      if (result.success) {
        // Cache successful results if caching is enabled
        if (opts?.cache) {
          const cacheKey = this.buildCacheKey(toolId, params);
          this.cache.set(cacheKey, {
            result,
            expiresAt: Date.now() + (opts.cacheTtlMs ?? 60000),
          });
        }
        return result;
      }

      lastError = result.error;

      // Only retry on transient errors (not validation/auth failures)
      if (!this.isRetryable(result.error) || attempt === maxRetries) {
        return result;
      }
    }

    return {
      success: false,
      error: lastError ?? "Max retries exceeded",
      durationMs: 0,
    };
  }

  /**
   * Executes multiple tools in parallel.
   * Returns all results (including failures) without short-circuiting.
   */
  async executeParallel(
    calls: Array<{ toolId: string; params: Record<string, unknown> }>,
    context: ToolExecutionContext = {},
    options?: ToolExecutionOptions
  ): Promise<ParallelToolResults> {
    const startTime = Date.now();

    const promises = calls.map(async (call) => {
      const result = await this.execute(call.toolId, call.params, context, options);
      return { toolId: call.toolId, result };
    });

    const results = await Promise.all(promises);
    const totalCost = results.reduce((sum, r) => sum + (r.result.cost ?? 0), 0);

    return {
      results,
      totalDurationMs: Date.now() - startTime,
      totalCost,
    };
  }

  /**
   * Returns the number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clears the result cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async executeOnce(
    registered: RegisteredTool,
    params: Record<string, unknown>,
    context: ToolExecutionContext,
    timeoutMs: number
  ): Promise<ToolResult> {
    const startTime = Date.now();

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await registered.handler(params, {
        ...context,
        signal: controller.signal,
      });
      return {
        ...result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      if (controller.signal.aborted) {
        return {
          success: false,
          error: `Tool "${registered.definition.id}" timed out after ${timeoutMs}ms`,
          durationMs,
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isRetryable(error?: string): boolean {
    if (!error) return false;
    const retryablePatterns = [
      "timeout",
      "rate limit",
      "429",
      "500",
      "502",
      "503",
      "504",
      "ECONNRESET",
      "ETIMEDOUT",
    ];
    const lower = error.toLowerCase();
    return retryablePatterns.some((p) => lower.includes(p.toLowerCase()));
  }

  private buildCacheKey(toolId: string, params: Record<string, unknown>): string {
    // Sort keys for order-independent cache hits
    const sorted = Object.keys(params)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = params[k];
        return acc;
      }, {});
    return `${toolId}:${JSON.stringify(sorted)}`;
  }
}

// ---------------------------------------------------------------------------
// Singleton registry instance
// ---------------------------------------------------------------------------

let _registry: ToolRegistry | null = null;
let _registryInitPromise: Promise<void> | null = null;

/**
 * Returns the global tool registry singleton.
 * Lazily initializes with built-in tools on first access.
 * If initialization fails, resets state so the next call retries.
 */
export async function getToolRegistry(): Promise<ToolRegistry> {
  if (!_registry) {
    _registry = new ToolRegistry();
    _registryInitPromise = registerBuiltInTools(_registry).catch((err) => {
      // Reset so the next caller retries initialization
      _registry = null;
      _registryInitPromise = null;
      throw err;
    });
  }
  if (_registryInitPromise) {
    await _registryInitPromise;
    _registryInitPromise = null;
  }
  return _registry;
}

/**
 * Creates a fresh tool registry (useful for testing).
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

// ---------------------------------------------------------------------------
// Built-in tool registration (7.3.3)
// ---------------------------------------------------------------------------

/**
 * Registers all built-in tools with their handlers.
 */
async function registerBuiltInTools(registry: ToolRegistry): Promise<void> {
  // Dynamic import to avoid require() which ESLint forbids
  const { BUILT_IN_TOOL_HANDLERS } = await import("./builtInTools");

  for (const entry of Object.values(BUILT_IN_TOOL_HANDLERS)) {
    const { definition, handler, options } = entry as {
      definition: ToolDefinition;
      handler: ToolHandler;
      options?: ToolExecutionOptions;
    };
    registry.register(definition, handler, options);
  }
}

// ---------------------------------------------------------------------------
// Tool Executor Factory (7.3.5)
// ---------------------------------------------------------------------------

/**
 * Creates a ToolExecutorFn compatible with the agent runtime.
 *
 * This is the bridge between the agent's `toolExecutor` dependency
 * and the tool registry. The agent calls `toolExecutor(toolId, params)`
 * and this function routes to the correct handler.
 *
 * Usage:
 * ```ts
 * const toolExecutor = await createToolExecutor({ workspaceId, operatorId });
 * const result = await toolExecutor("perplexity.search", { query: "AI" });
 * ```
 */
export async function createToolExecutor(
  context: ToolExecutionContext
): Promise<(toolId: string, params: Record<string, unknown>) => Promise<ToolResult>> {
  const registry = await getToolRegistry();

  return async (toolId: string, params: Record<string, unknown>): Promise<ToolResult> => {
    return registry.execute(toolId, params, context);
  };
}
