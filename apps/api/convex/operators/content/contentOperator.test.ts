/**
 * Content Operator — Tests
 *
 * Tests for Phase 8.2:
 * - ContentOperator class (8.2.1)
 * - Topic Research (8.2.2)
 * - Content Generation (8.2.3)
 * - Content Review (8.2.4)
 * - Content Publishing (8.2.5)
 * - Content Analytics (8.2.6)
 */

import { describe, it, expect, vi } from "vitest";
import { ContentOperator } from "../contentOperator";
import type { OperatorConfiguration } from "../types";
import {
  researchTopics,
  type TopicResearchConfig,
} from "./topicResearch";
import {
  generateContent,
  analyzeSEO,
  type ContentGenerationConfig,
} from "./contentGeneration";
import {
  reviewContent,
  createDefaultReviewConfig,
  shouldRevise,
  buildRevisionInstructions,
} from "./contentReview";
import {
  publishContent,
  suggestPublishTime,
  schedulePublication,
  type PublishingConfig,
} from "./contentPublishing";
import {
  aggregateMetrics,
  extractLearnings,
  generateReport,
  type ContentPerformanceRecord,
} from "./contentAnalytics";
import type { ContentTopic, ContentDraft } from "../contentOperator";

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createTestConfig(): OperatorConfiguration {
  return {
    type: "content",
    settings: {
      content_style: "technical",
      target_audience: "intermediate",
      weekly_content_target: 2,
      topics_focus: ["React Native", "subscriptions", "mobile development"],
      approval_required: true,
    },
    integrations: [
      { provider: "wordpress", integrationId: "int_123", required: true, category: "cms" },
      { provider: "twitter", integrationId: "int_456", required: false, category: "social" },
    ],
    schedules: [
      { workflowId: "weekly-content-pipeline", cron: "0 9 * * MON", timezone: "America/New_York", enabled: true },
    ],
    approvalRequired: true,
  };
}

function createTestTopic(): ContentTopic {
  return {
    title: "Building Offline-First React Native Apps",
    description: "A guide to implementing offline-first architecture in React Native",
    contentType: "tutorial",
    relevanceScore: 0.85,
    trendScore: 0.7,
    competitionScore: 0.4,
    priorityScore: 0.78,
    keywords: ["react native", "offline-first", "mobile", "sync"],
    source: "research",
    audienceLevel: "intermediate",
    estimatedWordCount: 2500,
  };
}

function createTestDraft(): ContentDraft {
  return {
    title: "Building Offline-First React Native Apps",
    markdown: `# Building Offline-First React Native Apps

## Introduction

Building offline-first mobile apps is essential for providing a great user experience. In this tutorial, we'll explore how to implement offline-first architecture in React Native.

## Why Offline-First?

Mobile users frequently encounter poor connectivity. An offline-first approach ensures your app remains functional regardless of network conditions.

## Implementation

\`\`\`typescript
import { createSyncEngine } from '@react-native-sync/core';

const syncEngine = createSyncEngine({
  storage: 'sqlite',
  conflictResolution: 'last-write-wins',
});
\`\`\`

## Conclusion

Offline-first architecture significantly improves user experience in mobile apps.`,
    metaDescription: "Learn how to build offline-first React Native apps with sync capabilities",
    excerpt: "Building offline-first mobile apps is essential for providing a great user experience.",
    tags: ["react native", "offline-first", "mobile", "tutorial"],
    slug: "building-offline-first-react-native-apps",
    wordCount: 120,
    readingTimeMinutes: 1,
    imageSuggestions: [],
    status: "drafting",
    revisionCount: 0,
  };
}

