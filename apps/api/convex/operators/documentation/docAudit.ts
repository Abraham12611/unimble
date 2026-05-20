"use node";

/**
 * Documentation Operator — Documentation Audit
 *
 * Handles coverage analysis, freshness checking, accuracy verification,
 * and gap detection for existing documentation.
 *
 * Phase 8.6.2 — Documentation Audit
 */

import type {
  DocPage,
  DocStatus,
  DocIssue,
  DocGap,
  DocType,
  CoverageReport,
} from "../documentationOperator";

// ---------------------------------------------------------------------------
// Freshness checking
// ---------------------------------------------------------------------------

/**
 * Calculates freshness score for a page (0-1).
 * 1.0 = just updated, decays linearly to 0 over 2x threshold.
 */
export function calculateFreshnessScore(
  lastUpdatedAt: number,
  stalenessThresholdDays: number
): number {
  const daysSinceUpdate = (Date.now() - lastUpdatedAt) / 86400000;
  if (daysSinceUpdate <= 0) return 1;
  if (daysSinceUpdate >= stalenessThresholdDays * 2) return 0;
  return Math.max(0, 1 - daysSinceUpdate / (stalenessThresholdDays * 2));
}

/**
 * Determines documentation status based on age and code changes.
 */
export function determineDocStatus(
  lastUpdatedAt: number,
  stalenessThresholdDays: number,
  hasRelatedCodeChanges: boolean
): DocStatus {
  const daysSinceUpdate = (Date.now() - lastUpdatedAt) / 86400000;

  if (hasRelatedCodeChanges) return "outdated";
  if (daysSinceUpdate > stalenessThresholdDays * 2) return "outdated";
  if (daysSinceUpdate > stalenessThresholdDays) return "stale";
  return "current";
}

// ---------------------------------------------------------------------------
// Coverage analysis
// ---------------------------------------------------------------------------

/**
 * Calculates overall coverage score from page statuses.
 * Coverage = (current + draft pages) / total pages.
 */
export function calculateCoverageScore(pages: DocPage[]): number {
  if (pages.length === 0) return 0;
  const healthy = pages.filter((p) => p.status === "current" || p.status === "draft").length;
  return healthy / pages.length;
}

/**
 * Calculates average quality score across all audited pages.
 */
export function calculateQualityScore(pages: DocPage[]): number {
  const scored = pages.filter((p) => p.qualityScore !== undefined);
  if (scored.length === 0) return 0;
  return scored.reduce((sum, p) => sum + (p.qualityScore ?? 0), 0) / scored.length;
}

/**
 * Calculates average freshness score across all pages.
 */
export function calculateAverageFreshness(
  pages: DocPage[],
  stalenessThresholdDays: number
): number {
  if (pages.length === 0) return 0;
  const total = pages.reduce(
    (sum, p) => sum + calculateFreshnessScore(p.lastUpdatedAt, stalenessThresholdDays),
    0
  );
  return total / pages.length;
}

/**
 * Compiles a full coverage report from tracked pages.
 */
export function compileCoverageReport(
  pages: DocPage[],
  gaps: DocGap[],
  stalenessThresholdDays: number
): CoverageReport {
  const byStatus: Record<DocStatus, number> = {
    current: 0,
    stale: 0,
    outdated: 0,
    missing: 0,
    draft: 0,
  };
  const byType: Partial<Record<DocType, number>> = {};

  for (const page of pages) {
    byStatus[page.status]++;
    byType[page.type] = (byType[page.type] ?? 0) + 1;
  }

  const urgentPages = pages.filter(
    (p) => p.status === "outdated" || p.issues.some((i) => i.severity === "critical")
  );

  return {
    totalPages: pages.length,
    byStatus,
    byType,
    coverageScore: calculateCoverageScore(pages),
    freshnessScore: calculateAverageFreshness(pages, stalenessThresholdDays),
    qualityScore: calculateQualityScore(pages),
    gaps,
    urgentPages: urgentPages.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Issue detection
// ---------------------------------------------------------------------------

/**
 * Detects common documentation issues from page content.
 */
export function detectIssues(
  content: string,
  lastUpdatedAt: number,
  stalenessThresholdDays: number,
  hasRelatedCodeChanges: boolean
): DocIssue[] {
  const issues: DocIssue[] = [];

  // Staleness check
  const daysSinceUpdate = (Date.now() - lastUpdatedAt) / 86400000;
  if (hasRelatedCodeChanges) {
    issues.push({
      type: "stale",
      severity: "critical",
      description: "Related code has changed since this page was last updated",
      suggestedFix: "Review and update documentation to reflect code changes",
    });
  } else if (daysSinceUpdate > stalenessThresholdDays * 2) {
    issues.push({
      type: "stale",
      severity: "major",
      description: `Page has not been updated in ${Math.floor(daysSinceUpdate)} days`,
      suggestedFix: "Review page for accuracy and update if needed",
    });
  } else if (daysSinceUpdate > stalenessThresholdDays) {
    issues.push({
      type: "stale",
      severity: "minor",
      description: `Page is approaching staleness (${Math.floor(daysSinceUpdate)} days old)`,
    });
  }

  // Broken link detection (simple pattern)
  const brokenLinkPatterns = /\[([^\]]+)\]\((?:(?!https?:\/\/)(?!#)(?!\/))[^)]*\)/g;
  if (brokenLinkPatterns.test(content)) {
    issues.push({
      type: "broken_link",
      severity: "minor",
      description: "Potentially broken relative links detected",
      suggestedFix: "Verify all relative links resolve correctly",
    });
  }

  // Missing code examples
  if (!content.includes("```") && content.length > 500) {
    issues.push({
      type: "missing_example",
      severity: "minor",
      description: "No code examples found in a page with substantial content",
      suggestedFix: "Add practical code examples to illustrate usage",
    });
  }

  // Incomplete content (very short pages)
  if (content.length < 200 && content.length > 0) {
    issues.push({
      type: "incomplete",
      severity: "major",
      description: "Page content is very short (< 200 characters)",
      suggestedFix: "Expand with more detail, examples, and context",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Gap detection helpers
// ---------------------------------------------------------------------------

/**
 * Identifies documentation gaps from a list of code entities.
 */
export function identifyGaps(
  codeEntities: Array<{ name: string; type: string; path: string; isPublic: boolean }>,
  existingDocs: DocPage[]
): DocGap[] {
  const gaps: DocGap[] = [];
  const documentedPaths = new Set(existingDocs.flatMap((d) => d.relatedCodePaths));

  for (const entity of codeEntities) {
    if (!entity.isPublic) continue;

    // Check if this entity has documentation
    const isDocumented =
      documentedPaths.has(entity.path) ||
      existingDocs.some((d) => d.title.toLowerCase().includes(entity.name.toLowerCase()));

    if (!isDocumented) {
      const suggestedType = suggestDocType(entity.type);
      gaps.push({
        area: entity.name,
        suggestedType,
        priority: entity.type === "api" || entity.type === "class" ? "high" : "medium",
        reason: `Public ${entity.type} "${entity.name}" has no documentation`,
      });
    }
  }

  return gaps.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Suggests the appropriate doc type for a code entity.
 */
function suggestDocType(entityType: string): DocType {
  switch (entityType) {
    case "api":
    case "endpoint":
    case "function":
    case "class":
      return "api_reference";
    case "workflow":
    case "process":
      return "guide";
    case "feature":
      return "tutorial";
    default:
      return "api_reference";
  }
}
