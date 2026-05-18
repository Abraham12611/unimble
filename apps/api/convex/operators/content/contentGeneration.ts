"use node";

/**
 * Content Operator — Content Generation
 *
 * Implements the content generation workflow:
 * - Outline generation from research
 * - Draft generation with persona-aware prompts
 * - Code example generation and validation
 * - SEO optimization (keywords, meta, structure)
 * - Image suggestions
 *
 * Phase 8.2.3 — Content Generation
 */

import type { ContentTopic, ContentOutline, OutlineSection, ContentDraft, ImageSuggestion } from "../contentOperator";
import { ContentOperator } from "../contentOperator";
import type { Persona } from "../../agent/personas";
import { buildPersonaPrompt } from "../../agent/personas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for content generation. */
export interface ContentGenerationConfig {
  /** Topic to generate content for */
  topic: ContentTopic;
  /** Research data gathered in the research phase */
  research: string;
  /** Persona to write as */
  persona?: Persona;
  /** Content style */
  contentStyle: string;
  /** Target word count (overrides topic estimate) */
  targetWordCount?: number;
  /** SEO keywords to include */
  seoKeywords?: string[];
  /** Whether to include code examples */
  includeCodeExamples: boolean;
  /** Internal links to include */
  internalLinks?: string[];
}

/** Result of the content generation process. */
export interface ContentGenerationResult {
  /** Generated outline */
  outline: ContentOutline;
  /** Generated draft */
  draft: ContentDraft;
  /** Generation metadata */
  metadata: {
    /** Total tokens used */
    tokensUsed: number;
    /** Generation duration (ms) */
    durationMs: number;
    /** Estimated cost */
    cost: number;
  };
}

/** LLM call function type (injected dependency). */
type LLMGenerateFn = (
  prompt: string,
  systemPrompt?: string,
  options?: { maxTokens?: number; temperature?: number }
) => Promise<{ content: string; tokensUsed: number; cost: number }>;

// ---------------------------------------------------------------------------
// Content Generation Functions
// ---------------------------------------------------------------------------

/**
 * Generates a complete content piece from topic and research.
 *
 * Process:
 * 1. Generate outline
 * 2. Generate draft section by section
 * 3. Add SEO optimization
 * 4. Generate image suggestions
 */
export async function generateContent(
  config: ContentGenerationConfig,
  llmGenerate: LLMGenerateFn
): Promise<ContentGenerationResult> {
  const startTime = Date.now();
  let totalTokens = 0;
  let totalCost = 0;

  // Step 1: Generate outline
  const outline = await generateOutline(config, llmGenerate);
  totalTokens += outline.tokensUsed;
  totalCost += outline.cost;

  // Step 2: Generate full draft
  const draft = await generateDraft(config, outline.outline, llmGenerate);
  totalTokens += draft.tokensUsed;
  totalCost += draft.cost;

  // Step 3: Generate image suggestions
  const images = generateImageSuggestions(outline.outline, config.topic);

  // Assemble final draft
  const finalDraft: ContentDraft = {
    ...draft.draft,
    imageSuggestions: images,
    status: "drafting",
    revisionCount: 0,
  };

  return {
    outline: outline.outline,
    draft: finalDraft,
    metadata: {
      tokensUsed: totalTokens,
      durationMs: Date.now() - startTime,
      cost: totalCost,
    },
  };
}

// ---------------------------------------------------------------------------
// Outline Generation
// ---------------------------------------------------------------------------

/**
 * Generates a structured outline for the content.
 */
