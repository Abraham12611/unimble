"use node";

/**
 * Documentation Operator — Autonomous Documentation Management
 *
 * Concrete operator for maintaining, auditing, and generating technical
 * documentation. Extends OperatorBase with:
 * - Documentation coverage auditing (detect gaps, stale content)
 * - Freshness monitoring (flag outdated docs)
 * - API documentation generation from code
 * - Tutorial and guide generation
 * - Changelog generation from git history
 * - Example code generation and validation
 *
 * Phase 8.6.1 — Documentation Operator Core
 */

import { OperatorBase } from "./operatorBase";
import { operatorRegistry } from "./registry";
import type { OperatorType, OperatorTemplate, OperatorConfiguration } from "./types";
import type { AgentConfig } from "../agent/types";
import type { Persona } from "../agent/personas";
import { getDefaultPersona } from "../agent/personas";
import type { WorkflowDefinition } from "../engine/types";
import {
  calculateFreshnessScore as calculateFreshnessScoreImpl,
  determineDocStatus as determineDocStatusImpl,
  calculateCoverageScore as calculateCoverageScoreImpl,
} from "./documentation/docAudit";

// ---------------------------------------------------------------------------
// Documentation-specific types
// ---------------------------------------------------------------------------

/** Types of documentation the operator manages. */
export type DocType =
  | "api_reference"
  | "tutorial"
  | "guide"
  | "example"
  | "changelog"
  | "faq"
  | "architecture"
  | "runbook"
  | "migration_guide";

/** Status of a documentation page. */
export type DocStatus = "current" | "stale" | "outdated" | "missing" | "draft";

/** A documentation page tracked by the operator. */
export interface DocPage {
  /** Unique ID */
  id: string;
  /** Page title */
  title: string;
  /** URL or file path */
  path: string;
  /** Documentation type */
  type: DocType;
  /** Current status */
  status: DocStatus;
  /** Last updated timestamp */
  lastUpdatedAt: number;
  /** Last audited timestamp */
  lastAuditedAt?: number;
  /** Related code paths (for staleness detection) */
  relatedCodePaths: string[];
  /** Word count */
  wordCount: number;
  /** Whether this page has code examples */
  hasCodeExamples: boolean;
  /** Quality score from last audit (0-1) */
  qualityScore?: number;
  /** Issues found during audit */
  issues: DocIssue[];
}

/** An issue found during documentation audit. */
export interface DocIssue {
  /** Issue type */
  type: "stale" | "inaccurate" | "incomplete" | "broken_link" | "missing_example" | "formatting";
  /** Severity */
  severity: "critical" | "major" | "minor";
  /** Description */
  description: string;
  /** Suggested fix */
  suggestedFix?: string;
  /** Related code change (if staleness) */
  relatedCommit?: string;
}

/** Documentation coverage report. */
export interface CoverageReport {
  /** Total pages tracked */
  totalPages: number;
  /** Pages by status */
  byStatus: Record<DocStatus, number>;
  /** Pages by type */
  byType: Partial<Record<DocType, number>>;
  /** Overall coverage score (0-1) */
  coverageScore: number;
  /** Freshness score (0-1, based on staleness) */
  freshnessScore: number;
  /** Quality score (0-1, average across pages) */
  qualityScore: number;
  /** Gaps detected (areas without documentation) */
  gaps: DocGap[];
  /** Pages needing immediate attention */
  urgentPages: DocPage[];
}

/** A detected documentation gap. */
export interface DocGap {
  /** Area missing documentation */
  area: string;
  /** Suggested doc type */
  suggestedType: DocType;
  /** Priority */
  priority: "high" | "medium" | "low";
  /** Reason this gap was detected */
  reason: string;
}

/** Generated documentation output. */
export interface GeneratedDoc {
  /** Title */
  title: string;
  /** Doc type */
  type: DocType;
  /** Full markdown content */
  content: string;
  /** Meta description */
  metaDescription: string;
  /** Target path/URL */
  targetPath: string;
  /** Related API endpoints (if API docs) */
  relatedEndpoints?: string[];
  /** Code examples included */
  codeExamples: Array<{ language: string; code: string; description: string }>;
  /** Estimated reading time (minutes) */
  readingTimeMinutes: number;
}

