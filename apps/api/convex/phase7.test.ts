/**
 * Phase 7 — Agent Runtime tests
 *
 * Covers:
 *   LLM client          — model selection, cost estimation, rate limiter, retry logic
 *   Prompt engine       — interpolation, conditionals, each blocks, unless, fragments
 *   Response parser     — JSON extraction, tool call parsing, ReAct steps, final answer
 *   Tool system         — ToolRegistry, Tool base, safe dispatch, Composio bridge
 *   Built-in tools      — all 8 tools (mocked HTTP/persistence clients)
 *   Short-term memory   — sliding window, compaction/summarisation, serialisation
 *   Long-term memory    — Mem0 bridge CRUD
 *   Agent base class    — tool dispatch, cost accumulation, buildResult
 *   ReAct loop          — full plan→act→observe→repeat cycle (mocked LLM)
 *   Reviewer pipeline   — parallel reviews, aggregation, approval threshold
 *   Lead Agent          — decompose, delegate, synthesise
 */

import { describe, expect, test, vi, beforeEach } from "vitest";

import { OpenRouterClient, TokenBucketRateLimiter } from "./agent/llm";
import {
  PromptTemplate,
  PromptFragmentLibrary,
  PromptRegistry,
  renderTemplate,
  FRAGMENTS,
  PROMPT_REGISTRY,
} from "./agent/prompts";
import {
  extractJson,
  requireJson,
  extractToolCalls,
  extractReActSteps,
  extractFinalAnswer,
  parseResponse,
  ParseError,
} from "./agent/parser";
import { z } from "zod";
import { Tool, ToolRegistry } from "./agent/tools/index";
import {
  PerplexitySearchTool,
  FirecrawlScrapeTool,
  FirehoseMonitorTool,
  MemoryReadTool,
  MemoryWriteTool,
  PublishContentTool,
  SendNotificationTool,
  SocialPostTool,
  createBuiltinRegistry,
} from "./agent/tools/builtins";
import type { HttpClient, MemoryReader, MemoryWriter } from "./agent/tools/builtins";
import {
  ComposioToolBridge,
  ComposioTool,
} from "./agent/tools/composio";
import type { ComposioClient } from "./agent/tools/composio";
import {
  ConversationMemory,
  estimateTokens,
  estimateMessageTokens,
} from "./agent/memory/short-term";
import { LongTermMemory } from "./agent/memory/long-term";
import type { Mem0Client } from "./agent/memory/long-term";
import { Agent, silentLogger, consoleLogger } from "./agent/agents/base";
import { ReactLoop } from "./agent/react-loop";
import { ReviewerAgent, ReviewerPipeline } from "./agent/agents/reviewer";
import { WriterAgent, ResearchAgent, EditorAgent } from "./agent/agents/writer";
import { LeadAgent } from "./agent/agents/lead";
import type { AgentContext, AgentResult, ToolResult } from "./agent/types";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const TEST_CTX: AgentContext = {
  workspaceId: "ws-test-123",
  executionId: "exec-test-456",
  stepId: "step-test-789",
  userId: "user-test",
  integrations: [],
};

function makeCompletionResponse(content: string, toolCalls: unknown[] = []) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    choices: [
      {
        message: { role: "assistant", content, tool_calls: toolCalls },
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    model: "anthropic/claude-3-5-sonnet",
  };
}

function makeMockFetch(responseBody: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(JSON.stringify(responseBody)),
    body: null,
  });
}

// ---------------------------------------------------------------------------
// LLM client — model selection
// ---------------------------------------------------------------------------

describe("LLM client — model selection", () => {
  test("returns writing model for writing task", () => {
    const cfg = OpenRouterClient.modelForTask("writing");
    expect(cfg.model).toBe("anthropic/claude-3-5-sonnet");
    expect(cfg.temperature).toBe(0.7);
  });

  test("returns low-temperature model for code task", () => {
    const cfg = OpenRouterClient.modelForTask("code");
    expect(cfg.temperature).toBe(0.1);
  });

  test("override model takes precedence", () => {
    const cfg = OpenRouterClient.modelForTask("writing", "openai/gpt-4o");
    expect(cfg.model).toBe("openai/gpt-4o");
    expect(cfg.temperature).toBe(0.7);
  });

  test("returns general model for unknown task type", () => {
    const cfg = OpenRouterClient.modelForTask("general");
    expect(cfg.model).toBe("openai/gpt-4o-mini");
  });
});

// ---------------------------------------------------------------------------
// LLM client — cost estimation
// ---------------------------------------------------------------------------

