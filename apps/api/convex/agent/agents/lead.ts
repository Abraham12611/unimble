/**
 * Phase 7 — Agent Runtime: LeadAgent.
 *
 * The Lead Agent is the single human-facing interface for multi-agent workflows.
 * It:
 *   1. Decomposes a high-level goal into typed sub-tasks (via LLM)
 *   2. Delegates each sub-task to the appropriate specialist agent
 *   3. Runs independent tasks in parallel; respects dependsOn ordering
 *   4. Synthesises all results into a final structured output
 */

import type {
  AgentContext,
  AgentResult,
  AgentType,
  SubTask,
  SubTaskResult,
} from "../types";
import type { OpenRouterClient } from "../llm";
import type { AgentLogger } from "./base";
import { Agent, silentLogger } from "./base";
import { extractJson } from "../parser";
import { WriterAgent, ResearchAgent, EditorAgent, CommunityAgent, GrowthAgent } from "./writer";
import { ReviewerAgent } from "./reviewer";
import type { ReviewType } from "../types";

// ---------------------------------------------------------------------------
// Sub-agent factory
// ---------------------------------------------------------------------------

function createAgent(
  agentType: AgentType,
  llm: OpenRouterClient,
  logger?: AgentLogger
): Agent {
  switch (agentType) {
    case "writer":
      return new WriterAgent(llm, logger);
    case "research":
      return new ResearchAgent(llm, logger);
    case "editor":
      return new EditorAgent(llm, logger);
    case "community":
      return new CommunityAgent(llm, logger);
    case "growth":
      return new GrowthAgent(llm, logger);
    case "reviewer":
      return new ReviewerAgent(llm, "editorial", logger);
    default:
      return new WriterAgent(llm, logger);
  }
}

// ---------------------------------------------------------------------------
// LeadAgent
// ---------------------------------------------------------------------------

export interface LeadAgentConfig {
  maxSubTasks?: number;
  maxParallelism?: number;
  decomposeModel?: string;
  synthesizeModel?: string;
}

export class LeadAgent extends Agent {
  readonly agentType = "lead";
  readonly description = "Orchestrates multi-agent workflows by decomposing goals and delegating to specialists";

  private readonly config: Required<LeadAgentConfig>;

  constructor(
    private readonly llm: OpenRouterClient,
    config: LeadAgentConfig = {},
    logger?: AgentLogger
  ) {
    super();
    this.logger = logger ?? silentLogger;
    this.config = {
      maxSubTasks: config.maxSubTasks ?? 8,
      maxParallelism: config.maxParallelism ?? 3,
      decomposeModel: config.decomposeModel ?? "anthropic/claude-3-5-sonnet",
      synthesizeModel: config.synthesizeModel ?? "anthropic/claude-3-5-sonnet",
    };
  }

