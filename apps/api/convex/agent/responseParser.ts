/**
 * Agent Runtime — Response Parsing
 *
 * Handles parsing and validation of LLM responses:
 * - JSON extraction from mixed text/JSON responses
 * - Structured output validation via Zod schemas
 * - Tool call parsing (OpenAI function calling format)
 * - Error recovery for malformed responses
 * - Content extraction from various response formats
 *
 * This module is pure (no side effects, no DB access) and runs
 * in both V8 and Node.js runtimes.
 *
 * Phase 7.2.3 — Response Parsing
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of parsing a response. */
export interface ParseResult<T = unknown> {
  /** Whether parsing succeeded */
  success: boolean;
  /** The parsed data (if successful) */
  data?: T;
  /** Raw content that was parsed */
  raw: string;
  /** Error message (if failed) */
  error?: string;
  /** Whether recovery was attempted */
  recovered?: boolean;
}

/** Options for JSON extraction. */
export interface JsonExtractionOptions {
  /** Whether to attempt recovery on malformed JSON */
  attemptRecovery?: boolean;
  /** Maximum depth for nested JSON extraction */
  maxDepth?: number;
  /** Whether to strip markdown code fences before parsing */
  stripCodeFences?: boolean;
}

/** A parsed tool call from an LLM response. */
export interface ParsedToolCall {
  /** Tool call ID (from the LLM) */
  id?: string;
  /** Tool/function name */
  name: string;
  /** Parsed arguments */
  arguments: Record<string, unknown>;
  /** Whether arguments were recovered from malformed JSON */
  recovered?: boolean;
}

