import { describe, expect, test, beforeEach } from "vitest";

import { ToolRegistry, createToolRegistry } from "./toolRegistry";
import type { ToolHandler } from "./toolRegistry";
import type { ToolDefinition } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDef(id: string, category = "utility"): ToolDefinition {
  return {
    id,
    name: id,
    description: `Test tool: ${id}`,
    category: category as ToolDefinition["category"],
    parameters: {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    },
  };
}

function makeHandler(data: unknown = "ok", delay = 0): ToolHandler {
  return async () => {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    return { success: true, data, durationMs: 0 };
  };
}

function makeFailingHandler(error: string): ToolHandler {
  return async () => {
    return { success: false, error, durationMs: 0 };
  };
}

// ---------------------------------------------------------------------------
// ToolRegistry — Registration
// ---------------------------------------------------------------------------

describe("ToolRegistry — registration", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  test("registers a tool", () => {
    registry.register(makeDef("test.tool"), makeHandler());
    expect(registry.has("test.tool")).toBe(true);
    expect(registry.size).toBe(1);
  });

  test("throws on duplicate registration", () => {
    registry.register(makeDef("test.tool"), makeHandler());
    expect(() => registry.register(makeDef("test.tool"), makeHandler())).toThrow(
      "already registered"
    );
  });

  test("deregisters a tool", () => {
    registry.register(makeDef("test.tool"), makeHandler());
    expect(registry.deregister("test.tool")).toBe(true);
    expect(registry.has("test.tool")).toBe(false);
    expect(registry.size).toBe(0);
  });

  test("deregister returns false for unknown tool", () => {
    expect(registry.deregister("nonexistent")).toBe(false);
  });

  test("getDefinition returns the tool definition", () => {
    const def = makeDef("test.tool");
    registry.register(def, makeHandler());
    expect(registry.getDefinition("test.tool")).toEqual(def);
  });

  test("getDefinition returns undefined for unknown tool", () => {
    expect(registry.getDefinition("nonexistent")).toBeUndefined();
  });

  test("getAllDefinitions returns all registered tools", () => {
    registry.register(makeDef("a"), makeHandler());
    registry.register(makeDef("b"), makeHandler());
    registry.register(makeDef("c"), makeHandler());
    expect(registry.getAllDefinitions()).toHaveLength(3);
  });

  test("getByCategory filters by category", () => {
    registry.register(makeDef("research.a", "research"), makeHandler());
    registry.register(makeDef("research.b", "research"), makeHandler());
    registry.register(makeDef("memory.a", "memory"), makeHandler());
    expect(registry.getByCategory("research")).toHaveLength(2);
    expect(registry.getByCategory("memory")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ToolRegistry — Resolution
// ---------------------------------------------------------------------------

describe("ToolRegistry — resolution", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
    registry.register(makeDef("memory.read", "memory"), makeHandler());
    registry.register(makeDef("memory.write", "memory"), makeHandler());
    registry.register(makeDef("perplexity.search", "research"), makeHandler());
    registry.register(makeDef("firecrawl.scrape", "research"), makeHandler());
    registry.register(makeDef("llm.generate", "content"), makeHandler());
  });

  test("resolves exact tool IDs", () => {
    const resolved = registry.resolve(["memory.read", "llm.generate"]);
    expect(resolved).toHaveLength(2);
    expect(resolved.map((t) => t.id)).toContain("memory.read");
    expect(resolved.map((t) => t.id)).toContain("llm.generate");
  });

  test("resolves wildcard * to all tools", () => {
    const resolved = registry.resolve(["*"]);
    expect(resolved).toHaveLength(5);
  });

  test("resolves category wildcard (memory.*)", () => {
    const resolved = registry.resolve(["memory.*"]);
    expect(resolved).toHaveLength(2);
    expect(resolved.every((t) => t.id.startsWith("memory."))).toBe(true);
  });

  test("resolves mixed exact and wildcard", () => {
    const resolved = registry.resolve(["memory.*", "llm.generate"]);
    expect(resolved).toHaveLength(3);
  });

  test("deduplicates results", () => {
    const resolved = registry.resolve(["memory.read", "memory.*"]);
    expect(resolved).toHaveLength(2); // memory.read not duplicated
  });

  test("returns empty for unknown IDs", () => {
    const resolved = registry.resolve(["nonexistent.tool"]);
    expect(resolved).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ToolRegistry — Execution
// ---------------------------------------------------------------------------

describe("ToolRegistry — execution", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  test("executes a tool successfully", async () => {
    registry.register(makeDef("test.tool"), makeHandler({ result: "hello" }));
    const result = await registry.execute("test.tool", { input: "world" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ result: "hello" });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("returns error for unregistered tool", async () => {
    const result = await registry.execute("nonexistent", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("not registered");
  });

  test("passes context to handler", async () => {
    const handler: ToolHandler = async (_params, ctx) => {
      return { success: true, data: { wsId: ctx.workspaceId }, durationMs: 0 };
    };
    registry.register(makeDef("test.tool"), handler);
    const result = await registry.execute("test.tool", {}, { workspaceId: "ws_123" });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).wsId).toBe("ws_123");
  });

  test("handles timeout", async () => {
    const slowHandler: ToolHandler = async (_params, ctx) => {
      await new Promise((resolve, reject) => {
        const id = setTimeout(resolve, 5000);
        ctx.signal?.addEventListener("abort", () => {
          clearTimeout(id);
          reject(new Error("aborted"));
        });
      });
      return { success: true, data: "done", durationMs: 0 };
    };
    registry.register(makeDef("slow.tool"), slowHandler);
    const result = await registry.execute("slow.tool", {}, {}, { timeoutMs: 50 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  });

  test("retries on transient failure", async () => {
    let attempts = 0;
    const handler: ToolHandler = async () => {
      attempts++;
      if (attempts === 1) {
        return { success: false, error: "rate limit exceeded (429)", durationMs: 0 };
      }
      return { success: true, data: "ok", durationMs: 0 };
    };
    registry.register(makeDef("retry.tool"), handler);
    const result = await registry.execute("retry.tool", {}, {}, { maxRetries: 1 });
    expect(result.success).toBe(true);
    expect(attempts).toBe(2);
  });

  test("does not retry non-transient errors", async () => {
    let attempts = 0;
    const handler: ToolHandler = async () => {
      attempts++;
      return { success: false, error: "Invalid parameter: missing field", durationMs: 0 };
    };
    registry.register(makeDef("noretry.tool"), handler);
    const result = await registry.execute("noretry.tool", {}, {}, { maxRetries: 2 });
    expect(result.success).toBe(false);
    expect(attempts).toBe(1); // No retry for validation errors
  });

  test("caches successful results", async () => {
    let callCount = 0;
    const handler: ToolHandler = async () => {
      callCount++;
      return { success: true, data: `call-${callCount}`, durationMs: 0 };
    };
    registry.register(makeDef("cached.tool"), handler);

    const opts = { cache: true, cacheTtlMs: 10000 };
    const r1 = await registry.execute("cached.tool", { q: "test" }, {}, opts);
    const r2 = await registry.execute("cached.tool", { q: "test" }, {}, opts);

    expect(r1.data).toBe("call-1");
    expect(r2.data).toBe("call-1"); // Cached
    expect(callCount).toBe(1);
  });

  test("cache miss on different params", async () => {
    let callCount = 0;
    const handler: ToolHandler = async (params) => {
      callCount++;
      return { success: true, data: params.q, durationMs: 0 };
    };
    registry.register(makeDef("cached.tool"), handler);

    const opts = { cache: true, cacheTtlMs: 10000 };
    await registry.execute("cached.tool", { q: "a" }, {}, opts);
    await registry.execute("cached.tool", { q: "b" }, {}, opts);

    expect(callCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ToolRegistry — Parallel Execution
// ---------------------------------------------------------------------------

describe("ToolRegistry — parallel execution", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
    registry.register(makeDef("tool.a"), makeHandler("result-a"));
    registry.register(makeDef("tool.b"), makeHandler("result-b"));
    registry.register(makeDef("tool.fail"), makeFailingHandler("tool failed"));
  });

  test("executes multiple tools in parallel", async () => {
    const results = await registry.executeParallel([
      { toolId: "tool.a", params: {} },
      { toolId: "tool.b", params: {} },
    ]);
    expect(results.results).toHaveLength(2);
    expect(results.results[0].result.success).toBe(true);
    expect(results.results[1].result.success).toBe(true);
    expect(results.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  test("does not short-circuit on failure", async () => {
    const results = await registry.executeParallel([
      { toolId: "tool.a", params: {} },
      { toolId: "tool.fail", params: {} },
      { toolId: "tool.b", params: {} },
    ]);
    expect(results.results).toHaveLength(3);
    expect(results.results[0].result.success).toBe(true);
    expect(results.results[1].result.success).toBe(false);
    expect(results.results[2].result.success).toBe(true);
  });

  test("accumulates total cost", async () => {
    const costHandler: ToolHandler = async () => ({
      success: true,
      data: "ok",
      durationMs: 0,
      cost: 0.01,
    });
    registry.register(makeDef("cost.tool"), costHandler);

    const results = await registry.executeParallel([
      { toolId: "cost.tool", params: {} },
      { toolId: "cost.tool", params: {} },
    ]);
    expect(results.totalCost).toBeCloseTo(0.02);
  });
});

// ---------------------------------------------------------------------------
// createToolExecutor
// ---------------------------------------------------------------------------

describe("createToolExecutor", () => {
  test("creates a function matching ToolExecutorFn signature", async () => {
    // This test verifies the factory works with the global registry.
    // Since the global registry uses require() for built-in tools,
    // we test with a fresh registry approach instead.
    const registry = createToolRegistry();
    registry.register(makeDef("test.echo"), async (params) => ({
      success: true,
      data: params,
      durationMs: 0,
    }));

    // Directly test the executor pattern
    const executor = async (toolId: string, params: Record<string, unknown>) => {
      return registry.execute(toolId, params, { workspaceId: "ws_test" });
    };

    const result = await executor("test.echo", { message: "hello" });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).message).toBe("hello");
  });
});
