"use node";

/**
 * Community Operator — GitHub Engagement
 *
 * Handles GitHub-specific community interactions:
 * - Issue triage (labeling, prioritization, initial response)
 * - PR review assistance
 * - First-time contributor welcoming
 * - Stale issue management
 *
 * Phase 8.4.4 — GitHub Engagement
 */

import type { EngagementPriority } from "../communityOperator";

// ---------------------------------------------------------------------------
// GitHub types
// ---------------------------------------------------------------------------

/** Issue triage result. */
export interface TriageResult {
  /** Issue number */
  issueNumber: number;
  /** Repository */
  repo: string;
  /** Assigned labels */
  labels: string[];
  /** Priority assessment */
  priority: EngagementPriority;
  /** Category */
  category: "bug" | "feature_request" | "question" | "documentation" | "enhancement" | "other";
  /** Whether a response was generated */
  hasResponse: boolean;
  /** Generated response (if any) */
  response?: string;
  /** Whether reproduction steps are needed */
  needsReproduction: boolean;
  /** Suggested assignee (if determinable) */
  suggestedAssignee?: string;
}

/** PR review summary. */
export interface PRReviewSummary {
  /** PR number */
  prNumber: number;
  /** Repository */
  repo: string;
  /** PR title */
  title: string;
  /** Author */
  author: string;
  /** Whether author is first-time contributor */
  isFirstTime: boolean;
  /** Files changed count */
  filesChanged: number;
  /** Lines added/removed */
  linesChanged: { added: number; removed: number };
  /** Review complexity (simple/moderate/complex) */
  complexity: "simple" | "moderate" | "complex";
  /** Auto-generated review notes */
  reviewNotes?: string;
}

/** Welcome message for new contributors. */
export interface WelcomeMessage {
  /** GitHub username */
  username: string;
  /** Repository */
  repo: string;
  /** PR or issue number */
  number: number;
  /** Type of contribution */
  contributionType: "issue" | "pull_request";
  /** Generated welcome message */
  message: string;
}

/** Stale issue detection result. */
export interface StaleIssue {
  /** Issue number */
  number: number;
  /** Repository */
  repo: string;
  /** Days since last activity */
  daysSinceActivity: number;
  /** Recommended action */
  action: "ping_author" | "close_stale" | "needs_maintainer" | "keep_open";
  /** Generated follow-up message */
  followUpMessage?: string;
}

// ---------------------------------------------------------------------------
// Issue triage logic
// ---------------------------------------------------------------------------

/** Label mapping for issue categories. */
export const TRIAGE_LABELS: Record<TriageResult["category"], string> = {
  bug: "bug",
  feature_request: "enhancement",
  question: "question",
  documentation: "documentation",
  enhancement: "enhancement",
  other: "needs-triage",
};

/** Priority label mapping. */
export const PRIORITY_LABELS: Record<EngagementPriority, string | null> = {
  critical: "priority: critical",
  high: "priority: high",
  medium: "priority: medium",
  low: "priority: low",
  skip: null,
};

/**
 * Classifies an issue into a category based on title and body content.
 */
export function classifyIssue(title: string, body: string): TriageResult["category"] {
  const combined = `${title} ${body}`.toLowerCase();

  // Documentation indicators (check first — "typo" and "docs" are strong signals)
  if (/\b(docs|documentation|readme|typo|spelling|grammar)\b/.test(combined)) {
    return "documentation";
  }

  // Feature request indicators
  if (
    /\b(feature request|feature:|would be nice|please add|suggestion|proposal)\b/.test(combined)
  ) {
    return "feature_request";
  }

  // Question indicators
  if (
    /\b(how (do|can|to)|what (is|are)|why (does|is)|question|help|confused)\b/.test(combined) ||
    title.endsWith("?")
  ) {
    return "question";
  }

  // Bug indicators
  if (
    /\b(bug|crash(?:es|ed)?|error|broken|regression|not working|fails?|exception)\b/.test(combined)
  ) {
    return "bug";
  }

  // Enhancement indicators
  if (/\b(improve|enhancement|optimize|refactor|better)\b/.test(combined)) {
    return "enhancement";
  }

  return "other";
}

/**
 * Assesses issue priority based on content signals.
 */
