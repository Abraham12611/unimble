/**
 * Workflow Engine — Expression Evaluator
 *
 * Evaluates simple expressions used in conditional steps.
 * Supports comparison operators, truthy/falsy checks, and
 * string/array contains.
 *
 * This is a pure module (no external calls, no "use node")
 * so it can be tested directly.
 */

import { resolveInputs } from "./stepRunner";

/**
 * Evaluates a simple expression against step outputs and config.
 *
 * Supported expressions:
 *  - `{{stepId.output.key}} == "value"` — equality
 *  - `{{stepId.output.key}} != "value"` — inequality
 *  - `{{stepId.output.key}} > 5` — numeric comparison
 *  - `{{stepId.output.key}} < 5` — numeric comparison
 *  - `{{stepId.output.key}} >= 5` — numeric comparison
 *  - `{{stepId.output.key}} <= 5` — numeric comparison
 *  - `{{stepId.output.key}}` — truthy check
 *  - `!{{stepId.output.key}}` — falsy check
 *  - `{{stepId.output.key}} contains "text"` — string/array contains
 */
export function evaluateExpression(
  expression: string,
  stepOutputs: Record<string, unknown>,
  config: Record<string, unknown>
): boolean {
  const expr = expression.trim();

  // Comparison operators (order matters — >= before >, etc.)
  const operators = [">=", "<=", "!=", "==", ">", "<", " contains "];

  for (const op of operators) {
    const idx = expr.indexOf(op);
    if (idx === -1) continue;

    const leftRaw = expr.slice(0, idx).trim();
    const rightRaw = expr.slice(idx + op.length).trim();

    const left = resolveExpressionValue(leftRaw, stepOutputs, config);
    const right = resolveExpressionValue(rightRaw, stepOutputs, config);

    switch (op.trim()) {
      case "==":
        return left == right;
      case "!=":
        return left != right;
      case ">":
        return Number(left) > Number(right);
      case "<":
        return Number(left) < Number(right);
      case ">=":
        return Number(left) >= Number(right);
      case "<=":
        return Number(left) <= Number(right);
      case "contains":
        if (typeof left === "string") return left.includes(String(right));
        if (Array.isArray(left)) return left.includes(right);
        return false;
      default:
        return false;
    }
  }

  // Negation check
  if (expr.startsWith("!")) {
    const value = resolveExpressionValue(expr.slice(1).trim(), stepOutputs, config);
    return !value;
  }

  // Truthy check
  const value = resolveExpressionValue(expr, stepOutputs, config);
  return !!value;
}

/**
 * Resolves a value from an expression token.
 * Handles: {{template}}, "string", number, true/false, null
 */
export function resolveExpressionValue(
  token: string,
  stepOutputs: Record<string, unknown>,
  config: Record<string, unknown>
): unknown {
  // Template reference
  if (token.startsWith("{{") && token.endsWith("}}")) {
    return resolveInputs(token, stepOutputs, undefined, config);
  }

  // Quoted string
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }

  // Boolean
  if (token === "true") return true;
  if (token === "false") return false;

  // Null
  if (token === "null" || token === "undefined") return null;

  // Number
  const num = Number(token);
  if (!isNaN(num) && token !== "") return num;

  // Fallback: treat as template
  return resolveInputs(`{{${token}}}`, stepOutputs, undefined, config);
}
