import { describe, expect, test } from "vitest";

import {
  renderPrompt,
  validateTemplate,
  extractVariables,
  getPromptTemplate,
  listPromptTemplates,
  createPromptTemplate,
  PROMPT_LIBRARY,
} from "./promptManager";
import type { PromptTemplate } from "./promptManager";

// ---------------------------------------------------------------------------
// renderPrompt — Variable Interpolation
// ---------------------------------------------------------------------------

describe("renderPrompt — variable interpolation", () => {
  test("interpolates simple variables", () => {
    const result = renderPrompt("Hello {{name}}, welcome to {{place}}!", {
      name: "Alice",
      place: "Unimble",
    });
    expect(result.text).toBe("Hello Alice, welcome to Unimble!");
    expect(result.usedVariables).toContain("name");
    expect(result.usedVariables).toContain("place");
    expect(result.missingVariables).toHaveLength(0);
  });

  test("handles missing variables gracefully", () => {
    const result = renderPrompt("Hello {{name}}, your role is {{role}}.", {
      name: "Bob",
    });
    expect(result.text).toBe("Hello Bob, your role is {{role}}.");
    expect(result.missingVariables).toContain("role");
  });

  test("supports dot notation for nested variables", () => {
    const result = renderPrompt("User: {{user.name}}, Email: {{user.email}}", {
      user: { name: "Charlie", email: "charlie@test.com" },
    });
    expect(result.text).toBe("User: Charlie, Email: charlie@test.com");
  });

  test("supports default values", () => {
    const result = renderPrompt('Tone: {{tone | default:"professional"}}', {});
    expect(result.text).toBe("Tone: professional");
    expect(result.missingVariables).toHaveLength(0);
  });

  test("uses provided value over default", () => {
    const result = renderPrompt('Tone: {{tone | default:"professional"}}', {
      tone: "casual",
    });
    expect(result.text).toBe("Tone: casual");
  });

  test("formats numbers and booleans as strings", () => {
    const result = renderPrompt("Count: {{count}}, Active: {{active}}", {
      count: 42,
      active: true,
    });
    expect(result.text).toBe("Count: 42, Active: true");
  });

  test("formats arrays as comma-separated values", () => {
    const result = renderPrompt("Tags: {{tags}}", {
      tags: ["ai", "ml", "tech"],
    });
    expect(result.text).toBe("Tags: ai, ml, tech");
  });

  test("handles empty string variables", () => {
    const result = renderPrompt("Value: [{{value}}]", { value: "" });
    expect(result.text).toBe("Value: []");
  });
});

// ---------------------------------------------------------------------------
// renderPrompt — Conditional Sections
// ---------------------------------------------------------------------------

describe("renderPrompt — conditionals", () => {
  test("includes section when condition is truthy", () => {
    const result = renderPrompt("Start{{#if showExtra}}\nExtra content{{/if}}\nEnd", {
      showExtra: true,
    });
    expect(result.text).toBe("Start\nExtra content\nEnd");
  });

  test("excludes section when condition is falsy", () => {
    const result = renderPrompt("Start{{#if showExtra}}\nExtra content{{/if}}\nEnd", {
      showExtra: false,
    });
    expect(result.text).toBe("Start\nEnd");
  });

  test("handles if/else blocks", () => {
    const result = renderPrompt("{{#if premium}}Premium user{{else}}Free user{{/if}}", {
      premium: false,
    });
    expect(result.text).toBe("Free user");
  });

  test("handles unless blocks", () => {
    const result = renderPrompt("{{#unless errors}}All good!{{/unless}}", { errors: null });
    expect(result.text).toBe("All good!");
  });

  test("treats empty arrays as falsy", () => {
    const result = renderPrompt("{{#if items}}Has items{{/if}}", { items: [] });
    expect(result.text).toBe("");
  });

  test("treats non-empty arrays as truthy", () => {
    const result = renderPrompt("{{#if items}}Has items{{/if}}", { items: [1, 2, 3] });
    expect(result.text).toBe("Has items");
  });

  test("treats null/undefined as falsy", () => {
    const result = renderPrompt("{{#if value}}Present{{/if}}", { value: null });
    expect(result.text).toBe("");
  });
});

// ---------------------------------------------------------------------------
// renderPrompt — Each Loops
// ---------------------------------------------------------------------------

describe("renderPrompt — each loops", () => {
  test("iterates over string arrays", () => {
    const result = renderPrompt("{{#each items}}- {{this}}\n{{/each}}", {
      items: ["apple", "banana", "cherry"],
    });
    expect(result.text).toBe("- apple\n- banana\n- cherry");
  });

  test("provides @index in loops", () => {
    const result = renderPrompt("{{#each items}}{{@index}}: {{this}}\n{{/each}}", {
      items: ["a", "b", "c"],
    });
    expect(result.text).toBe("0: a\n1: b\n2: c");
  });

  test("handles object arrays with this.property", () => {
    const result = renderPrompt("{{#each tools}}- {{this.name}}: {{this.description}}\n{{/each}}", {
      tools: [
        { name: "search", description: "Search the web" },
        { name: "scrape", description: "Scrape a page" },
      ],
    });
    expect(result.text).toBe("- search: Search the web\n- scrape: Scrape a page");
  });

  test("handles empty arrays (no output)", () => {
    const result = renderPrompt("Before\n{{#each items}}- {{this}}\n{{/each}}After", { items: [] });
    expect(result.text).toBe("Before\nAfter");
  });

  test("handles undefined variable (no output)", () => {
    const result = renderPrompt("{{#each missing}}- {{this}}\n{{/each}}", {});
    expect(result.text).toBe("");
  });
});

