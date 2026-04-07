import { describe, expect, test } from "vitest";

import {
  executionValidator,
  integrationValidator,
  operatorValidator,
  organizationValidator,
  workspaceValidator,
  workflowValidator,
} from "./validators/index";

describe("validators", () => {
  test("organizationValidator: accepts minimal valid payload", () => {
    const result = organizationValidator.safeParse({ name: "Acme" });
    expect(result.success).toBe(true);
  });

  test("workspaceValidator: rejects empty name", () => {
    const result = workspaceValidator.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  test("workspaceValidator: rejects whitespace-only name", () => {
    const result = workspaceValidator.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  test("operatorValidator: accepts required fields", () => {
    const result = operatorValidator.safeParse({
      workspaceId: "ws_123",
      type: "agent",
      name: "My Operator",
    });
    expect(result.success).toBe(true);
  });

  test("operatorValidator: rejects missing workspaceId", () => {
    const result = operatorValidator.safeParse({ type: "agent", name: "My Operator" });
    expect(result.success).toBe(false);
  });

  test("workflowValidator: rejects missing name", () => {
    const result = workflowValidator.safeParse({});
    expect(result.success).toBe(false);
  });

  test("workflowValidator: rejects missing workspaceId", () => {
    const result = workflowValidator.safeParse({ name: "My Workflow" });
    expect(result.success).toBe(false);
  });

  test("executionValidator: accepts required ids and status", () => {
    const result = executionValidator.safeParse({
      workspaceId: "ws_123",
      workflowId: "wf_123",
      status: "queued",
    });
    expect(result.success).toBe(true);
  });

  test("integrationValidator: accepts required fields", () => {
    const result = integrationValidator.safeParse({
      workspaceId: "ws_123",
      provider: "github",
      name: "GitHub",
    });
    expect(result.success).toBe(true);
  });
});
