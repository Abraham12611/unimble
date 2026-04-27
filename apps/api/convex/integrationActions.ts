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

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getIntegrationBySlug } from "./lib/integrationRegistry";

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
 * Returns a redirect URL the user should visit.
 */
export const initiateToolkitAuth = action({
  args: {
    workspaceId: v.id("workspaces"),
    toolkitSlug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedAction(ctx);
    await ctx.runQuery(internal.integrations.verifyWorkspaceOwnerOrAdmin, {
      workspaceId: args.workspaceId,
    });

    const { initiateToolkitAuth: initAuth } = await import("./lib/composio");
    return await initAuth(args.workspaceId, args.toolkitSlug);
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
