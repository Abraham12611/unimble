"use node";

/**
 * Content Operator — Autonomous Content Creation
 *
 * Concrete operator for blog posts, tutorials, documentation, and guides.
 * Extends OperatorBase with content-specific:
 * - Content types (blog_post, tutorial, documentation, guide, newsletter)
 * - Topic research workflows (Perplexity + Firehose + Firecrawl)
 * - Content generation with persona-aware prompts
 * - Multi-reviewer quality gates
 * - CMS publishing via Composio
 * - Performance analytics and learning extraction
 *
 * Phase 8.2.1 — Content Operator Core
 */

import { OperatorBase } from "./operatorBase";
import { operatorRegistry } from "./registry";
import type {
  OperatorType,
  OperatorTemplate,
  OperatorConfiguration,
} from "./types";
import type { AgentConfig } from "../agent/types";
import type { Persona } from "../agent/personas";
import { buildPersonaPrompt, getDefaultPersona } from "../agent/personas";
import type { WorkflowDefinition } from "../engine/types";

// ---------------------------------------------------------------------------
// Content-specific types
// ---------------------------------------------------------------------------

/** Types of content the operator can produce. */
export type ContentType =
  | "blog_post"
  | "tutorial"
  | "documentation"
  | "guide"
  | "newsletter"
  | "case_study"
  | "comparison";

/** Content status through the pipeline. */
export type ContentStatus =
  | "researching"
  | "outlining"
  | "drafting"
  | "reviewing"
  | "revising"
  | "approved"
  | "publishing"
  | "published"
  | "failed";

/** A topic selected for content creation. */
export interface ContentTopic {
  /** Topic title */
  title: string;
  /** Brief description */
  description: string;
  /** Target content type */
  contentType: ContentType;
  /** Relevance score (0-1) */
  relevanceScore: number;
  /** Trend score (0-1, how trending is this topic) */
  trendScore: number;
  /** Competition score (0-1, lower = less competition) */
  competitionScore: number;
  /** Combined priority score */
  priorityScore: number;
  /** Target keywords for SEO */
  keywords: string[];
  /** Source of the topic idea */
  source: "research" | "firehose" | "competitor" | "manual" | "memory";
  /** Target audience level */
  audienceLevel: "beginner" | "intermediate" | "advanced" | "mixed";
  /** Estimated word count */
  estimatedWordCount: number;
}

/** A content outline before full generation. */
export interface ContentOutline {
  /** Topic this outline is for */
  topic: ContentTopic;
  /** Title (may differ from topic title) */
  title: string;
  /** Meta description for SEO */
  metaDescription: string;
  /** Ordered sections */
  sections: OutlineSection[];
  /** Estimated total word count */
  estimatedWordCount: number;
  /** Key takeaways */
  keyTakeaways: string[];
  /** Internal link opportunities */
  internalLinks: string[];
}

/** A section in a content outline. */
export interface OutlineSection {
  /** Section heading */
  heading: string;
  /** Heading level (2-4) */
  level: number;
  /** Brief description of what this section covers */
  description: string;
  /** Whether this section includes a code example */
  hasCodeExample: boolean;
  /** Estimated word count for this section */
  estimatedWords: number;
}

/** A generated content draft. */
export interface ContentDraft {
  /** Draft title */
  title: string;
  /** Full markdown content */
  markdown: string;
  /** Meta description */
  metaDescription: string;
  /** Excerpt/summary */
  excerpt: string;
  /** Tags */
  tags: string[];
  /** SEO slug */
  slug: string;
  /** Word count */
  wordCount: number;
  /** Reading time in minutes */
  readingTimeMinutes: number;
  /** Image suggestions */
  imageSuggestions: ImageSuggestion[];
  /** Content status */
  status: ContentStatus;
  /** Review score (set after review) */
  reviewScore?: number;
  /** Revision count */
  revisionCount: number;
}

