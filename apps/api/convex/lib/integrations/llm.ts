"use node";

/**
 * LLM Provider Abstraction Layer
 *
 * Provides a unified interface for AI inference via OpenRouter,
 * supporting multi-model selection, automatic fallbacks, cost
 * tracking, rate limiting, and retry logic.
 *
 * OpenRouter is the single inference gateway — it routes to 100+
 * models (OpenAI, Anthropic, Google, open-source) with automatic
 * fallbacks and cost tracking per request.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported model tiers for different task types. */
export type ModelTier = "reasoning" | "generation" | "fast" | "embedding";

/** A model configuration with primary and fallback. */
export interface ModelConfig {
  /** Primary model ID (OpenRouter format) */
  primary: string;
  /** Fallback model ID if primary fails */
  fallback: string;
  /** Max tokens for this model */
  maxTokens: number;
  /** Cost per 1M input tokens (USD) */
  inputCostPer1M: number;
  /** Cost per 1M output tokens (USD) */
  outputCostPer1M: number;
}

/** A chat message in the standard format. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Options for an LLM completion request. */
export interface CompletionOptions {
  /** Model tier to use (selects primary + fallback) */
  tier?: ModelTier;
  /** Override with a specific model ID */
  model?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2, default 0.7) */
  temperature?: number;
  /** Top-p sampling (0-1) */
  topP?: number;
  /** Stop sequences */
  stop?: string[];
  /** JSON mode (structured output) */
  jsonMode?: boolean;
  /** Workspace ID for cost tracking */
  workspaceId?: string;
}

/** Result of an LLM completion. */
export interface CompletionResult {
  /** Generated text */
  content: string;
  /** Model that actually served the request */
  model: string;
  /** Whether a fallback model was used */
  usedFallback: boolean;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Estimated cost in USD */
  cost: number;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Finish reason */
  finishReason: string;
}

/** Cost tracking record for a workspace. */
export interface CostRecord {
  workspaceId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Model configuration
// ---------------------------------------------------------------------------

/** Default model selections per tier. */
export const MODEL_CONFIGS: Record<ModelTier, ModelConfig> = {
  reasoning: {
    primary: "anthropic/claude-sonnet-4-20250514",
    fallback: "openai/gpt-4o",
    maxTokens: 8192,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
  },
  generation: {
    primary: "anthropic/claude-sonnet-4-20250514",
    fallback: "openai/gpt-4o",
    maxTokens: 4096,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
  },
  fast: {
    primary: "openai/gpt-4o-mini",
    fallback: "anthropic/claude-3-5-haiku-20241022",
    maxTokens: 2048,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  embedding: {
    primary: "openai/text-embedding-3-small",
    fallback: "openai/text-embedding-3-small",
    maxTokens: 8191,
    inputCostPer1M: 0.02,
    outputCostPer1M: 0,
  },
};

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per-process)
// ---------------------------------------------------------------------------

const _rateLimitState = new Map<string, { count: number; resetAt: number }>();

/** Max requests per workspace per minute. */
const RATE_LIMIT_PER_MINUTE = 60;

function checkRateLimit(workspaceId: string): boolean {
  const now = Date.now();
  const key = `llm:${workspaceId}`;
  const state = _rateLimitState.get(key);

  if (!state || now > state.resetAt) {
    _rateLimitState.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (state.count >= RATE_LIMIT_PER_MINUTE) {
    return false;
  }

  state.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Sends a chat completion request to OpenRouter.
 *
 * Handles model selection, fallbacks, retries, rate limiting,
 * and cost estimation.
 */
export async function llmComplete(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<CompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set. Add it to your environment.");
  }

  // Rate limit check
  if (options.workspaceId && !checkRateLimit(options.workspaceId)) {
    throw new Error("Rate limit exceeded. Max 60 requests per minute per workspace.");
  }

  const tier = options.tier ?? "generation";
  const config = MODEL_CONFIGS[tier];
  const model = options.model ?? config.primary;
  const maxTokens = options.maxTokens ?? config.maxTokens;

  const startTime = Date.now();
  let usedFallback = false;

  // Try primary model, fall back on failure
  let result = await callOpenRouter(apiKey, model, messages, {
    maxTokens,
    temperature: options.temperature,
    topP: options.topP,
    stop: options.stop,
    jsonMode: options.jsonMode,
  });

  if (!result.ok && model !== config.fallback) {
    usedFallback = true;
    result = await callOpenRouter(apiKey, config.fallback, messages, {
      maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      stop: options.stop,
      jsonMode: options.jsonMode,
    });
  }

  if (!result.ok) {
    throw new Error(`LLM request failed: ${result.error}`);
  }

  const latencyMs = Date.now() - startTime;
  const actualModel = result.data.model ?? model;

  // Estimate cost
  const promptTokens = result.data.usage?.prompt_tokens ?? 0;
  const completionTokens = result.data.usage?.completion_tokens ?? 0;
  const cost = estimateCost(actualModel, promptTokens, completionTokens);

  return {
    content: result.data.choices?.[0]?.message?.content ?? "",
    model: actualModel,
    usedFallback,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    cost,
    latencyMs,
    finishReason: result.data.choices?.[0]?.finish_reason ?? "unknown",
  };
}

/**
 * Convenience: single-prompt completion (no chat history).
 */
export async function llmPrompt(
  prompt: string,
  systemPrompt?: string,
  options: CompletionOptions = {}
): Promise<CompletionResult> {
  const messages: ChatMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });
  return llmComplete(messages, options);
}

// ---------------------------------------------------------------------------
// OpenRouter API call
// ---------------------------------------------------------------------------

interface OpenRouterCallResult {
  ok: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error?: string;
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts: {
    maxTokens: number;
    temperature?: number;
    topP?: number;
    stop?: string[];
    jsonMode?: boolean;
  }
): Promise<OpenRouterCallResult> {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://unimble.app",
          "X-Title": "Unimble",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: opts.maxTokens,
          temperature: opts.temperature ?? 0.7,
          ...(opts.topP != null ? { top_p: opts.topP } : {}),
          ...(opts.stop?.length ? { stop: opts.stop } : {}),
          ...(opts.jsonMode
            ? {
                response_format: { type: "json_object" },
              }
            : {}),
        }),
      });

      if (response.status === 429) {
        // Rate limited by OpenRouter — wait and retry
        const retryAfter = Number(response.headers.get("retry-after")) || 2;
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (attempt < MAX_RETRIES && response.status >= 500) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        return {
          ok: false,
          data: null,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const data = await response.json();
      return { ok: true, data };
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return {
        ok: false,
        data: null,
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  }

  return { ok: false, data: null, error: "Max retries exceeded" };
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  // Find matching config by model ID
  for (const config of Object.values(MODEL_CONFIGS)) {
    if (config.primary === model || config.fallback === model) {
      return (
        (promptTokens / 1_000_000) * config.inputCostPer1M +
        (completionTokens / 1_000_000) * config.outputCostPer1M
      );
    }
  }
  // Default estimate for unknown models
  return (promptTokens / 1_000_000) * 3.0 + (completionTokens / 1_000_000) * 15.0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
