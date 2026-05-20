/**
 * Feedback Operator — Module Index
 *
 * Re-exports all feedback operator sub-modules.
 *
 * Phase 8.5 — Feedback Operator
 */

export {
  normalizeRawFeedback,
  checkDuplicate,
  extractNpsScore,
  classifyNpsRespondent,
} from "./feedbackCollection";

export type { RawFeedback, CollectionResult, DeduplicationResult } from "./feedbackCollection";

export {
  categorizeFeedback,
  analyzeSentiment,
  sentimentToScore,
  calculatePriority,
  extractThemes,
  detectFeatureArea,
} from "./feedbackAnalysis";

export {
  groupFeatureRequests,
  calculateFeaturePriority,
  detectBugPatterns,
  compileSynthesisReport,
} from "./feedbackSynthesis";
