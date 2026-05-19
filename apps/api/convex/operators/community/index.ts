/**
 * Community Operator — Module Index
 *
 * Re-exports all community operator sub-modules.
 *
 * Phase 8.4 — Community Operator
 */

export {
  buildFirehoseQuery,
  deduplicateMentions,
  quickSentimentClassify,
  detectInteractionType,
  calculateEngagementPriority,
  classifyMention,
} from "./socialMonitoring";

export type { MonitoringRule, RawMention, FirehoseQuery } from "./socialMonitoring";

export {
  selectTone,
  validateResponse,
  requiresApproval,
  canPostResponse,
  createDailyTracker,
  recordResponse,
  formatForPlatform,
  PLATFORM_CONSTRAINTS,
} from "./engagementResponse";

export type {
  ResponseTone,
  PlatformConstraints,
  ResponseValidation,
  DailyResponseTracker,
} from "./engagementResponse";

export {
  classifyIssue,
  assessIssuePriority,
  needsReproductionSteps,
  generateTriageLabels,
  buildWelcomeTemplate,
  determineStaleAction,
  buildStaleMessage,
  TRIAGE_LABELS,
  PRIORITY_LABELS,
  STALE_THRESHOLDS,
} from "./githubEngagement";

export type {
  TriageResult,
  PRReviewSummary,
  WelcomeMessage,
  StaleIssue,
  ContributorCheckInput,
} from "./githubEngagement";