/** An image suggestion for the content. */
export interface ImageSuggestion {
  /** Where in the content this image should go */
  placement: string;
  /** Description of what the image should show */
  description: string;
  /** Alt text for accessibility */
  altText: string;
  /** Type of image */
  type: "hero" | "diagram" | "screenshot" | "illustration" | "code_output";
}

/** Content analytics data. */
export interface ContentAnalytics {
  /** Content ID */
  contentId: string;
  /** Views */
  views: number;
  /** Unique visitors */
  uniqueVisitors: number;
  /** Average time on page (seconds) */
  avgTimeOnPage: number;
  /** Bounce rate (0-1) */
  bounceRate: number;
  /** Social shares */
  socialShares: number;
  /** Comments */
  comments: number;
  /** Backlinks discovered */
  backlinks: number;
  /** Search impressions */
  searchImpressions: number;
  /** Search clicks */
  searchClicks: number;
  /** Average search position */
  avgSearchPosition: number;
}

// ---------------------------------------------------------------------------
// Content Operator Class
// ---------------------------------------------------------------------------

/**
 * Content Operator — produces blog posts, tutorials, and documentation.
 *
 * Workflow:
 * 1. Topic Research → select high-value topics
 * 2. Outline Generation → structure the content
 * 3. Draft Generation → write with persona
 * 4. Review → multi-dimensional quality check
 * 5. Revision → address review feedback
 * 6. Publishing → push to CMS
 * 7. Analytics → track performance and learn
 */
export class ContentOperator extends OperatorBase {
  constructor(config: OperatorConfiguration) {
    super(config);
  }

  // ---------------------------------------------------------------------------
  // Abstract implementations
  // ---------------------------------------------------------------------------

  getTemplate(): OperatorTemplate {
    const template = operatorRegistry.get("content-operator");
    if (!template) {
      throw new Error("Content operator template not found in registry");
    }
    return template;
  }

  getType(): OperatorType {
    return "content";
  }

  // ---------------------------------------------------------------------------
  // Agent Configuration
  // ---------------------------------------------------------------------------

  /**
   * Builds the agent config for the content operator.
   * Adds content-specific tools and memory categories.
   */
  buildAgentConfig(operatorId: string, persona?: Persona): AgentConfig {
    const baseConfig = super.buildAgentConfig(operatorId, persona);

    // Add content-specific tools
    const contentTools = [
      ...baseConfig.tools,
      "firecrawl.crawl",
      "composio.execute",
    ];

    // Deduplicate
    const uniqueTools = [...new Set(contentTools)];

    return {
      ...baseConfig,
      tools: uniqueTools,
      memoryCategories: ["workspace", "operator", "content_performance", "audience_feedback"],
      maxIterations: 20, // Content workflows need more iterations
    };
  }

  /**
   * Returns the default persona for the content operator.
   */
  getDefaultPersona(): Persona | undefined {
    return getDefaultPersona("technical-writer");
  }

  // ---------------------------------------------------------------------------
  // Workflow Definitions
  // ---------------------------------------------------------------------------

