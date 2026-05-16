"use node";

/**
 * Agent Runtime — Long-Term Memory (Convex Vector Search)
 *
 * Persistent memory store using Convex's native vector search:
 * - Create, read, update, delete memories
 * - Semantic search via embedding similarity
 * - Scoped access (workspace, operator, agent, execution)
 * - Importance-based ranking and decay
 * - Access tracking for relevance scoring
 *
 * Uses OpenRouter embeddings (text-embedding-3-small, 1536 dims)
 * for vector similarity search via Convex's vectorSearch API.
 *
 * Phase 7.4.2 — Long-Term Memory
 */

import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../../_generated/server";
import { makeFunctionReference } from "convex/server";
import type { MemoryEntry, MemoryScope } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for creating a memory. */
export interface CreateMemoryInput {
  workspaceId: Id<"workspaces">;
  operatorId?: Id<"operators">;
  scope: MemoryScope;
  scopeId: string;
  category: string;
  content: string;
  importance?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

/** Options for searching memories. */
export interface SearchMemoryOptions {
  workspaceId: Id<"workspaces">;
  query: string;
  /** Filter by scope */
  scope?: MemoryScope;
  /** Filter by scope ID */
  scopeId?: string;
  /** Filter by category */
  category?: string;
  /** Maximum results (default: 10) */
  limit?: number;
  /** Minimum similarity score 0-1 (default: 0.7) */
  minScore?: number;
}

/** A memory search result with similarity score. */
export interface MemorySearchResult {
  memory: MemoryEntry;
  score: number;
}

// ---------------------------------------------------------------------------
// Internal Mutations — Memory CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a new memory entry in the database.
 * Called from actions after generating the embedding.
 */
export const createMemoryRecord = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    operatorId: v.optional(v.id("operators")),
    scope: v.string(),
    scopeId: v.string(),
    category: v.string(),
    content: v.string(),
    embedding: v.optional(v.array(v.float64())),
    importance: v.number(),
    source: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("memories", {
      workspaceId: args.workspaceId,
      operatorId: args.operatorId,
      scope: args.scope,
      scopeId: args.scopeId,
      category: args.category,
      content: args.content,
      embedding: args.embedding,
      importance: args.importance,
      source: args.source,
      metadata: args.metadata,
      accessCount: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

/**
 * Updates an existing memory's content and re-embeds.
 */
export const updateMemoryRecord = internalMutation({
  args: {
    memoryId: v.id("memories"),
    content: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    importance: v.optional(v.number()),
    metadata: v.optional(v.any()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { memoryId, ...updates } = args;
    const existing = await ctx.db.get(memoryId);
    if (!existing) throw new Error(`Memory ${memoryId} not found`);

    await ctx.db.patch(memoryId, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Records a memory access (increments accessCount, updates lastAccessedAt).
 */
export const recordMemoryAccess = internalMutation({
  args: {
    memoryIds: v.array(v.id("memories")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.memoryIds) {
      const memory = await ctx.db.get(id);
      if (memory) {
        await ctx.db.patch(id, {
          accessCount: memory.accessCount + 1,
          lastAccessedAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

/**
 * Soft-deletes a memory (sets status to "archived").
 */
export const archiveMemory = internalMutation({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.memoryId, {
      status: "archived",
      updatedAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Internal Queries — Memory Retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieves memories by their IDs (used after vectorSearch to get full docs).
 */
export const getMemoriesByIds = internalQuery({
  args: {
    memoryIds: v.array(v.id("memories")),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const id of args.memoryIds) {
      const doc = await ctx.db.get(id);
      if (doc) results.push(doc);
    }
    return results;
  },
});

/**
 * Retrieves memories by scope and category (non-vector, index-based).
 *
 * When category is specified, uses the by_workspace_and_category index
 * for efficient filtering. Otherwise uses by_scope_and_id.
 */
export const getMemoriesByScope = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    scope: v.string(),
    scopeId: v.string(),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    // If category is specified, use the category index for accurate results
    if (args.category) {
      const results = await ctx.db
        .query("memories")
        .withIndex("by_workspace_and_category", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("category", args.category!)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("scope"), args.scope),
            q.eq(q.field("scopeId"), args.scopeId),
            q.eq(q.field("status"), "active")
          )
        )
        .order("desc")
        .take(limit);
      return results;
    }

    // No category filter — use scope index
    const results = await ctx.db
      .query("memories")
      .withIndex("by_scope_and_id", (q) => q.eq("scope", args.scope).eq("scopeId", args.scopeId))
      .filter((q) =>
        q.and(q.eq(q.field("workspaceId"), args.workspaceId), q.eq(q.field("status"), "active"))
      )
      .order("desc")
      .take(limit);

    return results;
  },
});

/**
 * Retrieves memories by workspace and category.
 */
export const getMemoriesByCategory = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    category: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("memories")
      .withIndex("by_workspace_and_category", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("category", args.category)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .order("desc")
      .take(args.limit ?? 20);
  },
});

// ---------------------------------------------------------------------------
// Function references for calling mutations from actions
// ---------------------------------------------------------------------------

const createMemoryRecordRef = makeFunctionReference<
  "mutation",
  {
    workspaceId: Id<"workspaces">;
    operatorId?: Id<"operators">;
    scope: string;
    scopeId: string;
    category: string;
    content: string;
    embedding?: number[];
    importance: number;
    source: string;
    metadata?: unknown;
  }
>("agent/memory/longTermMemory:createMemoryRecord");

const recordMemoryAccessRef = makeFunctionReference<"mutation", { memoryIds: Id<"memories">[] }>(
  "agent/memory/longTermMemory:recordMemoryAccess"
);

// ---------------------------------------------------------------------------
// Internal Action — Memory Creation with Embedding
// ---------------------------------------------------------------------------

/**
 * Creates a memory with automatic embedding generation.
 * Runs as an action (Node.js) to call the embedding API.
 */
export const createMemory = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    operatorId: v.optional(v.id("operators")),
    scope: v.string(),
    scopeId: v.string(),
    category: v.string(),
    content: v.string(),
    importance: v.optional(v.number()),
    source: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Generate embedding for semantic search
    const { llmEmbed } = await import("../../lib/integrations/llm");
    const embedResult = await llmEmbed(args.content);

    // Store the memory with embedding
    const memoryId = await ctx.runMutation(createMemoryRecordRef, {
      workspaceId: args.workspaceId,
      operatorId: args.operatorId,
      scope: args.scope,
      scopeId: args.scopeId,
      category: args.category,
      content: args.content,
      embedding: embedResult.embedding,
      importance: args.importance ?? 0.5,
      source: args.source ?? "agent",
      metadata: args.metadata,
    });

    return { memoryId, embeddingCost: embedResult.cost };
  },
});

/**
 * Searches memories using vector similarity.
 * Runs as an action to generate the query embedding.
 *
 * Note: Convex vectorSearch filter supports only a single q.eq() call.
 * We filter by workspaceId at the index level (most selective), then
 * fetch full documents and apply scope/category/status filters in code.
 */
export const searchMemories = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    query: v.string(),
    scope: v.optional(v.string()),
    scopeId: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Generate embedding for the search query
    const { llmEmbed } = await import("../../lib/integrations/llm");
    const embedResult = await llmEmbed(args.query);

    // Perform vector search filtered by workspaceId.
    // Convex vectorSearch returns only { _id, _score }.
    // Request more results than needed to account for post-filtering.
    const requestLimit = (args.limit ?? 10) * 3;
    const vectorResults = await ctx.vectorSearch("memories", "by_embedding", {
      vector: embedResult.embedding,
      limit: Math.min(requestLimit, 64),
      filter: (q) => q.eq("workspaceId", args.workspaceId),
    });

    if (vectorResults.length === 0) {
      return { results: [], embeddingCost: embedResult.cost };
    }

    // Fetch full documents to apply additional filters
    const getMemoriesByIdsRef = makeFunctionReference<"query", { memoryIds: Id<"memories">[] }>(
      "agent/memory/longTermMemory:getMemoriesByIds"
    );

    const fullDocs = await ctx.runQuery(getMemoriesByIdsRef, {
      memoryIds: vectorResults.map((r) => r._id),
    });

    // Build a score map from vector results
    const scoreMap = new Map(vectorResults.map((r) => [r._id.toString(), r._score]));

    // Apply post-filters on full documents
    const filtered = fullDocs.filter(
      (doc: {
        status: string;
        scope: string;
        scopeId: string;
        category: string;
        _id: Id<"memories">;
      }) => {
        if (doc.status !== "active") return false;
        if (args.scope && doc.scope !== args.scope) return false;
        if (args.scopeId && doc.scopeId !== args.scopeId) return false;
        if (args.category && doc.category !== args.category) return false;
        return true;
      }
    );

    // Limit to requested count
    const limited = filtered.slice(0, args.limit ?? 10);

    // Record access for retrieved memories
    if (limited.length > 0) {
      await ctx.runMutation(recordMemoryAccessRef, {
        memoryIds: limited.map((doc: { _id: Id<"memories"> }) => doc._id),
      });
    }

    // Return full document data matching MemorySearchResult interface
    return {
      results: limited.map(
        (doc: {
          _id: Id<"memories">;
          scope: string;
          scopeId: string;
          category: string;
          content: string;
          importance: number;
          createdAt: number;
          accessCount: number;
          lastAccessedAt?: number;
          metadata?: unknown;
          embedding?: number[];
        }) => ({
          memory: {
            id: doc._id as string,
            scope: doc.scope,
            scopeId: doc.scopeId,
            category: doc.category,
            content: doc.content,
            importance: doc.importance,
            createdAt: doc.createdAt,
            accessCount: doc.accessCount,
            lastAccessedAt: doc.lastAccessedAt,
            metadata: doc.metadata as Record<string, unknown> | undefined,
          },
          score: scoreMap.get(doc._id.toString()) ?? 0,
        })
      ),
      embeddingCost: embedResult.cost,
    };
  },
});
