/**
 * Workflow Engine — Webhook Trigger System
 *
 * Handles incoming webhook requests that trigger workflow executions.
 * Each workflow with a webhook trigger gets a unique URL path and
 * an optional HMAC signature secret for verification.
 */

import { v } from "convex/values";
import { createHmac, timingSafeEqual } from "crypto";
import { internalMutation } from "../_generated/server";

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verifies an HMAC-SHA256 webhook signature.
 *
 * @param payload - The raw request body
 * @param signature - The signature from the request header
 * @param secret - The webhook secret
 * @returns Whether the signature is valid
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
 * Generates a unique webhook path for a workflow.
 */
export function generateWebhookPath(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let path = "wh_";
  for (let i = 0; i < 24; i++) {
    path += chars[Math.floor(Math.random() * chars.length)];
  }
  return path;
}

/**
 * Generates a webhook signing secret.
 */
export function generateWebhookSecret(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let secret = "whsec_";
  for (let i = 0; i < 32; i++) {
    secret += chars[Math.floor(Math.random() * chars.length)];
  }
  return secret;
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
    payload: v.any(),
    signature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find workflow by webhook path
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(1000);

    const workflow = workflows.find((wf) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trigger = wf.trigger as any;
      return (
        trigger?.type === "webhook" && trigger?.enabled === true && trigger?.path === args.path
      );
    });

    if (!workflow) {
      return { ok: false, error: "No matching workflow found" };
    }

    // Verify signature if secret is configured
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trigger = workflow.trigger as any;
    if (trigger.secret && args.signature) {
      const payloadStr =
        typeof args.payload === "string" ? args.payload : JSON.stringify(args.payload);
      const valid = verifyWebhookSignature(payloadStr, args.signature, trigger.secret);
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

    return { ok: true, executionId };
  },
});
