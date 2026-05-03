/**
 * Phase 6.4–6.6 integration tests
 *
 * Covers:
 *   6.4 – Human-in-the-Loop (approval gates, feedback requests, escalation, timeouts)
 *   6.5 – Retry & Error Handling (dead-letter queue, circuit breakers)
 *   6.6 – Observability & Monitoring (execution logs, cost tracking)
 */

import { describe, expect, test } from "vitest";

import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";

import schema from "./schema";
import {
  createExecutionImpl,
  createExecutionApprovalImpl,
  respondExecutionApprovalImpl,
  timeoutExecutionApprovalImpl,
  updateExecutionStatusImpl,
} from "./executions";
import {
  emitExecutionLogImpl,
  trackStepCostImpl,
  listExecutionLogsImpl,
  getExecutionCostSummaryImpl,
} from "./observability";
import {
  createDeadLetterEntryImpl,
  listDeadLetterEntriesImpl,
  resolveDeadLetterEntryImpl,
  getDeadLetterEntryImpl,
} from "./deadLetter";
import {
  recordCircuitEventImpl,
  checkCircuitAllowedImpl,
  getCircuitBreakerImpl,
} from "./circuitBreakers";

const modules = import.meta.glob("./**/*.*s");

function makeIdentity(partial: Partial<UserIdentity>): Partial<UserIdentity> {
  return {
    issuer: partial.issuer ?? "https://clerk.example",
    subject: partial.subject ?? "clerk_subject",
    tokenIdentifier: partial.tokenIdentifier ?? `clerk|${partial.subject ?? "clerk_subject"}`,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Shared setup helper
// ---------------------------------------------------------------------------

async function seedWorkspaceAndExecution(t: ReturnType<typeof convexTest>) {
  const [workspaceId, workflowId] = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", {
      clerkId: "clerk_owner",
      email: "owner@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Team",
      slug: "team",
      description: "",
      ownerId,
      plan: "free",
      status: "active",
      settings: {},
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: ownerId,
      role: "owner",
      joinedAt: now,
    });
    const workflowId = await ctx.db.insert("workflows", {
      workspaceId,
      operatorId: undefined,
      name: "WF",
      description: "",
      trigger: {},
      steps: {},
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    return [workspaceId, workflowId] as const;
  });
  const ownerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));
  const executionId = await ownerAuthed.mutation(async (ctx) => {
    return await createExecutionImpl(ctx, {
      workspaceId,
      workflowId,
      status: "running",
    });
  });
  return { workspaceId, workflowId, executionId, ownerAuthed };
}

// ---------------------------------------------------------------------------
// Phase 6.4: Human-in-the-Loop
// ---------------------------------------------------------------------------

describe("human-in-the-loop — approval gate", () => {
  test("approve path: respondExecutionApproval sets status to approved", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-approve",
        type: "approval",
        content: { question: "Publish this post?" },
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await respondExecutionApprovalImpl(ctx, {
        id: approvalId,
        status: "approved",
        feedback: { note: "Looks good" },
      });
    });

    const approval = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(approval!.status).toBe("approved");
    expect((approval!.feedback as Record<string, unknown>).note).toBe("Looks good");
    expect(approval!.respondedAt).toBeTypeOf("number");
    expect(approval!.respondedBy).toBeDefined();
  });

  test("reject path: respondExecutionApproval sets status to rejected", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-reject",
        type: "approval",
        content: { question: "Delete this record?" },
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await respondExecutionApprovalImpl(ctx, {
        id: approvalId,
        status: "rejected",
      });
    });

    const approval = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(approval!.status).toBe("rejected");
  });

  test("idempotent: responding twice with same status returns same id", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-idempotent",
        type: "approval",
      });
    });

    const r1 = await ownerAuthed.mutation(async (ctx) => {
      return await respondExecutionApprovalImpl(ctx, {
        id: approvalId,
        status: "approved",
      });
    });
    const r2 = await ownerAuthed.mutation(async (ctx) => {
      return await respondExecutionApprovalImpl(ctx, {
        id: approvalId,
        status: "approved",
      });
    });
    expect(r1).toBe(r2);
  });

  test("invalid timeoutBehavior is rejected", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const res = await ownerAuthed.mutation(async (ctx) => {
      try {
        return await createExecutionApprovalImpl(ctx, {
          executionId,
          stepId: "step-bad-timeout",
          type: "approval",
          timeoutBehavior: "invalid-behavior",
        });
      } catch (err) {
        return String(err);
      }
    });

    expect(String(res)).toContain("timeoutBehavior must be one of");
  });
});