function createTestPerformanceRecords(): ContentPerformanceRecord[] {
  return [
    {
      contentId: "c1",
      title: "React Native Performance Tips",
      contentType: "blog_post",
      publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      analytics: { contentId: "c1", views: 5000, uniqueVisitors: 3500, avgTimeOnPage: 180, bounceRate: 0.4, socialShares: 120, comments: 15, backlinks: 5, searchImpressions: 8000, searchClicks: 400, avgSearchPosition: 12 },
      keywords: ["react native", "performance"],
      wordCount: 1800,
    },
    {
      contentId: "c2",
      title: "Subscription Monetization Guide",
      contentType: "guide",
      publishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      analytics: { contentId: "c2", views: 8000, uniqueVisitors: 6000, avgTimeOnPage: 240, bounceRate: 0.3, socialShares: 200, comments: 30, backlinks: 12, searchImpressions: 15000, searchClicks: 800, avgSearchPosition: 8 },
      keywords: ["subscriptions", "monetization", "mobile"],
      wordCount: 3200,
    },
    {
      contentId: "c3",
      title: "Flutter vs React Native 2026",
      contentType: "comparison",
      publishedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      analytics: { contentId: "c3", views: 12000, uniqueVisitors: 9000, avgTimeOnPage: 200, bounceRate: 0.35, socialShares: 350, comments: 45, backlinks: 20, searchImpressions: 25000, searchClicks: 1500, avgSearchPosition: 5 },
      keywords: ["flutter", "react native", "comparison"],
      wordCount: 2500,
    },
    {
      contentId: "c4",
      title: "Setting Up CI/CD for Mobile",
      contentType: "tutorial",
      publishedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      analytics: { contentId: "c4", views: 3000, uniqueVisitors: 2200, avgTimeOnPage: 300, bounceRate: 0.25, socialShares: 80, comments: 10, backlinks: 3, searchImpressions: 5000, searchClicks: 250, avgSearchPosition: 18 },
      keywords: ["ci/cd", "mobile", "automation"],
      wordCount: 2000,
    },
    {
      contentId: "c5",
      title: "Mobile App Analytics Deep Dive",
      contentType: "blog_post",
      publishedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
      analytics: { contentId: "c5", views: 2000, uniqueVisitors: 1500, avgTimeOnPage: 150, bounceRate: 0.5, socialShares: 40, comments: 5, backlinks: 1, searchImpressions: 3000, searchClicks: 100, avgSearchPosition: 25 },
      keywords: ["analytics", "mobile"],
      wordCount: 1200,
    },
  ];
}

// ---------------------------------------------------------------------------
// 8.2.1 — Content Operator Core Tests
// ---------------------------------------------------------------------------