export function assessIssuePriority(
  title: string,
  body: string,
  labels: string[]
): EngagementPriority {
  const combined = `${title} ${body}`.toLowerCase();

  // Critical: production down, data loss, security
  if (
    /\b(production|data loss|security|vulnerability|critical|urgent|emergency)\b/.test(combined)
  ) {
    return "critical";
  }

  // High: blocking issues, crashes
  if (/\b(blocking|crash|cannot use|completely broken|regression)\b/.test(combined)) {
    return "high";
  }

  // Check existing labels
  if (labels.some((l) => l.includes("critical") || l.includes("urgent"))) {
    return "critical";
  }

  // Medium: bugs, important features
  if (/\b(bug|error|not working|feature request)\b/.test(combined)) {
    return "medium";
  }

  return "low";
}

/**
 * Determines if an issue needs reproduction steps.
 */
export function needsReproductionSteps(category: TriageResult["category"], body: string): boolean {
  if (category !== "bug") return false;

  const lower = body.toLowerCase();

  // Check if reproduction steps are already provided
  const hasSteps =
    /\b(steps to reproduce|reproduction|how to reproduce|repro steps)\b/.test(lower) ||
    /\b(1\.|step 1|first,)\b/.test(lower);

  return !hasSteps;
}

/**
 * Generates triage labels for an issue.
 */
export function generateTriageLabels(
  category: TriageResult["category"],
  priority: EngagementPriority
): string[] {
  const labels: string[] = [];

  // Category label
  const categoryLabel = TRIAGE_LABELS[category];
  if (categoryLabel) labels.push(categoryLabel);

  // Priority label
  const priorityLabel = PRIORITY_LABELS[priority];
  if (priorityLabel) labels.push(priorityLabel);

  return labels;
}

// ---------------------------------------------------------------------------
// Contributor detection
// ---------------------------------------------------------------------------

/**
 * Checks if a user is a first-time contributor to a repository.
 * This is a helper that structures the check — actual API call is done by the agent.
 */
export interface ContributorCheckInput {
  /** GitHub username */
  username: string;
  /** Repository (owner/repo) */
  repo: string;
  /** Type of contribution */
  type: "issue" | "pull_request";
  /** Number of the issue/PR */
  number: number;
}

/**
 * Builds a welcome message template for first-time contributors.
 */
export function buildWelcomeTemplate(
  username: string,
  contributionType: "issue" | "pull_request",
  title: string
): string {
  if (contributionType === "pull_request") {
    return `Hey @${username}! 👋 Welcome to the project and thanks for your first PR!

I see you're working on: **${title}**

A maintainer will review this soon. In the meantime:
- Make sure CI checks pass
- Check the contributing guidelines if you haven't already
- Feel free to ask questions in the PR comments

Thanks for contributing! 🎉`;
  }

  return `Hey @${username}! 👋 Thanks for opening your first issue: **${title}**

We appreciate you taking the time to report this. A maintainer will take a look soon.

In the meantime, if this is a bug report, please make sure you've included:
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, version, etc.)

Thanks! 🙏`;
}

// ---------------------------------------------------------------------------
// Stale issue management
// ---------------------------------------------------------------------------

/** Default stale thresholds. */
export const STALE_THRESHOLDS = {
  /** Days before an issue is considered stale */
  staleDays: 30,
  /** Days before a stale issue should be closed */
  closeDays: 60,
  /** Labels that prevent auto-closing */
  exemptLabels: ["pinned", "keep-open", "in-progress", "priority: critical", "priority: high"],
};

/**
 * Determines the action to take on a stale issue.
 */
export function determineStaleAction(
  daysSinceActivity: number,
  labels: string[],
  hasAssignee: boolean
): StaleIssue["action"] {
  // Don't touch exempt issues
  if (labels.some((l) => STALE_THRESHOLDS.exemptLabels.includes(l))) {
    return "keep_open";
  }

  // If assigned, ping the maintainer
  if (hasAssignee && daysSinceActivity > STALE_THRESHOLDS.staleDays) {
    return "needs_maintainer";
  }

  // Close if very stale
  if (daysSinceActivity > STALE_THRESHOLDS.closeDays) {
    return "close_stale";
  }

  // Ping author if moderately stale
  if (daysSinceActivity > STALE_THRESHOLDS.staleDays) {
    return "ping_author";
  }

  return "keep_open";
}

/**
 * Builds a stale issue follow-up message.
 */
export function buildStaleMessage(action: StaleIssue["action"], author: string): string {
  switch (action) {
    case "ping_author":
      return `Hey @${author}, this issue has been inactive for a while. Is this still relevant? If so, could you provide any updates? If not, we'll close it in 30 days. Thanks!`;
    case "close_stale":
      return `Closing this issue due to inactivity. If this is still relevant, feel free to reopen it with updated information. Thanks!`;
    case "needs_maintainer":
      return `This assigned issue has been inactive. Pinging the assignee for an update.`;
    default:
      return "";
  }
}
