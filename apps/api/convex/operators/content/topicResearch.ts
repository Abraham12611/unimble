"use node";

/**
 * Content Operator — Topic Research
 *
 * Implements the topic research workflow that discovers, scores,
 * and selects high-value content topics using:
 * - Perplexity API for trend research and competitive analysis
 * - Firehose for real-time web monitoring and trend detection
 * - Firecrawl for competitor content scraping
 * - Memory for past performance data
 *
 * Phase 8.2.2 — Topic Research
 */

import { perplexitySearch, perplexityResearch } from "../../lib/integrations/perplexity";
import { firehosePollEvents } from "../../lib/integrations/firehose";
import { firecrawlScrape } from "../../lib/integrations/firecrawl";
import type { ContentTopic } from "../contentOperator";
import { ContentOperator } from "../contentOperator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for topic research. */
export interface TopicResearchConfig {
  /** Focus areas/topics to research */
  topicsFocus: string[];
  /** Target audience level */
  targetAudience: "beginner" | "intermediate" | "advanced" | "mixed";
  /** Number of topics to select */
  topicCount: number;
  /** Content style preference */
  contentStyle: string;
  /** Competitor URLs to monitor */
  competitorUrls?: string[];
  /** Firehose tags to monitor */
  firehoseTags?: string[];
  /** Past performance data for learning */
  pastPerformance?: TopicPerformanceData[];
}

/** Historical performance data for a topic/keyword. */
export interface TopicPerformanceData {
  /** Topic or keyword */
  topic: string;
  /** Views generated */
  views: number;
  /** Engagement rate */
  engagementRate: number;
  /** Search impressions */
  searchImpressions: number;
  /** Published date */
  publishedAt: string;
}

/** Raw topic candidate before scoring. */
export interface TopicCandidate {
  /** Topic title */
  title: string;
  /** Description */
  description: string;
  /** Source of the idea */
  source: ContentTopic["source"];
  /** Raw relevance signal (0-1) */
  relevanceSignal: number;
  /** Raw trend signal (0-1) */
  trendSignal: number;
  /** Keywords associated */
  keywords: string[];
  /** Suggested content type */
  suggestedType: ContentTopic["contentType"];
  /** Suggested audience level */
  suggestedAudience: ContentTopic["audienceLevel"];
}

/** Result of the full topic research process. */
export interface TopicResearchResult {
  /** Selected topics (scored and ranked) */
  selectedTopics: ContentTopic[];
  /** All candidates considered */
  allCandidates: TopicCandidate[];
  /** Research metadata */
  metadata: {
    /** Total candidates discovered */
    totalCandidates: number;
    /** Sources used */
    sourcesUsed: string[];
    /** Research duration (ms) */
    durationMs: number;
    /** Cost of research (API calls) */
    cost: number;
  };
}

// ---------------------------------------------------------------------------
// Topic Research Functions
// ---------------------------------------------------------------------------

/**
 * Runs the full topic research pipeline.
 *
 * 1. Gather candidates from multiple sources
 * 2. Score and rank candidates
 * 3. Select top N topics
 */
export async function researchTopics(
  config: TopicResearchConfig
): Promise<TopicResearchResult> {
  const startTime = Date.now();
  let totalCost = 0;
  const sourcesUsed: string[] = [];

  // Gather candidates from all sources in parallel
  const [perplexityCandidates, firehoseCandidates, competitorCandidates] =
    await Promise.allSettled([
      researchWithPerplexity(config),
      monitorWithFirehose(config),
      analyzeCompetitors(config),
    ]);

  const allCandidates: TopicCandidate[] = [];

  if (perplexityCandidates.status === "fulfilled") {
    allCandidates.push(...perplexityCandidates.value.candidates);
    totalCost += perplexityCandidates.value.cost;
    sourcesUsed.push("perplexity");
  }

  if (firehoseCandidates.status === "fulfilled") {
    allCandidates.push(...firehoseCandidates.value.candidates);
    sourcesUsed.push("firehose");
  }

  if (competitorCandidates.status === "fulfilled") {
    allCandidates.push(...competitorCandidates.value.candidates);
    totalCost += competitorCandidates.value.cost;
    sourcesUsed.push("firecrawl");
  }

  // Deduplicate candidates by similarity
  const deduplicated = deduplicateCandidates(allCandidates);

  // Score candidates
  const scored = scoreCandidates(deduplicated, config);

  // Select top N
  const selected = scored
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, config.topicCount);

  return {
    selectedTopics: selected,
    allCandidates: deduplicated,
    metadata: {
      totalCandidates: deduplicated.length,
      sourcesUsed,
      durationMs: Date.now() - startTime,
      cost: totalCost,
    },
  };
}