/** Options for structured output parsing. */
export interface StructuredOutputOptions {
  /** Whether to attempt partial parsing on validation failure */
  partial?: boolean;
  /** Whether to coerce types (e.g., "123" → 123) */
  coerce?: boolean;
  /** Custom error messages for validation failures */
  errorMessages?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// JSON Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts JSON from an LLM response that may contain mixed content.
 *
 * Handles common LLM response patterns:
 * - Pure JSON response
 * - JSON wrapped in markdown code fences (```json ... ```)
 * - JSON embedded in explanatory text
 * - Multiple JSON objects (returns the first valid one)
 *
 * @param content - The raw LLM response text
 * @param options - Extraction options
 * @returns ParseResult with the extracted JSON data
 */
export function extractJson<T = unknown>(
  content: string,
  options: JsonExtractionOptions = {}
): ParseResult<T> {
  const { attemptRecovery = true, stripCodeFences = true } = options;

  if (!content || content.trim().length === 0) {
    return { success: false, raw: content, error: "Empty response" };
  }

  let text = content.trim();

  // Step 1: Strip markdown code fences if present
  if (stripCodeFences) {
    text = stripFences(text);
  }

  // Step 2: Try direct JSON parse
  const directResult = tryParse<T>(text);
  if (directResult.success) {
    return { ...directResult, raw: content };
  }

  // Step 3: Try to find JSON in the text (first { or [ to matching close)
  const extracted = findJsonInText(text);
  if (extracted) {
    const extractedResult = tryParse<T>(extracted);
    if (extractedResult.success) {
      return { ...extractedResult, raw: content };
    }
  }

  // Step 4: Attempt recovery if enabled
  if (attemptRecovery) {
    const recovered = recoverJson(text);
    if (recovered) {
      const recoveredResult = tryParse<T>(recovered);
      if (recoveredResult.success) {
        return { ...recoveredResult, raw: content, recovered: true };
      }
    }
  }

  return {
    success: false,
    raw: content,
    error: `Failed to extract JSON from response: ${directResult.error}`,
  };
}

/**
 * Extracts a JSON array from an LLM response.
 * Convenience wrapper that ensures the result is an array.
 */
export function extractJsonArray<T = unknown>(
  content: string,
  options: JsonExtractionOptions = {}
): ParseResult<T[]> {
  const result = extractJson<unknown>(content, options);

  if (!result.success) {
    return { success: false, raw: content, error: result.error };
  }

  if (Array.isArray(result.data)) {
    return { success: true, data: result.data as T[], raw: content, recovered: result.recovered };
  }

  // If it's an object with an array property, try to extract it
  if (typeof result.data === "object" && result.data !== null) {
    const obj = result.data as Record<string, unknown>;
    const arrayProp = Object.values(obj).find(Array.isArray);
    if (arrayProp) {
      return { success: true, data: arrayProp as T[], raw: content, recovered: true };
    }
  }

  return { success: false, raw: content, error: "Extracted JSON is not an array" };
}

// ---------------------------------------------------------------------------
// Structured Output Validation
// ---------------------------------------------------------------------------

/**
 * Parses and validates an LLM response against a Zod schema.
 *
 * Combines JSON extraction with schema validation for type-safe
 * structured output from LLMs.
 *
 * @param content - The raw LLM response text
 * @param schema - Zod schema to validate against
 * @param options - Parsing options
 * @returns ParseResult with validated, typed data
 */
export function parseStructuredOutput<T>(
  content: string,
  schema: z.ZodType<T>,
  options: StructuredOutputOptions = {}
): ParseResult<T> {
  // First extract JSON
  const jsonResult = extractJson(content);

  if (!jsonResult.success) {
    return {
      success: false,
      raw: content,
      error: `JSON extraction failed: ${jsonResult.error}`,
    };
  }

  // Validate against schema
  const validation = schema.safeParse(jsonResult.data);

  if (validation.success) {
    return {
      success: true,
      data: validation.data,
      raw: content,
      recovered: jsonResult.recovered,
    };
  }

  // Attempt partial parsing if enabled
  if (options.partial && jsonResult.data && typeof jsonResult.data === "object") {
    const partialResult = attemptPartialParse(jsonResult.data, schema);
    if (partialResult) {
      return {
        success: true,
        data: partialResult,
        raw: content,
        recovered: true,
      };
    }
  }

  // Format validation errors
  const errors = validation.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  return {
    success: false,
    raw: content,
    error: `Schema validation failed: ${errors}`,
  };
}

/**
 * Creates a parser function bound to a specific schema.
 * Useful for reusable parsing of a known output format.
 *
 * Usage:
 * ```ts
 * const parseArticle = createSchemaParser(articleSchema);
 * const result = parseArticle(llmResponse);
 * ```
 */
export function createSchemaParser<T>(
  schema: z.ZodType<T>,
  options?: StructuredOutputOptions
): (content: string) => ParseResult<T> {
  return (content: string) => parseStructuredOutput(content, schema, options);
}

// ---------------------------------------------------------------------------
// Tool Call Parsing
// ---------------------------------------------------------------------------

/**
 * Parses tool calls from an LLM response.
 *
 * Handles both:
 * - OpenAI function calling format (structured tool_calls array)
 * - Text-based tool calls (for models that don't support function calling)
 *
 * @param response - The LLM response object or text
 * @returns Array of parsed tool calls
 */
export function parseToolCalls(
  response:
    | {
        content?: string;
        tool_calls?: Array<{
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>;
      }
    | string
): ParsedToolCall[] {
  // Handle string input (text-based tool calls)
  if (typeof response === "string") {
    return parseTextToolCalls(response);
  }

  // Handle structured tool_calls
  if (response.tool_calls && response.tool_calls.length > 0) {
    return response.tool_calls
      .filter((tc) => tc.function?.name)
      .map((tc) => {
        const args = parseToolArguments(tc.function?.arguments ?? "{}");
        return {
          id: tc.id,
          name: tc.function!.name!,
          arguments: args.data,
          recovered: args.recovered,
        };
      });
  }

  // Try to parse tool calls from content text
  if (response.content) {
    return parseTextToolCalls(response.content);
  }

  return [];
}

/**
 * Parses tool call arguments from a JSON string.
 * Attempts recovery on malformed JSON.
 */
export function parseToolArguments(argsString: string): {
  data: Record<string, unknown>;
  recovered: boolean;
} {
  if (!argsString || argsString.trim() === "") {
    return { data: {}, recovered: false };
  }

  // Try direct parse
  try {
    const parsed = JSON.parse(argsString);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return { data: parsed, recovered: false };
    }
    return { data: { value: parsed }, recovered: false };
  } catch {
    // Attempt recovery
    const recovered = recoverJson(argsString);
    if (recovered) {
      try {
        const parsed = JSON.parse(recovered);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          return { data: parsed, recovered: true };
        }
        return { data: { value: parsed }, recovered: true };
      } catch {
        // Fall through
      }
    }
    return { data: { raw: argsString }, recovered: true };
  }
}

// ---------------------------------------------------------------------------
// Content Extraction Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts content between specific markers in an LLM response.
 *
 * Useful for responses that use delimiters like:
 * - <article>...</article>
 * - ---START---...---END---
 * - [CONTENT]...[/CONTENT]
 */
export function extractBetweenMarkers(
  content: string,
  startMarker: string,
  endMarker: string
): string | null {
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) return null;

  const contentStart = startIdx + startMarker.length;
  const endIdx = content.indexOf(endMarker, contentStart);
  if (endIdx === -1) return null;

  return content.slice(contentStart, endIdx).trim();
}

/**
 * Extracts all code blocks from an LLM response.
 * Returns an array of { language, code } objects.
 */
export function extractCodeBlocks(content: string): Array<{ language: string; code: string }> {
  const blocks: Array<{ language: string; code: string }> = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    blocks.push({
      language: match[1] || "text",
      code: match[2].trim(),
    });
  }

  return blocks;
}

/**
 * Splits an LLM response into sections based on markdown headers.
 */
