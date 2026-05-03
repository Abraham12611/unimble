/**
 * Phase 7 — Agent Runtime: Built-in tools.
 *
 * 8 built-in tools:
 *   1. perplexity_search   — web search via Perplexity AI
 *   2. firecrawl_scrape    — web page scraping via Firecrawl
 *   3. firehose_monitor    — real-time content monitoring
 *   4. memory_read         — read from agent memory
 *   5. memory_write        — write to agent memory
 *   6. publish_content     — publish content to an integration
 *   7. send_notification   — send a notification
 *   8. social_post         — post to social media
 *
 * Each tool accepts external HTTP clients via constructor injection,
 * making them fully testable with mocked clients.
 */

import { z } from "zod";
import type { AgentContext, JSONSchema, ToolResult } from "../types";
import { Tool } from "./index";

// ---------------------------------------------------------------------------
// HTTP client interface (injectable for testing)
// ---------------------------------------------------------------------------

export interface HttpClient {
  post(url: string, body: unknown, headers?: Record<string, string>): Promise<unknown>;
  get(url: string, headers?: Record<string, string>): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// 1. perplexity_search
// ---------------------------------------------------------------------------

const perplexitySchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(20).optional(),
  focus: z.enum(["web", "academic", "news"]).optional(),
});

export class PerplexitySearchTool extends Tool {
  readonly name = "perplexity_search";
  readonly description =
    "Search the web for up-to-date information using Perplexity AI. Returns relevant excerpts and sources.";
  readonly category = "search";
  readonly schema: JSONSchema = {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      maxResults: { type: "number", description: "Maximum results (1–20)" },
      focus: {
        type: "string",
        enum: ["web", "academic", "news"],
        description: "Search focus area",
      },
    },
    required: ["query"],
  };

  protected paramSchema = perplexitySchema;

  constructor(
    private readonly apiKey: string,
    private readonly client?: HttpClient
  ) {
    super();
  }

  async execute(params: unknown, _ctx: AgentContext): Promise<ToolResult> {
    const { query, maxResults = 5, focus = "web" } = params as z.infer<typeof perplexitySchema>;

    const httpClient = this.client;
    if (!httpClient) {
      throw new Error("HTTP client not configured for perplexity_search");
    }

    const response = await httpClient.post(
      "https://api.perplexity.ai/chat/completions",
      {
        model: "llama-3.1-sonar-small-128k-online",
        messages: [{ role: "user", content: query }],
        max_tokens: 1024,
        search_domain_filter: focus === "academic" ? ["scholar.google.com"] : undefined,
      },
      {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      }
    );

    const data = response as Record<string, unknown>;
    const content =
      (data?.choices as Record<string, unknown>[])?.[0]?.message?.content ?? "";
    const citations = (data?.citations as string[]) ?? [];

    return {
      success: true,
      output: {
        answer: content,
        sources: citations.slice(0, maxResults),
        query,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// 2. firecrawl_scrape
// ---------------------------------------------------------------------------

const firecrawlSchema = z.object({
  url: z.string().url(),
  formats: z.array(z.enum(["markdown", "html", "text"])).optional(),
  includeLinks: z.boolean().optional(),
});

export class FirecrawlScrapeTool extends Tool {
  readonly name = "firecrawl_scrape";
  readonly description =
    "Scrape and extract content from any web page, converting it to clean markdown, HTML, or plain text.";
  readonly category = "web";
  readonly schema: JSONSchema = {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to scrape" },
      formats: {
        type: "array",
        items: { type: "string", enum: ["markdown", "html", "text"] },
        description: "Output formats",
      },
      includeLinks: { type: "boolean", description: "Include hyperlinks in output" },
    },
    required: ["url"],
  };

  protected paramSchema = firecrawlSchema;

  constructor(
    private readonly apiKey: string,
    private readonly client?: HttpClient
  ) {
    super();
  }

  async execute(params: unknown, _ctx: AgentContext): Promise<ToolResult> {
    const { url, formats = ["markdown"], includeLinks = false } =
      params as z.infer<typeof firecrawlSchema>;

    const httpClient = this.client;
    if (!httpClient) throw new Error("HTTP client not configured for firecrawl_scrape");

    const response = await httpClient.post(
      "https://api.firecrawl.dev/v1/scrape",
      { url, formats, includeTags: includeLinks ? ["a"] : [] },
      {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      }
    );

    const data = (response as Record<string, unknown>)?.data as Record<string, unknown>;

    return {
      success: true,
      output: {
        url,
        markdown: data?.markdown,
        html: data?.html,
        text: data?.text,
        title: data?.metadata?.title,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// 3. firehose_monitor
// ---------------------------------------------------------------------------

const firehoseSchema = z.object({
  keywords: z.array(z.string()).min(1),
  sources: z.array(z.enum(["twitter", "reddit", "news", "blogs"])).optional(),
  since: z.number().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export class FirehoseMonitorTool extends Tool {
  readonly name = "firehose_monitor";
  readonly description =
    "Monitor real-time content streams for keywords across social media, news, and blog sources.";
  readonly category = "monitoring";
  readonly schema: JSONSchema = {
    type: "object",
    properties: {
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Keywords to monitor",
      },
      sources: {
        type: "array",
        items: { type: "string", enum: ["twitter", "reddit", "news", "blogs"] },
        description: "Content sources to monitor",
      },
      since: { type: "number", description: "Unix timestamp: only return content after this time" },
      limit: { type: "number", description: "Maximum results (1–100)" },
    },
    required: ["keywords"],
  };

  protected paramSchema = firehoseSchema;

  constructor(private readonly client?: HttpClient) {
    super();
  }

  async execute(params: unknown, _ctx: AgentContext): Promise<ToolResult> {
    const {
      keywords,
      sources = ["twitter", "reddit", "news"],
      since,
      limit = 20,
    } = params as z.infer<typeof firehoseSchema>;

    if (!this.client) throw new Error("HTTP client not configured for firehose_monitor");

    const response = await this.client.post(
      "https://api.firehose.example/v1/search",
      { keywords, sources, since, limit },
      { "Content-Type": "application/json" }
    );

    const results = (response as Record<string, unknown>)?.results ?? [];

    return {
      success: true,
      output: { keywords, sources, results, count: (results as unknown[]).length },
    };
  }
}

// ---------------------------------------------------------------------------
// 4. memory_read
// ---------------------------------------------------------------------------

const memoryReadSchema = z.object({
  query: z.string().min(1),
  category: z
    .enum(["workspace", "operator", "preferences", "patterns", "content-history"])
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export interface MemoryReader {
  search(query: string, category?: string, limit?: number): Promise<MemoryItem[]>;
}

export interface MemoryItem {
  id: string;
  category: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export class MemoryReadTool extends Tool {
  readonly name = "memory_read";
  readonly description =
    "Search and retrieve relevant memories from the agent's long-term memory store.";
  readonly category = "memory";
  readonly schema: JSONSchema = {
    type: "object",
    properties: {
      query: { type: "string", description: "Semantic search query" },
      category: {
        type: "string",
        enum: ["workspace", "operator", "preferences", "patterns", "content-history"],
        description: "Memory category to search",
      },
      limit: { type: "number", description: "Maximum memories to return (1–50)" },
    },
    required: ["query"],
  };

  protected paramSchema = memoryReadSchema;

  constructor(private readonly reader: MemoryReader) {
    super();
  }

  async execute(params: unknown, _ctx: AgentContext): Promise<ToolResult> {
    const { query, category, limit = 10 } = params as z.infer<typeof memoryReadSchema>;
    const results = await this.reader.search(query, category, limit);
    return {
      success: true,
      output: { query, results, count: results.length },
    };
  }
}

// ---------------------------------------------------------------------------
// 5. memory_write
// ---------------------------------------------------------------------------

const memoryWriteSchema = z.object({
  content: z.string().min(1),
  category: z.enum(["workspace", "operator", "preferences", "patterns", "content-history"]),
  metadata: z.record(z.unknown()).optional(),
});

export interface MemoryWriter {
  store(content: string, category: string, metadata?: Record<string, unknown>): Promise<string>;
}

export class MemoryWriteTool extends Tool {
  readonly name = "memory_write";
  readonly description =
    "Store a new memory in the agent's long-term memory store for future retrieval.";
  readonly category = "memory";
  readonly schema: JSONSchema = {
    type: "object",
    properties: {
      content: { type: "string", description: "The memory content to store" },
      category: {
        type: "string",
        enum: ["workspace", "operator", "preferences", "patterns", "content-history"],
        description: "Category to file this memory under",
      },
      metadata: { type: "object", description: "Optional metadata tags" },
    },
    required: ["content", "category"],
  };

  protected paramSchema = memoryWriteSchema;

  constructor(private readonly writer: MemoryWriter) {
    super();
  }

  async execute(params: unknown, _ctx: AgentContext): Promise<ToolResult> {
    const { content, category, metadata } =
      params as z.infer<typeof memoryWriteSchema>;
    const id = await this.writer.store(content, category, metadata);
    return {
      success: true,
      output: { id, category, stored: true },
    };
  }
}

// ---------------------------------------------------------------------------
// 6. publish_content
// ---------------------------------------------------------------------------

const publishSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  platform: z.string(),
  metadata: z.record(z.unknown()).optional(),
  scheduledAt: z.number().optional(),
});

export interface ContentPublisher {
  publish(
    title: string,
    content: string,
    platform: string,
    meta?: Record<string, unknown>,
    scheduledAt?: number
  ): Promise<{ id: string; url?: string }>;
}

export class PublishContentTool extends Tool {
  readonly name = "publish_content";
  readonly description =
    "Publish content to a connected platform (blog, CMS, newsletter, etc.).";
  readonly category = "publishing";
  readonly schema: JSONSchema = {
    type: "object",
    properties: {
      title: { type: "string", description: "Content title" },
      content: { type: "string", description: "Content body" },
      platform: { type: "string", description: "Target platform identifier" },
      metadata: { type: "object", description: "Platform-specific metadata" },
      scheduledAt: { type: "number", description: "Schedule time (Unix ms)" },
    },
    required: ["title", "content", "platform"],
  };

  protected paramSchema = publishSchema;

  constructor(private readonly publisher: ContentPublisher) {
    super();
  }

  async execute(params: unknown, _ctx: AgentContext): Promise<ToolResult> {
    const { title, content, platform, metadata, scheduledAt } =
      params as z.infer<typeof publishSchema>;
    const result = await this.publisher.publish(title, content, platform, metadata, scheduledAt);
    return {
      success: true,
      output: { id: result.id, url: result.url, platform, scheduled: Boolean(scheduledAt) },
    };
  }
}

// ---------------------------------------------------------------------------
// 7. send_notification
// ---------------------------------------------------------------------------

const notificationSchema = z.object({
  channel: z.string().min(1),
  message: z.string().min(1),
  recipients: z.array(z.string()).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export interface NotificationSender {
  send(
    channel: string,
    message: string,
    recipients?: string[],
    priority?: string
  ): Promise<{ messageId: string }>;
}

export class SendNotificationTool extends Tool {
  readonly name = "send_notification";
  readonly description =
    "Send a notification to a channel or list of recipients (email, Slack, webhook, etc.).";
  readonly category = "communication";
  readonly schema: JSONSchema = {
    type: "object",
    properties: {
      channel: { type: "string", description: "Notification channel (e.g. slack, email)" },
      message: { type: "string", description: "Notification message" },
      recipients: {
        type: "array",
        items: { type: "string" },
        description: "Recipient identifiers",
      },
      priority: {
        type: "string",
        enum: ["low", "normal", "high", "urgent"],
        description: "Notification priority",
      },
    },
    required: ["channel", "message"],
  };

  protected paramSchema = notificationSchema;

  constructor(private readonly sender: NotificationSender) {
    super();
  }

  async execute(params: unknown, _ctx: AgentContext): Promise<ToolResult> {
    const { channel, message, recipients, priority = "normal" } =
      params as z.infer<typeof notificationSchema>;
    const result = await this.sender.send(channel, message, recipients, priority);
    return {
      success: true,
      output: { messageId: result.messageId, channel, priority },
    };
  }
}

// ---------------------------------------------------------------------------
// 8. social_post
// ---------------------------------------------------------------------------

const socialPostSchema = z.object({
  platform: z.enum(["twitter", "linkedin", "instagram", "facebook", "threads"]),
  content: z.string().min(1),
  mediaUrls: z.array(z.string().url()).optional(),
  scheduledAt: z.number().optional(),
  threadOf: z.string().optional(),
});

export interface SocialMediaClient {
  post(
    platform: string,
    content: string,
    mediaUrls?: string[],
    scheduledAt?: number,
    threadOf?: string
  ): Promise<{ postId: string; url?: string }>;
}

export class SocialPostTool extends Tool {
  readonly name = "social_post";
  readonly description =
    "Post content to a social media platform (Twitter/X, LinkedIn, Instagram, Facebook, Threads).";
  readonly category = "publishing";
  readonly schema: JSONSchema = {
    type: "object",
    properties: {
      platform: {
        type: "string",
        enum: ["twitter", "linkedin", "instagram", "facebook", "threads"],
        description: "Social platform",
      },
      content: { type: "string", description: "Post content" },
      mediaUrls: {
        type: "array",
        items: { type: "string" },
        description: "Media attachment URLs",
      },
      scheduledAt: { type: "number", description: "Schedule time (Unix ms)" },
      threadOf: { type: "string", description: "Parent post ID for threading" },
    },
    required: ["platform", "content"],
  };

  protected paramSchema = socialPostSchema;

  constructor(private readonly client: SocialMediaClient) {
    super();
  }

  async execute(params: unknown, _ctx: AgentContext): Promise<ToolResult> {
    const { platform, content, mediaUrls, scheduledAt, threadOf } =
      params as z.infer<typeof socialPostSchema>;
    const result = await this.client.post(
      platform,
      content,
      mediaUrls,
      scheduledAt,
      threadOf
    );
    return {
      success: true,
      output: {
        postId: result.postId,
        url: result.url,
        platform,
        scheduled: Boolean(scheduledAt),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Factory: create a registry populated with all built-in tools
// ---------------------------------------------------------------------------

export interface BuiltinToolDependencies {
  perplexityApiKey?: string;
  firecrawlApiKey?: string;
  httpClient?: HttpClient;
  memoryReader?: MemoryReader;
  memoryWriter?: MemoryWriter;
  contentPublisher?: ContentPublisher;
  notificationSender?: NotificationSender;
  socialMediaClient?: SocialMediaClient;
}

import { ToolRegistry } from "./index";

export function createBuiltinRegistry(deps: BuiltinToolDependencies = {}): ToolRegistry {
  const registry = new ToolRegistry();

  if (deps.perplexityApiKey) {
    registry.register(new PerplexitySearchTool(deps.perplexityApiKey, deps.httpClient));
  }
  if (deps.firecrawlApiKey) {
    registry.register(new FirecrawlScrapeTool(deps.firecrawlApiKey, deps.httpClient));
  }
  if (deps.httpClient) {
    registry.register(new FirehoseMonitorTool(deps.httpClient));
  }
  if (deps.memoryReader) {
    registry.register(new MemoryReadTool(deps.memoryReader));
  }
  if (deps.memoryWriter) {
    registry.register(new MemoryWriteTool(deps.memoryWriter));
  }
  if (deps.contentPublisher) {
    registry.register(new PublishContentTool(deps.contentPublisher));
  }
  if (deps.notificationSender) {
    registry.register(new SendNotificationTool(deps.notificationSender));
  }
  if (deps.socialMediaClient) {
    registry.register(new SocialPostTool(deps.socialMediaClient));
  }

  return registry;
}
