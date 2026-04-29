import { describe, expect, test } from "vitest";

import { evaluateExpression, resolveExpressionValue } from "./expressionEvaluator";

describe("evaluateExpression", () => {
  const stepOutputs: Record<string, unknown> = {
    research: { content: "AI trends", score: 85, tags: ["ai", "ml", "tech"] },
    draft: { wordCount: 1500, approved: true, title: "AI in 2026" },
    empty: { value: null, text: "", count: 0 },
  };
  const config = { threshold: 80, category: "tech" };

  // Equality
  test("== with string values", () => {
    expect(evaluateExpression('{{research.content}} == "AI trends"', stepOutputs, config)).toBe(
      true
    );
    expect(evaluateExpression('{{research.content}} == "other"', stepOutputs, config)).toBe(false);
  });

  test("== with numeric values", () => {
    expect(evaluateExpression("{{research.score}} == 85", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("{{research.score}} == 90", stepOutputs, config)).toBe(false);
  });

  test("== with boolean values", () => {
    expect(evaluateExpression("{{draft.approved}} == true", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("{{draft.approved}} == false", stepOutputs, config)).toBe(false);
  });

  // Inequality
  test("!= operator", () => {
    expect(evaluateExpression('{{research.content}} != "other"', stepOutputs, config)).toBe(true);
    expect(evaluateExpression('{{research.content}} != "AI trends"', stepOutputs, config)).toBe(
      false
    );
  });

  // Numeric comparisons
  test("> operator", () => {
    expect(evaluateExpression("{{research.score}} > 80", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("{{research.score}} > 85", stepOutputs, config)).toBe(false);
    expect(evaluateExpression("{{research.score}} > 90", stepOutputs, config)).toBe(false);
  });

  test("< operator", () => {
    expect(evaluateExpression("{{research.score}} < 90", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("{{research.score}} < 85", stepOutputs, config)).toBe(false);
  });

  test(">= operator", () => {
    expect(evaluateExpression("{{research.score}} >= 85", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("{{research.score}} >= 80", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("{{research.score}} >= 90", stepOutputs, config)).toBe(false);
  });

  test("<= operator", () => {
    expect(evaluateExpression("{{research.score}} <= 85", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("{{research.score}} <= 90", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("{{research.score}} <= 80", stepOutputs, config)).toBe(false);
  });

  // Contains
  test("contains with string", () => {
    expect(evaluateExpression('{{research.content}} contains "AI"', stepOutputs, config)).toBe(
      true
    );
    expect(
      evaluateExpression('{{research.content}} contains "blockchain"', stepOutputs, config)
    ).toBe(false);
  });

  test("contains with array", () => {
    expect(evaluateExpression('{{research.tags}} contains "ai"', stepOutputs, config)).toBe(true);
    expect(evaluateExpression('{{research.tags}} contains "blockchain"', stepOutputs, config)).toBe(
      false
    );
  });

  // Truthy/falsy
  test("truthy check", () => {
    expect(evaluateExpression("{{draft.approved}}", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("{{research.content}}", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("{{research.score}}", stepOutputs, config)).toBe(true);
  });

  test("falsy check with !", () => {
    expect(evaluateExpression("!{{empty.value}}", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("!{{empty.text}}", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("!{{empty.count}}", stepOutputs, config)).toBe(true);
    expect(evaluateExpression("!{{draft.approved}}", stepOutputs, config)).toBe(false);
  });

  // Config references
  test("config references in expressions", () => {
    expect(
      evaluateExpression("{{research.score}} >= {{config.threshold}}", stepOutputs, config)
    ).toBe(true);
    expect(evaluateExpression('{{config.category}} == "tech"', stepOutputs, config)).toBe(true);
  });

  // Edge cases
  test("handles missing references gracefully", () => {
    expect(evaluateExpression("{{nonexistent.key}}", stepOutputs, config)).toBe(false);
    expect(evaluateExpression("!{{nonexistent.key}}", stepOutputs, config)).toBe(true);
  });

  test("handles whitespace in expressions", () => {
    expect(evaluateExpression("  {{research.score}}  ==  85  ", stepOutputs, config)).toBe(true);
  });
});

describe("resolveExpressionValue", () => {
  const stepOutputs = { step1: { value: 42 } };
  const config = { key: "val" };

  test("resolves template references", () => {
    expect(resolveExpressionValue("{{step1.value}}", stepOutputs, config)).toBe(42);
  });

  test("resolves double-quoted strings", () => {
    expect(resolveExpressionValue('"hello"', stepOutputs, config)).toBe("hello");
  });

  test("resolves single-quoted strings", () => {
    expect(resolveExpressionValue("'hello'", stepOutputs, config)).toBe("hello");
  });

  test("resolves booleans", () => {
    expect(resolveExpressionValue("true", stepOutputs, config)).toBe(true);
    expect(resolveExpressionValue("false", stepOutputs, config)).toBe(false);
  });

  test("resolves null/undefined", () => {
    expect(resolveExpressionValue("null", stepOutputs, config)).toBe(null);
    expect(resolveExpressionValue("undefined", stepOutputs, config)).toBe(null);
  });

  test("resolves numbers", () => {
    expect(resolveExpressionValue("42", stepOutputs, config)).toBe(42);
    expect(resolveExpressionValue("3.14", stepOutputs, config)).toBe(3.14);
    expect(resolveExpressionValue("-1", stepOutputs, config)).toBe(-1);
    expect(resolveExpressionValue("0", stepOutputs, config)).toBe(0);
  });
});
