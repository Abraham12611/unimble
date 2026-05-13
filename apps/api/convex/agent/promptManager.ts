/**
 * Agent Runtime — Prompt Management System
 *
 * Provides a structured prompt template system with:
 * - Variable interpolation ({{variable}} syntax)
 * - Conditional sections ({{#if condition}}...{{/if}})
 * - Iteration ({{#each items}}...{{/each}})
 * - Prompt versioning (track which version was used)
 * - Prompt library (reusable system prompts for agent types)
 *
 * Templates are pure functions — no side effects, no DB access.
 * This module runs in both V8 and Node.js runtimes.
 *
 * Phase 7.2.2 — Prompt Management
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Variables that can be interpolated into prompts. */
export type PromptVariables = Record<string, unknown>;

/** A versioned prompt template. */
export interface PromptTemplate {
  /** Unique template ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Template version (semver-like) */
  version: string;
  /** The template string with {{variable}} placeholders */
  template: string;
  /** Description of what this template does */
  description?: string;
  /** Required variables for this template */
  requiredVariables?: string[];
  /** Category for organization */
  category?: PromptCategory;
}

/** Categories for organizing prompts. */
export type PromptCategory =
  | "system"
  | "agent"
  | "tool"
  | "content"
  | "review"
  | "planning"
  | "custom";

/** Result of rendering a prompt template. */
export interface RenderedPrompt {
  /** The rendered prompt text */
  text: string;
  /** Template ID used */
  templateId: string;
  /** Template version used */
  version: string;
  /** Variables that were interpolated */
  usedVariables: string[];
  /** Variables that were referenced but not provided */
  missingVariables: string[];
}

// ---------------------------------------------------------------------------
// Prompt Template Engine
// ---------------------------------------------------------------------------

/**
 * Renders a prompt template with the given variables.
 *
 * Supports:
 * - `{{variable}}` — simple interpolation
 * - `{{#if variable}}...{{/if}}` — conditional sections
 * - `{{#unless variable}}...{{/unless}}` — inverse conditional
 * - `{{#each variable}}...{{/each}}` — iteration over arrays
 * - `{{variable | default:"fallback"}}` — default values
 *
 * @param template - The template string or PromptTemplate object
 * @param variables - Variables to interpolate
 * @returns RenderedPrompt with the rendered text and metadata
 */
export function renderPrompt(
  template: string | PromptTemplate,
  variables: PromptVariables = {}
): RenderedPrompt {
  const templateStr = typeof template === "string" ? template : template.template;
  const templateId = typeof template === "string" ? "inline" : template.id;
  const version = typeof template === "string" ? "1.0.0" : template.version;

  const usedVariables: string[] = [];
  const missingVariables: string[] = [];

  // Process all block structures (if/unless/each) with proper nesting
  let result = processConditionals(templateStr, variables);

  // processEachLoops is now a no-op — each is handled by processBlocks.
  // Track used each variables by scanning the original template.
  const eachVarRegex = /\{\{#each\s+([^}]+)\}\}/g;
  let eachMatch;
  while ((eachMatch = eachVarRegex.exec(templateStr)) !== null) {
    const varName = eachMatch[1].trim();
    const value = resolveVariable(varName, variables);
    if (Array.isArray(value) && value.length > 0) {
      usedVariables.push(varName);
    }
  }

  // Process variable interpolation
  result = result.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();

    // Handle default values: {{variable | default:"value"}}
    const defaultMatch = trimmed.match(/^(.+?)\s*\|\s*default:"([^"]*)"$/);
    const varName = defaultMatch ? defaultMatch[1].trim() : trimmed;
    const defaultValue = defaultMatch ? defaultMatch[2] : undefined;

    const value = resolveVariable(varName, variables);

    if (value !== undefined && value !== null) {
      usedVariables.push(varName);
      return formatValue(value);
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    missingVariables.push(varName);
    return `{{${trimmed}}}`;
  });

  // Clean up extra blank lines from removed conditionals
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  return {
    text: result,
    templateId,
    version,
    usedVariables: [...new Set(usedVariables)],
    missingVariables: [...new Set(missingVariables)],
  };
}

/**
 * Validates that a template has all required variables provided.
 * Returns an array of missing variable names (empty if valid).
 */
export function validateTemplate(template: PromptTemplate, variables: PromptVariables): string[] {
  if (!template.requiredVariables) return [];

  return template.requiredVariables.filter((varName) => {
    const value = resolveVariable(varName, variables);
    return value === undefined || value === null;
  });
}

