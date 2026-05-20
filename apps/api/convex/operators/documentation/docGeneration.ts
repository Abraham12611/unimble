"use node";

/**
 * Documentation Operator — Documentation Generation
 *
 * Handles generation of various documentation types:
 * - API reference documentation
 * - Tutorials and guides
 * - Code examples with validation
 * - Changelogs from git history
 *
 * Phase 8.6.3 — Documentation Generation
 */

import type { DocType, DocOperatorSettings } from "../documentationOperator";

// ---------------------------------------------------------------------------
// Generation types
// ---------------------------------------------------------------------------

/** Input for generating documentation. */
export interface GenerationInput {
  /** Type of documentation to generate */
  docType: DocType;
  /** Topic or API to document */
  topic: string;
  /** Target path for publishing */
  targetPath?: string;
  /** Source code context */
  sourceCode?: string;
  /** Related existing docs for context */
  relatedDocs?: string[];
  /** Specific sections to include */
  sections?: string[];
}

/** Template structure for different doc types. */
export interface DocTemplate {
  /** Doc type this template is for */
  type: DocType;
  /** Required sections */
  requiredSections: string[];
  /** Optional sections */
  optionalSections: string[];
  /** Minimum word count */
  minWordCount: number;
  /** Whether code examples are required */
  requiresExamples: boolean;
}

/** Changelog entry from git history. */
export interface ChangelogEntry {
  /** Version or date */
  version: string;
  /** Release date */
  date: string;
  /** Added features */
  added: string[];
  /** Changed behavior */
  changed: string[];
  /** Fixed bugs */
  fixed: string[];
  /** Deprecated features */
  deprecated: string[];
  /** Removed features */
  removed: string[];
  /** Security fixes */
  security: string[];
}

/** Code example with metadata. */
export interface CodeExample {
  /** Programming language */
  language: string;
  /** The code */
  code: string;
  /** Description of what the example shows */
  description: string;
  /** Whether this example has been validated */
  validated: boolean;
  /** Validation errors (if any) */
  validationErrors?: string[];
}

// ---------------------------------------------------------------------------
// Doc templates
// ---------------------------------------------------------------------------

/** Templates defining structure for each doc type. */
export const DOC_TEMPLATES: Record<DocType, DocTemplate> = {
  api_reference: {
    type: "api_reference",
    requiredSections: ["Overview", "Parameters", "Returns", "Examples"],
    optionalSections: ["Errors", "Rate Limits", "Related"],
    minWordCount: 300,
    requiresExamples: true,
  },
  tutorial: {
    type: "tutorial",
    requiredSections: ["Introduction", "Prerequisites", "Steps", "Conclusion"],
    optionalSections: ["Troubleshooting", "Next Steps"],
    minWordCount: 800,
    requiresExamples: true,
  },
  guide: {
    type: "guide",
    requiredSections: ["Overview", "When to Use", "How It Works", "Best Practices"],
    optionalSections: ["Advanced Usage", "FAQ", "Related"],
    minWordCount: 600,
    requiresExamples: true,
  },
  example: {
    type: "example",
    requiredSections: ["Description", "Code", "Output"],
    optionalSections: ["Explanation", "Variations"],
    minWordCount: 200,
    requiresExamples: true,
  },
  changelog: {
    type: "changelog",
    requiredSections: ["Version", "Changes"],
    optionalSections: ["Migration Guide", "Breaking Changes"],
    minWordCount: 100,
    requiresExamples: false,
  },
  faq: {
    type: "faq",
    requiredSections: ["Questions"],
    optionalSections: [],
    minWordCount: 400,
    requiresExamples: false,
  },
  architecture: {
    type: "architecture",
    requiredSections: ["Overview", "Components", "Data Flow", "Decisions"],
    optionalSections: ["Diagrams", "Trade-offs", "Future"],
    minWordCount: 1000,
    requiresExamples: false,
  },
  runbook: {
    type: "runbook",
    requiredSections: ["Trigger", "Steps", "Verification", "Rollback"],
    optionalSections: ["Prerequisites", "Escalation", "Post-mortem"],
    minWordCount: 500,
    requiresExamples: false,
  },
  migration_guide: {
    type: "migration_guide",
    requiredSections: ["Overview", "Breaking Changes", "Migration Steps", "Verification"],
    optionalSections: ["Rollback", "FAQ", "Timeline"],
    minWordCount: 600,
    requiresExamples: true,
  },
};

