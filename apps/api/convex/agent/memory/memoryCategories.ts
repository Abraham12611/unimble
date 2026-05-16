/**
 * Agent Runtime — Memory Categories
 *
 * Defines the taxonomy of memory categories and their scoping rules.
 * Categories determine how memories are organized, filtered, and
 * prioritized during injection into agent context.
 *
 * Scoping:
 * - workspace: Shared across all operators in a workspace
 * - operator: Specific to one operator's learnings
 * - agent: Specific to an agent type (e.g., content-writer)
 * - execution: Ephemeral, scoped to a single execution run
 *
 * This module is pure (no DB access) and runs in both runtimes.
 *
 * Phase 7.4.3 — Memory Categories
 */

import type { MemoryScope } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Definition of a memory category. */
export interface MemoryCategoryDef {
  /** Unique category ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this category stores */
  description: string;
  /** Default scope for this category */
  defaultScope: MemoryScope;
  /** Allowed scopes for this category */
  allowedScopes: MemoryScope[];
  /** Default importance for new memories in this category */
  defaultImportance: number;
  /** Maximum memories to inject per category (default: 5) */
  maxInjected: number;
  /** Whether this category decays over time */
  decays: boolean;
  /** Decay half-life in days (if decays is true) */
  decayHalfLifeDays?: number;
}

/** Memory category IDs as a union type. */
export type MemoryCategoryId =
  | "preference"
  | "fact"
  | "pattern"
  | "content_history"
  | "feedback"
  | "style"
  | "audience"
  | "performance"
  | "error"
  | "relationship";

// ---------------------------------------------------------------------------
// Category Definitions
// ---------------------------------------------------------------------------

/**
 * All defined memory categories with their configuration.
 */
export const MEMORY_CATEGORIES: Record<MemoryCategoryId, MemoryCategoryDef> = {
  preference: {
    id: "preference",
    name: "User Preferences",
    description: "User and workspace preferences: tone, style, formatting, topics to avoid, etc.",
    defaultScope: "workspace",
    allowedScopes: ["workspace", "operator"],
    defaultImportance: 0.8,
    maxInjected: 5,
    decays: false,
  },

  fact: {
    id: "fact",
    name: "Facts & Knowledge",
    description:
      "Factual information about the workspace, product, company, or domain that agents should know.",
    defaultScope: "workspace",
    allowedScopes: ["workspace", "operator"],
    defaultImportance: 0.7,
    maxInjected: 8,
    decays: false,
  },

  pattern: {
    id: "pattern",
    name: "Learned Patterns",
    description:
      "Patterns the agent has learned from past executions: what works, what doesn't, optimization insights.",
    defaultScope: "operator",
    allowedScopes: ["workspace", "operator", "agent"],
    defaultImportance: 0.6,
    maxInjected: 5,
    decays: true,
    decayHalfLifeDays: 30,
  },

  content_history: {
    id: "content_history",
    name: "Content History",
    description:
      "Record of previously created content: titles, topics, formats used. Prevents repetition.",
    defaultScope: "operator",
    allowedScopes: ["workspace", "operator"],
    defaultImportance: 0.5,
    maxInjected: 10,
    decays: true,
    decayHalfLifeDays: 60,
  },

  feedback: {
    id: "feedback",
    name: "Feedback & Corrections",
    description:
      "Human feedback on agent outputs: corrections, approvals with edits, rejection reasons.",
    defaultScope: "operator",
    allowedScopes: ["workspace", "operator", "agent"],
    defaultImportance: 0.9,
    maxInjected: 5,
    decays: false,
  },

  style: {
    id: "style",
    name: "Writing Style",
    description:
      "Writing style guidelines: voice, tone, vocabulary, sentence structure, formatting conventions.",
    defaultScope: "operator",
    allowedScopes: ["workspace", "operator"],
    defaultImportance: 0.8,
    maxInjected: 3,
    decays: false,
  },

  audience: {
    id: "audience",
    name: "Audience Knowledge",
    description:
      "Information about the target audience: demographics, pain points, technical level, interests.",
    defaultScope: "workspace",
    allowedScopes: ["workspace", "operator"],
    defaultImportance: 0.7,
    maxInjected: 5,
    decays: true,
    decayHalfLifeDays: 90,
  },

  performance: {
    id: "performance",
    name: "Performance Metrics",
    description:
      "Performance data from past content: engagement rates, best-performing topics, optimal posting times.",
    defaultScope: "operator",
    allowedScopes: ["workspace", "operator"],
    defaultImportance: 0.6,
    maxInjected: 5,
    decays: true,
    decayHalfLifeDays: 14,
  },

  error: {
    id: "error",
    name: "Error Patterns",
    description:
      "Recurring errors and their solutions: API failures, content rejections, tool issues.",
    defaultScope: "workspace",
    allowedScopes: ["workspace", "operator"],
    defaultImportance: 0.7,
    maxInjected: 3,
    decays: true,
    decayHalfLifeDays: 30,
  },

  relationship: {
    id: "relationship",
    name: "Relationships & Contacts",
    description:
      "Information about people and organizations: community members, partners, influencers.",
    defaultScope: "workspace",
    allowedScopes: ["workspace", "operator"],
    defaultImportance: 0.6,
    maxInjected: 5,
    decays: false,
  },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Gets a category definition by ID.
 */
export function getCategory(id: string): MemoryCategoryDef | undefined {
  return MEMORY_CATEGORIES[id as MemoryCategoryId];
}

/**
 * Gets all category definitions.
 */
export function getAllCategories(): MemoryCategoryDef[] {
  return Object.values(MEMORY_CATEGORIES);
}

/**
 * Gets categories allowed for a given scope.
 */
export function getCategoriesForScope(scope: MemoryScope): MemoryCategoryDef[] {
  return Object.values(MEMORY_CATEGORIES).filter((cat) => cat.allowedScopes.includes(scope));
}

/**
 * Validates that a category ID is valid.
 */
export function isValidCategory(id: string): id is MemoryCategoryId {
  return id in MEMORY_CATEGORIES;
}

/**
 * Calculates the decay factor for a memory based on its age.
 * Returns a multiplier between 0 and 1.
 *
 * Uses exponential decay: factor = 0.5 ^ (age / halfLife)
 */
export function calculateDecayFactor(
  createdAt: number,
  category: MemoryCategoryDef,
  now?: number
): number {
  if (!category.decays || !category.decayHalfLifeDays) {
    return 1.0; // No decay
  }

  const currentTime = now ?? Date.now();
  const ageMs = currentTime - createdAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const halfLife = category.decayHalfLifeDays;

  return Math.pow(0.5, ageDays / halfLife);
}

/**
 * Calculates the effective importance of a memory,
 * accounting for decay and access frequency.
 */
export function calculateEffectiveImportance(
  baseImportance: number,
  createdAt: number,
  accessCount: number,
  category: MemoryCategoryDef,
  now?: number
): number {
  // Apply decay
  const decayFactor = calculateDecayFactor(createdAt, category, now);

  // Access frequency bonus (logarithmic, capped at 0.2)
  const accessBonus = Math.min(0.2, Math.log2(accessCount + 1) * 0.05);

  // Effective importance = base * decay + access bonus
  return Math.min(1.0, baseImportance * decayFactor + accessBonus);
}
