/**
 * Agent Runtime — Short-Term Memory
 *
 * Manages conversation context within a single agent execution:
 * - Message history tracking with role-based formatting
 * - Context window management (token budgeting)
 * - Automatic summarization when context exceeds budget
 * - Message pruning strategies (oldest-first, importance-based)
 *
 * Short-term memory lives only for the duration of an agent run.
 * It is NOT persisted to the database — that's long-term memory's job.
 *
 * This module is pure (no DB access) and runs in both V8 and Node.js.
 *
 * Phase 7.4.1 — Short-Term Memory
 */

import type { AgentMessage } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for short-term memory management. */
export interface ShortTermMemoryConfig {
  /** Maximum tokens allowed in context (default: 8000) */
  maxTokens: number;
  /** Tokens reserved for the response (default: 2000) */
  reservedForResponse: number;
  /** Strategy for pruning when over budget */
  pruningStrategy: "oldest_first" | "importance_based" | "summarize";
  /** Whether to keep the system message always (default: true) */
  preserveSystemMessage: boolean;
  /** Minimum messages to keep (default: 4) */
  minMessages: number;
}

/** Result of a context window check. */
export interface ContextWindowStatus {
  /** Current estimated token count */
  currentTokens: number;
  /** Maximum allowed tokens */
  maxTokens: number;
  /** Available tokens for new content */
  availableTokens: number;
  /** Whether the context is over budget */
  overBudget: boolean;
  /** Number of messages in history */
  messageCount: number;
}

/** Result of a pruning operation. */
export interface PruneResult {
  /** Messages after pruning */
  messages: AgentMessage[];
  /** Number of messages removed */
  removedCount: number;
  /** Summary of removed content (if summarize strategy) */
  summary?: string;
  /** Estimated tokens after pruning */
  estimatedTokens: number;
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export const DEFAULT_SHORT_TERM_CONFIG: ShortTermMemoryConfig = {
  maxTokens: 8000,
  reservedForResponse: 2000,
  pruningStrategy: "oldest_first",
  preserveSystemMessage: true,
  minMessages: 4,
};

// ---------------------------------------------------------------------------
// Short-Term Memory Manager
// ---------------------------------------------------------------------------

/**
 * Manages the conversation context window for an agent execution.
 *
 * Tracks messages, estimates token usage, and prunes when the
 * context exceeds the configured budget.
 */
export class ShortTermMemory {
  private config: ShortTermMemoryConfig;
  private messages: AgentMessage[];

  constructor(config?: Partial<ShortTermMemoryConfig>) {
    this.config = { ...DEFAULT_SHORT_TERM_CONFIG, ...config };
    this.messages = [];
  }

  /**
   * Adds a message to the conversation history.
   * Automatically prunes if over budget after adding.
   */
  addMessage(message: AgentMessage): PruneResult | null {
    this.messages.push(message);

    const status = this.getStatus();
    if (status.overBudget) {
      return this.prune();
    }
    return null;
  }

  /**
   * Adds multiple messages at once.
   */
  addMessages(messages: AgentMessage[]): PruneResult | null {
    this.messages.push(...messages);

    const status = this.getStatus();
    if (status.overBudget) {
      return this.prune();
    }
    return null;
  }

  /**
   * Returns the current messages (the context window).
   */
  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  /**
   * Returns the context window status.
   */
  getStatus(): ContextWindowStatus {
    const currentTokens = this.estimateTokens(this.messages);
    const maxTokens = this.config.maxTokens - this.config.reservedForResponse;

    return {
      currentTokens,
      maxTokens,
      availableTokens: Math.max(0, maxTokens - currentTokens),
      overBudget: currentTokens > maxTokens,
      messageCount: this.messages.length,
    };
  }

  /**
   * Manually triggers pruning regardless of budget.
   */
  prune(): PruneResult {
    const strategy = this.config.pruningStrategy;

    switch (strategy) {
      case "oldest_first":
        return this.pruneOldestFirst();
      case "importance_based":
        return this.pruneByImportance();
      case "summarize":
        return this.pruneWithSummary();
      default:
        return this.pruneOldestFirst();
    }
  }

  /**
   * Replaces all messages (used when loading from state).
   */
  setMessages(messages: AgentMessage[]): void {
    this.messages = [...messages];
  }

  /**
   * Clears all messages.
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Returns the number of messages.
   */
  get size(): number {
    return this.messages.length;
  }

  // ---------------------------------------------------------------------------
  // Pruning strategies
  // ---------------------------------------------------------------------------

  /**
   * Removes oldest messages first (preserving system message and recent messages).
   */
  private pruneOldestFirst(): PruneResult {
    const maxTokens = this.config.maxTokens - this.config.reservedForResponse;
    const minKeep = this.config.minMessages;

    // Separate system message if preserving
    let systemMsg: AgentMessage | null = null;
    let otherMessages = [...this.messages];

    if (this.config.preserveSystemMessage && otherMessages[0]?.role === "system") {
      systemMsg = otherMessages[0];
      otherMessages = otherMessages.slice(1);
    }

    // Keep removing from the front until under budget
    let removedCount = 0;
    while (otherMessages.length > minKeep) {
      const testMessages = systemMsg ? [systemMsg, ...otherMessages] : otherMessages;
      if (this.estimateTokens(testMessages) <= maxTokens) break;

      // Remove oldest non-system message
      otherMessages.shift();
      removedCount++;
    }

    this.messages = systemMsg ? [systemMsg, ...otherMessages] : otherMessages;

    return {
      messages: this.getMessages(),
      removedCount,
      estimatedTokens: this.estimateTokens(this.messages),
    };
  }

