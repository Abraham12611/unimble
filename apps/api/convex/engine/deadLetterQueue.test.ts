import { describe, expect, test } from "vitest";

import { convexTest } from "convex-test";

import schema from "../schema";
import { captureToDeadLetterQueue } from "./deadLetterQueue";

const modules = import.meta.glob("../**/*.*s");

describe("deadLetterQueue", () => {
  test("captureToDeadLetterQueue creates a DLQ entry", async () => {
    const t = convexTest({ schema, modules });

    const [workspaceId, workflowId, executionId] = await t.run(async (ctx) => {
      const now = Date.now();

      const userId = await ctx.db.insert("users", {
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
        ownerId: userId,
        plan: "free",
        status: "active",
        settings: {},
        createdAt: now,
        updatedAt: now,
      });

      const workflowId = await ctx.db.insert("workflows", {
        workspaceId,
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
        status: "failed",
        input: {},
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return [workspaceId, workflowId, executionId] as const;
    });

    const dlqId = await t.run(async (ctx) => {
      return await captureToDeadLetterQueue(ctx, {
        workspaceId,
        executionId,
        workflowId,
        stepId: "step-1",
        error: { message: "Rate limit exceeded" },
        errorCategory: "rate_limit",
        retryCount: 3,
      });
    });

    const entry = await t.run(async (ctx) => {
      return await ctx.db.get(dlqId);
    });

    expect(entry).not.toBeNull();
    expect(entry!.status).toBe("pending");
    expect(entry!.errorCategory).toBe("rate_limit");
    expect(entry!.retryCount).toBe(3);
    expect(entry!.stepId).toBe("step-1");
    expect(entry!.workspaceId).toBe(workspaceId);
  });

  test("DLQ entries have correct initial state", async () => {
    const t = convexTest({ schema, modules });

    const [workspaceId, workflowId, executionId] = await t.run(async (ctx) => {
      const now = Date.now();

      const userId = await ctx.db.insert("users", {
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
        ownerId: userId,
        plan: "free",
        status: "active",
        settings: {},
        createdAt: now,
        updatedAt: now,
      });

      const workflowId = await ctx.db.insert("workflows", {
        workspaceId,
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
        status: "failed",
        input: {},
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return [workspaceId, workflowId, executionId] as const;
    });

    const dlqId = await t.run(async (ctx) => {
      return await captureToDeadLetterQueue(ctx, {
        workspaceId,
        executionId,
        workflowId,
        stepId: "agent-step",
        error: { message: "Server error", status: 500 },
        errorCategory: "server_error",
        retryCount: 5,
      });
    });

    const entry = await t.run(async (ctx) => {
      return await ctx.db.get(dlqId);
    });

    expect(entry!.retriedAt).toBeUndefined();
    expect(entry!.discardedAt).toBeUndefined();
    expect(entry!.discardedBy).toBeUndefined();
    expect(entry!.createdAt).toBeTypeOf("number");
  });
});