// ---------------------------------------------------------------------------
// Documentation Operator Settings
// ---------------------------------------------------------------------------

/** Documentation operator-specific settings. */
export interface DocOperatorSettings {
  /** Repository URL for code analysis */
  repositoryUrl: string;
  /** Documentation site URL */
  docsUrl?: string;
  /** Staleness threshold in days */
  stalenessThresholdDays: number;
  /** Code paths to monitor for changes */
  monitoredCodePaths: string[];
  /** Doc types to generate */
  enabledDocTypes: DocType[];
  /** Auto-generate changelogs */
  autoChangelog: boolean;
  /** Target audience level */
  targetAudience: "beginner" | "intermediate" | "advanced" | "mixed";
  /** Programming languages for examples */
  languages: string[];
  /** Report day (0=Sun, 1=Mon, ...) */
  reportDay: number;
}

/** Default settings for the Documentation Operator. */
export const DEFAULT_DOC_SETTINGS: DocOperatorSettings = {
  repositoryUrl: "",
  stalenessThresholdDays: 30,
  monitoredCodePaths: ["src/", "lib/", "api/"],
  enabledDocTypes: ["api_reference", "tutorial", "guide", "changelog"],
  autoChangelog: true,
  targetAudience: "intermediate",
  languages: ["typescript", "javascript"],
  reportDay: 1,
};

// ---------------------------------------------------------------------------
// Documentation Operator Class
// ---------------------------------------------------------------------------

/**
 * DocumentationOperator — Autonomous documentation management.
 *
 * Manages the full documentation lifecycle:
 * 1. Audit existing docs for coverage, freshness, and accuracy
 * 2. Detect gaps where documentation is missing
 * 3. Generate new documentation (API refs, tutorials, guides)
 * 4. Monitor code changes and flag stale docs
 * 5. Generate changelogs from git history
 * 6. Validate code examples still work
 */
export class DocumentationOperator extends OperatorBase {
  constructor(config: OperatorConfiguration) {
    super(config);
  }

  // -------------------------------------------------------------------------
  // Abstract implementations
  // -------------------------------------------------------------------------

  getTemplate(): OperatorTemplate {
    const template = operatorRegistry.get("documentation-operator");
    if (!template) {
      throw new Error("Documentation operator template not found in registry");
    }
    return template;
  }

  getType(): OperatorType {
    return "documentation";
  }

  // -------------------------------------------------------------------------
  // Agent Configuration
  // -------------------------------------------------------------------------

  buildAgentConfig(operatorId: string, persona?: Persona): AgentConfig {
    const baseConfig = super.buildAgentConfig(operatorId, persona);

    const docTools = [
      ...baseConfig.tools,
      "composio.execute",
      "firecrawl.scrape",
      "perplexity.search",
    ];

    return {
      ...baseConfig,
      tools: [...new Set(docTools)],
      memoryCategories: ["workspace", "operator", "documentation_state", "code_changes"],
      maxIterations: 20,
    };
  }

  getDefaultPersona(): Persona | undefined {
    return getDefaultPersona("technical-writer");
  }

  // -------------------------------------------------------------------------
  // Workflow Definitions
  // -------------------------------------------------------------------------

