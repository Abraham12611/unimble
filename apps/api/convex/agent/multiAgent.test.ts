import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MessageRouter,
  createTaskDelegation,
  createReviewRequest,
  createReviewResponse,
  createEscalation,
  formatMessageForPrompt,
} from "./communication";
import type {
  AgentCommunicationMessage,
  ReviewIssue,
  TaskDelegationPayload,
  ReviewResponsePayload,
} from "./communication";
import {
  buildPersonaPrompt,
  buildPersonaAwarePrompt,
  validatePersona,
  getDefaultPersona,
  DEFAULT_PERSONAS,
} from "./personas";
import type { Persona, PersonaMemory } from "./personas";
import { ReviewerAgent, createReviewerAgent, getCriteriaForType } from "./reviewerAgent";
import type { ReviewInput } from "./reviewerAgent";
import { LeadAgent, createLeadAgent } from "./leadAgent";
import type { SubAgentRegistration, SubAgentResult } from "./leadAgent";
import type { LLMCallFn, LLMResponse } from "./agentBase";
import type { AgentContext } from "./types";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockLLMCall(responses: string[]): LLMCallFn {
  let callIndex = 0;
  return vi.fn(async (): Promise<LLMResponse> => {
    const content = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      content,
      model: "test-model",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      cost: 0.001,
    };
  });
}

function createMockToolExecutor() {
  return vi.fn(async () => ({
    success: true,
    data: "tool result",
    durationMs: 10,
    cost: 0,
  }));
}

