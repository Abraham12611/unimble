import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentTracer, createTracer } from "./tracing";
import type { LLMSpanMetadata, ToolSpanMetadata } from "./tracing";
import { AgentLogger, createAgentLogger } from "./agentLogger";

// ---------------------------------------------------------------------------
// Phase 7.7.1 — LangSmith Tracing Tests
// ---------------------------------------------------------------------------

describe("Agent Tracing", () => {
  describe("AgentTracer", () => {
    let tracer: AgentTracer;

    beforeEach(() => {
      // Create tracer with tracing disabled (no API calls in tests)
      tracer = new AgentTracer({ enabled: false });
    });

    it("should create a tracer instance", () => {
      expect(tracer).toBeInstanceOf(AgentTracer);
    });

    it("should report disabled when no API key", () => {
      const t = new AgentTracer({ enabled: true, apiKey: "" });
      expect(t.isEnabled()).toBe(false);
    });

    it("should report enabled when configured", () => {
      const t = new AgentTracer({ enabled: true, apiKey: "test-key" });
      expect(t.isEnabled()).toBe(true);
    });

    it("should start and end a trace", () => {
      const t = new AgentTracer({ enabled: true, apiKey: "test-key", batchMode: false });
      const traceId = t.startTrace("TestAgent", { goal: "Write a blog post" });

      expect(traceId).toBeDefined();
      expect(traceId.length).toBeGreaterThan(0);

      t.endTrace(traceId, { output: "Blog post content" });

      const runs = t.getRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].name).toBe("TestAgent");
      expect(runs[0].runType).toBe("chain");
      expect(runs[0].status).toBe("success");
      expect(runs[0].outputs).toEqual({ output: "Blog post content" });
    });

    it("should create nested spans", () => {
      const t = new AgentTracer({ enabled: true, apiKey: "test-key", batchMode: false });
      const traceId = t.startTrace("Agent", { goal: "test" });
      const spanId = t.startSpan(traceId, "llm_call_1", "llm", { model: "claude" });

      t.endSpan(spanId, { content: "response" });
      t.endTrace(traceId, { output: "done" });

      const runs = t.getRuns();
      expect(runs).toHaveLength(2);

      const span = runs.find((r) => r.id === spanId);
      expect(span).toBeDefined();
      expect(span!.parentRunId).toBe(traceId);
      expect(span!.runType).toBe("llm");
    });

    it("should handle error spans", () => {
      const t = new AgentTracer({ enabled: true, apiKey: "test-key", batchMode: false });
      const traceId = t.startTrace("Agent", { goal: "test" });
      const spanId = t.startSpan(traceId, "tool_call", "tool", { toolId: "search" });

      t.endSpanWithError(spanId, "API rate limit exceeded");

      const runs = t.getRuns();
      const span = runs.find((r) => r.id === spanId);
      expect(span!.status).toBe("error");
      expect(span!.error).toBe("API rate limit exceeded");
    });

    it("should record LLM calls with metadata", () => {
      const t = new AgentTracer({ enabled: true, apiKey: "test-key", batchMode: false });
      const traceId = t.startTrace("Agent", { goal: "test" });

      const meta: LLMSpanMetadata = {
        model: "claude-3.5-sonnet",
        promptTokens: 500,
        completionTokens: 200,
        totalTokens: 700,
        cost: 0.005,
        temperature: 0.7,
      };

      const spanId = t.recordLLMCall(
        traceId,
        "think_step_1",
        { messages: [{ role: "user", content: "hello" }], model: "claude-3.5-sonnet" },
        { content: "response text" },
        meta
      );

      const runs = t.getRuns();
      const span = runs.find((r) => r.id === spanId);
      expect(span).toBeDefined();
      expect(span!.runType).toBe("llm");
      expect(span!.status).toBe("success");
      expect(span!.extra?.model).toBe("claude-3.5-sonnet");
      expect(span!.extra?.cost).toBe(0.005);
    });

    it("should record tool calls with metadata", () => {
      const t = new AgentTracer({ enabled: true, apiKey: "test-key", batchMode: false });
      const traceId = t.startTrace("Agent", { goal: "test" });

      const meta: ToolSpanMetadata = {
        toolId: "perplexity_search",
        durationMs: 1200,
        success: true,
      };

      const spanId = t.recordToolCall(
        traceId,
        "perplexity_search",
        { query: "React hooks best practices" },
        { results: ["result1", "result2"] },
        meta
      );

      const runs = t.getRuns();
      const span = runs.find((r) => r.id === spanId);
      expect(span!.runType).toBe("tool");
      expect(span!.status).toBe("success");
    });

    it("should record failed tool calls", () => {
      const t = new AgentTracer({ enabled: true, apiKey: "test-key", batchMode: false });
      const traceId = t.startTrace("Agent", { goal: "test" });

      const meta: ToolSpanMetadata = {
        toolId: "twitter_post",
        durationMs: 500,
        success: false,
        error: "Rate limit exceeded",
      };

      t.recordToolCall(traceId, "twitter_post", { text: "hello" }, {}, meta);

      const runs = t.getRuns();
      const toolRun = runs.find((r) => r.runType === "tool");
      expect(toolRun!.status).toBe("error");
      expect(toolRun!.error).toBe("Rate limit exceeded");
    });

    it("should support tags", () => {
      const t = new AgentTracer({
        enabled: true,
        apiKey: "test-key",
        defaultTags: ["production"],
        batchMode: false,
      });

      t.startTrace("Agent", { goal: "test" }, { tags: ["content-operator"] });

      const runs = t.getRuns();
      expect(runs[0].tags).toContain("production");
      expect(runs[0].tags).toContain("content-operator");
    });

    it("should clear all runs", () => {
      const t = new AgentTracer({ enabled: true, apiKey: "test-key", batchMode: false });
      t.startTrace("Agent", { goal: "test" });
      expect(t.getRuns()).toHaveLength(1);

      t.clear();
      expect(t.getRuns()).toHaveLength(0);
    });

    it("should not track runs when disabled", () => {
      const t = new AgentTracer({ enabled: false });
      t.startTrace("Agent", { goal: "test" });

      // Runs are still tracked locally (for getRuns), but flush is a no-op
      expect(t.getRuns()).toHaveLength(1);
    });
  });

  describe("createTracer", () => {
    it("should create a tracer from config", () => {
      const tracer = createTracer({ enabled: false });
      expect(tracer).toBeInstanceOf(AgentTracer);
      expect(tracer.isEnabled()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 7.7.2 — Agent Logging Tests
// ---------------------------------------------------------------------------

describe("Agent Logging", () => {
  describe("AgentLogger", () => {
    let logger: AgentLogger;

    beforeEach(() => {
      logger = new AgentLogger({
        agentId: "test_agent",
        executionId: "exec_123",
        minLevel: "debug",
      });
    });

    it("should create a logger instance", () => {
      expect(logger).toBeInstanceOf(AgentLogger);
    });

    it("should log decisions", () => {
      logger.decision("Selected perplexity_search tool", { reason: "Need current data" });

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].category).toBe("decision");
      expect(entries[0].level).toBe("info");
      expect(entries[0].message).toContain("perplexity_search");
      expect(entries[0].agentId).toBe("test_agent");
      expect(entries[0].executionId).toBe("exec_123");
    });

    it("should log LLM calls with cost and tokens", () => {
      logger.llmCall("claude-3.5-sonnet", 500, 200, 0.005, 1200);

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].category).toBe("llm_call");
      expect(entries[0].data?.model).toBe("claude-3.5-sonnet");
      expect(entries[0].data?.promptTokens).toBe(500);
      expect(entries[0].data?.completionTokens).toBe(200);
      expect(entries[0].data?.cost).toBe(0.005);
      expect(entries[0].data?.durationMs).toBe(1200);
    });

    it("should log tool calls", () => {
      logger.toolCall("perplexity_search", { query: "React hooks" }, true, 800);

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].category).toBe("tool_call");
      expect(entries[0].data?.toolId).toBe("perplexity_search");
      expect(entries[0].data?.success).toBe(true);
    });

    it("should log failed tool calls as warnings", () => {
      logger.toolCall("twitter_post", { text: "hello" }, false, 500, { error: "Rate limited" });

      const entries = logger.getEntries();
      expect(entries[0].level).toBe("warn");
    });

    it("should log memory access", () => {
      logger.memoryAccess("search", "workspace", 5, { query: "content patterns" });

      const entries = logger.getEntries();
      expect(entries[0].category).toBe("memory");
      expect(entries[0].data?.operation).toBe("search");
      expect(entries[0].data?.count).toBe(5);
    });

    it("should log planning events", () => {
      logger.planning("Generated plan with 5 steps", { stepCount: 5 });

      const entries = logger.getEntries();
      expect(entries[0].category).toBe("planning");
    });

    it("should log delegation events", () => {
      logger.delegation("writer_agent", "Write blog post", "sent");
      logger.delegation("writer_agent", "Write blog post", "completed", { durationMs: 5000 });

      const entries = logger.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].category).toBe("delegation");
      expect(entries[1].data?.status).toBe("completed");
    });

    it("should log review events", () => {
      logger.review("approve", 8.5, 2);

      const entries = logger.getEntries();
      expect(entries[0].category).toBe("review");
      expect(entries[0].data?.verdict).toBe("approve");
      expect(entries[0].data?.score).toBe(8.5);
    });

    it("should log escalation events as warnings", () => {
      logger.escalation("Conflicting requirements", true);

      const entries = logger.getEntries();
      expect(entries[0].level).toBe("warn");
      expect(entries[0].category).toBe("escalation");
      expect(entries[0].data?.requiresHuman).toBe(true);
    });

    it("should log lifecycle events", () => {
      logger.lifecycle("start", "Agent execution started");
      logger.lifecycle("complete", "Agent execution completed");

      const entries = logger.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].category).toBe("lifecycle");
      expect(entries[0].data?.event).toBe("start");
    });

    it("should log errors with stack traces", () => {
      const error = new Error("Something went wrong");
      logger.logError("Execution failed", error);

      const entries = logger.getEntries();
      expect(entries[0].level).toBe("error");
      expect(entries[0].error?.message).toBe("Something went wrong");
      expect(entries[0].error?.stack).toBeDefined();
    });

    it("should respect minimum log level", () => {
      const infoLogger = new AgentLogger({
        agentId: "test",
        minLevel: "info",
      });

      infoLogger.debug("debug message");
      infoLogger.info("info message");
      infoLogger.warn("warn message");

      const entries = infoLogger.getEntries();
      expect(entries).toHaveLength(2); // info + warn, not debug
    });

    it("should cap entries at maxEntries", () => {
      const smallLogger = new AgentLogger({
        agentId: "test",
        maxEntries: 3,
        minLevel: "debug",
      });

      smallLogger.info("1");
      smallLogger.info("2");
      smallLogger.info("3");
      smallLogger.info("4");

      const entries = smallLogger.getEntries();
      expect(entries).toHaveLength(3);
      expect(entries[0].message).toBe("2"); // First entry was evicted
    });

    it("should filter entries by category", () => {
      logger.decision("decision 1");
      logger.toolCall("tool1", {}, true, 100);
      logger.decision("decision 2");

      const decisions = logger.getEntriesByCategory("decision");
      expect(decisions).toHaveLength(2);
    });

    it("should filter entries by level", () => {
      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.logError("error", new Error("test"));

      const warnings = logger.getEntriesByLevel("warn");
      expect(warnings).toHaveLength(2); // warn + error
    });

    it("should produce a summary", () => {
      logger.llmCall("claude", 100, 50, 0.003, 500);
      logger.llmCall("gpt-4o", 200, 100, 0.005, 800);
      logger.toolCall("search", {}, true, 300);
      logger.logError("failed", new Error("oops"));

      const summary = logger.getSummary();
      expect(summary.totalEntries).toBe(4);
      expect(summary.byCategory.llm_call).toBe(2);
      expect(summary.byCategory.tool_call).toBe(1);
      expect(summary.totalCost).toBeCloseTo(0.008);
      expect(summary.errors).toBe(1);
    });

    it("should call external sink for each entry", () => {
      const sink = vi.fn();
      const sinkLogger = new AgentLogger({
        agentId: "test",
        minLevel: "info",
        sink,
      });

      sinkLogger.info("hello");
      sinkLogger.warn("warning");

      expect(sink).toHaveBeenCalledTimes(2);
      expect(sink).toHaveBeenCalledWith(expect.objectContaining({ message: "hello" }));
    });

    it("should clear entries", () => {
      logger.info("test");
      expect(logger.getEntries()).toHaveLength(1);

      logger.clear();
      expect(logger.getEntries()).toHaveLength(0);
    });
  });

  describe("createAgentLogger", () => {
    it("should create a logger with defaults", () => {
      const logger = createAgentLogger("my_agent", "exec_456");
      expect(logger).toBeInstanceOf(AgentLogger);

      logger.info("test");
      const entries = logger.getEntries();
      expect(entries[0].agentId).toBe("my_agent");
      expect(entries[0].executionId).toBe("exec_456");
    });

    it("should create a logger with custom options", () => {
      const sink = vi.fn();
      const logger = createAgentLogger("agent", "exec", {
        minLevel: "warn",
        sink,
      });

      logger.info("should be filtered");
      logger.warn("should pass");

      expect(sink).toHaveBeenCalledTimes(1);
    });
  });
});
