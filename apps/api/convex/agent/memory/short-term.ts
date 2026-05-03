/**
 * Phase 7 — Agent Runtime: Short-term conversation memory.
 *
 * Maintains a sliding window of conversation messages with token counting.
 * When the window approaches the configured token limit, the oldest messages
 * are summarised via an LLM call (injected as `summarizer`) and replaced with
 * a single summary message, keeping the context window manageable.
 *
 * Persistence: message history is kept in-memory during an agent run and
 * can be serialised/deserialised for Convex storage (via `toMessages` /
 * `fromMessages`).
 */

import type { Message, MessageRole } from "../types";

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Rough token estimate: ~4 chars per token for English text.
 * Good enough for windowing decisions without a full tokeniser.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(message: ConversationEntry): number {
  const content =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);
  return estimateTokens(content) + 4; // 4-token overhead per message
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationEntry {
  role: MessageRole;
  content: string;
  tokenCount: number;
  summary?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface Summarizer {
  summarize(messages: ConversationEntry[]): Promise<string>;
}

export interface ConversationMemoryConfig {
  /** Maximum tokens before summarisation is triggered. Default: 4096 */
  maxTokens?: number;
  /** Leave this many tokens of headroom after summarisation. Default: 512 */
  reserveTokens?: number;
  /** How many recent messages to always keep (unsummarised). Default: 4 */
  keepRecentMessages?: number;
}

// ---------------------------------------------------------------------------
// ConversationMemory
// ---------------------------------------------------------------------------

export class ConversationMemory {
  private readonly messages: ConversationEntry[] = [];
  private totalTokens = 0;

  private readonly maxTokens: number;
  private readonly reserveTokens: number;
  private readonly keepRecent: number;

  constructor(
    private readonly summarizer?: Summarizer,
    config: ConversationMemoryConfig = {}
  ) {
    this.maxTokens = config.maxTokens ?? 4_096;
    this.reserveTokens = config.reserveTokens ?? 512;
    this.keepRecent = config.keepRecentMessages ?? 4;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Add a message to the conversation window. Triggers summarisation if needed. */
  async add(
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const tokenCount = estimateTokens(content) + 4;
    const entry: ConversationEntry = {
      role,
      content,
      tokenCount,
      metadata,
      createdAt: Date.now(),
    };
    this.messages.push(entry);
    this.totalTokens += tokenCount;

    if (this.totalTokens > this.maxTokens - this.reserveTokens) {
      await this.compact();
    }
  }

  /** Return all messages in the window. */
  getMessages(): ConversationEntry[] {
    return [...this.messages];
  }

  /** Return messages as the Message[] format expected by the LLM client. */
  toMessageList(): Message[] {
    return this.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.metadata?.name ? { name: String(m.metadata.name) } : {}),
    }));
  }

  /** Current total token count estimate. */
  get tokenCount(): number {
    return this.totalTokens;
  }

  /** Number of messages in the window. */
  get length(): number {
    return this.messages.length;
  }

  /** Clear all messages. */
  clear(): void {
    this.messages.length = 0;
    this.totalTokens = 0;
  }

  /** Hydrate from serialised messages (e.g. loaded from Convex). */
  static fromMessages(
    entries: ConversationEntry[],
    summarizer?: Summarizer,
    config?: ConversationMemoryConfig
  ): ConversationMemory {
    const mem = new ConversationMemory(summarizer, config);
    for (const entry of entries) {
      mem.messages.push(entry);
      mem.totalTokens += entry.tokenCount;
    }
    return mem;
  }

  /** Serialise current messages for Convex storage. */
  toSerializable(): ConversationEntry[] {
    return [...this.messages];
  }

  // ---------------------------------------------------------------------------
  // Compaction
  // ---------------------------------------------------------------------------

  /**
   * Summarise the oldest messages to reduce the token count.
   * Always keeps the last `keepRecent` messages intact.
   */
  private async compact(): Promise<void> {
    if (this.messages.length <= this.keepRecent) return;

    const cutoff = this.messages.length - this.keepRecent;
    const toSummarise = this.messages.slice(0, cutoff);
    const toKeep = this.messages.slice(cutoff);

    let summaryContent: string;
    if (this.summarizer) {
      summaryContent = await this.summarizer.summarize(toSummarise);
    } else {
      // No-LLM fallback: concatenate truncated content
      summaryContent =
        "[Summary of earlier conversation]: " +
        toSummarise
          .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
          .join(" | ");
    }

    const summaryTokenCount = estimateTokens(summaryContent) + 4;
    const summaryEntry: ConversationEntry = {
      role: "system",
      content: summaryContent,
      tokenCount: summaryTokenCount,
      summary: true,
      createdAt: Date.now(),
    };

    // Replace messages array
    this.messages.length = 0;
    this.messages.push(summaryEntry, ...toKeep);

    // Recalculate total
    this.totalTokens = this.messages.reduce((acc, m) => acc + m.tokenCount, 0);
  }
}
