/**
 * Phase 7 — Agent Runtime: OpenRouter LLM client.
 *
 * Features:
 *   - Per-task-type model selection with configurable overrides
 *   - Exponential backoff retry with jitter
 *   - Token-bucket rate limiter
 *   - Per-call cost estimation based on published pricing
 *   - Streaming via Server-Sent Events (SSE)
 *
 * Design: accepts a `fetcher` parameter (defaults to globalThis.fetch) so
 * the client is fully testable without mocking the global fetch API.
 */

import type {
  CompletionParams,
  CompletionResult,
  ModelConfig,
  StreamChunk,
  TaskType,
  ToolCallSpec,
} from "./types";

// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------

const MODEL_CONFIGS: Record<TaskType, ModelConfig> = {
  writing: {
    model: "anthropic/claude-3-5-sonnet",
    temperature: 0.7,
    maxTokens: 4096,
    fallback: "openai/gpt-4o",
  },
  research: {
    model: "anthropic/claude-3-5-sonnet",
    temperature: 0.3,
    maxTokens: 8192,
    fallback: "openai/gpt-4o",
  },
  review: {
    model: "anthropic/claude-3-5-sonnet",
    temperature: 0.2,
    maxTokens: 2048,
    fallback: "openai/gpt-4o-mini",
  },
  planning: {
    model: "anthropic/claude-3-5-sonnet",
    temperature: 0.4,
    maxTokens: 4096,
    fallback: "openai/gpt-4o",
  },
  code: {
    model: "anthropic/claude-3-5-sonnet",
    temperature: 0.1,
    maxTokens: 8192,
    fallback: "openai/gpt-4o",
  },
  analysis: {
    model: "anthropic/claude-3-5-sonnet",
    temperature: 0.2,
    maxTokens: 4096,
    fallback: "openai/gpt-4o",
  },
  general: {
    model: "openai/gpt-4o-mini",
    temperature: 0.5,
    maxTokens: 2048,
    fallback: "anthropic/claude-3-haiku",
  },
};

// Per-million-token pricing (input/output) in USD
const PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "anthropic/claude-3-haiku": { input: 0.25, output: 1.25 },
  "openai/gpt-4o": { input: 5.0, output: 15.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
};

const DEFAULT_PRICING = { input: 3.0, output: 15.0 };

function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = PRICING[model] ?? DEFAULT_PRICING;
  return (
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output
  );
}

// ---------------------------------------------------------------------------
// Token-bucket rate limiter
// ---------------------------------------------------------------------------

export interface RateLimiterConfig {
  tokensPerSecond: number;
  maxBurst: number;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(private config: RateLimiterConfig) {
    this.tokens = config.maxBurst;
    this.lastRefill = Date.now();
  }

  tryConsume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /** Returns ms until `count` tokens are available. */
  waitTimeMs(count = 1): number {
    this.refill();
    if (this.tokens >= count) return 0;
    const deficit = count - this.tokens;
    return Math.ceil((deficit / this.config.tokensPerSecond) * 1_000);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1_000;
    const added = elapsed * this.config.tokensPerSecond;
    this.tokens = Math.min(this.config.maxBurst, this.tokens + added);
    this.lastRefill = now;
  }

  // For testing
  _getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// ---------------------------------------------------------------------------
// OpenRouter client
// ---------------------------------------------------------------------------

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  rateLimiter?: TokenBucketRateLimiter;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class OpenRouterClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly rateLimiter?: TokenBucketRateLimiter;
  private readonly fetch: FetchFn;

