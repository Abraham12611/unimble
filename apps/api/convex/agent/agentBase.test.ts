import { describe, expect, test } from "vitest";

import { AgentBase } from "./agentBase";
import type { LLMCallFn, ToolExecutorFn } from "./agentBase";
import type { AgentConfig, AgentContext } from "./types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: "test-agent",
    name: "Test Agent",
    description: "A test agent",
    systemPrompt: "You are a helpful test agent.",
    modelTier: "fast",
    mode: "react",
    maxIterations: 5,
    temperature: 0.7,
    tools: ["*"],
    ...overrides,
  };
}

function makeContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    workspaceId: "ws-123",
    goal: "Answer the question: What is 2+2?",
    tools: [
      {
        id: "calculator.add",
        name: "Add Numbers",
        description: "Adds two numbers",
        category: "utility",
        parameters: {
          type: "object",
          properties: {
            a: { type: "string", description: "First number" },
            b: { type: "string", description: "Second number" },
          },
          required: ["a", "b"],
        },
      },
    ],
    memories: [],
    config: makeConfig(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentBase", () => {
  test("executes single-shot with final answer (no tool calls)", async () => {
    const config = makeConfig();
    const context = makeContext();
    const agent = new AgentBase(config);

    const mockLLM: LLMCallFn = async () => ({
      content: "FINAL_ANSWER: The answer is 4",
      model: "test-model",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      cost: 0.001,
    });

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: true,
      data: null,
      durationMs: 0,
    });

    const result = await agent.execute(context, mockLLM, mockToolExecutor);

    expect(result.status).toBe("complete");
    expect(result.output).toBe("The answer is 4");
    expect(result.steps).toHaveLength(1);
    expect(result.currentIteration).toBe(1);
  });

  test("executes tool call then final answer", async () => {
    const config = makeConfig();
    const context = makeContext();
    const agent = new AgentBase(config);

    let callCount = 0;
    const mockLLM: LLMCallFn = async () => {
      callCount++;
      if (callCount === 1) {
        // First call: use a tool
        return {
          content: "",
          toolCalls: [{ name: "calculator.add", arguments: { a: "2", b: "2" } }],
          model: "test-model",
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          cost: 0.001,
        };
      }
      // Second call: final answer
      return {
        content: "FINAL_ANSWER: 2 + 2 = 4",
        model: "test-model",
        usage: { promptTokens: 15, completionTokens: 5, totalTokens: 20 },
        cost: 0.001,
      };
    };

    const mockToolExecutor: ToolExecutorFn = async (toolId, params) => {
      expect(toolId).toBe("calculator.add");
      expect(params.a).toBe("2");
      return { success: true, data: "4", durationMs: 10, cost: 0 };
    };

    const result = await agent.execute(context, mockLLM, mockToolExecutor);

    expect(result.status).toBe("complete");
    expect(result.output).toBe("2 + 2 = 4");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].action.type).toBe("tool_call");
    expect(result.steps[1].action.type).toBe("final_answer");
  });

  test("fails after max iterations", async () => {
    const config = makeConfig({ maxIterations: 3 });
    const context = makeContext({ config: makeConfig({ maxIterations: 3 }) });
    const agent = new AgentBase(config);

    // LLM always calls a tool, never gives final answer
    const mockLLM: LLMCallFn = async () => ({
      content: "",
      toolCalls: [{ name: "calculator.add", arguments: { a: "1", b: "1" } }],
      model: "test-model",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      cost: 0.001,
    });

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: true,
      data: "2",
      durationMs: 5,
    });

    const result = await agent.execute(context, mockLLM, mockToolExecutor);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("maximum iterations");
    expect(result.steps).toHaveLength(3);
  });

  test("handles tool execution errors gracefully", async () => {
    const config = makeConfig();
    const context = makeContext();
    const agent = new AgentBase(config);

    let callCount = 0;
    const mockLLM: LLMCallFn = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: "",
          toolCalls: [{ name: "calculator.add", arguments: { a: "x", b: "y" } }],
          model: "test-model",
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          cost: 0.001,
        };
      }
      return {
        content: "FINAL_ANSWER: I encountered an error with the calculator",
        model: "test-model",
        usage: { promptTokens: 15, completionTokens: 10, totalTokens: 25 },
        cost: 0.001,
      };
    };

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: false,
      error: "Invalid input: expected numbers",
      durationMs: 5,
    });

    const result = await agent.execute(context, mockLLM, mockToolExecutor);

    expect(result.status).toBe("complete");
    expect(result.steps[0].observation).toContain("Error");
  });

  test("handles LLM errors", async () => {
    const config = makeConfig();
    const context = makeContext();
    const agent = new AgentBase(config);

    const mockLLM: LLMCallFn = async () => {
      throw new Error("LLM service unavailable");
    };

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: true,
      data: null,
      durationMs: 0,
    });

    const result = await agent.execute(context, mockLLM, mockToolExecutor);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("LLM service unavailable");
  });

  test("handles ask_human action", async () => {
    const config = makeConfig();
    const context = makeContext();
    const agent = new AgentBase(config);

    const mockLLM: LLMCallFn = async () => ({
      content: "ASK_HUMAN: What format would you like the report in?",
      model: "test-model",
      usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
      cost: 0.001,
    });

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: true,
      data: null,
      durationMs: 0,
    });

    const result = await agent.execute(context, mockLLM, mockToolExecutor);

    expect(result.status).toBe("complete");
    expect(result.output).toEqual({
      needsHumanInput: true,
      question: "What format would you like the report in?",
    });
  });

  test("handles delegate action", async () => {
    const config = makeConfig();
    const context = makeContext();
    const agent = new AgentBase(config);

    const mockLLM: LLMCallFn = async () => ({
      content: "DELEGATE: content-writer | Write a blog post about AI trends",
      model: "test-model",
      usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
      cost: 0.001,
    });

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: true,
      data: null,
      durationMs: 0,
    });

    const result = await agent.execute(context, mockLLM, mockToolExecutor);

    expect(result.status).toBe("complete");
    expect(result.output).toEqual({
      delegated: true,
      agentId: "content-writer",
      task: "Write a blog post about AI trends",
    });
  });

  test("tracks total cost across steps (LLM + tool costs)", async () => {
    const config = makeConfig();
    const context = makeContext();
    const agent = new AgentBase(config);

    let callCount = 0;
    const mockLLM: LLMCallFn = async () => {
      callCount++;
      if (callCount <= 2) {
        return {
          content: "",
          toolCalls: [{ name: "calculator.add", arguments: { a: "1", b: "1" } }],
          model: "test-model",
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          cost: 0.01,
        };
      }
      return {
        content: "FINAL_ANSWER: Done",
        model: "test-model",
        usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
        cost: 0.01,
      };
    };

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: true,
      data: "2",
      durationMs: 5,
      cost: 0.05,
    });

    const result = await agent.execute(context, mockLLM, mockToolExecutor);

    expect(result.status).toBe("complete");
    // 2 tool steps: (0.01 LLM + 0.05 tool) × 2 = 0.12
    // 1 final step: 0.01 LLM
    // Total: 0.13
    expect(result.totalCost).toBeCloseTo(0.13, 5);
  });

  test("builds initial messages with system prompt and goal", async () => {
    const config = makeConfig({ systemPrompt: "You are a research assistant." });
    const context = makeContext({
      goal: "Find information about quantum computing",
      config: makeConfig({ systemPrompt: "You are a research assistant." }),
      memories: [
        {
          id: "mem-1",
          scope: "workspace",
          scopeId: "ws-123",
          category: "preference",
          content: "User prefers concise answers",
          importance: 0.8,
          createdAt: Date.now(),
          accessCount: 3,
        },
      ],
    });
    const agent = new AgentBase(config);

    const mockLLM: LLMCallFn = async (messages) => {
      // Verify messages structure
      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toContain("You are a research assistant");
      expect(messages[0].content).toContain("User prefers concise answers");
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toContain("quantum computing");

      return {
        content: "FINAL_ANSWER: Quantum computing uses qubits",
        model: "test-model",
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
        cost: 0.002,
      };
    };

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: true,
      data: null,
      durationMs: 0,
    });

    const result = await agent.execute(context, mockLLM, mockToolExecutor);
    expect(result.status).toBe("complete");
  });
});
