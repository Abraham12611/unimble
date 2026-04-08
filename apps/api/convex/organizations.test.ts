import { describe, expect, test } from "vitest";

import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";

import schema from "./schema";
import {
  createOrganizationImpl,
  deleteOrganizationImpl,
  getOrganizationBySlugImpl,
  getOrganizationImpl,
  listOrganizationsImpl,
  updateOrganizationImpl,
} from "./organizations";

const modules = import.meta.glob("./**/*.*s");

function makeIdentity(partial: Partial<UserIdentity>): Partial<UserIdentity> {
  return {
    issuer: partial.issuer ?? "https://clerk.example",
    subject: partial.subject ?? "clerk_subject",
    tokenIdentifier: partial.tokenIdentifier ?? `clerk|${partial.subject ?? "clerk_subject"}`,
    ...partial,
  };
}

describe("organizations", () => {
  test("create/get/list/update/delete", async () => {
    const t = convexTest({ schema, modules });

    const clerkId = "clerk_test_1";
    const email = "owner@example.com";

    const userId = await t.run(async (ctx) => {
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

    const org = await authed.query(async (ctx) => {
      return await getOrganizationImpl(ctx, { id: organizationId });
    });

    expect(org).toBeTruthy();
    expect(org.name).toBe("Acme");
    expect(org.ownerId).toBe(userId);

    const orgBySlug = await authed.query(async (ctx) => {
      return await getOrganizationBySlugImpl(ctx, { slug: org.slug });
    });
    expect(orgBySlug).toBeTruthy();
    expect(orgBySlug!._id).toBe(organizationId);

    const listed = await authed.query(async (ctx) => {
      return await listOrganizationsImpl(ctx);
    });
    expect(Array.isArray(listed)).toBe(true);
    expect(listed.length).toBe(1);

    await authed.mutation(async (ctx) => {
      return await updateOrganizationImpl(ctx, { id: organizationId, name: "Acme Inc" });
    });

    const updated = await authed.query(async (ctx) => {
      return await getOrganizationImpl(ctx, { id: organizationId });
    });
    expect(updated.name).toBe("Acme Inc");

    await authed.mutation(async (ctx) => {
      return await deleteOrganizationImpl(ctx, { id: organizationId });
    });

    const missing = await authed.query(async (ctx) => {
      try {
        await getOrganizationImpl(ctx, { id: organizationId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });
    expect(typeof missing).toBe("string");
  });

  test("non-owner non-admin forbidden", async () => {
    const t = convexTest({ schema, modules });

    const [ownerId, otherId, orgId] = await t.run(async (ctx) => {
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

      const orgId = await ctx.db.insert("organizations", {
        name: "Org",
        slug: "org",
        ownerId,
        createdAt: now,
        updatedAt: now,
      });

      return [ownerId, otherId, orgId] as const;
    });

    // sanity
    expect(ownerId).toBeTruthy();
    expect(otherId).toBeTruthy();

    const otherAuthed = t.withIdentity(makeIdentity({ subject: "clerk_other" }));

    const result = await otherAuthed.query(async (ctx) => {
      try {
        await getOrganizationImpl(ctx, { id: orgId });
        return "ok";
      } catch (err) {
        return String(err);
      }
    });

    expect(result.includes("Forbidden")).toBe(true);
  });
});
