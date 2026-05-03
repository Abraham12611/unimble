/**
 * Phase 7 — Agent Runtime: Long-term memory via Mem0.
 *
 * Wraps the Mem0 SDK behind a narrow interface so it can be mocked in tests.
 * Supports five memory categories:
 *   workspace      — facts about the workspace (brand, tone, goals)
 *   operator       — facts about the specific AI operator/persona
 *   preferences    — user-level preferences
 *   patterns       — learned content patterns and what performs well
 *   content-history — past content pieces, topics, and performance
 *
 * All methods accept and return plain serialisable data.
 */

import type { MemoryCategory, MemoryEntry } from "../types";

// ---------------------------------------------------------------------------
// Mem0 client interface
// ---------------------------------------------------------------------------

export interface Mem0SearchResult {
  id: string;
  memory: string;
  score?: number;
  metadata?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
}

export interface Mem0Client {
  add(
    messages: Array<{ role: string; content: string }>,
    config: { userId?: string; agentId?: string; metadata?: Record<string, unknown> }
  ): Promise<{ results: Array<{ id: string; event: string }> }>;

  search(
    query: string,
    config: { userId?: string; agentId?: string; limit?: number; filters?: Record<string, unknown> }
  ): Promise<{ results: Mem0SearchResult[] }>;

  update(
    memoryId: string,
    data: string
  ): Promise<void>;

  delete(memoryId: string): Promise<void>;

  getAll(config: {
    userId?: string;
    agentId?: string;
    filters?: Record<string, unknown>;
    limit?: number;
  }): Promise<{ results: Mem0SearchResult[] }>;
}

// ---------------------------------------------------------------------------
// Category → agentId mapping
// ---------------------------------------------------------------------------

const CATEGORY_AGENT_IDS: Record<MemoryCategory, string> = {
  workspace: "unimble-workspace",
  operator: "unimble-operator",
  preferences: "unimble-preferences",
  patterns: "unimble-patterns",
  "content-history": "unimble-content-history",
};

// ---------------------------------------------------------------------------
// LongTermMemory
// ---------------------------------------------------------------------------

export class LongTermMemory {
  constructor(
    private readonly client: Mem0Client,
    private readonly workspaceId: string,
    private readonly userId?: string
  ) {}

  /**
   * Store a new memory.
   * Returns the ID of the created memory.
   */
  async create(
    content: string,
    category: MemoryCategory,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const agentId = CATEGORY_AGENT_IDS[category];
    const result = await this.client.add(
      [{ role: "user", content }],
      {
        agentId,
        userId: this.userId ?? this.workspaceId,
        metadata: {
          workspaceId: this.workspaceId,
          category,
          ...metadata,
        },
      }
    );
    return result.results[0]?.id ?? "";
  }

  /**
   * Semantic search over stored memories.
   * Returns memories sorted by relevance (highest score first).
   */
  async retrieve(
    query: string,
    category?: MemoryCategory,
    limit = 10
  ): Promise<MemoryEntry[]> {
    const filters: Record<string, unknown> = {
      workspaceId: this.workspaceId,
    };
    if (category) {
      filters.category = category;
    }

    const config: Parameters<Mem0Client["search"]>[1] = {
      userId: this.userId ?? this.workspaceId,
      limit,
      filters,
    };

    if (category) {
      config.agentId = CATEGORY_AGENT_IDS[category];
    }

    const response = await this.client.search(query, config);

    return response.results.map((r) => ({
      id: r.id,
      category: (r.metadata?.category as MemoryCategory) ?? "workspace",
      content: r.memory,
      score: r.score,
      metadata: r.metadata,
      createdAt: r.createdAt ?? Date.now(),
      updatedAt: r.updatedAt ?? Date.now(),
    }));
  }

  /**
   * Update the content of an existing memory by ID.
   */
  async update(memoryId: string, newContent: string): Promise<void> {
    await this.client.update(memoryId, newContent);
  }

  /**
   * Delete a memory by ID.
   */
  async delete(memoryId: string): Promise<void> {
    await this.client.delete(memoryId);
  }

  /**
   * List all memories for a given category (no semantic search).
   */
  async listByCategory(
    category: MemoryCategory,
    limit = 50
  ): Promise<MemoryEntry[]> {
    const response = await this.client.getAll({
      agentId: CATEGORY_AGENT_IDS[category],
      userId: this.userId ?? this.workspaceId,
      filters: { workspaceId: this.workspaceId, category },
      limit,
    });

    return response.results.map((r) => ({
      id: r.id,
      category,
      content: r.memory,
      score: r.score,
      metadata: r.metadata,
      createdAt: r.createdAt ?? Date.now(),
      updatedAt: r.updatedAt ?? Date.now(),
    }));
  }
}