async function generateOutline(
  config: ContentGenerationConfig,
  llmGenerate: LLMGenerateFn
): Promise<{ outline: ContentOutline; tokensUsed: number; cost: number }> {
  const targetWords = config.targetWordCount ?? config.topic.estimatedWordCount;

  const prompt = `Create a detailed content outline for the following topic.

## Topic
Title: ${config.topic.title}
Type: ${config.topic.contentType}
Target audience: ${config.topic.audienceLevel} developers
Target word count: ${targetWords} words
Keywords: ${config.topic.keywords.join(", ")}

## Research Summary
${config.research.slice(0, 3000)}

## Requirements
1. Create a compelling title (may differ from the topic title)
2. Write a meta description (150-160 characters)
3. Structure with clear H2 and H3 headings
4. Include ${config.includeCodeExamples ? "code examples in relevant sections" : "no code examples"}
5. Plan for ${targetWords} words total
6. Include key takeaways at the end

## Output Format (JSON)
{
  "title": "Final article title",
  "metaDescription": "SEO meta description",
  "sections": [
    { "heading": "Section title", "level": 2, "description": "What this covers", "hasCodeExample": true, "estimatedWords": 300 }
  ],
  "keyTakeaways": ["Takeaway 1", "Takeaway 2"],
  "internalLinks": ["suggested link text"]
}`;

  const systemPrompt = config.persona
    ? `You are a content strategist. ${buildPersonaPrompt(config.persona)}`
    : "You are an expert content strategist who creates well-structured, SEO-optimized content outlines.";

  const result = await llmGenerate(prompt, systemPrompt, {
    maxTokens: 2048,
    temperature: 0.4,
  });

  const outline = parseOutlineResponse(result.content, config.topic);

  return {
    outline,
    tokensUsed: result.tokensUsed,
    cost: result.cost,
  };
}

/**
 * Parses the LLM's outline response into a structured ContentOutline.
 */
function parseOutlineResponse(content: string, topic: ContentTopic): ContentOutline {
  // Try to parse as JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        topic,
        title: parsed.title ?? topic.title,
        metaDescription: parsed.metaDescription ?? "",
        sections: (parsed.sections ?? []).map((s: Record<string, unknown>) => ({
          heading: String(s.heading ?? ""),
          level: Number(s.level ?? 2),
          description: String(s.description ?? ""),
          hasCodeExample: Boolean(s.hasCodeExample),
          estimatedWords: Number(s.estimatedWords ?? 200),
        })),
        estimatedWordCount: topic.estimatedWordCount,
        keyTakeaways: parsed.keyTakeaways ?? [],
        internalLinks: parsed.internalLinks ?? [],
      };
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: create a basic outline from the topic
  return {
    topic,
    title: topic.title,
    metaDescription: topic.description.slice(0, 160),
    sections: [
      { heading: "Introduction", level: 2, description: "Overview of the topic", hasCodeExample: false, estimatedWords: 200 },
      { heading: "Core Concepts", level: 2, description: "Main content", hasCodeExample: true, estimatedWords: 500 },
      { heading: "Implementation", level: 2, description: "Practical steps", hasCodeExample: true, estimatedWords: 500 },
      { heading: "Conclusion", level: 2, description: "Summary and next steps", hasCodeExample: false, estimatedWords: 200 },
    ],
    estimatedWordCount: topic.estimatedWordCount,
    keyTakeaways: [],
    internalLinks: [],
  };
}

// ---------------------------------------------------------------------------
// Draft Generation
// ---------------------------------------------------------------------------

/**
 * Generates the full content draft from an outline.
 */
async function generateDraft(
  config: ContentGenerationConfig,
  outline: ContentOutline,
  llmGenerate: LLMGenerateFn
): Promise<{ draft: ContentDraft; tokensUsed: number; cost: number }> {
  const seoKeywords = config.seoKeywords ?? config.topic.keywords;

  const prompt = `Write a complete ${config.topic.contentType} based on this outline.

## Title
${outline.title}

## Meta Description
${outline.metaDescription}

## Outline
${outline.sections.map((s) => `${"#".repeat(s.level)} ${s.heading}\n${s.description}${s.hasCodeExample ? " (include code example)" : ""}`).join("\n\n")}

## Key Takeaways to Include
${outline.keyTakeaways.map((t) => `- ${t}`).join("\n")}

## Research Context
${config.research.slice(0, 4000)}

## SEO Requirements
- Naturally include these keywords: ${seoKeywords.join(", ")}
- Use proper heading hierarchy (H1 for title, H2 for sections, H3 for subsections)
- Write scannable content with short paragraphs
- Include a compelling introduction that hooks the reader

## Style
- Content style: ${config.contentStyle}
- Target audience: ${config.topic.audienceLevel} developers
- Word count target: ${config.targetWordCount ?? config.topic.estimatedWordCount} words

## Format
Write in markdown. Start with the title as H1. Include all sections from the outline.
${config.includeCodeExamples ? "Include working code examples with language tags (e.g., ```typescript)." : ""}`;

  const systemPrompt = config.persona
    ? buildPersonaPrompt(config.persona)
    : `You are a skilled technical writer who creates engaging, practical content for developers. Write clearly, use examples, and respect the reader's time.`;

  const result = await llmGenerate(prompt, systemPrompt, {
    maxTokens: 8192,
    temperature: 0.7,
  });

  const markdown = result.content;
  const wordCount = countWords(markdown);
  const slug = ContentOperator.generateSlug(outline.title);
  const excerpt = generateExcerpt(markdown);
  const tags = generateTags(config.topic, seoKeywords);

  const draft: ContentDraft = {
    title: outline.title,
    markdown,
    metaDescription: outline.metaDescription,
    excerpt,
    tags,
    slug,
    wordCount,
    readingTimeMinutes: ContentOperator.estimateReadingTime(wordCount),
    imageSuggestions: [],
    status: "drafting",
    revisionCount: 0,
  };

  return {
    draft,
    tokensUsed: result.tokensUsed,
    cost: result.cost,
  };
}

