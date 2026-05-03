/**
 * Phase 7 — Agent Runtime: Prompt template engine.
 *
 * Features:
 *   - {{variable}} interpolation
 *   - {{#if condition}}...{{/if}} conditional sections
 *   - {{#each items as item}}...{{/each}} iteration
 *   - {{#unless condition}}...{{/unless}} negation blocks
 *   - Prompt versioning (semver-style)
 *   - Fragment library for reusable prompt snippets
 *   - Trim/compact whitespace option
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateVariables = Record<string, unknown>;

export interface PromptVersion {
  version: string;
  template: string;
  description?: string;
  author?: string;
  createdAt?: number;
}

export interface RenderOptions {
  /** Strip excessive blank lines in the rendered output. Default: true */
  compact?: boolean;
  /** Throw on missing variable references. Default: false (leaves {{var}} intact) */
  strict?: boolean;
}

// ---------------------------------------------------------------------------
// PromptTemplate
// ---------------------------------------------------------------------------

export class PromptTemplate {
  private readonly name: string;
  private readonly versions: Map<string, PromptVersion>;
  private currentVersion: string;

  constructor(name: string, template: string, version = "1.0.0") {
    this.name = name;
    this.versions = new Map();
    const entry: PromptVersion = { version, template, createdAt: Date.now() };
    this.versions.set(version, entry);
    this.currentVersion = version;
  }

  get templateName(): string {
    return this.name;
  }

  get version(): string {
    return this.currentVersion;
  }

  /** Add a new version of this prompt. */
  addVersion(version: string, template: string, meta?: Omit<PromptVersion, "version" | "template">): this {
    this.versions.set(version, { version, template, ...meta, createdAt: Date.now() });
    this.currentVersion = version;
    return this;
  }

  /** Render the current (or specified) version with the given variables. */
  render(variables: TemplateVariables = {}, options: RenderOptions = {}, version?: string): string {
    const ver = version ?? this.currentVersion;
    const entry = this.versions.get(ver);
    if (!entry) throw new Error(`Prompt version "${ver}" not found for template "${this.name}"`);
    return renderTemplate(entry.template, variables, options);
  }

  /** List available versions. */
  listVersions(): PromptVersion[] {
    return Array.from(this.versions.values()).sort((a, b) =>
      a.createdAt! - b.createdAt!
    );
  }
}

// ---------------------------------------------------------------------------
// Core rendering engine
// ---------------------------------------------------------------------------

/**
 * Render a template string with the given variable context.
 * Processing order: conditionals → each blocks → variable interpolation.
 */
export function renderTemplate(
  template: string,
  variables: TemplateVariables,
  options: RenderOptions = {}
): string {
  const { compact = true, strict = false } = options;

  let output = template;

  // Process in dependency order: each first so inner {{#if}} blocks in each
  // body are evaluated with per-item variables (not stripped by the outer pass).

  // 1. {{#each items as item}}...{{/each}}
  output = processEach(output, variables, strict);

  // 2. {{#unless cond}}...{{/unless}}
  output = processUnless(output, variables, strict);

  // 3. {{#if cond}}...{{/if}}
  output = processIf(output, variables, strict);

  // 4. {{variable}} interpolation
  output = interpolate(output, variables, strict);

  // 5. Optional whitespace compaction
  if (compact) {
    output = output.replace(/\n{3,}/g, "\n\n").trim();
  }

  return output;
}

// ---------------------------------------------------------------------------
// Internal processors
// ---------------------------------------------------------------------------