// ---------------------------------------------------------------------------
// Generation helpers
// ---------------------------------------------------------------------------

/**
 * Builds the markdown skeleton for a doc type.
 */
export function buildDocSkeleton(
  docType: DocType,
  title: string,
  settings: DocOperatorSettings
): string {
  const template = DOC_TEMPLATES[docType];
  const sections: string[] = [];

  sections.push(`# ${title}\n`);
  sections.push(`> Generated documentation for ${settings.targetAudience} developers.\n`);

  for (const section of template.requiredSections) {
    // Skip "Examples" here if requiresExamples is true — the typed block below handles it
    if (section === "Examples" && template.requiresExamples) continue;
    sections.push(`## ${section}\n`);
    sections.push(`<!-- TODO: Fill in ${section.toLowerCase()} content -->\n`);
  }

  if (template.requiresExamples) {
    sections.push("## Examples\n");
    for (const lang of settings.languages) {
      sections.push(`### ${lang}\n`);
      sections.push("```" + lang + "\n// TODO: Add example\n```\n");
    }
  }

  return sections.join("\n");
}

/**
 * Validates that generated documentation meets the template requirements.
 */
export function validateGeneratedDoc(
  content: string,
  docType: DocType
): { valid: boolean; errors: string[]; warnings: string[] } {
  const template = DOC_TEMPLATES[docType];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check word count
  const wordCount = content.split(/\s+/).length;
  if (wordCount < template.minWordCount) {
    errors.push(`Content is too short (${wordCount} words, minimum ${template.minWordCount})`);
  }

  // Check required sections
  for (const section of template.requiredSections) {
    const sectionPattern = new RegExp(`^##\\s+${section}`, "im");
    if (!sectionPattern.test(content)) {
      errors.push(`Missing required section: "${section}"`);
    }
  }

  // Check for code examples if required
  if (template.requiresExamples && !content.includes("```")) {
    errors.push("No code examples found (required for this doc type)");
  }

  // Warnings
  if (!content.includes("## ")) {
    warnings.push("No H2 headings found — consider adding structure");
  }

  if (content.length > 20000) {
    warnings.push("Document is very long — consider splitting into multiple pages");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Changelog helpers
// ---------------------------------------------------------------------------

/**
 * Parses conventional commit messages into changelog categories.
 */
export function categorizeCommit(message: string): {
  category: keyof ChangelogEntry | null;
  description: string;
} {
  const match = message.match(
    /^(feat|fix|docs|perf|refactor|style|test|chore|ci)(?:\(([^)]+)\))?:\s*(.+)/
  );

  if (!match) {
    return { category: null, description: message };
  }

  const [, type, , description] = match;

  switch (type) {
    case "feat":
      return { category: "added", description };
    case "fix":
      return { category: "fixed", description };
    case "perf":
      return { category: "changed", description: `Performance: ${description}` };
    case "refactor":
      return { category: "changed", description };
    default:
      return { category: null, description };
  }
}

/**
 * Formats a changelog entry as markdown.
 */
export function formatChangelogEntry(entry: ChangelogEntry): string {
  const sections: string[] = [];

  sections.push(`## [${entry.version}] - ${entry.date}\n`);

  if (entry.added.length > 0) {
    sections.push("### Added\n");
    for (const item of entry.added) {
      sections.push(`- ${item}`);
    }
    sections.push("");
  }

  if (entry.changed.length > 0) {
    sections.push("### Changed\n");
    for (const item of entry.changed) {
      sections.push(`- ${item}`);
    }
    sections.push("");
  }

  if (entry.fixed.length > 0) {
    sections.push("### Fixed\n");
    for (const item of entry.fixed) {
      sections.push(`- ${item}`);
    }
    sections.push("");
  }

  if (entry.deprecated.length > 0) {
    sections.push("### Deprecated\n");
    for (const item of entry.deprecated) {
      sections.push(`- ${item}`);
    }
    sections.push("");
  }

  if (entry.removed.length > 0) {
    sections.push("### Removed\n");
    for (const item of entry.removed) {
      sections.push(`- ${item}`);
    }
    sections.push("");
  }

  if (entry.security.length > 0) {
    sections.push("### Security\n");
    for (const item of entry.security) {
      sections.push(`- ${item}`);
    }
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Estimates reading time from content.
 */
export function estimateReadingTime(content: string): number {
  const wordCount = content.split(/\s+/).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}
