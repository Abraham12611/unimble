/**
 * Documentation Operator — Module Index
 *
 * Re-exports all documentation operator sub-modules.
 *
 * Phase 8.6 — Documentation Operator
 */

export {
  calculateFreshnessScore,
  determineDocStatus,
  calculateCoverageScore,
  calculateQualityScore,
  calculateAverageFreshness,
  compileCoverageReport,
  detectIssues,
  identifyGaps,
} from "./docAudit";

export {
  buildDocSkeleton,
  validateGeneratedDoc,
  categorizeCommit,
  formatChangelogEntry,
  estimateReadingTime,
  DOC_TEMPLATES,
} from "./docGeneration";

export type { GenerationInput, DocTemplate, ChangelogEntry, CodeExample } from "./docGeneration";
