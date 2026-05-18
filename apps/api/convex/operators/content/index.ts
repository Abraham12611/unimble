/**
 * Content Operator — Module Exports
 *
 * Barrel file for the content operator sub-modules.
 * Phase 8.2 — Content Operator
 */

export { researchTopics, type TopicResearchConfig, type TopicResearchResult, type TopicCandidate } from "./topicResearch";
export { generateContent, analyzeSEO, type ContentGenerationConfig, type ContentGenerationResult, type SEOAnalysis } from "./contentGeneration";
export { reviewContent, createDefaultReviewConfig, shouldRevise, buildRevisionInstructions, type ContentReviewConfig, type ContentReviewResult, type ContentReviewIssue } from "./contentReview";
export { publishContent, schedulePublication, suggestPublishTime, type PublishingConfig, type PublishingWorkflowResult, type PublishResult } from "./contentPublishing";
export { aggregateMetrics, extractLearnings, generateReport, type ContentPerformanceRecord, type AggregatedMetrics, type ContentLearning, type ContentReport } from "./contentAnalytics";