function resolveValue(key: string, variables: TemplateVariables): unknown {
  const parts = key.split(".");
  let val: unknown = variables;
  for (const part of parts) {
    if (val === null || val === undefined) return undefined;
    val = (val as Record<string, unknown>)[part];
  }
  return val;
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

function processIf(
  template: string,
  variables: TemplateVariables,
  strict: boolean
): string {
  const ifRegex = /\{\{#if\s+([^}]+?)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
  return template.replace(ifRegex, (_, condition, truePart, falsePart = "") => {
    const val = resolveValue(condition.trim(), variables);
    return isTruthy(val) ? truePart : falsePart;
  });
}

function processUnless(
  template: string,
  variables: TemplateVariables,
  strict: boolean
): string {
  const unlessRegex = /\{\{#unless\s+([^}]+?)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
  return template.replace(unlessRegex, (_, condition, body) => {
    const val = resolveValue(condition.trim(), variables);
    return !isTruthy(val) ? body : "";
  });
}

function processEach(
  template: string,
  variables: TemplateVariables,
  strict: boolean
): string {
  const eachRegex = /\{\{#each\s+([^}]+?)\s+as\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  return template.replace(eachRegex, (_, listKey, itemName, body) => {
    const list = resolveValue(listKey.trim(), variables);
    if (!Array.isArray(list)) return "";
    return list
      .map((item, index) =>
        renderTemplate(body, { ...variables, [itemName]: item, _index: index, _first: index === 0, _last: index === list.length - 1 }, { compact: false, strict })
      )
      .join("");
  });
}

function interpolate(
  template: string,
  variables: TemplateVariables,
  strict: boolean
): string {
  return template.replace(/\{\{([^#/][^}]*?)\}\}/g, (match, key) => {
    const trimmed = key.trim();
    const val = resolveValue(trimmed, variables);
    if (val === undefined || val === null) {
      if (strict) throw new Error(`Missing template variable: "${trimmed}"`);
      return match;
    }
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  });
}

// ---------------------------------------------------------------------------
// Fragment library
// ---------------------------------------------------------------------------

export interface PromptFragment {
  name: string;
  content: string;
  description?: string;
}

export class PromptFragmentLibrary {
  private readonly fragments = new Map<string, PromptFragment>();

  register(fragment: PromptFragment): this {
    this.fragments.set(fragment.name, fragment);
    return this;
  }

  get(name: string): PromptFragment | undefined {
    return this.fragments.get(name);
  }

  list(): PromptFragment[] {
    return Array.from(this.fragments.values());
  }

  /** Resolve {{>fragment_name}} includes in a template string. */
  resolve(template: string, variables: TemplateVariables = {}): string {
    return template.replace(/\{\{>\s*(\w+)\s*\}\}/g, (match, name) => {
      const frag = this.fragments.get(name);
      if (!frag) return match;
      return renderTemplate(frag.content, variables);
    });
  }
}

// ---------------------------------------------------------------------------
// Built-in fragment library instance with reusable agent prompt fragments
// ---------------------------------------------------------------------------

export const FRAGMENTS = new PromptFragmentLibrary()
  .register({
    name: "json_output",
    description: "Instructs the model to output valid JSON only",
    content: `Respond ONLY with valid JSON. Do not include any explanation, markdown, or text outside the JSON object.`,
  })
  .register({
    name: "tool_use",
    description: "Instructs the model to call tools when needed",
    content: `When you need information or need to take an action, use the available tools. Always use a tool rather than guessing.`,
  })
  .register({
    name: "react_format",
    description: "ReAct reasoning format instructions",
    content: `Use the following format for each reasoning step:
Thought: <your reasoning about what to do>
Action: <tool name>
Action Input: <tool parameters as JSON>
Observation: <result of the action>
... (repeat Thought/Action/Observation as needed)
Thought: I now have enough information.
Final Answer: <your final response>`,
  })
  .register({
    name: "content_reviewer_base",
    description: "Base instructions for content reviewer agents",
    content: `You are a professional content reviewer. Your task is to critically evaluate the provided content and return a structured assessment.
Your response must be a JSON object with the following fields:
- score: number (0–100)
- summary: string (1–2 sentence overview)
- issues: array of { severity: "must-fix"|"suggestion"|"info", description: string, location?: string }`,
  })
  .register({
    name: "structured_output",
    description: "Generic structured JSON output instruction",
    content: `Return your response as a structured JSON object. Include all requested fields. Do not add commentary outside the JSON.`,
  });

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

export class PromptRegistry {
  private readonly templates = new Map<string, PromptTemplate>();

  register(template: PromptTemplate): this {
    this.templates.set(template.templateName, template);
    return this;
  }

  get(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }

  render(
    name: string,
    variables: TemplateVariables = {},
    options: RenderOptions = {}
  ): string {
    const tpl = this.templates.get(name);
    if (!tpl) throw new Error(`Prompt template "${name}" not found`);
    return tpl.render(variables, options);
  }

  list(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }
}

// ---------------------------------------------------------------------------
// Default registry with built-in agent templates
// ---------------------------------------------------------------------------

export const PROMPT_REGISTRY = new PromptRegistry()
  .register(
    new PromptTemplate(
      "react_agent",
      `You are {{agentName}}, an AI agent. Your goal is: {{goal}}

{{>tool_use}}

{{>react_format}}

{{#if context}}Context:
{{context}}{{/if}}`,
      "1.0.0"
    )
  )
  .register(
    new PromptTemplate(
      "writer_agent",
      `You are an expert content writer specialising in {{contentType}}.

Goal: {{goal}}

{{#if tone}}Tone: {{tone}}{{/if}}
{{#if audience}}Target audience: {{audience}}{{/if}}
{{#if wordCount}}Target word count: {{wordCount}}{{/if}}

{{#if outline}}Follow this outline:
{{outline}}{{/if}}

Write the content now. Be specific, engaging, and informative.`,
      "1.0.0"
    )
  )
  .register(
    new PromptTemplate(
      "reviewer_agent",
      `You are a {{reviewType}} content reviewer.

Content to review:
---
{{content}}
---

{{>content_reviewer_base}}

Focus on {{reviewFocus}}.

{{>structured_output}}`,
      "1.0.0"
    )
  )
  .register(
    new PromptTemplate(
      "lead_agent_decompose",
      `You are a Lead Agent orchestrating a team of AI specialists.

High-level goal: {{goal}}

Available agent types: writer, reviewer, editor, research, community, growth

Decompose this goal into specific sub-tasks. Return a JSON array of tasks:
[
  {
    "id": "task-1",
    "agentType": "research",
    "goal": "...",
    "dependsOn": []
  }
]

Keep each task focused and independently executable.`,
      "1.0.0"
    )
  )
  .register(
    new PromptTemplate(
      "lead_agent_synthesize",
      `You are a Lead Agent. You have delegated sub-tasks and collected results.

Original goal: {{goal}}

Sub-task results:
{{#each results as result}}
Task {{result.taskId}} ({{result.agentType}}):
{{result.output}}
---
{{/each}}

Synthesise these results into a cohesive final output that directly addresses the original goal.`,
      "1.0.0"
    )
  );