  /**
   * Builds the documentation audit workflow.
   * Runs weekly to check coverage, freshness, and quality.
   */
  buildAuditWorkflow(): WorkflowDefinition {
    const settings = this.getSettings();

    return {
      name: "Documentation Audit",
      description: "Audit documentation for coverage, freshness, and accuracy",
      version: 1,
      trigger: {
        type: "schedule",
        cron: "0 8 * * MON",
        timezone: "UTC",
        enabled: true,
      },
      steps: [
        {
          id: "scan_docs",
          name: "Scan Documentation",
          type: "agent",
          config: {
            prompt: this.buildAuditPrompt(settings),
            modelTier: "generation",
            tools: ["firecrawl.scrape", "composio.execute", "memory.read"],
            memoryContext: ["documentation_state"],
            outputFormat: "json",
          },
        },
        {
          id: "check_freshness",
          name: "Check Freshness",
          type: "agent",
          dependsOn: ["scan_docs"],
          config: {
            prompt: `Compare documentation pages against recent code changes:
1. Check git history for changes to monitored paths since last audit
2. Flag docs whose related code has changed
3. Assess severity: critical (API changed), major (behavior changed), minor (cosmetic)
4. Calculate freshness score for each page

Staleness threshold: ${settings.stalenessThresholdDays} days
Monitored paths: ${settings.monitoredCodePaths.join(", ")}

Return JSON with freshness assessment per page.`,
            modelTier: "fast",
            tools: ["composio.execute", "memory.read"],
            memoryContext: ["code_changes"],
            outputFormat: "json",
          },
        },
        {
          id: "detect_gaps",
          name: "Detect Gaps",
          type: "agent",
          dependsOn: ["scan_docs"],
          config: {
            prompt: `Analyze the codebase and existing docs to find documentation gaps:
1. List all public APIs, exported functions, and user-facing features
2. Check which ones have documentation
3. Identify undocumented areas
4. Prioritize gaps by: user impact, complexity, frequency of questions
5. Suggest doc type for each gap (api_reference, tutorial, guide, etc.)

Return JSON array of gaps with: area, suggestedType, priority, reason.`,
            modelTier: "generation",
            tools: ["composio.execute", "perplexity.search"],
            outputFormat: "json",
          },
        },
        {
          id: "compile_report",
          name: "Compile Audit Report",
          type: "agent",
          dependsOn: ["check_freshness", "detect_gaps"],
          config: {
            prompt: `Compile the documentation audit report:
1. Overall coverage score
2. Freshness score
3. Quality score (from page audits)
4. Pages needing immediate attention (critical issues)
5. Top 5 gaps to fill
6. Recommendations for next week

Be concise and actionable.`,
            modelTier: "generation",
            outputFormat: "json",
          },
        },
      ],
      maxDurationMs: 600000,
    };
  }

