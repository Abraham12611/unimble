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
// Signature verification helpers (used by HTTP action layer)
// ---------------------------------------------------------------------------

/**
 * Constant-time string comparison to prevent timing attacks.
 * Used by the HTTP action layer after computing the HMAC.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
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
 *
 * Signature verification is performed by the HTTP action layer
 * (which has Node.js crypto access) before calling this mutation.
 * The `signatureVerified` flag indicates whether the caller already
 * validated the HMAC. If the workflow has a secret configured and
 * signatureVerified is false, the request is rejected.
 */
export const handleWebhookTrigger = internalMutation({
  args: {
    path: v.string(),
    /** Raw request body string — stored for audit trail */
    rawBody: v.string(),
    /** Parsed payload for storage in the execution input */
    payload: v.optional(v.any()),
    /** Whether the HTTP layer verified the HMAC signature */
    signatureVerified: v.optional(v.boolean()),
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

    // If the workflow has a signing secret, require verified signature
    if (trigger.secret && !args.signatureVerified) {
      return { ok: false, error: "Invalid webhook signature" };
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
