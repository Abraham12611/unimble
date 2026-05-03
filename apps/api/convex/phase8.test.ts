/**
 * Phase 8 — Pre-built Operators: comprehensive test suite.
 *
 * Covers:
 *   - Operator base class lifecycle (deploy, pause, resume, destroy)
 *   - Config schema validation (happy path + invalid input)
 *   - OperatorRegistry (register, discover, list, instantiate, validateConfig)
 *   - All 5 operator classes: config defaults, workflow shapes, step counts
 *   - deployOperator Convex mutation: creates operator + workflows + versions
 *   - Error paths: unknown type, invalid config, unknown operator
 *   - Approval gate presence when approvalRequired = true
 *   - Memory namespace isolation per operator type
 *   - Metric counters (incrementRun, incrementError, trackTokens)
 */

import { describe, expect, test, beforeEach } from "vitest";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import schema from "./schema";
import { deployOperatorImpl } from "./operators";

// Operator classes & registry
import {
  operatorRegistry,
  ContentOperator,
  GrowthOperator,
  CommunityOperator,
  FeedbackOperator,
  DocumentationOperator,
  contentOperatorConfigSchema,
  growthOperatorConfigSchema,
  communityOperatorConfigSchema,
  feedbackOperatorConfigSchema,
  docsOperatorConfigSchema,
} from "./operators/index";
import { OperatorRegistry } from "./operators/registry";
import type { OperatorType } from "./operators/types";

const modules = import.meta.glob("./**/*.*s");

function makeIdentity(partial: Partial<UserIdentity>): Partial<UserIdentity> {
  return {
    issuer: partial.issuer ?? "https://clerk.example",
    subject: partial.subject ?? "clerk_subject",
    tokenIdentifier:
      partial.tokenIdentifier ?? `clerk|${partial.subject ?? "clerk_subject"}`,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function scaffoldWorkspace(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", {
      clerkId: "clerk_owner",
      email: "owner@example.com",
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Acme",
      slug: "acme",
      description: "",
      ownerId,
      plan: "pro",
      status: "active",
      settings: {},
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: ownerId,
      role: "owner",
      joinedAt: now,
    });
    return { ownerId, workspaceId } as const;
  });
}

// ---------------------------------------------------------------------------
// 1. OperatorRegistry
// ---------------------------------------------------------------------------

