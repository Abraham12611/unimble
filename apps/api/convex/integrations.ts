/**
 * Integration management module — queries, mutations, and internal helpers.
 *
 * Composio SDK actions are in integrationActions.ts (requires "use node").
 * This file contains all DB operations and the static registry queries.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
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
// Internal queries — used by actions for auth verification
// ---------------------------------------------------------------------------

/**
 * Internal query: verifies the caller has workspace membership.
 * Called from actions via ctx.runQuery.
 */
export const verifyWorkspaceAccess = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    return true;
  },
});

/**
 * Internal query: verifies the caller is workspace owner or admin.
 * Called from actions via ctx.runQuery.
 */
export const verifyWorkspaceOwnerOrAdmin = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceOwnerOrAdmin(ctx, args.workspaceId);
    return true;
  },
});

/**
 * Internal query: fetches an integration record by ID without
 * workspace access checks. The calling action is responsible for
 * verifying workspace ownership after receiving the record.
 */
export const getIntegrationById = internalQuery({
  args: { id: v.id("integrations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ---------------------------------------------------------------------------
// Internal mutations — called from actions (auth already verified)
// ---------------------------------------------------------------------------

/**
 * Internal mutation: upserts an integration record.
 * Called from connectWithApiKey action after auth is already verified.
 */
export const upsertIntegrationInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    provider: v.string(),
    name: v.string(),
    credentialsRef: v.optional(v.string()),
    config: v.optional(v.any()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

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
 * Internal mutation: disconnects an integration by setting status.
 * Called from disconnectToolkit action after Composio revocation.
 */
export const disconnectIntegrationInternal = internalMutation({
  args: { id: v.id("integrations") },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.id);
    if (!integration) throw new Error("Integration not found");

    await ctx.db.patch(args.id, {
      status: "disconnected",
      credentialsRef: undefined,
      updatedAt: Date.now(),
    });
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
// Mutations (write to Convex DB — client-facing)
// ---------------------------------------------------------------------------

/**
 * Creates or updates a local integration record.
 * Called directly from the client after OAuth callback success.
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
