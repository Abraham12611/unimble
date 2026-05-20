/**
 * Feedback Operator — Unit Tests
 *
 * Tests for:
 * - FeedbackOperator class (core, template, workflows, static helpers)
 * - Feedback collection (normalization, deduplication, NPS)
 * - Feedback analysis (categorization, sentiment, priority, themes, feature areas)
 * - Feedback synthesis (feature requests, bug patterns, reports)
 *
 * Phase 8.5 — Feedback Operator Tests
 */

import { describe, it, expect } from "vitest";
import { FeedbackOperator, DEFAULT_FEEDBACK_SETTINGS } from "../feedbackOperator";
import type { FeedbackItem } from "../feedbackOperator";
import type { OperatorConfiguration } from "../types";
import {
  normalizeRawFeedback,
  checkDuplicate,
  extractNpsScore,
  classifyNpsRespondent,
} from "./feedbackCollection";
import type { RawFeedback } from "./feedbackCollection";
import {
  categorizeFeedback,
  analyzeSentiment,
  sentimentToScore,
  calculatePriority,
  extractThemes,
  detectFeatureArea,
} from "./feedbackAnalysis";
import {
  groupFeatureRequests,
  calculateFeaturePriority,
  detectBugPatterns,
  compileSynthesisReport,
} from "./feedbackSynthesis";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestConfig(): OperatorConfiguration {
  return {
    type: "feedback",
    settings: { ...DEFAULT_FEEDBACK_SETTINGS },
    integrations: [{ provider: "intercom", required: true }],
    schedules: [],
    approvalRequired: false,
  };
}