  /**
   * Builds the weekly content pipeline workflow definition.
   * This is the main automated workflow that runs on schedule.
   */
  buildWeeklyPipelineWorkflow(operatorId: string): WorkflowDefinition {
    const settings = this.config.settings;
    const weeklyTarget = (settings.weekly_content_target as number) ?? 2;
    const approvalRequired = this.config.approvalRequired;

    return {
      name: "Weekly Content Pipeline",
      description: `Research, write, review, and publish ${weeklyTarget} content pieces per week`,
      version: 1,
      trigger: {
        type: "schedule",
        cron: this.getScheduleCron("weekly-content-pipeline"),
        timezone: this.getScheduleTimezone("weekly-content-pipeline"),
        enabled: true,
      },
      steps: [
        // Step 1: Topic Research
        {
          id: "topic_research",
          name: "Topic Research",
          type: "agent",
          config: {
            prompt: this.buildTopicResearchPrompt(),
            modelTier: "generation",
            tools: ["perplexity.search", "firecrawl.scrape", "memory.read"],
            memoryContext: ["content_performance", "audience_feedback"],
            outputFormat: "json",
          },
        },
        // Step 2: Content Generation (for each topic)
        {
          id: "content_generation",
          name: "Content Generation",
          type: "agent",
          dependsOn: ["topic_research"],
          config: {
            prompt: this.buildContentGenerationPrompt(),
            modelTier: "generation",
            tools: ["perplexity.search", "firecrawl.scrape", "llm.generate", "memory.read"],
            memoryContext: ["workspace", "operator"],
            outputFormat: "markdown",
            maxTokens: 8192,
          },
        },
        // Step 3: Content Review
        {
          id: "content_review",
          name: "Content Review",
          type: "agent",
          dependsOn: ["content_generation"],
          config: {
            prompt: this.buildContentReviewPrompt(),
            modelTier: "generation",
            tools: ["perplexity.search"],
            outputFormat: "json",
            temperature: 0.2,
          },
        },
        // Step 4: Conditional — revise or approve
        {
          id: "review_decision",
          name: "Review Decision",
          type: "conditional",
          dependsOn: ["content_review"],
          config: {
            conditions: [
              {
                expression: "{{content_review.output.verdict}} === 'approve'",
                thenSteps: approvalRequired ? ["human_approval"] : ["publish"],
              },
              {
                expression: "{{content_review.output.verdict}} === 'revise'",
                thenSteps: ["revision"],
              },
            ],
            elseSteps: ["notify_failure"],
          },
        },
        // Step 5a: Revision (if needed)
        {
          id: "revision",
          name: "Content Revision",
          type: "agent",
          dependsOn: ["review_decision"],
          config: {
            prompt: this.buildRevisionPrompt(),
            modelTier: "generation",
            tools: ["perplexity.search", "llm.generate"],
            outputFormat: "markdown",
            maxTokens: 8192,
          },
        },
        // Step 5a-2: Post-revision publish (with optional approval)
        ...(approvalRequired
          ? [
              {
                id: "revision_approval",
                name: "Post-Revision Approval",
                type: "approval" as const,
                dependsOn: ["revision"],
                config: {
                  contentRef: "{{revision.output}}",
                  approvalType: "content_publish",
                  timeoutMs: 86400000, // 24 hours
                  timeoutAction: "skip" as const,
                },
              },
              {
                id: "publish_revised",
                name: "Publish Revised Content",
                type: "agent" as const,
                dependsOn: ["revision_approval"],
                config: {
                  prompt: this.buildPublishPrompt("{{revision.output}}"),
                  modelTier: "fast" as const,
                  tools: ["composio.execute"],
                  outputFormat: "json" as const,
                },
              },
            ]
          : [
              {
                id: "publish_revised",
                name: "Publish Revised Content",
                type: "agent" as const,
                dependsOn: ["revision"],
                config: {
                  prompt: this.buildPublishPrompt("{{revision.output}}"),
                  modelTier: "fast" as const,
                  tools: ["composio.execute"],
                  outputFormat: "json" as const,
                },
              },
            ]),
        // Step 5b: First-pass approved content path
        ...(approvalRequired
          ? [
              {
                id: "human_approval",
                name: "Human Approval",
                type: "approval" as const,
                dependsOn: ["review_decision"],
                config: {
                  contentRef: "{{content_generation.output}}",
                  approvalType: "content_publish",
                  timeoutMs: 86400000, // 24 hours
                  timeoutAction: "skip" as const,
                },
              },
              {
                id: "publish",
                name: "Publish Content",
                type: "agent" as const,
                dependsOn: ["human_approval"],
                config: {
                  prompt: this.buildPublishPrompt(),
                  modelTier: "fast" as const,
                  tools: ["composio.execute"],
                  outputFormat: "json" as const,
                },
              },
            ]
          : [
              {
                id: "publish",
                name: "Publish Content",
                type: "agent" as const,
                dependsOn: ["review_decision"],
                config: {
                  prompt: this.buildPublishPrompt(),
                  modelTier: "fast" as const,
                  tools: ["composio.execute"],
                  outputFormat: "json" as const,
                },
              },
            ]),
        // Step 7: Notify failure
        {
          id: "notify_failure",
          name: "Notify Failure",
          type: "tool",
          dependsOn: ["review_decision"],
          continueOnFailure: true,
          config: {
            toolName: "notification.send",
            params: {
              title: "Content Review Failed",
              message: "Content was rejected during review. Manual intervention needed.",
              type: "warning",
            },
          },
        },
      ],
      maxDurationMs: 3600000, // 1 hour max
    };
  }

