/**
 * Phase 6.4–6.6 integration tests
 *
 * Covers:
 *   6.4 – Human-in-the-Loop (approval gates, feedback requests, escalation, timeouts,
 *          batch timeout processor)
 *   6.5 – Retry & Error Handling (requeueStepWithRetry, dead-letter queue,
 *          circuit breaker gating)
 *   6.6 – Observability & Monitoring (lifecycle log emission from step transitions,
 *          cost rollup, execution log API)
 */

import { describe, expect, test } from "vitest";

import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";

import schema from "./schema";
import {
  createExecutionImpl,
  createExecutionApprovalImpl,
  createExecutionStepImpl,
  respondExecutionApprovalImpl,
  timeoutExecutionApprovalImpl,
  processTimedOutApprovalsImpl,
  updateExecutionStatusImpl,
  updateExecutionStepStatusImpl,
  requeueStepWithRetryImpl,
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
  gateWithCircuitBreakerImpl,
} from "./circuitBreakers";

const modules = import.meta.glob("./**/*.*s");

function makeIdentity(partial: Partial<UserIdentity>): Partial<UserIdentity> {
  return {
    issuer: partial.issuer ?? "https://clerk.example",
    subject: partial.subject ?? "clerk_subject",
    tokenIdentifier:
      partial.tokenIdentifier ?? `clerk|${partial.subject ?? "clerk_subject"}`,
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
// Phase 6.4: Human-in-the-Loop — approval gate
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

// ---------------------------------------------------------------------------
// Phase 6.4: Human-in-the-Loop — timeout behavior
// ---------------------------------------------------------------------------

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

  test("auto-approve: emits approval.timed-out log event", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-log-approve",
        type: "approval",
        timeoutAt: Date.now() - 1,
        timeoutBehavior: "auto-approve",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await timeoutExecutionApprovalImpl(ctx, { id: approvalId });
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("executionLogs")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId))
        .collect()
    );
    const timeoutLog = logs.find((l) => l.event === "approval.timed-out");
    expect(timeoutLog).toBeDefined();
    expect(timeoutLog!.level).toBe("warn");
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

  test("escalate: emits approval.escalated log event", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-escalate-log",
        type: "approval",
        timeoutAt: Date.now() - 1,
        timeoutBehavior: "escalate",
        escalationChannel: "pagerduty-#critical",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await timeoutExecutionApprovalImpl(ctx, { id: approvalId });
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("executionLogs")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId))
        .collect()
    );
    const escalateLog = logs.find((l) => l.event === "approval.escalated");
    expect(escalateLog).toBeDefined();
    expect(escalateLog!.level).toBe("warn");
    const meta = escalateLog!.metadata as Record<string, unknown>;
    expect(meta.channel).toBe("pagerduty-#critical");
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

// ---------------------------------------------------------------------------
// Phase 6.4: Batch timeout processor (scheduler integration point)
// ---------------------------------------------------------------------------

describe("human-in-the-loop — processTimedOutApprovals (batch processor)", () => {
  test("processes all pending timed-out approvals in one call", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    // Create 3 timed-out approvals with different behaviors
    await ownerAuthed.mutation(async (ctx) => {
      await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "batch-step-1",
        type: "approval",
        timeoutAt: Date.now() - 2000,
        timeoutBehavior: "auto-approve",
      });
      await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "batch-step-2",
        type: "approval",
        timeoutAt: Date.now() - 1000,
        timeoutBehavior: "auto-reject",
      });
      await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "batch-step-3",
        type: "approval",
        timeoutAt: Date.now() + 60_000,  // NOT yet timed out
        timeoutBehavior: "auto-reject",
      });
    });

    const result = await ownerAuthed.mutation(async (ctx) => {
      return await processTimedOutApprovalsImpl(ctx, {});
    });

    expect(result.processedCount).toBe(2);

    const all = await t.run(async (ctx) =>
      ctx.db
        .query("approvals")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId))
        .collect()
    );
    const approved = all.find((a) => a.stepId === "batch-step-1");
    const rejected = all.find((a) => a.stepId === "batch-step-2");
    const pending = all.find((a) => a.stepId === "batch-step-3");

    expect(approved!.status).toBe("approved");
    expect(rejected!.status).toBe("rejected");
    expect(pending!.status).toBe("pending");
  });

  test("batch processor is idempotent — re-running does not double-process", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "idempotent-batch",
        type: "approval",
        timeoutAt: Date.now() - 1,
        timeoutBehavior: "auto-reject",
      });
    });

    const r1 = await ownerAuthed.mutation(async (ctx) => {
      return await processTimedOutApprovalsImpl(ctx, {});
    });
    const r2 = await ownerAuthed.mutation(async (ctx) => {
      return await processTimedOutApprovalsImpl(ctx, {});
    });

    expect(r1.processedCount).toBe(1);
    expect(r2.processedCount).toBe(0);  // already processed
  });
});