export function extractSections(
  content: string
): Array<{ heading: string; level: number; content: string }> {
  const sections: Array<{ heading: string; level: number; content: string }> = [];
  const lines = content.split("\n");
  let currentSection: { heading: string; level: number; lines: string[] } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      if (currentSection) {
        sections.push({
          heading: currentSection.heading,
          level: currentSection.level,
          content: currentSection.lines.join("\n").trim(),
        });
      }
      currentSection = {
        heading: headerMatch[2],
        level: headerMatch[1].length,
        lines: [],
      };
    } else if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  if (currentSection) {
    sections.push({
      heading: currentSection.heading,
      level: currentSection.level,
      content: currentSection.lines.join("\n").trim(),
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attempts to parse a string as JSON.
 */
function tryParse<T>(text: string): ParseResult<T> {
  try {
    const data = JSON.parse(text) as T;
    return { success: true, data, raw: text };
  } catch (error) {
    return {
      success: false,
      raw: text,
      error: error instanceof Error ? error.message : "Parse error",
    };
  }
}

/**
 * Strips markdown code fences from text.
 */
function stripFences(text: string): string {
  // Match ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/^```(?:\w*)\n([\s\S]*?)```\s*$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Also handle inline fences at start/end
  if (text.startsWith("```")) {
    const firstNewline = text.indexOf("\n");
    const lastFence = text.lastIndexOf("```");
    if (lastFence > firstNewline) {
      return text.slice(firstNewline + 1, lastFence).trim();
    }
  }

  return text;
}

/**
 * Finds the first valid JSON object or array in a text string.
 */
function findJsonInText(text: string): string | null {
  // Find first { or [
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");

  let start: number;
  let openChar: string;
  let closeChar: string;

  if (objStart === -1 && arrStart === -1) return null;

  if (objStart === -1) {
    start = arrStart;
    openChar = "[";
    closeChar = "]";
  } else if (arrStart === -1) {
    start = objStart;
    openChar = "{";
    closeChar = "}";
  } else {
    start = Math.min(objStart, arrStart);
    openChar = start === objStart ? "{" : "[";
    closeChar = start === objStart ? "}" : "]";
  }

  // Find matching close bracket
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === openChar) depth++;
    if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Attempts to recover malformed JSON by fixing common issues.
 */
function recoverJson(text: string): string | null {
  let fixed = text.trim();

  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, "$1");

  // Fix single quotes to double quotes (common LLM mistake)
  // Only do this if there are no double quotes already
  if (!fixed.includes('"') && fixed.includes("'")) {
    fixed = fixed.replace(/'/g, '"');
  }

  // Fix unquoted keys: { key: "value" } → { "key": "value" }
  fixed = fixed.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');

  // Fix trailing text after JSON
  const jsonEnd = findJsonInText(fixed);
  if (jsonEnd) {
    fixed = jsonEnd;
  }

  // Try to parse the fixed version
  try {
    JSON.parse(fixed);
    return fixed;
  } catch {
    return null;
  }
}

/**
 * Parses tool calls from text-based responses.
 * Handles patterns like:
 * - TOOL_CALL: toolName({"arg": "value"})
 * - Action: toolName with args {"arg": "value"}
 */
function parseTextToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];

  // Pattern 1: TOOL_CALL: name(args)
  const toolCallRegex = /TOOL_CALL:\s*(\w[\w.]*)\s*\(([^)]*)\)/g;
  let match;
  while ((match = toolCallRegex.exec(text)) !== null) {
    const args = parseToolArguments(match[2]);
    calls.push({
      name: match[1],
      arguments: args.data,
      recovered: args.recovered,
    });
  }

  if (calls.length > 0) return calls;

  // Pattern 2: Action: name {"args": ...}
  const actionRegex = /Action:\s*(\w[\w.]*)\s*(\{[\s\S]*?\})/g;
  while ((match = actionRegex.exec(text)) !== null) {
    const args = parseToolArguments(match[2]);
    calls.push({
      name: match[1],
      arguments: args.data,
      recovered: args.recovered,
    });
  }

  return calls;
}

/**
 * Attempts partial parsing when full schema validation fails.
 * Extracts whatever fields match the schema.
 */
function attemptPartialParse<T>(data: unknown, schema: z.ZodType<T>): T | null {
  // For object schemas, try to extract matching fields
  if (schema instanceof z.ZodObject && typeof data === "object" && data !== null) {
    const shape = schema.shape as Record<string, z.ZodType>;
    const partial: Record<string, unknown> = {};

    for (const [key, fieldSchema] of Object.entries(shape)) {
      const value = (data as Record<string, unknown>)[key];
      if (value !== undefined) {
        const fieldResult = fieldSchema.safeParse(value);
        if (fieldResult.success) {
          partial[key] = fieldResult.data;
        }
      }
    }

    // Try validating the partial result
    const result = schema.safeParse(partial);
    if (result.success) {
      return result.data as T;
    }
  }

  return null;
}
