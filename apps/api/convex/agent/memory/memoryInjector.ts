/**
 * Agent Runtime — Memory Injection
 *
 * Selects and formats relevant memories for injection into agent context.
 * Handles:
 * - Relevance scoring (semantic similarity + importance + recency)
 * - Token budgeting (fits memories within available context space)
 * - Category-aware selection (respects maxInjected per category)
 * - Formatting for LLM consumption
 *
 * This module is pure (no DB access) and runs in both runtimes.
 * It operates on pre-fetched memory data.
 *
 * Phase 7.4.4 — Memory Injection
 */

import type { MemoryEntry } from "../types";
import { calculateEffectiveImportance, getCategory } from "./memoryCategories";
import type { MemoryCategoryDef } from "./memoryCategories";
import { estimateTokenCount } from "./shortTermMemory";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for memory injection. */
export interface MemoryInjectionConfig {
  /** Maximum tokens to allocate for memory context (default: 1500) */
  maxTokens: number;
  /** Minimum relevance score to include (default: 0.3) */
  minRelevance: number;
  /** Whether to include category headers (default: true) */
  includeCategoryHeaders: boolean;
  /** Format for injected memories */
  format: "bullet" | "prose" | "structured";
  /** Categories to include (empty = all) */
  categories?: string[];
  /** Categories to exclude */
  excludeCategories?: string[];
}

/** A scored memory ready for injection. */
export interface ScoredMemory {
  memory: MemoryEntry;
  /** Combined relevance score (0-1) */
  relevanceScore: number;
  /** Similarity score from vector search (0-1, if available) */
  similarityScore?: number;
  /** Effective importance after decay */
  effectiveImportance: number;
  /** Estimated tokens for this memory */
  estimatedTokens: number;
}

