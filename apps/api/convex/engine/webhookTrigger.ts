/**
 * Workflow Engine — Webhook Trigger System
 *
 * Handles incoming webhook requests that trigger workflow executions.
 * Each workflow with a webhook trigger gets a unique URL path and
 * an optional HMAC signature secret for verification.
 */

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ---------------------------------------------------------------------------
// Function reference for starting executions after creation
// ---------------------------------------------------------------------------

const startExecutionRef = makeFunctionReference<"mutation", { executionId: Id<"executions"> }>(
  "engine/stepRunner:startExecution"
);

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verifies an HMAC-SHA256 webhook signature.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!payload || !signature || !secret) return false;

  try {
    const expected = createHmac("sha256", secret).update(payload).digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");

    if (sigBuf.length !== expectedBuf.length) return false;

    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Generates a unique webhook path using crypto.randomBytes.
 */
export function generateWebhookPath(): string {
  return "wh_" + randomBytes(16).toString("hex");
}

/**
 * Generates a webhook signing secret using crypto.randomBytes.
 */
export function generateWebhookSecret(): string {
  return "whsec_" + randomBytes(24).toString("base64url");
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