// ---------------------------------------------------------------------------
// Phase 6.4: Feedback request and escalation step types
// ---------------------------------------------------------------------------

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
// Phase 6.5: Retry orchestration — requeueStepWithRetry
// ---------------------------------------------------------------------------

describe("retry orchestration — requeueStepWithRetry", () => {
  async function seedFailedStep(
    ownerAuthed: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
    executionId: ReturnType<typeof convexTest> extends { withIdentity: unknown }
      ? never
      : string,
    stepId = "step-llm"
  ) {
    // Create and immediately fail a step
    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId: executionId as any,
        stepId,
        name: "LLM Call",
        type: "llm",
        status: "running",
      });
    });
    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStepStatusImpl(ctx, {
        id: stepDocId as any,
        status: "failed",
        error: { message: "Connection timeout", code: "ETIMEDOUT" },
      });
    });
    return stepDocId;
  }

  test("re-enqueues step on first retry with exponential backoff delay", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const stepDocId = await seedFailedStep(ownerAuthed, executionId as any);

    const result = await ownerAuthed.mutation(async (ctx) => {
      return await requeueStepWithRetryImpl(ctx, {
        stepDocId: stepDocId as any,
        strategy: "exponential",
        maxAttempts: 3,
        baseDelayMs: 1000,
      });
    });

    expect(result.enqueued).toBe(true);
    if (result.enqueued) {
      expect(result.retryAttempt).toBe(1);
      expect(result.delayMs).toBe(1000);  // exponential: attempt 1 = base * 2^0 = 1000
      expect(result.retryAfter).toBeTypeOf("number");
    }

    const step = await t.run(async (ctx) => ctx.db.get(stepDocId as any));
    expect(step!.status).toBe("queued");
    expect(step!.retryCount).toBe(1);
    expect(step!.retryAfter).toBeTypeOf("number");
  });

  test("emits step.retried log on requeue", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const stepDocId = await seedFailedStep(ownerAuthed, executionId as any, "step-log-retry");

    await ownerAuthed.mutation(async (ctx) => {
      return await requeueStepWithRetryImpl(ctx, {
        stepDocId: stepDocId as any,
        strategy: "fixed",
        maxAttempts: 3,
        baseDelayMs: 500,
      });
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("executionLogs")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId as any))
        .collect()
    );
    const retriedLog = logs.find((l) => l.event === "step.retried");
    expect(retriedLog).toBeDefined();
    expect(retriedLog!.level).toBe("info");
    const meta = retriedLog!.metadata as Record<string, unknown>;
    expect(meta.retryAttempt).toBe(1);
    expect(meta.strategy).toBe("fixed");
  });

  test("sends step to dead-letter queue after max retries exhausted", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    // Seed a step that already has retryCount = 2 (at maxAttempts - 1)
    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("executionSteps", {
        executionId: executionId as any,
        stepId: "step-dlq",
        name: "Max-retry Step",
        type: "task",
        status: "failed",
        retryCount: 2,
        error: { message: "Persistent failure" },
        createdAt: now,
        updatedAt: now,
      });
    });

    // maxAttempts = 3, retryCount already = 2 → next attempt = 3 → shouldRetry(config, 3) = false
    const result = await ownerAuthed.mutation(async (ctx) => {
      return await requeueStepWithRetryImpl(ctx, {
        stepDocId: stepDocId as any,
        strategy: "exponential",
        maxAttempts: 3,
        baseDelayMs: 1000,
        error: { message: "Still failing" },
      });
    });

    expect(result.enqueued).toBe(false);
    if (!result.enqueued) {
      expect(result.dlqEntryId).toBeDefined();
    }

    // Step should still be "failed"
    const step = await t.run(async (ctx) => ctx.db.get(stepDocId as any));
    expect(step!.status).toBe("failed");

    // DLQ entry should exist
    const dlq = await t.run(async (ctx) =>
      ctx.db
        .query("deadLetterQueue")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId as any))
        .first()
    );
    expect(dlq).toBeDefined();
    expect(dlq!.reason).toBe("Max retry attempts exhausted");
    expect(dlq!.retryCount).toBe(3);
  });

  test("emits step.failed log with DLQ metadata when retries exhausted", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("executionSteps", {
        executionId: executionId as any,
        stepId: "step-dlq-log",
        name: "Failing Step",
        type: "task",
        status: "failed",
        retryCount: 4,
        createdAt: now,
        updatedAt: now,
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await requeueStepWithRetryImpl(ctx, {
        stepDocId: stepDocId as any,
        strategy: "fixed",
        maxAttempts: 3,
        baseDelayMs: 500,
      });
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("executionLogs")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId as any))
        .collect()
    );
    const failedLog = logs.find((l) => l.event === "step.failed");
    expect(failedLog).toBeDefined();
    expect(failedLog!.level).toBe("error");
    const meta = failedLog!.metadata as Record<string, unknown>;
    expect(meta.dlq).toBe(true);
  });

  test("only failed steps can be requeued", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId: executionId as any,
        stepId: "step-not-failed",
        name: "Running",
        type: "task",
        status: "running",
      });
    });

    const res = await ownerAuthed.mutation(async (ctx) => {
      try {
        return await requeueStepWithRetryImpl(ctx, {
          stepDocId: stepDocId as any,
          strategy: "fixed",
          maxAttempts: 3,
          baseDelayMs: 500,
        });
      } catch (err) {
        return String(err);
      }
    });

    expect(String(res)).toContain("Only failed steps can be requeued");
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
// Phase 6.5: Circuit breakers — Convex persistence layer
// ---------------------------------------------------------------------------