// ---------------------------------------------------------------------------
// Source: Perplexity Research
// ---------------------------------------------------------------------------

/**
 * Uses Perplexity to research trending topics and content gaps.
 */
async function researchWithPerplexity(
  config: TopicResearchConfig
): Promise<{ candidates: TopicCandidate[]; cost: number }> {
  const focusAreas = config.topicsFocus.join(", ");
  const audience = config.targetAudience;

  const query = `What are the most trending and in-demand topics for ${audience} developers in these areas: ${focusAreas}? 
Focus on topics that:
1. Have high search volume but low competition
2. Are timely (recent developments, new releases, emerging patterns)
3. Have practical value (tutorials, how-tos, comparisons)

List 10 specific topic ideas with brief descriptions.`;

  const result = await perplexityResearch(query, `Content research for ${focusAreas}`);

  // Parse the response into candidates
  const candidates = parsePerplexityTopics(result.content, config);

  const cost =
    (result.usage.promptTokens / 1_000_000) * 3.0 +
    (result.usage.completionTokens / 1_000_000) * 15.0;

  return { candidates, cost };
}

/**
 * Parses Perplexity's response into topic candidates.
 */
function parsePerplexityTopics(
  content: string,
  config: TopicResearchConfig
): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];

  // Split by numbered items or bullet points
  const lines = content.split(/\n/).filter((l) => l.trim().length > 0);
  let currentTitle = "";
  let currentDescription = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Match numbered items: "1. Title" or "- Title" or "• Title"
    const titleMatch = trimmed.match(/^(?:\d+[\.\)]\s*|[-•]\s*)(.+)/);

    if (titleMatch) {
      // Save previous candidate
      if (currentTitle) {
        candidates.push(buildCandidate(currentTitle, currentDescription, "research", config));
      }
      currentTitle = titleMatch[1].replace(/\*\*/g, "").trim();
      currentDescription = "";
    } else if (currentTitle && trimmed.length > 20) {
      // Continuation of description
      currentDescription += (currentDescription ? " " : "") + trimmed;
    }
  }

  // Don't forget the last one
  if (currentTitle) {
    candidates.push(buildCandidate(currentTitle, currentDescription, "research", config));
  }

  return candidates.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Source: Firehose Real-time Monitoring
// ---------------------------------------------------------------------------

/**
 * Polls Firehose for recent events matching the operator's focus areas.
 * Extracts topic ideas from trending content.
 */
