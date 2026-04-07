import test from "node:test";
import assert from "node:assert/strict";

import {
  executionValidator,
  integrationValidator,
  operatorValidator,
  organizationValidator,
  workspaceValidator,
  workflowValidator,
} from "./validators/index";

test("organizationValidator: accepts minimal valid payload", () => {
  const result = organizationValidator.safeParse({ name: "Acme" });
  assert.equal(result.success, true);
});

test("workspaceValidator: rejects empty name", () => {
  const result = workspaceValidator.safeParse({ name: "" });
  assert.equal(result.success, false);
});

test("workspaceValidator: rejects whitespace-only name", () => {
  const result = workspaceValidator.safeParse({ name: "   " });
  assert.equal(result.success, false);
});

test("operatorValidator: accepts required fields", () => {
  const result = operatorValidator.safeParse({
    workspaceId: "ws_123",
    type: "agent",
    name: "My Operator",
  });
  assert.equal(result.success, true);
});

test("operatorValidator: rejects missing workspaceId", () => {
  const result = operatorValidator.safeParse({ type: "agent", name: "My Operator" });
  assert.equal(result.success, false);
});

test("workflowValidator: rejects missing name", () => {
  const result = workflowValidator.safeParse({});
  assert.equal(result.success, false);
});

test("workflowValidator: rejects missing workspaceId", () => {
  const result = workflowValidator.safeParse({ name: "My Workflow" });
  assert.equal(result.success, false);
});

test("executionValidator: accepts required ids and status", () => {
  const result = executionValidator.safeParse({
    workspaceId: "ws_123",
    workflowId: "wf_123",
    status: "queued",
  });
  assert.equal(result.success, true);
});

test("integrationValidator: accepts required fields", () => {
  const result = integrationValidator.safeParse({
    workspaceId: "ws_123",
    provider: "github",
    name: "GitHub",
  });
  assert.equal(result.success, true);
});