describe("circuit breakers — persistence", () => {
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
// Phase 6.5: Circuit breaker step gating (gateWithCircuitBreaker)
// ---------------------------------------------------------------------------

describe("circuit breaker — step gating", () => {
  test("skips step and emits step.skipped log when circuit is open", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId, executionId, ownerAuthed } =
      await seedWorkspaceAndExecution(t);

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await ownerAuthed.mutation(async (ctx) => {
        return await recordCircuitEventImpl(ctx, {
          workspaceId,
          key: "openai:chat",
          event: "failure",
          config: { failureThreshold: 3, successThreshold: 2, halfOpenAfterMs: 60_000 },
        });
      });
    }

    // Create a queued step
    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId,
        stepId: "step-gated",
        name: "AI Call",
        type: "llm",
        status: "queued",
      });
    });

    // Gate — should short-circuit the step
    const gate = await ownerAuthed.mutation(async (ctx) => {
      return await gateWithCircuitBreakerImpl(ctx, {
        executionId,
        stepDocId: stepDocId as any,
        key: "openai:chat",
        config: { failureThreshold: 3, successThreshold: 2, halfOpenAfterMs: 60_000 },
      });
    });

    expect(gate.allowed).toBe(false);
    expect(gate.state).toBe("open");

    // Step should be marked skipped
    const step = await t.run(async (ctx) => ctx.db.get(stepDocId as any));
    expect(step!.status).toBe("skipped");
    expect((step!.error as Record<string, unknown>).reason).toBe("circuit-open");

    // Observability log emitted
    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("executionLogs")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId))
        .collect()
    );
    const skippedLog = logs.find((l) => l.event === "step.skipped");
    expect(skippedLog).toBeDefined();
    expect(skippedLog!.level).toBe("warn");
    expect(skippedLog!.message).toContain("circuit breaker open");
  });

  test("allows step when circuit is closed", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId,
        stepId: "step-allowed",
        name: "Allowed Step",
        type: "llm",
        status: "queued",
      });
    });

    const gate = await ownerAuthed.mutation(async (ctx) => {
      return await gateWithCircuitBreakerImpl(ctx, {
        executionId,
        stepDocId: stepDocId as any,
        key: "openai:chat",
      });
    });

    expect(gate.allowed).toBe(true);

    // Step should still be queued (unchanged)
    const step = await t.run(async (ctx) => ctx.db.get(stepDocId as any));
    expect(step!.status).toBe("queued");
  });
});

