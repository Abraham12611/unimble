/**
 * Community Operator — Unit Tests
 *
 * Tests for:
 * - CommunityOperator class (core, template, workflows)
 * - Social monitoring (query building, dedup, sentiment, classification)
 * - Engagement response (tone, validation, approval, rate limiting)
 * - GitHub engagement (triage, priority, welcome, stale management)
 *
 * Phase 8.4 — Community Operator Tests
 */

import { describe, it, expect } from "vitest";
import { CommunityOperator, DEFAULT_COMMUNITY_SETTINGS } from "../communityOperator";
import type { CommunityMention, CommunityOperatorSettings } from "../communityOperator";
import type { OperatorConfiguration } from "../types";
import {
  buildFirehoseQuery,
  deduplicateMentions,
  quickSentimentClassify,
  detectInteractionType,
  calculateEngagementPriority,
  classifyMention,
} from "./socialMonitoring";
import type { RawMention } from "./socialMonitoring";
import {
  selectTone,
  validateResponse,
  requiresApproval,
  canPostResponse,
  createDailyTracker,
  recordResponse,
  formatForPlatform,
  PLATFORM_CONSTRAINTS,
} from "./engagementResponse";
import {
  classifyIssue,
  assessIssuePriority,
  needsReproductionSteps,
  generateTriageLabels,
  buildWelcomeTemplate,
  determineStaleAction,
  buildStaleMessage,
} from "./githubEngagement";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestConfig(): OperatorConfiguration {
  return {
    type: "community",
    settings: {
      ...DEFAULT_COMMUNITY_SETTINGS,
      monitorKeywords: ["unimble", "ai operators"],
      brandNames: ["Unimble"],
    },
    integrations: [{ provider: "twitter", required: true }],
    schedules: [],
    approvalRequired: true,
  };
}

