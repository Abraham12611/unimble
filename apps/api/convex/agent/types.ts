/**
 * Agent Runtime — Type Definitions
 *
 * Defines the TypeScript types for agents, tool definitions,
 * memory access, and agent execution state. Agents are built
 * on top of the Phase 6 workflow engine — they execute as
 * specialized workflow steps with a ReAct loop.
 *
 * Architecture:
 * - Agents are NOT a separate runtime — they run inside the
 *   existing workflow engine as "agent" step types
 * - The ReAct loop (think → act → observe → repeat) is the
 *   core execution pattern
 * - Tools are typed functions agents can call
 * - Memory is stored in Convex (short-term) and vector search
 *   (long-term semantic)
 *
 * Phase 7.1 — Agent Architecture
 */

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

/** Model tier for different agent tasks. */
export type AgentModelTier = "reasoning" | "generation" | "fast";

/** Agent execution mode. */
export type AgentMode = "react" | "plan_execute" | "single_shot";

/** Agent status in the system. */
export type AgentStatus = "idle" | "thinking" | "acting" | "observing" | "complete" | "failed";

/**
 * Configuration for an agent instance.
 */
export interface AgentConfig {
  /** Unique agent ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Agent's role/purpose description */
  description: string;
  /** System prompt that defines the agent's behavior */
  systemPrompt: string;
  /** Model tier to use for reasoning */
  modelTier: AgentModelTier;
  /** Specific model override (optional) */
  model?: string;
  /** Execution mode */
  mode: AgentMode;
  /** Maximum ReAct loop iterations (default: 10) */
  maxIterations?: number;
  /** Temperature for LLM calls (default: 0.7) */
  temperature?: number;
  /** Tools this agent can use (tool IDs) */
  tools: string[];
  /** Memory categories to inject into context */
  memoryCategories?: string[];
  /** Maximum tokens for response generation */
  maxTokens?: number;
  /** Whether to stream responses */
  streaming?: boolean;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** JSON Schema type for tool parameters. */
export interface ToolParameterSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      enum?: string[];
      items?: { type: string };
      default?: unknown;
    }
  >;
  required?: string[];
}

/**
 * Definition of a tool that agents can call.
 */
export interface ToolDefinition {
  /** Unique tool ID (e.g., "perplexity.search", "memory.read") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description shown to the agent for tool selection */
  description: string;
  /** Category for grouping */
  category: ToolCategory;
  /** Parameter schema (JSON Schema format for LLM function calling) */
  parameters: ToolParameterSchema;
  /** Whether this tool requires specific integrations */
  requiresIntegration?: string;
}

export type ToolCategory =
  | "research"
  | "content"
  | "social"
  | "memory"
  | "analytics"
  | "communication"
  | "code"
  | "utility";

/**
 * Result of a tool execution.
 */
export interface ToolResult {
  /** Whether the tool call succeeded */
  success: boolean;
  /** The tool's output data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution time in ms */
  durationMs: number;
  /** Cost if applicable (e.g., LLM calls within tools) */
  cost?: number;
}

// ---------------------------------------------------------------------------
// Agent execution state
// ---------------------------------------------------------------------------

/**
 * A single step in the agent's ReAct loop.
 */
export interface AgentStep {
  /** Step number (1-indexed) */
  iteration: number;
  /** Agent's reasoning/thought */
  thought: string;
  /** Action taken (tool call or final answer) */
  action: AgentAction;
  /** Observation from the action */
  observation?: string;
  /** Timestamp */
  timestamp: number;
  /** Duration of this step in ms */
  durationMs: number;
  /** Cost of this step */
  cost: number;
}

/**
 * An action the agent decides to take.
 */
export type AgentAction =
  | { type: "tool_call"; toolId: string; params: Record<string, unknown> }
  | { type: "final_answer"; content: string; format?: "text" | "json" | "markdown" }
  | { type: "delegate"; agentId: string; task: string }
  | { type: "ask_human"; question: string; context?: string };

/**
 * The full execution state of an agent run.
 */
export interface AgentExecutionState {
  /** Agent config used for this run */
  agentId: string;
  /** Current status */
  status: AgentStatus;
  /** The goal/task the agent is working on */
  goal: string;
  /** Steps taken so far */
  steps: AgentStep[];
  /** Current iteration number */
  currentIteration: number;
  /** Total cost accumulated */
  totalCost: number;
  /** Total duration in ms */
  totalDurationMs: number;
  /** Final output (set when status is "complete") */
  output?: unknown;
  /** Error details (set when status is "failed") */
  error?: string;
  /** Messages history for context */
  messages: AgentMessage[];
}

/**
 * A message in the agent's conversation history.
 */
export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Tool call ID (for tool responses) */
  toolCallId?: string;
  /** Tool name (for tool responses) */
  toolName?: string;
  /** Timestamp */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Memory types
// ---------------------------------------------------------------------------

/** Memory scope determines who can access the memory. */
export type MemoryScope = "workspace" | "operator" | "agent" | "execution";

/** Memory entry stored in Convex. */
export interface MemoryEntry {
  /** Unique ID */
  id: string;
  /** Scope of this memory */
  scope: MemoryScope;
  /** Scope ID (workspace ID, operator ID, etc.) */
  scopeId: string;
  /** Category for filtering */
  category: string;
  /** The memory content */
  content: string;
  /** Embedding vector for semantic search */
  embedding?: number[];
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Importance score (0-1) */
  importance: number;
  /** When this memory was created */
  createdAt: number;
  /** When this memory was last accessed */
  lastAccessedAt?: number;
  /** Number of times accessed */
  accessCount: number;
}

// ---------------------------------------------------------------------------
// Agent context (passed to agent during execution)
// ---------------------------------------------------------------------------

/**
 * Context available to an agent during execution.
 */
export interface AgentContext {
  /** Workspace ID */
  workspaceId: string;
  /** Operator ID (if agent belongs to an operator) */
  operatorId?: string;
  /** Execution ID (workflow execution this agent runs in) */
  executionId?: string;
  /** The goal/task to accomplish */
  goal: string;
  /** Additional input data */
  input?: Record<string, unknown>;
  /** Available tools for this agent */
  tools: ToolDefinition[];
  /** Relevant memories injected into context */
  memories: MemoryEntry[];
  /** Agent configuration */
  config: AgentConfig;
  /** Previous execution state (for resumption) */
  previousState?: AgentExecutionState;
}