describe("human-in-the-loop — timeout behavior", () => {
  test("auto-approve: sets approval status to approved with timedOut flag", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-timeout-approve",
        type: "approval",
        timeoutAt: Date.now() - 1000,
        timeoutBehavior: "auto-approve",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await timeoutExecutionApprovalImpl(ctx, { id: approvalId });
    });

    const approval = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(approval!.status).toBe("approved");
    const fb = approval!.feedback as Record<string, unknown>;
    expect(fb.timedOut).toBe(true);
    expect(fb.autoApproved).toBe(true);
  });

  test("auto-reject: sets approval status to rejected with timedOut flag", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-timeout-reject",
        type: "approval",
        timeoutAt: Date.now() - 1000,
        timeoutBehavior: "auto-reject",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await timeoutExecutionApprovalImpl(ctx, { id: approvalId });
    });

    const approval = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(approval!.status).toBe("rejected");
    const fb = approval!.feedback as Record<string, unknown>;
    expect(fb.timedOut).toBe(true);
    expect(fb.autoRejected).toBe(true);
  });

  test("escalate: marks original as escalated and creates escalation approval", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-escalate",
        type: "approval",
        content: { question: "Approve critical change?" },
        timeoutAt: Date.now() - 1000,
        timeoutBehavior: "escalate",
        escalationChannel: "slack-#ops",
      });
    });

    const escalationId = await ownerAuthed.mutation(async (ctx) => {
      return await timeoutExecutionApprovalImpl(ctx, { id: approvalId });
    });

    const original = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(original!.status).toBe("escalated");
    expect((original!.feedback as Record<string, unknown>).escalated).toBe(true);

    const escalation = await t.run(async (ctx) => ctx.db.get(escalationId));
    expect(escalation).toBeDefined();
    expect(escalation!.type).toBe("escalation");
    expect(escalation!.status).toBe("pending");
    const content = escalation!.content as Record<string, unknown>;
    expect(content.channel).toBe("slack-#ops");
  });

  test("non-timed-out approval is not processed", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-not-yet-timed-out",
        type: "approval",
        timeoutAt: Date.now() + 60_000,
        timeoutBehavior: "auto-reject",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await timeoutExecutionApprovalImpl(ctx, { id: approvalId });
    });

    const approval = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(approval!.status).toBe("pending");
  });

  test("default timeout behavior (no timeoutBehavior) falls back to auto-reject", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-default-timeout",
        type: "approval",
        timeoutAt: Date.now() - 1,
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await timeoutExecutionApprovalImpl(ctx, { id: approvalId });
    });

    const approval = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(approval!.status).toBe("rejected");
  });
});

