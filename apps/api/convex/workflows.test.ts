import { describe, expect, test } from "vitest";

import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";

import schema from "./schema";
import {
  createWorkflowImpl,
  deleteWorkflowImpl,
  duplicateWorkflowImpl,
  getWorkflowImpl,
  listWorkflowVersionsImpl,
  listWorkflowsImpl,
  updateWorkflowImpl,
} from "./workflows";

const modules = import.meta.glob("./**/*.*s");

function makeIdentity(partial: Partial<UserIdentity>): Partial<UserIdentity> {
  return {
    issuer: partial.issuer ?? "https://clerk.example",
    subject: partial.subject ?? "clerk_subject",
    tokenIdentifier: partial.tokenIdentifier ?? `clerk|${partial.subject ?? "clerk_subject"}`,
    ...partial,
  };
}

describe("workflows", () => {
  test("create/get/list/update/duplicate/delete + version history", async () => {
    const t = convexTest({ schema, modules });

    const [workspaceId, ownerId] = await t.run(async (ctx) => {
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

      return [workspaceId, ownerId] as const;
    });

    expect(ownerId).toBeTruthy();

    const ownerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const workflowId = await ownerAuthed.mutation(async (ctx) => {
      return await createWorkflowImpl(ctx, {
        workspaceId,
        name: "WF 1",
        description: "First",
        status: "active",
        trigger: { type: "manual" },
        steps: [{ id: "s1" }],
      });
    });

    const wf = await ownerAuthed.query(async (ctx) => {
      return await getWorkflowImpl(ctx, { id: workflowId });
    });

    expect(wf.name).toBe("WF 1");
    expect(wf.version).toBe(1);

    const listed = await ownerAuthed.query(async (ctx) => {
      return await listWorkflowsImpl(ctx, { workspaceId });
    });
    expect(listed.find((w: { _id: unknown }) => w._id === workflowId)).toBeTruthy();

    const versionsAfterCreate = await ownerAuthed.query(async (ctx) => {
      return await listWorkflowVersionsImpl(ctx, { workflowId });
    });
    expect(versionsAfterCreate.length).toBe(1);
    expect(versionsAfterCreate[0].version).toBe(1);

    await ownerAuthed.mutation(async (ctx) => {
      return await updateWorkflowImpl(ctx, {
        id: workflowId,
        name: "WF 1 Updated",
        steps: [{ id: "s1" }, { id: "s2" }],
      });
    });

    const updated = await ownerAuthed.query(async (ctx) => {
      return await getWorkflowImpl(ctx, { id: workflowId });
    });
    expect(updated.name).toBe("WF 1 Updated");
    expect(updated.version).toBe(2);

    const versionsAfterUpdate = await ownerAuthed.query(async (ctx) => {
      return await listWorkflowVersionsImpl(ctx, { workflowId });
    });
    expect(versionsAfterUpdate.length).toBe(2);
    expect(versionsAfterUpdate.some((v: { version: unknown }) => v.version === 1)).toBe(true);
    expect(versionsAfterUpdate.some((v: { version: unknown }) => v.version === 2)).toBe(true);

    const duplicateId = await ownerAuthed.mutation(async (ctx) => {
      return await duplicateWorkflowImpl(ctx, { id: workflowId });
    });

    const dup = await ownerAuthed.query(async (ctx) => {
      return await getWorkflowImpl(ctx, { id: duplicateId });
    });
    expect(dup.workspaceId).toBe(workspaceId);
    expect(dup.version).toBe(1);

    const dupVersions = await ownerAuthed.query(async (ctx) => {
      return await listWorkflowVersionsImpl(ctx, { workflowId: duplicateId });
    });
    expect(dupVersions.length).toBe(1);
    expect(dupVersions[0].version).toBe(1);

    await ownerAuthed.mutation(async (ctx) => {
      return await deleteWorkflowImpl(ctx, { id: workflowId });
    });

    const missing = await ownerAuthed.query(async (ctx) => {
      try {
        await getWorkflowImpl(ctx, { id: workflowId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(missing.includes("not found")).toBe(true);
  });

  test("rejects cross-workspace operator references on create and update", async () => {
    const t = convexTest({ schema, modules });

    const [workspaceAId, workflowAId, foreignOperatorId] = await t.run(async (ctx) => {
      const now = Date.now();

      const ownerId = await ctx.db.insert("users", {
        clerkId: "clerk_owner",
        email: "owner@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      });

      const workspaceAId = await ctx.db.insert("workspaces", {
        name: "A",
        slug: "a",
        description: "",
        ownerId,
        plan: "free",
        status: "active",
        settings: {},
        createdAt: now,
        updatedAt: now,
      });

      const workspaceBId = await ctx.db.insert("workspaces", {
        name: "B",
        slug: "b",
        description: "",
        ownerId,
        plan: "free",
        status: "active",
        settings: {},
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("workspaceMembers", {
        workspaceId: workspaceAId,
        userId: ownerId,
        role: "owner",
        joinedAt: now,
      });

      await ctx.db.insert("workspaceMembers", {
        workspaceId: workspaceBId,
        userId: ownerId,
        role: "owner",
        joinedAt: now,
      });

      const foreignOperatorId = await ctx.db.insert("operators", {
        workspaceId: workspaceBId,
        type: "agent",
        name: "Foreign Op",
        description: "",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      const workflowAId = await ctx.db.insert("workflows", {
        workspaceId: workspaceAId,
        operatorId: undefined,
        name: "WF A",
        description: "",
        trigger: {},
        steps: {},
        status: "active",
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("workflowVersions", {
        workflowId: workflowAId,
        workspaceId: workspaceAId,
        operatorId: undefined,
        name: "WF A",
        description: "",
        trigger: {},
        steps: {},
        status: "active",
        version: 1,
        createdAt: now,
        createdBy: ownerId,
      });

      return [workspaceAId, workflowAId, foreignOperatorId] as const;
    });

    const ownerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const createRes = await ownerAuthed.mutation(async (ctx) => {
      try {
        await createWorkflowImpl(ctx, {
          workspaceId: workspaceAId,
          operatorId: foreignOperatorId,
          name: "WF should fail",
        });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(createRes.includes("Forbidden") || createRes.includes("Operator not found")).toBe(true);

    const updateRes = await ownerAuthed.mutation(async (ctx) => {
      try {
        await updateWorkflowImpl(ctx, {
          id: workflowAId,
          operatorId: foreignOperatorId,
        });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(updateRes.includes("Forbidden") || updateRes.includes("Operator not found")).toBe(true);
  });

  test("member can read but cannot mutate; stranger cannot read", async () => {
    const t = convexTest({ schema, modules });

    const [workflowId, memberId] = await t.run(async (ctx) => {
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

      await ctx.db.insert("workflowVersions", {
        workflowId,
        workspaceId,
        operatorId: undefined,
        name: "WF",
        description: "",
        trigger: {},
        steps: {},
        status: "active",
        version: 1,
        createdAt: now,
        createdBy: ownerId,
      });

      return [workflowId, memberId] as const;
    });

    const strangerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_stranger" }));

    const strangerRead = await strangerAuthed.query(async (ctx) => {
      try {
        await getWorkflowImpl(ctx, { id: workflowId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(strangerRead.includes("Forbidden")).toBe(true);

    const memberAuthed = t.withIdentity(makeIdentity({ subject: "clerk_member" }));

    const memberRead = await memberAuthed.query(async (ctx) => {
      return await getWorkflowImpl(ctx, { id: workflowId });
    });
    expect(memberRead._id).toBe(workflowId);

    const updateRes = await memberAuthed.mutation(async (ctx) => {
      try {
        await updateWorkflowImpl(ctx, { id: workflowId, name: "Nope" });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(updateRes.includes("Forbidden")).toBe(true);

    const deleteRes = await memberAuthed.mutation(async (ctx) => {
      try {
        await deleteWorkflowImpl(ctx, { id: workflowId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(deleteRes.includes("Forbidden")).toBe(true);

    const ownerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    await ownerAuthed.mutation(async (ctx) => {
      return await deleteWorkflowImpl(ctx, { id: workflowId });
    });

    const stillThere = await ownerAuthed.query(async (ctx) => {
      return await ctx.db.get(memberId);
    });
    expect(stillThere).toBeTruthy();
  });
});
