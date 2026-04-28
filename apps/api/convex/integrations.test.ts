/**
 * Integration layer tests.
 *
 * Tests for the credential encryption module and integration registry.
 * External API calls (Composio, OpenRouter, etc.) are not tested here
 * since they require live credentials — those are covered by manual
 * testing and will get integration tests in Phase 10.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  encryptCredential,
  decryptCredential,
  isEncrypted,
  reEncryptCredential,
  maskCredential,
} from "./lib/integrations/crypto";
import {
  INTEGRATIONS,
  INTEGRATION_CATEGORIES,
  getIntegrationBySlug,
  getIntegrationsByCategory,
  getActiveIntegrations,
  searchIntegrations,
} from "./lib/integrationRegistry";

// ---------------------------------------------------------------------------
// Credential Encryption
// ---------------------------------------------------------------------------

describe("credential encryption", () => {
  // Set the env var for tests
  const ORIGINAL_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "test-key-that-is-at-least-32-bytes-long-for-testing";
  });

  afterAll(() => {
    if (ORIGINAL_KEY) {
      process.env.CREDENTIAL_ENCRYPTION_KEY = ORIGINAL_KEY;
    } else {
      delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    }
  });

  it("encrypts and decrypts a credential correctly", () => {
    const plaintext = "sk_test_abc123def456";
    const workspaceId = "ws_test_123";

    const encrypted = encryptCredential(plaintext, workspaceId);
    const decrypted = decryptCredential(encrypted, workspaceId);

    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext", () => {
    const plaintext = "same-api-key";
    const workspaceId = "ws_test_123";

    const enc1 = encryptCredential(plaintext, workspaceId);
    const enc2 = encryptCredential(plaintext, workspaceId);

    // Different IVs should produce different ciphertext
    expect(enc1).not.toBe(enc2);

    // But both should decrypt to the same value
    expect(decryptCredential(enc1, workspaceId)).toBe(plaintext);
    expect(decryptCredential(enc2, workspaceId)).toBe(plaintext);
  });

  it("workspace isolation: different workspaces cannot decrypt", () => {
    const plaintext = "secret-key-123";
    const ws1 = "workspace_1";
    const ws2 = "workspace_2";

    const encrypted = encryptCredential(plaintext, ws1);

    // Should decrypt with correct workspace
    expect(decryptCredential(encrypted, ws1)).toBe(plaintext);

    // Should fail with wrong workspace
    expect(() => decryptCredential(encrypted, ws2)).toThrow();
  });

  it("isEncrypted detects encrypted values", () => {
    const encrypted = encryptCredential("test", "ws_1");
    expect(isEncrypted(encrypted)).toBe(true);
    expect(isEncrypted("plain-text-value")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });

  it("reEncryptCredential migrates between workspaces", () => {
    const plaintext = "migrating-key";
    const oldWs = "old_workspace";
    const newWs = "new_workspace";

    const encrypted = encryptCredential(plaintext, oldWs);
    const reEncrypted = reEncryptCredential(encrypted, oldWs, newWs);

    // Old workspace can't decrypt the re-encrypted value
    expect(() => decryptCredential(reEncrypted, oldWs)).toThrow();

    // New workspace can decrypt it
    expect(decryptCredential(reEncrypted, newWs)).toBe(plaintext);
  });

  it("maskCredential hides the middle of a credential", () => {
    expect(maskCredential("sk_test_abc123def456ghi")).toMatch(/^sk_t.*ghi$/);
    expect(maskCredential("short")).toBe("••••••••");
    expect(maskCredential("12345678")).toBe("••••••••");
  });

  it("throws on empty plaintext", () => {
    expect(() => encryptCredential("", "ws_1")).toThrow("Cannot encrypt empty credential");
  });

  it("throws on empty workspaceId", () => {
    expect(() => encryptCredential("test", "")).toThrow(
      "Cannot encrypt credential without a workspace ID"
    );
  });

  it("throws on invalid encrypted format", () => {
    expect(() => decryptCredential("not-encrypted", "ws_1")).toThrow("missing version prefix");
  });

  it("throws on empty workspaceId for decrypt", () => {
    const encrypted = encryptCredential("test", "ws_1");
    expect(() => decryptCredential(encrypted, "")).toThrow(
      "Cannot decrypt credential without a workspace ID"
    );
  });
});

// ---------------------------------------------------------------------------
// Integration Registry
// ---------------------------------------------------------------------------

describe("integration registry", () => {
  it("has at least 20 integrations", () => {
    expect(INTEGRATIONS.length).toBeGreaterThanOrEqual(20);
  });

  it("has 7 categories", () => {
    const keys = Object.keys(INTEGRATION_CATEGORIES);
    expect(keys).toHaveLength(7);
    expect(keys).toContain("content");
    expect(keys).toContain("social");
    expect(keys).toContain("analytics");
    expect(keys).toContain("code");
    expect(keys).toContain("communication");
    expect(keys).toContain("crm");
    expect(keys).toContain("project");
  });

  it("getIntegrationBySlug returns correct integration", () => {
    const github = getIntegrationBySlug("github");
    expect(github).toBeDefined();
    expect(github?.name).toBe("GitHub");
    expect(github?.category).toBe("code");
    expect(github?.authType).toBe("oauth");
  });

  it("getIntegrationBySlug returns undefined for unknown", () => {
    expect(getIntegrationBySlug("nonexistent")).toBeUndefined();
  });

  it("getIntegrationsByCategory returns correct items", () => {
    const social = getIntegrationsByCategory("social");
    expect(social.length).toBeGreaterThan(0);
    expect(
      social.every((i) => i.category === "social" || i.secondaryCategories?.includes("social"))
    ).toBe(true);
  });

  it("getActiveIntegrations excludes coming_soon", () => {
    const active = getActiveIntegrations();
    expect(active.every((i) => i.status !== "coming_soon")).toBe(true);
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThan(INTEGRATIONS.length);
  });

  it("searchIntegrations finds by name", () => {
    const results = searchIntegrations("github");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].slug).toBe("github");
  });

  it("searchIntegrations finds by description", () => {
    const results = searchIntegrations("blog");
    expect(results.length).toBeGreaterThan(0);
  });

  it("every integration has required fields", () => {
    for (const integration of INTEGRATIONS) {
      expect(integration.slug).toBeTruthy();
      expect(integration.name).toBeTruthy();
      expect(integration.description).toBeTruthy();
      expect(integration.category).toBeTruthy();
      expect(integration.authType).toBeTruthy();
      expect(integration.permissions.length).toBeGreaterThan(0);
      expect(integration.iconSlug).toBeTruthy();
      expect(["active", "coming_soon", "beta"]).toContain(integration.status);
    }
  });

  it("no duplicate slugs", () => {
    const slugs = INTEGRATIONS.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