function createMockContext(goal: string, input?: Record<string, unknown>): AgentContext {
  return {
    workspaceId: "ws_test",
    operatorId: "op_test",
    executionId: "exec_test",
    goal,
    input,
    tools: [],
    memories: [],
    config: {
      id: "agent_test",
      name: "Test Agent",
      description: "Test",
      systemPrompt: "You are a test agent.",
      modelTier: "fast",
      mode: "react",
      tools: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 7.6.3 — Agent Communication Tests
// ---------------------------------------------------------------------------

describe("Agent Communication", () => {
  describe("MessageRouter", () => {
    let router: MessageRouter;

    beforeEach(() => {
      router = new MessageRouter();
    });

    it("should send and retrieve messages", () => {
      const msg = router.send("agent_a", "agent_b", "task_delegation", {
        kind: "task_delegation",
        task: "Write a blog post",
      });

      expect(msg.id).toBeDefined();
      expect(msg.from).toBe("agent_a");
      expect(msg.to).toBe("agent_b");
      expect(msg.type).toBe("task_delegation");
      expect(msg.priority).toBe("normal");
    });

    it("should filter messages by recipient", () => {
      router.send("a", "b", "task_delegation", { kind: "task_delegation", task: "task 1" });
      router.send("a", "c", "task_delegation", { kind: "task_delegation", task: "task 2" });
      router.send("b", "a", "status_update", {
        kind: "status_update",
        status: "completed",
        description: "done",
      });

      const forB = router.getMessagesFor("b");
      expect(forB).toHaveLength(1);
      expect((forB[0].payload as TaskDelegationPayload).task).toBe("task 1");

      const forA = router.getMessagesFor("a");
      expect(forA).toHaveLength(1);
    });

    it("should filter messages by sender", () => {
      router.send("a", "b", "task_delegation", { kind: "task_delegation", task: "task 1" });
      router.send("a", "c", "task_delegation", { kind: "task_delegation", task: "task 2" });

      const fromA = router.getMessagesFrom("a");
      expect(fromA).toHaveLength(2);
    });

    it("should track replies via inReplyTo", () => {
      const original = router.send("a", "b", "review_request", {
        kind: "review_request",
        content: "Hello world",
        contentType: "blog_post",
      });

      router.send(
        "b",
        "a",
        "review_response",
        {
          kind: "review_response",
          verdict: "approve",
          overallScore: 8.5,
          scores: { editorial: 8.5 },
          issues: [],
        },
        { inReplyTo: original.id }
      );

      const response = router.getResponse(original.id);
      expect(response).toBeDefined();
      expect(response!.from).toBe("b");
    });

    it("should build message threads", () => {
      const msg1 = router.send("a", "b", "task_delegation", {
        kind: "task_delegation",
        task: "write",
      });
      const msg2 = router.send(
        "b",
        "a",
        "status_update",
        { kind: "status_update", status: "in_progress", description: "working" },
        { inReplyTo: msg1.id }
      );
      router.send(
        "a",
        "b",
        "feedback",
        { kind: "feedback", subject: "progress", content: "good" },
        { inReplyTo: msg2.id }
      );

      const thread = router.getThread(msg1.id);
      expect(thread).toHaveLength(3);
    });

    it("should detect timed-out messages", () => {
      const now = Date.now();
      router.send(
        "a",
        "b",
        "task_delegation",
        { kind: "task_delegation", task: "urgent" },
        { deadline: now - 1000 }
      );
      router.send(
        "a",
        "c",
        "task_delegation",
        { kind: "task_delegation", task: "not urgent" },
        { deadline: now + 60000 }
      );

      const timedOut = router.getTimedOutMessages(now);
      expect(timedOut).toHaveLength(1);
      expect((timedOut[0].payload as TaskDelegationPayload).task).toBe("urgent");
    });

    it("should get pending messages", () => {
      const msg1 = router.send("a", "b", "review_request", {
        kind: "review_request",
        content: "x",
        contentType: "post",
      });
      router.send("a", "b", "task_delegation", { kind: "task_delegation", task: "y" });

      // Reply to msg1
      router.send(
        "b",
        "a",
        "review_response",
        {
          kind: "review_response",
          verdict: "approve",
          overallScore: 9,
          scores: {},
          issues: [],
        },
        { inReplyTo: msg1.id }
      );

      const pending = router.getPendingMessages("b");
      expect(pending).toHaveLength(1);
      expect((pending[0].payload as TaskDelegationPayload).task).toBe("y");
    });

    it("should return message counts", () => {
      router.send("a", "b", "task_delegation", { kind: "task_delegation", task: "1" });
      router.send("a", "b", "task_delegation", { kind: "task_delegation", task: "2" });
      router.send("b", "a", "status_update", {
        kind: "status_update",
        status: "completed",
        description: "done",
      });

      const counts = router.getMessageCount("a");
      expect(counts.sent).toBe(2);
      expect(counts.received).toBe(1);
    });

    it("should clear all messages", () => {
      router.send("a", "b", "task_delegation", { kind: "task_delegation", task: "1" });
      router.clear();
      expect(router.getHistory()).toHaveLength(0);
    });
  });

  describe("Message Factories", () => {
    it("should create task delegation payload", () => {
      const payload = createTaskDelegation("Write a tutorial", {
        expectedOutput: "markdown",
        constraints: ["under 1500 words"],
      });

      expect(payload.kind).toBe("task_delegation");
      expect(payload.task).toBe("Write a tutorial");
      expect(payload.expectedOutput).toBe("markdown");
      expect(payload.constraints).toEqual(["under 1500 words"]);
    });

    it("should create review request payload", () => {
      const payload = createReviewRequest("# Hello\nContent here", "blog_post", {
        reviewFocus: ["technical", "editorial"],
        targetAudience: "intermediate developers",
        keywords: ["React", "hooks"],
      });

      expect(payload.kind).toBe("review_request");
      expect(payload.contentType).toBe("blog_post");
      expect(payload.reviewFocus).toEqual(["technical", "editorial"]);
    });

    it("should create review response payload", () => {
      const issues: ReviewIssue[] = [
        { severity: "must_fix", category: "technical", description: "Syntax error" },
      ];
      const payload = createReviewResponse("revise", 6.5, { technical: 6 }, issues, "Fix code");

      expect(payload.kind).toBe("review_response");
      expect(payload.verdict).toBe("revise");
      expect(payload.overallScore).toBe(6.5);
      expect(payload.issues).toHaveLength(1);
      expect(payload.revisionInstructions).toBe("Fix code");
    });

    it("should create escalation payload", () => {
      const payload = createEscalation("Conflicting requirements", "Word limit vs detail", {
        options: ["Increase limit", "Split article"],
        requiresHuman: true,
      });

      expect(payload.kind).toBe("escalation");
      expect(payload.requiresHuman).toBe(true);
      expect(payload.options).toHaveLength(2);
    });
  });

  describe("formatMessageForPrompt", () => {
    it("should format task delegation messages", () => {
      const msg: AgentCommunicationMessage = {
        id: "msg_1",
        from: "lead",
        to: "writer",
        type: "task_delegation",
        priority: "high",
        payload: { kind: "task_delegation", task: "Write about React hooks" },
        timestamp: Date.now(),
      };

      const formatted = formatMessageForPrompt(msg);
      expect(formatted).toContain("task_delegation");
      expect(formatted).toContain("lead");
      expect(formatted).toContain("React hooks");
    });

    it("should format review response messages", () => {
      const msg: AgentCommunicationMessage = {
        id: "msg_2",
        from: "reviewer",
        to: "lead",
        type: "review_response",
        priority: "normal",
        payload: {
          kind: "review_response",
          verdict: "approve",
          overallScore: 8.5,
          scores: { technical: 9 },
          issues: [],
        },
        timestamp: Date.now(),
      };

      const formatted = formatMessageForPrompt(msg);
      expect(formatted).toContain("approve");
      expect(formatted).toContain("8.5");
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 7.6.4 — Agent Personas Tests
// ---------------------------------------------------------------------------

describe("Agent Personas", () => {
  describe("buildPersonaPrompt", () => {
    it("should build a complete persona prompt", () => {
      const persona = DEFAULT_PERSONAS["technical-writer"];
      const prompt = buildPersonaPrompt(persona);

      expect(prompt).toContain("Alex");
      expect(prompt).toContain("Technical but approachable");
      expect(prompt).toContain("mobile development");
      expect(prompt).toContain("Pragmatic");
      expect(prompt).toContain("Code examples: always");
    });

    it("should include all persona sections", () => {
      const persona = DEFAULT_PERSONAS["growth-marketer"];
      const prompt = buildPersonaPrompt(persona);

      expect(prompt).toContain("## Your Identity");
      expect(prompt).toContain("## Voice & Tone");
      expect(prompt).toContain("## Expertise");
      expect(prompt).toContain("## Personality");
    });

    it("should handle minimal persona", () => {
      const minimal: Persona = {
        id: "test",
        identity: { name: "Test Agent" },
        voice: { tone: "Neutral", formality: "professional" },
        style: {},
        expertise: { primary: ["testing"] },
        personality: { traits: ["Thorough"] },
        version: "1.0.0",
      };

      const prompt = buildPersonaPrompt(minimal);
      expect(prompt).toContain("Test Agent");
      expect(prompt).toContain("Neutral");
      expect(prompt).toContain("testing");
    });
  });

  describe("buildPersonaAwarePrompt", () => {
    it("should combine base template with persona", () => {
      const persona = DEFAULT_PERSONAS["technical-writer"];
      const template = "You are {{personaName}}, an expert in {{personaExpertise}}.";

      const result = buildPersonaAwarePrompt(template, persona);

      expect(result).toContain("Alex");
      expect(result).toContain("mobile development");
      expect(result).toContain("## Your Identity");
    });

    it("should include persona memory when provided", () => {
      const persona = DEFAULT_PERSONAS["technical-writer"];
      const memory: PersonaMemory = {
        personaId: persona.id,
        learnedPreferences: ["Code examples in Swift perform better"],
        positiveFeedback: ["Clear explanations"],
        negativeFeedback: ["Sometimes too detailed"],
        styleRefinements: ["Reduced use of simply"],
      };

      const result = buildPersonaAwarePrompt("Base prompt.", persona, {}, memory);

      expect(result).toContain("Learned Preferences");
      expect(result).toContain("Swift perform better");
      expect(result).toContain("Clear explanations");
      expect(result).toContain("Sometimes too detailed");
      expect(result).toContain("Reduced use of");
    });
  });

  describe("validatePersona", () => {
    it("should pass for valid persona", () => {
      const errors = validatePersona(DEFAULT_PERSONAS["technical-writer"]);
      expect(errors).toHaveLength(0);
    });

    it("should catch missing required fields", () => {
      const errors = validatePersona({});
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.field === "id")).toBe(true);
      expect(errors.some((e) => e.field === "identity.name")).toBe(true);
      expect(errors.some((e) => e.field === "voice.tone")).toBe(true);
    });

    it("should catch empty expertise", () => {
      const errors = validatePersona({
        id: "test",
        identity: { name: "Test" },
        voice: { tone: "Neutral", formality: "professional" },
        expertise: { primary: [] },
        personality: { traits: ["Nice"] },
        version: "1.0.0",
      });

      expect(errors.some((e) => e.field === "expertise.primary")).toBe(true);
    });
  });

  describe("getDefaultPersona", () => {
    it("should return known personas", () => {
      expect(getDefaultPersona("technical-writer")).toBeDefined();
      expect(getDefaultPersona("growth-marketer")).toBeDefined();
      expect(getDefaultPersona("community-manager")).toBeDefined();
    });

    it("should return undefined for unknown roles", () => {
      expect(getDefaultPersona("nonexistent")).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 7.6.2 — Reviewer Agent Tests
// ---------------------------------------------------------------------------

describe("Reviewer Agent", () => {
  describe("getCriteriaForType", () => {
    it("should return criteria for each review type", () => {
      expect(getCriteriaForType("technical").length).toBeGreaterThan(0);
      expect(getCriteriaForType("editorial").length).toBeGreaterThan(0);
      expect(getCriteriaForType("factual").length).toBeGreaterThan(0);
      expect(getCriteriaForType("seo").length).toBeGreaterThan(0);
      expect(getCriteriaForType("comprehensive").length).toBeGreaterThan(0);
    });

    it("should have valid criteria structure", () => {
      const criteria = getCriteriaForType("technical");
      for (const c of criteria) {
        expect(c.id).toBeDefined();
        expect(c.name).toBeDefined();
        expect(c.description).toBeDefined();
        expect(c.minScore).toBeGreaterThanOrEqual(1);
        expect(c.minScore).toBeLessThanOrEqual(10);
        expect(c.weight).toBeGreaterThan(0);
      }
    });
  });

  describe("createReviewerAgent", () => {
    it("should create a reviewer with default config", () => {
      const reviewer = createReviewerAgent("rev_1", ["technical", "editorial"]);
      expect(reviewer).toBeInstanceOf(ReviewerAgent);
    });

    it("should create a reviewer with custom strictness", () => {
      const reviewer = createReviewerAgent("rev_2", ["factual"], {
        strictness: "high",
        approveThreshold: 9.0,
      });
      expect(reviewer).toBeInstanceOf(ReviewerAgent);
    });
  });

  describe("ReviewerAgent.review", () => {
    it("should produce a review response with approve verdict", async () => {
      const llmCall = createMockLLMCall([
        JSON.stringify({
          criteria: [
            { criterionId: "correctness", score: 9, feedback: "Excellent" },
            { criterionId: "completeness", score: 8, feedback: "Good coverage" },
            { criterionId: "clarity", score: 8, feedback: "Clear" },
          ],
          issues: [],
          suggestions: [],
        }),
      ]);

      const reviewer = createReviewerAgent("rev_test", ["technical"], {
        strictness: "low",
        approveThreshold: 7.0,
      });

      const input: ReviewInput = {
        content: "# How to use React Hooks\n\nReact hooks let you use state...",
        contentType: "tutorial",
        goal: "Write a tutorial about React hooks",
        targetAudience: "intermediate developers",
      };

      const result = await reviewer.review(input, llmCall);

      expect(result.response.verdict).toBe("approve");
      expect(result.response.overallScore).toBeGreaterThan(7);
      expect(result.cost).toBeGreaterThan(0);
    });

    it("should produce a revise verdict for mediocre content", async () => {
      const llmCall = createMockLLMCall([
        JSON.stringify({
          criteria: [
            { criterionId: "correctness", score: 6, feedback: "Some errors" },
            { criterionId: "completeness", score: 5, feedback: "Missing sections" },
            { criterionId: "clarity", score: 7, feedback: "Mostly clear" },
          ],
          issues: ["Code example has syntax error", "Missing error handling section"],
          suggestions: ["Fix the syntax error", "Add error handling"],
        }),
      ]);

      const reviewer = createReviewerAgent("rev_test2", ["technical"], {
        strictness: "medium",
      });

      const input: ReviewInput = {
        content: "Some mediocre content...",
        contentType: "blog_post",
        goal: "Write about error handling",
      };

      const result = await reviewer.review(input, llmCall);

      expect(result.response.verdict).toBe("revise");
      expect(result.response.issues.length).toBeGreaterThan(0);
      expect(result.response.revisionInstructions).toBeDefined();
    });

    it("should run multiple review types", async () => {
      const llmCall = createMockLLMCall([
        // Technical review
        JSON.stringify({
          criteria: [{ criterionId: "correctness", score: 8, feedback: "Good" }],
          issues: [],
          suggestions: [],
        }),
        // Editorial review
        JSON.stringify({
          criteria: [{ criterionId: "clarity", score: 9, feedback: "Clear" }],
          issues: [],
          suggestions: [],
        }),
      ]);

      const reviewer = createReviewerAgent("rev_multi", ["technical", "editorial"], {
        strictness: "low",
        approveThreshold: 6.0,
      });

      const input: ReviewInput = {
        content: "Good content here",
        contentType: "blog_post",
        goal: "Write well",
      };

      const result = await reviewer.review(input, llmCall);

      expect(result.evaluations).toBeDefined();
      expect(result.response.scores).toBeDefined();
    });
  });

  describe("ReviewerAgent.execute", () => {
    it("should work as a standard agent via execute()", async () => {
      const llmCall = createMockLLMCall([
        JSON.stringify({
          criteria: [{ criterionId: "correctness", score: 9, feedback: "Great" }],
          issues: [],
          suggestions: [],
        }),
      ]);

      const reviewer = createReviewerAgent("rev_exec", ["technical"], {
        strictness: "low",
        approveThreshold: 7.0,
      });

      const context = createMockContext("Review this content", {
        content: "# Tutorial\nSome content",
        contentType: "tutorial",
      });

      const state = await reviewer.execute(context, llmCall, createMockToolExecutor());

      expect(state.status).toBe("complete");
      expect(state.output).toBeDefined();
      expect((state.output as ReviewResponsePayload).verdict).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 7.6.1 — Lead Agent Tests
// ---------------------------------------------------------------------------

describe("Lead Agent", () => {
  const mockSubAgents: SubAgentRegistration[] = [
    {
      id: "writer_agent",
      name: "Writer",
      description: "Writes content",
      capabilities: ["blog_posts", "tutorials", "documentation"],
      available: true,
    },
    {
      id: "reviewer_agent",
      name: "Reviewer",
      description: "Reviews content quality",
      capabilities: ["technical_review", "editorial_review"],
      available: true,
    },
    {
      id: "research_agent",
      name: "Researcher",
      description: "Researches topics",
      capabilities: ["web_search", "competitor_analysis"],
      available: true,
    },
  ];

  describe("createLeadAgent", () => {
    it("should create a lead agent with sub-agents", () => {
      const lead = createLeadAgent("lead_1", mockSubAgents);
      expect(lead).toBeInstanceOf(LeadAgent);
    });

    it("should create with custom options", () => {
      const lead = createLeadAgent("lead_2", mockSubAgents, {
        maxParallelDelegations: 5,
        delegationTimeoutMs: 60000,
        autoEscalateOnTimeout: false,
      });
      expect(lead).toBeInstanceOf(LeadAgent);
    });
  });

  describe("LeadAgent.orchestrate", () => {
    it("should delegate tasks to sub-agents and aggregate results", async () => {
      const llmCall = createMockLLMCall([
        // Delegation plan
        JSON.stringify([{ agentId: "writer_agent", task: "Write a blog post about React hooks" }]),
      ]);

      const subAgentExecutor = vi.fn(
        async (): Promise<SubAgentResult> => ({
          success: true,
          output: "# React Hooks Tutorial\n\nHere is the content...",
          cost: 0.05,
          durationMs: 3000,
        })
      );

      const lead = createLeadAgent("lead_test", mockSubAgents);
      const context = createMockContext("Write a blog post about React hooks");

      const result = await lead.orchestrate(
        context,
        llmCall,
        createMockToolExecutor(),
        subAgentExecutor
      );

      expect(result.output).toBeDefined();
      expect(result.delegations).toHaveLength(1);
      expect(result.delegations[0].status).toBe("completed");
      expect(result.escalated).toBe(false);
      expect(result.totalCost).toBeGreaterThan(0);
    });

    it("should handle multiple delegations", async () => {
      const llmCall = createMockLLMCall([
        // Delegation plan with 2 tasks
        JSON.stringify([
          { agentId: "research_agent", task: "Research React hooks best practices" },
          { agentId: "writer_agent", task: "Write tutorial based on research" },
        ]),
        // Aggregation prompt response
        "Here is the combined output from research and writing.",
      ]);

      const subAgentExecutor = vi.fn(
        async (agentId: string): Promise<SubAgentResult> => ({
          success: true,
          output: agentId === "research_agent" ? "Research findings..." : "Written content...",
          cost: 0.03,
          durationMs: 2000,
        })
      );

      const lead = createLeadAgent("lead_multi", mockSubAgents);
      const context = createMockContext("Create a comprehensive React hooks tutorial");

      const result = await lead.orchestrate(
        context,
        llmCall,
        createMockToolExecutor(),
        subAgentExecutor
      );

      expect(result.delegations).toHaveLength(2);
      expect(result.delegations.every((d) => d.status === "completed")).toBe(true);
      expect(subAgentExecutor).toHaveBeenCalledTimes(2);
    });

    it("should escalate when sub-agent fails", async () => {
      const llmCall = createMockLLMCall([
        JSON.stringify([{ agentId: "writer_agent", task: "Write content" }]),
      ]);

      const subAgentExecutor = vi.fn(
        async (): Promise<SubAgentResult> => ({
          success: false,
          error: "LLM rate limit exceeded",
          cost: 0.01,
          durationMs: 500,
        })
      );

      const lead = createLeadAgent("lead_fail", mockSubAgents, {
        autoEscalateOnTimeout: true,
      });
      const context = createMockContext("Write something");

      const result = await lead.orchestrate(
        context,
        llmCall,
        createMockToolExecutor(),
        subAgentExecutor
      );

      expect(result.escalated).toBe(true);
      expect(result.escalationReason).toContain("failed");
    });

    it("should handle sub-agent throwing an error", async () => {
      const llmCall = createMockLLMCall([
        JSON.stringify([{ agentId: "writer_agent", task: "Write content" }]),
      ]);

      const subAgentExecutor = vi.fn(async (): Promise<SubAgentResult> => {
        throw new Error("Network timeout");
      });

      const lead = createLeadAgent("lead_throw", mockSubAgents);
      const context = createMockContext("Write something");

      const result = await lead.orchestrate(
        context,
        llmCall,
        createMockToolExecutor(),
        subAgentExecutor
      );

      expect(result.escalated).toBe(true);
      expect(result.escalationReason).toContain("Network timeout");
    });

    it("should track message history", async () => {
      const llmCall = createMockLLMCall([
        JSON.stringify([{ agentId: "writer_agent", task: "Write a post" }]),
      ]);

      const subAgentExecutor = vi.fn(
        async (): Promise<SubAgentResult> => ({
          success: true,
          output: "Content",
          cost: 0.02,
          durationMs: 1000,
        })
      );

      const lead = createLeadAgent("lead_msgs", mockSubAgents);
      const context = createMockContext("Write a post");

      const result = await lead.orchestrate(
        context,
        llmCall,
        createMockToolExecutor(),
        subAgentExecutor
      );

      expect(result.messageHistory.length).toBeGreaterThan(0);
      expect(result.messageHistory.some((m) => m.type === "task_delegation")).toBe(true);
      expect(result.messageHistory.some((m) => m.type === "status_update")).toBe(true);
    });

    it("should parse delegation plan when LLM appends text with brackets after JSON", async () => {
      // Simulate LLM response with trailing text containing brackets
      const llmCall = createMockLLMCall([
        `[{"agentId": "writer_agent", "task": "Write a blog post"}]\n\nNote: only [writer_agent] is available for this task.`,
      ]);

      const subAgentExecutor = vi.fn(
        async (): Promise<SubAgentResult> => ({
          success: true,
          output: "Blog post content",
          cost: 0.02,
          durationMs: 1000,
        })
      );

      const lead = createLeadAgent("lead_bracket_parse", mockSubAgents);
      const context = createMockContext("Write a blog post");

      const result = await lead.orchestrate(
        context,
        llmCall,
        createMockToolExecutor(),
        subAgentExecutor
      );

      // Should successfully parse and delegate despite trailing brackets
      expect(result.delegations).toHaveLength(1);
      expect(result.delegations[0].status).toBe("completed");
      expect(subAgentExecutor).toHaveBeenCalledTimes(1);
    });
  });

  describe("LeadAgent.execute", () => {
    it("should fall back to plan-execute when no sub-agent executor", async () => {
      const llmCall = createMockLLMCall([
        // Plan generation
        '["Step 1: Research", "Step 2: Write"]',
        // Step 1 execution
        "FINAL_ANSWER: Research complete",
        // Step 2 execution
        "FINAL_ANSWER: Writing complete",
      ]);

      const lead = createLeadAgent("lead_fallback", mockSubAgents);
      const context = createMockContext("Do something");

      const state = await lead.execute(context, llmCall, createMockToolExecutor());

      // Should use PlanExecuteAgent's execute since no subAgentExecutor set
      expect(state.status).toBe("complete");
    });

    it("should use orchestrate when sub-agent executor is set", async () => {
      const llmCall = createMockLLMCall([
        JSON.stringify([{ agentId: "writer_agent", task: "Write" }]),
      ]);

      const subAgentExecutor = vi.fn(
        async (): Promise<SubAgentResult> => ({
          success: true,
          output: "Done",
          cost: 0.01,
          durationMs: 500,
        })
      );

      const lead = createLeadAgent("lead_orch", mockSubAgents);
      lead.setSubAgentExecutor(subAgentExecutor);
      const context = createMockContext("Write content");

      const state = await lead.execute(context, llmCall, createMockToolExecutor());

      expect(state.status).toBe("complete");
      expect(subAgentExecutor).toHaveBeenCalled();
    });

    it("should escalate on timeout when autoEscalateOnTimeout is true", async () => {
      const llmCall = createMockLLMCall([
        JSON.stringify([{ agentId: "writer_agent", task: "Write slowly" }]),
      ]);

      // Sub-agent that takes longer than the timeout
      const subAgentExecutor = vi.fn(
        async (): Promise<SubAgentResult> =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ success: true, output: "late", cost: 0, durationMs: 200 }),
              200
            )
          )
      );

      const lead = createLeadAgent("lead_timeout", mockSubAgents, {
        delegationTimeoutMs: 50, // 50ms timeout — sub-agent takes 200ms
        autoEscalateOnTimeout: true,
      });
      const context = createMockContext("Write something");

      const result = await lead.orchestrate(
        context,
        llmCall,
        createMockToolExecutor(),
        subAgentExecutor
      );

      expect(result.escalated).toBe(true);
      expect(result.escalationReason).toContain("timed out");
      expect(result.delegations[0].status).toBe("timed_out");
    });

    it("should continue without result on timeout when autoEscalateOnTimeout is false", async () => {
      const llmCall = createMockLLMCall([
        JSON.stringify([{ agentId: "writer_agent", task: "Write slowly" }]),
      ]);

      const subAgentExecutor = vi.fn(
        async (): Promise<SubAgentResult> =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ success: true, output: "late", cost: 0, durationMs: 200 }),
              200
            )
          )
      );

      const lead = createLeadAgent("lead_timeout_no_esc", mockSubAgents, {
        delegationTimeoutMs: 50,
        autoEscalateOnTimeout: false,
      });
      const context = createMockContext("Write something");

      const result = await lead.orchestrate(
        context,
        llmCall,
        createMockToolExecutor(),
        subAgentExecutor
      );

      // Should NOT escalate — just skip the timed-out delegation
      expect(result.escalated).toBe(false);
      expect(result.delegations[0].status).toBe("timed_out");
    });

    it("should execute independent delegations in parallel", async () => {
      const callOrder: string[] = [];
      const llmCall = createMockLLMCall([
        // Plan with 2 independent tasks (no dependencies)
        JSON.stringify([
          { agentId: "research_agent", task: "Research" },
          { agentId: "writer_agent", task: "Write" },
        ]),
        // Aggregation
        "Combined result",
      ]);

      const subAgentExecutor = vi.fn(async (agentId: string): Promise<SubAgentResult> => {
        callOrder.push(`start:${agentId}`);
        // Simulate async work
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push(`end:${agentId}`);
        return { success: true, output: `${agentId} done`, cost: 0.01, durationMs: 10 };
      });

      const lead = createLeadAgent("lead_parallel", mockSubAgents, {
        maxParallelDelegations: 5,
      });
      const context = createMockContext("Do two things");

      const result = await lead.orchestrate(
        context,
        llmCall,
        createMockToolExecutor(),
        subAgentExecutor
      );

      expect(result.delegations).toHaveLength(2);
      expect(result.delegations.every((d) => d.status === "completed")).toBe(true);
      // Both should start before either ends (parallel execution)
      expect(callOrder[0]).toBe("start:research_agent");
      expect(callOrder[1]).toBe("start:writer_agent");
    });
  });
});
