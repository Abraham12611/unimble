"use node";

/**
 * Integration actions — Composio SDK calls that require Node.js runtime.
 *
 * These actions are separated from integrations.ts because the Composio
 * SDK uses Node.js APIs (fs, path, crypto) that are not available in
 * Convex's default V8 runtime. The "use node" directive ensures these
 * run in a Node.js environment.
 *
 * All actions verify authentication and workspace access before
 * making any Composio API calls.
 *
 * Note: We use dynamic imports for ./lib/composio to ensure the
 * Node.js-dependent code is only loaded at runtime in the Node
 * environment, not during Convex's V8 bundling phase.
 */

import { createHmac } from "crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getIntegrationBySlug } from "./lib/integrationRegistry";

// ---------------------------------------------------------------------------
// OAuth state signing
// ---------------------------------------------------------------------------

/**
 * Generates an HMAC-SHA256 signed OAuth state token.
 *
 * Format: `{workspaceSlug}:{timestamp}:{signature}`
 *
 * The signature prevents forgery — only the server with the secret
 * can produce a valid state. The timestamp provides a 10-minute
 * freshness window.
 */
function generateOAuthState(workspaceSlug: string): string {
  const secret = getOAuthStateSecret();
  const timestamp = Date.now().toString();
  const payload = `${workspaceSlug}:${timestamp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}:${sig}`;
}

function getOAuthStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET is not set. Add it to your Convex environment variables.");
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Auth helper for actions
// ---------------------------------------------------------------------------

async function requireAuthenticatedAction(ctx: {
  auth: { getUserIdentity: () => Promise<unknown> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Tests the Composio API connection.
 * Requires authentication.
 */
export const testComposioConnection = action({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; message: string }> => {
    await requireAuthenticatedAction(ctx);
    const { testComposioConnection: test } = await import("./lib/composio");
    return await test();
  },
});

/**
 * Lists toolkit connection statuses for a workspace.
 * Requires workspace membership.
 */
export const getToolkitStatuses = action({
  args: {
    workspaceId: v.id("workspaces"),
    toolkitSlugs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedAction(ctx);
    await ctx.runQuery(internal.integrations.verifyWorkspaceAccess, {
      workspaceId: args.workspaceId,
    });

    const { getToolkitStatuses: getStatuses } = await import("./lib/composio");
    return await getStatuses(args.workspaceId, args.toolkitSlugs);
  },
});

/**
 * Initiates an OAuth authorization flow for a toolkit.
 * Requires workspace owner or admin.
 *
 * Builds an OAuth callback URL with the HMAC-signed state embedded
 * as a query parameter. Composio preserves custom query params in
 * the callback URL, so the state travels through the OAuth provider
 * and arrives at our callback route for CSRF validation.
 */
export const initiateToolkitAuth = action({
  args: {
    workspaceId: v.id("workspaces"),
    toolkitSlug: v.string(),
    workspaceSlug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedAction(ctx);
    await ctx.runQuery(internal.integrations.verifyWorkspaceOwnerOrAdmin, {
      workspaceId: args.workspaceId,
    });

    // Generate HMAC-signed state for CSRF protection
    const state = generateOAuthState(args.workspaceSlug);

    // Build callback URL with state and toolkit embedded as query params.
    // Composio preserves these params and echoes them back after OAuth.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const callbackUrl = new URL("/api/integrations/oauth/callback", appUrl);
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("toolkit", args.toolkitSlug);

    const { initiateToolkitAuth: initAuth } = await import("./lib/composio");
    const result = await initAuth(args.workspaceId, args.toolkitSlug, callbackUrl.toString());

    return {
      redirectUrl: result.redirectUrl,
    };
  },
});

/**
 * Validates an API key by attempting to create a Composio connected
 * account for the given toolkit.
 * Requires workspace owner or admin.
 */
export const validateApiKey = action({
  args: {
    workspaceId: v.id("workspaces"),
    toolkitSlug: v.string(),
    apiKey: v.string(),
    authConfigId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    ok: boolean;
    message: string;
    connectedAccountId?: string;
  }> => {
    await requireAuthenticatedAction(ctx);
    await ctx.runQuery(internal.integrations.verifyWorkspaceOwnerOrAdmin, {
      workspaceId: args.workspaceId,
    });

    const { validateApiKeyConnection } = await import("./lib/composio");
    return await validateApiKeyConnection(
      args.workspaceId,
      args.toolkitSlug,
      args.apiKey,
      args.authConfigId
    );
  },
});

/**
 * Connects an API-key-based integration end-to-end:
 * 1. Validates the key via Composio
 * 2. Stores the integration record in the local DB
 * Requires workspace owner or admin.
 */
export const connectWithApiKey = action({
  args: {
    workspaceId: v.id("workspaces"),
    toolkitSlug: v.string(),
    apiKey: v.string(),
    authConfigId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedAction(ctx);
    await ctx.runQuery(internal.integrations.verifyWorkspaceOwnerOrAdmin, {
      workspaceId: args.workspaceId,
    });

    // Step 1: Validate the API key via Composio
    const { validateApiKeyConnection } = await import("./lib/composio");
    const validation = await validateApiKeyConnection(
      args.workspaceId,
      args.toolkitSlug,
      args.apiKey,
      args.authConfigId
    );

    if (!validation.ok) {
      return { ok: false, message: validation.message };
    }

    // Step 2: Store the integration record via internal mutation.
    // We store a reference identifier, never the raw API key.
    const meta = getIntegrationBySlug(args.toolkitSlug);

    await ctx.runMutation(internal.integrations.upsertIntegrationInternal, {
      workspaceId: args.workspaceId,
      provider: args.toolkitSlug,
      name: meta?.name ?? args.toolkitSlug,
      credentialsRef: validation.connectedAccountId
        ? `composio:${validation.connectedAccountId}`
        : `composio:${args.workspaceId}:${args.toolkitSlug}`,
      status: "active",
    });

    return { ok: true, message: validation.message };
  },
});

/**
 * Disconnects an integration: revokes the Composio connected account
 * and updates the local DB record.
 * Requires workspace owner or admin.
 */
export const disconnectToolkit = action({
  args: {
    integrationId: v.id("integrations"),
    credentialsRef: v.string(),
  },
  handler: async (ctx, args) => {
    // Extract the Composio connected account ID from the ref
    // Format: "composio:{connectedAccountId}" or "composio:{wsId}:{slug}"
    const parts = args.credentialsRef.split(":");
    const composioAccountId = parts.length >= 2 ? parts[1] : null;

    // Revoke the Composio connected account if we have an ID
    if (composioAccountId) {
      const { revokeConnectedAccount } = await import("./lib/composio");
      const result = await revokeConnectedAccount(composioAccountId);
      if (!result.ok) {
        // Log but don't block — still clean up the local record
        console.warn(`Failed to revoke Composio account ${composioAccountId}: ${result.message}`);
      }
    }

    // Update the local DB record via internal mutation
    await ctx.runMutation(internal.integrations.disconnectIntegrationInternal, {
      id: args.integrationId,
    });

    return { ok: true };
  },
});
