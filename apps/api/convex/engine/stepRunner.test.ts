import { describe, expect, test } from "vitest";

import { resolveInputs, buildStepContext, topologicalSort } from "./stepRunner";
import type { WorkflowStepDef, WorkflowDefinition } from "./types";

// ---------------------------------------------------------------------------
// resolveInputs
// ---------------------------------------------------------------------------

describe("resolveInputs", () => {
  const stepOutputs: Record<string, unknown> = {
    step1: { content: "Hello world", count: 42, tags: ["a", "b"] },
    step2: { result: true, nested: { deep: "value" } },
  };
  const executionInput = { topic: "AI", limit: 10 };
  const workflowConfig = { apiUrl: "https://api.example.com", maxRetries: 3 };

  test("returns non-string primitives unchanged", () => {
    expect(resolveInputs(42, stepOutputs, executionInput, workflowConfig)).toBe(42);
    expect(resolveInputs(true, stepOutputs, executionInput, workflowConfig)).toBe(true);
    expect(resolveInputs(null, stepOutputs, executionInput, workflowConfig)).toBe(null);
    expect(resolveInputs(undefined, stepOutputs, executionInput, workflowConfig)).toBe(undefined);
  });

  test("returns strings without templates unchanged", () => {
    expect(resolveInputs("plain text", stepOutputs, executionInput, workflowConfig)).toBe(
      "plain text"
    );
  });

  test("resolves single template to native type", () => {
    // Object
    expect(resolveInputs("{{step1}}", stepOutputs, executionInput, workflowConfig)).toEqual({
      content: "Hello world",
      count: 42,
      tags: ["a", "b"],
    });

    // Nested property
    expect(resolveInputs("{{step1.content}}", stepOutputs, executionInput, workflowConfig)).toBe(
      "Hello world"
    );

    // Number
    expect(resolveInputs("{{step1.count}}", stepOutputs, executionInput, workflowConfig)).toBe(42);

    // Boolean
    expect(resolveInputs("{{step2.result}}", stepOutputs, executionInput, workflowConfig)).toBe(
      true
    );

    // Deep nested
    expect(
      resolveInputs("{{step2.nested.deep}}", stepOutputs, executionInput, workflowConfig)
    ).toBe("value");
  });

  test("resolves input references", () => {
    expect(resolveInputs("{{input.topic}}", stepOutputs, executionInput, workflowConfig)).toBe(
      "AI"
    );
    expect(resolveInputs("{{input.limit}}", stepOutputs, executionInput, workflowConfig)).toBe(10);
  });

  test("resolves config references", () => {
    expect(resolveInputs("{{config.apiUrl}}", stepOutputs, executionInput, workflowConfig)).toBe(
      "https://api.example.com"
    );
    expect(
      resolveInputs("{{config.maxRetries}}", stepOutputs, executionInput, workflowConfig)
    ).toBe(3);
  });

  test("resolves mixed text and templates as string", () => {
    expect(
      resolveInputs(
        "Topic: {{input.topic}}, Count: {{step1.count}}",
        stepOutputs,
        executionInput,
        workflowConfig
      )
    ).toBe("Topic: AI, Count: 42");
  });

  test("resolves undefined references as empty string in mixed templates", () => {
    expect(
      resolveInputs("Value: {{nonexistent.key}}", stepOutputs, executionInput, workflowConfig)
    ).toBe("Value: ");
  });

  test("resolves arrays recursively", () => {
    const input = ["{{step1.content}}", "static", "{{input.topic}}"];
    const result = resolveInputs(input, stepOutputs, executionInput, workflowConfig);
    expect(result).toEqual(["Hello world", "static", "AI"]);
  });

  test("resolves objects recursively", () => {
    const input = {
      title: "{{step1.content}}",
      meta: { topic: "{{input.topic}}", count: "{{step1.count}}" },
    };
    const result = resolveInputs(input, stepOutputs, executionInput, workflowConfig);
    expect(result).toEqual({
      title: "Hello world",
      meta: { topic: "AI", count: 42 },
    });
  });

  test("handles objects in mixed templates by stringifying", () => {
    const result = resolveInputs("Data: {{step1}}", stepOutputs, executionInput, workflowConfig);
    expect(typeof result).toBe("string");
    expect((result as string).startsWith("Data: ")).toBe(true);
    expect((result as string).includes("Hello world")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildStepContext
// ---------------------------------------------------------------------------

describe("buildStepContext", () => {
  test("builds a valid StepContext", () => {
    const stepDef: WorkflowStepDef = {
      id: "step-1",
      name: "Test Step",
      type: "agent",
      config: {
        prompt: "Hello",
      },
    };

    const workflow: WorkflowDefinition = {
      name: "Test Workflow",
      version: 1,
      trigger: { type: "manual" },
      steps: [stepDef],
    };

    const ctx = buildStepContext({
      executionId: "exec-123",
      workspaceId: "ws-456",
      operatorId: "op-789",
      workflow,
      stepOutputs: { prev: { data: "test" } },
      currentStep: stepDef,
      config: { key: "value" },
    });

    expect(ctx.executionId).toBe("exec-123");
    expect(ctx.workspaceId).toBe("ws-456");
    expect(ctx.operatorId).toBe("op-789");
    expect(ctx.workflow).toBe(workflow);
    expect(ctx.stepOutputs).toEqual({ prev: { data: "test" } });
    expect(ctx.currentStep).toBe(stepDef);
    expect(ctx.config).toEqual({ key: "value" });
  });

  test("handles missing optional fields", () => {
    const stepDef: WorkflowStepDef = {
      id: "step-1",
      name: "Test Step",
      type: "tool",
      config: { toolName: "test", params: {} },
    };

    const workflow: WorkflowDefinition = {
      name: "Test",
      version: 1,
      trigger: { type: "manual" },
      steps: [stepDef],
    };

    const ctx = buildStepContext({
      executionId: "exec-123",
      workspaceId: "ws-456",
      workflow,
      stepOutputs: {},
      currentStep: stepDef,
      config: {},
    });

    expect(ctx.operatorId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// topologicalSort
// ---------------------------------------------------------------------------

describe("topologicalSort", () => {
  test("sorts steps with no dependencies", () => {
    const steps: WorkflowStepDef[] = [
      { id: "a", name: "A", type: "agent", config: { prompt: "a" } },
      { id: "b", name: "B", type: "agent", config: { prompt: "b" } },
      { id: "c", name: "C", type: "agent", config: { prompt: "c" } },
    ];

    const sorted = topologicalSort(steps);
    expect(sorted).toHaveLength(3);
    expect(sorted).toContain("a");
    expect(sorted).toContain("b");
    expect(sorted).toContain("c");
  });

  test("respects linear dependencies", () => {
    const steps: WorkflowStepDef[] = [
      { id: "a", name: "A", type: "agent", config: { prompt: "a" } },
      { id: "b", name: "B", type: "agent", config: { prompt: "b" }, dependsOn: ["a"] },
      { id: "c", name: "C", type: "agent", config: { prompt: "c" }, dependsOn: ["b"] },
    ];

    const sorted = topologicalSort(steps);
    expect(sorted).toEqual(["a", "b", "c"]);
  });

  test("handles diamond dependencies", () => {
    const steps: WorkflowStepDef[] = [
      { id: "a", name: "A", type: "agent", config: { prompt: "a" } },
      { id: "b", name: "B", type: "agent", config: { prompt: "b" }, dependsOn: ["a"] },
      { id: "c", name: "C", type: "agent", config: { prompt: "c" }, dependsOn: ["a"] },
      {
        id: "d",
        name: "D",
        type: "agent",
        config: { prompt: "d" },
        dependsOn: ["b", "c"],
      },
    ];

    const sorted = topologicalSort(steps);
    expect(sorted[0]).toBe("a");
    expect(sorted[sorted.length - 1]).toBe("d");
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("d"));
    expect(sorted.indexOf("c")).toBeLessThan(sorted.indexOf("d"));
  });

  test("throws on circular dependencies", () => {
    const steps: WorkflowStepDef[] = [
      { id: "a", name: "A", type: "agent", config: { prompt: "a" }, dependsOn: ["c"] },
      { id: "b", name: "B", type: "agent", config: { prompt: "b" }, dependsOn: ["a"] },
      { id: "c", name: "C", type: "agent", config: { prompt: "c" }, dependsOn: ["b"] },
    ];

    expect(() => topologicalSort(steps)).toThrow("Circular dependency");
  });

  test("handles single step", () => {
    const steps: WorkflowStepDef[] = [
      { id: "only", name: "Only", type: "agent", config: { prompt: "only" } },
    ];

    expect(topologicalSort(steps)).toEqual(["only"]);
  });

  test("handles complex graph with multiple roots", () => {
    const steps: WorkflowStepDef[] = [
      { id: "a", name: "A", type: "agent", config: { prompt: "a" } },
      { id: "b", name: "B", type: "agent", config: { prompt: "b" } },
      { id: "c", name: "C", type: "agent", config: { prompt: "c" }, dependsOn: ["a"] },
      { id: "d", name: "D", type: "agent", config: { prompt: "d" }, dependsOn: ["b"] },
      {
        id: "e",
        name: "E",
        type: "agent",
        config: { prompt: "e" },
        dependsOn: ["c", "d"],
      },
    ];

    const sorted = topologicalSort(steps);
    expect(sorted).toHaveLength(5);
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("c"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("d"));
    expect(sorted.indexOf("c")).toBeLessThan(sorted.indexOf("e"));
    expect(sorted.indexOf("d")).toBeLessThan(sorted.indexOf("e"));
  });
});