async function monitorWithFirehose(
  config: TopicResearchConfig
): Promise<{ candidates: TopicCandidate[] }> {
  const tags = config.firehoseTags ?? config.topicsFocus.map((t) => t.toLowerCase().replace(/\s+/g, "-"));

  const events = await firehosePollEvents({
    tags,
    limit: 50,
    since: "24h",
  });

  // Extract topic ideas from events
  const candidates: TopicCandidate[] = [];

  for (const event of events) {
    if (!event.title || event.title.length < 10) continue;

    // Only consider articles and news (not listings, forums, etc.)
    const isRelevant =
      !event.category ||
      event.category.includes("News") ||
      event.category.includes("Article") ||
      event.category.includes("Technology");

    if (!isRelevant) continue;

    candidates.push({
      title: extractTopicFromTitle(event.title),
      description: event.excerpt ?? `Trending topic from ${event.source}: ${event.title}`,
      source: "firehose",
      relevanceSignal: 0.6, // Moderate — needs validation
      trendSignal: 0.9, // High — it's trending right now
      keywords: extractKeywords(event.title),
      suggestedType: "blog_post",
      suggestedAudience: config.targetAudience,
    });
  }

  // Deduplicate and take top candidates
  return { candidates: candidates.slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Source: Competitor Analysis
// ---------------------------------------------------------------------------

/**
 * Scrapes competitor content to find gaps and opportunities.
 */
async function analyzeCompetitors(
  config: TopicResearchConfig
): Promise<{ candidates: TopicCandidate[]; cost: number }> {
  const competitorUrls = config.competitorUrls ?? [];
  if (competitorUrls.length === 0) {
    return { candidates: [], cost: 0 };
  }

  const candidates: TopicCandidate[] = [];
  let totalCost = 0;

  // Scrape up to 3 competitor pages
  const urlsToScrape = competitorUrls.slice(0, 3);

  for (const url of urlsToScrape) {
    try {
      const result = await firecrawlScrape(url, {
        formats: ["markdown"],
        onlyMainContent: true,
      });

      if (result.markdown) {
        // Extract topic ideas from competitor content
        const topics = extractTopicsFromContent(result.markdown, url);
        candidates.push(...topics);
      }

      // Firecrawl cost is per-page (roughly $0.001)
      totalCost += 0.001;
    } catch {
      // Skip failed scrapes
      continue;
    }
  }

  return { candidates: candidates.slice(0, 10), cost: totalCost };
}

/**
 * Extracts potential topic ideas from scraped competitor content.
 */
function extractTopicsFromContent(
  markdown: string,
  sourceUrl: string
): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];

  // Extract headings as potential topics
  const headings = markdown.match(/^#{1,3}\s+(.+)$/gm) ?? [];

  for (const heading of headings.slice(0, 5)) {
    const title = heading.replace(/^#+\s+/, "").trim();
    if (title.length < 10 || title.length > 100) continue;

    candidates.push({
      title: `${title} (alternative perspective)`,
      description: `Competitor covered this topic at ${new URL(sourceUrl).hostname}. Opportunity to provide a better/different take.`,
      source: "competitor",
      relevanceSignal: 0.7,
      trendSignal: 0.5,
      keywords: extractKeywords(title),
      suggestedType: "blog_post",
      suggestedAudience: "intermediate",
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Scoring & Selection
// ---------------------------------------------------------------------------

/**
 * Scores all candidates and converts them to ContentTopics.
 */
function scoreCandidates(
  candidates: TopicCandidate[],
  config: TopicResearchConfig
): ContentTopic[] {
  return candidates.map((candidate) => {
    // Boost relevance if topic matches focus areas
    let relevanceBoost = 0;
    for (const focus of config.topicsFocus) {
      if (
        candidate.title.toLowerCase().includes(focus.toLowerCase()) ||
        candidate.keywords.some((k) => k.toLowerCase().includes(focus.toLowerCase()))
      ) {
        relevanceBoost = 0.2;
        break;
      }
    }

    // Boost from past performance
    let performanceBoost = 0;
    if (config.pastPerformance) {
      const relatedPerformance = config.pastPerformance.find((p) =>
        candidate.keywords.some((k) => p.topic.toLowerCase().includes(k.toLowerCase()))
      );
      if (relatedPerformance && relatedPerformance.engagementRate > 0.03) {
        performanceBoost = 0.15;
      }
    }

    const relevanceScore = Math.min(1, candidate.relevanceSignal + relevanceBoost);
    const trendScore = candidate.trendSignal;
    const competitionScore = estimateCompetition(candidate);

    const priorityScore =
      ContentOperator.calculateTopicPriority({
        relevanceScore,
        trendScore,
        competitionScore,
      }) + performanceBoost;

    return {
      title: candidate.title,
      description: candidate.description,
      contentType: candidate.suggestedType,
      relevanceScore,
      trendScore,
      competitionScore,
      priorityScore: Math.min(1, priorityScore),
      keywords: candidate.keywords,
      source: candidate.source,
      audienceLevel: candidate.suggestedAudience,
      estimatedWordCount: estimateWordCount(candidate.suggestedType),
    };
  });
}

/**
 * Estimates competition level for a topic (0-1, lower = less competition).
 */
function estimateCompetition(candidate: TopicCandidate): number {
  // Heuristic: topics from firehose (very recent) have less competition
  // Topics from competitors have more competition
  switch (candidate.source) {
    case "firehose":
      return 0.3; // Low competition (new/trending)
    case "research":
      return 0.5; // Medium competition
    case "competitor":
      return 0.7; // High competition (already covered)
    default:
      return 0.5;
  }
}

/**
 * Estimates word count based on content type.
 */
function estimateWordCount(contentType: ContentTopic["contentType"]): number {
  switch (contentType) {
    case "blog_post":
      return 1500;
    case "tutorial":
      return 2500;
    case "documentation":
      return 1000;
    case "guide":
      return 3000;
    case "newsletter":
      return 800;
    case "case_study":
      return 2000;
    case "comparison":
      return 2000;
    default:
      return 1500;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deduplicates candidates by title similarity.
 */
function deduplicateCandidates(candidates: TopicCandidate[]): TopicCandidate[] {
  const seen = new Set<string>();
  const result: TopicCandidate[] = [];

  for (const candidate of candidates) {
    const normalized = candidate.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    // Simple dedup: skip if we've seen a very similar title
    const key = normalized.slice(0, 30);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

/**
 * Extracts a clean topic title from a news headline.
 */
function extractTopicFromTitle(title: string): string {
  // Remove common prefixes like "Breaking:", "Update:", etc.
  return title
    .replace(/^(Breaking|Update|New|Exclusive|Report):\s*/i, "")
    .replace(/\s*[-|]\s*.*$/, "") // Remove site name after dash/pipe
    .trim();
}

/**
 * Extracts keywords from a title string.
 */
function extractKeywords(title: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "can", "shall",
    "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "and",
    "but", "or", "nor", "not", "so", "yet", "both", "either",
    "neither", "each", "every", "all", "any", "few", "more",
    "most", "other", "some", "such", "no", "only", "own", "same",
    "than", "too", "very", "just", "how", "what", "when", "where",
    "why", "who", "which", "this", "that", "these", "those",
  ]);

  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 5);
}

/**
 * Builds a TopicCandidate from parsed data.
 */
function buildCandidate(
  title: string,
  description: string,
  source: TopicCandidate["source"],
  config: TopicResearchConfig
): TopicCandidate {
  return {
    title,
    description: description || `Topic discovered via ${source}`,
    source,
    relevanceSignal: 0.7,
    trendSignal: source === "firehose" ? 0.9 : 0.6,
    keywords: extractKeywords(title),
    suggestedType: inferContentType(title, description),
    suggestedAudience: config.targetAudience,
  };
}

/**
 * Infers the best content type from a topic title and description.
 */
function inferContentType(
  title: string,
  description: string
): ContentTopic["contentType"] {
  const combined = `${title} ${description}`.toLowerCase();

  if (combined.includes("how to") || combined.includes("step by step") || combined.includes("tutorial")) {
    return "tutorial";
  }
  if (combined.includes("guide") || combined.includes("complete") || combined.includes("comprehensive")) {
    return "guide";
  }
  if (combined.includes("vs") || combined.includes("comparison") || combined.includes("alternative")) {
    return "comparison";
  }
  if (combined.includes("api") || combined.includes("reference") || combined.includes("documentation")) {
    return "documentation";
  }
  if (combined.includes("case study") || combined.includes("success story")) {
    return "case_study";
  }

  return "blog_post";
}
