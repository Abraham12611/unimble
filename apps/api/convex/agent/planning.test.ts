import { describe, expect, test } from "vitest";

import { PlanExecuteAgent } from "./planExecuteAgent";
import type { LLMCallFn, ToolExecutorFn } from "./agentBase";
import type { AgentConfig, AgentContext } from "./types";
import {
  detectErrors,
  hasHighSeverityErrors,
  selfCritique,
  correctionLoop,
  DEFAULT_CONTENT_CRITERIA,
} from "./selfCorrection";
import type { AgentMessage } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: "plan-agent",
    name: "Planning Agent",
    description: "A planning test agent",
    systemPrompt: "You are a planning agent.",
    modelTier: "fast",
    mode: "plan_execute",
    maxIterations: 10,
    temperature: 0.3,
    tools: ["*"],
    ...overrides,
  };
}

function makeContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    workspaceId: "ws-123",
    goal: "Research AI trends and write a summary",
    tools: [
      {
        id: "perplexity.search",
        name: "Web Search",
        description: "Search the web",
        category: "research",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    ],
    memories: [],
    config: makeConfig(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PlanExecuteAgent
// ---------------------------------------------------------------------------

describe("PlanExecuteAgent", () => {
  test("generates a plan and executes steps", async () => {
    const config = makeConfig();
    const context = makeContext();
    const agent = new PlanExecuteAgent(config);

    let callCount = 0;
    const mockLLM: LLMCallFn = async () => {
      callCount++;
      if (callCount === 1) {
        // Planning phase: return a plan
        return {
          content: '["Search for AI trends", "Summarize findings"]',
          model: "test",
          usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          cost: 0.001,
        };
      }
      // Execution phase: return final answers for each step
      return {
        content: "FINAL_ANSWER: Step completed successfully with results.",
        model: "test",
        usage: { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
        cost: 0.001,
      };
    };

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: true,
      data: "Tool result",
      durationMs: 10,
    });

    const result = await agent.execute(context, mockLLM, mockToolExecutor);

    expect(result.status).toBe("complete");
    expect(result.steps.length).toBeGreaterThanOrEqual(2); // plan + at least 1 execution step
    expect(agent.getPlan()).not.toBeNull();
    expect(agent.getPlan()!.completed).toBe(true);
  });

  test("handles plan step failure with revision", async () => {
    const config = makeConfig();
    const context = makeContext();
    const agent = new PlanExecuteAgent(config);

    let callCount = 0;
    const mockLLM: LLMCallFn = async () => {
      callCount++;
      if (callCount === 1) {
        // Plan
        return {
          content: '["Step that will fail", "Step that succeeds"]',
          model: "test",
          usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          cost: 0.001,
        };
      }
      if (callCount === 2) {
        // First step execution — uses a tool that fails
        return {
          content: "",
          toolCalls: [{ name: "perplexity.search", arguments: { query: "test" } }],
          model: "test",
          usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
          cost: 0.001,
        };
      }
      if (callCount === 3) {
        // Plan revision
        return {
          content: '["Alternative approach", "Summarize"]',
          model: "test",
          usage: { promptTokens: 40, completionTokens: 15, totalTokens: 55 },
          cost: 0.001,
        };
      }
      // Remaining steps succeed
      return {
        content: "FINAL_ANSWER: Done",
        model: "test",
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        cost: 0.001,
      };
    };

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: false,
      error: "API rate limited",
      durationMs: 5,
    });

    await agent.execute(context, mockLLM, mockToolExecutor);

    // Should have attempted revision
    const plan = agent.getPlan();
    expect(plan).not.toBeNull();
    expect(plan!.revisionCount).toBeGreaterThanOrEqual(1);
  });

  test("fails after max revisions exhausted", async () => {
    const config = makeConfig({ maxIterations: 20 });
    const context = makeContext({ config: makeConfig({ maxIterations: 20 }) });
    const agent = new PlanExecuteAgent(config);

    let callCount = 0;
    const mockLLM: LLMCallFn = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: '["Failing step"]',
          model: "test",
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
          cost: 0.001,
        };
      }
      // Tool call that always fails
      if (callCount % 2 === 0) {
        return {
          content: "",
          toolCalls: [{ name: "perplexity.search", arguments: { query: "x" } }],
          model: "test",
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
          cost: 0.001,
        };
      }
      // Revision attempts
      return {
        content: '["Another failing step"]',
        model: "test",
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        cost: 0.001,
      };
    };

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: false,
      error: "Always fails",
      durationMs: 5,
    });

    const result = await agent.execute(context, mockLLM, mockToolExecutor);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Max revisions");
  });

  test("parsePlanSteps handles numbered list format", async () => {
    const config = makeConfig();
    const context = makeContext();
    const agent = new PlanExecuteAgent(config);

    const mockLLM: LLMCallFn = async (messages) => {
      // Check if this is the planning call
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.content.includes("Break down")) {
        return {
          content: "1. Research the topic\n2. Draft the content\n3. Review and edit",
          model: "test",
          usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          cost: 0.001,
        };
      }
      return {
        content: "FINAL_ANSWER: Done",
        model: "test",
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        cost: 0.001,
      };
    };

    const mockToolExecutor: ToolExecutorFn = async () => ({
      success: true,
      data: "ok",
      durationMs: 5,
    });

    await agent.execute(context, mockLLM, mockToolExecutor);
    const plan = agent.getPlan();
    expect(plan).not.toBeNull();
    expect(plan!.steps.length).toBe(3);
    expect(plan!.steps[0].description).toContain("Research");
  });
});