/** Result of memory injection. */
export interface InjectionResult {
  /** Formatted text to inject into the system prompt */
  text: string;
  /** Memories that were included */
  included: ScoredMemory[];
  /** Memories that were excluded (over budget or below threshold) */
  excluded: ScoredMemory[];
  /** Total tokens used */
  totalTokens: number;
  /** Token budget remaining */
  remainingBudget: number;
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export const DEFAULT_INJECTION_CONFIG: MemoryInjectionConfig = {
  maxTokens: 1500,
  minRelevance: 0.3,
  includeCategoryHeaders: true,
  format: "bullet",
};

// ---------------------------------------------------------------------------
// Memory Injector
// ---------------------------------------------------------------------------

/**
 * Selects and formats memories for injection into agent context.
 *
 * Algorithm:
 * 1. Score each memory (importance × decay × similarity × recency)
 * 2. Sort by score descending
 * 3. Apply per-category limits
 * 4. Fill token budget greedily (highest score first)
 * 5. Format for LLM consumption
 */
export function injectMemories(
  memories: MemoryEntry[],
  config?: Partial<MemoryInjectionConfig>,
  similarityScores?: Map<string, number>
): InjectionResult {
  const cfg = { ...DEFAULT_INJECTION_CONFIG, ...config };

  if (memories.length === 0) {
    return {
      text: "",
      included: [],
      excluded: [],
      totalTokens: 0,
      remainingBudget: cfg.maxTokens,
    };
  }

  // Step 1: Score all memories
  const scored = scoreMemories(memories, similarityScores);

  // Step 2: Filter by minimum relevance
  const eligible = scored.filter((s) => s.relevanceScore >= cfg.minRelevance);
  const belowThreshold = scored.filter((s) => s.relevanceScore < cfg.minRelevance);

  // Step 3: Apply category filters
  let filtered = eligible;
  if (cfg.categories && cfg.categories.length > 0) {
    filtered = filtered.filter((s) => cfg.categories!.includes(s.memory.category));
  }
  if (cfg.excludeCategories && cfg.excludeCategories.length > 0) {
    filtered = filtered.filter((s) => !cfg.excludeCategories!.includes(s.memory.category));
  }

  // Step 4: Sort by relevance score (highest first)
  filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Step 5: Apply per-category limits
  const categoryCounts: Record<string, number> = {};
  const categoryLimited: ScoredMemory[] = [];

  for (const item of filtered) {
    const catDef = getCategory(item.memory.category);
    const maxPerCategory = catDef?.maxInjected ?? 5;
    const currentCount = categoryCounts[item.memory.category] ?? 0;

    if (currentCount < maxPerCategory) {
      categoryLimited.push(item);
      categoryCounts[item.memory.category] = currentCount + 1;
    }
  }

  // Step 6: Fill token budget
  const included: ScoredMemory[] = [];
  const excluded: ScoredMemory[] = [];
  let usedTokens = 0;

  // Account for header overhead
  if (cfg.includeCategoryHeaders) {
    usedTokens += 10; // "## Relevant Context (from memory)\n"
  }

  for (const item of categoryLimited) {
    const tokenCost = item.estimatedTokens + 5; // +5 for bullet/formatting
    if (usedTokens + tokenCost <= cfg.maxTokens) {
      included.push(item);
      usedTokens += tokenCost;
    } else {
      excluded.push(item);
    }
  }

  // Add below-threshold items to excluded
  excluded.push(...belowThreshold);

  // Step 7: Format the output
  const text = formatMemories(included, cfg);
  const totalTokens = estimateTokenCount(text);

  return {
    text,
    included,
    excluded,
    totalTokens,
    remainingBudget: cfg.maxTokens - totalTokens,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Scores memories based on multiple factors:
 * - Effective importance (base importance × decay)
 * - Similarity score (from vector search, if available)
 * - Recency bonus
 * - Access frequency bonus
 */
function scoreMemories(
  memories: MemoryEntry[],
  similarityScores?: Map<string, number>
): ScoredMemory[] {
  const now = Date.now();

  return memories.map((memory) => {
    const catDef =
      getCategory(memory.category) ??
      ({
        decays: false,
        decayHalfLifeDays: undefined,
        defaultImportance: 0.5,
        maxInjected: 5,
      } as unknown as MemoryCategoryDef);

    // Effective importance with decay
    const effectiveImportance = calculateEffectiveImportance(
      memory.importance,
      memory.createdAt,
      memory.accessCount,
      catDef,
      now
    );

    // Similarity score (from vector search)
    const similarityScore = similarityScores?.get(memory.id) ?? 0.5;

    // Recency bonus (memories from last 24h get a boost)
    const ageHours = (now - memory.createdAt) / (1000 * 60 * 60);
    const recencyBonus = ageHours < 24 ? 0.1 : ageHours < 168 ? 0.05 : 0;

    // Combined relevance score
    // Weights: similarity 40%, importance 35%, recency 15%, access 10%
    const accessScore = Math.min(1.0, memory.accessCount / 10);
    const relevanceScore = Math.min(
      1.0,
      similarityScore * 0.4 + effectiveImportance * 0.35 + recencyBonus + accessScore * 0.1
    );

    // Estimate tokens for this memory
    const estimatedTokens = estimateTokenCount(memory.content);

    return {
      memory,
      relevanceScore,
      similarityScore,
      effectiveImportance,
      estimatedTokens,
    };
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Formats selected memories into text for injection.
 */
function formatMemories(memories: ScoredMemory[], config: MemoryInjectionConfig): string {
  if (memories.length === 0) return "";

  switch (config.format) {
    case "bullet":
      return formatBullet(memories, config.includeCategoryHeaders);
    case "prose":
      return formatProse(memories);
    case "structured":
      return formatStructured(memories);
    default:
      return formatBullet(memories, config.includeCategoryHeaders);
  }
}

/**
 * Bullet-point format grouped by category.
 */
function formatBullet(memories: ScoredMemory[], includeHeaders: boolean): string {
  if (!includeHeaders) {
    return memories.map((m) => `- [${m.memory.category}] ${m.memory.content}`).join("\n");
  }

  // Group by category
  const grouped: Record<string, ScoredMemory[]> = {};
  for (const m of memories) {
    const cat = m.memory.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  }

  const sections: string[] = [];
  for (const [category, items] of Object.entries(grouped)) {
    const catDef = getCategory(category);
    const header = catDef?.name ?? category;
    sections.push(`**${header}:**`);
    for (const item of items) {
      sections.push(`- ${item.memory.content}`);
    }
  }

  return sections.join("\n");
}

/**
 * Prose format (natural language paragraph).
 */
function formatProse(memories: ScoredMemory[]): string {
  const parts = memories.map((m) => m.memory.content);
  return `Here is relevant context from memory: ${parts.join(". ")}.`;
}

/**
 * Structured format with metadata.
 */
function formatStructured(memories: ScoredMemory[]): string {
  const lines: string[] = [];
  for (const m of memories) {
    const importance = m.effectiveImportance.toFixed(2);
    lines.push(`[${m.memory.category}|importance:${importance}] ${m.memory.content}`);
  }
  return lines.join("\n");
}