// ---------------------------------------------------------------------------
// Image Suggestions
// ---------------------------------------------------------------------------

/**
 * Generates image suggestions based on the outline.
 */
function generateImageSuggestions(
  outline: ContentOutline,
  topic: ContentTopic
): ImageSuggestion[] {
  const suggestions: ImageSuggestion[] = [];

  // Hero image
  suggestions.push({
    placement: "before_introduction",
    description: `Hero image for "${outline.title}" — visual representation of ${topic.keywords.slice(0, 3).join(", ")}`,
    altText: `${outline.title} - featured image`,
    type: "hero",
  });

  // Diagram for complex sections
  for (const section of outline.sections) {
    if (
      section.description.toLowerCase().includes("architecture") ||
      section.description.toLowerCase().includes("flow") ||
      section.description.toLowerCase().includes("process") ||
      section.description.toLowerCase().includes("how")
    ) {
      suggestions.push({
        placement: `in_section_${section.heading.toLowerCase().replace(/\s+/g, "_")}`,
        description: `Diagram showing ${section.description}`,
        altText: `${section.heading} diagram`,
        type: "diagram",
      });
    }

    // Code output screenshots for code sections
    if (section.hasCodeExample) {
      suggestions.push({
        placement: `after_code_${section.heading.toLowerCase().replace(/\s+/g, "_")}`,
        description: `Screenshot showing the output of the code example in "${section.heading}"`,
        altText: `Code output for ${section.heading}`,
        type: "code_output",
      });
    }
  }

  return suggestions.slice(0, 5); // Max 5 image suggestions
}

// ---------------------------------------------------------------------------
// SEO Optimization
// ---------------------------------------------------------------------------

/**
 * Optimizes content for SEO by checking keyword density and structure.
 */
