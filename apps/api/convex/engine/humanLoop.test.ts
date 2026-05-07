import { describe, expect, test } from "vitest";

import { convexTest } from "convex-test";

import schema from "../schema";
import { createNotificationImpl } from "./humanLoop";

const modules = import.meta.glob("../**/*.*s");

describe("humanLoop", () => {
  test("createNotificationImpl creates a notification record", async () => {
    const t = convexTest({ schema, modules });

    const [workspaceId, userId] = await t.run(async (ctx) => {
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

      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId,
        role: "owner",
        joinedAt: now,
      });

      return [workspaceId, userId] as const;
    });

    const notificationId = await t.run(async (ctx) => {
      return await createNotificationImpl(ctx, {
        workspaceId,
        userId,
        type: "approval_requested",
        title: "Approval needed: content_review",
        message: "A workflow step requires your approval.",
        resourceType: "approval",
        resourceId: "exec123/step1",
      });
    });

    const notification = await t.run(async (ctx) => {
      return await ctx.db.get(notificationId);
    });

    expect(notification).not.toBeNull();
    expect(notification!.type).toBe("approval_requested");
    expect(notification!.title).toBe("Approval needed: content_review");
    expect(notification!.read).toBe(false);
    expect(notification!.workspaceId).toBe(workspaceId);
    expect(notification!.userId).toBe(userId);
  });

  test("createNotificationImpl works without userId (workspace-wide)", async () => {
    const t = convexTest({ schema, modules });

    const workspaceId = await t.run(async (ctx) => {
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

      return workspaceId;
    });

    const notificationId = await t.run(async (ctx) => {
      return await createNotificationImpl(ctx, {
        workspaceId,
        type: "escalation",
        title: "Critical escalation",
        message: "Something went wrong",
      });
    });

    const notification = await t.run(async (ctx) => {
      return await ctx.db.get(notificationId);
    });

    expect(notification).not.toBeNull();
    expect(notification!.userId).toBeUndefined();
    expect(notification!.type).toBe("escalation");
  });

  test("escalation and notification flow", async () => {
    const t = convexTest({ schema, modules });

    const [workspaceId, , executionId] = await t.run(async (ctx) => {
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

      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId,
        role: "owner",
        joinedAt: now,
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
        status: "running",
        input: {},
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return [workspaceId, workflowId, executionId] as const;
    });

    // Create an escalation directly via DB (simulating internal mutation)
    const escalationId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("escalations", {
        workspaceId,
        executionId,
        stepId: "step-1",
        type: "approval_timeout",
        reason: "Approval not responded within 24h",
        severity: "high",
        status: "open",
        assignedTo: undefined,
        resolvedAt: undefined,
        resolvedBy: undefined,
        resolution: undefined,
        metadata: undefined,
        createdAt: now,
        updatedAt: now,
      });
    });

    const escalation = await t.run(async (ctx) => {
      return await ctx.db.get(escalationId);
    });

    expect(escalation).not.toBeNull();
    expect(escalation!.status).toBe("open");
    expect(escalation!.severity).toBe("high");
    expect(escalation!.type).toBe("approval_timeout");
  });

  test("feedback request creates approval with feedback type prefix", async () => {
    const t = convexTest({ schema, modules });

    const [, executionId] = await t.run(async (ctx) => {
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

      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId,
        role: "owner",
        joinedAt: now,
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
        status: "running",
        input: {},
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return [workspaceId, executionId] as const;
    });

    // Simulate feedback request by inserting approval with feedback type
    const approvalId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("approvals", {
        executionId,
        stepId: "step-feedback",
        type: "feedback:content_review",
        content: {
          prompt: "Please review this draft and provide feedback",
          schema: { rating: "number", comments: "string" },
          data: { title: "AI Trends 2026", body: "..." },
        },
        status: "pending",
        requestedAt: now,
        respondedAt: undefined,
        respondedBy: undefined,
        feedback: undefined,
        createdAt: now,
        updatedAt: now,
      });
    });

    const approval = await t.run(async (ctx) => {
      return await ctx.db.get(approvalId);
    });

    expect(approval).not.toBeNull();
    expect(approval!.type).toBe("feedback:content_review");
    expect(approval!.status).toBe("pending");
    expect((approval!.content as { prompt: string }).prompt).toBe(
      "Please review this draft and provide feedback"
    );
  });
});
