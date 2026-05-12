import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  extractJson,
  extractJsonArray,
  parseStructuredOutput,
  createSchemaParser,
  parseToolCalls,
  parseToolArguments,
  extractBetweenMarkers,
  extractCodeBlocks,
  extractSections,
} from "./responseParser";

// ---------------------------------------------------------------------------
// extractJson
// ---------------------------------------------------------------------------

describe("extractJson", () => {
  test("parses pure JSON response", () => {
    const result = extractJson('{"name": "Alice", "age": 30}');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Alice", age: 30 });
  });

  test("parses JSON wrapped in code fences", () => {
    const content = '```json\n{"key": "value"}\n```';
    const result = extractJson(content);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ key: "value" });
  });

  test("parses JSON embedded in text", () => {
    const content = 'Here is the result:\n{"status": "success", "count": 5}\nDone.';
    const result = extractJson(content);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status: "success", count: 5 });
  });

  test("parses JSON arrays", () => {
    const result = extractJson("[1, 2, 3]");
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
  });

  test("handles nested JSON objects", () => {
    const content = '{"user": {"name": "Bob", "settings": {"theme": "dark"}}}';
    const result = extractJson(content);
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).user).toEqual({
      name: "Bob",
      settings: { theme: "dark" },
    });
  });

  test("recovers from trailing commas", () => {
    const content = '{"a": 1, "b": 2,}';
    const result = extractJson(content);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: 1, b: 2 });
    expect(result.recovered).toBe(true);
  });

  test("returns failure for empty content", () => {
    const result = extractJson("");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Empty response");
  });

  test("returns failure for non-JSON content", () => {
    const result = extractJson("This is just plain text with no JSON.");
    expect(result.success).toBe(false);
  });

  test("handles code fences without language specifier", () => {
    const content = '```\n{"key": "value"}\n```';
    const result = extractJson(content);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ key: "value" });
  });

  test("preserves raw content in result", () => {
    const content = '{"x": 1}';
    const result = extractJson(content);
    expect(result.raw).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// extractJsonArray
// ---------------------------------------------------------------------------

describe("extractJsonArray", () => {
  test("extracts a JSON array", () => {
    const result = extractJsonArray('[{"id": 1}, {"id": 2}]');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  test("extracts array from object with array property", () => {
    const content = '{"items": [1, 2, 3]}';
    const result = extractJsonArray(content);
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.recovered).toBe(true);
  });

  test("fails for non-array JSON", () => {
    const result = extractJsonArray('{"key": "value"}');
    // Object without array property
    expect(result.success).toBe(false);
  });

  test("fails for plain text", () => {
    const result = extractJsonArray("not json");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseStructuredOutput
// ---------------------------------------------------------------------------

describe("parseStructuredOutput", () => {
  const articleSchema = z.object({
    title: z.string(),
    body: z.string(),
    tags: z.array(z.string()),
    published: z.boolean().optional(),
  });

  test("parses and validates valid JSON against schema", () => {
    const content = JSON.stringify({
      title: "Hello World",
      body: "Content here",
      tags: ["tech", "ai"],
      published: true,
    });
    const result = parseStructuredOutput(content, articleSchema);
    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("Hello World");
    expect(result.data?.tags).toEqual(["tech", "ai"]);
  });

  test("fails validation for missing required fields", () => {
    const content = JSON.stringify({ title: "Hello" });
    const result = parseStructuredOutput(content, articleSchema);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Schema validation failed");
  });

  test("handles JSON in code fences with schema validation", () => {
    const content = '```json\n{"title": "Test", "body": "Body", "tags": []}\n```';
    const result = parseStructuredOutput(content, articleSchema);
    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("Test");
  });

  test("fails for non-JSON content", () => {
    const result = parseStructuredOutput("not json at all", articleSchema);
    expect(result.success).toBe(false);
    expect(result.error).toContain("JSON extraction failed");
  });

  test("handles optional fields correctly", () => {
    const content = JSON.stringify({
      title: "Test",
      body: "Body",
      tags: ["a"],
    });
    const result = parseStructuredOutput(content, articleSchema);
    expect(result.success).toBe(true);
    expect(result.data?.published).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createSchemaParser
// ---------------------------------------------------------------------------

describe("createSchemaParser", () => {
  test("creates a reusable parser function", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const parse = createSchemaParser(schema);

    const result = parse('{"name": "Alice", "age": 30}');
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Alice");
  });

  test("reusable parser validates consistently", () => {
    const schema = z.object({ value: z.number().min(0).max(100) });
    const parse = createSchemaParser(schema);

    expect(parse('{"value": 50}').success).toBe(true);
    expect(parse('{"value": 150}').success).toBe(false);
    expect(parse('{"value": -1}').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseToolCalls
// ---------------------------------------------------------------------------

describe("parseToolCalls", () => {
  test("parses structured tool_calls array", () => {
    const response = {
      content: "",
      tool_calls: [
        {
          id: "call_123",
          type: "function",
          function: {
            name: "search",
            arguments: '{"query": "AI trends"}',
          },
        },
      ],
    };
    const calls = parseToolCalls(response);
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe("call_123");
    expect(calls[0].name).toBe("search");
    expect(calls[0].arguments).toEqual({ query: "AI trends" });
  });

  test("parses multiple tool calls", () => {
    const response = {
      content: "",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "search", arguments: '{"q": "a"}' },
        },
        {
          id: "call_2",
          type: "function",
          function: { name: "scrape", arguments: '{"url": "https://example.com"}' },
        },
      ],
    };
    const calls = parseToolCalls(response);
    expect(calls).toHaveLength(2);
    expect(calls[0].name).toBe("search");
    expect(calls[1].name).toBe("scrape");
  });

  test("parses text-based TOOL_CALL format", () => {
    const text = 'TOOL_CALL: perplexity.search({"query": "latest AI news"})';
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("perplexity.search");
    expect(calls[0].arguments).toEqual({ query: "latest AI news" });
  });

  test("parses text-based Action format", () => {
    const text = 'Action: memory.read {"query": "user preferences"}';
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("memory.read");
    expect(calls[0].arguments).toEqual({ query: "user preferences" });
  });

  test("returns empty array for no tool calls", () => {
    const response = { content: "Just a regular response" };
    const calls = parseToolCalls(response);
    expect(calls).toHaveLength(0);
  });

  test("handles malformed tool call arguments", () => {
    const response = {
      content: "",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "search", arguments: "not valid json" },
        },
      ],
    };
    const calls = parseToolCalls(response);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("search");
    expect(calls[0].recovered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseToolArguments
// ---------------------------------------------------------------------------

describe("parseToolArguments", () => {
  test("parses valid JSON arguments", () => {
    const result = parseToolArguments('{"key": "value", "num": 42}');
    expect(result.data).toEqual({ key: "value", num: 42 });
    expect(result.recovered).toBe(false);
  });

  test("handles empty string", () => {
    const result = parseToolArguments("");
    expect(result.data).toEqual({});
    expect(result.recovered).toBe(false);
  });

  test("handles non-object JSON (wraps in value key)", () => {
    const result = parseToolArguments('"just a string"');
    expect(result.data).toEqual({ value: "just a string" });
  });

  test("recovers from trailing commas", () => {
    const result = parseToolArguments('{"a": 1, "b": 2,}');
    expect(result.data).toEqual({ a: 1, b: 2 });
    expect(result.recovered).toBe(true);
  });

  test("handles completely invalid input", () => {
    const result = parseToolArguments("not json at all");
    expect(result.recovered).toBe(true);
    expect(result.data).toHaveProperty("raw");
  });
});

// ---------------------------------------------------------------------------
// extractBetweenMarkers
// ---------------------------------------------------------------------------

describe("extractBetweenMarkers", () => {
  test("extracts content between markers", () => {
    const content = "Before <article>The article content</article> After";
    const result = extractBetweenMarkers(content, "<article>", "</article>");
    expect(result).toBe("The article content");
  });

  test("handles multi-line content", () => {
    const content = "---START---\nLine 1\nLine 2\n---END---";
    const result = extractBetweenMarkers(content, "---START---", "---END---");
    expect(result).toBe("Line 1\nLine 2");
  });

  test("returns null when start marker not found", () => {
    const result = extractBetweenMarkers("no markers here", "<start>", "<end>");
    expect(result).toBeNull();
  });

  test("returns null when end marker not found", () => {
    const result = extractBetweenMarkers("<start>content", "<start>", "<end>");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractCodeBlocks
// ---------------------------------------------------------------------------

describe("extractCodeBlocks", () => {
  test("extracts code blocks with language", () => {
    const content = "Some text\n```typescript\nconst x = 1;\n```\nMore text";
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe("typescript");
    expect(blocks[0].code).toBe("const x = 1;");
  });

  test("extracts multiple code blocks", () => {
    const content = "```js\nconst a = 1;\n```\n\n```python\nx = 1\n```";
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].language).toBe("js");
    expect(blocks[1].language).toBe("python");
  });

  test("handles code blocks without language", () => {
    const content = "```\nplain code\n```";
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe("text");
    expect(blocks[0].code).toBe("plain code");
  });

  test("returns empty array for no code blocks", () => {
    const blocks = extractCodeBlocks("No code here");
    expect(blocks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractSections
// ---------------------------------------------------------------------------

describe("extractSections", () => {
  test("extracts markdown sections", () => {
    const content = "# Title\nIntro text\n## Section 1\nContent 1\n## Section 2\nContent 2";
    const sections = extractSections(content);
    expect(sections).toHaveLength(3);
    expect(sections[0].heading).toBe("Title");
    expect(sections[0].level).toBe(1);
    expect(sections[1].heading).toBe("Section 1");
    expect(sections[1].level).toBe(2);
    expect(sections[1].content).toBe("Content 1");
  });

  test("handles different heading levels", () => {
    const content = "### Deep\nContent\n#### Deeper\nMore";
    const sections = extractSections(content);
    expect(sections).toHaveLength(2);
    expect(sections[0].level).toBe(3);
    expect(sections[1].level).toBe(4);
  });

  test("returns empty array for no headings", () => {
    const sections = extractSections("Just plain text\nNo headings");
    expect(sections).toHaveLength(0);
  });
});
