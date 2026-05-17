"use node";

/**
 * Agent Runtime — Lead Agent
 *
 * The orchestrator agent that:
 * 1. Receives tasks from humans or the workflow engine
 * 2. Decomposes tasks and delegates to specialized agents
 * 3. Monitors progress across delegated tasks
 * 4. Aggregates results from sub-agents
 * 5. Handles escalation when sub-agents are stuck
 * 6. Communicates status back to humans
 *
 * The Lead Agent is the ONLY agent that communicates directly
 * with humans (via ask_human action). All other agents communicate
 * through the Lead Agent using the communication protocol.
 *
 * Architecture:
 * - Extends PlanExecuteAgent (plan tasks, then delegate execution)
 * - Uses MessageRouter for inter-agent communication
 * - Manages a registry of available sub-agents
 * - Tracks delegation state and aggregates results
 *
 * Phase 7.6.1 — Lead Agent
 */

import { PlanExecuteAgent } from "./planExecuteAgent";
import type { LLMCallFn, ToolExecutorFn } from "./agentBase";
import type {
  AgentConfig,
  AgentContext,
  AgentExecutionState,
  AgentMessage,
  AgentStep,
} from "./types";
import { MessageRouter, createTaskDelegation } from "./communication";
import type { AgentCommunicationMessage, StatusUpdatePayload } from "./communication";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Registration info for a sub-agent the Lead can delegate to. */
export interface SubAgentRegistration {
  /** Agent ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this agent specializes in */
  description: string;
  /** Capabilities/skills */
  capabilities: string[];
  /** Whether this agent is currently available */
  available: boolean;
}

/** Configuration specific to the Lead Agent. */
export interface LeadAgentConfig {
  /** Available sub-agents for delegation */
  subAgents: SubAgentRegistration[];
  /** Maximum number of parallel delegations */
  maxParallelDelegations?: number;
  /** Timeout for sub-agent responses (ms). 0 or undefined = no timeout. */
  delegationTimeoutMs?: number;
  /** Whether to escalate to human when a sub-agent times out (default: true) */
  autoEscalateOnTimeout?: boolean;
}

/** State of a delegated task. */
export interface DelegationState {
  /** The message that delegated the task */
  messageId: string;
  /** Agent the task was delegated to */
  agentId: string;
  /** Task description */
  task: string;
  /** Current status */
  status: "pending" | "in_progress" | "completed" | "failed" | "timed_out";
  /** Result from the sub-agent (if completed) */
  result?: unknown;
  /** Error (if failed) */
  error?: string;
  /** When the delegation was created */
  createdAt: number;
  /** When the delegation was completed */
  completedAt?: number;
}

/** Result of the Lead Agent's orchestration. */
export interface OrchestrationResult {
  /** Final aggregated output */
  output: unknown;
  /** All delegations made */
  delegations: DelegationState[];
  /** Messages exchanged */
  messageHistory: AgentCommunicationMessage[];
  /** Whether human escalation was needed */
  escalated: boolean;
  /** Escalation details (if escalated) */
  escalationReason?: string;
  /** Total cost across all agents */
  totalCost: number;
  /** Total duration */
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Lead Agent Class
// ---------------------------------------------------------------------------

/**
 * The Lead Agent orchestrates multi-agent collaboration.
 *
 * Execution flow:
 * 1. Analyze the goal and determine which sub-agents are needed
 * 2. Create a delegation plan (which agent does what, in what order)
 * 3. Delegate tasks via the communication protocol
 * 4. Process sub-agent responses (handle reviews, revisions, etc.)
 * 5. Aggregate results into a final output
 * 6. Escalate to human if needed
 */
export class LeadAgent extends PlanExecuteAgent {
  private leadConfig: LeadAgentConfig;
  private router: MessageRouter;
  private delegations: DelegationState[] = [];
  private subAgentExecutor?: SubAgentExecutorFn;

  constructor(agentConfig: AgentConfig, leadConfig: LeadAgentConfig) {
    super(agentConfig);
    this.leadConfig = leadConfig;
    this.router = new MessageRouter();
  }

