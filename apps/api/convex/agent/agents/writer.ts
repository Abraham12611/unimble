/**
 * Phase 7 — Agent Runtime: Specialist content agents.
 *
 * WriterAgent    — creates long-form content
 * ResearchAgent  — gathers information and synthesises research briefs
 * EditorAgent    — improves/polishes existing content
 * CommunityAgent — crafts community engagement content
 * GrowthAgent    — produces growth/marketing-oriented content
 */

import type { AgentContext, AgentResult } from "../types";
import type { OpenRouterClient } from "../llm";
import type { AgentLogger } from "./base";
import { Agent, silentLogger } from "./base";
import { ReactLoop } from "../react-loop";
import type { ReactOptions } from "../react-loop";

// ---------------------------------------------------------------------------
// WriterAgent
// ---------------------------------------------------------------------------

export class WriterAgent extends Agent {
  readonly agentType = "writer";
  readonly description = "Creates high-quality long-form written content";

  constructor(
    private readonly llm: OpenRouterClient,
    logger?: AgentLogger
  ) {
    super();
    this.logger = logger ?? silentLogger;
  }

  async execute(goal: string, ctx: AgentContext): Promise<AgentResult> {
    this.resetState();

    const systemPrompt = `You are an expert content writer. Create high-quality, engaging content based on the provided goal.
Be specific, use concrete examples, and maintain a consistent tone. Structure your content clearly with headings and sections.`;

    const opts: ReactOptions = {
      config: {
        model: "anthropic/claude-3-5-sonnet",
        maxIterations: 5,
        temperature: 0.7,
        maxTokens: 4096,
      },
      systemPrompt,
    };

    if (this.tools) {
      const loop = new ReactLoop(this.llm, this.tools, this.logger);
      const result = await loop.run(goal, ctx, opts, this.memory);
      this.trackUsage(result.tokensUsed, result.estimatedCostUsd);
      this.toolCallRecords.push(...result.toolCalls);
      return this.buildResult(result.status, result.output, {
        reasoning: result.reasoning,
        iterations: result.iterations,
        error: result.error,
      });
    }

    // No tools: direct LLM call
    let completion;
    try {
      completion = await this.llm.complete({
        model: "anthropic/claude-3-5-sonnet",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: goal },
        ],
        temperature: 0.7,
        maxTokens: 4096,
      });
    } catch (err) {
      return this.buildResult("failed", null, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.trackUsage(completion.usage.totalTokens, completion.estimatedCostUsd);
    return this.buildResult("completed", completion.content);
  }
}

// ---------------------------------------------------------------------------
// ResearchAgent
// ---------------------------------------------------------------------------

export class ResearchAgent extends Agent {
  readonly agentType = "research";
  readonly description = "Gathers and synthesises information using search and scrape tools";

  constructor(
    private readonly llm: OpenRouterClient,
    logger?: AgentLogger
  ) {
    super();
    this.logger = logger ?? silentLogger;
  }

  async execute(goal: string, ctx: AgentContext): Promise<AgentResult> {
    this.resetState();

    const systemPrompt = `You are a thorough research agent. Your job is to gather information, verify facts, and synthesise a comprehensive research brief.
Use available tools to search for current information. Cite your sources and distinguish between facts and analysis.`;

    const opts: ReactOptions = {
      config: {
        model: "anthropic/claude-3-5-sonnet",
        maxIterations: 8,
        temperature: 0.3,
        maxTokens: 8192,
      },
      systemPrompt,
    };

    if (this.tools) {
      const loop = new ReactLoop(this.llm, this.tools, this.logger);
      const result = await loop.run(goal, ctx, opts, this.memory);
      this.trackUsage(result.tokensUsed, result.estimatedCostUsd);
      this.toolCallRecords.push(...result.toolCalls);
      return this.buildResult(result.status, result.output, {
        reasoning: result.reasoning,
        iterations: result.iterations,
        error: result.error,
      });
    }

    let completion;
    try {
      completion = await this.llm.complete({
        model: "anthropic/claude-3-5-sonnet",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: goal },
        ],
        temperature: 0.3,
        maxTokens: 8192,
      });
    } catch (err) {
      return this.buildResult("failed", null, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.trackUsage(completion.usage.totalTokens, completion.estimatedCostUsd);
    return this.buildResult("completed", completion.content);
  }
}

// ---------------------------------------------------------------------------
// EditorAgent
// ---------------------------------------------------------------------------

export class EditorAgent extends Agent {
  readonly agentType = "editor";
  readonly description = "Improves and polishes existing content for clarity, tone, and quality";

  constructor(
    private readonly llm: OpenRouterClient,
    logger?: AgentLogger
  ) {
    super();
    this.logger = logger ?? silentLogger;
  }

  async execute(goal: string, ctx: AgentContext): Promise<AgentResult> {
    this.resetState();

    const systemPrompt = `You are an experienced editor. Your job is to improve content while preserving the author's voice.
Focus on: clarity, flow, conciseness, and factual consistency. Return the improved version along with a brief summary of changes.`;

    let completion;
    try {
      completion = await this.llm.complete({
        model: "anthropic/claude-3-5-sonnet",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: goal },
        ],
        temperature: 0.4,
        maxTokens: 4096,
      });
    } catch (err) {
      return this.buildResult("failed", null, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.trackUsage(completion.usage.totalTokens, completion.estimatedCostUsd);
    return this.buildResult("completed", completion.content);
  }
}

// ---------------------------------------------------------------------------
// CommunityAgent
// ---------------------------------------------------------------------------

export class CommunityAgent extends Agent {
  readonly agentType = "community";
  readonly description = "Creates community engagement content: replies, discussions, AMAs";

  constructor(
    private readonly llm: OpenRouterClient,
    logger?: AgentLogger
  ) {
    super();
    this.logger = logger ?? silentLogger;
  }

  async execute(goal: string, ctx: AgentContext): Promise<AgentResult> {
    this.resetState();

    const systemPrompt = `You are a community engagement specialist. Create authentic, engaging community content that builds genuine connections.
Be conversational, helpful, and foster discussion. Avoid overly promotional language.`;

    let completion;
    try {
      completion = await this.llm.complete({
        model: "openai/gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: goal },
        ],
        temperature: 0.6,
        maxTokens: 2048,
      });
    } catch (err) {
      return this.buildResult("failed", null, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.trackUsage(completion.usage.totalTokens, completion.estimatedCostUsd);
    return this.buildResult("completed", completion.content);
  }
}

// ---------------------------------------------------------------------------
// GrowthAgent
// ---------------------------------------------------------------------------

export class GrowthAgent extends Agent {
  readonly agentType = "growth";
  readonly description = "Produces growth and marketing-oriented content: CTAs, landing pages, ads";

  constructor(
    private readonly llm: OpenRouterClient,
    logger?: AgentLogger
  ) {
    super();
    this.logger = logger ?? silentLogger;
  }

  async execute(goal: string, ctx: AgentContext): Promise<AgentResult> {
    this.resetState();

    const systemPrompt = `You are a growth marketer and copywriter. Create compelling, conversion-focused content.
Understand user psychology, craft clear value propositions, and write strong calls-to-action.
Be persuasive but authentic — avoid hype and unsubstantiated claims.`;

    let completion;
    try {
      completion = await this.llm.complete({
        model: "openai/gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: goal },
        ],
        temperature: 0.6,
        maxTokens: 2048,
      });
    } catch (err) {
      return this.buildResult("failed", null, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.trackUsage(completion.usage.totalTokens, completion.estimatedCostUsd);
    return this.buildResult("completed", completion.content);
  }
}