  /**
   * Builds the on-demand content generation workflow.
   * Triggered via API when a user requests content on a specific topic.
   */
  buildOnDemandWorkflow(operatorId: string): WorkflowDefinition {
    return {
      name: "On-Demand Content",
      description: "Generate content on a specific topic provided by the user",
      version: 1,
      trigger: {
        type: "manual",
        inputSchema: {
          type: "object",
          properties: {
            topic: { type: "string", description: "The topic to write about" },
            contentType: {
              type: "string",
              enum: ["blog_post", "tutorial", "documentation", "guide"],
            },
            keywords: { type: "array", items: { type: "string" } },
            wordCount: { type: "number" },
          },
          required: ["topic"],
        },
      },
      steps: [
        {
          id: "research",
          name: "Research Topic",
          type: "agent",
          config: {
            prompt: `Research the following topic thoroughly: {{input.topic}}
Content type: {{input.contentType}}
Target keywords: {{input.keywords}}

Gather relevant information, statistics, code examples, and best practices.
Return a structured research summary.`,
            modelTier: "generation",
            tools: ["perplexity.search", "firecrawl.scrape", "memory.read"],
            outputFormat: "json",
          },
        },
        {
          id: "generate",
          name: "Generate Content",
          type: "agent",
          dependsOn: ["research"],
          config: {
            prompt: this.buildContentGenerationPrompt(),
            modelTier: "generation",
            tools: ["llm.generate", "memory.read"],
            outputFormat: "markdown",
            maxTokens: 8192,
          },
        },
        {
          id: "review",
          name: "Review Content",
          type: "agent",
          dependsOn: ["generate"],
          config: {
            prompt: this.buildContentReviewPrompt(),
            modelTier: "generation",
            tools: ["perplexity.search"],
            outputFormat: "json",
            temperature: 0.2,
          },
        },
      ],
      maxDurationMs: 1800000, // 30 minutes
    };
  }

  // ---------------------------------------------------------------------------
  // Prompt Builders
  // ---------------------------------------------------------------------------

  /**
   * Builds the topic research prompt based on operator settings.
   */
  buildTopicResearchPrompt(): string {
    const settings = this.config.settings;
    const topicsFocus = (settings.topics_focus as string[]) ?? [];
    const targetAudience = (settings.target_audience as string) ?? "intermediate";
    const weeklyTarget = (settings.weekly_content_target as number) ?? 2;

    return `You are a content strategist. Research and select ${weeklyTarget} high-value topics for content creation.

## Requirements
- Target audience: ${targetAudience} developers
- Focus areas: ${topicsFocus.length > 0 ? topicsFocus.join(", ") : "general technology topics"}
- Content should be timely, relevant, and have search demand

## Process
1. Search for trending topics in the focus areas
2. Analyze competitor content to find gaps
3. Check what topics have performed well in the past (from memory)
4. Score each topic on relevance, trend, and competition
5. Select the top ${weeklyTarget} topics

## Output Format
Return a JSON array of topics with: title, description, contentType, keywords, relevanceScore, trendScore, competitionScore, priorityScore, audienceLevel, estimatedWordCount, source.`;
  }

