import { describe, expect, test } from "vitest";

import {
  derivePlatformRole,
  hasPermission,
  isCreatorIdentity,
  normalizePlatformRole,
  requirePermission,
} from "./rbac";

describe("rbac", () => {
  test("isCreatorIdentity returns true when email is allowlisted", () => {
    const originalEmails = process.env.UNIMBLE_CREATOR_EMAILS;
    const originalClerkIds = process.env.UNIMBLE_CREATOR_CLERK_IDS;
    try {
      process.env.UNIMBLE_CREATOR_EMAILS = "founder@example.com, admin@unimble.com";
      process.env.UNIMBLE_CREATOR_CLERK_IDS = "";

      expect(isCreatorIdentity({ email: "founder@example.com" })).toBe(true);
      expect(isCreatorIdentity({ email: "not-allowed@example.com" })).toBe(false);
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

      expect(
        derivePlatformRole({
          clerkId: "clerk_123",
          email: "founder@example.com",
          existingRole: "user",
        })
      ).toBe("creator");
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

      expect(
        derivePlatformRole({
          clerkId: "clerk_123",
          email: "someone@example.com",
          existingRole: "creator",
        })
      ).toBe("creator");
    } finally {
      process.env.UNIMBLE_CREATOR_EMAILS = originalEmails;
      process.env.UNIMBLE_CREATOR_CLERK_IDS = originalClerkIds;
    }
  });

  test("normalizePlatformRole coerces unknown roles to user", () => {
    expect(normalizePlatformRole("owner")).toBe("user");
    expect(normalizePlatformRole("user")).toBe("user");
    expect(normalizePlatformRole("creator")).toBe("creator");
    expect(normalizePlatformRole(undefined)).toBe("user");
  });

  test("requirePermission throws when missing", () => {
    expect(hasPermission("creator", "platform:admin")).toBe(true);
    expect(hasPermission("user", "platform:admin")).toBe(false);

    expect(() => requirePermission("user", "platform:admin")).toThrow(/Forbidden/);
  });
});