describe("LLM client — completion and cost", () => {
  test("parses completion response and returns content", async () => {
    const mockFetch = makeMockFetch(makeCompletionResponse("Hello world"));
    const client = new OpenRouterClient({ apiKey: "test-key" }, mockFetch as any);
    const result = await client.complete({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Say hi" }],
    });
    expect(result.content).toBe("Hello world");
    expect(result.usage.totalTokens).toBe(150);
    expect(result.finishReason).toBe("stop");
  });

  test("estimates non-zero cost for known model", async () => {
    const mockFetch = makeMockFetch(makeCompletionResponse("Hi"));
    const client = new OpenRouterClient({ apiKey: "test-key" }, mockFetch as any);
    const result = await client.complete({
      model: "anthropic/claude-3-5-sonnet",
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
  });

  test("parses tool calls from response", async () => {
    const toolCallResponse = makeCompletionResponse("", [
      {
        id: "call-1",
        function: { name: "perplexity_search", arguments: JSON.stringify({ query: "TypeScript" }) },
      },
    ]);
    const mockFetch = makeMockFetch(toolCallResponse);
    const client = new OpenRouterClient({ apiKey: "test-key" }, mockFetch as any);
    const result = await client.complete({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Search" }],
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("perplexity_search");
    expect(result.toolCalls[0]!.arguments).toEqual({ query: "TypeScript" });
    expect(result.finishReason).toBe("tool_calls");
  });

  test("retries on 429 and succeeds on second attempt", async () => {
    const rateLimitResp = { ok: false, status: 429, json: () => Promise.resolve({}), text: () => Promise.resolve("") };
    const successResp = { ok: true, status: 200, json: () => Promise.resolve(makeCompletionResponse("OK")), text: () => Promise.resolve("") };
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rateLimitResp)
      .mockResolvedValueOnce(successResp);
    const client = new OpenRouterClient(
      { apiKey: "test-key", maxRetries: 2, retryBaseDelayMs: 0 },
      mockFetch as any
    );
    const result = await client.complete({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(result.content).toBe("OK");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("throws after exhausting all retries", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false, status: 503, json: () => Promise.resolve({}), text: () => Promise.resolve("Service unavailable"),
    });
    const client = new OpenRouterClient(
      { apiKey: "test-key", maxRetries: 1, retryBaseDelayMs: 0 },
      mockFetch as any
    );
    await expect(
      client.complete({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "Hi" }] })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Token-bucket rate limiter
// ---------------------------------------------------------------------------

describe("TokenBucketRateLimiter", () => {
  test("allows consumption up to burst limit", () => {
    const limiter = new TokenBucketRateLimiter({ tokensPerSecond: 10, maxBurst: 5 });
    expect(limiter.tryConsume(5)).toBe(true);
    expect(limiter.tryConsume(1)).toBe(false);
  });

  test("returns waitTimeMs > 0 when tokens exhausted", () => {
    const limiter = new TokenBucketRateLimiter({ tokensPerSecond: 10, maxBurst: 3 });
    limiter.tryConsume(3);
    expect(limiter.waitTimeMs(1)).toBeGreaterThan(0);
  });

  test("returns 0 waitTimeMs when tokens available", () => {
    const limiter = new TokenBucketRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
    expect(limiter.waitTimeMs(1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Prompt template engine
// ---------------------------------------------------------------------------

describe("prompt engine — renderTemplate", () => {
  test("interpolates simple variables", () => {
    const result = renderTemplate("Hello {{name}}!", { name: "World" });
    expect(result).toBe("Hello World!");
  });

  test("interpolates nested object paths", () => {
    const result = renderTemplate("{{user.name}}", { user: { name: "Alice" } });
    expect(result).toBe("Alice");
  });

  test("{{#if}} renders true branch", () => {
    const result = renderTemplate("{{#if show}}visible{{/if}}", { show: true });
    expect(result).toBe("visible");
  });

  test("{{#if}} suppresses false branch", () => {
    const result = renderTemplate("{{#if show}}visible{{/if}}", { show: false });
    expect(result.trim()).toBe("");
  });

  test("{{#if}}...{{else}}...{{/if}} renders else branch", () => {
    const result = renderTemplate(
      "{{#if flag}}yes{{else}}no{{/if}}",
      { flag: false }
    );
    expect(result).toBe("no");
  });

  test("{{#unless}} renders body when condition is falsy", () => {
    const result = renderTemplate("{{#unless missing}}shown{{/unless}}", {});
    expect(result).toBe("shown");
  });

  test("{{#unless}} suppresses body when condition is truthy", () => {
    const result = renderTemplate("{{#unless present}}shown{{/unless}}", { present: true });
    expect(result.trim()).toBe("");
  });

  test("{{#each}} iterates array", () => {
    const result = renderTemplate(
      "{{#each items as item}}{{item}} {{/each}}",
      { items: ["a", "b", "c"] }
    );
    expect(result.trim()).toBe("a b c");
  });

  test("{{#each}} with _index, _first, _last", () => {
    const result = renderTemplate(
      "{{#each items as item}}{{#if _first}}FIRST:{{/if}}{{item}}{{/each}}",
      { items: ["x", "y"] }
    );
    expect(result).toContain("FIRST:x");
    expect(result).not.toContain("FIRST:y");
  });

  test("{{#each}} with empty array renders nothing", () => {
    const result = renderTemplate("{{#each items as item}}{{item}}{{/each}}", { items: [] });
    expect(result.trim()).toBe("");
  });

  test("leaves unknown variables intact by default", () => {
    const result = renderTemplate("{{unknown}}", {}, { compact: false });
    expect(result).toBe("{{unknown}}");
  });

  test("strict mode throws on missing variable", () => {
    expect(() => renderTemplate("{{missing}}", {}, { strict: true })).toThrow("missing");
  });

  test("serialises objects to JSON", () => {
    const result = renderTemplate("{{obj}}", { obj: { a: 1 } });
    expect(result).toContain('"a"');
  });
});

describe("PromptTemplate class", () => {
  test("renders current version", () => {
    const tpl = new PromptTemplate("test", "Hello {{name}}");
    expect(tpl.render({ name: "Alice" })).toBe("Hello Alice");
  });

  test("supports multiple versions", () => {
    const tpl = new PromptTemplate("test", "v1: {{x}}", "1.0.0");
    tpl.addVersion("2.0.0", "v2: {{x}}");
    expect(tpl.render({ x: "test" })).toBe("v2: test");
    expect(tpl.render({ x: "test" }, {}, "1.0.0")).toBe("v1: test");
  });

  test("throws on unknown version", () => {
    const tpl = new PromptTemplate("test", "hi");
    expect(() => tpl.render({}, {}, "99.0.0")).toThrow("not found");
  });

  test("listVersions returns all registered versions", () => {
    const tpl = new PromptTemplate("test", "v1", "1.0.0");
    tpl.addVersion("2.0.0", "v2");
    expect(tpl.listVersions()).toHaveLength(2);
  });
});

describe("PromptFragmentLibrary", () => {
  test("resolves {{>fragment}} includes", () => {
    const lib = new PromptFragmentLibrary();
    lib.register({ name: "greeting", content: "Hello {{name}}!" });
    const result = lib.resolve("{{>greeting}}", { name: "World" });
    expect(result).toBe("Hello World!");
  });

  test("leaves unknown fragment include intact", () => {
    const lib = new PromptFragmentLibrary();
    const result = lib.resolve("{{>missing}}");
    expect(result).toBe("{{>missing}}");
  });

  test("FRAGMENTS has built-in fragments", () => {
    expect(FRAGMENTS.get("json_output")).toBeDefined();
    expect(FRAGMENTS.get("react_format")).toBeDefined();
    expect(FRAGMENTS.get("tool_use")).toBeDefined();
  });
});

describe("PromptRegistry", () => {
  test("renders named template", () => {
    const registry = new PromptRegistry();
    registry.register(new PromptTemplate("greet", "Hi {{name}}"));
    expect(registry.render("greet", { name: "Bob" })).toBe("Hi Bob");
  });

  test("throws on unknown template", () => {
    const registry = new PromptRegistry();
    expect(() => registry.render("no-such-template")).toThrow("not found");
  });

  test("PROMPT_REGISTRY has built-in templates", () => {
    expect(PROMPT_REGISTRY.get("react_agent")).toBeDefined();
    expect(PROMPT_REGISTRY.get("writer_agent")).toBeDefined();
    expect(PROMPT_REGISTRY.get("reviewer_agent")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

describe("response parser — extractJson", () => {
  test("extracts JSON from ```json block", () => {
    const result = extractJson('Some text\n```json\n{"key": "value"}\n```\nMore text');
    expect(result).toEqual({ key: "value" });
  });

  test("extracts JSON from generic ``` block", () => {
    const result = extractJson("```\n[1,2,3]\n```");
    expect(result).toEqual([1, 2, 3]);
  });

  test("extracts bare JSON object", () => {
    const result = extractJson('Before {"a": 1} after');
    expect(result).toEqual({ a: 1 });
  });

  test("extracts bare JSON array", () => {
    const result = extractJson("prefix [1, 2] suffix");
    expect(result).toEqual([1, 2]);
  });

  test("returns null for plain text", () => {
    expect(extractJson("just text with no JSON")).toBeNull();
  });

  test("requireJson throws ParseError on non-JSON input", () => {
    expect(() => requireJson("no json here at all")).toThrow();
  });
});

describe("response parser — extractToolCalls", () => {
  test("returns structured calls when provided", () => {
    const structured = [{ id: "c1", name: "search", arguments: { q: "test" } }];
    const calls = extractToolCalls("ignored", structured);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("search");
  });

  test("extracts ReAct-style Action/Action Input blocks", () => {
    const raw = `Thought: I need to search
Action: perplexity_search
Action Input: {"query": "TypeScript generics"}
Observation: Results found`;
    const calls = extractToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("perplexity_search");
    expect(calls[0]!.arguments).toEqual({ query: "TypeScript generics" });
  });

  test("returns empty array for plain text", () => {
    expect(extractToolCalls("just a reply")).toHaveLength(0);
  });
});

describe("response parser — extractReActSteps", () => {
  test("parses multi-step ReAct trace", () => {
    const raw = `Thought: I need to research
Action: search
Action Input: {"q": "test"}
Observation: Found results
Thought: I have enough info
Final Answer: The answer is 42`;
    const steps = extractReActSteps(raw);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    const thoughtSteps = steps.filter((s) => s.thought);
    expect(thoughtSteps.length).toBeGreaterThanOrEqual(1);
  });

  test("extracts final answer", () => {
    const raw = "Thought: Done\nFinal Answer: My final response";
    expect(extractFinalAnswer(raw)).toBe("My final response");
  });

  test("returns null when no Final Answer", () => {
    expect(extractFinalAnswer("just some text")).toBeNull();
  });
});

describe("response parser — parseResponse", () => {
  test("type=json when response is a JSON block", () => {
    const parsed = parseResponse('```json\n{"result": "ok"}\n```');
    expect(parsed.type).toBe("json");
    expect((parsed.json as Record<string, unknown>).result).toBe("ok");
  });

  test("type=tool_calls when structured tool calls present", () => {
    const calls = [{ id: "c1", name: "search", arguments: {} }];
    const parsed = parseResponse("", calls);
    expect(parsed.type).toBe("tool_calls");
    expect(parsed.toolCalls).toHaveLength(1);
  });

  test("type=react when Final Answer present", () => {
    const parsed = parseResponse("Thought: Done\nFinal Answer: 42");
    expect(parsed.type).toBe("react");
    expect(parsed.finalAnswer).toBe("42");
  });

  test("type=text for unstructured plain text", () => {
    const parsed = parseResponse("Just a plain reply with no structure");
    expect(parsed.type).toBe("text");
    expect(parsed.text).toBe("Just a plain reply with no structure");
  });
});

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

describe("ToolRegistry", () => {
  class EchoTool extends Tool {
    readonly name = "echo";
    readonly description = "Echoes input";
    readonly category = "test";
    readonly schema = { type: "object", properties: { message: { type: "string" } }, required: ["message"] };
    protected paramSchema = z.object({ message: z.string() });

    async execute(params: unknown, _ctx: AgentContext): Promise<ToolResult> {
      return { success: true, output: (params as { message: string }).message };
    }
  }

  test("register and get a tool", () => {
    const registry = new ToolRegistry();
    registry.register(new EchoTool());
    expect(registry.has("echo")).toBe(true);
    expect(registry.get("echo")).toBeInstanceOf(EchoTool);
  });

  test("list all tools", () => {
    const registry = new ToolRegistry();
    registry.register(new EchoTool());
    expect(registry.list()).toHaveLength(1);
  });

  test("list tools by category", () => {
    const registry = new ToolRegistry();
    registry.register(new EchoTool());
    expect(registry.list("test")).toHaveLength(1);
    expect(registry.list("other")).toHaveLength(0);
  });

  test("discover returns ToolDefinition[]", () => {
    const registry = new ToolRegistry();
    registry.register(new EchoTool());
    const defs = registry.discover();
    expect(defs[0]!.name).toBe("echo");
    expect(defs[0]!.parameters).toBeDefined();
  });

  test("unregister removes a tool", () => {
    const registry = new ToolRegistry();
    registry.register(new EchoTool());
    expect(registry.unregister("echo")).toBe(true);
    expect(registry.has("echo")).toBe(false);
  });

  test("size reflects registered tools", () => {
    const registry = new ToolRegistry();
    expect(registry.size).toBe(0);
    registry.register(new EchoTool());
    expect(registry.size).toBe(1);
  });

  test("safeExecute wraps errors in ToolResult", async () => {
    class ErrorTool extends Tool {
      readonly name = "error_tool";
      readonly description = "Throws";
      readonly category = "test";
      readonly schema = { type: "object" };
      async execute(_p: unknown, _c: AgentContext): Promise<ToolResult> {
        throw new Error("boom");
      }
    }
    const tool = new ErrorTool();
    const result = await tool.safeExecute({}, TEST_CTX);
    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });

  test("validate returns errors for invalid params", () => {
    const tool = new EchoTool();
    const result = tool.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Built-in tools
// ---------------------------------------------------------------------------

describe("built-in tools — perplexity_search", () => {
  test("returns search results from mocked API", async () => {
    const mockClient: HttpClient = {
      post: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "TypeScript is great" } }],
        citations: ["https://example.com"],
      }),
      get: vi.fn(),
    };
    const tool = new PerplexitySearchTool("test-key", mockClient);
    const result = await tool.execute({ query: "TypeScript" }, TEST_CTX);
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).answer).toBe("TypeScript is great");
  });

  test("fails with invalid params (missing query)", async () => {
    const tool = new PerplexitySearchTool("key");
    const result = await tool.safeExecute({}, TEST_CTX);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid parameters");
  });
});

describe("built-in tools — firecrawl_scrape", () => {
  test("returns scraped markdown content", async () => {
    const mockClient: HttpClient = {
      post: vi.fn().mockResolvedValue({
        data: { markdown: "# Page Title\nContent here", title: "Page" },
      }),
      get: vi.fn(),
    };
    const tool = new FirecrawlScrapeTool("test-key", mockClient);
    const result = await tool.execute({ url: "https://example.com" }, TEST_CTX);
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).markdown).toContain("Page Title");
  });
});

describe("built-in tools — firehose_monitor", () => {
  test("returns monitoring results", async () => {
    const mockClient: HttpClient = {
      post: vi.fn().mockResolvedValue({ results: [{ text: "keyword mention" }] }),
      get: vi.fn(),
    };
    const tool = new FirehoseMonitorTool(mockClient);
    const result = await tool.execute({ keywords: ["TypeScript"] }, TEST_CTX);
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).count).toBe(1);
  });
});

describe("built-in tools — memory_read", () => {
  test("retrieves memories from the reader", async () => {
    const mockReader: MemoryReader = {
      search: vi.fn().mockResolvedValue([
        { id: "m1", category: "workspace", content: "Brand is minimalist", score: 0.9 },
      ]),
    };
    const tool = new MemoryReadTool(mockReader);
    const result = await tool.execute({ query: "brand style" }, TEST_CTX);
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).count).toBe(1);
  });
});

describe("built-in tools — memory_write", () => {
  test("stores content and returns an ID", async () => {
    const mockWriter: MemoryWriter = {
      store: vi.fn().mockResolvedValue("mem-id-123"),
    };
    const tool = new MemoryWriteTool(mockWriter);
    const result = await tool.execute(
      { content: "Users prefer dark mode", category: "preferences" },
      TEST_CTX
    );
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).id).toBe("mem-id-123");
  });
});

describe("built-in tools — publish_content", () => {
  test("publishes and returns post ID and URL", async () => {
    const mockPublisher = {
      publish: vi.fn().mockResolvedValue({ id: "post-1", url: "https://blog.example.com/post-1" }),
    };
    const tool = new PublishContentTool(mockPublisher);
    const result = await tool.execute(
      { title: "My Post", content: "Content here", platform: "blog" },
      TEST_CTX
    );
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).url).toContain("post-1");
  });
});

describe("built-in tools — send_notification", () => {
  test("sends notification and returns messageId", async () => {
    const mockSender = {
      send: vi.fn().mockResolvedValue({ messageId: "msg-abc" }),
    };
    const tool = new SendNotificationTool(mockSender);
    const result = await tool.execute(
      { channel: "slack", message: "Deploy complete", priority: "high" },
      TEST_CTX
    );
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).messageId).toBe("msg-abc");
  });
});

describe("built-in tools — social_post", () => {
  test("posts to platform and returns postId", async () => {
    const mockSocial = {
      post: vi.fn().mockResolvedValue({ postId: "tweet-xyz", url: "https://x.com/tweet-xyz" }),
    };
    const tool = new SocialPostTool(mockSocial);
    const result = await tool.execute(
      { platform: "twitter", content: "Hello world!" },
      TEST_CTX
    );
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).postId).toBe("tweet-xyz");
  });
});

describe("createBuiltinRegistry", () => {
  test("only registers tools with provided dependencies", () => {
    const registry = createBuiltinRegistry({
      memoryReader: { search: vi.fn().mockResolvedValue([]) },
    });
    expect(registry.has("memory_read")).toBe(true);
    expect(registry.has("perplexity_search")).toBe(false);
  });

  test("registers all tools when all dependencies provided", () => {
    const deps = {
      perplexityApiKey: "key",
      firecrawlApiKey: "key",
      httpClient: { post: vi.fn(), get: vi.fn() },
      memoryReader: { search: vi.fn() },
      memoryWriter: { store: vi.fn() },
      contentPublisher: { publish: vi.fn() },
      notificationSender: { send: vi.fn() },
      socialMediaClient: { post: vi.fn() },
    };
    const registry = createBuiltinRegistry(deps);
    expect(registry.size).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Composio bridge
// ---------------------------------------------------------------------------

describe("Composio bridge", () => {
  const mockComposioClient: ComposioClient = {
    listActions: vi.fn().mockResolvedValue([
      {
        name: "GITHUB_CREATE_ISSUE",
        displayName: "Create GitHub Issue",
        description: "Creates a new issue in a GitHub repository",
        appName: "github",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string" },
            repo: { type: "string" },
            title: { type: "string" },
          },
          required: ["owner", "repo", "title"],
        },
      },
    ]),
    executeAction: vi.fn().mockResolvedValue({ success: true, data: { issueNumber: 42 } }),
  };

  test("builds registry with mapped tools", async () => {
    const bridge = new ComposioToolBridge(mockComposioClient);
    const registry = await bridge.buildRegistry();
    expect(registry.size).toBe(1);
    expect(registry.has("composio_GITHUB_CREATE_ISSUE")).toBe(true);
  });

  test("tool name uses composio_ prefix", async () => {
    const bridge = new ComposioToolBridge(mockComposioClient);
    const registry = await bridge.buildRegistry();
    const tool = registry.get("composio_GITHUB_CREATE_ISSUE")!;
    expect(tool.name).toBe("composio_GITHUB_CREATE_ISSUE");
    expect(tool.category).toBe("composio:github");
  });

  test("executes action via Composio client", async () => {
    const bridge = new ComposioToolBridge(mockComposioClient);
    const registry = await bridge.buildRegistry();
    const tool = registry.get("composio_GITHUB_CREATE_ISSUE")!;
    const result = await tool.execute(
      { owner: "acme", repo: "website", title: "Bug report" },
      TEST_CTX
    );
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).issueNumber).toBe(42);
  });

  test("mergeInto adds composio tools to existing registry", async () => {
    const bridge = new ComposioToolBridge(mockComposioClient);
    const existing = new ToolRegistry();
    await bridge.mergeInto(existing);
    expect(existing.size).toBe(1);
  });

  test("handles rate limit response gracefully", async () => {
    const rateLimitClient: ComposioClient = {
      listActions: vi.fn().mockResolvedValue([
        {
          name: "SLACK_SEND",
          displayName: "Send Slack Message",
          description: "Send a message",
          appName: "slack",
          parameters: { type: "object" },
        },
      ]),
      executeAction: vi.fn().mockRejectedValue(new Error("429 rate limit exceeded")),
    };
    const bridge = new ComposioToolBridge(rateLimitClient);
    const registry = await bridge.buildRegistry();
    const tool = registry.get("composio_SLACK_SEND")!;
    const result = await tool.safeExecute({}, TEST_CTX);
    expect(result.success).toBe(false);
    expect((result.metadata as Record<string, unknown>)?.rateLimited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Short-term memory
// ---------------------------------------------------------------------------

describe("short-term memory — ConversationMemory", () => {
  test("estimateTokens is roughly ~4 chars/token", () => {
    expect(estimateTokens("Hello world")).toBe(3); // 11 chars → 3
    expect(estimateTokens("A".repeat(400))).toBe(100);
  });

  test("adds messages and tracks token count", async () => {
    const mem = new ConversationMemory();
    await mem.add("user", "Hello");
    await mem.add("assistant", "Hi there");
    expect(mem.length).toBe(2);
    expect(mem.tokenCount).toBeGreaterThan(0);
  });

  test("toMessageList returns messages in LLM format", async () => {
    const mem = new ConversationMemory();
    await mem.add("user", "What is TypeScript?");
    const list = mem.toMessageList();
    expect(list[0]!.role).toBe("user");
    expect(list[0]!.content).toBe("What is TypeScript?");
  });

  test("clear resets messages and token count", async () => {
    const mem = new ConversationMemory();
    await mem.add("user", "Test");
    mem.clear();
    expect(mem.length).toBe(0);
    expect(mem.tokenCount).toBe(0);
  });

  test("toSerializable / fromMessages round-trip", async () => {
    const mem = new ConversationMemory();
    await mem.add("user", "Test message");
    const serialized = mem.toSerializable();
    const restored = ConversationMemory.fromMessages(serialized);
    expect(restored.length).toBe(1);
    expect(restored.toMessageList()[0]!.content).toBe("Test message");
  });

  test("compaction triggers when maxTokens is exceeded", async () => {
    const mockSummarizer = {
      summarize: vi.fn().mockResolvedValue("Summary of earlier messages"),
    };
    const mem = new ConversationMemory(mockSummarizer, {
      maxTokens: 50,
      reserveTokens: 10,
      keepRecentMessages: 1,
    });
    // Add enough messages to exceed 40 tokens
    for (let i = 0; i < 15; i++) {
      await mem.add("user", `Message number ${i} with some content`);
    }
    expect(mockSummarizer.summarize).toHaveBeenCalled();
    // After compaction, there should be a summary message + keepRecent messages
    expect(mem.length).toBeLessThan(15);
  });

  test("no-LLM fallback compaction preserves keepRecent messages", async () => {
    const mem = new ConversationMemory(undefined, {
      maxTokens: 50,
      reserveTokens: 5,
      keepRecentMessages: 2,
    });
    for (let i = 0; i < 20; i++) {
      await mem.add("user", `Message ${i} padding content here`);
    }
    // Should have 1 summary + 2 keepRecent
    expect(mem.length).toBe(3);
    expect(mem.getMessages()[0]!.summary).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Long-term memory
// ---------------------------------------------------------------------------

describe("long-term memory — LongTermMemory", () => {
  function makeMockMem0(): Mem0Client {
    return {
      add: vi.fn().mockResolvedValue({ results: [{ id: "mem-new-1", event: "ADD" }] }),
      search: vi.fn().mockResolvedValue({
        results: [
          { id: "mem-1", memory: "Brand voice is professional", score: 0.95, metadata: { category: "workspace" } },
        ],
      }),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue({
        results: [
          { id: "mem-2", memory: "Users prefer dark mode", metadata: { category: "preferences" } },
        ],
      }),
    };
  }

  test("create stores a memory and returns ID", async () => {
    const client = makeMockMem0();
    const ltm = new LongTermMemory(client, "ws-1");
    const id = await ltm.create("Brand voice is professional", "workspace");
    expect(id).toBe("mem-new-1");
    expect(client.add).toHaveBeenCalledOnce();
  });

  test("retrieve returns ranked memories", async () => {
    const client = makeMockMem0();
    const ltm = new LongTermMemory(client, "ws-1");
    const results = await ltm.retrieve("brand tone");
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe("Brand voice is professional");
    expect(results[0]!.score).toBe(0.95);
  });

  test("retrieve with category filters results", async () => {
    const client = makeMockMem0();
    const ltm = new LongTermMemory(client, "ws-1");
    await ltm.retrieve("brand tone", "workspace");
    expect(client.search).toHaveBeenCalledWith(
      "brand tone",
      expect.objectContaining({ agentId: "unimble-workspace" })
    );
  });

  test("update calls Mem0 update", async () => {
    const client = makeMockMem0();
    const ltm = new LongTermMemory(client, "ws-1");
    await ltm.update("mem-1", "Updated content");
    expect(client.update).toHaveBeenCalledWith("mem-1", "Updated content");
  });

  test("delete calls Mem0 delete", async () => {
    const client = makeMockMem0();
    const ltm = new LongTermMemory(client, "ws-1");
    await ltm.delete("mem-1");
    expect(client.delete).toHaveBeenCalledWith("mem-1");
  });

  test("listByCategory returns memories for category", async () => {
    const client = makeMockMem0();
    const ltm = new LongTermMemory(client, "ws-1");
    const results = await ltm.listByCategory("preferences");
    expect(results).toHaveLength(1);
    expect(results[0]!.category).toBe("preferences");
  });
});

// ---------------------------------------------------------------------------
// Agent base class
// ---------------------------------------------------------------------------

describe("Agent base class", () => {
  class ConcreteAgent extends Agent {
    readonly agentType = "concrete";
    readonly description = "Test agent";
    callCount = 0;

    async execute(goal: string, ctx: AgentContext): Promise<AgentResult> {
      this.resetState();
      this.callCount++;
      const toolResult = await this.useTool("echo", { message: goal }, ctx);
      this.trackUsage(50, 0.001);
      return this.buildResult(
        toolResult.success ? "completed" : "failed",
        toolResult.output
      );
    }
  }

  class EchoTool extends Tool {
    readonly name = "echo";
    readonly description = "Echoes";
    readonly category = "test";
    readonly schema = { type: "object" };
    async execute(p: unknown, _c: AgentContext): Promise<ToolResult> {
      return { success: true, output: (p as { message: string }).message };
    }
  }

  test("dispatches tool and records call", async () => {
    const agent = new ConcreteAgent();
    const registry = new ToolRegistry().register(new EchoTool()) as ToolRegistry;
    agent.withTools(registry);
    const result = await agent.execute("hello", TEST_CTX);
    expect(result.status).toBe("completed");
    expect(result.output).toBe("hello");
    expect(result.toolCalls).toHaveLength(1);
  });

  test("missing tool returns failed ToolResult", async () => {
    const agent = new ConcreteAgent();
    agent.withTools(new ToolRegistry());
    const result = await agent.execute("hi", TEST_CTX);
    expect(result.status).toBe("failed");
    expect(result.toolCalls[0]!.result.error).toContain("not found");
  });

  test("accumulates cost across tool calls", async () => {
    const agent = new ConcreteAgent();
    agent.withTools(new ToolRegistry().register(new EchoTool()) as ToolRegistry);
    const result = await agent.execute("test", TEST_CTX);
    expect(result.tokensUsed).toBe(50);
    expect(result.estimatedCostUsd).toBe(0.001);
  });

  test("resetState clears accumulated data between executions", async () => {
    const agent = new ConcreteAgent();
    agent.withTools(new ToolRegistry().register(new EchoTool()) as ToolRegistry);
    await agent.execute("first", TEST_CTX);
    const result2 = await agent.execute("second", TEST_CTX);
    // Second run should only have its own tool calls
    expect(result2.toolCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ReAct loop
// ---------------------------------------------------------------------------

describe("ReAct loop", () => {
  class EchoTool extends Tool {
    readonly name = "echo";
    readonly description = "Echoes";
    readonly category = "test";
    readonly schema = { type: "object" };
    async execute(p: unknown, _c: AgentContext): Promise<ToolResult> {
      return { success: true, output: `echoed: ${JSON.stringify(p)}` };
    }
  }

  function makeLLMWithResponses(...responses: string[]) {
    let i = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      const content = responses[i++] ?? "Final Answer: done";
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(makeCompletionResponse(content)),
        body: null,
      });
    });
    return new OpenRouterClient({ apiKey: "test-key", retryBaseDelayMs: 0 }, mockFetch as any);
  }

  test("terminates on Final Answer", async () => {
    const llm = makeLLMWithResponses("Thought: I know the answer\nFinal Answer: 42");
    const loop = new ReactLoop(llm, new ToolRegistry());
    const result = await loop.run("What is 6 * 7?", TEST_CTX, {
      config: { model: "openai/gpt-4o-mini", maxIterations: 5 },
    });
    expect(result.status).toBe("completed");
    expect(result.output).toBe("42");
    expect(result.iterations).toBe(1);
  });

  test("executes tool call and continues to final answer", async () => {
    const llm = makeLLMWithResponses(
      "Thought: Need to echo\nAction: echo\nAction Input: {\"message\": \"hello\"}\nObservation: ...",
      "Thought: Got echo result\nFinal Answer: echoed: hello"
    );
    const registry = new ToolRegistry().register(new EchoTool()) as ToolRegistry;
    const loop = new ReactLoop(llm, registry);
    const result = await loop.run("Echo hello", TEST_CTX, {
      config: { model: "openai/gpt-4o-mini", maxIterations: 5 },
    });
    expect(result.status).toBe("completed");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.toolName).toBe("echo");
  });

  test("returns max_iterations when limit is reached", async () => {
    const llm = makeLLMWithResponses(...Array(5).fill("Action: echo\nAction Input: {}"));
    const registry = new ToolRegistry().register(new EchoTool()) as ToolRegistry;
    const loop = new ReactLoop(llm, registry);
    const result = await loop.run("Keep going", TEST_CTX, {
      config: { model: "openai/gpt-4o-mini", maxIterations: 3 },
    });
    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(3);
  });

  test("returns failed status when LLM throws", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const llm = new OpenRouterClient(
      { apiKey: "test-key", maxRetries: 0, retryBaseDelayMs: 0 },
      mockFetch as any
    );
    const loop = new ReactLoop(llm, new ToolRegistry());
    const result = await loop.run("test", TEST_CTX, {
      config: { model: "openai/gpt-4o-mini", maxIterations: 3 },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
  });

  test("uses memory when provided", async () => {
    const llm = makeLLMWithResponses("Final Answer: remembered");
    const mem = new ConversationMemory();
    await mem.add("system", "You are helpful");
    const loop = new ReactLoop(llm, new ToolRegistry());
    const result = await loop.run("test", TEST_CTX, {
      config: { model: "openai/gpt-4o-mini", maxIterations: 3 },
    }, mem);
    expect(result.status).toBe("completed");
    // Memory should have grown with user message + assistant response
    expect(mem.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Reviewer agents
// ---------------------------------------------------------------------------

describe("ReviewerAgent", () => {
  function makeLLMWithReview(reviewJson: Record<string, unknown>) {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeCompletionResponse(
        "```json\n" + JSON.stringify(reviewJson) + "\n```"
      )),
      body: null,
    });
    return new OpenRouterClient({ apiKey: "test-key" }, mockFetch as any);
  }

  test("technical reviewer returns ReviewResult", async () => {
    const llm = makeLLMWithReview({
      type: "technical",
      score: 82,
      summary: "Technically sound with minor gaps",
      issues: [
        { severity: "suggestion", description: "Add code examples" },
        { severity: "must-fix", description: "Incorrect API method name" },
      ],
    });
    const reviewer = new ReviewerAgent(llm, "technical");
    const review = await reviewer.review("Some technical content", TEST_CTX);
    expect(review.type).toBe("technical");
    expect(review.score).toBe(82);
    expect(review.mustFix).toHaveLength(1);
    expect(review.suggestions).toHaveLength(1);
  });

  test("score is clamped to 0–100", async () => {
    const llm = makeLLMWithReview({ type: "seo", score: 150, summary: "Over-scored", issues: [] });
    const reviewer = new ReviewerAgent(llm, "seo");
    const review = await reviewer.review("content", TEST_CTX);
    expect(review.score).toBe(100);
  });

  test("fallback review returned when LLM fails", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("timeout"));
    const llm = new OpenRouterClient({ apiKey: "test-key", maxRetries: 0, retryBaseDelayMs: 0 }, mockFetch as any);
    const reviewer = new ReviewerAgent(llm, "editorial");
    const review = await reviewer.review("content", TEST_CTX);
    expect(review.type).toBe("editorial");
    expect(review.score).toBe(0);
  });
});

describe("ReviewerPipeline", () => {
  function makeLLMForPipeline(score: number) {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeCompletionResponse(
        JSON.stringify({ score, summary: "OK", issues: [] })
      )),
      body: null,
    });
    return new OpenRouterClient({ apiKey: "test-key" }, mockFetch as any);
  }

  test("runs all reviewers and returns aggregated review", async () => {
    const llm = makeLLMForPipeline(80);
    const pipeline = new ReviewerPipeline(llm, { reviewTypes: ["technical", "editorial"] });
    const agg = await pipeline.run("Content to review", TEST_CTX);
    expect(agg.reviews).toHaveLength(2);
    expect(agg.overallScore).toBeGreaterThan(0);
  });

  test("approved is true when score >= threshold and no must-fix", async () => {
    const llm = makeLLMForPipeline(85);
    const pipeline = new ReviewerPipeline(llm, {
      reviewTypes: ["editorial"],
      approvalThreshold: 70,
    });
    const agg = await pipeline.run("Good content", TEST_CTX);
    expect(agg.approved).toBe(true);
  });

  test("approved is false when score below threshold", async () => {
    const llm = makeLLMForPipeline(50);
    const pipeline = new ReviewerPipeline(llm, {
      reviewTypes: ["editorial"],
      approvalThreshold: 70,
    });
    const agg = await pipeline.run("Poor content", TEST_CTX);
    expect(agg.approved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Specialist agents (WriterAgent, ResearchAgent, EditorAgent)
// ---------------------------------------------------------------------------

describe("WriterAgent", () => {
  test("returns completed status with written content", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeCompletionResponse("# Article\n\nContent here...")),
      body: null,
    });
    const llm = new OpenRouterClient({ apiKey: "test-key" }, mockFetch as any);
    const writer = new WriterAgent(llm);
    const result = await writer.execute("Write an article about TypeScript", TEST_CTX);
    expect(result.status).toBe("completed");
    expect(result.output).toContain("Article");
    expect(result.tokensUsed).toBe(150);
  });

  test("returns failed status on LLM error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("API error"));
    const llm = new OpenRouterClient({ apiKey: "test-key", maxRetries: 0, retryBaseDelayMs: 0 }, mockFetch as any);
    const writer = new WriterAgent(llm);
    const result = await writer.execute("Write something", TEST_CTX);
    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
  });
});

describe("ResearchAgent", () => {
  test("uses ReAct loop with tools when registry provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeCompletionResponse("Final Answer: Research complete")),
      body: null,
    });
    const llm = new OpenRouterClient({ apiKey: "test-key" }, mockFetch as any);
    const researcher = new ResearchAgent(llm);
    researcher.withTools(new ToolRegistry());
    const result = await researcher.execute("Research TypeScript trends", TEST_CTX);
    expect(result.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// LeadAgent
// ---------------------------------------------------------------------------

describe("LeadAgent", () => {
  function makeLLMForLead() {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      let content: string;
      if (callCount === 1) {
        // Decompose call
        content = JSON.stringify([
          { id: "t1", agentType: "research", goal: "Research the topic", dependsOn: [] },
          { id: "t2", agentType: "writer", goal: "Write the article", dependsOn: ["t1"] },
        ]);
      } else if (callCount === 4) {
        // Synthesize call
        content = "Final synthesized output combining all results";
      } else {
        // Sub-agent calls
        content = `Result from agent call ${callCount}`;
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(makeCompletionResponse(content)),
        body: null,
      });
    });
    return new OpenRouterClient({ apiKey: "test-key" }, mockFetch as any);
  }

  test("decomposes goal and returns completed result with subTasks", async () => {
    const llm = makeLLMForLead();
    const lead = new LeadAgent(llm, { maxSubTasks: 3, maxParallelism: 2 });
    const result = await lead.execute("Create a blog post about TypeScript", TEST_CTX);
    expect(result.status).toBe("completed");
    const output = result.output as Record<string, unknown>;
    expect(Array.isArray(output.subTasks)).toBe(true);
    expect(output.synthesis).toBeDefined();
  });

  test("delegate runs a sub-agent and returns SubTaskResult", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeCompletionResponse("Research findings here")),
      body: null,
    });
    const llm = new OpenRouterClient({ apiKey: "test-key" }, mockFetch as any);
    const lead = new LeadAgent(llm);
    const subTask = { id: "t1", agentType: "writer" as const, goal: "Write intro", dependsOn: [] };
    const taskResult = await lead.delegate(subTask, TEST_CTX);
    expect(taskResult.taskId).toBe("t1");
    expect(taskResult.agentType).toBe("writer");
    expect(taskResult.result.status).toBe("completed");
  });

  test("falls back to single writer task when decompose returns non-array", async () => {
    let i = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      i++;
      const content = i === 1
        ? "not a valid json array"
        : i === 3
          ? "Synthesized output"
          : "Sub-task result";
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(makeCompletionResponse(content)),
        body: null,
      });
    });
    const llm = new OpenRouterClient({ apiKey: "test-key" }, mockFetch as any);
    const lead = new LeadAgent(llm);
    const result = await lead.execute("Do something", TEST_CTX);
    expect(result.status).toBe("completed");
    const output = result.output as Record<string, unknown>;
    expect((output.subTasks as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test("accumulates cost from all sub-agent calls", async () => {
    const llm = makeLLMForLead();
    const lead = new LeadAgent(llm);
    const result = await lead.execute("Create content", TEST_CTX);
    // 150 tokens per call × multiple calls
    expect(result.tokensUsed).toBeGreaterThan(150);
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
  });
});