// ---------------------------------------------------------------------------
// Self-Correction — Error Detection
// ---------------------------------------------------------------------------

describe("Self-Correction — detectErrors", () => {
  test("detects hallucinated URLs", () => {
    const output = "Visit https://example.com/fake-page for more info.";
    const errors = detectErrors(output);
    expect(errors.some((e) => e.pattern.id === "hallucination_url")).toBe(true);
  });

  test("detects TODO placeholders", () => {
    const output = "The product offers [TODO] features for developers.";
    const errors = detectErrors(output);
    expect(errors.some((e) => e.pattern.id === "todo_placeholder")).toBe(true);
  });

  test("detects meta commentary", () => {
    const output = "As an AI, I cannot access real-time data, but here is what I know.";
    const errors = detectErrors(output);
    expect(errors.some((e) => e.pattern.id === "meta_commentary")).toBe(true);
  });

  test("detects repetition", () => {
    const repeated = "This is a long repeated phrase. ";
    const output = repeated + repeated;
    const errors = detectErrors(output);
    expect(errors.some((e) => e.pattern.id === "repetition")).toBe(true);
  });

  test("returns empty for clean output", () => {
    const output =
      "This is a well-written paragraph about AI trends in 2026. It covers machine learning, natural language processing, and computer vision advances.";
    const errors = detectErrors(output);
    // Should have no high-severity errors
    expect(errors.filter((e) => e.pattern.severity === "high")).toHaveLength(0);
  });

  test("sorts by severity (high first)", () => {
    const output = "[TODO] Visit https://example.com for details.";
    const errors = detectErrors(output);
    if (errors.length >= 2) {
      expect(errors[0].pattern.severity).toBe("high");
    }
  });

  test("hasHighSeverityErrors returns true for bad output", () => {
    expect(hasHighSeverityErrors("[PLACEHOLDER] content here")).toBe(true);
  });

  test("hasHighSeverityErrors returns false for clean output", () => {
    expect(hasHighSeverityErrors("This is perfectly fine content.")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Self-Correction — selfCritique
// ---------------------------------------------------------------------------

describe("Self-Correction — selfCritique", () => {
  test("evaluates output against criteria", async () => {
    const mockLLM: LLMCallFn = async () => ({
      content: JSON.stringify({
        criteria: [
          { criterionId: "accuracy", score: 8, feedback: "Good accuracy" },
          { criterionId: "clarity", score: 7, feedback: "Clear writing" },
          { criterionId: "completeness", score: 6, feedback: "Missing some details" },
          { criterionId: "relevance", score: 9, feedback: "Very relevant" },
          { criterionId: "tone", score: 7, feedback: "Appropriate tone" },
        ],
        issues: ["Could include more examples"],
        suggestions: ["Add a code example"],
      }),
      model: "test",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      cost: 0.002,
    });

    const messages: AgentMessage[] = [
      { role: "system", content: "You are a reviewer.", timestamp: Date.now() },
    ];

    const { evaluation, cost } = await selfCritique(
      "Some output text",
      "Write about AI",
      DEFAULT_CONTENT_CRITERIA,
      mockLLM,
      messages
    );

    expect(evaluation.criteria).toHaveLength(5);
    expect(evaluation.overallScore).toBeGreaterThan(0);
    expect(evaluation.issues).toContain("Could include more examples");
    expect(cost).toBe(0.002);
  });

  test("handles malformed LLM response gracefully", async () => {
    const mockLLM: LLMCallFn = async () => ({
      content: "I think the output is pretty good overall.",
      model: "test",
      usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      cost: 0.001,
    });

    const { evaluation } = await selfCritique(
      "Output",
      "Goal",
      DEFAULT_CONTENT_CRITERIA,
      mockLLM,
      []
    );

    // Should still return valid evaluation with default scores
    expect(evaluation.criteria).toHaveLength(5);
    expect(evaluation.criteria.every((c) => c.score === 5)).toBe(true); // Default score
  });
});

// ---------------------------------------------------------------------------
// Self-Correction — correctionLoop
// ---------------------------------------------------------------------------

describe("Self-Correction — correctionLoop", () => {
  test("accepts output that passes on first critique", async () => {
    const mockLLM: LLMCallFn = async () => ({
      content: JSON.stringify({
        criteria: [
          { criterionId: "accuracy", score: 9, feedback: "Excellent" },
          { criterionId: "clarity", score: 8, feedback: "Very clear" },
          { criterionId: "completeness", score: 8, feedback: "Complete" },
          { criterionId: "relevance", score: 9, feedback: "Relevant" },
          { criterionId: "tone", score: 8, feedback: "Good tone" },
        ],
        issues: [],
        suggestions: [],
      }),
      model: "test",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      cost: 0.002,
    });

    const result = await correctionLoop(
      "Good output",
      "Write about AI",
      {
        maxAttempts: 2,
        minAcceptableScore: 7,
        criteria: DEFAULT_CONTENT_CRITERIA,
        includeCritiqueInPrompt: true,
      },
      mockLLM,
      []
    );

    expect(result.accepted).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.output).toBe("Good output");
  });

  test("corrects output that fails initial critique", async () => {
    let callCount = 0;
    const mockLLM: LLMCallFn = async () => {
      callCount++;
      if (callCount === 1) {
        // First critique: fails
        return {
          content: JSON.stringify({
            criteria: [
              { criterionId: "accuracy", score: 4, feedback: "Inaccurate" },
              { criterionId: "clarity", score: 5, feedback: "Unclear" },
              { criterionId: "completeness", score: 3, feedback: "Incomplete" },
              { criterionId: "relevance", score: 6, feedback: "Somewhat relevant" },
              { criterionId: "tone", score: 5, feedback: "OK tone" },
            ],
            issues: ["Major accuracy issues"],
            suggestions: ["Verify facts"],
          }),
          model: "test",
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          cost: 0.002,
        };
      }
      if (callCount === 2) {
        // Correction response
        return {
          content: "Here is the improved version: Corrected and accurate content about AI.",
          model: "test",
          usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
          cost: 0.002,
        };
      }
      // Second critique: passes
      return {
        content: JSON.stringify({
          criteria: [
            { criterionId: "accuracy", score: 8, feedback: "Good" },
            { criterionId: "clarity", score: 8, feedback: "Clear" },
            { criterionId: "completeness", score: 7, feedback: "Complete" },
            { criterionId: "relevance", score: 8, feedback: "Relevant" },
            { criterionId: "tone", score: 7, feedback: "Good" },
          ],
          issues: [],
          suggestions: [],
        }),
        model: "test",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        cost: 0.002,
      };
    };

    const result = await correctionLoop(
      "Bad output",
      "Write about AI",
      {
        maxAttempts: 2,
        minAcceptableScore: 7,
        criteria: DEFAULT_CONTENT_CRITERIA,
        includeCritiqueInPrompt: true,
      },
      mockLLM,
      []
    );

    expect(result.accepted).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.output).toContain("Corrected and accurate");
  });
});