describe("OperatorRegistry", () => {
  test("singleton registry has all 5 built-in operators registered", () => {
    const types = operatorRegistry.list().map((e) => e.type);
    expect(types).toContain("content");
    expect(types).toContain("growth");
    expect(types).toContain("community");
    expect(types).toContain("feedback");
    expect(types).toContain("documentation");
    expect(types).toHaveLength(5);
  });

  test("discover returns constructor for known type", () => {
    const ctor = operatorRegistry.discover("content");
    expect(ctor).toBeDefined();
    const instance = new ctor!({});
    expect(instance.operatorType).toBe("content");
  });

  test("discover returns undefined for unknown type", () => {
    expect(operatorRegistry.discover("nonexistent" as OperatorType)).toBeUndefined();
  });

  test("instantiate creates correct operator", () => {
    const op = operatorRegistry.instantiate("growth");
    expect(op.operatorType).toBe("growth");
  });

  test("instantiate throws for unknown type", () => {
    expect(() =>
      operatorRegistry.instantiate("unknown_type" as OperatorType)
    ).toThrow('Unknown operator type: "unknown_type"');
  });

  test("validateConfig returns success for valid config", () => {
    const result = operatorRegistry.validateConfig("content", { niche: "SaaS" });
    expect(result.success).toBe(true);
  });

  test("validateConfig returns failure for invalid config", () => {
    // contentTypes must be an array of enums — passing a bad enum value
    const result = operatorRegistry.validateConfig("content", {
      contentTypes: ["bad_type"],
    });
    expect(result.success).toBe(false);
  });

  test("listByType filters correctly", () => {
    const filtered = operatorRegistry.listByType(["content", "growth"]);
    expect(filtered).toHaveLength(2);
    const types = filtered.map((e) => e.type);
    expect(types).toContain("content");
    expect(types).toContain("growth");
  });

  test("has returns true for registered type", () => {
    expect(operatorRegistry.has("community")).toBe(true);
    expect(operatorRegistry.has("unknown" as OperatorType)).toBe(false);
  });

  test("fresh registry starts empty and accepts registration", () => {
    const reg = new OperatorRegistry();
    expect(reg.list()).toHaveLength(0);
    reg.register(ContentOperator);
    expect(reg.list()).toHaveLength(1);
    expect(reg.list()[0]!.type).toBe("content");
  });

  test("re-registering same type replaces previous entry", () => {
    const reg = new OperatorRegistry();
    reg.register(ContentOperator);
    reg.register(ContentOperator);
    expect(reg.list()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Operator base: lifecycle + metrics
// ---------------------------------------------------------------------------

describe("Operator base lifecycle", () => {
  test("initial status is idle", () => {
    const op = new ContentOperator({});
    expect(op.getStatus()).toBe("idle");
  });

  test("deploy sets status to active", async () => {
    const op = new ContentOperator({});
    await op.deploy();
    expect(op.getStatus()).toBe("active");
  });

  test("pause sets status to paused", async () => {
    const op = new ContentOperator({});
    await op.deploy();
    await op.pause();
    expect(op.getStatus()).toBe("paused");
  });

  test("resume sets status back to active", async () => {
    const op = new ContentOperator({});
    await op.deploy();
    await op.pause();
    await op.resume();
    expect(op.getStatus()).toBe("active");
  });

  test("pause on non-active operator throws", async () => {
    const op = new ContentOperator({});
    await expect(op.pause()).rejects.toThrow(/Cannot pause/);
  });

  test("resume on non-paused operator throws", async () => {
    const op = new ContentOperator({});
    await expect(op.resume()).rejects.toThrow(/Cannot resume/);
  });

  test("destroy sets status to deleted", async () => {
    const op = new ContentOperator({});
    await op.destroy();
    expect(op.getStatus()).toBe("deleted");
  });

  test("incrementRun tracks executionsRun and lastRunAt", () => {
    const op = new GrowthOperator({});
    expect(op.getMetrics().executionsRun).toBe(0);
    op.incrementRun();
    op.incrementRun();
    const m = op.getMetrics();
    expect(m.executionsRun).toBe(2);
    expect(m.lastRunAt).toBeGreaterThan(0);
  });

  test("incrementError increments errors counter", () => {
    const op = new FeedbackOperator({});
    op.incrementError();
    expect(op.getMetrics().errors).toBe(1);
  });

  test("trackTokens accumulates usage", () => {
    const op = new CommunityOperator({});
    op.trackTokens(1000, 0.002);
    op.trackTokens(500, 0.001);
    const m = op.getMetrics();
    expect(m.tokensUsed).toBe(1500);
    expect(m.costUsd).toBeCloseTo(0.003);
  });

  test("getConfig returns parsed config (not raw)", () => {
    const op = new DocumentationOperator({ repo: "my-org/my-repo" });
    expect(op.getConfig().repo).toBe("my-org/my-repo");
    // defaults are applied
    expect(op.getConfig().docsPlatform).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// 3. ContentOperator
// ---------------------------------------------------------------------------

describe("ContentOperator", () => {
  test("default config produces a valid instance", () => {
    const op = new ContentOperator({});
    expect(op.operatorType).toBe("content");
    expect(op.version).toBe("1.0.0");
    expect(op.memoryNamespace).toBe("content");
  });

  test("configSchema rejects bad contentTypes", () => {
    const result = contentOperatorConfigSchema.safeParse({ contentTypes: ["bad"] });
    expect(result.success).toBe(false);
  });

  test("configSchema accepts valid config", () => {
    const result = contentOperatorConfigSchema.safeParse({
      niche: "DevOps",
      targetAudience: "SREs",
      contentTypes: ["blog_post", "newsletter"],
      cmsIntegration: "ghost",
      reviewers: ["technical", "seo"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.niche).toBe("DevOps");
    }
  });

  test("defaultWorkflows returns 2 workflows", () => {
    const op = new ContentOperator({});
    const wfs = op.defaultWorkflows();
    expect(wfs).toHaveLength(2);
  });

  test("first workflow is cron triggered", () => {
    const op = new ContentOperator({});
    expect(op.defaultWorkflows()[0]!.trigger.type).toBe("cron");
  });

  test("approval step present when approvalRequired=true", () => {
    const op = new ContentOperator({ approvalRequired: true });
    const wf = op.defaultWorkflows()[0]!;
    const approvalStep = wf.steps.find((s) => s.type === "approval");
    expect(approvalStep).toBeDefined();
    expect(approvalStep!.approvalConfig?.timeoutMs).toBeGreaterThan(0);
  });

  test("no approval step when approvalRequired=false", () => {
    const op = new ContentOperator({ approvalRequired: false });
    const wf = op.defaultWorkflows()[0]!;
    const approvalSteps = wf.steps.filter((s) => s.type === "approval");
    expect(approvalSteps).toHaveLength(0);
  });

  test("reviewer steps are generated for each reviewer type", () => {
    const op = new ContentOperator({ reviewers: ["technical", "editorial", "seo"] });
    const wf = op.defaultWorkflows()[0]!;
    const reviewSteps = wf.steps.filter((s) => s.id.startsWith("review_"));
    expect(reviewSteps).toHaveLength(3);
    const ids = reviewSteps.map((s) => s.id);
    expect(ids).toContain("review_technical");
    expect(ids).toContain("review_editorial");
    expect(ids).toContain("review_seo");
  });

  test("social_promotion step added when socialIntegrations configured", () => {
    const op = new ContentOperator({ socialIntegrations: ["twitter", "linkedin"] });
    const wf = op.defaultWorkflows()[0]!;
    const socialStep = wf.steps.find((s) => s.id === "social_promotion");
    expect(socialStep).toBeDefined();
  });

  test("no social step when no socialIntegrations", () => {
    const op = new ContentOperator({ socialIntegrations: [] });
    const wf = op.defaultWorkflows()[0]!;
    expect(wf.steps.find((s) => s.id === "social_promotion")).toBeUndefined();
  });

  test("second workflow is performance analytics", () => {
    const op = new ContentOperator({});
    const wf = op.defaultWorkflows()[1]!;
    expect(wf.name).toContain("Performance");
    expect(wf.steps.find((s) => s.id === "fetch_metrics")).toBeDefined();
    expect(wf.steps.find((s) => s.id === "generate_report")).toBeDefined();
  });

  test("produces blog post draft step", () => {
    const op = new ContentOperator({ contentTypes: ["blog_post"] });
    const wf = op.defaultWorkflows()[0]!;
    const draftStep = wf.steps.find((s) => s.id === "draft");
    expect(draftStep).toBeDefined();
    expect(draftStep!.prompt).toContain("blog_post");
  });
});

// ---------------------------------------------------------------------------
// 4. GrowthOperator
// ---------------------------------------------------------------------------

describe("GrowthOperator", () => {
  test("default config produces a valid instance", () => {
    const op = new GrowthOperator({});
    expect(op.operatorType).toBe("growth");
    expect(op.memoryNamespace).toBe("growth");
  });

  test("configSchema validates confidence level bounds", () => {
    expect(growthOperatorConfigSchema.safeParse({ confidenceLevel: 0.5 }).success).toBe(false);
    expect(growthOperatorConfigSchema.safeParse({ confidenceLevel: 0.95 }).success).toBe(true);
  });

  test("defaultWorkflows returns 2 workflows", () => {
    const op = new GrowthOperator({});
    expect(op.defaultWorkflows()).toHaveLength(2);
  });

  test("first workflow trigger is manual", () => {
    const op = new GrowthOperator({});
    expect(op.defaultWorkflows()[0]!.trigger.type).toBe("manual");
  });

  test("experiment cycle has significance test step", () => {
    const op = new GrowthOperator({});
    const wf = op.defaultWorkflows()[0]!;
    expect(wf.steps.find((s) => s.id === "significance_test")).toBeDefined();
  });

  test("extract_learnings uses memory_write tool", () => {
    const op = new GrowthOperator({});
    const wf = op.defaultWorkflows()[0]!;
    const step = wf.steps.find((s) => s.id === "extract_learnings");
    expect(step?.tools).toContain("memory_write");
  });

  test("approval step included when approvalRequired=true", () => {
    const op = new GrowthOperator({ approvalRequired: true });
    const wf = op.defaultWorkflows()[0]!;
    expect(wf.steps.find((s) => s.id === "experiment_approval")).toBeDefined();
  });

  test("SEO optimisation workflow has keyword_research step", () => {
    const op = new GrowthOperator({});
    const wf = op.defaultWorkflows()[1]!;
    expect(wf.steps.find((s) => s.id === "keyword_research")).toBeDefined();
  });

  test("second workflow is cron triggered", () => {
    const op = new GrowthOperator({});
    expect(op.defaultWorkflows()[1]!.trigger.type).toBe("cron");
  });
});

// ---------------------------------------------------------------------------
// 5. CommunityOperator
// ---------------------------------------------------------------------------

describe("CommunityOperator", () => {
  test("default config produces a valid instance", () => {
    const op = new CommunityOperator({});
    expect(op.operatorType).toBe("community");
    expect(op.memoryNamespace).toBe("community");
  });

  test("configSchema rejects invalid channel", () => {
    const r = communityOperatorConfigSchema.safeParse({
      monitoredChannels: ["telegram"],
    });
    expect(r.success).toBe(false);
  });

  test("defaultWorkflows returns 1 workflow", () => {
    const op = new CommunityOperator({});
    expect(op.defaultWorkflows()).toHaveLength(1);
  });

  test("workflow trigger is cron with configured interval", () => {
    const op = new CommunityOperator({ pollIntervalMinutes: 30 });
    const wf = op.defaultWorkflows()[0]!;
    expect(wf.trigger.type).toBe("cron");
    expect((wf.trigger.config as { cron: string }).cron).toContain("30");
  });

  test("workflow has fetch → classify → context → draft → post → track steps", () => {
    const op = new CommunityOperator({ approvalRequired: false });
    const wf = op.defaultWorkflows()[0]!;
    const ids = wf.steps.map((s) => s.id);
    expect(ids).toContain("fetch_messages");
    expect(ids).toContain("classify_intent");
    expect(ids).toContain("retrieve_context");
    expect(ids).toContain("draft_responses");
    expect(ids).toContain("post_responses");
    expect(ids).toContain("track_engagement");
  });

  test("approval step present when approvalRequired=true", () => {
    const op = new CommunityOperator({ approvalRequired: true });
    const wf = op.defaultWorkflows()[0]!;
    expect(wf.steps.find((s) => s.id === "approval_gate")).toBeDefined();
  });

  test("no approval step when approvalRequired=false", () => {
    const op = new CommunityOperator({ approvalRequired: false });
    const wf = op.defaultWorkflows()[0]!;
    expect(wf.steps.find((s) => s.id === "approval_gate")).toBeUndefined();
  });

  test("classifies multiple intent filters", () => {
    const op = new CommunityOperator({
      intentFilters: ["question", "bug_report", "feature_request"],
    });
    const wf = op.defaultWorkflows()[0]!;
    const classifyStep = wf.steps.find((s) => s.id === "classify_intent");
    expect(classifyStep?.prompt).toContain("feature_request");
  });

  test("mock classification of community messages", () => {
    const op = new CommunityOperator({ monitoredChannels: ["discord", "reddit"] });
    const wf = op.defaultWorkflows()[0]!;
    const fetchStep = wf.steps.find((s) => s.id === "fetch_messages");
    expect(fetchStep?.config?.channels).toEqual(["discord", "reddit"]);
  });
});

// ---------------------------------------------------------------------------
// 6. FeedbackOperator
// ---------------------------------------------------------------------------

describe("FeedbackOperator", () => {
  test("default config produces a valid instance", () => {
    const op = new FeedbackOperator({});
    expect(op.operatorType).toBe("feedback");
    expect(op.memoryNamespace).toBe("feedback");
  });

  test("configSchema rejects invalid feedback source", () => {
    const r = feedbackOperatorConfigSchema.safeParse({
      feedbackSources: ["instagram"],
    });
    expect(r.success).toBe(false);
  });

  test("defaultWorkflows returns 1 workflow", () => {
    const op = new FeedbackOperator({});
    expect(op.defaultWorkflows()).toHaveLength(1);
  });

  test("workflow trigger is cron", () => {
    const op = new FeedbackOperator({});
    expect(op.defaultWorkflows()[0]!.trigger.type).toBe("cron");
  });

  test("workflow has all required steps", () => {
    const op = new FeedbackOperator({});
    const wf = op.defaultWorkflows()[0]!;
    const ids = wf.steps.map((s) => s.id);
    expect(ids).toContain("ingest_feedback");
    expect(ids).toContain("semantic_clustering");
    expect(ids).toContain("extract_insights");
    expect(ids).toContain("generate_report");
    expect(ids).toContain("notify_team");
  });

  test("check_volume condition step is included", () => {
    const op = new FeedbackOperator({});
    const wf = op.defaultWorkflows()[0]!;
    const vol = wf.steps.find((s) => s.id === "check_volume");
    expect(vol).toBeDefined();
    expect(vol!.type).toBe("condition");
  });

  test("clustering config uses configured cluster count", () => {
    const op = new FeedbackOperator({ clusterCount: 8 });
    const wf = op.defaultWorkflows()[0]!;
    const clusterStep = wf.steps.find((s) => s.id === "semantic_clustering");
    expect(clusterStep?.prompt).toContain("8");
  });

  test("notify_team step includes configured notification channels", () => {
    const op = new FeedbackOperator({ notificationChannels: ["slack", "discord"] });
    const wf = op.defaultWorkflows()[0]!;
    const notifyStep = wf.steps.find((s) => s.id === "notify_team");
    expect(notifyStep?.config?.channels).toEqual(["slack", "discord"]);
  });

  test("mock feedback clustering produces insight clusters", () => {
    const op = new FeedbackOperator({ clusterCount: 3 });
    const wf = op.defaultWorkflows()[0]!;
    const clusterStep = wf.steps.find((s) => s.id === "semantic_clustering");
    expect(clusterStep?.tools).toContain("embedding_cluster");
  });
});

// ---------------------------------------------------------------------------
// 7. DocumentationOperator
// ---------------------------------------------------------------------------

describe("DocumentationOperator", () => {
  test("default config produces a valid instance", () => {
    const op = new DocumentationOperator({});
    expect(op.operatorType).toBe("documentation");
    expect(op.memoryNamespace).toBe("documentation");
  });

  test("configSchema accepts valid config", () => {
    const r = docsOperatorConfigSchema.safeParse({
      repo: "acme/product",
      branch: "main",
      docsPlatform: "gitbook",
      changelogFormat: "conventional_commits",
    });
    expect(r.success).toBe(true);
  });

  test("defaultWorkflows returns 2 workflows", () => {
    const op = new DocumentationOperator({});
    expect(op.defaultWorkflows()).toHaveLength(2);
  });

  test("first workflow trigger is webhook on push", () => {
    const op = new DocumentationOperator({ repo: "acme/api" });
    const wf = op.defaultWorkflows()[0]!;
    expect(wf.trigger.type).toBe("webhook");
    expect((wf.trigger.config as { event: string }).event).toBe("push");
    expect((wf.trigger.config as { repo: string }).repo).toBe("acme/api");
  });

  test("workflow has fetch → generate → detect → cross_ref → draft → publish steps", () => {
    const op = new DocumentationOperator({ approvalRequired: false });
    const wf = op.defaultWorkflows()[0]!;
    const ids = wf.steps.map((s) => s.id);
    expect(ids).toContain("fetch_commits");
    expect(ids).toContain("generate_changelog_entry");
    expect(ids).toContain("detect_stale_docs");
    expect(ids).toContain("cross_ref_api_spec");
    expect(ids).toContain("draft_doc_updates");
    expect(ids).toContain("publish_docs");
  });

  test("approval step present when approvalRequired=true", () => {
    const op = new DocumentationOperator({ approvalRequired: true });
    const wf = op.defaultWorkflows()[0]!;
    expect(wf.steps.find((s) => s.id === "docs_approval")).toBeDefined();
  });

  test("second workflow is weekly stale content scan (cron)", () => {
    const op = new DocumentationOperator({});
    const wf = op.defaultWorkflows()[1]!;
    expect(wf.trigger.type).toBe("cron");
    expect(wf.steps.find((s) => s.id === "scan_all_docs")).toBeDefined();
    expect(wf.steps.find((s) => s.id === "prioritise_updates")).toBeDefined();
  });

  test("mock changelog ingestion generates formatted entry", () => {
    const op = new DocumentationOperator({ changelogFormat: "keepachangelog" });
    const wf = op.defaultWorkflows()[0]!;
    const genStep = wf.steps.find((s) => s.id === "generate_changelog_entry");
    expect(genStep?.prompt).toContain("keepachangelog");
  });
});

// ---------------------------------------------------------------------------
// 8. deployOperator Convex mutation
// ---------------------------------------------------------------------------

describe("deployOperator mutation", () => {
  test("deploys ContentOperator: creates operator + 2 workflows", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId, ownerId } = await scaffoldWorkspace(t);
    const authed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const result = await authed.mutation(async (ctx) => {
      return await deployOperatorImpl(ctx, {
        workspaceId,
        type: "content",
        rawConfig: { niche: "DevOps", approvalRequired: false },
      });
    });

    expect(result.operatorId).toBeTruthy();
    expect(result.workflowIds).toHaveLength(2);

    // Verify operator record
    const op = await t.run(async (ctx) => ctx.db.get(result.operatorId));
    expect(op?.type).toBe("content");
    expect(op?.status).toBe("active");
    expect(op?.memory).toEqual({ namespace: "content" });

    // Verify workflow records linked to operator
    const wf1 = await t.run(async (ctx) => ctx.db.get(result.workflowIds[0]!));
    expect(wf1?.operatorId).toBe(result.operatorId);
    expect(wf1?.status).toBe("active");
    expect(wf1?.steps).toBeDefined();
  });

  test("deploys GrowthOperator: creates operator + 2 workflows", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId } = await scaffoldWorkspace(t);
    const authed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const result = await authed.mutation(async (ctx) => {
      return await deployOperatorImpl(ctx, {
        workspaceId,
        type: "growth",
        rawConfig: {},
      });
    });

    expect(result.workflowIds).toHaveLength(2);
    const op = await t.run(async (ctx) => ctx.db.get(result.operatorId));
    expect(op?.type).toBe("growth");
  });

  test("deploys CommunityOperator: creates operator + 1 workflow", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId } = await scaffoldWorkspace(t);
    const authed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const result = await authed.mutation(async (ctx) => {
      return await deployOperatorImpl(ctx, {
        workspaceId,
        type: "community",
        rawConfig: { monitoredChannels: ["discord", "slack"] },
      });
    });

    expect(result.workflowIds).toHaveLength(1);
    const wf = await t.run(async (ctx) => ctx.db.get(result.workflowIds[0]!));
    expect((wf?.trigger as { type: string })?.type).toBe("cron");
  });

  test("deploys FeedbackOperator: creates operator + 1 workflow", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId } = await scaffoldWorkspace(t);
    const authed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const result = await authed.mutation(async (ctx) => {
      return await deployOperatorImpl(ctx, {
        workspaceId,
        type: "feedback",
        rawConfig: { clusterCount: 4, lookbackDays: 14 },
      });
    });

    expect(result.workflowIds).toHaveLength(1);
    const op = await t.run(async (ctx) => ctx.db.get(result.operatorId));
    expect(op?.type).toBe("feedback");
    expect((op?.config as { clusterCount?: number })?.clusterCount).toBe(4);
  });

  test("deploys DocumentationOperator: creates operator + 2 workflows", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId } = await scaffoldWorkspace(t);
    const authed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const result = await authed.mutation(async (ctx) => {
      return await deployOperatorImpl(ctx, {
        workspaceId,
        type: "documentation",
        rawConfig: { repo: "acme/docs", docsPlatform: "gitbook" },
      });
    });

    expect(result.workflowIds).toHaveLength(2);
    const wf = await t.run(async (ctx) => ctx.db.get(result.workflowIds[0]!));
    expect((wf?.trigger as { type: string })?.type).toBe("webhook");
  });

  test("creates workflowVersions records for each workflow", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId } = await scaffoldWorkspace(t);
    const authed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const result = await authed.mutation(async (ctx) => {
      return await deployOperatorImpl(ctx, {
        workspaceId,
        type: "content",
        rawConfig: {},
      });
    });

    const versions = await t.run(async (ctx) =>
      ctx.db
        .query("workflowVersions")
        .withIndex("by_workflow", (q) =>
          q.eq("workflowId", result.workflowIds[0]!)
        )
        .collect()
    );
    expect(versions).toHaveLength(1);
    expect(versions[0]!.version).toBe(1);
  });

  test("throws for unknown operator type", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId } = await scaffoldWorkspace(t);
    const authed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    await expect(
      authed.mutation(async (ctx) => {
        return await deployOperatorImpl(ctx, {
          workspaceId,
          type: "unknown_type",
          rawConfig: {},
        });
      })
    ).rejects.toThrow();
  });

  test("throws for invalid config (bad enum)", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId } = await scaffoldWorkspace(t);
    const authed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    await expect(
      authed.mutation(async (ctx) => {
        return await deployOperatorImpl(ctx, {
          workspaceId,
          type: "content",
          rawConfig: { contentTypes: ["invalid_type"] },
        });
      })
    ).rejects.toThrow();
  });

  test("throws when called by non-owner member", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId } = await scaffoldWorkspace(t);

    const memberId = await t.run(async (ctx) => {
      const now = Date.now();
      const uid = await ctx.db.insert("users", {
        clerkId: "clerk_member",
        email: "member@example.com",
        role: "member",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: uid,
        role: "member",
        joinedAt: now,
      });
      return uid;
    });
    void memberId;

    const memberAuthed = t.withIdentity(makeIdentity({ subject: "clerk_member" }));

    await expect(
      memberAuthed.mutation(async (ctx) => {
        return await deployOperatorImpl(ctx, {
          workspaceId,
          type: "content",
          rawConfig: {},
        });
      })
    ).rejects.toThrow();
  });

  test("operator config is persisted in the operator record", async () => {
    const t = convexTest({ schema, modules });
    const { workspaceId } = await scaffoldWorkspace(t);
    const authed = t.withIdentity(makeIdentity({ subject: "clerk_owner" }));

    const result = await authed.mutation(async (ctx) => {
      return await deployOperatorImpl(ctx, {
        workspaceId,
        type: "growth",
        rawConfig: {
          growthChannels: ["organic_search", "email"],
          minSampleSize: 1000,
        },
      });
    });

    const op = await t.run(async (ctx) => ctx.db.get(result.operatorId));
    expect((op?.config as { minSampleSize?: number })?.minSampleSize).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// 9. Memory namespace isolation
// ---------------------------------------------------------------------------

describe("Memory namespace isolation", () => {
  test("each operator type has a unique memory namespace", () => {
    const namespaces = [
      new ContentOperator({}).memoryNamespace,
      new GrowthOperator({}).memoryNamespace,
      new CommunityOperator({}).memoryNamespace,
      new FeedbackOperator({}).memoryNamespace,
      new DocumentationOperator({}).memoryNamespace,
    ];
    const unique = new Set(namespaces);
    expect(unique.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 10. Required integrations descriptors
// ---------------------------------------------------------------------------

describe("Required integrations", () => {
  test("ContentOperator lists perplexity and cms integrations", () => {
    const op = new ContentOperator({});
    const keys = op.requiredIntegrations.map((i) => i.key);
    expect(keys).toContain("perplexity");
    expect(keys).toContain("cms");
  });

  test("DocumentationOperator has required github integration", () => {
    const op = new DocumentationOperator({});
    const github = op.requiredIntegrations.find((i) => i.key === "github");
    expect(github?.required).toBe(true);
  });

  test("CommunityOperator lists channel-specific integrations", () => {
    const op = new CommunityOperator({});
    const keys = op.requiredIntegrations.map((i) => i.key);
    expect(keys).toContain("discord");
    expect(keys).toContain("github");
  });
});
