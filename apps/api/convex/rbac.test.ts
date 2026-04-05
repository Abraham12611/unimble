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
  process.env.UNIMBLE_CREATOR_EMAILS = "founder@example.com, admin@unimble.com";
  process.env.UNIMBLE_CREATOR_CLERK_IDS = "";

  assert.equal(isCreatorIdentity({ email: "founder@example.com" }), true);
  assert.equal(isCreatorIdentity({ email: "not-allowed@example.com" }), false);
});

test("derivePlatformRole prefers allowlisted creator identity", () => {
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
});

test("derivePlatformRole preserves existing creator role", () => {
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
