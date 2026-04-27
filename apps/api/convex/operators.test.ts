import { describe, expect, test } from "vitest";

import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";

import schema from "./schema";
import {
  createOperatorImpl,
  deleteOperatorImpl,
  getOperatorImpl,
  listOperatorsImpl,
  pauseOperatorImpl,
  resumeOperatorImpl,
  updateOperatorImpl,
} from "./operators";

const modules = import.meta.glob("./**/*.*s");

function makeIdentity(partial: Partial<UserIdentity>): Partial<UserIdentity> {
  return {
    issuer: partial.issuer ?? "https://clerk.example",
    subject: partial.subject ?? "clerk_subject",
    tokenIdentifier: partial.tokenIdentifier ?? `clerk|${partial.subject ?? "clerk_subject"}`,
    ...partial,
  };
}

describe("operators", () => {
  test("create/get/list/update/pause/resume/delete", async () => {
    const t = convexTest({ schema, modules });

    const [ownerId, workspaceId] = await t.run(async (ctx) => {
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

      return [ownerId, workspaceId] as const;
    });

    expect(ownerId).toBeTruthy();

    const ownerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const operatorId = await ownerAuthed.mutation(async (ctx) => {
      return await createOperatorImpl(ctx, {
        workspaceId,
        type: "agent",
        name: "Op 1",
        description: "Hello",
      });
    });

    const op = await ownerAuthed.query(async (ctx) => {
      return await getOperatorImpl(ctx, { id: operatorId });
    });
    expect(op.workspaceId).toBe(workspaceId);
    expect(op.name).toBe("Op 1");

    const listed = await ownerAuthed.query(async (ctx) => {
      return await listOperatorsImpl(ctx, { workspaceId });
    });
    expect(listed.length).toBe(1);

    await ownerAuthed.mutation(async (ctx) => {
      return await updateOperatorImpl(ctx, { id: operatorId, name: "Op 1 Updated" });
    });

    const updated = await ownerAuthed.query(async (ctx) => {
      return await getOperatorImpl(ctx, { id: operatorId });
    });
    expect(updated.name).toBe("Op 1 Updated");

    await ownerAuthed.mutation(async (ctx) => {
      return await pauseOperatorImpl(ctx, { id: operatorId });
    });

    const paused = await ownerAuthed.query(async (ctx) => {
      return await getOperatorImpl(ctx, { id: operatorId });
    });
    expect(paused.status).toBe("paused");

    await ownerAuthed.mutation(async (ctx) => {
      return await resumeOperatorImpl(ctx, { id: operatorId });
    });

    const resumed = await ownerAuthed.query(async (ctx) => {
      return await getOperatorImpl(ctx, { id: operatorId });
    });
    expect(resumed.status).toBe("active");

    await ownerAuthed.mutation(async (ctx) => {
      return await deleteOperatorImpl(ctx, { id: operatorId });
    });

    const missing = await ownerAuthed.query(async (ctx) => {
      try {
        await getOperatorImpl(ctx, { id: operatorId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(missing.includes("not found")).toBe(true);
  });

  test("member can read but cannot mutate; stranger cannot read", async () => {
    const t = convexTest({ schema, modules });

    const [workspaceId, operatorId, memberId] = await t.run(async (ctx) => {
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

      const operatorId = await ctx.db.insert("operators", {
        workspaceId,
        type: "agent",
        name: "Op",
        description: "",
        config: {},
        status: "active",
        memory: {},
        metrics: {},
        createdAt: now,
        updatedAt: now,
      });

      return [workspaceId, operatorId, memberId] as const;
    });

    const strangerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_stranger" }));

    const strangerRead = await strangerAuthed.query(async (ctx) => {
      try {
        await getOperatorImpl(ctx, { id: operatorId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(strangerRead.includes("Forbidden")).toBe(true);

    const memberAuthed = t.withIdentity(makeIdentity({ subject: "clerk_member" }));

    const memberRead = await memberAuthed.query(async (ctx) => {
      return await getOperatorImpl(ctx, { id: operatorId });
    });
    expect(memberRead._id).toBe(operatorId);

    const updateRes = await memberAuthed.mutation(async (ctx) => {
      try {
        await updateOperatorImpl(ctx, { id: operatorId, name: "Nope" });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(updateRes.includes("Forbidden")).toBe(true);

    const pauseRes = await memberAuthed.mutation(async (ctx) => {
      try {
        await pauseOperatorImpl(ctx, { id: operatorId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(pauseRes.includes("Forbidden")).toBe(true);

    const deleteRes = await memberAuthed.mutation(async (ctx) => {
      try {
        await deleteOperatorImpl(ctx, { id: operatorId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(deleteRes.includes("Forbidden")).toBe(true);

    const ownerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    await ownerAuthed.mutation(async (ctx) => {
      return await deleteOperatorImpl(ctx, { id: operatorId });
    });

    const workflowsAfter = await ownerAuthed.query(async (ctx) => {
      return await ctx.db
        .query("workflows")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect();
    });
    expect(Array.isArray(workflowsAfter)).toBe(true);

    const memberStillExists = await ownerAuthed.query(async (ctx) => {
      return await ctx.db.get(memberId);
    });
    expect(memberStillExists).toBeTruthy();
  });
});