describe("ContentOperator", () => {
  describe("Core (8.2.1)", () => {
    it("creates a ContentOperator instance", () => {
      const config = createTestConfig();
      const operator = new ContentOperator(config);
      expect(operator).toBeInstanceOf(ContentOperator);
    });

    it("returns the correct operator type", () => {
      const operator = new ContentOperator(createTestConfig());
      expect(operator.getType()).toBe("content");
    });

    it("returns the content operator template", () => {
      const operator = new ContentOperator(createTestConfig());
      const template = operator.getTemplate();
      expect(template.id).toBe("content-operator");
      expect(template.type).toBe("content");
      expect(template.name).toBe("Content Operator");
    });

    it("builds agent config with content-specific tools", () => {
      const operator = new ContentOperator(createTestConfig());
      const agentConfig = operator.buildAgentConfig("op_123");
      expect(agentConfig.tools).toContain("perplexity.search");
      expect(agentConfig.tools).toContain("firecrawl.scrape");
      expect(agentConfig.tools).toContain("firecrawl.crawl");
      expect(agentConfig.tools).toContain("composio.execute");
      expect(agentConfig.tools).toContain("memory.read");
      expect(agentConfig.tools).toContain("memory.write");
    });

    it("builds agent config with extended memory categories", () => {
      const operator = new ContentOperator(createTestConfig());
      const agentConfig = operator.buildAgentConfig("op_123");
      expect(agentConfig.memoryCategories).toContain("content_performance");
      expect(agentConfig.memoryCategories).toContain("audience_feedback");
    });

    it("builds agent config with higher max iterations", () => {
      const operator = new ContentOperator(createTestConfig());
      const agentConfig = operator.buildAgentConfig("op_123");
      expect(agentConfig.maxIterations).toBe(20);
    });

    it("returns default persona (technical-writer)", () => {
      const operator = new ContentOperator(createTestConfig());
      const persona = operator.getDefaultPersona();
      expect(persona).toBeDefined();
      expect(persona!.identity.name).toBe("Alex");
    });

    it("builds weekly pipeline workflow", () => {
      const operator = new ContentOperator(createTestConfig());
      const workflow = operator.buildWeeklyPipelineWorkflow("op_123");
      expect(workflow.name).toBe("Weekly Content Pipeline");
      expect(workflow.trigger.type).toBe("schedule");
      expect(workflow.steps.length).toBeGreaterThan(6);
      // Verify revision path leads to its own publish step
      const revisionStep = workflow.steps.find((s) => s.id === "revision");
      const publishRevisedStep = workflow.steps.find((s) => s.id === "publish_revised");
      const publishStep = workflow.steps.find((s) => s.id === "publish");
      expect(revisionStep).toBeDefined();
      expect(publishRevisedStep).toBeDefined();
      expect(publishStep).toBeDefined();
      // Each publish step depends only on its own branch (no cross-branch deps)
      expect(publishStep!.dependsOn).toContain("human_approval");
      expect(publishStep!.dependsOn).not.toContain("revision_approval");
      expect(publishRevisedStep!.dependsOn).toContain("revision_approval");
      expect(publishRevisedStep!.dependsOn).not.toContain("human_approval");
    });

    it("builds on-demand workflow", () => {
      const operator = new ContentOperator(createTestConfig());
      const workflow = operator.buildOnDemandWorkflow("op_123");
      expect(workflow.name).toBe("On-Demand Content");
      expect(workflow.trigger.type).toBe("manual");
      expect(workflow.steps.length).toBe(3);
    });

    it("calculates topic priority correctly", () => {
      const priority = ContentOperator.calculateTopicPriority({
        relevanceScore: 0.9,
        trendScore: 0.8,
        competitionScore: 0.3,
      });
      // 0.9*0.4 + 0.8*0.35 + (1-0.3)*0.25 = 0.36 + 0.28 + 0.175 = 0.815
      expect(priority).toBeCloseTo(0.815, 2);
    });

    it("estimates reading time", () => {
      expect(ContentOperator.estimateReadingTime(225)).toBe(1);
      expect(ContentOperator.estimateReadingTime(450)).toBe(2);
      expect(ContentOperator.estimateReadingTime(2000)).toBe(9);
    });

    it("generates URL-friendly slugs", () => {
      expect(ContentOperator.generateSlug("Hello World!")).toBe("hello-world");
      expect(ContentOperator.generateSlug("React Native: A Complete Guide")).toBe("react-native-a-complete-guide");
      expect(ContentOperator.generateSlug("10 Tips & Tricks for Mobile Dev")).toBe("10-tips-tricks-for-mobile-dev");
    });
  });
});

// ---------------------------------------------------------------------------
// 8.2.4 — Content Review Tests
// ---------------------------------------------------------------------------