function createTestFeedbackItem(overrides: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    id: `fb_${Math.random().toString(36).slice(2, 8)}`,
    source: "support_ticket",
    category: "bug",
    sentiment: "negative",
    priority: "medium",
    content: "The login page crashes when I enter my email",
    summary: "Login page crash on email input",
    author: "user@example.com",
    themes: ["login", "crash"],
    featureArea: "authentication",
    ingestedAt: Date.now(),
    addressed: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FeedbackOperator class tests
// ---------------------------------------------------------------------------

describe("FeedbackOperator", () => {
  describe("core", () => {
    it("should return correct operator type", () => {
      const op = new FeedbackOperator(createTestConfig());
      expect(op.getType()).toBe("feedback");
    });

    it("should build agent config with feedback tools", () => {
      const op = new FeedbackOperator(createTestConfig());
      const config = op.buildAgentConfig("op_123");
      expect(config.tools).toContain("composio.execute");
      expect(config.memoryCategories).toContain("feedback_history");
      expect(config.memoryCategories).toContain("feature_requests");
    });

    it("should build collection workflow", () => {
      const op = new FeedbackOperator(createTestConfig());
      const workflow = op.buildCollectionWorkflow();
      expect(workflow.name).toBe("Feedback Collection");
      expect(workflow.steps.length).toBeGreaterThan(0);
      expect(workflow.trigger.type).toBe("schedule");
    });

    it("should build analysis workflow", () => {
      const op = new FeedbackOperator(createTestConfig());
      const workflow = op.buildAnalysisWorkflow();
      expect(workflow.name).toBe("Feedback Analysis");
      expect(workflow.steps.some((s) => s.id === "extract_themes")).toBe(true);
      expect(workflow.steps.some((s) => s.id === "detect_patterns")).toBe(true);
    });

    it("should build synthesis workflow", () => {
      const op = new FeedbackOperator(createTestConfig());
      const workflow = op.buildSynthesisWorkflow();
      expect(workflow.name).toBe("Weekly Feedback Synthesis");
      expect(workflow.steps.some((s) => s.id === "generate_insights")).toBe(true);
    });
  });

  describe("static helpers", () => {
    it("should calculate priority for critical feedback", () => {
      const priority = FeedbackOperator.calculatePriority(
        "very_negative",
        "security",
        "enterprise",
        10
      );
      expect(priority).toBe("critical");
    });

    it("should calculate priority for low-priority feedback", () => {
      const priority = FeedbackOperator.calculatePriority("neutral", "documentation", undefined, 1);
      expect(priority).toBe("low");
    });

    it("should convert sentiment to score", () => {
      expect(FeedbackOperator.sentimentToScore("very_negative")).toBe(-1);
      expect(FeedbackOperator.sentimentToScore("neutral")).toBe(0);
      expect(FeedbackOperator.sentimentToScore("very_positive")).toBe(1);
    });

    it("should calculate NPS correctly", () => {
      // 3 promoters (9,10,9), 2 passives (7,8), 1 detractor (5)
      const nps = FeedbackOperator.calculateNps([9, 10, 9, 7, 8, 5]);
      // (3 - 1) / 6 * 100 = 33
      expect(nps).toBe(33);
    });

    it("should return 0 NPS for empty scores", () => {
      expect(FeedbackOperator.calculateNps([])).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Feedback Collection tests
// ---------------------------------------------------------------------------

describe("Feedback Collection", () => {
  it("should normalize support ticket data", () => {
    const raw = normalizeRawFeedback("support_ticket", {
      subject: "Login broken",
      body: "Can't log in since update",
      requester_email: "user@test.com",
      plan: "pro",
      ticket_id: "T-123",
      created_at: 1700000000000,
    });
    expect(raw.source).toBe("support_ticket");
    expect(raw.content).toContain("Login broken");
    expect(raw.content).toContain("Can't log in");
    expect(raw.author).toBe("user@test.com");
    expect(raw.authorTier).toBe("pro");
    expect(raw.externalRef).toBe("T-123");
  });

  it("should normalize app review data", () => {
    const raw = normalizeRawFeedback("app_review", {
      title: "Great app",
      body: "Love the features",
      author: "reviewer123",
      rating: 5,
      review_id: "R-456",
    });
    expect(raw.source).toBe("app_review");
    expect(raw.content).toContain("Great app");
    expect(raw.content).toContain("Love the features");
  });

  it("should normalize NPS response", () => {
    const raw = normalizeRawFeedback("nps_response", {
      score: 9,
      comment: "Really enjoying the product",
      email: "happy@user.com",
    });
    expect(raw.content).toContain("Score: 9/10");
    expect(raw.content).toContain("Really enjoying");
  });

  it("should detect duplicate by external reference", () => {
    const newItem: RawFeedback = {
      source: "support_ticket",
      content: "Something is broken",
      externalRef: "T-123",
      timestamp: Date.now(),
    };
    const existing = [
      {
        id: "fb_1",
        content: "Different text",
        externalRef: "T-123",
        source: "support_ticket" as const,
      },
    ];
    const result = checkDuplicate(newItem, existing);
    expect(result.isDuplicate).toBe(true);
    expect(result.existingId).toBe("fb_1");
  });

  it("should detect duplicate by content similarity", () => {
    const newItem: RawFeedback = {
      source: "support_ticket",
      content: "The login page crashes when I enter my email address",
      timestamp: Date.now(),
    };
    const existing = [
      {
        id: "fb_2",
        content: "The login page crashes when I enter my email",
        source: "support_ticket" as const,
      },
    ];
    const result = checkDuplicate(newItem, existing);
    expect(result.isDuplicate).toBe(true);
    expect(result.similarity).toBeGreaterThan(0.85);
  });

  it("should not flag different content as duplicate", () => {
    const newItem: RawFeedback = {
      source: "support_ticket",
      content: "I love the new dashboard design",
      timestamp: Date.now(),
    };
    const existing = [
      { id: "fb_3", content: "The billing page has an error", source: "support_ticket" as const },
    ];
    const result = checkDuplicate(newItem, existing);
    expect(result.isDuplicate).toBe(false);
  });

  it("should not flag short text items as duplicates (empty word set edge case)", () => {
    // Both items produce empty word sets after filtering (words <= 3 chars)
    const newItem: RawFeedback = {
      source: "in_app_feedback",
      content: "Bug",
      timestamp: Date.now(),
    };
    const existing = [{ id: "fb_4", content: "Fix it", source: "in_app_feedback" as const }];
    const result = checkDuplicate(newItem, existing);
    expect(result.isDuplicate).toBe(false);
  });

  it("should extract NPS score from content", () => {
    expect(extractNpsScore("Score: 9/10. Great product!")).toBe(9);
    expect(extractNpsScore("NPS: 3")).toBe(3);
    expect(extractNpsScore("No score here")).toBeNull();
    expect(extractNpsScore("Score: 15")).toBeNull(); // Out of range
  });

  it("should classify NPS respondents", () => {
    expect(classifyNpsRespondent(10)).toBe("promoter");
    expect(classifyNpsRespondent(9)).toBe("promoter");
    expect(classifyNpsRespondent(8)).toBe("passive");
    expect(classifyNpsRespondent(7)).toBe("passive");
    expect(classifyNpsRespondent(6)).toBe("detractor");
    expect(classifyNpsRespondent(0)).toBe("detractor");
  });
});

// ---------------------------------------------------------------------------
// Feedback Analysis tests
// ---------------------------------------------------------------------------

describe("Feedback Analysis", () => {
  it("should categorize bug feedback", () => {
    expect(categorizeFeedback("The app crashes when I click submit")).toBe("bug");
  });

  it("should categorize feature requests", () => {
    expect(categorizeFeedback("Feature request: please add dark mode")).toBe("feature_request");
  });

  it("should categorize security issues", () => {
    expect(categorizeFeedback("Found a security vulnerability in the auth flow")).toBe("security");
  });

  it("should categorize performance issues", () => {
    expect(categorizeFeedback("The dashboard is really slow to load")).toBe("performance");
  });

  it("should categorize usability issues", () => {
    expect(categorizeFeedback("The settings page is confusing and unintuitive")).toBe("usability");
  });

  it("should categorize pricing feedback", () => {
    expect(categorizeFeedback("The pro plan is too expensive for what you get")).toBe("pricing");
  });

  it("should default to other for unclassified", () => {
    expect(categorizeFeedback("Just wanted to say hello")).toBe("other");
  });

  it("should analyze very negative sentiment", () => {
    expect(analyzeSentiment("This is terrible and awful, worst product ever")).toBe(
      "very_negative"
    );
  });

  it("should analyze negative sentiment", () => {
    expect(analyzeSentiment("The app is slow and has issues")).toBe("negative");
  });

  it("should analyze positive sentiment", () => {
    expect(analyzeSentiment("Great product, very helpful and useful")).toBe("positive");
  });

  it("should analyze very positive sentiment", () => {
    expect(analyzeSentiment("I love this! Amazing and incredible, best ever!")).toBe(
      "very_positive"
    );
  });

  it("should analyze neutral sentiment", () => {
    expect(analyzeSentiment("I used the product today")).toBe("neutral");
  });

  it("should convert sentiment to numeric score", () => {
    expect(sentimentToScore("very_negative")).toBe(-1);
    expect(sentimentToScore("negative")).toBe(-0.5);
    expect(sentimentToScore("neutral")).toBe(0);
    expect(sentimentToScore("positive")).toBe(0.5);
    expect(sentimentToScore("very_positive")).toBe(1);
  });

  it("should calculate critical priority", () => {
    expect(calculatePriority("very_negative", "security", "enterprise", 10)).toBe("critical");
  });

  it("should calculate low priority", () => {
    expect(calculatePriority("neutral", "other", undefined, 1)).toBe("low");
  });

  it("should extract themes from feedback items", () => {
    const items: FeedbackItem[] = [
      createTestFeedbackItem({ themes: ["login", "crash"], id: "1" }),
      createTestFeedbackItem({ themes: ["login", "error"], id: "2" }),
      createTestFeedbackItem({ themes: ["login", "timeout"], id: "3" }),
      createTestFeedbackItem({ themes: ["billing", "charge"], id: "4" }),
    ];
    const themes = extractThemes(items, 3);
    expect(themes.length).toBe(1); // Only "login" has 3+ mentions
    expect(themes[0].name).toBe("login");
    expect(themes[0].frequency).toBe(3);
  });

  it("should detect rising trend when recent items outnumber older ones", () => {
    const now = Date.now();
    const items: FeedbackItem[] = [
      // 1 old item
      createTestFeedbackItem({ themes: ["perf"], id: "1", ingestedAt: now - 86400000 * 10 }),
      // 4 recent items (in the recent half of the time range)
      createTestFeedbackItem({ themes: ["perf"], id: "2", ingestedAt: now - 86400000 * 2 }),
      createTestFeedbackItem({ themes: ["perf"], id: "3", ingestedAt: now - 86400000 * 1 }),
      createTestFeedbackItem({ themes: ["perf"], id: "4", ingestedAt: now }),
      createTestFeedbackItem({ themes: ["perf"], id: "5", ingestedAt: now }),
    ];
    const themes = extractThemes(items, 3);
    expect(themes.length).toBe(1);
    expect(themes[0].trend).toBe("rising");
  });

  it("should detect declining trend when older items outnumber recent ones", () => {
    const now = Date.now();
    const items: FeedbackItem[] = [
      // 4 old items
      createTestFeedbackItem({ themes: ["old"], id: "1", ingestedAt: now - 86400000 * 10 }),
      createTestFeedbackItem({ themes: ["old"], id: "2", ingestedAt: now - 86400000 * 9 }),
      createTestFeedbackItem({ themes: ["old"], id: "3", ingestedAt: now - 86400000 * 8 }),
      createTestFeedbackItem({ themes: ["old"], id: "4", ingestedAt: now - 86400000 * 7 }),
      // 1 recent item
      createTestFeedbackItem({ themes: ["old"], id: "5", ingestedAt: now }),
    ];
    const themes = extractThemes(items, 3);
    expect(themes.length).toBe(1);
    expect(themes[0].trend).toBe("declining");
  });

  it("should detect feature area from content", () => {
    expect(detectFeatureArea("The login page has a bug")).toBe("authentication");
    expect(detectFeatureArea("Billing invoice is wrong")).toBe("billing");
    expect(detectFeatureArea("API endpoint returns 500")).toBe("api");
    expect(detectFeatureArea("Just a random comment")).toBeUndefined();
  });

  it("should detect custom feature areas", () => {
    expect(detectFeatureArea("The workflow editor is broken", ["workflow editor"])).toBe(
      "workflow editor"
    );
  });
});

// ---------------------------------------------------------------------------
// Feedback Synthesis tests
// ---------------------------------------------------------------------------

describe("Feedback Synthesis", () => {
  it("should group feature requests from feedback items", () => {
    const items: FeedbackItem[] = [
      createTestFeedbackItem({
        id: "1",
        category: "feature_request",
        content: "Please add dark mode to the dashboard",
        summary: "Add dark mode",
        themes: ["dark", "mode", "dashboard"],
      }),
      createTestFeedbackItem({
        id: "2",
        category: "feature_request",
        content: "Would love dark mode support",
        summary: "Dark mode support",
        themes: ["dark", "mode"],
      }),
    ];
    const requests = groupFeatureRequests(items);
    // Both should be grouped into one request (theme overlap)
    expect(requests.length).toBeGreaterThanOrEqual(1);
  });

  it("should calculate feature priority score", () => {
    const highPriority = calculateFeaturePriority({
      id: "fr_1",
      title: "Popular feature",
      description: "Many people want this",
      requestCount: 25,
      priorityScore: 0,
      status: "new",
      feedbackIds: Array(25).fill("x"),
      estimatedImpact: "high",
      firstRequestedAt: Date.now() - 86400000, // 1 day ago
    });
    expect(highPriority).toBeGreaterThan(0.7);

    const lowPriority = calculateFeaturePriority({
      id: "fr_2",
      title: "Niche feature",
      description: "One person wants this",
      requestCount: 1,
      priorityScore: 0,
      status: "new",
      feedbackIds: ["x"],
      estimatedImpact: "low",
      firstRequestedAt: Date.now() - 86400000 * 120, // 120 days ago
    });
    expect(lowPriority).toBeLessThan(0.3);
  });

  it("should return 0 priority for shipped features", () => {
    const shipped = calculateFeaturePriority({
      id: "fr_3",
      title: "Done",
      description: "Already shipped",
      requestCount: 10,
      priorityScore: 0,
      status: "shipped",
      feedbackIds: Array(10).fill("x"),
      estimatedImpact: "high",
      firstRequestedAt: Date.now(),
    });
    expect(shipped).toBe(0);
  });

  it("should detect bug patterns", () => {
    const items: FeedbackItem[] = [
      createTestFeedbackItem({
        id: "1",
        category: "bug",
        featureArea: "authentication",
        sentiment: "negative",
      }),
      createTestFeedbackItem({
        id: "2",
        category: "bug",
        featureArea: "authentication",
        sentiment: "very_negative",
      }),
      createTestFeedbackItem({
        id: "3",
        category: "bug",
        featureArea: "billing",
        sentiment: "negative",
      }),
    ];
    const patterns = detectBugPatterns(items);
    expect(patterns.length).toBe(1); // Only auth has 2+ reports
    expect(patterns[0].featureArea).toBe("authentication");
    expect(patterns[0].reportCount).toBe(2);
  });

  it("should compile synthesis report", () => {
    const items: FeedbackItem[] = [
      createTestFeedbackItem({ source: "support_ticket", category: "bug", sentiment: "negative" }),
      createTestFeedbackItem({
        source: "app_review",
        category: "feature_request",
        sentiment: "positive",
      }),
      createTestFeedbackItem({
        source: "support_ticket",
        category: "bug",
        sentiment: "very_negative",
      }),
    ];
    const report = compileSynthesisReport(
      items,
      [],
      [],
      [],
      { start: "2026-05-13", end: "2026-05-20" },
      [9, 8, 6, 10, 7]
    );
    expect(report.totalItems).toBe(3);
    expect(report.bySource.support_ticket).toBe(2);
    expect(report.byCategory.bug).toBe(2);
    expect(report.npsScore).toBeDefined();
    expect(report.insights.length).toBeGreaterThan(0);
  });
});
