"use node";

/**
 * Agent LLM Client — Extended LLM interface for agent execution.
 *
 * Extends the base LLM client (Phase 5.3) with:
 * - Function calling / tool use (OpenAI-compatible tools parameter)
 * - Streaming support (SSE for real-time agent output)
 * - Agent-specific message formatting (system/user/assistant/tool roles)
 * - Enhanced cost tracking per workspace
 *
 * This module bridges the gap between the generic llm.ts and the
 * agent runtime's LLMCallFn interface.
 *
 * Phase 7.2.1 — LLM Client
 */

import type { AgentMessage } from "./types";
import type { LLMCallOptions, LLMResponse, LLMToolCall } from "./agentBase";
import { sleep } from "../lib/integrations/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** OpenAI-compatible tool definition for function calling. */
export interface ToolDefinitionParam {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

/** Options for the agent LLM client. */
export interface AgentLLMOptions {
  /** Model tier (reasoning, generation, fast) */
  tier?: string;
  /** Specific model override */
  model?: string;
  /** Temperature (0-2) */
  temperature?: number;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Tools available for function calling */
  tools?: ToolDefinitionParam[];
  /** Whether to stream the response */
  stream?: boolean;
  /** JSON mode for structured output */
  jsonMode?: boolean;
  /** Stop sequences */
  stop?: string[];
  /** Workspace ID for cost tracking */
  workspaceId?: string;
}

/** Streaming chunk from the LLM. */
export interface StreamChunk {
  /** Incremental text content */
  content?: string;
  /** Tool call delta (partial tool call being built) */
  toolCallDelta?: {
    index: number;
    id?: string;
    name?: string;
    arguments?: string;
  };
  /** Whether this is the final chunk */
  done: boolean;
  /** Finish reason (only on final chunk) */
  finishReason?: string;
}

/** Callback for streaming chunks. */
export type StreamCallback = (chunk: StreamChunk) => void;

// ---------------------------------------------------------------------------
// Model configuration (mirrors llm.ts but accessible here)
// ---------------------------------------------------------------------------

const MODEL_TIERS: Record<string, { primary: string; fallback: string; maxTokens: number }> = {
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
};

const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "anthropic/claude-sonnet-4-20250514": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "openai/gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "openai/gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "anthropic/claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4.0 },
};

// ---------------------------------------------------------------------------
// Agent LLM Client
// ---------------------------------------------------------------------------

/**
 * Creates an LLMCallFn that the agent runtime can use.
 *
 * This is the primary factory function — it returns a function
 * matching the LLMCallFn signature that handles:
 * - Converting AgentMessages to OpenAI-compatible format
 * - Passing tools for function calling
 * - Parsing tool call responses
 * - Cost estimation
 *
 * Usage:
 * ```ts
 * const llmCall = createAgentLLMClient({ workspaceId });
 * const response = await llmCall(messages, { tools, temperature });
 * ```
 */
export function createAgentLLMClient(config?: {
  workspaceId?: string;
}): (messages: AgentMessage[], options: LLMCallOptions) => Promise<LLMResponse> {
  return async (messages: AgentMessage[], options: LLMCallOptions): Promise<LLMResponse> => {
    return agentLLMCall(messages, {
      ...options,
      workspaceId: config?.workspaceId,
    });
  };
}

/**
 * Makes an LLM call with full agent support (tool calling, multi-turn).
 *
 * Converts AgentMessage[] to OpenAI-compatible format, sends to
 * OpenRouter, and parses the response including any tool calls.
 */
export async function agentLLMCall(
  messages: AgentMessage[],
  options: AgentLLMOptions = {}
): Promise<LLMResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set. Add it to your environment.");
  }

  const tier = options.tier ?? "generation";
  const tierConfig = MODEL_TIERS[tier] ?? MODEL_TIERS.generation;
  const model = options.model ?? tierConfig.primary;
  const maxTokens = options.maxTokens ?? tierConfig.maxTokens;

  // Convert agent messages to OpenAI format
  const formattedMessages = formatMessagesForAPI(messages);

  // Build request body
  const body: Record<string, unknown> = {
    model,
    messages: formattedMessages,
    max_tokens: maxTokens,
    temperature: options.temperature ?? 0.7,
  };

  // Add tools if provided
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = "auto";
  }

  // Add JSON mode if requested
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  // Add stop sequences
  if (options.stop && options.stop.length > 0) {
    body.stop = options.stop;
  }

  let usedFallback = false;

  // Try primary model
  let result = await callWithRetry(apiKey, body);

  // Fallback if primary fails
  if (!result.ok && model !== tierConfig.fallback) {
    usedFallback = true;
    body.model = tierConfig.fallback;
    result = await callWithRetry(apiKey, body);
  }

  if (!result.ok) {
    throw new Error(`Agent LLM call failed: ${result.error}`);
  }

  const data = result.data;
  const actualModel = data.model ?? (usedFallback ? tierConfig.fallback : model);

  // Extract usage
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;
  const cost = estimateCost(actualModel, promptTokens, completionTokens);

  // Parse response
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";
  const toolCalls = parseToolCalls(choice?.message?.tool_calls);

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    model: actualModel,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    cost,
  };
}

/**
 * Makes a streaming LLM call, invoking the callback for each chunk.
 *
 * Returns the final assembled LLMResponse after the stream completes.
 * Useful for real-time UI updates during agent execution.
 */