  /**
   * Builds the documentation generation workflow.
   * Triggered on-demand or when gaps are detected.
   */
  buildGenerationWorkflow(): WorkflowDefinition {
    const settings = this.getSettings();

    return {
      name: "Documentation Generation",
      description: "Generate new documentation for detected gaps or on-demand requests",
      version: 1,
      trigger: {
        type: "manual",
        inputSchema: {
          type: "object",
          properties: {
            docType: { type: "string", enum: settings.enabledDocTypes },
            topic: { type: "string", description: "Topic or API to document" },
            targetPath: { type: "string", description: "Where to publish" },
          },
          required: ["docType", "topic"],
        },
      },
      steps: [
        {
          id: "research",
          name: "Research Topic",
          type: "agent",
          config: {
            prompt: this.buildResearchPrompt(settings),
            modelTier: "generation",
            tools: ["composio.execute", "firecrawl.scrape", "perplexity.search", "memory.read"],
            memoryContext: ["documentation_state", "code_changes"],
            outputFormat: "json",
          },
        },
        {
          id: "generate",
          name: "Generate Documentation",
          type: "agent",
          dependsOn: ["research"],
          config: {
            prompt: this.buildGenerationPrompt(settings),
            modelTier: "generation",
            tools: ["perplexity.search"],
            outputFormat: "markdown",
            maxTokens: 8192,
          },
        },
        {
          id: "validate_examples",
          name: "Validate Code Examples",
          type: "agent",
          dependsOn: ["generate"],
          config: {
            prompt: `Validate all code examples in the generated documentation:
1. Check syntax correctness for each code block
2. Verify imports and dependencies are correct
3. Ensure examples are self-contained and runnable
4. Check that output comments match expected behavior
5. Flag any examples that reference non-existent APIs

Return JSON with validation results per example.`,
            modelTier: "fast",
            tools: ["composio.execute"],
            outputFormat: "json",
          },
        },
        {
          id: "review",
          name: "Review Documentation",
          type: "agent",
          dependsOn: ["validate_examples"],
          config: {
            prompt: `Review the generated documentation for quality:
1. Technical accuracy — are all claims correct?
2. Completeness — are all parameters, return types, and edge cases covered?
3. Clarity — is the writing clear and well-structured?
4. Examples — are they helpful and correct?
5. SEO — is the structure search-friendly?

Score 1-10 on each dimension. Verdict: approve (>=8), revise (5-7), reject (<5).
Return JSON with scores, verdict, and revision instructions if needed.`,
            modelTier: "generation",
            outputFormat: "json",
            temperature: 0.2,
          },
        },
        {
          id: "review_gate",
          name: "Review Gate",
          type: "conditional",
          dependsOn: ["review"],
          config: {
            conditions: [
              {
                expression: "{{review.output.verdict}} === 'approve'",
                thenSteps: ["publish"],
              },
            ],
            elseSteps: [],
          },
        },
        {
          id: "publish",
          name: "Publish Documentation",
          type: "agent",
          // No dependsOn — execution is controlled solely by review_gate's
          // thenSteps: ["publish"]. This prevents DAG-based engines from
          // firing publish unconditionally on review_gate completion.
          config: {
            prompt: `Publish the approved documentation:
1. Format for the target platform (docs site, GitHub, etc.)
2. Set appropriate metadata (title, description, category)
3. Create or update the page at the target path
4. Update the documentation index/sidebar if needed

Return the published URL and any errors.`,
            modelTier: "fast",
            tools: ["composio.execute"],
            outputFormat: "json",
          },
        },
      ],
      maxDurationMs: 900000,
    };
  }

  /**
   * Builds the changelog generation workflow.
   * Runs on schedule or triggered by releases.
   */
  buildChangelogWorkflow(): WorkflowDefinition {
    return {
      name: "Changelog Generation",
      description: "Generate changelog entries from git history and PRs",
      version: 1,
      trigger: {
        type: "schedule",
        cron: "0 10 * * FRI",
        timezone: "UTC",
        enabled: true,
      },
      steps: [
        {
          id: "gather_changes",
          name: "Gather Changes",
          type: "agent",
          config: {
            prompt: `Gather all changes since the last changelog entry:
1. Fetch git commits since last release/changelog
2. Fetch merged PRs with their descriptions
3. Group by type: features, fixes, improvements, breaking changes
4. Extract the user-facing impact of each change

Return structured JSON with all changes grouped by type.`,
            modelTier: "fast",
            tools: ["composio.execute"],
            outputFormat: "json",
          },
        },
        {
          id: "generate_changelog",
          name: "Generate Changelog",
          type: "agent",
          dependsOn: ["gather_changes"],
          config: {
            prompt: `Generate a changelog entry from the gathered changes:

## Format
- Use Keep a Changelog format (https://keepachangelog.com)
- Group by: Added, Changed, Fixed, Deprecated, Removed, Security
- Write from the user's perspective (what changed for them)
- Include links to PRs/issues where relevant
- Be concise but informative

## Rules
- Don't include internal refactoring unless it affects users
- Highlight breaking changes prominently
- Include migration instructions for breaking changes
- Add code examples for new features where helpful`,
            modelTier: "generation",
            outputFormat: "markdown",
          },
        },
        {
          id: "publish_changelog",
          name: "Publish Changelog",
          type: "agent",
          dependsOn: ["generate_changelog"],
          config: {
            prompt: `Publish the changelog:
1. Append to CHANGELOG.md (or create if missing)
2. Update the docs site changelog page
3. Optionally create a GitHub release

Return the published locations.`,
            modelTier: "fast",
            tools: ["composio.execute"],
            outputFormat: "json",
          },
        },
      ],
      maxDurationMs: 300000,
    };
  }

  // -------------------------------------------------------------------------
  // Prompt Builders
  // -------------------------------------------------------------------------