describe("human-in-the-loop — feedback request and escalation step types", () => {
  test("feedback request approval type is accepted and respondable", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-feedback",
        type: "feedback",
        content: { prompt: "Rate the quality of this draft (1-5):" },
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await respondExecutionApprovalImpl(ctx, {
        id: approvalId,
        status: "approved",
        feedback: { rating: 4, comments: "Good, minor tweaks needed" },
      });
    });

    const approval = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(approval!.type).toBe("feedback");
    expect(approval!.status).toBe("approved");
    const fb = approval!.feedback as Record<string, unknown>;
    expect(fb.rating).toBe(4);
  });

  test("escalation step type is accepted and respondable", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-escalation",
        type: "escalation",
        content: {
          reason: "Budget threshold exceeded",
          channel: "email:cto@example.com",
        },
      });
    });

    const approval = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(approval!.type).toBe("escalation");
    expect(approval!.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// Phase 6.5: Dead-letter queue
// ---------------------------------------------------------------------------

describe("dead-letter queue", () => {
  test("create and retrieve a dead-letter entry", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const entryId = await ownerAuthed.mutation(async (ctx) => {
      return await createDeadLetterEntryImpl(ctx, {
        executionId,
        stepId: "step-final-fail",
        reason: "Max retries exceeded",
        originalError: { message: "Connection timeout", code: "ETIMEDOUT" },
        retryCount: 5,
      });
    });

    const entry = await ownerAuthed.query(async (ctx) => {
      return await getDeadLetterEntryImpl(ctx, { id: entryId });
    });

    expect(entry.reason).toBe("Max retries exceeded");
    expect(entry.retryCount).toBe(5);
    expect(entry.resolvedAt).toBeUndefined();
    expect((entry.originalError as Record<string, unknown>).code).toBe("ETIMEDOUT");
  });

  test("list dead-letter entries for workspace, unresolvedOnly filter", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId, executionId, ownerAuthed } =
      await seedWorkspaceAndExecution(t);

    const e1 = await ownerAuthed.mutation(async (ctx) => {
      return await createDeadLetterEntryImpl(ctx, {
        executionId,
        reason: "Error A",
        retryCount: 3,
      });
    });
    await ownerAuthed.mutation(async (ctx) => {
      return await createDeadLetterEntryImpl(ctx, {
        executionId,
        reason: "Error B",
        retryCount: 2,
      });
    });

    // Resolve first entry
    await ownerAuthed.mutation(async (ctx) => {
      return await resolveDeadLetterEntryImpl(ctx, { id: e1 });
    });

    const all = await ownerAuthed.query(async (ctx) => {
      return await listDeadLetterEntriesImpl(ctx, { workspaceId });
    });
    expect(all.length).toBe(2);

    const unresolved = await ownerAuthed.query(async (ctx) => {
      return await listDeadLetterEntriesImpl(ctx, {
        workspaceId,
        unresolvedOnly: true,
      });
    });
    expect(unresolved.length).toBe(1);
    expect(unresolved[0].reason).toBe("Error B");
  });

  test("resolve is idempotent", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const entryId = await ownerAuthed.mutation(async (ctx) => {
      return await createDeadLetterEntryImpl(ctx, {
        executionId,
        reason: "Idempotent test",
        retryCount: 1,
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await resolveDeadLetterEntryImpl(ctx, { id: entryId });
    });
    const r2 = await ownerAuthed.mutation(async (ctx) => {
      return await resolveDeadLetterEntryImpl(ctx, { id: entryId });
    });
    expect(r2).toBe(entryId);

    const entry = await t.run(async (ctx) => ctx.db.get(entryId));
    expect(entry!.resolvedAt).toBeTypeOf("number");
  });

  test("reason is required", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const res = await ownerAuthed.mutation(async (ctx) => {
      try {
        return await createDeadLetterEntryImpl(ctx, {
          executionId,
          reason: "  ",
          retryCount: 1,
        });
      } catch (err) {
        return String(err);
      }
    });
    expect(String(res)).toContain("reason is required");
  });
});

// ---------------------------------------------------------------------------
// Phase 6.5: Circuit breakers (Convex persistence layer)
// ---------------------------------------------------------------------------

