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

  // Process conditionals first (they may contain variables)
  let result = processConditionals(templateStr, variables);

  // Process each loops
  result = processEachLoops(result, variables, usedVariables);

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
 * Processes {{#if}}, {{#unless}} conditional blocks.
 */
function processConditionals(template: string, variables: PromptVariables): string {
  let result = template;

  // Process {{#if variable}}...{{/if}} (supports nesting via iterative approach)
  // We process from innermost to outermost to handle nesting
  let changed = true;
  let iterations = 0;
  const maxIterations = 20; // Prevent infinite loops

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    // {{#if variable}}content{{else}}altContent{{/if}} — must be processed BEFORE simple if
    result = result.replace(
      /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_match, varName: string, ifContent: string, elseContent: string) => {
        changed = true;
        const value = resolveVariable(varName.trim(), variables);
        return isTruthy(value) ? ifContent : elseContent;
      }
    );

    // {{#if variable}}content{{/if}} — simple conditional (no else)
    result = result.replace(
      /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_match, varName: string, content: string) => {
        changed = true;
        const value = resolveVariable(varName.trim(), variables);
        if (isTruthy(value)) {
          return content;
        }
        return "";
      }
    );

    // {{#unless variable}}content{{/unless}}
    result = result.replace(
      /\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
      (_match, varName: string, content: string) => {
        changed = true;
        const value = resolveVariable(varName.trim(), variables);
        if (!isTruthy(value)) {
          return content;
        }
        return "";
      }
    );
  }

  return result;
}

/**
 * Processes {{#each variable}}...{{/each}} loops.
 */
function processEachLoops(
  template: string,
  variables: PromptVariables,
  usedVariables: string[]
): string {
  return template.replace(
    /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, varName: string, itemTemplate: string) => {
      const trimmedVar = varName.trim();
      const value = resolveVariable(trimmedVar, variables);

      if (!Array.isArray(value) || value.length === 0) {
        return "";
      }

      usedVariables.push(trimmedVar);

      return value
        .map((item, index) => {
          let rendered = itemTemplate;
          // Replace {{this}} with the item itself
          rendered = rendered.replace(/\{\{this\}\}/g, formatValue(item));
          // Replace {{@index}} with the index
          rendered = rendered.replace(/\{\{@index\}\}/g, String(index));
          // Replace {{@first}} / {{@last}}
          rendered = rendered.replace(/\{\{@first\}\}/g, index === 0 ? "true" : "");
          rendered = rendered.replace(/\{\{@last\}\}/g, index === value.length - 1 ? "true" : "");
          // Replace {{item.property}} for object items
          if (typeof item === "object" && item !== null) {
            rendered = rendered.replace(/\{\{this\.([^}]+)\}\}/g, (_m, prop: string) => {
              const propValue = (item as Record<string, unknown>)[prop.trim()];
              return propValue !== undefined ? formatValue(propValue) : "";
            });
          }
          return rendered;
        })
        .join("");
    }
  );
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
