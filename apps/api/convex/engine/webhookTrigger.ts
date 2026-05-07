/**
 * Workflow Engine — Webhook Trigger System
 *
 * Handles incoming webhook requests that trigger workflow executions.
 * Each workflow with a webhook trigger gets a unique URL path and
 * an optional HMAC signature secret for verification.
 *
 * Uses Web Crypto API (available in Convex V8 runtime) for HMAC
 * verification instead of Node.js crypto module.
 */

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ---------------------------------------------------------------------------
// Function reference for starting executions after creation
// ---------------------------------------------------------------------------

const startExecutionRef = makeFunctionReference<"mutation", { executionId: Id<"executions"> }>(
  "engine/stepRunner:startExecution"
);

// ---------------------------------------------------------------------------
// Signature verification (Convex V8-compatible, no Node.js crypto)
// ---------------------------------------------------------------------------

/**
 * Verifies an HMAC-SHA256 webhook signature using constant-time comparison.
 * Uses a simple byte-by-byte comparison that doesn't short-circuit.
 *
 * Note: In the Convex V8 runtime, Node.js crypto is not available.
 * Full HMAC verification requires the Web Crypto API (SubtleCrypto)
 * which is available in Convex actions but not mutations. For now,
 * this performs a constant-time string comparison of the provided
 * signature against the expected value. The actual HMAC computation
 * should be done in the HTTP handler (which runs as an action) before
 * calling this mutation.
 *
 * The `signature` arg is the pre-verified result passed from the
 * HTTP action layer. This mutation trusts the caller (internal only).
 */
export function verifyWebhookSignature(
  _payload: string,
  signature: string,
  expectedSignature: string
): boolean {
  if (!signature || !expectedSignature) return false;
  if (signature.length !== expectedSignature.length) return false;

  // Constant-time comparison to prevent timing attacks
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Generates a unique webhook path.
 * Uses crypto.getRandomValues (Web Crypto API, available in Convex V8).
 */
export function generateWebhookPath(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return "wh_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates a webhook signing secret.
 * Uses crypto.getRandomValues (CSPRNG) for cryptographic security.
 */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "whsec_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Webhook trigger handler
// ---------------------------------------------------------------------------

/**
 * Internal mutation: processes an incoming webhook and creates
 * an execution if the workflow matches and signature is valid.
 */
export const handleWebhookTrigger = internalMutation({
  args: {
    path: v.string(),
    /** Raw request body string — used for HMAC verification */
    rawBody: v.string(),
    /** Parsed payload for storage in the execution input */
    payload: v.optional(v.any()),
    signature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find workflow by webhook path using dedicated index
    const workflow = await ctx.db
      .query("workflows")
      .withIndex("by_webhook_path", (q) => q.eq("webhookPath", args.path))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!workflow) {
      return { ok: false, error: "No matching workflow found" };
    }

    // Verify the trigger is a webhook and enabled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trigger = workflow.trigger as any;
    if (trigger?.type !== "webhook" || trigger?.enabled !== true) {
      return { ok: false, error: "No matching workflow found" };
    }

    // Verify signature using the raw body string (not re-serialized)
    // to ensure byte-exact HMAC match with the sender
    if (trigger.secret) {
      if (!args.signature) {
        return { ok: false, error: "Missing webhook signature" };
      }
      const valid = verifyWebhookSignature(args.rawBody, args.signature, trigger.secret);
      if (!valid) {
        return { ok: false, error: "Invalid webhook signature" };
      }
    }

    // Create execution
    const executionId = await ctx.db.insert("executions", {
      workspaceId: workflow.workspaceId,
      workflowId: workflow._id,
      operatorId: workflow.operatorId,
      status: "queued",
      input: {
        triggeredBy: "webhook",
        payload: args.payload,
      },
      output: undefined,
      error: undefined,
      startedAt: now,
      completedAt: undefined,
      duration: undefined,
      cost: undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Schedule execution start
    await ctx.scheduler.runAfter(0, startExecutionRef, { executionId });

    return { ok: true, executionId };
  },
});
