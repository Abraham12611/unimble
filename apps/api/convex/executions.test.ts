import { describe, expect, test } from "vitest";

import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";

import schema from "./schema";
import {
  cancelExecutionImpl,
  createExecutionImpl,
  createExecutionStepImpl,
  createExecutionApprovalImpl,
  getExecutionImpl,
  getExecutionStepImpl,
  listExecutionsImpl,
  listExecutionApprovalsImpl,
  listExecutionStepsImpl,
  retryExecutionImpl,
  respondExecutionApprovalImpl,
  updateExecutionStatusImpl,
  updateExecutionStepStatusImpl,
} from "./executions";

const modules = import.meta.glob("./**/*.*s");

function makeIdentity(partial: Partial<UserIdentity>): Partial<UserIdentity> {
  return {
    issuer: partial.issuer ?? "https://clerk.example",
    subject: partial.subject ?? "clerk_subject",
    tokenIdentifier: partial.tokenIdentifier ?? `clerk|${partial.subject ?? "clerk_subject"}`,
    ...partial,
  };
}

describe("executions", () => {
  test("create/get/list/update status/cancel/retry + step ops", async () => {
    const t = convexTest({ schema, modules });

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
        status: "queued",
        input: { foo: "bar" },
      });
    });

    const fetched = await ownerAuthed.query(async (ctx) => {
      return await getExecutionImpl(ctx, { id: executionId });
    });

    expect(fetched.workspaceId).toBe(workspaceId);
    expect(fetched.workflowId).toBe(workflowId);
    expect(fetched.status).toBe("queued");

    const listed = await ownerAuthed.query(async (ctx) => {
      return await listExecutionsImpl(ctx, { workspaceId });
    });
    expect(listed.some((e) => e._id === executionId)).toBe(true);

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, {
        id: executionId,
        status: "running",
      });
    });

    const running = await ownerAuthed.query(async (ctx) => {
      return await getExecutionImpl(ctx, { id: executionId });
    });

    expect(running.status).toBe("running");
    expect(running.completedAt).toBeUndefined();

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, {
        id: executionId,
        status: "queued",
      });
    });

    const requeued = await ownerAuthed.query(async (ctx) => {
      return await getExecutionImpl(ctx, { id: executionId });
    });
    expect(requeued.status).toBe("queued");
    expect(requeued.completedAt).toBeUndefined();
    expect(requeued.duration).toBeUndefined();

    const stepDocId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId,
        stepId: "step-1",
        name: "First step",
        type: "task",
        status: "queued",
        input: { a: 1 },
      });
    });

    const steps = await ownerAuthed.query(async (ctx) => {
      return await listExecutionStepsImpl(ctx, { executionId });
    });

    expect(steps.length).toBe(1);
    expect(steps[0]._id).toBe(stepDocId);

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStepStatusImpl(ctx, {
        id: stepDocId,
        status: "running",
      });
    });

    const stepFetched = await ownerAuthed.query(async (ctx) => {
      return await getExecutionStepImpl(ctx, { id: stepDocId });
    });

    expect(stepFetched.status).toBe("running");
    expect(stepFetched.startedAt).toBeTypeOf("number");

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStepStatusImpl(ctx, {
        id: stepDocId,
        status: "queued",
      });
    });

    const stepRequeued = await ownerAuthed.query(async (ctx) => {
      return await getExecutionStepImpl(ctx, { id: stepDocId });
    });
    expect(stepRequeued.status).toBe("queued");
    expect(stepRequeued.completedAt).toBeUndefined();

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, {
        id: executionId,
        status: "completed",
        output: { ok: true },
        cost: 123,
      });
    });

    const completed = await ownerAuthed.query(async (ctx) => {
      return await getExecutionImpl(ctx, { id: executionId });
    });

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeTypeOf("number");
    expect(completed.duration).toBeTypeOf("number");

    // Cancel then retry should reset status and clear steps
    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, {
        id: executionId,
        status: "running",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await cancelExecutionImpl(ctx, { id: executionId, reason: { why: "stop" } });
    });

    const canceled = await ownerAuthed.query(async (ctx) => {
      return await getExecutionImpl(ctx, { id: executionId });
    });
    expect(canceled.status).toBe("canceled");

    await ownerAuthed.mutation(async (ctx) => {
      return await retryExecutionImpl(ctx, { id: executionId });
    });

    const retried = await ownerAuthed.query(async (ctx) => {
      return await getExecutionImpl(ctx, { id: executionId });
    });

    expect(retried.status).toBe("queued");
    expect(retried.completedAt).toBeUndefined();

    const stepsAfterRetry = await ownerAuthed.query(async (ctx) => {
      return await listExecutionStepsImpl(ctx, { executionId });
    });

    expect(stepsAfterRetry.length).toBe(0);
  });

  test("cancel rejects terminal executions", async () => {
    const t = convexTest({ schema, modules });

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
        status: "queued",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, { id: executionId, status: "completed" });
    });

    const cancelRes = await ownerAuthed.mutation(async (ctx) => {
      try {
        await cancelExecutionImpl(ctx, { id: executionId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });

    expect(cancelRes.includes("can be canceled")).toBe(true);
  });

  test("createExecutionStep rejects terminal executions", async () => {
    const t = convexTest({ schema, modules });

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
        status: "queued",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, { id: executionId, status: "completed" });
    });

    const stepRes = await ownerAuthed.mutation(async (ctx) => {
      try {
        await createExecutionStepImpl(ctx, {
          executionId,
          stepId: "step-1",
          name: "Step",
          type: "task",
        });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });

    expect(stepRes.includes("Cannot add steps to a terminal execution")).toBe(true);
  });

  test("updateExecutionStepStatus rejects terminal executions", async () => {
    const t = convexTest({ schema, modules });

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
        status: "queued",
      });
    });

    const stepId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId,
        stepId: "step-1",
        name: "Step",
        type: "task",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await cancelExecutionImpl(ctx, { id: executionId });
    });

    const updateRes = await ownerAuthed.mutation(async (ctx) => {
      try {
        await updateExecutionStepStatusImpl(ctx, { id: stepId, status: "completed" });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });

    expect(updateRes.includes("Cannot update steps on a terminal execution")).toBe(true);
  });

  test("updateExecutionStepStatus authorizes before terminal checks", async () => {
    const t = convexTest({ schema, modules });

    const [workspaceId, workflowId] = await t.run(async (ctx) => {
      const now = Date.now();

      const ownerId = await ctx.db.insert("users", {
        clerkId: "clerk_owner",
        email: "owner@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      });

      const memberId = await ctx.db.insert("users", {
        clerkId: "clerk_member",
        email: "member@example.com",
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

      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: memberId,
        role: "member",
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
    const memberAuthed = t.withIdentity(makeIdentity({ subject: "clerk_member" }));

    const executionId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionImpl(ctx, {
        workspaceId,
        workflowId,
        status: "queued",
      });
    });

    const stepId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId,
        stepId: "step-1",
        name: "Step",
        type: "task",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await cancelExecutionImpl(ctx, { id: executionId });
    });

    const updateRes = await memberAuthed.mutation(async (ctx) => {
      try {
        await updateExecutionStepStatusImpl(ctx, { id: stepId, status: "completed" });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });

    expect(updateRes.includes("Forbidden")).toBe(true);
    expect(updateRes.includes("Cannot update steps on a terminal execution")).toBe(false);
  });

  test("retry rejects non-terminal executions", async () => {
    const t = convexTest({ schema, modules });

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
        status: "queued",
      });
    });

    const queuedRetryRes = await ownerAuthed.mutation(async (ctx) => {
      try {
        await retryExecutionImpl(ctx, { id: executionId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(queuedRetryRes.includes("can be retried")).toBe(true);

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, { id: executionId, status: "running" });
    });

    const runningRetryRes = await ownerAuthed.mutation(async (ctx) => {
      try {
        await retryExecutionImpl(ctx, { id: executionId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(runningRetryRes.includes("can be retried")).toBe(true);
  });

  test("retry clears approvals", async () => {
    const t = convexTest({ schema, modules });

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
        status: "queued",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionStepImpl(ctx, {
        executionId,
        stepId: "step-1",
        name: "Step",
        type: "task",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-1",
        type: "manual",
        status: "pending",
        content: { foo: "bar" },
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, { id: executionId, status: "canceled" });
    });

    const approvalsBeforeRetry = await ownerAuthed.query(async (ctx) => {
      return await listExecutionApprovalsImpl(ctx, { executionId, status: "pending" });
    });
    expect(approvalsBeforeRetry.length).toBe(1);

    await ownerAuthed.mutation(async (ctx) => {
      return await retryExecutionImpl(ctx, { id: executionId });
    });

    const approvalsAfterRetry = await ownerAuthed.query(async (ctx) => {
      return await listExecutionApprovalsImpl(ctx, { executionId });
    });
    expect(approvalsAfterRetry.length).toBe(0);
  });

  test("createExecutionApproval rejects terminal executions", async () => {
    const t = convexTest({ schema, modules });

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
        status: "queued",
      });
    });

    await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, { id: executionId, status: "completed" });
    });

    const approvalRes = await ownerAuthed.mutation(async (ctx) => {
      try {
        await createExecutionApprovalImpl(ctx, {
          executionId,
          stepId: "step-1",
          type: "manual",
          status: "pending",
        });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });

    expect(approvalRes.includes("Cannot add approvals to a terminal execution")).toBe(true);
  });

  test("respondExecutionApproval validates status and is idempotent", async () => {
    const t = convexTest({ schema, modules });

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
        status: "queued",
      });
    });

    const approvalId = await ownerAuthed.mutation(async (ctx) => {
      return await createExecutionApprovalImpl(ctx, {
        executionId,
        stepId: "step-1",
        type: "manual",
        status: "pending",
      });
    });

    const invalidStatusRes = await ownerAuthed.mutation(async (ctx) => {
      try {
        await respondExecutionApprovalImpl(ctx, { id: approvalId, status: "pending" });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(invalidStatusRes.includes("status must be 'approved' or 'rejected'")).toBe(true);

    const approvedRes = await ownerAuthed.mutation(async (ctx) => {
      return await respondExecutionApprovalImpl(ctx, { id: approvalId, status: "approved" });
    });
    expect(approvedRes).toBe(approvalId);

    const approvedAgainRes = await ownerAuthed.mutation(async (ctx) => {
      return await respondExecutionApprovalImpl(ctx, { id: approvalId, status: "approved" });
    });
    expect(approvedAgainRes).toBe(approvalId);

    const flipRes = await ownerAuthed.mutation(async (ctx) => {
      try {
        await respondExecutionApprovalImpl(ctx, { id: approvalId, status: "rejected" });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(flipRes.includes("Approval has already been responded to")).toBe(true);
  });

  test("member can read but cannot mutate; stranger cannot read", async () => {
    const t = convexTest({ schema, modules });

    const [executionId, workspaceId] = await t.run(async (ctx) => {
      const now = Date.now();

      const ownerId = await ctx.db.insert("users", {
        clerkId: "clerk_owner",
        email: "owner@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      });

      const memberId = await ctx.db.insert("users", {
        clerkId: "clerk_member",
        email: "member@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("users", {
        clerkId: "clerk_stranger",
        email: "stranger@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      });

      const workspaceId = await ctx.db.insert("workspaces", {
        name: "Private",
        slug: "private",
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

      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: memberId,
        role: "member",
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

      const executionId = await ctx.db.insert("executions", {
        workspaceId,
        workflowId,
        operatorId: undefined,
        status: "queued",
        input: {},
        output: undefined,
        error: undefined,
        startedAt: now,
        completedAt: undefined,
        duration: undefined,
        cost: undefined,
        createdAt: now,
        updatedAt: now,
      });

      return [executionId, workspaceId] as const;
    });

    const strangerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_stranger" }));

    const strangerRead = await strangerAuthed.query(async (ctx) => {
      try {
        await getExecutionImpl(ctx, { id: executionId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(strangerRead.includes("Forbidden")).toBe(true);

    const memberAuthed = t.withIdentity(makeIdentity({ subject: "clerk_member" }));

    const memberRead = await memberAuthed.query(async (ctx) => {
      return await getExecutionImpl(ctx, { id: executionId });
    });
    expect(memberRead._id).toBe(executionId);

    const memberUpdate = await memberAuthed.mutation(async (ctx) => {
      try {
        await updateExecutionStatusImpl(ctx, { id: executionId, status: "running" });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(memberUpdate.includes("Forbidden")).toBe(true);

    const ownerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const ownerUpdate = await ownerAuthed.mutation(async (ctx) => {
      return await updateExecutionStatusImpl(ctx, { id: executionId, status: "running" });
    });
    expect(ownerUpdate).toBe(executionId);

    const listed = await memberAuthed.query(async (ctx) => {
      return await listExecutionsImpl(ctx, { workspaceId });
    });
    expect(listed.some((e) => e._id === executionId)).toBe(true);
  });
});