  /**
   * Orchestrates a multi-agent task.
   *
   * This is the primary entry point for the Lead Agent. It:
   * 1. Plans the delegation strategy
   * 2. Delegates to sub-agents (parallel where possible)
   * 3. Processes results
   * 4. Returns the aggregated output
   */
  async orchestrate(
    context: AgentContext,
    llmCall: LLMCallFn,
    toolExecutor: ToolExecutorFn,
    subAgentExecutor: SubAgentExecutorFn
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    this.subAgentExecutor = subAgentExecutor;
    let totalCost = 0;
    let escalated = false;
    let escalationReason: string | undefined;

    try {
      // 1. Analyze the goal and create delegation plan
      const plan = await this.createDelegationPlan(context, llmCall);
      totalCost += plan.cost;

      // 2. Execute delegations in batches (respecting dependencies and parallelism)
      const maxParallel = this.leadConfig.maxParallelDelegations ?? 3;
      const completed = new Set<string>();
      const remaining = [...plan.delegations];

      while (remaining.length > 0) {
        // Find delegations whose dependencies are satisfied
        const ready = remaining.filter((d) => {
          if (!d.dependsOn || d.dependsOn.length === 0) return true;
          return d.dependsOn.every((dep) => completed.has(dep));
        });

        if (ready.length === 0 && remaining.length > 0) {
          // Circular dependency or unresolvable — escalate
          escalated = true;
          escalationReason = `Unresolvable dependencies in delegation plan: ${remaining.map((d) => d.agentId).join(", ")}`;
          break;
        }

        // Take up to maxParallel from the ready set
        const batch = ready.slice(0, maxParallel);

        // Execute batch in parallel with timeout enforcement
        const batchResults = await Promise.all(
          batch.map((delegation) =>
            this.executeDelegationWithTimeout(delegation, context, subAgentExecutor)
          )
        );

        // Process batch results
        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          totalCost += result.cost;

          if (result.escalated) {
            escalated = true;
            escalationReason = result.escalationReason;
            break;
          }

          // Mark as completed for dependency resolution
          completed.add(batch[i].agentId);
          // Remove from remaining
          const idx = remaining.indexOf(batch[i]);
          if (idx !== -1) remaining.splice(idx, 1);
        }

        if (escalated) break;
      }

      // 3. Aggregate results
      const output = await this.aggregateResults(llmCall, context);
      totalCost += output.cost;

      return {
        output: output.result,
        delegations: this.delegations,
        messageHistory: this.router.getHistory(),
        escalated,
        escalationReason,
        totalCost,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        output: null,
        delegations: this.delegations,
        messageHistory: this.router.getHistory(),
        escalated: true,
        escalationReason: error instanceof Error ? error.message : String(error),
        totalCost,
        totalDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Standard execute() for use in the workflow engine.
   * Wraps orchestrate() in the AgentBase execution pattern.
   */
  async execute(
    context: AgentContext,
    llmCall: LLMCallFn,
    toolExecutor: ToolExecutorFn
  ): Promise<AgentExecutionState> {
    const startTime = Date.now();
    this.state = this.createInitialState(context.goal);
    this.state.status = "thinking";

    // If no sub-agent executor is provided, fall back to plan-execute
    if (!this.subAgentExecutor) {
      return super.execute(context, llmCall, toolExecutor);
    }

    try {
      const result = await this.orchestrate(context, llmCall, toolExecutor, this.subAgentExecutor);

      const step: AgentStep = {
        iteration: 1,
        thought: `Orchestrated ${this.delegations.length} delegations across ${new Set(this.delegations.map((d) => d.agentId)).size} agents`,
        action: {
          type: "final_answer",
          content:
            typeof result.output === "string" ? result.output : JSON.stringify(result.output),
          format: "json",
        },
        timestamp: Date.now(),
        durationMs: result.totalDurationMs,
        cost: result.totalCost,
      };

      this.state.steps.push(step);
      this.state.currentIteration = 1;
      this.state.totalCost = result.totalCost;

      if (result.escalated) {
        this.state.status = "complete";
        this.state.output = {
          needsHumanInput: true,
          reason: result.escalationReason,
          partialResult: result.output,
        };
      } else {
        this.state.status = "complete";
        this.state.output = result.output;
      }
    } catch (error) {
      this.state.status = "failed";
      this.state.error = error instanceof Error ? error.message : String(error);
    }

    this.state.totalDurationMs = Date.now() - startTime;
    return this.state;
  }

  /**
   * Sets the sub-agent executor function (for deferred injection).
   */
  setSubAgentExecutor(executor: SubAgentExecutorFn): void {
    this.subAgentExecutor = executor;
  }

  /**
   * Returns the message router (for inspection/testing).
   */
  getRouter(): MessageRouter {
    return this.router;
  }

  /**
   * Returns all delegations (for inspection/testing).
   */
  getDelegations(): DelegationState[] {
    return [...this.delegations];
  }

  // ---------------------------------------------------------------------------
  // Delegation Planning
  // ---------------------------------------------------------------------------

  /**
   * Creates a delegation plan by analyzing the goal and available sub-agents.
   */
  private async createDelegationPlan(
    context: AgentContext,
    llmCall: LLMCallFn
  ): Promise<{
    delegations: Array<{ agentId: string; task: string; dependsOn?: string[] }>;
    cost: number;
  }> {
    const availableAgents = this.leadConfig.subAgents.filter((a) => a.available);

    const planPrompt: AgentMessage = {
      role: "user",
      content: `You are the Lead Agent. Analyze this goal and create a delegation plan.

## Goal
${context.goal}

## Available Agents
${availableAgents.map((a) => `- **${a.id}** (${a.name}): ${a.description}\n  Capabilities: ${a.capabilities.join(", ")}`).join("\n")}

## Instructions
Determine which agents should handle which parts of this goal.
Respond with a JSON array of delegations:
[
  { "agentId": "agent_id", "task": "specific task description", "dependsOn": [] }
]

Rules:
- Only use available agents
- Each delegation should be a clear, self-contained task
- Specify dependencies if one task needs another's output
- Keep delegations focused (one agent, one task)
- If the goal can be handled by a single agent, use just one delegation`,
      timestamp: Date.now(),
    };

    const messages: AgentMessage[] = [
      {
        role: "system",
        content: this.config.systemPrompt,
        timestamp: Date.now(),
      },
      planPrompt,
    ];

    const response = await llmCall(messages, {
      temperature: 0.3,
      maxTokens: 1500,
      model: this.config.model,
      tier: this.config.modelTier,
    });

    const delegations = this.parseDelegationPlan(response.content, availableAgents);

    return { delegations, cost: response.cost };
  }

  /**
   * Parses the LLM's delegation plan response.
   */
  private parseDelegationPlan(
    content: string,
    availableAgents: SubAgentRegistration[]
  ): Array<{ agentId: string; task: string; dependsOn?: string[] }> {
    const jsonArray = this.extractJsonArray(content);
    if (!jsonArray) {
      // Fallback: single delegation to the first available agent
      if (availableAgents.length > 0) {
        return [{ agentId: availableAgents[0].id, task: content.slice(0, 200) }];
      }
      return [];
    }

    // Validate agent IDs
    const validIds = new Set(availableAgents.map((a) => a.id));
    const items = jsonArray as Array<Record<string, unknown>>;
    return items
      .filter((d) => {
        const agentId = d.agentId as string | undefined;
        const task = d.task as string | undefined;
        return agentId && task && validIds.has(agentId);
      })
      .map((d) => ({
        agentId: d.agentId as string,
        task: d.task as string,
        dependsOn: d.dependsOn as string[] | undefined,
      }));
  }

  /**
   * Extracts the first valid JSON array from LLM output.
   *
   * Strategy: find each `[` in the content and attempt to parse from
   * that position to each subsequent `]`. Returns the first successful
   * parse that yields an array. This handles cases where the LLM appends
   * text containing brackets after the JSON (e.g., "Note: [agent] is...").
   */
  private extractJsonArray(content: string): unknown[] | null {
    let searchFrom = 0;
    while (searchFrom < content.length) {
      const openIdx = content.indexOf("[", searchFrom);
      if (openIdx === -1) break;

      // Try each closing bracket from the nearest to the farthest
      let closeSearch = openIdx + 1;
      while (closeSearch < content.length) {
        const closeIdx = content.indexOf("]", closeSearch);
        if (closeIdx === -1) break;

        const candidate = content.slice(openIdx, closeIdx + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {
          // Not valid JSON yet — try the next `]`
        }
        closeSearch = closeIdx + 1;
      }

      // This `[` didn't lead to a valid array — try the next one
      searchFrom = openIdx + 1;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Delegation Execution
  // ---------------------------------------------------------------------------

  /**
   * Executes a single delegation with timeout enforcement.
   * If delegationTimeoutMs is configured, the sub-agent call is raced
   * against a timeout. On timeout, the delegation is marked as timed_out
   * and escalation is triggered (if autoEscalateOnTimeout is true).
   */
  private async executeDelegationWithTimeout(
    delegation: { agentId: string; task: string; dependsOn?: string[] },
    context: AgentContext,
    subAgentExecutor: SubAgentExecutorFn
  ): Promise<{ cost: number; escalated: boolean; escalationReason?: string }> {
    let cost = 0;

    // Send delegation message
    const message = this.router.send(
      this.config.id,
      delegation.agentId,
      "task_delegation",
      createTaskDelegation(delegation.task, {
        context: context.input,
      }),
      {
        priority: "normal",
        deadline: this.leadConfig.delegationTimeoutMs
          ? Date.now() + this.leadConfig.delegationTimeoutMs
          : undefined,
      }
    );

    // Track the delegation
    const delegationState: DelegationState = {
      messageId: message.id,
      agentId: delegation.agentId,
      task: delegation.task,
      status: "in_progress",
      createdAt: Date.now(),
    };
    this.delegations.push(delegationState);

    // Execute the sub-agent with timeout enforcement
    try {
      const timeoutMs = this.leadConfig.delegationTimeoutMs;
      let result: SubAgentResult;

      if (timeoutMs && timeoutMs > 0) {
        // Race the sub-agent against a timeout
        result = await Promise.race([
          subAgentExecutor(delegation.agentId, delegation.task, context),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("DELEGATION_TIMEOUT")), timeoutMs)
          ),
        ]);
      } else {
        result = await subAgentExecutor(delegation.agentId, delegation.task, context);
      }

      cost += result.cost;

      if (result.success) {
        delegationState.status = "completed";
        delegationState.result = result.output;
        delegationState.completedAt = Date.now();

        // Send status update back
        this.router.send(
          delegation.agentId,
          this.config.id,
          "status_update",
          {
            kind: "status_update",
            status: "completed",
            description: `Task completed: ${delegation.task}`,
            partialOutput:
              typeof result.output === "string"
                ? result.output.slice(0, 500)
                : JSON.stringify(result.output).slice(0, 500),
          } satisfies StatusUpdatePayload,
          { inReplyTo: message.id }
        );
      } else {
        // Sub-agent returned failure — always escalate
        delegationState.status = "failed";
        delegationState.error = result.error;

        return {
          cost,
          escalated: true,
          escalationReason: `Sub-agent ${delegation.agentId} failed: ${result.error}`,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg === "DELEGATION_TIMEOUT") {
        // Timeout — mark as timed_out
        delegationState.status = "timed_out";
        delegationState.error = `Timed out after ${this.leadConfig.delegationTimeoutMs}ms`;

        if (this.leadConfig.autoEscalateOnTimeout) {
          return {
            cost,
            escalated: true,
            escalationReason: `Sub-agent ${delegation.agentId} timed out after ${this.leadConfig.delegationTimeoutMs}ms`,
          };
        }
        // If autoEscalateOnTimeout is false, continue without this result
      } else {
        // Unexpected error — always escalate
        delegationState.status = "failed";
        delegationState.error = errorMsg;

        return {
          cost,
          escalated: true,
          escalationReason: `Sub-agent ${delegation.agentId} threw an error: ${errorMsg}`,
        };
      }
    }

    return { cost, escalated: false };
  }

  // ---------------------------------------------------------------------------
  // Result Aggregation
  // ---------------------------------------------------------------------------

  /**
   * Aggregates results from all completed delegations into a final output.
   */
  private async aggregateResults(
    llmCall: LLMCallFn,
    context: AgentContext
  ): Promise<{ result: unknown; cost: number }> {
    const completedDelegations = this.delegations.filter((d) => d.status === "completed");

    if (completedDelegations.length === 0) {
      return { result: null, cost: 0 };
    }

    // If only one delegation, return its result directly
    if (completedDelegations.length === 1) {
      return { result: completedDelegations[0].result, cost: 0 };
    }

    // Multiple results — ask LLM to aggregate
    const aggregatePrompt: AgentMessage = {
      role: "user",
      content: `You are the Lead Agent. Aggregate these results from sub-agents into a cohesive final output.

## Original Goal
${context.goal}

## Results from Sub-Agents
${completedDelegations.map((d) => `### ${d.agentId} — "${d.task}"\n${typeof d.result === "string" ? d.result : JSON.stringify(d.result, null, 2)}`).join("\n\n")}

## Instructions
Combine these results into a single, coherent output that fulfills the original goal.
If results conflict, note the conflict and use the most reliable information.
Output the final aggregated result.`,
      timestamp: Date.now(),
    };

    const messages: AgentMessage[] = [
      { role: "system", content: this.config.systemPrompt, timestamp: Date.now() },
      aggregatePrompt,
    ];

    const response = await llmCall(messages, {
      temperature: 0.3,
      maxTokens: 4096,
      model: this.config.model,
      tier: this.config.modelTier,
    });

    return { result: response.content, cost: response.cost };
  }
}

// ---------------------------------------------------------------------------
// Function Types
// ---------------------------------------------------------------------------

/** Function type for executing a sub-agent. */
export type SubAgentExecutorFn = (
  agentId: string,
  task: string,
  parentContext: AgentContext
) => Promise<SubAgentResult>;

/** Result from a sub-agent execution. */
export interface SubAgentResult {
  success: boolean;
  output?: unknown;
  error?: string;
  cost: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Lead Agent with sensible defaults.
 */
export function createLeadAgent(
  id: string,
  subAgents: SubAgentRegistration[],
  options?: {
    systemPrompt?: string;
    model?: string;
    maxParallelDelegations?: number;
    delegationTimeoutMs?: number;
    autoEscalateOnTimeout?: boolean;
  }
): LeadAgent {
  const agentConfig: AgentConfig = {
    id,
    name: "Lead Agent",
    description: "Orchestrates multi-agent collaboration, delegates tasks, and aggregates results",
    systemPrompt:
      options?.systemPrompt ??
      `You are the Lead Agent — the orchestrator of a multi-agent system.
Your role is to:
1. Analyze goals and break them into delegatable tasks
2. Assign tasks to the most appropriate specialized agents
3. Monitor progress and handle failures
4. Aggregate results into a cohesive output
5. Escalate to humans when agents cannot resolve issues

You are the ONLY agent that communicates directly with humans.
Be concise, clear, and action-oriented in your planning.`,
    modelTier: "reasoning",
    mode: "plan_execute",
    tools: [],
    maxIterations: 15,
    temperature: 0.3,
    model: options?.model,
  };

  const leadConfig: LeadAgentConfig = {
    subAgents,
    maxParallelDelegations: options?.maxParallelDelegations ?? 3,
    delegationTimeoutMs: options?.delegationTimeoutMs ?? 120_000,
    autoEscalateOnTimeout: options?.autoEscalateOnTimeout ?? true,
  };

  return new LeadAgent(agentConfig, leadConfig);
}
