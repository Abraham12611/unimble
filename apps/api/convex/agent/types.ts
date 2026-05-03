/**
 * Phase 7 — Agent Runtime: shared types.
 *
 * All types used across agent, tool, memory, and LLM modules live here.
 * No Convex runtime dependencies — safe to import anywhere.
 */

// ---------------------------------------------------------------------------
// Agent context
// ---------------------------------------------------------------------------

export interface IntegrationContext {
  provider: string;
  credentialsRef?: string;
  config?: Record<string, unknown>;
}

export interface AgentContext {
  workspaceId: string;
  executionId: string;
  stepId: string;
  userId?: string;
  operatorId?: string;
  integrations: IntegrationContext[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent results
// ---------------------------------------------------------------------------

export type AgentStatus = "completed" | "failed" | "stopped" | "max_iterations";

export interface AgentResult {
  status: AgentStatus;
  output: unknown;
  reasoning?: string;
  toolCalls: ToolCallRecord[];
  tokensUsed: number;
  estimatedCostUsd: number;
  iterations?: number;
  error?: string;
}

export interface SubTaskResult {
  taskId: string;
  agentType: string;
  result: AgentResult;
}

// ---------------------------------------------------------------------------
// LLM types
// ---------------------------------------------------------------------------

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolCallSpec {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CompletionParams {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CompletionResult {
  content: string;
  toolCalls: ToolCallSpec[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  estimatedCostUsd: number;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  model?: string;
}

export type TaskType =
  | "writing"
  | "research"
  | "review"
  | "planning"
  | "code"
  | "analysis"
  | "general";

export interface ModelConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  fallback?: string;
}

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: unknown[];
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  parameters: JSONSchema;
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCallRecord {
  toolName: string;
  params: unknown;
  result: ToolResult;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Memory types
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  role: MessageRole;
  content: string;
  tokenCount?: number;
  summary?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export type MemoryCategory =
  | "workspace"
  | "operator"
  | "preferences"
  | "patterns"
  | "content-history";

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  metadata?: Record<string, unknown>;
  score?: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Review types
// ---------------------------------------------------------------------------

export type ReviewType = "technical" | "editorial" | "factual" | "seo";

export interface ReviewIssue {
  severity: "must-fix" | "suggestion" | "info";
  description: string;
  location?: string;
}

export interface ReviewResult {
  type: ReviewType;
  score: number;
  summary: string;
  issues: ReviewIssue[];
  mustFix: ReviewIssue[];
  suggestions: ReviewIssue[];
  metadata?: Record<string, unknown>;
}

export interface AggregatedReview {
  overallScore: number;
  reviews: ReviewResult[];
  mustFix: ReviewIssue[];
  suggestions: ReviewIssue[];
  approved: boolean;
}

// ---------------------------------------------------------------------------
// Graph types (LangGraph-style)
// ---------------------------------------------------------------------------

export type NodeStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface GraphNode {
  id: string;
  type: string;
  status: NodeStatus;
  state?: unknown;
  checkpoint?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface AgentGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  currentNodeId?: string;
  checkpoint: number;
}

// ---------------------------------------------------------------------------
// Sub-task types (multi-agent)
// ---------------------------------------------------------------------------

export type AgentType =
  | "lead"
  | "writer"
  | "reviewer"
  | "editor"
  | "research"
  | "community"
  | "growth";

export interface SubTask {
  id: string;
  agentType: AgentType;
  goal: string;
  context?: Record<string, unknown>;
  dependsOn?: string[];
}