  private buildAuditPrompt(settings: DocOperatorSettings): string {
    return `Audit the documentation for coverage, freshness, and quality.

## Documentation Site
${settings.docsUrl ? `URL: ${settings.docsUrl}` : "No docs URL configured — scan repository docs/ folder"}

## Repository
${settings.repositoryUrl}

## Instructions
1. Crawl/scan all documentation pages
2. For each page, assess:
   - Status: current, stale, outdated, missing, draft
   - Quality: accuracy, completeness, clarity, examples
   - Last updated date
   - Related code paths
3. Calculate overall coverage score
4. Identify critical issues (broken links, inaccurate info)

## Staleness Threshold
Pages not updated in ${settings.stalenessThresholdDays}+ days are flagged as stale.

Return JSON array of DocPage objects with full assessment.`;
  }

  private buildResearchPrompt(settings: DocOperatorSettings): string {
    return `Research the topic for documentation generation:

## Target Audience
${settings.targetAudience} developers

## Languages
${settings.languages.join(", ")}

## Instructions
1. Read the relevant source code
2. Understand the API surface, parameters, return types
3. Identify common use cases and edge cases
4. Find related documentation for context
5. Note any prerequisites or dependencies

Return structured research with: api_surface, use_cases, edge_cases, prerequisites, related_docs.`;
  }

