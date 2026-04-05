import assert from "node:assert/strict";
import { test } from "node:test";

import {
  derivePlatformRole,
  hasPermission,
  isCreatorIdentity,
  normalizePlatformRole,
  requirePermission,
} from "./rbac";

test("isCreatorIdentity returns true when email is allowlisted", () => {
  const originalEmails = process.env.UNIMBLE_CREATOR_EMAILS;
  const originalClerkIds = process.env.UNIMBLE_CREATOR_CLERK_IDS;
  try {
    process.env.UNIMBLE_CREATOR_EMAILS = "founder@example.com, admin@unimble.com";
    process.env.UNIMBLE_CREATOR_CLERK_IDS = "";

    assert.equal(isCreatorIdentity({ email: "founder@example.com" }), true);
    assert.equal(isCreatorIdentity({ email: "not-allowed@example.com" }), false);
  } finally {
    process.env.UNIMBLE_CREATOR_EMAILS = originalEmails;
    process.env.UNIMBLE_CREATOR_CLERK_IDS = originalClerkIds;
  }
});

test("derivePlatformRole prefers allowlisted creator identity", () => {
  const originalEmails = process.env.UNIMBLE_CREATOR_EMAILS;
  const originalClerkIds = process.env.UNIMBLE_CREATOR_CLERK_IDS;
  try {
    process.env.UNIMBLE_CREATOR_EMAILS = "founder@example.com";
    process.env.UNIMBLE_CREATOR_CLERK_IDS = "";

    assert.equal(
      derivePlatformRole({
        clerkId: "clerk_123",
        email: "founder@example.com",
        existingRole: "user",
      }),
      "creator"
    );
  } finally {
    process.env.UNIMBLE_CREATOR_EMAILS = originalEmails;
    process.env.UNIMBLE_CREATOR_CLERK_IDS = originalClerkIds;
  }
});

test("derivePlatformRole preserves existing creator role", () => {
  const originalEmails = process.env.UNIMBLE_CREATOR_EMAILS;
  const originalClerkIds = process.env.UNIMBLE_CREATOR_CLERK_IDS;
  try {
    process.env.UNIMBLE_CREATOR_EMAILS = "";
    process.env.UNIMBLE_CREATOR_CLERK_IDS = "";

    assert.equal(
      derivePlatformRole({
        clerkId: "clerk_123",
        email: "someone@example.com",
        existingRole: "creator",
      }),
      "creator"
    );
  } finally {
    process.env.UNIMBLE_CREATOR_EMAILS = originalEmails;
    process.env.UNIMBLE_CREATOR_CLERK_IDS = originalClerkIds;
  }
});

test("normalizePlatformRole coerces unknown roles to user", () => {
  assert.equal(normalizePlatformRole("owner"), "user");
  assert.equal(normalizePlatformRole("user"), "user");
  assert.equal(normalizePlatformRole("creator"), "creator");
  assert.equal(normalizePlatformRole(undefined), "user");
});

test("requirePermission throws when missing", () => {
  assert.equal(hasPermission("creator", "platform:admin"), true);
  assert.equal(hasPermission("user", "platform:admin"), false);

  assert.throws(() => requirePermission("user", "platform:admin"), /Forbidden/);
});