/**
 * Extracts all variable names referenced in a template string.
 */
export function extractVariables(templateStr: string): string[] {
  const variables = new Set<string>();

  // Simple interpolation: {{variable}}
  const simpleRegex = /\{\{([^#/}][^}]*?)\}\}/g;
  let match;
  while ((match = simpleRegex.exec(templateStr)) !== null) {
    const expr = match[1].trim();
    // Strip default value syntax
    const varName = expr.replace(/\s*\|\s*default:"[^"]*"$/, "").trim();
    variables.add(varName);
  }

  // Conditional variables: {{#if variable}}
  const condRegex = /\{\{#(?:if|unless|each)\s+([^}]+)\}\}/g;
  while ((match = condRegex.exec(templateStr)) !== null) {
    variables.add(match[1].trim());
  }

  return [...variables];
}

// ---------------------------------------------------------------------------
// Internal processing
// ---------------------------------------------------------------------------

/**
 * Processes {{#if}}, {{#unless}}, and {{#each}} blocks using a
 * recursive descent parser that correctly handles nesting.
 *
 * This replaces the previous regex-based approach which failed on:
 * 1. Nested if-else blocks (lazy regex grabbed wrong {{else}}/{{/if}})
 * 2. Conditionals inside each loops (evaluated against wrong scope)
 */
function processConditionals(template: string, variables: PromptVariables): string {
  return processBlocks(template, variables);
}

/**
 * Recursive block processor. Finds the outermost block tags and
 * processes them one at a time, recursing into their content.
 */
function processBlocks(template: string, variables: PromptVariables): string {
  let result = "";
  let pos = 0;

  while (pos < template.length) {
    // Find the next block opening tag
    const nextBlock = findNextBlockOpen(template, pos);

    if (nextBlock === null) {
      // No more blocks — append the rest as-is
      result += template.slice(pos);
      break;
    }

    // Append text before the block
    result += template.slice(pos, nextBlock.start);

    // Find the matching close tag (respecting nesting)
    const blockContent = extractBlock(template, nextBlock);

    if (blockContent === null) {
      // Malformed block — append the opening tag as-is and continue
      result += template.slice(nextBlock.start, nextBlock.end);
      pos = nextBlock.end;
      continue;
    }

    // Process the block based on its type
    const processed = evaluateBlock(blockContent, variables);
    result += processed;
    pos = blockContent.closeEnd;
  }

  return result;
}

interface BlockOpen {
  type: "if" | "unless" | "each";
  varName: string;
  start: number; // start of {{#...}}
  end: number; // end of {{#...}} (after }})
}

interface BlockContent {
  type: "if" | "unless" | "each";
  varName: string;
  /** Content of the "if" branch (or the only branch for unless/each) */
  mainContent: string;
  /** Content of the "else" branch (only for if blocks) */
  elseContent: string | null;
  /** Position after the closing tag */
  closeEnd: number;
}

/**
 * Finds the next {{#if}}, {{#unless}}, or {{#each}} opening tag.
 */
function findNextBlockOpen(template: string, fromPos: number): BlockOpen | null {
  const regex = /\{\{#(if|unless|each)\s+([^}]+)\}\}/g;
  regex.lastIndex = fromPos;
  const match = regex.exec(template);
  if (!match) return null;

  return {
    type: match[1] as "if" | "unless" | "each",
    varName: match[2].trim(),
    start: match.index,
    end: match.index + match[0].length,
  };
}

/**
 * Extracts a complete block (including nested blocks) by counting
 * open/close tags to find the matching close tag.
 *
 * Also finds the {{else}} at the correct nesting level for if blocks.
 */
function extractBlock(template: string, open: BlockOpen): BlockContent | null {
  const closeTag = `{{/${open.type}}}`;
  const openPattern = new RegExp(`\\{\\{#${open.type}\\s+[^}]+\\}\\}`, "g");

  let depth = 1;
  let pos = open.end;
  let elsePos: number | null = null;

  while (pos < template.length && depth > 0) {
    // Check for nested open of the same type
    openPattern.lastIndex = pos;
    const nextOpen = openPattern.exec(template);

    // Check for close tag
    const nextClose = template.indexOf(closeTag, pos);

    // Check for {{else}} at current depth (only for if blocks)
    let nextElse = -1;
    if (open.type === "if" && depth === 1 && elsePos === null) {
      nextElse = template.indexOf("{{else}}", pos);
    }

    if (nextClose === -1) {
      // No matching close tag found — malformed
      return null;
    }

    // Determine which comes first: nested open, else, or close
    const nextOpenPos = nextOpen ? nextOpen.index : Infinity;

    if (nextOpenPos < nextClose) {
      // Nested open comes first — increase depth
      depth++;
      pos = nextOpenPos + nextOpen![0].length;
    } else if (nextElse !== -1 && nextElse < nextClose && depth === 1) {
      // {{else}} at our level comes before close
      elsePos = nextElse;
      pos = nextElse + "{{else}}".length;
    } else {
      // Close tag
      depth--;
      if (depth === 0) {
        const mainContent =
          elsePos !== null
            ? template.slice(open.end, elsePos)
            : template.slice(open.end, nextClose);
        const elseContent =
          elsePos !== null ? template.slice(elsePos + "{{else}}".length, nextClose) : null;

        return {
          type: open.type,
          varName: open.varName,
          mainContent,
          elseContent,
          closeEnd: nextClose + closeTag.length,
        };
      }
      pos = nextClose + closeTag.length;
    }
  }

  return null;
}

/**
 * Evaluates a block based on its type and the current variables.
 */
function evaluateBlock(block: BlockContent, variables: PromptVariables): string {
  switch (block.type) {
    case "if": {
      const value = resolveVariable(block.varName, variables);
      const content = isTruthy(value) ? block.mainContent : (block.elseContent ?? "");
      // Recurse into the chosen branch to handle nested blocks
      return processBlocks(content, variables);
    }
    case "unless": {
      const value = resolveVariable(block.varName, variables);
      const content = !isTruthy(value) ? block.mainContent : (block.elseContent ?? "");
      return processBlocks(content, variables);
    }
    case "each": {
      return evaluateEachBlock(block, variables);
    }
  }
}

/**
 * Evaluates an {{#each}} block, processing conditionals inside
 * each iteration with the item's properties in scope.
 */
function evaluateEachBlock(block: BlockContent, variables: PromptVariables): string {
  const value = resolveVariable(block.varName, variables);

  if (!Array.isArray(value) || value.length === 0) {
    return "";
  }

  return value
    .map((item, index) => {
      let rendered = block.mainContent;

      // Replace loop metadata variables (these are unique to each and safe to replace globally)
      rendered = rendered.replace(/\{\{@index\}\}/g, String(index));
      rendered = rendered.replace(/\{\{@first\}\}/g, index === 0 ? "true" : "");
      rendered = rendered.replace(/\{\{@last\}\}/g, index === value.length - 1 ? "true" : "");

      // Replace {{this}} (the whole item) only at the current level.
      // We must NOT replace {{this}} or {{this.x}} inside nested {{#each}} blocks
      // because those refer to the inner loop's item.
      rendered = replaceThisAtCurrentLevel(rendered, item);

      // Process nested blocks ({{#if}}, {{#each}}) with item in scope.
      // Create a merged scope: outer variables + "this" pointing to item.
      const itemScope: PromptVariables = {
        ...variables,
        this: item as PromptVariables,
      };
      rendered = processBlocks(rendered, itemScope);

      return rendered;
    })
    .join("");
}

/**
 * Replaces {{this}} and {{this.property}} only at the current nesting level.
 * Does NOT replace inside nested {{#each}} blocks (those have their own scope).
 */
function replaceThisAtCurrentLevel(template: string, item: unknown): string {
  // Split the template into segments: outside nested each blocks vs inside them
  let result = "";
  let pos = 0;
  const eachOpenRegex = /\{\{#each\s+[^}]+\}\}/g;

  while (pos < template.length) {
    // Find next nested {{#each}}
    eachOpenRegex.lastIndex = pos;
    const nextEach = eachOpenRegex.exec(template);

    if (!nextEach) {
      // No more nested each — process the rest at current level
      result += replaceThisInSegment(template.slice(pos), item);
      break;
    }

    // Process text before the nested each
    result += replaceThisInSegment(template.slice(pos, nextEach.index), item);

    // Find the matching {{/each}} for this nested block
    const closeTag = "{{/each}}";
    let depth = 1;
    let searchPos = nextEach.index + nextEach[0].length;

    while (depth > 0 && searchPos < template.length) {
      const nextOpen = template.indexOf("{{#each", searchPos);
      const nextClose = template.indexOf(closeTag, searchPos);

      if (nextClose === -1) break; // malformed — bail

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        searchPos = nextOpen + 7; // skip past "{{#each"
      } else {
        depth--;
        if (depth === 0) {
          // Include the entire nested each block as-is (will be processed later)
          result += template.slice(nextEach.index, nextClose + closeTag.length);
          pos = nextClose + closeTag.length;
        } else {
          searchPos = nextClose + closeTag.length;
        }
      }
    }

    if (depth > 0) {
      // Malformed — include rest as-is
      result += template.slice(nextEach.index);
      pos = template.length;
    }
  }

  return result;
}

/**
 * Replaces {{this}} and {{this.property}} in a segment (no nested each blocks).
 */
function replaceThisInSegment(segment: string, item: unknown): string {
  // Replace {{this}} with the whole item
  let result = segment.replace(/\{\{this\}\}/g, formatValue(item));

  // Replace {{this.property}} for object items
  if (typeof item === "object" && item !== null) {
    result = result.replace(/\{\{this\.([^}]+)\}\}/g, (_m, prop: string) => {
      const propValue = (item as Record<string, unknown>)[prop.trim()];
      return propValue !== undefined ? formatValue(propValue) : "";
    });
  }

  return result;
}

/**
 * Resolves a variable name from the variables object.
 * Supports dot notation: "user.name" → variables.user.name
 */
function resolveVariable(name: string, variables: PromptVariables): unknown {
  const parts = name.split(".");
  let current: unknown = variables;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Formats a value for insertion into a prompt string.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  return JSON.stringify(value);
}

/**
 * Determines if a value is "truthy" for conditional evaluation.
 */
function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value === false || value === 0 || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Prompt Library — Reusable system prompts for agent types
// ---------------------------------------------------------------------------

/**
 * Built-in prompt templates for common agent patterns.
 * These can be extended or overridden by workspace-specific prompts.
 */
export const PROMPT_LIBRARY: Record<string, PromptTemplate> = {
  // --- Agent System Prompts ---

  "agent.content-writer": {
    id: "agent.content-writer",
    name: "Content Writer Agent",
    version: "1.0.0",
    category: "agent",
    description: "System prompt for content creation agents",
    requiredVariables: ["agentName", "contentType"],
    template: `You are {{agentName}}, an expert content writer specializing in {{contentType}}.

## Your Capabilities
- Research topics thoroughly before writing
- Create engaging, well-structured content
- Adapt tone and style to the target audience
- Optimize for SEO and readability
{{#if brandVoice}}

## Brand Voice
{{brandVoice}}
{{/if}}
{{#if targetAudience}}

## Target Audience
{{targetAudience}}
{{/if}}
{{#if contentGuidelines}}

## Content Guidelines
{{contentGuidelines}}
{{/if}}

## Instructions
- Always research before writing
- Use clear, concise language
- Include relevant examples and data
- Structure content with headers and sections
- Cite sources when making factual claims`,
  },

  "agent.researcher": {
    id: "agent.researcher",
    name: "Research Agent",
    version: "1.0.0",
    category: "agent",
    description: "System prompt for research and analysis agents",
    requiredVariables: ["agentName", "domain"],
    template: `You are {{agentName}}, a research specialist in {{domain}}.

## Your Capabilities
- Search the web for current information
- Analyze and synthesize multiple sources
- Identify trends and patterns
- Provide evidence-based insights
{{#if researchFocus}}

## Research Focus
{{researchFocus}}
{{/if}}

## Instructions
- Verify information from multiple sources
- Distinguish between facts and opinions
- Note the recency and reliability of sources
- Summarize findings clearly and concisely
- Flag any conflicting information`,
  },

  "agent.community-manager": {
    id: "agent.community-manager",
    name: "Community Manager Agent",
    version: "1.0.0",
    category: "agent",
    description: "System prompt for community engagement agents",
    requiredVariables: ["agentName", "communityName"],
    template: `You are {{agentName}}, the community manager for {{communityName}}.

## Your Capabilities
- Monitor community channels for questions and discussions
- Provide helpful, friendly responses
- Escalate complex issues to humans
- Track community sentiment and trends
{{#if communityGuidelines}}

## Community Guidelines
{{communityGuidelines}}
{{/if}}
{{#if tone}}

## Tone
{{tone}}
{{else}}

## Tone
Friendly, helpful, and professional. Be approachable but knowledgeable.
{{/if}}

## Instructions
- Respond promptly to community questions
- Be empathetic and understanding
- Provide accurate technical information
- Know when to escalate to a human
- Never share confidential information`,
  },

  "agent.reviewer": {
    id: "agent.reviewer",
    name: "Content Reviewer Agent",
    version: "1.0.0",
    category: "review",
    description: "System prompt for content review and quality assurance",
    requiredVariables: ["agentName", "reviewType"],
    template: `You are {{agentName}}, a {{reviewType}} reviewer.

## Review Criteria
{{#if criteria}}
{{#each criteria}}
- {{this}}
{{/each}}
{{else}}
- Accuracy and factual correctness
- Clarity and readability
- Tone and voice consistency
- Grammar and spelling
- Structure and flow
{{/if}}

## Scoring
Rate each criterion on a scale of 1-10.
Provide specific, actionable feedback for improvements.
{{#if passingScore}}
Minimum passing score: {{passingScore}}/10
{{/if}}

## Instructions
- Be constructive, not destructive
- Provide specific examples for each issue
- Suggest concrete improvements
- Acknowledge what works well
- Flag any factual errors or inconsistencies`,
  },

  "agent.planner": {
    id: "agent.planner",
    name: "Planning Agent",
    version: "1.0.0",
    category: "planning",
    description: "System prompt for task planning and decomposition",
    requiredVariables: ["agentName"],
    template: `You are {{agentName}}, a strategic planning agent.

## Your Role
Break down complex goals into actionable steps that can be executed
by specialized agents or tools.

## Planning Approach
1. Understand the goal completely
2. Identify required information and resources
3. Break into sequential or parallel steps
4. Assign each step to the appropriate tool or agent
5. Define success criteria for each step
{{#if constraints}}

## Constraints
{{#each constraints}}
- {{this}}
{{/each}}
{{/if}}
{{#if availableAgents}}

## Available Agents
{{#each availableAgents}}
- **{{this.name}}**: {{this.description}}
{{/each}}
{{/if}}

## Instructions
- Create clear, unambiguous step descriptions
- Consider dependencies between steps
- Include error handling and fallback paths
- Estimate effort/time for each step
- Prioritize steps by importance and urgency`,
  },

  // --- Tool-specific prompts ---

  "tool.json-output": {
    id: "tool.json-output",
    name: "JSON Output Format",
    version: "1.0.0",
    category: "tool",
    description: "Instruction to produce JSON output matching a schema",
    requiredVariables: ["schema"],
    template: `Respond with valid JSON matching this schema:

\`\`\`json
{{schema}}
\`\`\`

Rules:
- Output ONLY valid JSON, no markdown fences or explanation
- All required fields must be present
- Use null for optional fields you cannot determine
{{#if example}}

Example:
\`\`\`json
{{example}}
\`\`\`
{{/if}}`,
  },

  "tool.summarize": {
    id: "tool.summarize",
    name: "Summarization Prompt",
    version: "1.0.0",
    category: "tool",
    description: "Prompt for summarizing content",
    requiredVariables: ["content"],
    template: `Summarize the following content{{#if maxLength}} in {{maxLength}} words or less{{/if}}:

---
{{content}}
---
{{#if focus}}

Focus on: {{focus}}
{{/if}}
{{#if format}}

Format: {{format}}
{{else}}

Provide a concise summary capturing the key points.
{{/if}}`,
  },
};

/**
 * Retrieves a prompt template from the library by ID.
 * Returns undefined if not found.
 */
export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_LIBRARY[id];
}

/**
 * Lists all available prompt templates, optionally filtered by category.
 */
export function listPromptTemplates(category?: PromptCategory): PromptTemplate[] {
  const templates = Object.values(PROMPT_LIBRARY);
  if (!category) return templates;
  return templates.filter((t) => t.category === category);
}

/**
 * Creates a custom prompt template (for workspace-specific prompts).
 * Does NOT persist — caller is responsible for storage.
 */
export function createPromptTemplate(
  id: string,
  name: string,
  template: string,
  options?: {
    version?: string;
    description?: string;
    category?: PromptCategory;
    requiredVariables?: string[];
  }
): PromptTemplate {
  return {
    id,
    name,
    version: options?.version ?? "1.0.0",
    template,
    description: options?.description,
    category: options?.category ?? "custom",
    requiredVariables: options?.requiredVariables ?? extractVariables(template),
  };
}