// ---------------------------------------------------------------------------
// renderPrompt — PromptTemplate objects
// ---------------------------------------------------------------------------

describe("renderPrompt — PromptTemplate objects", () => {
  test("renders a PromptTemplate with metadata", () => {
    const template: PromptTemplate = {
      id: "test.template",
      name: "Test Template",
      version: "2.1.0",
      template: "Hello {{name}}!",
    };
    const result = renderPrompt(template, { name: "World" });
    expect(result.text).toBe("Hello World!");
    expect(result.templateId).toBe("test.template");
    expect(result.version).toBe("2.1.0");
  });

  test("inline strings use 'inline' as templateId", () => {
    const result = renderPrompt("Hello {{name}}!", { name: "World" });
    expect(result.templateId).toBe("inline");
    expect(result.version).toBe("1.0.0");
  });
});

// ---------------------------------------------------------------------------
// validateTemplate
// ---------------------------------------------------------------------------

describe("validateTemplate", () => {
  const template: PromptTemplate = {
    id: "test",
    name: "Test",
    version: "1.0.0",
    template: "{{a}} {{b}} {{c}}",
    requiredVariables: ["a", "b", "c"],
  };

  test("returns empty array when all required variables provided", () => {
    const missing = validateTemplate(template, { a: "1", b: "2", c: "3" });
    expect(missing).toHaveLength(0);
  });

  test("returns missing variable names", () => {
    const missing = validateTemplate(template, { a: "1" });
    expect(missing).toContain("b");
    expect(missing).toContain("c");
    expect(missing).not.toContain("a");
  });

  test("returns empty array when no requiredVariables defined", () => {
    const noReq: PromptTemplate = { id: "x", name: "X", version: "1.0.0", template: "{{a}}" };
    expect(validateTemplate(noReq, {})).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractVariables
// ---------------------------------------------------------------------------

describe("extractVariables", () => {
  test("extracts simple variables", () => {
    const vars = extractVariables("Hello {{name}}, welcome to {{place}}!");
    expect(vars).toContain("name");
    expect(vars).toContain("place");
  });

  test("extracts variables from conditionals", () => {
    const vars = extractVariables("{{#if premium}}Premium{{/if}}");
    expect(vars).toContain("premium");
  });

  test("extracts variables from each loops", () => {
    const vars = extractVariables("{{#each items}}{{this}}{{/each}}");
    expect(vars).toContain("items");
  });

  test("extracts variables with default values", () => {
    const vars = extractVariables('{{tone | default:"casual"}}');
    expect(vars).toContain("tone");
  });

  test("handles dot notation variables", () => {
    const vars = extractVariables("{{user.name}} {{user.email}}");
    expect(vars).toContain("user.name");
    expect(vars).toContain("user.email");
  });
});

// ---------------------------------------------------------------------------
// Prompt Library
// ---------------------------------------------------------------------------

describe("Prompt Library", () => {
  test("getPromptTemplate returns known templates", () => {
    const template = getPromptTemplate("agent.content-writer");
    expect(template).toBeDefined();
    expect(template!.id).toBe("agent.content-writer");
    expect(template!.version).toBe("1.0.0");
  });

  test("getPromptTemplate returns undefined for unknown IDs", () => {
    expect(getPromptTemplate("nonexistent")).toBeUndefined();
  });

  test("listPromptTemplates returns all templates", () => {
    const all = listPromptTemplates();
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBe(Object.keys(PROMPT_LIBRARY).length);
  });

  test("listPromptTemplates filters by category", () => {
    const agents = listPromptTemplates("agent");
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((t) => t.category === "agent")).toBe(true);
  });

  test("content-writer template renders correctly", () => {
    const template = getPromptTemplate("agent.content-writer")!;
    const result = renderPrompt(template, {
      agentName: "ContentBot",
      contentType: "technical blog posts",
      brandVoice: "Professional and approachable",
    });
    expect(result.text).toContain("ContentBot");
    expect(result.text).toContain("technical blog posts");
    expect(result.text).toContain("Professional and approachable");
    expect(result.missingVariables).toHaveLength(0);
  });

  test("createPromptTemplate creates valid template", () => {
    const template = createPromptTemplate(
      "custom.greeting",
      "Greeting",
      "Hello {{name}}, {{#if title}}({{title}}){{/if}}!",
      { version: "1.0.0", category: "custom" }
    );
    expect(template.id).toBe("custom.greeting");
    expect(template.requiredVariables).toContain("name");
    expect(template.requiredVariables).toContain("title");
  });
});