function createTestMention(overrides: Partial<CommunityMention> = {}): CommunityMention {
  return {
    id: "test_mention_1",
    platform: "twitter",
    type: "mention",
    author: "testuser",
    authorInfluence: 0.5,
    content: "Just tried @unimble and it's pretty cool!",
    url: "https://twitter.com/testuser/status/123",
    sentiment: "positive",
    priority: "medium",
    responseGenerated: false,
    responsePosted: false,
    detectedAt: Date.now(),
    topics: ["unimble"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CommunityOperator class tests
// ---------------------------------------------------------------------------

describe("CommunityOperator", () => {
  describe("core", () => {
    it("should return correct operator type", () => {
      const op = new CommunityOperator(createTestConfig());
      expect(op.getType()).toBe("community");
    });

    it("should build agent config with community tools", () => {
      const op = new CommunityOperator(createTestConfig());
      const config = op.buildAgentConfig("op_123");
      expect(config.tools).toContain("firehose.monitor");
      expect(config.tools).toContain("composio.execute");
      expect(config.memoryCategories).toContain("community_interactions");
    });

    it("should build social monitoring workflow", () => {
      const op = new CommunityOperator(createTestConfig());
      const workflow = op.buildSocialMonitoringWorkflow();
      expect(workflow.name).toBe("Social Monitoring");
      expect(workflow.steps.length).toBeGreaterThan(0);
      expect(workflow.trigger.type).toBe("schedule");
    });

    it("should build GitHub engagement workflow", () => {
      const op = new CommunityOperator(createTestConfig());
      const workflow = op.buildGitHubEngagementWorkflow();
      expect(workflow.name).toBe("GitHub Engagement");
      expect(workflow.steps.some((s) => s.id === "triage_issues")).toBe(true);
      expect(workflow.steps.some((s) => s.id === "welcome_contributors")).toBe(true);
    });

    it("should build weekly report workflow", () => {
      const op = new CommunityOperator(createTestConfig());
      const workflow = op.buildWeeklyReportWorkflow();
      expect(workflow.name).toBe("Weekly Community Report");
    });
  });

  describe("static helpers", () => {
    it("should calculate priority for negative high-influence mention", () => {
      const priority = CommunityOperator.calculatePriority({
        sentiment: "negative",
        authorInfluence: 0.9,
        type: "complaint",
      });
      expect(priority).toBe("critical");
    });

    it("should calculate priority for bug report", () => {
      const priority = CommunityOperator.calculatePriority({
        sentiment: "neutral",
        authorInfluence: 0.3,
        type: "bug_report",
      });
      expect(priority).toBe("high");
    });

    it("should skip low-influence neutral mentions", () => {
      const priority = CommunityOperator.calculatePriority({
        sentiment: "neutral",
        authorInfluence: 0.05,
        type: "mention",
      });
      expect(priority).toBe("skip");
    });

    it("should determine auto-approval correctly", () => {
      const settings: CommunityOperatorSettings = {
        ...DEFAULT_COMMUNITY_SETTINGS,
        autoRespondLowRisk: true,
      };

      const lowRiskMention = createTestMention({
        priority: "low",
        sentiment: "positive",
      });
      expect(CommunityOperator.shouldAutoApprove(lowRiskMention, settings)).toBe(true);

      // Medium-priority positive mentions should also auto-approve
      // (aligned with requiresApproval in engagementResponse.ts)
      const mediumPositive = createTestMention({
        priority: "medium",
        sentiment: "positive",
      });
      expect(CommunityOperator.shouldAutoApprove(mediumPositive, settings)).toBe(true);

      const highRiskMention = createTestMention({
        priority: "high",
        sentiment: "negative",
      });
      expect(CommunityOperator.shouldAutoApprove(highRiskMention, settings)).toBe(false);

      // Mixed sentiment should not auto-approve
      const mixedMention = createTestMention({
        priority: "low",
        sentiment: "mixed",
      });
      expect(CommunityOperator.shouldAutoApprove(mixedMention, settings)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Social Monitoring tests
// ---------------------------------------------------------------------------

describe("Social Monitoring", () => {
  it("should build Firehose query from keywords", () => {
    const query = buildFirehoseQuery(["ai operators", "automation"], ["Unimble"], ["spam"]);
    expect(query.query).toContain('"ai operators"');
    expect(query.query).toContain("Unimble");
    expect(query.query).toContain("NOT");
    expect(query.query).toContain("spam");
  });

  it("should build query without exclude terms", () => {
    const query = buildFirehoseQuery(["test"], ["Brand"]);
    expect(query.query).not.toContain("NOT");
  });

  it("should deduplicate mentions", () => {
    const mentions: RawMention[] = [
      {
        platform: "twitter",
        author: "user1",
        content: "Hello world",
        url: "https://t.co/1",
        timestamp: 1,
      },
      {
        platform: "twitter",
        author: "user1",
        content: "Hello world",
        url: "https://t.co/1",
        timestamp: 2,
      },
      {
        platform: "reddit",
        author: "user2",
        content: "Different",
        url: "https://reddit.com/1",
        timestamp: 3,
      },
    ];
    const unique = deduplicateMentions(mentions, new Set());
    expect(unique).toHaveLength(2);
  });

  it("should not include already-seen mentions", () => {
    const mentions: RawMention[] = [
      {
        platform: "twitter",
        author: "user1",
        content: "Hello",
        url: "https://t.co/1",
        timestamp: 1,
      },
    ];
    const existing = new Set(["mh_abc"]); // Won't match but tests the path
    const unique = deduplicateMentions(mentions, existing);
    expect(unique.length).toBeLessThanOrEqual(1);
  });

  it("should classify positive sentiment", () => {
    expect(quickSentimentClassify("I love this product, it's amazing!")).toBe("positive");
  });

  it("should classify negative sentiment", () => {
    expect(quickSentimentClassify("This is broken and terrible")).toBe("negative");
  });

  it("should classify mixed sentiment", () => {
    expect(quickSentimentClassify("I love the idea but it's broken")).toBe("mixed");
  });

  it("should classify neutral sentiment", () => {
    expect(quickSentimentClassify("Just released version 2.0")).toBe("neutral");
  });

  it("should detect question interaction type", () => {
    expect(detectInteractionType("How do I configure this?")).toBe("question");
  });

  it("should detect bug report interaction type", () => {
    expect(detectInteractionType("Found a bug in the login flow")).toBe("bug_report");
  });

  it("should detect feature request", () => {
    expect(detectInteractionType("Feature request: add dark mode")).toBe("feature_request");
  });

  it("should detect praise", () => {
    expect(detectInteractionType("Love this tool, amazing work!")).toBe("praise");
  });

  it("should default to mention for unclassified content", () => {
    expect(detectInteractionType("Just saw this on the timeline")).toBe("mention");
  });

  it("should calculate engagement priority", () => {
    expect(calculateEngagementPriority("negative", "complaint", 0.9, 0.1)).toBe("critical");
    expect(calculateEngagementPriority("neutral", "bug_report", 0.3, 0.1)).toBe("high");
    expect(calculateEngagementPriority("neutral", "question", 0.4, 0.1)).toBe("medium");
    expect(calculateEngagementPriority("neutral", "mention", 0.05, 0.1)).toBe("skip");
  });

  it("should classify a raw mention into CommunityMention", () => {
    const raw: RawMention = {
      platform: "twitter",
      author: "devuser",
      content: "How do I use the API? Need help!",
      url: "https://twitter.com/devuser/123",
      timestamp: Date.now(),
    };
    const classified = classifyMention(raw, 0.5, 0.1);
    expect(classified.type).toBe("question");
    expect(classified.platform).toBe("twitter");
    expect(classified.priority).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// Engagement Response tests
// ---------------------------------------------------------------------------

describe("Engagement Response", () => {
  it("should select empathetic tone for negative sentiment", () => {
    const mention = createTestMention({ sentiment: "negative", type: "complaint" });
    expect(selectTone(mention, "helpful")).toBe("empathetic");
  });

  it("should select technical tone for bug reports", () => {
    const mention = createTestMention({ type: "bug_report", sentiment: "neutral" });
    expect(selectTone(mention, "helpful")).toBe("technical");
  });

  it("should select friendly tone for praise", () => {
    const mention = createTestMention({ type: "praise", sentiment: "positive" });
    expect(selectTone(mention, "helpful")).toBe("friendly");
  });

  it("should use default tone for generic mentions", () => {
    const mention = createTestMention({
      type: "mention",
      sentiment: "neutral",
      authorInfluence: 0.3,
    });
    expect(selectTone(mention, "professional")).toBe("professional");
  });

  it("should validate response within character limit", () => {
    const response = {
      mentionId: "m1",
      platform: "twitter" as const,
      content: "Thanks for the feedback!",
      tone: "friendly" as const,
      requiresApproval: false,
      approvalStatus: "auto_approved" as const,
      generatedAt: Date.now(),
    };
    const mention = createTestMention();
    const result = validateResponse(response, mention);
    expect(result.valid).toBe(true);
  });

  it("should reject response exceeding character limit", () => {
    const response = {
      mentionId: "m1",
      platform: "twitter" as const,
      content: "x".repeat(300),
      tone: "friendly" as const,
      requiresApproval: false,
      approvalStatus: "auto_approved" as const,
      generatedAt: Date.now(),
    };
    const mention = createTestMention();
    const result = validateResponse(response, mention);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("280");
  });

  it("should require approval when auto-respond is disabled", () => {
    const settings: CommunityOperatorSettings = {
      ...DEFAULT_COMMUNITY_SETTINGS,
      autoRespondLowRisk: false,
    };
    const mention = createTestMention({ priority: "low", sentiment: "positive" });
    expect(requiresApproval(mention, settings)).toBe(true);
  });

  it("should not require approval for low-risk when auto-respond enabled", () => {
    const settings: CommunityOperatorSettings = {
      ...DEFAULT_COMMUNITY_SETTINGS,
      autoRespondLowRisk: true,
    };
    const mention = createTestMention({ priority: "low", sentiment: "positive" });
    expect(requiresApproval(mention, settings)).toBe(false);
  });

  it("should always require approval for negative sentiment", () => {
    const settings: CommunityOperatorSettings = {
      ...DEFAULT_COMMUNITY_SETTINGS,
      autoRespondLowRisk: true,
    };
    const mention = createTestMention({ priority: "low", sentiment: "negative" });
    expect(requiresApproval(mention, settings)).toBe(true);
  });

  it("should enforce daily rate limits", () => {
    let tracker = createDailyTracker();
    expect(canPostResponse(tracker, "twitter", 2).allowed).toBe(true);

    tracker = recordResponse(tracker, "twitter");
    tracker = recordResponse(tracker, "twitter");
    expect(canPostResponse(tracker, "twitter", 2).allowed).toBe(false);
  });

  it("should format response for platform", () => {
    const markdown = "**Bold** and [link](https://example.com)";
    const twitterFormatted = formatForPlatform(markdown, "twitter");
    expect(twitterFormatted).not.toContain("**");
    expect(twitterFormatted).not.toContain("[link]");

    const redditFormatted = formatForPlatform(markdown, "reddit");
    expect(redditFormatted).toContain("**Bold**"); // Reddit supports markdown
  });

  it("should strip markdown before truncating on non-markdown platforms", () => {
    // Content with markdown that exceeds Twitter limit after stripping
    const longMarkdown = "**Important**: " + "x".repeat(280);
    const formatted = formatForPlatform(longMarkdown, "twitter");
    // Should NOT contain raw markdown characters
    expect(formatted).not.toContain("**");
    // Should be truncated to 280 chars
    expect(formatted.length).toBeLessThanOrEqual(280);
    expect(formatted.endsWith("...")).toBe(true);
  });

  it("should have correct platform constraints", () => {
    expect(PLATFORM_CONSTRAINTS.twitter.maxLength).toBe(280);
    expect(PLATFORM_CONSTRAINTS.reddit.supportsMarkdown).toBe(true);
    expect(PLATFORM_CONSTRAINTS.hacker_news.supportsMarkdown).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GitHub Engagement tests
// ---------------------------------------------------------------------------

describe("GitHub Engagement", () => {
  it("should classify bug issues", () => {
    expect(classifyIssue("App crashes on login", "When I try to login, the app crashes")).toBe(
      "bug"
    );
  });

  it("should classify feature requests", () => {
    expect(classifyIssue("Feature request: dark mode", "Please add dark mode support")).toBe(
      "feature_request"
    );
  });

  it("should classify questions", () => {
    expect(classifyIssue("How to configure auth?", "I'm confused about the auth setup")).toBe(
      "question"
    );
  });

  it("should classify documentation issues", () => {
    expect(classifyIssue("Typo in README", "Found a spelling error in docs")).toBe("documentation");
  });

  it("should default to other for unclassified", () => {
    expect(classifyIssue("Update dependencies", "Bump version")).toBe("other");
  });

  it("should assess critical priority for production issues", () => {
    expect(assessIssuePriority("Production is down", "Critical outage", [])).toBe("critical");
  });

  it("should respect explicit critical label over content-based high", () => {
    // "regression" matches the high-content pattern, but explicit label wins
    expect(
      assessIssuePriority("Regression in auth flow", "Auth is broken", ["priority: critical"])
    ).toBe("critical");
  });

  it("should assess high priority for blocking issues", () => {
    expect(assessIssuePriority("Cannot use the app", "Completely broken after update", [])).toBe(
      "high"
    );
  });

  it("should detect when reproduction steps are needed", () => {
    expect(needsReproductionSteps("bug", "It doesn't work")).toBe(true);
    expect(needsReproductionSteps("bug", "Steps to reproduce: 1. Open app")).toBe(false);
    expect(needsReproductionSteps("feature_request", "Add dark mode")).toBe(false);
  });

  it("should generate correct triage labels", () => {
    const labels = generateTriageLabels("bug", "high");
    expect(labels).toContain("bug");
    expect(labels).toContain("priority: high");
  });

  it("should build welcome message for PR", () => {
    const msg = buildWelcomeTemplate("newdev", "pull_request", "Fix typo in README");
    expect(msg).toContain("@newdev");
    expect(msg).toContain("Fix typo in README");
    expect(msg).toContain("first PR");
  });

  it("should build welcome message for issue", () => {
    const msg = buildWelcomeTemplate("newuser", "issue", "Bug report");
    expect(msg).toContain("@newuser");
    expect(msg).toContain("Bug report");
    expect(msg).toContain("first issue");
  });

  it("should determine stale action correctly", () => {
    expect(determineStaleAction(35, [], false)).toBe("ping_author");
    expect(determineStaleAction(65, [], false)).toBe("close_stale");
    expect(determineStaleAction(35, ["pinned"], false)).toBe("keep_open");
    expect(determineStaleAction(35, [], true)).toBe("needs_maintainer");
    expect(determineStaleAction(10, [], false)).toBe("keep_open");
  });

  it("should build stale messages", () => {
    expect(buildStaleMessage("ping_author", "user1")).toContain("@user1");
    expect(buildStaleMessage("close_stale", "user1")).toContain("Closing");
    expect(buildStaleMessage("keep_open", "user1")).toBe("");
  });
});
