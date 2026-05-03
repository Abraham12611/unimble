/**
 * Phase 7 — Agent Runtime: Tool registry and Tool base class.
 *
 * ToolRegistry: register, discover, list by category.
 * Tool: schema definition, Zod parameter validation, execute(), error handling.
 */

import { z } from "zod";
import type { AgentContext, JSONSchema, ToolDefinition, ToolResult } from "../types";

// ---------------------------------------------------------------------------
// Tool base class
// ---------------------------------------------------------------------------

export abstract class Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: string;
  abstract readonly schema: JSONSchema;

  /** Optional Zod schema for parameter validation. */
  protected paramSchema?: z.ZodTypeAny;

  /**
   * Validate parameters against the tool's schema.
   * Returns { valid: true } or { valid: false, errors: [...] }.
   */
  validate(params: unknown): { valid: boolean; errors?: string[] } {
    if (!this.paramSchema) return { valid: true };
    const result = this.paramSchema.safeParse(params);
    if (result.success) return { valid: true };
    const errors = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    return { valid: false, errors };
  }

  /** Execute the tool. Subclasses must implement this. */
  abstract execute(params: unknown, ctx: AgentContext): Promise<ToolResult>;

  /**
   * Safely execute the tool: validate params first, then call execute().
   * Wraps all errors into a ToolResult so the agent loop never crashes.
   */
  async safeExecute(params: unknown, ctx: AgentContext): Promise<ToolResult> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return {
        success: false,
        output: null,
        error: `Invalid parameters: ${validation.errors?.join("; ")}`,
      };
    }
    try {
      return await this.execute(params, ctx);
    } catch (err) {
      return {
        success: false,
        output: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Return a ToolDefinition suitable for passing to the LLM client. */
  toDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: this.category,
      parameters: this.schema,
    };
  }
}

// ---------------------------------------------------------------------------
// ToolRegistry
// ---------------------------------------------------------------------------

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  /**
   * Register a tool instance.
   * Overwrites any previously registered tool with the same name.
   */
  register(tool: Tool): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  /** Register multiple tools at once. */
  registerAll(tools: Tool[]): this {
    for (const tool of tools) this.register(tool);
    return this;
  }

  /** Retrieve a tool by name. Returns undefined if not found. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** List all tools, optionally filtered by category. */
  list(category?: string): Tool[] {
    const all = Array.from(this.tools.values());
    return category ? all.filter((t) => t.category === category) : all;
  }

  /** Return ToolDefinition[] for all registered tools (for LLM tool-calling). */
  discover(category?: string): ToolDefinition[] {
    return this.list(category).map((t) => t.toDefinition());
  }

  /** True if a tool with the given name exists. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Remove a tool. */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get size(): number {
    return this.tools.size;
  }
}
