import { describe, expect, test } from "vitest";

import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";

import schema from "./schema";
import { createOrganizationImpl } from "./organizations";
import {
  acceptWorkspaceInviteImpl,
  createWorkspaceImpl,
  deleteWorkspaceImpl,
  getWorkspaceImpl,
  inviteWorkspaceMemberImpl,
  listWorkspaceInvitesImpl,
  listWorkspaceMembersImpl,
  listWorkspacesImpl,
  removeWorkspaceMemberImpl,
  updateWorkspaceImpl,
} from "./workspaces";

const modules = import.meta.glob("./**/*.*s");

function makeIdentity(partial: Partial<UserIdentity>): Partial<UserIdentity> {
  return {
    issuer: partial.issuer ?? "https://clerk.example",
    subject: partial.subject ?? "clerk_subject",
    tokenIdentifier: partial.tokenIdentifier ?? `clerk|${partial.subject ?? "clerk_subject"}`,
    ...partial,
  };
}

describe("workspaces", () => {
  test("create/get/list/update/delete", async () => {
    const t = convexTest({ schema, modules });

    const clerkId = "clerk_ws_owner";
    const email = "owner@example.com";

    const ownerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        clerkId,
        email,
        role: "creator",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const authed = t.withIdentity(makeIdentity({ subject: clerkId }));

    const organizationId = await authed.mutation(async (ctx) => {
      return await createOrganizationImpl(ctx, { name: "Acme" });
    });

    const workspaceId = await authed.mutation(async (ctx) => {
      return await createWorkspaceImpl(ctx, {
        name: "Workspace One",
        organizationId,
      });
    });

    const workspace = await authed.query(async (ctx) => {
      return await getWorkspaceImpl(ctx, { id: workspaceId });
    });

    expect(workspace).toBeTruthy();
    expect(workspace.ownerId).toBe(ownerId);
    expect(workspace.organizationId).toBe(organizationId);

    const listed = await authed.query(async (ctx) => {
      return await listWorkspacesImpl(ctx);
    });
    expect(Array.isArray(listed)).toBe(true);
    expect(listed.find((w) => w._id === workspaceId)).toBeTruthy();

    await authed.mutation(async (ctx) => {
      return await updateWorkspaceImpl(ctx, {
        id: workspaceId,
        name: "Workspace One Updated",
        description: "Hello",
      });
    });

    const updated = await authed.query(async (ctx) => {
      return await getWorkspaceImpl(ctx, { id: workspaceId });
    });
    expect(updated.name).toBe("Workspace One Updated");
    expect(updated.description).toBe("Hello");

    await authed.mutation(async (ctx) => {
      return await deleteWorkspaceImpl(ctx, { id: workspaceId });
    });

    const missing = await authed.query(async (ctx) => {
      try {
        await getWorkspaceImpl(ctx, { id: workspaceId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });

    expect(missing.includes("not found")).toBe(true);
  });

  test("invite/accept/list/remove member", async () => {
    const t = convexTest({ schema, modules });

    const [ownerId, memberId, workspaceId] = await t.run(async (ctx) => {
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

      return [ownerId, memberId, workspaceId] as const;
    });

    expect(ownerId).toBeTruthy();
    expect(memberId).toBeTruthy();

    const ownerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const inviteId = await ownerAuthed.mutation(async (ctx) => {
      return await inviteWorkspaceMemberImpl(ctx, {
        workspaceId,
        email: "member@example.com",
      });
    });
    expect(inviteId).toBeTruthy();

    const invites = await ownerAuthed.query(async (ctx) => {
      return await listWorkspaceInvitesImpl(ctx, { workspaceId });
    });
    expect(invites.length).toBe(1);

    const memberAuthed = t.withIdentity(makeIdentity({ subject: "clerk_member" }));

    await memberAuthed.mutation(async (ctx) => {
      return await acceptWorkspaceInviteImpl(ctx, { workspaceId });
    });

    const members = await ownerAuthed.query(async (ctx) => {
      return await listWorkspaceMembersImpl(ctx, { workspaceId });
    });
    expect(members.length).toBe(2);

    await ownerAuthed.mutation(async (ctx) => {
      return await removeWorkspaceMemberImpl(ctx, { workspaceId, userId: memberId });
    });

    const membersAfter = await ownerAuthed.query(async (ctx) => {
      return await listWorkspaceMembersImpl(ctx, { workspaceId });
    });
    expect(membersAfter.length).toBe(1);
  });

  test("non-owner cannot update/delete; non-member cannot read", async () => {
    const t = convexTest({ schema, modules });

    const workspaceId = await t.run(async (ctx) => {
      const now = Date.now();
      const ownerId = await ctx.db.insert("users", {
        clerkId: "clerk_owner",
        email: "owner@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      });

      const otherId = await ctx.db.insert("users", {
        clerkId: "clerk_other",
        email: "other@example.com",
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
        userId: otherId,
        role: "member",
        joinedAt: now,
      });

      return workspaceId;
    });

    const strangerAuthed = t.withIdentity(makeIdentity({ subject: "clerk_stranger" }));

    const strangerRead = await strangerAuthed.query(async (ctx) => {
      try {
        await getWorkspaceImpl(ctx, { id: workspaceId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(strangerRead.includes("Forbidden")).toBe(true);

    const memberAuthed = t.withIdentity(makeIdentity({ subject: "clerk_other" }));

    const updateRes = await memberAuthed.mutation(async (ctx) => {
      try {
        await updateWorkspaceImpl(ctx, { id: workspaceId, name: "Nope" });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(updateRes.includes("Forbidden")).toBe(true);

    const deleteRes = await memberAuthed.mutation(async (ctx) => {
      try {
        await deleteWorkspaceImpl(ctx, { id: workspaceId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(deleteRes.includes("Forbidden")).toBe(true);
  });

  test("cross-workspace data isolation: no leaks between workspaces", async () => {
    const t = convexTest({ schema, modules });

    // Create two users, each with their own workspace
    const [wsA, wsB] = await t.run(async (ctx) => {
      const now = Date.now();

      const userA = await ctx.db.insert("users", {
        clerkId: "clerk_alice",
        email: "alice@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      });

      const userB = await ctx.db.insert("users", {
        clerkId: "clerk_bob",
        email: "bob@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      });

      const wsA = await ctx.db.insert("workspaces", {
        name: "Alice Workspace",
        slug: "alice-ws",
        description: "",
        ownerId: userA,
        plan: "free",
        status: "active",
        settings: {},
        createdAt: now,
        updatedAt: now,
      });

      const wsB = await ctx.db.insert("workspaces", {
        name: "Bob Workspace",
        slug: "bob-ws",
        description: "",
        ownerId: userB,
        plan: "free",
        status: "active",
        settings: {},
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("workspaceMembers", {
        workspaceId: wsA,
        userId: userA,
        role: "owner",
        joinedAt: now,
      });

      await ctx.db.insert("workspaceMembers", {
        workspaceId: wsB,
        userId: userB,
        role: "owner",
        joinedAt: now,
      });

      return [wsA, wsB] as const;
    });

    const alice = t.withIdentity(makeIdentity({ subject: "clerk_alice" }));
    const bob = t.withIdentity(makeIdentity({ subject: "clerk_bob" }));

    // Alice cannot read Bob's workspace
    const aliceReadBob = await alice.query(async (ctx) => {
      try {
        await getWorkspaceImpl(ctx, { id: wsB });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(aliceReadBob.includes("Forbidden")).toBe(true);

    // Bob cannot read Alice's workspace
    const bobReadAlice = await bob.query(async (ctx) => {
      try {
        await getWorkspaceImpl(ctx, { id: wsA });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(bobReadAlice.includes("Forbidden")).toBe(true);

    // Alice's workspace list does not include Bob's workspace
    const aliceList = await alice.query(async (ctx) => {
      return await listWorkspacesImpl(ctx);
    });
    expect(aliceList.some((ws) => ws._id === wsA)).toBe(true);
    expect(aliceList.some((ws) => ws._id === wsB)).toBe(false);

    // Bob's workspace list does not include Alice's workspace
    const bobList = await bob.query(async (ctx) => {
      return await listWorkspacesImpl(ctx);
    });
    expect(bobList.some((ws) => ws._id === wsB)).toBe(true);
    expect(bobList.some((ws) => ws._id === wsA)).toBe(false);

    // Bob cannot mutate Alice's workspace
    const bobUpdateAlice = await bob.mutation(async (ctx) => {
      try {
        await updateWorkspaceImpl(ctx, { id: wsA, name: "Hacked" });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(bobUpdateAlice.includes("Forbidden")).toBe(true);

    // Bob cannot invite to Alice's workspace
    const bobInviteAlice = await bob.mutation(async (ctx) => {
      try {
        await inviteWorkspaceMemberImpl(ctx, {
          workspaceId: wsA,
          email: "eve@example.com",
        });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(bobInviteAlice.includes("Forbidden")).toBe(true);
  });
});