export async function agentLLMStream(
  messages: AgentMessage[],
  options: AgentLLMOptions = {},
  onChunk: StreamCallback
): Promise<LLMResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set. Add it to your environment.");
  }

  const tier = options.tier ?? "generation";
  const tierConfig = MODEL_TIERS[tier] ?? MODEL_TIERS.generation;
  const model = options.model ?? tierConfig.primary;
  const maxTokens = options.maxTokens ?? tierConfig.maxTokens;

  const formattedMessages = formatMessagesForAPI(messages);

  const body: Record<string, unknown> = {
    model,
    messages: formattedMessages,
    max_tokens: maxTokens,
    temperature: options.temperature ?? 0.7,
    stream: true,
  };

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = "auto";
  }

  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://unimble.app",
      "X-Title": "Unimble",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Streaming LLM call failed: HTTP ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error("No response body for streaming request");
  }

  // Parse SSE stream
  let fullContent = "";
  const toolCallAccumulator: Map<number, { id: string; name: string; arguments: string }> =
    new Map();
  let finishReason = "unknown";
  let actualModel = model;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          onChunk({ done: true, finishReason });
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          const choiceFinishReason = parsed.choices?.[0]?.finish_reason;

          if (parsed.model) actualModel = parsed.model;
          if (choiceFinishReason) finishReason = choiceFinishReason;

          if (delta?.content) {
            fullContent += delta.content;
            onChunk({ content: delta.content, done: false });
          }

          // Accumulate tool calls from deltas
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallAccumulator.has(idx)) {
                toolCallAccumulator.set(idx, { id: "", name: "", arguments: "" });
              }
              const acc = toolCallAccumulator.get(idx)!;
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name = tc.function.name;
              if (tc.function?.arguments) acc.arguments += tc.function.arguments;

              onChunk({
                toolCallDelta: {
                  index: idx,
                  id: tc.id,
                  name: tc.function?.name,
                  arguments: tc.function?.arguments,
                },
                done: false,
              });
            }
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Build final tool calls
  const toolCalls: LLMToolCall[] = [];
  for (const [, acc] of toolCallAccumulator) {
    try {
      toolCalls.push({
        id: acc.id,
        name: acc.name,
        arguments: JSON.parse(acc.arguments),
      });
    } catch {
      // Skip malformed tool call arguments
      toolCalls.push({
        id: acc.id,
        name: acc.name,
        arguments: {},
      });
    }
  }

  // Estimate cost (usage not always available in streaming)
  const estimatedPromptTokens = Math.ceil(
    formattedMessages.reduce(
      (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
      0
    ) / 4
  );
  const estimatedCompletionTokens = Math.ceil(fullContent.length / 4);
  const cost = estimateCost(actualModel, estimatedPromptTokens, estimatedCompletionTokens);

  return {
    content: fullContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    model: actualModel,
    usage: {
      promptTokens: estimatedPromptTokens,
      completionTokens: estimatedCompletionTokens,
      totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
    },
    cost,
  };
}

// ---------------------------------------------------------------------------
// Message formatting
// ---------------------------------------------------------------------------

/**
 * Converts AgentMessage[] to OpenAI-compatible message format.
 *
 * Handles the mapping of:
 * - system/user/assistant roles directly
 * - tool role messages with tool_call_id
 * - assistant messages with tool_calls array
 */
function formatMessagesForAPI(messages: AgentMessage[]): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    if (msg.role === "tool") {
      return {
        role: "tool",
        content: msg.content,
        tool_call_id: msg.toolCallId ?? "unknown",
      };
    }

    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }

    return {
      role: msg.role,
      content: msg.content,
    };
  });
}

// ---------------------------------------------------------------------------
// Tool call parsing
// ---------------------------------------------------------------------------

/**
 * Parses tool calls from the OpenAI-compatible response format.
 */
function parseToolCalls(
  rawToolCalls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>
): LLMToolCall[] {
  if (!rawToolCalls || rawToolCalls.length === 0) return [];

  return rawToolCalls
    .filter((tc) => tc.function?.name)
    .map((tc) => {
      let args: Record<string, unknown> = {};
      if (tc.function?.arguments) {
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          // Malformed JSON — return empty args
          args = {};
        }
      }
      return {
        id: tc.id,
        name: tc.function!.name!,
        arguments: args,
      };
    });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface CallResult {
  ok: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error?: string;
}

/**
 * Calls OpenRouter with retry logic for 429 and 5xx errors.
 */
async function callWithRetry(
  apiKey: string,
  body: Record<string, unknown>,
  maxRetries = 2
): Promise<CallResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://unimble.app",
          "X-Title": "Unimble",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after")) || 2;
        if (attempt < maxRetries) {
          await sleep(retryAfter * 1000);
          continue;
        }
        return { ok: false, data: null, error: "Rate limited (429)" };
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (attempt < maxRetries && response.status >= 500) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        return { ok: false, data: null, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      return { ok: true, data };
    } catch (error) {
      if (attempt < maxRetries) {
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

/**
 * Estimates cost based on model pricing.
 * Returns -1 for unknown models.
 */
function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return -1;
  return (
    (promptTokens / 1_000_000) * pricing.inputPer1M +
    (completionTokens / 1_000_000) * pricing.outputPer1M
  );
}