describe("circuit breakers", () => {
  test("starts in closed state; failure events accumulate", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    await ownerAuthed.mutation(async (ctx) => {
      return await recordCircuitEventImpl(ctx, {
        workspaceId,
        key: "openrouter:completion",
        event: "failure",
        config: { failureThreshold: 3, successThreshold: 2, halfOpenAfterMs: 10_000 },
      });
    });

    const cb = await ownerAuthed.query(async (ctx) => {
      return await getCircuitBreakerImpl(ctx, {
        workspaceId,
        key: "openrouter:completion",
      });
    });

    expect(cb).toBeDefined();
    expect(cb!.state).toBe("closed");
    expect(cb!.failureCount).toBe(1);
  });

  test("circuit opens after failureThreshold failures", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    for (let i = 0; i < 3; i++) {
      await ownerAuthed.mutation(async (ctx) => {
        return await recordCircuitEventImpl(ctx, {
          workspaceId,
          key: "slack:message",
          event: "failure",
          config: { failureThreshold: 3, successThreshold: 2, halfOpenAfterMs: 10_000 },
        });
      });
    }

    const cb = await ownerAuthed.query(async (ctx) => {
      return await getCircuitBreakerImpl(ctx, {
        workspaceId,
        key: "slack:message",
      });
    });

    expect(cb!.state).toBe("open");
    expect(cb!.failureCount).toBe(3);
    expect(cb!.nextRetryAt).toBeTypeOf("number");
  });

  test("checkCircuitAllowed returns false when circuit is open", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await ownerAuthed.mutation(async (ctx) => {
        return await recordCircuitEventImpl(ctx, {
          workspaceId,
          key: "github:api",
          event: "failure",
          config: { failureThreshold: 3, successThreshold: 2, halfOpenAfterMs: 10_000 },
        });
      });
    }

    const result = await ownerAuthed.mutation(async (ctx) => {
      return await checkCircuitAllowedImpl(ctx, {
        workspaceId,
        key: "github:api",
        config: { failureThreshold: 3, successThreshold: 2, halfOpenAfterMs: 10_000 },
      });
    });

    expect(result.allowed).toBe(false);
  });

  test("success resets failure count in closed state", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    // Two failures
    for (let i = 0; i < 2; i++) {
      await ownerAuthed.mutation(async (ctx) => {
        return await recordCircuitEventImpl(ctx, {
          workspaceId,
          key: "webhook:post",
          event: "failure",
          config: { failureThreshold: 5, successThreshold: 2, halfOpenAfterMs: 10_000 },
        });
      });
    }

    // One success — resets failure count
    await ownerAuthed.mutation(async (ctx) => {
      return await recordCircuitEventImpl(ctx, {
        workspaceId,
        key: "webhook:post",
        event: "success",
        config: { failureThreshold: 5, successThreshold: 2, halfOpenAfterMs: 10_000 },
      });
    });

    const cb = await ownerAuthed.query(async (ctx) => {
      return await getCircuitBreakerImpl(ctx, { workspaceId, key: "webhook:post" });
    });

    expect(cb!.state).toBe("closed");
    expect(cb!.failureCount).toBe(0);
  });

  test("checkCircuitAllowed returns true for new (auto-created) key", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const result = await ownerAuthed.mutation(async (ctx) => {
      return await checkCircuitAllowedImpl(ctx, {
        workspaceId,
        key: "brand-new-integration",
      });
    });

    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 6.6: Observability — execution logs
// ---------------------------------------------------------------------------

describe("observability — execution logs", () => {
  test("emitExecutionLog creates a log and is queryable", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    await ownerAuthed.mutation(async (ctx) => {
      return await emitExecutionLogImpl(ctx, {
        executionId,
        stepId: "step-1",
        event: "step.started",
        level: "info",
        message: "Step started",
        metadata: { attempt: 1 },
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await emitExecutionLogImpl(ctx, {
        executionId,
        stepId: "step-1",
        event: "step.completed",
        level: "info",
        message: "Step completed",
        durationMs: 250,
        tokensUsed: 800,
        estimatedCostUsd: 0.0016,
      });
    });

    const logs = await ownerAuthed.query(async (ctx) => {
      return await listExecutionLogsImpl(ctx, { executionId });
    });

    expect(logs.length).toBe(2);
    const completedLog = logs.find((l) => l.event === "step.completed");
    expect(completedLog).toBeDefined();
    expect(completedLog!.durationMs).toBe(250);
    expect(completedLog!.tokensUsed).toBe(800);
  });

  test("listExecutionLogs filters by event type", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    await ownerAuthed.mutation(async (ctx) => {
      return await emitExecutionLogImpl(ctx, {
        executionId,
        event: "step.started",
        level: "info",
        message: "A",
      });
    });
    await ownerAuthed.mutation(async (ctx) => {
      return await emitExecutionLogImpl(ctx, {
        executionId,
        event: "step.failed",
        level: "error",
        message: "B",
      });
    });
    await ownerAuthed.mutation(async (ctx) => {
      return await emitExecutionLogImpl(ctx, {
        executionId,
        event: "step.started",
        level: "info",
        message: "C",
      });
    });

    const startedLogs = await ownerAuthed.query(async (ctx) => {
      return await listExecutionLogsImpl(ctx, {
        executionId,
        event: "step.started",
      });
    });

    expect(startedLogs.length).toBe(2);
    expect(startedLogs.every((l) => l.event === "step.started")).toBe(true);
  });

  test("event and message are required", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const res = await ownerAuthed.mutation(async (ctx) => {
      try {
        return await emitExecutionLogImpl(ctx, {
          executionId,
          event: "",
          level: "info",
          message: "something",
        });
      } catch (err) {
        return String(err);
      }
    });
    expect(String(res)).toContain("event is required");
  });
});