  /**
   * Removes messages by importance (tool results and observations first,
   * then older assistant messages, preserving user messages longer).
   */
  private pruneByImportance(): PruneResult {
    const maxTokens = this.config.maxTokens - this.config.reservedForResponse;
    const minKeep = this.config.minMessages;

    // Assign importance scores
    const scored = this.messages.map((msg, idx) => ({
      msg,
      idx,
      importance: this.scoreMessageImportance(msg, idx, this.messages.length),
    }));

    // Sort by importance (lowest first = remove first)
    const sortedByImportance = [...scored].sort((a, b) => a.importance - b.importance);

    // Remove lowest-importance messages until under budget
    const removed = new Set<number>();
    let removedCount = 0;

    for (const item of sortedByImportance) {
      if (this.messages.length - removed.size <= minKeep) break;

      // Never remove system message
      if (item.msg.role === "system" && this.config.preserveSystemMessage) continue;

      removed.add(item.idx);
      removedCount++;

      // Check if we're under budget now
      const remaining = this.messages.filter((_, i) => !removed.has(i));
      if (this.estimateTokens(remaining) <= maxTokens) break;
    }

    this.messages = this.messages.filter((_, i) => !removed.has(i));

    return {
      messages: this.getMessages(),
      removedCount,
      estimatedTokens: this.estimateTokens(this.messages),
    };
  }

  /**
   * Summarizes older messages into a single summary message,
   * keeping recent messages intact.
   */
  private pruneWithSummary(): PruneResult {
    const maxTokens = this.config.maxTokens - this.config.reservedForResponse;
    const minKeep = this.config.minMessages;

    // Keep system message + last N messages, summarize the rest
    let systemMsg: AgentMessage | null = null;
    let otherMessages = [...this.messages];

    if (this.config.preserveSystemMessage && otherMessages[0]?.role === "system") {
      systemMsg = otherMessages[0];
      otherMessages = otherMessages.slice(1);
    }

    // Keep the most recent messages
    const keepCount = Math.max(minKeep, Math.ceil(otherMessages.length / 3));
    const toSummarize = otherMessages.slice(0, -keepCount);
    const toKeep = otherMessages.slice(-keepCount);

    if (toSummarize.length === 0) {
      // Nothing to summarize — fall back to oldest_first
      return this.pruneOldestFirst();
    }

    // Create a summary of the removed messages
    const summary = this.createSummary(toSummarize);

    // Insert summary as a system-like context message
    const summaryMessage: AgentMessage = {
      role: "user",
      content: `[Previous conversation summary]: ${summary}`,
      timestamp: Date.now(),
    };

    this.messages = systemMsg
      ? [systemMsg, summaryMessage, ...toKeep]
      : [summaryMessage, ...toKeep];

    const estimatedTokens = this.estimateTokens(this.messages);

    // If still over budget after summarization, fall back to oldest_first
    if (estimatedTokens > maxTokens) {
      return this.pruneOldestFirst();
    }

    return {
      messages: this.getMessages(),
      removedCount: toSummarize.length,
      summary,
      estimatedTokens,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Estimates token count for a set of messages.
   * Uses ~4 chars per token as a conservative estimate.
   * For more accuracy, use tiktoken — but this is sufficient for budgeting.
   */
  private estimateTokens(messages: AgentMessage[]): number {
    let totalChars = 0;
    for (const msg of messages) {
      // Content
      totalChars += msg.content.length;
      // Role overhead (~4 tokens per message for role/formatting)
      totalChars += 16;
      // Tool calls
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          totalChars += tc.name.length + JSON.stringify(tc.arguments).length;
        }
      }
    }
    // ~4 chars per token (conservative for English)
    return Math.ceil(totalChars / 4);
  }

  /**
   * Scores a message's importance for pruning decisions.
   * Higher score = more important = keep longer.
   */
  private scoreMessageImportance(msg: AgentMessage, index: number, totalMessages: number): number {
    let score = 0;

    // Recency bonus (0-5 points, more recent = higher)
    score += (index / totalMessages) * 5;

    // Role-based importance
    switch (msg.role) {
      case "system":
        score += 10; // Always most important
        break;
      case "user":
        score += 4; // User messages are important context
        break;
      case "assistant":
        score += 2; // Assistant responses less critical for context
        break;
      case "tool":
        score += 1; // Tool results are least important once processed
        break;
    }

    // Content length penalty (very long messages are less important to keep in full)
    if (msg.content.length > 2000) {
      score -= 1;
    }

    return score;
  }

  /**
   * Creates a text summary of messages (simple extractive approach).
   * For production, this would call an LLM — but for the memory manager
   * itself, we use a simple extraction to avoid circular dependencies.
   */
  private createSummary(messages: AgentMessage[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        parts.push(`User asked: ${msg.content.slice(0, 100)}`);
      } else if (msg.role === "assistant") {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolNames = msg.toolCalls.map((tc) => tc.name).join(", ");
          parts.push(`Agent used tools: ${toolNames}`);
        } else {
          parts.push(`Agent responded: ${msg.content.slice(0, 100)}`);
        }
      } else if (msg.role === "tool") {
        parts.push(`Tool ${msg.toolName ?? "unknown"} returned result`);
      }
    }

    return parts.join(". ") + ".";
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Estimates the token count of a string.
 * Uses ~4 chars per token as a conservative estimate.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Checks if adding content would exceed the token budget.
 */
export function wouldExceedBudget(
  currentMessages: AgentMessage[],
  newContent: string,
  maxTokens: number,
  reservedForResponse = 2000
): boolean {
  const currentTokens = new ShortTermMemory().getStatus().currentTokens;
  const newTokens = estimateTokenCount(newContent);
  return currentTokens + newTokens > maxTokens - reservedForResponse;
}