// ---------------------------------------------------------------------------
// Phase 6.6: Observability — step lifecycle log emission
// ---------------------------------------------------------------------------

describe("observability — step lifecycle log emission", () => {
  test("updateExecutionStepStatus emits step.started log on running transition", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId,
        stepId: "step-lifecycle",
        name: "Process Data",
        type: "task",
        status: "queued",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStepStatusImpl(ctx, {
        id: stepDocId as any,
        status: "running",
      });
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("executionLogs")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId))
        .collect()
    );

    const startedLog = logs.find((l) => l.event === "step.started");
    expect(startedLog).toBeDefined();
    expect(startedLog!.level).toBe("info");
    expect(startedLog!.stepId).toBe("step-lifecycle");
  });

  test("updateExecutionStepStatus emits step.completed log and rolls up cost", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId,
        stepId: "step-cost",
        name: "LLM Completion",
        type: "llm",
        status: "running",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStepStatusImpl(ctx, {
        id: stepDocId as any,
        status: "completed",
        output: { text: "Done" },
        tokensUsed: 1200,
        estimatedCostUsd: 0.0024,
        toolCallCount: 3,
      });
    });

    // Log emitted
    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("executionLogs")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId))
        .collect()
    );
    const completedLog = logs.find((l) => l.event === "step.completed");
    expect(completedLog).toBeDefined();
    expect(completedLog!.tokensUsed).toBe(1200);
    expect(completedLog!.estimatedCostUsd).toBeCloseTo(0.0024, 6);
    expect((completedLog!.metadata as Record<string, unknown>).toolCallCount).toBe(3);

    // Cost rolled up to execution
    const exe = await t.run(async (ctx) => ctx.db.get(executionId));
    expect(exe!.cost).toBeCloseTo(0.0024, 6);
  });

  test("updateExecutionStepStatus emits step.failed log on failure", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId,
        stepId: "step-fail",
        name: "Failing Step",
        type: "task",
        status: "running",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStepStatusImpl(ctx, {
        id: stepDocId as any,
        status: "failed",
        error: { message: "Unexpected error" },
      });
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("executionLogs")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId))
        .collect()
    );
    const failedLog = logs.find((l) => l.event === "step.failed");
    expect(failedLog).toBeDefined();
    expect(failedLog!.level).toBe("error");
  });

  test("updateExecutionStatus emits execution.completed log on terminal transition", async () => {
    const t = convexTest({ schema, modules });
    const { executionId, ownerAuthed } = await seedWorkspaceAndExecution(t);

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, {
        id: executionId,
        status: "completed",
        output: { result: "success" },
      });
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("executionLogs")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId))
        .collect()
    );
    const completedLog = logs.find((l) => l.event === "execution.completed");
    expect(completedLog).toBeDefined();
    expect(completedLog!.level).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// Phase 6.6: Observability — execution log API and cost tracking
// ---------------------------------------------------------------------------

describe("observability — execution logs API", () => {
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