  async execute(goal: string, ctx: AgentContext): Promise<AgentResult> {
    this.resetState();
    this.logger.log("lead.execute", { goal });

    // Step 1: Decompose goal into sub-tasks
    let subTasks: SubTask[];
    try {
      subTasks = await this._decompose(goal, ctx);
    } catch (err) {
      return this.buildResult("failed", null, {
        error: `Failed to decompose goal: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    this.logger.log("lead.decomposed", { subTaskCount: subTasks.length });

    // Step 2: Execute sub-tasks respecting dependencies
    let subTaskResults: SubTaskResult[];
    try {
      subTaskResults = await this._executeSubTasks(subTasks, ctx);
    } catch (err) {
      return this.buildResult("failed", null, {
        error: `Sub-task execution failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Step 3: Synthesise results
    let synthesis: string;
    try {
      synthesis = await this._synthesize(goal, subTaskResults, ctx);
    } catch (err) {
      synthesis = subTaskResults.map((r) => String(r.result.output)).join("\n\n");
    }

    // Accumulate cost/tokens from sub-agents
    for (const r of subTaskResults) {
      this.trackUsage(r.result.tokensUsed, r.result.estimatedCostUsd);
      this.toolCallRecords.push(...r.result.toolCalls);
    }

    return this.buildResult("completed", {
      synthesis,
      subTasks: subTaskResults.map((r) => ({
        taskId: r.taskId,
        agentType: r.agentType,
        output: r.result.output,
        status: r.result.status,
      })),
    });
  }

  // ---------------------------------------------------------------------------
  // Sub-task delegation
  // ---------------------------------------------------------------------------

  async delegate(task: SubTask, ctx: AgentContext): Promise<SubTaskResult> {
    this.logger.log("lead.delegate", { taskId: task.id, agentType: task.agentType });

    const agent = createAgent(task.agentType, this.llm, this.logger);
    if (this.tools) agent.withTools(this.tools);
    if (this.memory) agent.withMemory(this.memory);

    const goalWithContext = task.context
      ? `${task.goal}\n\nAdditional context:\n${JSON.stringify(task.context, null, 2)}`
      : task.goal;

    const result = await agent.execute(goalWithContext, ctx);
    return { taskId: task.id, agentType: task.agentType, result };
  }

  // ---------------------------------------------------------------------------
  // Private: decompose
  // ---------------------------------------------------------------------------

  private async _decompose(goal: string, ctx: AgentContext): Promise<SubTask[]> {
    const prompt = `You are a Lead Agent orchestrating a team of AI specialists.

High-level goal: ${goal}

Available agent types and when to use them:
- "writer": create written content (articles, emails, copy)
- "research": gather facts, search the web, produce research briefs
- "editor": improve or polish existing content
- "reviewer": review content for quality (technical, editorial, factual, seo)
- "community": community engagement responses, replies, forum posts
- "growth": marketing copy, CTAs, landing page text

Decompose this goal into ${this.config.maxSubTasks} or fewer focused sub-tasks.
Return ONLY a JSON array:
[
  {
    "id": "task-1",
    "agentType": "research",
    "goal": "Research the current state of...",
    "dependsOn": []
  }
]
Keep each task focused and independently executable where possible.`;

    const completion = await this.llm.complete({
      model: this.config.decomposeModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      maxTokens: 2048,
    });

    this.trackUsage(completion.usage.totalTokens, completion.estimatedCostUsd);

    const parsed = extractJson(completion.content);
    if (!Array.isArray(parsed)) {
      // Fallback: single task
      return [{ id: "task-1", agentType: "writer", goal, dependsOn: [] }];
    }

    return (parsed as Record<string, unknown>[])
      .slice(0, this.config.maxSubTasks)
      .map((t, i) => ({
        id: String(t.id ?? `task-${i + 1}`),
        agentType: (t.agentType as AgentType) ?? "writer",
        goal: String(t.goal ?? goal),
        context: t.context as Record<string, unknown> | undefined,
        dependsOn: (t.dependsOn as string[] | undefined) ?? [],
      }));
  }

  // ---------------------------------------------------------------------------
  // Private: execute sub-tasks with dependency ordering
  // ---------------------------------------------------------------------------

  private async _executeSubTasks(
    tasks: SubTask[],
    ctx: AgentContext
  ): Promise<SubTaskResult[]> {
    const results = new Map<string, SubTaskResult>();
    const remaining = [...tasks];

    while (remaining.length > 0) {
      // Find tasks whose dependencies are all satisfied
      const ready = remaining.filter((t) =>
        (t.dependsOn ?? []).every((depId) => results.has(depId))
      );

      if (ready.length === 0) {
        // Circular or unresolvable dependency — run all remaining sequentially
        for (const task of remaining) {
          const r = await this.delegate(task, ctx);
          results.set(task.id, r);
        }
        break;
      }

      // Execute ready tasks in parallel batches respecting maxParallelism
      const batch = ready.slice(0, this.config.maxParallelism);
      const batchResults = await Promise.all(batch.map((t) => this.delegate(t, ctx)));

      for (const r of batchResults) {
        results.set(r.taskId, r);
      }

      // Remove completed tasks from remaining
      const completedIds = new Set(batchResults.map((r) => r.taskId));
      remaining.splice(
        0,
        remaining.length,
        ...remaining.filter((t) => !completedIds.has(t.id))
      );
    }

    return [...results.values()];
  }

  // ---------------------------------------------------------------------------
  // Private: synthesise
  // ---------------------------------------------------------------------------

  private async _synthesize(
    goal: string,
    results: SubTaskResult[],
    _ctx: AgentContext
  ): Promise<string> {
    if (results.length === 1) {
      return String(results[0]!.result.output ?? "");
    }

    const resultsSummary = results
      .map((r) => `Task ${r.taskId} (${r.agentType}):\n${String(r.result.output ?? "")}`)
      .join("\n\n---\n\n");

    const prompt = `You are a Lead Agent. You have delegated sub-tasks and collected results.

Original goal: ${goal}

Sub-task results:
${resultsSummary}

Synthesise these results into a cohesive final output that directly addresses the original goal.
Be concise, structured, and actionable.`;

    const completion = await this.llm.complete({
      model: this.config.synthesizeModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      maxTokens: 4096,
    });

    this.trackUsage(completion.usage.totalTokens, completion.estimatedCostUsd);
    return completion.content;
  }
}