  /**
   * Builds the content generation prompt.
   */
  buildContentGenerationPrompt(): string {
    const settings = this.config.settings;
    const contentStyle = (settings.content_style as string) ?? "technical";
    const targetAudience = (settings.target_audience as string) ?? "intermediate";

    return `Generate high-quality content based on the research provided.

## Style Guidelines
- Content style: ${contentStyle}
- Target audience: ${targetAudience} developers
- Include practical code examples where relevant
- Use clear headings and logical structure
- Optimize for SEO with natural keyword placement
- Include a compelling introduction and conclusion

## Structure
1. Generate an outline first
2. Write each section with depth and clarity
3. Add code examples with explanations
4. Include key takeaways
5. Suggest internal links

## Output
Return the full content in markdown format with:
- Title (H1)
- Meta description
- Sections with proper heading hierarchy
- Code blocks with language tags
- A summary/conclusion section`;
  }

  /**
   * Builds the content review prompt.
   */
  buildContentReviewPrompt(): string {
    return `Review the generated content for quality across these dimensions:

## Review Criteria
1. **Technical Accuracy**: Are code examples correct? Are claims verifiable?
2. **Editorial Quality**: Is the writing clear, well-structured, and engaging?
3. **Factual Accuracy**: Are all facts current and properly sourced?
4. **SEO Quality**: Are keywords naturally integrated? Is structure search-friendly?

## Scoring
Score each dimension 1-10. Overall score is the weighted average:
- Technical: 40%
- Editorial: 30%
- Factual: 20%
- SEO: 10%

## Verdict
- Score >= 8.0: "approve"
- Score 5.0-7.9: "revise" (provide specific revision instructions)
- Score < 5.0: "reject" (explain why)

## Output Format
Return JSON with: verdict, overallScore, scores (per dimension), issues (array), revisionInstructions (if revise).`;
  }

  /**
   * Builds the revision prompt.
   */
  buildRevisionPrompt(): string {
    return `Revise the content based on the review feedback.

## Review Feedback
{{content_review.output.revisionInstructions}}

## Issues to Address
{{content_review.output.issues}}

## Instructions
1. Address all "must_fix" issues
2. Address "should_fix" issues where possible
3. Maintain the original voice and structure
4. Do not introduce new errors while fixing existing ones
5. Return the complete revised content in markdown format`;
  }

  /**
   * Builds the publish prompt.
   * @param contentSourceRef - Template reference to the content to publish.
   *   Defaults to {{content_generation.output}} for first-pass approved content.
   *   Use {{revision.output}} for revised content.
   */
  buildPublishPrompt(contentSourceRef = "{{content_generation.output}}"): string {
    return `Publish the approved content to the connected CMS.

## Content to Publish
${contentSourceRef}

## Instructions
1. Format the content for the target CMS
2. Set appropriate tags and categories
3. Set status to "draft" (human will publish) or "published" based on approval
4. Set the SEO slug and meta description
5. Return the published URL and post ID`;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Gets the cron schedule for a specific workflow.
   */
  private getScheduleCron(workflowId: string): string {
    const schedule = this.config.schedules.find((s) => s.workflowId === workflowId);
    return schedule?.cron ?? "0 9 * * MON"; // Default: Monday 9am
  }

  /**
   * Gets the timezone for a specific workflow schedule.
   */
  private getScheduleTimezone(workflowId: string): string {
    const schedule = this.config.schedules.find((s) => s.workflowId === workflowId);
    return schedule?.timezone ?? "UTC";
  }

  /**
   * Calculates the priority score for a topic.
   */
  static calculateTopicPriority(topic: Partial<ContentTopic>): number {
    const relevance = topic.relevanceScore ?? 0.5;
    const trend = topic.trendScore ?? 0.5;
    const competition = topic.competitionScore ?? 0.5;

    // Weighted formula: relevance matters most, then trend, then low competition
    return relevance * 0.4 + trend * 0.35 + (1 - competition) * 0.25;
  }

  /**
   * Estimates reading time from word count.
   */
  static estimateReadingTime(wordCount: number): number {
    // Average reading speed: 200-250 words per minute for technical content
    return Math.ceil(wordCount / 225);
  }

  /**
   * Generates a URL-friendly slug from a title.
   */
  static generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
  }
}
