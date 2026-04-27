"use node";

/**
 * LLM Provider Abstraction Layer
 *
 * Provides a unified interface for AI inference via OpenRouter,
 * supporting multi-model selection, automatic fallbacks, cost
 * tracking, and retry logic.
 *
 * OpenRouter is the single inference gateway — it routes to 100+
 * models (OpenAI, Anthropic, Google, open-source) with automatic
 * fallbacks and cost tracking per request.
 *
 * Rate limiting: Not handled here — Convex serverless workers are
 * ephemeral, so in-memory state is unreliable. Rate limiting should
 * be implemented at the Convex DB level by the calling action using
 * convex-helpers/ratelimiter or a similar persistent approach.
 */

import { sleep } from "./utils";

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
  },
  generation: {
    primary: "anthropic/claude-sonnet-4-20250514",
    fallback: "openai/gpt-4o",
    maxTokens: 4096,
  },
  fast: {
    primary: "openai/gpt-4o-mini",
    fallback: "anthropic/claude-3-5-haiku-20241022",
    maxTokens: 2048,
  },
  embedding: {
    primary: "openai/text-embedding-3-small",
    fallback: "openai/text-embedding-3-large",
    maxTokens: 8191,
  },
};

// ---------------------------------------------------------------------------
// Per-model pricing (USD per 1M tokens)
// ---------------------------------------------------------------------------

/**
 * Explicit pricing map for known models. When a model is not found
 * here, cost is reported as -1 to signal "unknown" rather than
 * silently returning an inaccurate estimate.
 */
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "anthropic/claude-sonnet-4-20250514": {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
  },
  "openai/gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "openai/gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "anthropic/claude-3-5-haiku-20241022": {
    inputPer1M: 0.8,
    outputPer1M: 4.0,
  },
  "openai/text-embedding-3-small": {
    inputPer1M: 0.02,
    outputPer1M: 0,
  },
  "openai/text-embedding-3-large": {
    inputPer1M: 0.13,
    outputPer1M: 0,
  },
};

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Sends a chat completion request to OpenRouter.
 *
 * Handles model selection, fallbacks, retries, and cost estimation.
 *
 * Note: Rate limiting is NOT handled here. Callers should implement
 * rate limiting at the Convex DB level (e.g. via convex-helpers
 * ratelimiter) since in-memory state is unreliable in serverless.
 */
export async function llmComplete(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<CompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set. Add it to your environment.");
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
          ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (response.status === 429) {
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

/**
 * Estimates cost based on the explicit pricing map.
 * Returns -1 for unknown models to signal "cost unknown" rather
 * than silently returning an inaccurate estimate.
 */
function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // Unknown model — return -1 so callers know cost is unavailable
    return -1;
  }
  return (
    (promptTokens / 1_000_000) * pricing.inputPer1M +
    (completionTokens / 1_000_000) * pricing.outputPer1M
  );
}
