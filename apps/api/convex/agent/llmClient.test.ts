import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

import { createAgentLLMClient, agentLLMCall } from "./llmClient";
import type { AgentMessage } from "./types";

// Mock the sleep utility to avoid real delays in tests
vi.mock("../lib/integrations/utils", () => ({
  sleep: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Mock fetch for OpenRouter API calls
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("OPENROUTER_API_KEY", "test-api-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mockFetch.mockReset();
});

function createMockResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

// ---------------------------------------------------------------------------
// createAgentLLMClient
// ---------------------------------------------------------------------------

describe("createAgentLLMClient", () => {
  test("returns a callable function", () => {
    const client = createAgentLLMClient({ workspaceId: "ws_123" });
    expect(typeof client).toBe("function");
  });

  test("makes LLM calls with correct format", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        model: "openai/gpt-4o-mini",
        choices: [
          {
            message: { content: "Hello!", tool_calls: null },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
    );

    const client = createAgentLLMClient({ workspaceId: "ws_123" });
    const messages: AgentMessage[] = [{ role: "user", content: "Hi", timestamp: Date.now() }];

    const result = await client(messages, { tier: "fast" });
    expect(result.content).toBe("Hello!");
    expect(result.model).toBe("openai/gpt-4o-mini");
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// agentLLMCall — Basic completion
// ---------------------------------------------------------------------------

describe("agentLLMCall — basic completion", () => {
  test("sends messages in OpenAI format", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        model: "anthropic/claude-sonnet-4-20250514",
        choices: [
          {
            message: { content: "Response text" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 20 },
      })
    );

    const messages: AgentMessage[] = [
      { role: "system", content: "You are helpful.", timestamp: Date.now() },
      { role: "user", content: "Hello", timestamp: Date.now() },
    ];

    const result = await agentLLMCall(messages, { tier: "generation" });

    expect(result.content).toBe("Response text");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify request body
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe("anthropic/claude-sonnet-4-20250514");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
  });

  test("throws when API key is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(
      agentLLMCall([{ role: "user", content: "Hi", timestamp: Date.now() }])
    ).rejects.toThrow("OPENROUTER_API_KEY");
  });

  test("estimates cost from usage", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        model: "openai/gpt-4o-mini",
        choices: [{ message: { content: "Hi" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1000, completion_tokens: 500 },
      })
    );

    const result = await agentLLMCall([{ role: "user", content: "Hi", timestamp: Date.now() }], {
      tier: "fast",
    });

    // gpt-4o-mini: input $0.15/1M, output $0.60/1M
    // 1000 input tokens = $0.00015, 500 output tokens = $0.0003
    expect(result.cost).toBeCloseTo(0.00015 + 0.0003, 6);
  });
});

// ---------------------------------------------------------------------------
// agentLLMCall — Tool calling
// ---------------------------------------------------------------------------

describe("agentLLMCall — tool calling", () => {
  test("sends tools in request and parses tool calls from response", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        model: "anthropic/claude-sonnet-4-20250514",
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call_abc123",
                  type: "function",
                  function: {
                    name: "perplexity.search",
                    arguments: '{"query": "AI trends 2026"}',
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 30 },
      })
    );

    const messages: AgentMessage[] = [
      { role: "user", content: "Research AI trends", timestamp: Date.now() },
    ];

    const tools = [
      {
        type: "function" as const,
        function: {
          name: "perplexity.search",
          description: "Search the web",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      },
    ];

    const result = await agentLLMCall(messages, { tools });

    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].id).toBe("call_abc123");
    expect(result.toolCalls![0].name).toBe("perplexity.search");
    expect(result.toolCalls![0].arguments).toEqual({ query: "AI trends 2026" });

    // Verify tools were sent in request
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe("auto");
  });

  test("handles multiple tool calls in one response", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        model: "openai/gpt-4o",
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "search", arguments: '{"q": "a"}' },
                },
                {
                  id: "call_2",
                  type: "function",
                  function: { name: "scrape", arguments: '{"url": "https://x.com"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 80, completion_tokens: 40 },
      })
    );

    const result = await agentLLMCall(
      [{ role: "user", content: "Do research", timestamp: Date.now() }],
      { tools: [] }
    );

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls![0].name).toBe("search");
    expect(result.toolCalls![1].name).toBe("scrape");
  });

  test("returns undefined toolCalls when none present", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        model: "openai/gpt-4o-mini",
        choices: [{ message: { content: "Just text" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
    );

    const result = await agentLLMCall([{ role: "user", content: "Hi", timestamp: Date.now() }]);

    expect(result.toolCalls).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// agentLLMCall — Message formatting
// ---------------------------------------------------------------------------

describe("agentLLMCall — message formatting", () => {
  test("formats tool messages with tool_call_id", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        model: "openai/gpt-4o",
        choices: [{ message: { content: "Done" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 50, completion_tokens: 10 },
      })
    );

    const messages: AgentMessage[] = [
      { role: "user", content: "Search for AI", timestamp: Date.now() },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "search", arguments: { q: "AI" } }],
        timestamp: Date.now(),
      },
      {
        role: "tool",
        content: "Search results here",
        toolCallId: "call_1",
        toolName: "search",
        timestamp: Date.now(),
      },
    ];

    await agentLLMCall(messages);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[1].tool_calls).toBeDefined();
    expect(body.messages[1].tool_calls[0].id).toBe("call_1");
    expect(body.messages[1].tool_calls[0].function.name).toBe("search");
    expect(body.messages[2].role).toBe("tool");
    expect(body.messages[2].tool_call_id).toBe("call_1");
  });

  test("formats assistant messages with null content when tool_calls present", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        model: "openai/gpt-4o",
        choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 30, completion_tokens: 5 },
      })
    );

    const messages: AgentMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_x", name: "tool", arguments: {} }],
        timestamp: Date.now(),
      },
    ];

    await agentLLMCall(messages);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Empty content should be sent as null for OpenAI compatibility
    expect(body.messages[0].content).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// agentLLMCall — Fallback and retry
// ---------------------------------------------------------------------------

describe("agentLLMCall — fallback and retry", () => {
  test("falls back to secondary model on primary failure", async () => {
    // First call fails
    mockFetch.mockResolvedValueOnce(createMockResponse(null, false, 500));
    mockFetch.mockResolvedValueOnce(createMockResponse(null, false, 500));
    mockFetch.mockResolvedValueOnce(createMockResponse(null, false, 500));
    // Fallback succeeds
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        model: "openai/gpt-4o",
        choices: [{ message: { content: "Fallback" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
    );

    const result = await agentLLMCall([{ role: "user", content: "Hi", timestamp: Date.now() }], {
      tier: "generation",
    });

    expect(result.content).toBe("Fallback");
    expect(result.model).toBe("openai/gpt-4o");
  });

  test("throws when both primary and fallback fail", async () => {
    // All calls fail
    mockFetch.mockResolvedValue(createMockResponse(null, false, 500));

    await expect(
      agentLLMCall([{ role: "user", content: "Hi", timestamp: Date.now() }], { tier: "fast" })
    ).rejects.toThrow("Agent LLM call failed");
  });
});