// ---------------------------------------------------------------------------
// Phase 6.6: Observability — cost tracking
// ---------------------------------------------------------------------------

describe("observability — cost tracking", () => {
  test("trackStepCost rolls up to execution cost and emits a log", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("executionSteps", {
        executionId,
        stepId: "step-llm",
        name: "LLM call",
        type: "llm",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await trackStepCostImpl(ctx, {
        executionId,
        stepDocId,
        tokensUsed: 1500,
        estimatedCostUsd: 0.003,
        toolCallCount: 2,
      });
    });
    await ownerAuthed.mutation(async (ctx) => {
      return await trackStepCostImpl(ctx, {
        executionId,
        stepDocId,
        tokensUsed: 500,
        estimatedCostUsd: 0.001,
        toolCallCount: 1,
      });
    });

    // Cost should have rolled up to execution
    const exe = await t.run(async (ctx) => ctx.db.get(executionId));
    expect(exe!.cost).toBeCloseTo(0.004, 6);

    const summary = await ownerAuthed.query(async (ctx) => {
      return await getExecutionCostSummaryImpl(ctx, { executionId });
    });

    expect(summary.totalTokens).toBe(2000);
    expect(summary.totalCostUsd).toBeCloseTo(0.004, 6);
    expect(summary.totalToolCalls).toBe(3);
    expect(summary.logCount).toBe(2);
  });

  test("trackStepCost rejects mismatched step", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    // Create a second execution inline (same workspace) and insert a step for it
    const foreignStepDocId = await ownerAuthed.mutation(async (ctx) => {
      const exe = await ctx.db.get(executionId);
      const now = Date.now();
      const otherExecutionId = await ctx.db.insert("executions", {
        workspaceId: exe!.workspaceId,
        workflowId: exe!.workflowId,
        status: "running",
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.insert("executionSteps", {
        executionId: otherExecutionId,
        stepId: "step-foreign",
        name: "Foreign",
        type: "task",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });
    });

    const res = await ownerAuthed.mutation(async (ctx) => {
      try {
        return await trackStepCostImpl(ctx, {
          executionId,
          stepDocId: foreignStepDocId,
          tokensUsed: 100,
          estimatedCostUsd: 0.0001,
        });
      } catch (err) {
        return String(err);
      }
    });

    expect(String(res)).toContain("Step does not belong to this execution");
  });
});
