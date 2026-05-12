/**
 * Agent Runtime — Agent Context Builder
 *
 * Builds the AgentContext that is passed to agents during execution.
 * Gathers workspace info, operator config, available tools, and
 * relevant memories to provide the agent with full situational awareness.
 *
 * This module runs as a Convex mutation (V8 runtime) to read from
 * the database. The resulting context is then passed to the agent
 * action (Node.js runtime) for execution.
 *
 * Phase 7.1.3 — Agent Context
 */

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, query } from "../_generated/server";
import { requireWorkspaceAccess } from "../lib/auth";
import type { AgentConfig, AgentContext, MemoryEntry, ToolDefinition } from "./types";

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/**
 * Builds a full AgentContext from workspace, operator, and execution data.
 * Called before agent execution to gather all necessary context.
 */
export async function buildAgentContext(
  ctx: QueryCtx | MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    operatorId?: Id<"operators">;
    executionId?: Id<"executions">;
    goal: string;
    input?: Record<string, unknown>;
    agentConfig: AgentConfig;
  }
): Promise<AgentContext> {
  // Load operator for additional context
  let operatorContext: Record<string, unknown> | undefined;
  if (args.operatorId) {
    const operator = await ctx.db.get(args.operatorId);
    if (operator) {
      operatorContext = {
        name: operator.name,
        type: operator.type,
        description: operator.description,
      };
    }
  }

  // Resolve available tools based on agent config
  const tools = resolveTools(args.agentConfig.tools);

  // Load relevant memories
  const memories = await loadRelevantMemories(ctx, {
    workspaceId: args.workspaceId,
    operatorId: args.operatorId,
    categories: args.agentConfig.memoryCategories,
  });

  return {
    workspaceId: args.workspaceId as string,
    operatorId: args.operatorId as string | undefined,
    executionId: args.executionId as string | undefined,
    goal: args.goal,
    input: {
      ...args.input,
      ...(operatorContext ? { operator: operatorContext } : {}),
    },
    tools,
    memories,
    config: args.agentConfig,
  };
}

/**
 * Internal mutation: builds agent context and returns it for the action.
 */
export const buildContext = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    operatorId: v.optional(v.id("operators")),
    executionId: v.optional(v.id("executions")),
    goal: v.string(),
    input: v.optional(v.any()),
    agentConfig: v.any(),
  },
  handler: async (ctx, args) => {
    return await buildAgentContext(ctx, {
      workspaceId: args.workspaceId,
      operatorId: args.operatorId,
      executionId: args.executionId,
      goal: args.goal,
      input: args.input as Record<string, unknown> | undefined,
      agentConfig: args.agentConfig as AgentConfig,
    });
  },
});

/**
 * Query: get agent context for display (read-only, no side effects).
 */
export const getAgentContext = query({
  args: {
    workspaceId: v.id("workspaces"),
    operatorId: v.optional(v.id("operators")),
    goal: v.string(),
    agentConfig: v.any(),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);

    return await buildAgentContext(ctx, {
      workspaceId: args.workspaceId,
      operatorId: args.operatorId,
      goal: args.goal,
      agentConfig: args.agentConfig as AgentConfig,
    });
  },
});

// ---------------------------------------------------------------------------
// Tool resolution
// ---------------------------------------------------------------------------

/**
 * Built-in tool definitions available to all agents.
 * These map to the integration modules built in Phase 5.
 */
const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    id: "perplexity.search",
    name: "Web Search",
    description:
      "Search the web for current information using Perplexity AI. Use for research, fact-checking, and finding up-to-date information.",
    category: "research",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        focus: { type: "string", description: "Focus area", enum: ["web", "academic", "news"] },
      },
      required: ["query"],
    },
  },
  {
    id: "firecrawl.scrape",
    name: "Scrape Webpage",
    description: "Extract content from a specific URL. Returns markdown text of the page content.",
    category: "research",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to scrape" },
        format: {
          type: "string",
          description: "Output format",
          enum: ["markdown", "html", "json"],
        },
      },
      required: ["url"],
    },
  },
  {
    id: "memory.read",
    name: "Read Memory",
    description:
      "Search and retrieve relevant memories. Use to recall past learnings, preferences, or context.",
    category: "memory",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for in memory" },
        category: { type: "string", description: "Memory category to filter" },
        limit: { type: "string", description: "Max results to return" },
      },
      required: ["query"],
    },
  },
  {
    id: "memory.write",
    name: "Save to Memory",
    description:
      "Store important information for future reference. Use to remember learnings, preferences, or facts.",
    category: "memory",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The information to remember" },
        category: { type: "string", description: "Category for this memory" },
        importance: { type: "string", description: "Importance score 0-1" },
      },
      required: ["content", "category"],
    },
  },
  {
    id: "llm.generate",
    name: "Generate Text",
    description:
      "Generate text content using an LLM. Use for writing, summarizing, or transforming text.",
    category: "content",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The generation prompt" },
        system: { type: "string", description: "System prompt for the generation" },
        maxTokens: { type: "string", description: "Maximum tokens to generate" },
        temperature: { type: "string", description: "Temperature (0-2)" },
      },
      required: ["prompt"],
    },
  },
  {
    id: "notification.send",
    name: "Send Notification",
    description: "Send an in-app notification to workspace members.",
    category: "communication",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Notification title" },
        message: { type: "string", description: "Notification message" },
        type: {
          type: "string",
          description: "Notification type",
          enum: ["info", "success", "warning", "error"],
        },
      },
      required: ["title", "message"],
    },
  },
];

/**
 * Resolves tool IDs to full ToolDefinition objects.
 * Supports wildcards: ["*"] returns all tools.
 */
function resolveTools(toolIds: string[]): ToolDefinition[] {
  if (toolIds.includes("*")) {
    return [...BUILT_IN_TOOLS];
  }

  return BUILT_IN_TOOLS.filter((tool) => {
    // Match exact ID or category prefix
    return toolIds.some((id) => {
      if (id === tool.id) return true;
      if (id.endsWith(".*") && tool.id.startsWith(id.slice(0, -2))) return true;
      return false;
    });
  });
}

// ---------------------------------------------------------------------------
// Memory loading
// ---------------------------------------------------------------------------

/**
 * Loads relevant memories for the agent context.
 * Currently loads from the learnings table as a simple memory store.
 * Will be extended with vector search in Phase 7.4.
 */
async function loadRelevantMemories(
  ctx: QueryCtx | MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    operatorId?: Id<"operators">;
    categories?: string[];
  }
): Promise<MemoryEntry[]> {
  // Load recent learnings as memory entries
  const learnings = await ctx.db
    .query("learnings")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .filter((q) => q.eq(q.field("status"), "active"))
    .order("desc")
    .take(20);

  return learnings.map((learning) => ({
    id: learning._id as string,
    scope: "workspace" as const,
    scopeId: args.workspaceId as string,
    category: learning.type,
    content: learning.observation,
    importance: learning.confidence,
    createdAt: learning.createdAt,
    accessCount: 0,
  }));
}
