/**
 * Integration management module.
 *
 * Handles Composio-powered external service connections,
 * OAuth flows, API key storage, and toolkit status queries.
 *
 * All external API calls use Convex **actions** (not queries/mutations)
 * because they make HTTP requests to Composio's API.
 */

import { v } from "convex/values";
import { action, query, mutation } from "./_generated/server";
import { requireWorkspaceAccess, requireWorkspaceOwnerOrAdmin } from "./lib/auth";
import {
  INTEGRATIONS,
  INTEGRATION_CATEGORIES,
  getActiveIntegrations,
  getIntegrationBySlug,
  type IntegrationCategory,
  type IntegrationMeta,
} from "./lib/integrationRegistry";

// ---------------------------------------------------------------------------
// Actions (external API calls via Composio SDK)
// ---------------------------------------------------------------------------

/**
 * Tests the Composio API connection.
 * Only callable by authenticated users.
 */
export const testComposioConnection = action({
  args: {},
  handler: async (): Promise<{ ok: boolean; message: string }> => {
    const { testComposioConnection: test } = await import("./lib/composio");
    return await test();
  },
});

/**
 * Lists toolkit connection statuses for a workspace.
 * Each workspace maps to a Composio user_id.
 */
export const getToolkitStatuses = action({
  args: {
    workspaceId: v.string(),
    toolkitSlugs: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    const { getToolkitStatuses: getStatuses } = await import("./lib/composio");
    return await getStatuses(args.workspaceId, args.toolkitSlugs);
  },
});

/**
 * Initiates an OAuth authorization flow for a toolkit.
 * Returns a redirect URL the user should visit.
 */
export const initiateToolkitAuth = action({
  args: {
    workspaceId: v.string(),
    toolkitSlug: v.string(),
  },
  handler: async (_ctx, args) => {
    const { initiateToolkitAuth: initAuth } = await import("./lib/composio");
    return await initAuth(args.workspaceId, args.toolkitSlug);
  },
});

// ---------------------------------------------------------------------------
// Queries — Integration Registry (static catalog, no DB needed)
// ---------------------------------------------------------------------------

/**
 * Returns the full integration catalog with optional filtering.
 * No auth required — this is public metadata.
 */
export const getIntegrationCatalog = query({
  args: {
    category: v.optional(v.string()),
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    let results: IntegrationMeta[] = INTEGRATIONS;

    if (args.activeOnly) {
      results = getActiveIntegrations();
    }

    if (args.category) {
      results = results.filter(
        (i) =>
          i.category === args.category ||
          i.secondaryCategories?.includes(args.category as IntegrationCategory)
      );
    }

    if (args.search) {
      const lower = args.search.toLowerCase();
      results = results.filter(
        (i) =>
          i.name.toLowerCase().includes(lower) ||
          i.description.toLowerCase().includes(lower) ||
          i.slug.includes(lower)
      );
    }

    return results;
  },
});

/**
 * Returns all integration categories with labels and descriptions.
 */
export const getIntegrationCategories = query({
  args: {},
  handler: async () => {
    return Object.entries(INTEGRATION_CATEGORIES).map(([key, value]) => ({
      key,
      ...value,
    }));
  },
});

/**
 * Returns metadata for a single integration by slug.
 */
export const getIntegrationMeta = query({
  args: { slug: v.string() },
  handler: async (_ctx, args) => {
    return getIntegrationBySlug(args.slug) ?? null;
  },
});

// ---------------------------------------------------------------------------
// Queries — Workspace Integrations (from Convex DB)
// ---------------------------------------------------------------------------

/**
 * Lists all integrations for a workspace from the local DB.
 * This is the cached/persisted view of connected integrations.
 */
export const listIntegrations = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);

    return await ctx.db
      .query("integrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(1000);
  },
});

/**
 * Gets a single integration by ID.
 */
export const getIntegration = query({
  args: { id: v.id("integrations") },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.id);
    if (!integration) throw new Error("Integration not found");

    await requireWorkspaceAccess(ctx, integration.workspaceId);
    return integration;
  },
});

/**
 * Gets an integration by workspace + provider.
 */
export const getIntegrationByProvider = query({
  args: {
    workspaceId: v.id("workspaces"),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);

    return await ctx.db
      .query("integrations")
      .withIndex("by_workspace_and_provider", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("provider", args.provider)
      )
      .unique();
  },
});

// ---------------------------------------------------------------------------
// Mutations (write to Convex DB)
// ---------------------------------------------------------------------------

/**
 * Creates or updates a local integration record after a successful connection.
 * Called after OAuth callback or API key validation succeeds.
 */
export const upsertIntegration = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    provider: v.string(),
    name: v.string(),
    credentialsRef: v.optional(v.string()),
    config: v.optional(v.any()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceOwnerOrAdmin(ctx, args.workspaceId);

    const now = Date.now();

    // Check if integration already exists for this workspace + provider
    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_workspace_and_provider", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("provider", args.provider)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        credentialsRef: args.credentialsRef,
        config: args.config,
        status: args.status ?? "active",
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("integrations", {
      workspaceId: args.workspaceId,
      provider: args.provider,
      name: args.name,
      credentialsRef: args.credentialsRef,
      config: args.config,
      status: args.status ?? "active",
      lastUsedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Disconnects an integration by setting its status to "disconnected".
 */
export const disconnectIntegration = mutation({
  args: { id: v.id("integrations") },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.id);
    if (!integration) throw new Error("Integration not found");

    await requireWorkspaceOwnerOrAdmin(ctx, integration.workspaceId);

    await ctx.db.patch(args.id, {
      status: "disconnected",
      credentialsRef: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Deletes an integration record entirely.
 */
export const deleteIntegration = mutation({
  args: { id: v.id("integrations") },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.id);
    if (!integration) throw new Error("Integration not found");

    await requireWorkspaceOwnerOrAdmin(ctx, integration.workspaceId);

    await ctx.db.delete(args.id);
  },
});
