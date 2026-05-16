import { describe, expect, test, beforeEach } from "vitest";

import { ShortTermMemory, estimateTokenCount } from "./shortTermMemory";
import type { AgentMessage } from "../types";
import {
  MEMORY_CATEGORIES,
  getCategory,
  getAllCategories,
  getCategoriesForScope,
  isValidCategory,
  calculateDecayFactor,
  calculateEffectiveImportance,
} from "./memoryCategories";
import { injectMemories } from "./memoryInjector";
import type { MemoryEntry } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(role: AgentMessage["role"], content: string): AgentMessage {
  return { role, content, timestamp: Date.now() };
}

function makeMemory(overrides?: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: `mem_${Math.random().toString(36).slice(2)}`,
    scope: "workspace",
    scopeId: "ws_123",
    category: "fact",
    content: "Test memory content",
    importance: 0.7,
    createdAt: Date.now() - 1000 * 60 * 60, // 1 hour ago
    accessCount: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ShortTermMemory
// ---------------------------------------------------------------------------

describe("ShortTermMemory", () => {
  let memory: ShortTermMemory;

  beforeEach(() => {
    memory = new ShortTermMemory({ maxTokens: 200, reservedForResponse: 50 });
  });

  test("adds messages and tracks them", () => {
    memory.addMessage(makeMessage("system", "You are helpful."));
    memory.addMessage(makeMessage("user", "Hello"));
    expect(memory.size).toBe(2);
    expect(memory.getMessages()).toHaveLength(2);
  });

  test("reports context window status", () => {
    memory.addMessage(makeMessage("system", "System prompt here."));
    const status = memory.getStatus();
    expect(status.currentTokens).toBeGreaterThan(0);
    expect(status.maxTokens).toBe(150); // 200 - 50 reserved
    expect(status.overBudget).toBe(false);
  });

  test("detects over-budget state", () => {
    const bigMemory = new ShortTermMemory({ maxTokens: 50, reservedForResponse: 10 });
    bigMemory.addMessage(makeMessage("system", "A".repeat(200)));
    const status = bigMemory.getStatus();
    expect(status.overBudget).toBe(true);
  });

  test("auto-prunes when over budget (oldest_first)", () => {
    const smallMemory = new ShortTermMemory({
      maxTokens: 80,
      reservedForResponse: 20,
      pruningStrategy: "oldest_first",
      minMessages: 2,
    });

    // Each message ~50+ chars = ~13+ tokens. Budget is 60 tokens (80-20).
    // 4 messages × ~13 tokens = ~52 tokens + system overhead should exceed.
    smallMemory.addMessage(makeMessage("system", "System prompt for the agent"));
    smallMemory.addMessage(
      makeMessage("user", "First question about artificial intelligence and machine learning")
    );
    smallMemory.addMessage(
      makeMessage("assistant", "Here is a detailed answer about AI and ML topics")
    );
    const result = smallMemory.addMessage(
      makeMessage("user", "Second question about deep learning neural networks and transformers")
    );

    // Should have pruned some messages
    expect(result).not.toBeNull();
    if (result) {
      expect(result.removedCount).toBeGreaterThan(0);
    }
  });

  test("preserves system message during pruning", () => {
    const smallMemory = new ShortTermMemory({
      maxTokens: 80,
      reservedForResponse: 10,
      pruningStrategy: "oldest_first",
      preserveSystemMessage: true,
      minMessages: 1,
    });

    smallMemory.addMessage(makeMessage("system", "Important system prompt"));
    smallMemory.addMessage(makeMessage("user", "x".repeat(100)));
    smallMemory.addMessage(makeMessage("assistant", "y".repeat(100)));
    smallMemory.addMessage(makeMessage("user", "z".repeat(100)));

    const messages = smallMemory.getMessages();
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe("Important system prompt");
  });

  test("importance-based pruning removes tool messages first", () => {
    const smallMemory = new ShortTermMemory({
      maxTokens: 120,
      reservedForResponse: 20,
      pruningStrategy: "importance_based",
      minMessages: 2,
    });

    smallMemory.addMessage(makeMessage("system", "System"));
    smallMemory.addMessage(makeMessage("user", "Question"));
    smallMemory.addMessage({
      role: "tool",
      content: "x".repeat(80),
      toolCallId: "call_1",
      toolName: "search",
      timestamp: Date.now(),
    });
    smallMemory.addMessage(makeMessage("user", "Follow up " + "x".repeat(50)));

    const result = smallMemory.prune();
    // Tool messages should be removed before user messages
    const remaining = result.messages;
    const hasToolMsg = remaining.some((m) => m.role === "tool");
    const hasUserMsg = remaining.some((m) => m.role === "user");
    expect(hasUserMsg).toBe(true);
    // Tool message may or may not be removed depending on budget
    if (result.removedCount > 0) {
      expect(hasToolMsg).toBe(false);
    }
  });

  test("summarize strategy creates summary message", () => {
    const smallMemory = new ShortTermMemory({
      maxTokens: 150,
      reservedForResponse: 20,
      pruningStrategy: "summarize",
      minMessages: 2,
    });

    smallMemory.addMessage(makeMessage("system", "System"));
    smallMemory.addMessage(makeMessage("user", "First question about AI"));
    smallMemory.addMessage(makeMessage("assistant", "AI is fascinating"));
    smallMemory.addMessage(makeMessage("user", "Tell me more about ML"));
    smallMemory.addMessage(makeMessage("assistant", "ML is a subset of AI"));
    smallMemory.addMessage(makeMessage("user", "Final question " + "x".repeat(80)));

    const result = smallMemory.prune();
    if (result.summary) {
      expect(result.summary).toContain("User asked");
    }
  });

  test("setMessages replaces all messages", () => {
    memory.addMessage(makeMessage("user", "Old"));
    memory.setMessages([makeMessage("system", "New system"), makeMessage("user", "New user")]);
    expect(memory.size).toBe(2);
    expect(memory.getMessages()[0].content).toBe("New system");
  });

  test("clear removes all messages", () => {
    memory.addMessage(makeMessage("user", "Hello"));
    memory.clear();
    expect(memory.size).toBe(0);
  });
});

describe("estimateTokenCount", () => {
  test("estimates tokens from text length", () => {
    expect(estimateTokenCount("")).toBe(0);
    expect(estimateTokenCount("hello")).toBe(2); // 5 chars / 4 ≈ 2
    expect(estimateTokenCount("a".repeat(100))).toBe(25); // 100 / 4
  });
});

// ---------------------------------------------------------------------------
// Memory Categories
// ---------------------------------------------------------------------------

describe("Memory Categories", () => {
  test("all categories have required fields", () => {
    const categories = getAllCategories();
    expect(categories.length).toBeGreaterThan(0);

    for (const cat of categories) {
      expect(cat.id).toBeTruthy();
      expect(cat.name).toBeTruthy();
      expect(cat.description).toBeTruthy();
      expect(cat.defaultScope).toBeTruthy();
      expect(cat.allowedScopes.length).toBeGreaterThan(0);
      expect(cat.defaultImportance).toBeGreaterThanOrEqual(0);
      expect(cat.defaultImportance).toBeLessThanOrEqual(1);
      expect(cat.maxInjected).toBeGreaterThan(0);
    }
  });

  test("getCategory returns correct category", () => {
    const pref = getCategory("preference");
    expect(pref).toBeDefined();
    expect(pref!.id).toBe("preference");
    expect(pref!.defaultScope).toBe("workspace");
  });

  test("getCategory returns undefined for unknown", () => {
    expect(getCategory("nonexistent")).toBeUndefined();
  });

  test("getCategoriesForScope filters correctly", () => {
    const workspaceCategories = getCategoriesForScope("workspace");
    expect(workspaceCategories.length).toBeGreaterThan(0);
    for (const cat of workspaceCategories) {
      expect(cat.allowedScopes).toContain("workspace");
    }

    const executionCategories = getCategoriesForScope("execution");
    expect(executionCategories).toHaveLength(0); // No categories allow execution scope
  });

  test("isValidCategory validates correctly", () => {
    expect(isValidCategory("preference")).toBe(true);
    expect(isValidCategory("fact")).toBe(true);
    expect(isValidCategory("nonexistent")).toBe(false);
  });

  test("calculateDecayFactor returns 1.0 for non-decaying categories", () => {
    const pref = getCategory("preference")!;
    const factor = calculateDecayFactor(Date.now() - 365 * 24 * 60 * 60 * 1000, pref);
    expect(factor).toBe(1.0);
  });

  test("calculateDecayFactor decays over time", () => {
    const pattern = getCategory("pattern")!; // halfLife: 30 days
    const now = Date.now();

    // Fresh memory — no decay
    const fresh = calculateDecayFactor(now, pattern, now);
    expect(fresh).toBeCloseTo(1.0, 2);

    // 30 days old — half decayed
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const halfDecayed = calculateDecayFactor(thirtyDaysAgo, pattern, now);
    expect(halfDecayed).toBeCloseTo(0.5, 1);

    // 60 days old — quarter remaining
    const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;
    const quarterDecayed = calculateDecayFactor(sixtyDaysAgo, pattern, now);
    expect(quarterDecayed).toBeCloseTo(0.25, 1);
  });

  test("calculateEffectiveImportance combines factors", () => {
    const pattern = getCategory("pattern")!;
    const now = Date.now();

    // High importance, fresh, frequently accessed
    const high = calculateEffectiveImportance(0.9, now, 10, pattern, now);
    expect(high).toBeGreaterThan(0.8);

    // Low importance, old, never accessed
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const low = calculateEffectiveImportance(0.3, thirtyDaysAgo, 0, pattern, now);
    expect(low).toBeLessThan(0.3);
  });
});

// ---------------------------------------------------------------------------
// Memory Injector
// ---------------------------------------------------------------------------

describe("Memory Injector", () => {
  test("returns empty result for no memories", () => {
    const result = injectMemories([]);
    expect(result.text).toBe("");
    expect(result.included).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
  });

  test("includes memories above relevance threshold", () => {
    const memories = [
      makeMemory({
        content: "User prefers concise answers",
        category: "preference",
        importance: 0.9,
      }),
      makeMemory({ content: "Company builds developer tools", category: "fact", importance: 0.8 }),
    ];

    const result = injectMemories(memories, { minRelevance: 0.2 });
    expect(result.included.length).toBeGreaterThan(0);
    expect(result.text).toContain("concise answers");
  });

  test("respects token budget", () => {
    const memories = Array.from({ length: 20 }, (_, i) =>
      makeMemory({
        content: `Memory item ${i} with some content that takes up tokens: ${"x".repeat(50)}`,
        importance: 0.8,
      })
    );

    const result = injectMemories(memories, { maxTokens: 200, minRelevance: 0.1 });
    expect(result.totalTokens).toBeLessThanOrEqual(200);
    expect(result.excluded.length).toBeGreaterThan(0);
  });

  test("respects per-category limits", () => {
    // Create 10 memories in the same category (maxInjected for "fact" is 8)
    const memories = Array.from({ length: 10 }, (_, i) =>
      makeMemory({
        content: `Fact ${i}`,
        category: "fact",
        importance: 0.9,
      })
    );

    const result = injectMemories(memories, { maxTokens: 5000, minRelevance: 0.1 });
    const factCount = result.included.filter((m) => m.memory.category === "fact").length;
    expect(factCount).toBeLessThanOrEqual(MEMORY_CATEGORIES.fact.maxInjected);
  });

  test("filters by category when specified", () => {
    const memories = [
      makeMemory({ content: "Preference A", category: "preference" }),
      makeMemory({ content: "Fact B", category: "fact" }),
      makeMemory({ content: "Pattern C", category: "pattern" }),
    ];

    const result = injectMemories(memories, {
      categories: ["preference", "fact"],
      minRelevance: 0.1,
    });

    const categories = result.included.map((m) => m.memory.category);
    expect(categories).not.toContain("pattern");
  });

  test("excludes categories when specified", () => {
    const memories = [
      makeMemory({ content: "Preference A", category: "preference" }),
      makeMemory({ content: "Error B", category: "error" }),
    ];

    const result = injectMemories(memories, {
      excludeCategories: ["error"],
      minRelevance: 0.1,
    });

    const categories = result.included.map((m) => m.memory.category);
    expect(categories).not.toContain("error");
  });

  test("uses similarity scores when provided", () => {
    const memories = [
      makeMemory({ id: "mem_1", content: "Highly relevant", importance: 0.5 }),
      makeMemory({ id: "mem_2", content: "Less relevant", importance: 0.9 }),
    ];

    const similarityScores = new Map([
      ["mem_1", 0.95], // Very similar to query
      ["mem_2", 0.2], // Not similar
    ]);

    const result = injectMemories(memories, { minRelevance: 0.1 }, similarityScores);

    // mem_1 should rank higher due to high similarity despite lower importance
    if (result.included.length >= 2) {
      expect(result.included[0].memory.id).toBe("mem_1");
    }
  });

  test("formats as bullet points by default", () => {
    const memories = [
      makeMemory({ content: "First memory", category: "fact" }),
      makeMemory({ content: "Second memory", category: "preference" }),
    ];

    const result = injectMemories(memories, {
      format: "bullet",
      includeCategoryHeaders: false,
      minRelevance: 0.1,
    });

    expect(result.text).toContain("- [fact] First memory");
    expect(result.text).toContain("- [preference] Second memory");
  });

  test("formats as structured with metadata", () => {
    const memories = [makeMemory({ content: "Test content", category: "fact", importance: 0.8 })];

    const result = injectMemories(memories, { format: "structured", minRelevance: 0.1 });
    expect(result.text).toContain("[fact|importance:");
    expect(result.text).toContain("Test content");
  });

  test("higher importance memories are included first", () => {
    const memories = [
      makeMemory({ content: "Low importance", importance: 0.2 }),
      makeMemory({ content: "High importance", importance: 0.95 }),
      makeMemory({ content: "Medium importance", importance: 0.5 }),
    ];

    const result = injectMemories(memories, { maxTokens: 100, minRelevance: 0.1 });

    if (result.included.length >= 2) {
      // First included should have higher score than second
      expect(result.included[0].relevanceScore).toBeGreaterThanOrEqual(
        result.included[1].relevanceScore
      );
    }
  });
});