export function analyzeSEO(
  draft: ContentDraft,
  targetKeywords: string[]
): SEOAnalysis {
  const content = draft.markdown.toLowerCase();
  const wordCount = draft.wordCount;

  const keywordAnalysis = targetKeywords.map((keyword) => {
    const kw = keyword.toLowerCase();
    const occurrences = (content.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    const density = wordCount > 0 ? (occurrences / wordCount) * 100 : 0;
    const inTitle = draft.title.toLowerCase().includes(kw);
    const inMeta = draft.metaDescription.toLowerCase().includes(kw);
    const inFirstParagraph = content.slice(0, 500).includes(kw);

    return {
      keyword,
      occurrences,
      density,
      inTitle,
      inMeta,
      inFirstParagraph,
      optimal: density >= 0.5 && density <= 2.5,
    };
  });

  // Check heading structure
  const headings = draft.markdown.match(/^#{1,6}\s+.+$/gm) ?? [];
  const hasH1 = headings.some((h) => h.startsWith("# ") && !h.startsWith("## "));
  const hasH2 = headings.some((h) => h.startsWith("## "));

  return {
    overallScore: calculateSEOScore(keywordAnalysis, hasH1, hasH2, draft),
    keywordAnalysis,
    structureChecks: {
      hasH1,
      hasH2,
      headingCount: headings.length,
      hasMetaDescription: draft.metaDescription.length > 0,
      metaDescriptionLength: draft.metaDescription.length,
      hasExcerpt: draft.excerpt.length > 0,
    },
    suggestions: generateSEOSuggestions(keywordAnalysis, hasH1, hasH2, draft),
  };
}

/** SEO analysis result. */
export interface SEOAnalysis {
  overallScore: number;
  keywordAnalysis: Array<{
    keyword: string;
    occurrences: number;
    density: number;
    inTitle: boolean;
    inMeta: boolean;
    inFirstParagraph: boolean;
    optimal: boolean;
  }>;
  structureChecks: {
    hasH1: boolean;
    hasH2: boolean;
    headingCount: number;
    hasMetaDescription: boolean;
    metaDescriptionLength: number;
    hasExcerpt: boolean;
  };
  suggestions: string[];
}

function calculateSEOScore(
  keywordAnalysis: SEOAnalysis["keywordAnalysis"],
  hasH1: boolean,
  hasH2: boolean,
  draft: ContentDraft
): number {
  let score = 5; // Start at 5/10

  // Keyword presence
  const primaryKeyword = keywordAnalysis[0];
  if (primaryKeyword) {
    if (primaryKeyword.inTitle) score += 1;
    if (primaryKeyword.inMeta) score += 0.5;
    if (primaryKeyword.inFirstParagraph) score += 0.5;
    if (primaryKeyword.optimal) score += 1;
  }

  // Structure
  if (hasH1) score += 0.5;
  if (hasH2) score += 0.5;

  // Meta
  if (draft.metaDescription.length >= 120 && draft.metaDescription.length <= 160) score += 0.5;
  if (draft.excerpt.length > 0) score += 0.5;

  return Math.min(10, Math.max(0, score));
}

function generateSEOSuggestions(
  keywordAnalysis: SEOAnalysis["keywordAnalysis"],
  hasH1: boolean,
  hasH2: boolean,
  draft: ContentDraft
): string[] {
  const suggestions: string[] = [];

  if (!hasH1) suggestions.push("Add an H1 heading (title)");
  if (!hasH2) suggestions.push("Add H2 headings for main sections");

  for (const kw of keywordAnalysis) {
    if (!kw.inTitle) suggestions.push(`Include "${kw.keyword}" in the title`);
    if (!kw.inFirstParagraph) suggestions.push(`Mention "${kw.keyword}" in the introduction`);
    if (kw.density < 0.5) suggestions.push(`Increase usage of "${kw.keyword}" (currently ${kw.density.toFixed(1)}%)`);
    if (kw.density > 2.5) suggestions.push(`Reduce usage of "${kw.keyword}" to avoid keyword stuffing (currently ${kw.density.toFixed(1)}%)`);
  }

  if (draft.metaDescription.length < 120) {
    suggestions.push("Expand meta description to 120-160 characters");
  }
  if (draft.metaDescription.length > 160) {
    suggestions.push("Shorten meta description to under 160 characters");
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Counts words in markdown content (excluding code blocks).
 */
function countWords(markdown: string): number {
  // Remove code blocks
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "");
  // Remove inline code
  const withoutInline = withoutCode.replace(/`[^`]+`/g, "");
  // Remove markdown syntax
  const plainText = withoutInline
    .replace(/[#*_\[\]()>|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plainText.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Generates an excerpt from the content (first meaningful paragraph).
 */
function generateExcerpt(markdown: string): string {
  const lines = markdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headings, empty lines, code blocks, images
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("```") ||
      trimmed.startsWith("![") ||
      trimmed.startsWith(">") ||
      trimmed.length < 50
    ) {
      continue;
    }
    // Found a paragraph
    return trimmed.slice(0, 300).replace(/\s+\S*$/, "...");
  }
  return "";
}

/**
 * Generates tags from topic and keywords.
 */
function generateTags(topic: ContentTopic, seoKeywords: string[]): string[] {
  const tags = new Set<string>();

  // Add content type as tag
  tags.add(topic.contentType.replace(/_/g, " "));

  // Add keywords
  for (const kw of [...topic.keywords, ...seoKeywords].slice(0, 8)) {
    tags.add(kw.toLowerCase());
  }

  return [...tags].slice(0, 10);
}