  constructor(config: OpenRouterConfig, fetchFn?: FetchFn) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://openrouter.ai/api/v1";
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? 1_000;
    this.rateLimiter = config.rateLimiter;
    this.fetch = fetchFn ?? (globalThis.fetch as FetchFn);
  }

  /** Select the appropriate model configuration for a task type. */
  static modelForTask(
    taskType: TaskType,
    override?: string
  ): ModelConfig {
    const cfg = MODEL_CONFIGS[taskType] ?? MODEL_CONFIGS.general;
    if (override) return { ...cfg, model: override };
    return cfg;
  }

  /** Complete a chat prompt. Retries on transient errors. */
  async complete(params: CompletionParams): Promise<CompletionResult> {
    await this._waitForRateLimit();

    const body = this._buildBody(params);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this._backoff(attempt);
        await this._sleep(delay);
      }

      try {
        const resp = await this.fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            "HTTP-Referer": "https://unimble.ai",
            "X-Title": "Unimble Agent Runtime",
          },
          body: JSON.stringify(body),
        });

        if (resp.status === 429 || resp.status === 503) {
          lastError = new Error(`Rate limited: ${resp.status}`);
          continue;
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(`OpenRouter error ${resp.status}: ${text}`);
        }

        const json = await resp.json();
        return this._parseResponse(json, params.model);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!this._isTransient(err)) throw lastError;
      }
    }

    throw lastError ?? new Error("OpenRouter request failed");
  }

  /** Stream completions as an async generator of text deltas. */
  async *stream(params: CompletionParams): AsyncGenerator<StreamChunk> {
    await this._waitForRateLimit();

    const body = this._buildBody({ ...params, stream: true });

    const resp = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://unimble.ai",
        "X-Title": "Unimble Agent Runtime",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`OpenRouter stream error ${resp.status}: ${text}`);
    }

    if (!resp.body) throw new Error("Response body is null");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          yield { delta: "", done: true };
          return;
        }
        try {
          const chunk = JSON.parse(data);
          const delta =
            chunk?.choices?.[0]?.delta?.content ?? "";
          yield { delta, done: false, model: chunk?.model };
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _buildBody(params: CompletionParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.5,
      max_tokens: params.maxTokens ?? 2048,
    };

    if (params.stream) body.stream = true;

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    return body;
  }

  private _parseResponse(
    json: Record<string, unknown>,
    model: string
  ): CompletionResult {
    const choice = (json.choices as Record<string, unknown>[])?.[0];
    const message = choice?.message as Record<string, unknown> | undefined;
    const content = String(message?.content ?? "");
    const finishReason =
      (choice?.finish_reason as string) === "tool_calls"
        ? "tool_calls"
        : (choice?.finish_reason as string) === "length"
          ? "length"
          : "stop";

    const rawToolCalls = (
      message?.tool_calls as Record<string, unknown>[] | undefined
    ) ?? [];
    const toolCalls: ToolCallSpec[] = rawToolCalls.map((tc) => {
      const fn = tc.function as Record<string, unknown>;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(String(fn?.arguments ?? "{}"));
      } catch {
        args = {};
      }
      return {
        id: String(tc.id ?? ""),
        name: String(fn?.name ?? ""),
        arguments: args,
      };
    });

    const usage = json.usage as
      | Record<string, number>
      | undefined;
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;

    return {
      content,
      toolCalls,
      finishReason,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: usage?.total_tokens ?? promptTokens + completionTokens,
      },
      model: (json.model as string) ?? model,
      estimatedCostUsd: estimateCost(model, promptTokens, completionTokens),
    };
  }

  private _isTransient(err: unknown): boolean {
    if (err instanceof Error) {
      return (
        err.message.includes("Rate limited") ||
        err.message.includes("503") ||
        err.message.includes("ECONNRESET") ||
        err.message.includes("fetch failed")
      );
    }
    return false;
  }

  private _backoff(attempt: number): number {
    const base = this.retryBaseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * base;
    return Math.min(base + jitter, 30_000);
  }

  private async _waitForRateLimit(): Promise<void> {
    if (!this.rateLimiter) return;
    const waitMs = this.rateLimiter.waitTimeMs();
    if (waitMs > 0) {
      await this._sleep(waitMs);
    }
    this.rateLimiter.tryConsume();
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
