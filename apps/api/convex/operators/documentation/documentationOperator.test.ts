/**
 * Documentation Operator — Unit Tests
 *
 * Tests for:
 * - DocumentationOperator class (core, template, workflows, static helpers)
 * - Documentation audit (freshness, coverage, issues, gaps)
 * - Documentation generation (templates, validation, changelog)
 *
 * Phase 8.6 — Documentation Operator Tests
 */

import { describe, it, expect } from "vitest";
import { DocumentationOperator, DEFAULT_DOC_SETTINGS } from "../documentationOperator";
import type { DocPage } from "../documentationOperator";
import type { OperatorConfiguration } from "../types";
import {
  calculateFreshnessScore,
  determineDocStatus,
  calculateCoverageScore,
  calculateQualityScore,
  compileCoverageReport,
  detectIssues,
  identifyGaps,
} from "./docAudit";
import {
  buildDocSkeleton,
  validateGeneratedDoc,
  categorizeCommit,
  formatChangelogEntry,
  estimateReadingTime,
  DOC_TEMPLATES,
} from "./docGeneration";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestConfig(): OperatorConfiguration {
  return {
    type: "documentation",
    settings: { ...DEFAULT_DOC_SETTINGS, repositoryUrl: "https://github.com/test/repo" },
    integrations: [{ provider: "github", required: true, category: "code" }],
    schedules: [],
    approvalRequired: false,
  };
}