  private buildGenerationPrompt(settings: DocOperatorSettings): string {
    return `Generate high-quality technical documentation.

## Target Audience
${settings.targetAudience} developers

## Languages for Examples
${settings.languages.join(", ")}

## Guidelines
1. Start with a clear, concise overview
2. Include a "Quick Start" section for immediate value
3. Document all parameters with types and descriptions
4. Include practical code examples for common use cases
5. Cover error handling and edge cases
6. Add "See Also" links to related documentation
7. Use proper heading hierarchy (H1 → H2 → H3)
8. Include a table of contents for long pages

## Code Examples
- Every public API should have at least one example
- Examples should be self-contained and runnable
- Include expected output in comments
- Show error handling patterns
- Use realistic variable names

Return the full documentation in markdown format.`;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private getSettings(): DocOperatorSettings {
    return {
      ...DEFAULT_DOC_SETTINGS,
      ...(this.config.settings as Partial<DocOperatorSettings>),
    };
  }

  /**
   * Calculates a freshness score for a documentation page.
   * Delegates to docAudit.calculateFreshnessScore.
   */
  static calculateFreshnessScore(lastUpdatedAt: number, stalenessThresholdDays: number): number {
    return calculateFreshnessScoreImpl(lastUpdatedAt, stalenessThresholdDays);
  }

  /**
   * Determines doc status based on age and code changes.
   * Delegates to docAudit.determineDocStatus.
   */
  static determineStatus(
    lastUpdatedAt: number,
    stalenessThresholdDays: number,
    hasRelatedCodeChanges: boolean
  ): DocStatus {
    return determineDocStatusImpl(lastUpdatedAt, stalenessThresholdDays, hasRelatedCodeChanges);
  }

  /**
   * Calculates overall coverage score from page statuses.
   * Delegates to docAudit.calculateCoverageScore.
   */
  static calculateCoverageScore(pages: DocPage[]): number {
    return calculateCoverageScoreImpl(pages);
  }

  /**
   * Estimates reading time from word count.
   */
  static estimateReadingTime(wordCount: number): number {
    return Math.max(1, Math.ceil(wordCount / 200));
  }
}

// ---------------------------------------------------------------------------
// Register the Documentation Operator template
// ---------------------------------------------------------------------------

export const DOCUMENTATION_OPERATOR_TEMPLATE: OperatorTemplate = {
  id: "documentation-operator",
  type: "documentation",
  version: "1.1.0",
  name: "Documentation Operator",
  description: "Autonomous documentation auditing, generation, and maintenance",
  icon: "book-open",
  featured: true,
  capabilities: [
    "Documentation coverage auditing with gap detection",
    "Freshness monitoring against code changes",
    "API reference generation from source code",
    "Tutorial and guide generation",
    "Changelog generation from git history",
    "Code example validation",
    "Quality scoring and improvement suggestions",
  ],
  requiredIntegrations: [
    {
      category: "code",
      providers: ["github"],
      description: "Repository access for code analysis and changelog generation",
    },
  ],
  optionalIntegrations: [
    {
      category: "content",
      providers: ["gitbook", "readme", "notion"],
      description: "Documentation platform for publishing",
    },
  ],
  configSchema: {
    sections: [
      {
        id: "repository",
        title: "Repository Settings",
        fields: [
          {
            key: "repository_url",
            label: "Repository URL",
            type: "text",
            description: "GitHub repository URL to analyze",
            required: true,
            validation: { minLength: 10 },
          },
          {
            key: "docs_url",
            label: "Documentation Site URL",
            type: "text",
            description: "URL of your documentation site (optional)",
          },
          {
            key: "monitored_code_paths",
            label: "Monitored Code Paths",
            type: "tags",
            description: "Code paths to monitor for changes (e.g., src/, api/)",
            default: "src/,lib/,api/",
          },
        ],
      },
      {
        id: "generation",
        title: "Generation Settings",
        fields: [
          {
            key: "target_audience",
            label: "Target Audience",
            type: "select",
            description: "Primary audience for generated documentation",
            default: "intermediate",
            options: [
              { value: "beginner", label: "Beginner" },
              { value: "intermediate", label: "Intermediate" },
              { value: "advanced", label: "Advanced" },
              { value: "mixed", label: "Mixed" },
            ],
          },
          {
            key: "languages",
            label: "Programming Languages",
            type: "tags",
            description: "Languages for code examples",
            default: "typescript,javascript",
          },
          {
            key: "staleness_threshold_days",
            label: "Staleness Threshold (days)",
            type: "number",
            description: "Days before a page is flagged as stale",
            default: 30,
            validation: { min: 7, max: 180 },
          },
          {
            key: "auto_changelog",
            label: "Auto-Generate Changelog",
            type: "boolean",
            description: "Automatically generate changelog entries weekly",
            default: true,
          },
        ],
      },
    ],
  },
  defaultSystemPrompt:
    "You are a technical documentation specialist. You audit, generate, and maintain high-quality developer documentation. You write clearly, include practical examples, and ensure accuracy by cross-referencing source code.",
  defaultTools: [
    "composio.execute",
    "firecrawl.scrape",
    "perplexity.search",
    "memory.read",
    "memory.write",
  ],
  defaultWorkflows: [
    {
      id: "documentation-audit",
      name: "Documentation Audit",
      description: "Weekly audit of coverage, freshness, and quality",
      triggerType: "cron",
      defaultCron: "0 8 * * MON",
      enabledByDefault: true,
    },
    {
      id: "documentation-generation",
      name: "Documentation Generation",
      description: "Generate new docs for gaps or on-demand requests",
      triggerType: "api",
      enabledByDefault: true,
    },
    {
      id: "changelog-generation",
      name: "Changelog Generation",
      description: "Generate changelog from git history weekly",
      triggerType: "cron",
      defaultCron: "0 10 * * FRI",
      enabledByDefault: true,
    },
  ],
  metrics: [
    { key: "pages_tracked", name: "Pages Tracked", type: "gauge" },
    { key: "coverage_score", name: "Coverage Score", type: "percentage", goal: "> 80%" },
    { key: "freshness_score", name: "Freshness Score", type: "percentage", goal: "> 70%" },
    { key: "quality_score", name: "Quality Score", type: "percentage", goal: "> 80%" },
    { key: "gaps_detected", name: "Gaps Detected", type: "gauge" },
    { key: "docs_generated", name: "Docs Generated", type: "counter" },
    { key: "changelogs_published", name: "Changelogs Published", type: "counter" },
  ],
};

// Register on module load
operatorRegistry.register(DOCUMENTATION_OPERATOR_TEMPLATE);