describe("Content Review (8.2.4)", () => {
  it("creates default review config for tutorials", () => {
    const topic = createTestTopic();
    const config = createDefaultReviewConfig(topic, {});
    expect(config.reviewTypes).toContain("technical");
    expect(config.reviewTypes).toContain("editorial");
    expect(config.reviewTypes).toContain("factual");
    expect(config.reviewTypes).toContain("seo");
  });

  it("creates default review config for blog posts (no technical)", () => {
    const topic = { ...createTestTopic(), contentType: "blog_post" as const };
    const config = createDefaultReviewConfig(topic, {});
    expect(config.reviewTypes).not.toContain("technical");
    expect(config.reviewTypes).toContain("editorial");
  });

  it("shouldRevise returns approve for approved content", () => {
    const result = shouldRevise(
      { verdict: "approve", overallScore: 8.5, scores: {}, issues: [], metadata: { durationMs: 0, cost: 0, reviewTypesPerformed: 3 } },
      0,
      3
    );
    expect(result.action).toBe("approve");
  });

  it("shouldRevise returns reject for rejected content", () => {
    const result = shouldRevise(
      { verdict: "reject", overallScore: 3.0, scores: {}, issues: [], metadata: { durationMs: 0, cost: 0, reviewTypesPerformed: 3 } },
      0,
      3
    );
    expect(result.action).toBe("reject");
  });

  it("shouldRevise returns escalate when max revisions reached", () => {
    const result = shouldRevise(
      { verdict: "revise", overallScore: 6.5, scores: {}, issues: [], metadata: { durationMs: 0, cost: 0, reviewTypesPerformed: 3 } },
      3,
      3
    );
    expect(result.action).toBe("escalate");
  });

  it("shouldRevise returns revise when under max revisions", () => {
    const result = shouldRevise(
      { verdict: "revise", overallScore: 6.5, scores: {}, issues: [{ severity: "should_fix", category: "editorial", description: "Fix grammar" }], metadata: { durationMs: 0, cost: 0, reviewTypesPerformed: 3 } },
      1,
      3
    );
    expect(result.action).toBe("revise");
  });

  it("shouldRevise escalates when too many must_fix issues", () => {
    const issues = Array.from({ length: 6 }, (_, i) => ({
      severity: "must_fix" as const,
      category: "technical",
      description: `Critical issue ${i + 1}`,
    }));
    const result = shouldRevise(
      { verdict: "revise", overallScore: 5.0, scores: {}, issues, metadata: { durationMs: 0, cost: 0, reviewTypesPerformed: 3 } },
      0,
      3
    );
    expect(result.action).toBe("escalate");
  });

  it("buildRevisionInstructions formats issues correctly", () => {
    const result = buildRevisionInstructions({
      verdict: "revise",
      overallScore: 6.5,
      scores: { technical: 7, editorial: 6 },
      issues: [
        { severity: "must_fix", category: "technical", description: "Code has syntax error", suggestion: "Fix line 15" },
        { severity: "should_fix", category: "editorial", description: "Paragraph too long" },
        { severity: "consider", category: "seo", description: "Add more keywords" },
      ],
      metadata: { durationMs: 0, cost: 0, reviewTypesPerformed: 3 },
    });

    expect(result).toContain("Must Fix");
    expect(result).toContain("Code has syntax error");
    expect(result).toContain("Fix line 15");
    expect(result).toContain("Should Fix");
    expect(result).toContain("Paragraph too long");
    expect(result).toContain("Consider");
  });
});

// ---------------------------------------------------------------------------
// 8.2.3 — Content Generation Tests (SEO Analysis)
// ---------------------------------------------------------------------------

describe("Content Generation (8.2.3)", () => {
  describe("SEO Analysis", () => {
    it("analyzes keyword density", () => {
      const draft = createTestDraft();
      const analysis = analyzeSEO(draft, ["react native", "offline"]);

      expect(analysis.keywordAnalysis).toHaveLength(2);
      expect(analysis.keywordAnalysis[0].keyword).toBe("react native");
      expect(analysis.keywordAnalysis[0].occurrences).toBeGreaterThan(0);
      expect(analysis.keywordAnalysis[0].inTitle).toBe(true);
    });

    it("checks heading structure", () => {
      const draft = createTestDraft();
      const analysis = analyzeSEO(draft, ["react native"]);

      expect(analysis.structureChecks.hasH1).toBe(true);
      expect(analysis.structureChecks.hasH2).toBe(true);
      expect(analysis.structureChecks.headingCount).toBeGreaterThan(0);
    });

    it("generates SEO suggestions", () => {
      const draft = { ...createTestDraft(), metaDescription: "Short" };
      const analysis = analyzeSEO(draft, ["react native"]);

      expect(analysis.suggestions.length).toBeGreaterThan(0);
      expect(analysis.suggestions.some((s) => s.includes("meta description"))).toBe(true);
    });

    it("returns a score between 0 and 10", () => {
      const draft = createTestDraft();
      const analysis = analyzeSEO(draft, ["react native"]);

      expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
      expect(analysis.overallScore).toBeLessThanOrEqual(10);
    });
  });
});