function createTestDocPage(overrides: Partial<DocPage> = {}): DocPage {
  return {
    id: `doc_${Math.random().toString(36).slice(2, 8)}`,
    title: "Getting Started",
    path: "/docs/getting-started",
    type: "guide",
    status: "current",
    lastUpdatedAt: Date.now() - 86400000 * 5, // 5 days ago
    relatedCodePaths: ["src/index.ts"],
    wordCount: 1200,
    hasCodeExamples: true,
    qualityScore: 0.85,
    issues: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DocumentationOperator class tests
// ---------------------------------------------------------------------------

describe("DocumentationOperator", () => {
  describe("core", () => {
    it("should return correct operator type", () => {
      const op = new DocumentationOperator(createTestConfig());
      expect(op.getType()).toBe("documentation");
    });

    it("should build agent config with documentation tools", () => {
      const op = new DocumentationOperator(createTestConfig());
      const config = op.buildAgentConfig("op_123");
      expect(config.tools).toContain("firecrawl.scrape");
      expect(config.tools).toContain("composio.execute");
      expect(config.memoryCategories).toContain("documentation_state");
    });

    it("should build audit workflow", () => {
      const op = new DocumentationOperator(createTestConfig());
      const workflow = op.buildAuditWorkflow();
      expect(workflow.name).toBe("Documentation Audit");
      expect(workflow.steps.some((s) => s.id === "check_freshness")).toBe(true);
      expect(workflow.steps.some((s) => s.id === "detect_gaps")).toBe(true);
    });

    it("should build generation workflow", () => {
      const op = new DocumentationOperator(createTestConfig());
      const workflow = op.buildGenerationWorkflow();
      expect(workflow.name).toBe("Documentation Generation");
      expect(workflow.steps.some((s) => s.id === "validate_examples")).toBe(true);
      expect(workflow.trigger.type).toBe("manual");
    });

    it("should build changelog workflow", () => {
      const op = new DocumentationOperator(createTestConfig());
      const workflow = op.buildChangelogWorkflow();
      expect(workflow.name).toBe("Changelog Generation");
      expect(workflow.steps.some((s) => s.id === "generate_changelog")).toBe(true);
    });
  });

  describe("static helpers", () => {
    it("should calculate freshness score for recent page", () => {
      const score = DocumentationOperator.calculateFreshnessScore(Date.now(), 30);
      expect(score).toBe(1);
    });

    it("should calculate freshness score for old page", () => {
      const score = DocumentationOperator.calculateFreshnessScore(
        Date.now() - 86400000 * 60, // 60 days ago
        30
      );
      expect(score).toBe(0);
    });

    it("should calculate freshness score for mid-age page", () => {
      const score = DocumentationOperator.calculateFreshnessScore(
        Date.now() - 86400000 * 30, // 30 days ago (threshold)
        30
      );
      expect(score).toBeCloseTo(0.5, 1);
    });

    it("should determine status as outdated when code changed", () => {
      const status = DocumentationOperator.determineStatus(Date.now(), 30, true);
      expect(status).toBe("outdated");
    });

    it("should determine status as current for recent page", () => {
      const status = DocumentationOperator.determineStatus(Date.now(), 30, false);
      expect(status).toBe("current");
    });

    it("should determine status as stale for old page", () => {
      const status = DocumentationOperator.determineStatus(Date.now() - 86400000 * 35, 30, false);
      expect(status).toBe("stale");
    });

    it("should calculate coverage score", () => {
      const pages: DocPage[] = [
        createTestDocPage({ status: "current" }),
        createTestDocPage({ status: "current" }),
        createTestDocPage({ status: "stale" }),
        createTestDocPage({ status: "outdated" }),
      ];
      expect(DocumentationOperator.calculateCoverageScore(pages)).toBe(0.5);
    });

    it("should estimate reading time", () => {
      expect(DocumentationOperator.estimateReadingTime(400)).toBe(2);
      expect(DocumentationOperator.estimateReadingTime(100)).toBe(1);
      expect(DocumentationOperator.estimateReadingTime(1000)).toBe(5);
    });
  });
});

// ---------------------------------------------------------------------------
// Documentation Audit tests
// ---------------------------------------------------------------------------

describe("Documentation Audit", () => {
  it("should calculate freshness score correctly", () => {
    expect(calculateFreshnessScore(Date.now(), 30)).toBe(1);
    expect(calculateFreshnessScore(Date.now() - 86400000 * 60, 30)).toBe(0);
  });

  it("should determine doc status", () => {
    expect(determineDocStatus(Date.now(), 30, false)).toBe("current");
    expect(determineDocStatus(Date.now(), 30, true)).toBe("outdated");
    expect(determineDocStatus(Date.now() - 86400000 * 35, 30, false)).toBe("stale");
    expect(determineDocStatus(Date.now() - 86400000 * 65, 30, false)).toBe("outdated");
  });

  it("should calculate coverage score", () => {
    const pages: DocPage[] = [
      createTestDocPage({ status: "current" }),
      createTestDocPage({ status: "draft" }),
      createTestDocPage({ status: "outdated" }),
    ];
    expect(calculateCoverageScore(pages)).toBeCloseTo(0.667, 2);
  });

  it("should calculate quality score", () => {
    const pages: DocPage[] = [
      createTestDocPage({ qualityScore: 0.9 }),
      createTestDocPage({ qualityScore: 0.7 }),
      createTestDocPage({ qualityScore: undefined }),
    ];
    expect(calculateQualityScore(pages)).toBe(0.8);
  });

  it("should compile coverage report", () => {
    const pages: DocPage[] = [
      createTestDocPage({ status: "current", type: "guide" }),
      createTestDocPage({ status: "stale", type: "api_reference" }),
      createTestDocPage({
        status: "outdated",
        type: "tutorial",
        issues: [{ type: "stale", severity: "critical", description: "test" }],
      }),
    ];
    const report = compileCoverageReport(pages, [], 30);
    expect(report.totalPages).toBe(3);
    expect(report.byStatus.current).toBe(1);
    expect(report.byStatus.stale).toBe(1);
    expect(report.urgentPages).toHaveLength(1);
  });

  it("should detect staleness issues", () => {
    const issues = detectIssues("Some content", Date.now() - 86400000 * 65, 30, false);
    expect(issues.some((i) => i.type === "stale" && i.severity === "major")).toBe(true);
  });

  it("should detect critical staleness when code changed", () => {
    const issues = detectIssues("Some content", Date.now(), 30, true);
    expect(issues.some((i) => i.type === "stale" && i.severity === "critical")).toBe(true);
  });

  it("should detect missing code examples", () => {
    const longContent = "x".repeat(600); // No code blocks
    const issues = detectIssues(longContent, Date.now(), 30, false);
    expect(issues.some((i) => i.type === "missing_example")).toBe(true);
  });

  it("should detect incomplete content", () => {
    const issues = detectIssues("Short.", Date.now(), 30, false);
    expect(issues.some((i) => i.type === "incomplete")).toBe(true);
  });

  it("should identify documentation gaps", () => {
    const entities = [
      { name: "createUser", type: "function", path: "src/users/create.ts", isPublic: true },
      { name: "deleteUser", type: "function", path: "src/users/delete.ts", isPublic: true },
      { name: "internalHelper", type: "function", path: "src/utils.ts", isPublic: false },
    ];
    const existingDocs = [
      createTestDocPage({ title: "createUser API", relatedCodePaths: ["src/users/create.ts"] }),
    ];
    const gaps = identifyGaps(entities, existingDocs);
    // deleteUser is public and undocumented, internalHelper is private (skipped)
    expect(gaps).toHaveLength(1);
    expect(gaps[0].area).toBe("deleteUser");
  });
});

// ---------------------------------------------------------------------------
// Documentation Generation tests
// ---------------------------------------------------------------------------

describe("Documentation Generation", () => {
  it("should have templates for all doc types", () => {
    expect(DOC_TEMPLATES.api_reference).toBeDefined();
    expect(DOC_TEMPLATES.tutorial).toBeDefined();
    expect(DOC_TEMPLATES.changelog).toBeDefined();
    expect(DOC_TEMPLATES.runbook).toBeDefined();
  });

  it("should build doc skeleton with required sections", () => {
    const skeleton = buildDocSkeleton("api_reference", "User API", DEFAULT_DOC_SETTINGS);
    expect(skeleton).toContain("# User API");
    expect(skeleton).toContain("## Overview");
    expect(skeleton).toContain("## Parameters");
    expect(skeleton).toContain("## Returns");
    expect(skeleton).toContain("## Examples");
  });

  it("should include language-specific example blocks", () => {
    const settings = { ...DEFAULT_DOC_SETTINGS, languages: ["python", "go"] };
    const skeleton = buildDocSkeleton("tutorial", "Getting Started", settings);
    expect(skeleton).toContain("### python");
    expect(skeleton).toContain("### go");
  });

  it("should validate generated doc with all required sections", () => {
    const content = `# API
## Overview
Some overview text about the API and how it works in detail for developers.
## Parameters
- param1: string — the first parameter description
- param2: number — the second parameter description
## Returns
Returns a result object containing the processed data and metadata.
## Examples
\`\`\`typescript
const result = api.call({ param1: "hello", param2: 42 });
console.log(result);
\`\`\`
${" word".repeat(250)}`;
    const result = validateGeneratedDoc(content, "api_reference");
    expect(result.valid).toBe(true);
  });

  it("should reject doc missing required sections", () => {
    const content = "# API\n## Overview\nJust an overview, nothing else.";
    const result = validateGeneratedDoc(content, "api_reference");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Parameters"))).toBe(true);
  });

  it("should reject doc without code examples when required", () => {
    const content = `# Tutorial
## Introduction
Intro text.
## Prerequisites
None.
## Steps
Step 1, step 2.
## Conclusion
Done. ${"x ".repeat(400)}`;
    const result = validateGeneratedDoc(content, "tutorial");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("code examples"))).toBe(true);
  });

  it("should categorize conventional commits", () => {
    expect(categorizeCommit("feat(auth): add SSO support")).toEqual({
      category: "added",
      description: "add SSO support",
    });
    expect(categorizeCommit("fix(api): resolve timeout issue")).toEqual({
      category: "fixed",
      description: "resolve timeout issue",
    });
    expect(categorizeCommit("perf(db): optimize query")).toEqual({
      category: "changed",
      description: "Performance: optimize query",
    });
    expect(categorizeCommit("random message")).toEqual({
      category: null,
      description: "random message",
    });
  });

  it("should format changelog entry as markdown", () => {
    const entry = {
      version: "1.2.0",
      date: "2026-05-20",
      added: ["New SSO support", "Dark mode"],
      changed: [],
      fixed: ["Login timeout bug"],
      deprecated: [],
      removed: [],
      security: [],
    };
    const md = formatChangelogEntry(entry);
    expect(md).toContain("## [1.2.0] - 2026-05-20");
    expect(md).toContain("### Added");
    expect(md).toContain("- New SSO support");
    expect(md).toContain("### Fixed");
    expect(md).toContain("- Login timeout bug");
    expect(md).not.toContain("### Changed"); // Empty section omitted
  });

  it("should estimate reading time", () => {
    expect(estimateReadingTime("word ".repeat(199) + "word")).toBe(1); // 200 words
    expect(estimateReadingTime("word ".repeat(599) + "word")).toBe(3); // 600 words
  });
});
