"use node";

/**
 * Credential Encryption Module
 *
 * Provides AES-256-GCM encryption for sensitive integration credentials
 * (API keys, tokens, secrets) with workspace-scoped key derivation.
 *
 * Architecture:
 * - A single master key (CREDENTIAL_ENCRYPTION_KEY env var) is used
 *   as the root secret.
 * - Per-workspace encryption keys are derived using HMAC-SHA256
 *   with the workspace ID as context. (Note: this is plain HMAC,
 *   not formal HKDF per RFC 5869 — sufficient for our use case
 *   but should be noted for security audits.)
 * - Each encrypted value includes a random IV and auth tag, making
 *   every ciphertext unique even for identical plaintext.
 *
 * Storage format: `enc:v1:{iv}:{authTag}:{ciphertext}` (all base64)
 *
 * Security properties:
 * - Workspace isolation: different workspaces get different derived keys
 * - No key reuse: random 12-byte IV per encryption
 * - Authenticated encryption: GCM auth tag prevents tampering
 * - Key rotation: version prefix allows future format changes
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";

const ENCRYPTION_PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const KEY_LENGTH = 32; // 256 bits

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Derives a workspace-scoped encryption key from the master key
 * using HMAC-SHA256 as a KDF.
 *
 * This ensures each workspace has a unique encryption key, so
 * compromising one workspace's data doesn't expose others.
 */
function deriveWorkspaceKey(workspaceId: string): Buffer {
  const masterKey = getMasterKey();
  return createHmac("sha256", masterKey)
    .update(`unimble:credential:${workspaceId}`)
    .digest()
    .subarray(0, KEY_LENGTH);
}

function getMasterKey(): string {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set. " +
        "Add a 32+ character secret to your Convex environment."
    );
  }
  if (Buffer.byteLength(key, "utf8") < 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must provide at least 32 bytes of entropy.");
  }
  return key;
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypts a plaintext credential using AES-256-GCM with a
 * workspace-scoped key.
 *
 * @param plaintext - The sensitive value to encrypt
 * @param workspaceId - The workspace ID for key derivation
 * @returns Encrypted string in format `enc:v1:{iv}:{tag}:{ciphertext}`
 */
export function encryptCredential(plaintext: string, workspaceId: string): string {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty credential");
  }

  if (!workspaceId) {
    throw new Error("Cannot encrypt credential without a workspace ID");
  }

  const key = deriveWorkspaceKey(workspaceId);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return (
    ENCRYPTION_PREFIX +
    iv.toString("base64") +
    ":" +
    authTag.toString("base64") +
    ":" +
    encrypted.toString("base64")
  );
}

/**
 * Decrypts an encrypted credential string.
 *
 * @param encrypted - The encrypted string (must start with `enc:v1:`)
 * @param workspaceId - The workspace ID for key derivation
 * @returns The original plaintext credential
 */
export function decryptCredential(encrypted: string, workspaceId: string): string {
  if (!encrypted.startsWith(ENCRYPTION_PREFIX)) {
    throw new Error("Invalid encrypted credential format — missing version prefix");
  }

  if (!workspaceId) {
    throw new Error("Cannot decrypt credential without a workspace ID");
  }

  const payload = encrypted.slice(ENCRYPTION_PREFIX.length);
  const parts = payload.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted credential format — expected iv:tag:ciphertext");
  }

  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const ciphertext = Buffer.from(parts[2], "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }

  if (authTag.length !== 16) {
    throw new Error("Invalid auth tag length");
  }

  const key = deriveWorkspaceKey(workspaceId);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Checks whether a string is an encrypted credential.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Re-encrypts a credential with a new workspace key.
 * Used during key rotation or workspace migration.
 *
 * @param encrypted - The currently encrypted value
 * @param oldWorkspaceId - The workspace ID used for the current encryption
 * @param newWorkspaceId - The workspace ID for the new encryption
 * @returns Newly encrypted string
 */
export function reEncryptCredential(
  encrypted: string,
  oldWorkspaceId: string,
  newWorkspaceId: string
): string {
  const plaintext = decryptCredential(encrypted, oldWorkspaceId);
  return encryptCredential(plaintext, newWorkspaceId);
}

/**
 * Masks a credential for display purposes.
 * Shows only the first 4 and last 4 characters.
 */
export function maskCredential(value: string): string {
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "•".repeat(Math.min(value.length - 8, 20)) + value.slice(-4);
}