// ---------------------------------------------------------------------------
// 8.2.5 — Content Publishing Tests
// ---------------------------------------------------------------------------

describe("Content Publishing (8.2.5)", () => {
  it("suggests publish time for blog posts", () => {
    const suggestion = suggestPublishTime("blog_post", "America/New_York");
    expect(suggestion.dayOfWeek).toBe("Tuesday");
    expect(suggestion.hour).toBe(10);
    expect(suggestion.reason).toContain("America/New_York");
  });

  it("suggests publish time for tutorials", () => {
    const suggestion = suggestPublishTime("tutorial", "UTC");
    expect(suggestion.dayOfWeek).toBe("Wednesday");
    expect(suggestion.hour).toBe(9);
  });

  it("schedules publication", () => {
    const draft = createTestDraft();
    const config: PublishingConfig = {
      workspaceId: "ws_123",
      primaryCms: "wordpress",
      publishStatus: "draft",
    };
    const result = schedulePublication(draft, "2026-06-01T10:00:00Z", config);
    expect(result.scheduledAt).toBe("2026-06-01T10:00:00Z");
    expect(result.platform).toBe("wordpress");
    expect(result.status).toBe("scheduled");
  });
});

// ---------------------------------------------------------------------------
// 8.2.6 — Content Analytics Tests
// ---------------------------------------------------------------------------

describe("Content Analytics (8.2.6)", () => {
  describe("aggregateMetrics", () => {
    it("aggregates metrics correctly", () => {
      const records = createTestPerformanceRecords();
      const metrics = aggregateMetrics(records, "30d");

      expect(metrics.totalPublished).toBe(5);
      expect(metrics.totalViews).toBe(30000);
      expect(metrics.avgViews).toBe(6000);
      expect(metrics.totalShares).toBe(790);
      expect(metrics.topPerformers).toHaveLength(5);
    });

    it("returns empty metrics for no records", () => {
      const metrics = aggregateMetrics([], "30d");
      expect(metrics.totalPublished).toBe(0);
      expect(metrics.totalViews).toBe(0);
      expect(metrics.trend).toBe("stable");
    });

    it("identifies top performers", () => {
      const records = createTestPerformanceRecords();
      const metrics = aggregateMetrics(records, "all");

      expect(metrics.topPerformers[0].title).toBe("Flutter vs React Native 2026");
    });
  });

  describe("extractLearnings", () => {
    it("extracts learnings from performance data", () => {
      const records = createTestPerformanceRecords();
      const learnings = extractLearnings(records);

      expect(learnings.length).toBeGreaterThan(0);
      expect(learnings.every((l) => l.confidence > 0)).toBe(true);
      expect(learnings.every((l) => l.recommendation.length > 0)).toBe(true);
    });

    it("returns empty for insufficient data", () => {
      const learnings = extractLearnings([createTestPerformanceRecords()[0]]);
      expect(learnings).toHaveLength(0);
    });

    it("identifies keyword patterns", () => {
      const records = createTestPerformanceRecords();
      const learnings = extractLearnings(records);

      const keywordLearning = learnings.find((l) => l.category === "keyword");
      if (keywordLearning) {
        expect(keywordLearning.insight).toContain("react native");
      }
    });
  });

  describe("generateReport", () => {
    it("generates a complete report", () => {
      const records = createTestPerformanceRecords();
      const report = generateReport(records, "30d");

      expect(report.period).toBe("30d");
      expect(report.generatedAt).toBeDefined();
      expect(report.metrics.totalPublished).toBe(5);
      expect(report.learnings.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it("includes comparison when previous period provided", () => {
      const records = createTestPerformanceRecords();
      // Create previous period records with different (lower) metrics
      const previousRecords: ContentPerformanceRecord[] = records.map((r) => ({
        ...r,
        publishedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
        analytics: { ...r.analytics, views: Math.round(r.analytics.views * 0.7) },
      }));
      const report = generateReport(records, "30d", previousRecords);

      expect(report.comparison).toBeDefined();
      expect(report.comparison!.viewsChange).toBeGreaterThan(0); // Current > previous
    });
  });
});
