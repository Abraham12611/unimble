/**
 * Growth Operator — Module Index
 *
 * Re-exports all growth operator sub-modules for convenient imports.
 *
 * Phase 8.3 — Growth Operator
 */

export {
  buildHypothesisPromptContext,
  calculateSampleSize,
  estimateDuration,
  validateExperimentDesign,
  getSuggestedMetrics,
  SUGGESTED_METRICS,
} from "./experimentDesign";

export type {
  HypothesisInput,
  GeneratedHypothesis,
  ExperimentDesignParams,
  ExperimentDesignOutput,
} from "./experimentDesign";

export {
  validateTrafficAllocation,
  createEqualAllocation,
  initializeExecutionState,
  updateVariantProgress,
  isDataCollectionComplete,
  evaluateEarlyStopping,
} from "./experimentExecution";

export type {
  ExecutionConfig,
  ExecutionState,
  VariantProgress,
  ExecutionError,
  DistributionRequest,
  DistributionResult,
  EarlyStopDecision,
} from "./experimentExecution";

export { analyzeExperiment } from "./experimentAnalysis";

export type {
  AnalysisInput,
  AnalysisOutput,
  StatisticalDetails,
  DetailedVariantStats,
  ExtractedLearning,
} from "./experimentAnalysis";

export {
  buildKeywordOverviewRequest,
  buildKeywordSuggestionsRequest,
  buildRankedKeywordsRequest,
  buildSerpCompetitorsRequest,
  buildLLMMentionsRequest,
  buildSearchVolumeRequest,
  buildBulkTrafficRequest,
  parseKeywordOverviewResponse,
  parseRankedKeywordsResponse,
  generateOptimizations,
  buildPerformanceSummary,
} from "./seoOptimization";

export type {
  KeywordResearchResult,
  RankingCheckResult,
  AEOVisibilityResult,
  ContentOptimization,
  SEOPerformanceSummary,
  DataForSEORequest,
} from "./seoOptimization";
