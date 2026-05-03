/**
 * Phase 7 — Agent Runtime: LLM response parser.
 *
 * Extracts structured content from raw LLM text responses:
 *   - JSON objects from fenced code blocks (```json ... ```)
 *   - Tool call specifications (function name + arguments)
 *   - ReAct reasoning steps (Thought/Action/Observation/Final Answer)
 *   - Free-text fallback when structured extraction fails
 *
 * All functions are pure with no side effects — safe to unit-test directly.
 */

import type { ToolCallSpec } from "./types";

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

/**
 * Try to extract the first valid JSON value from a string.
 * Checks in order:
 *   1. ```json ... ``` fenced block
 *   2. ``` ... ``` fenced block
 *   3. Raw JSON value anywhere in the string
 */
export function extractJson(raw: string): unknown | null {
  // 1. Fenced ```json
  const fencedJson = raw.match(/```json\s*([\s\S]*?)\s*```/);
  if (fencedJson) {
    const parsed = tryParseJson(fencedJson[1]);
    if (parsed !== null) return parsed;
  }

  // 2. Generic fenced block
  const fenced = raw.match(/```\s*([\s\S]*?)\s*```/);
  if (fenced) {
    const parsed = tryParseJson(fenced[1]);
    if (parsed !== null) return parsed;
  }

  // 3. First {...} or [...] occurrence in the string (greedy from outermost)
  const jsonLike = extractFirstJsonValue(raw);
  if (jsonLike !== null) return jsonLike;

  return null;
}

/**
 * Like extractJson but throws `ParseError` instead of returning null.
 * Useful when a JSON response is required.
 */
export function requireJson(raw: string): unknown {
  const result = extractJson(raw);
  if (result === null) {
    throw new ParseError("No valid JSON found in response", raw);
  }
  return result;
}

function tryParseJson(str: string): unknown | null {
  try {
    return JSON.parse(str.trim());
  } catch {
    return null;
  }
}

/** Find the outermost { } or [ ] block in a string. */
function extractFirstJsonValue(str: string): unknown | null {
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch !== "{" && ch !== "[") continue;
    const closer = ch === "{" ? "}" : "]";
    let depth = 1;
    for (let j = i + 1; j < str.length; j++) {
      if (str[j] === ch) depth++;
      else if (str[j] === closer) depth--;
      if (depth === 0) {
        const parsed = tryParseJson(str.slice(i, j + 1));
        if (parsed !== null) return parsed;
        break;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool call extraction
// ---------------------------------------------------------------------------

/**
 * Extract tool call specs from an LLM response.
 * Handles both:
 *   1. Structured tool_calls field (OpenAI-compatible format)
 *   2. ReAct-style Action/Action Input text blocks
 */
export function extractToolCalls(raw: string, structuredCalls?: ToolCallSpec[]): ToolCallSpec[] {
  // Prefer already-parsed structured calls from the API
  if (structuredCalls && structuredCalls.length > 0) return structuredCalls;

  // Fall back to ReAct-style text parsing
  return extractReActToolCalls(raw);
}

function extractReActToolCalls(raw: string): ToolCallSpec[] {
  const calls: ToolCallSpec[] = [];
  const actionPattern = /Action:\s*(\w+)\s*\nAction Input:\s*([\s\S]*?)(?=\nObservation:|\nThought:|\nFinal Answer:|$)/gi;

  let match;
  let id = 0;
  while ((match = actionPattern.exec(raw)) !== null) {
    const name = match[1].trim();
    const rawArgs = match[2].trim();
    let args: Record<string, unknown> = {};

    const parsed = tryParseJson(rawArgs);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>;
    } else if (rawArgs) {
      // Attempt to coerce plain text to {input: text}
      args = { input: rawArgs };
    }

    calls.push({ id: `react-${++id}`, name, arguments: args });
  }

  return calls;
}

// ---------------------------------------------------------------------------
// ReAct step extraction
// ---------------------------------------------------------------------------

export interface ReActStep {
  thought?: string;
  action?: string;
  actionInput?: Record<string, unknown>;
  observation?: string;
  finalAnswer?: string;
}

/**
 * Parse all ReAct reasoning steps from a raw LLM response.
 */
export function extractReActSteps(raw: string): ReActStep[] {
  const steps: ReActStep[] = [];
  const lines = raw.split("\n");
  let current: ReActStep = {};

  for (const line of lines) {
    const thoughtMatch = line.match(/^Thought:\s*(.+)/i);
    const actionMatch = line.match(/^Action:\s*(.+)/i);
    const actionInputMatch = line.match(/^Action Input:\s*(.+)/i);
    const observationMatch = line.match(/^Observation:\s*(.+)/i);
    const finalMatch = line.match(/^Final Answer:\s*(.+)/i);

    if (thoughtMatch) {
      if (Object.keys(current).length > 0) steps.push(current);
      current = { thought: thoughtMatch[1].trim() };
    } else if (actionMatch) {
      current.action = actionMatch[1].trim();
    } else if (actionInputMatch) {
      const parsed = tryParseJson(actionInputMatch[1].trim());
      current.actionInput =
        parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : { input: actionInputMatch[1].trim() };
    } else if (observationMatch) {
      current.observation = observationMatch[1].trim();
      steps.push(current);
      current = {};
    } else if (finalMatch) {
      current.finalAnswer = finalMatch[1].trim();
      steps.push(current);
      current = {};
    }
  }

  if (Object.keys(current).length > 0) steps.push(current);
  return steps;
}

/**
 * Extract the Final Answer from a ReAct response, if present.
 * Returns null if no Final Answer line is found.
 */
export function extractFinalAnswer(raw: string): string | null {
  const match = raw.match(/Final Answer:\s*([\s\S]+?)(?:\n\n|$)/i);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Content type detection
// ---------------------------------------------------------------------------

export type ParsedContentType = "json" | "tool_calls" | "react" | "text";

export interface ParsedResponse {
  type: ParsedContentType;
  json?: unknown;
  toolCalls?: ToolCallSpec[];
  reactSteps?: ReActStep[];
  finalAnswer?: string;
  text: string;
}

/**
 * Parse an LLM response and return a discriminated union describing its content.
 * Tries structured formats first; falls back to free text.
 */
export function parseResponse(
  raw: string,
  structuredToolCalls?: ToolCallSpec[]
): ParsedResponse {
  const text = raw.trim();

  // Priority 1: structured tool calls from API
  if (structuredToolCalls && structuredToolCalls.length > 0) {
    return { type: "tool_calls", toolCalls: structuredToolCalls, text };
  }

  // Priority 2: ReAct tool call patterns in text
  const reactCalls = extractReActToolCalls(text);
  if (reactCalls.length > 0) {
    const finalAnswer = extractFinalAnswer(text);
    return {
      type: finalAnswer ? "react" : "tool_calls",
      toolCalls: reactCalls,
      reactSteps: extractReActSteps(text),
      finalAnswer: finalAnswer ?? undefined,
      text,
    };
  }

  // Priority 3: Final Answer line (ReAct terminal)
  const finalAnswer = extractFinalAnswer(text);
  if (finalAnswer) {
    return {
      type: "react",
      reactSteps: extractReActSteps(text),
      finalAnswer,
      text,
    };
  }

  // Priority 4: JSON extraction
  const json = extractJson(text);
  if (json !== null) {
    return { type: "json", json, text };
  }

  // Priority 5: free text
  return { type: "text", text };
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string
  ) {
    super(message);
    this.name = "ParseError";
  }
}
