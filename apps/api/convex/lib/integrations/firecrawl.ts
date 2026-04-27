"use node";

/**
 * Firecrawl Integration
 *
 * Provides web scraping and content extraction capabilities via
 * the Firecrawl API. Used by operators to extract structured data
 * from web pages, scrape competitor content, convert pages to
 * markdown for LLM processing, and monitor documentation sites.
 *
 * Key features:
 * - JavaScript rendering (handles SPAs)
 * - Structured data extraction with JSON schemas
 * - Batch scraping with rate limiting
 * - Markdown conversion for LLM consumption
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a scrape operation. */
export interface ScrapeResult {
  /** Extracted markdown content */
  markdown?: string;
  /** Raw HTML content */
  html?: string;
  /** Structured JSON data (if schema provided) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json?: any;
  /** Page metadata */
  metadata: {
    title?: string;
    description?: string;
    url: string;
    statusCode?: number;
  };
  /** Latency in milliseconds */
  latencyMs: number;
}

/** Options for scraping a single page. */
export interface ScrapeOptions {
  /** Output formats to request */
  formats?: ("markdown" | "html" | "json")[];
  /** Only extract main content (skip nav, footer, etc.) */
  onlyMainContent?: boolean;
  /** JSON extraction schema */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jsonSchema?: Record<string, any>;
  /** JSON extraction prompt */
  jsonPrompt?: string;
  /** Wait for JS rendering (ms) */
  waitFor?: number;
  /** HTML tags to include */
  includeTags?: string[];
  /** HTML tags to exclude */
  excludeTags?: string[];
  /** Request timeout in ms */
  timeout?: number;
}

/** Result of a crawl operation. */
export interface CrawlResult {
  /** Pages discovered and scraped */
  pages: CrawlPage[];
  /** Total pages found */
  totalPages: number;
  /** Crawl duration in milliseconds */
  latencyMs: number;
}

/** A single page from a crawl. */
export interface CrawlPage {
  /** Page URL */
  url: string;
  /** Markdown content */
  markdown?: string;
  /** Page title */
  title?: string;
  /** Page description */
  description?: string;
}

/** Options for crawling a site. */
export interface CrawlOptions {
  /** Max pages to crawl */
  limit?: number;
  /** Max depth to crawl */
  maxDepth?: number;
  /** URL patterns to include */
  includePaths?: string[];
  /** URL patterns to exclude */
  excludePaths?: string[];
  /** Only extract main content */
  onlyMainContent?: boolean;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Scrapes a single URL and extracts content.
 *
 * Supports markdown extraction, HTML, and structured JSON
 * extraction with custom schemas.
 */
export async function firecrawlScrape(
  url: string,
  options: ScrapeOptions = {}
): Promise<ScrapeResult> {
  const apiKey = getFirecrawlApiKey();
  const startTime = Date.now();

  const formats = options.formats ?? ["markdown"];

  const body: Record<string, unknown> = {
    url,
    formats,
    onlyMainContent: options.onlyMainContent ?? true,
  };

  if (options.waitFor) body.waitFor = options.waitFor;
  if (options.includeTags) body.includeTags = options.includeTags;
  if (options.excludeTags) body.excludeTags = options.excludeTags;

  if (formats.includes("json") && (options.jsonSchema || options.jsonPrompt)) {
    body.jsonOptions = {
      ...(options.jsonSchema ? { schema: options.jsonSchema } : {}),
      ...(options.jsonPrompt ? { prompt: options.jsonPrompt } : {}),
    };
  }

  const response = await fetchWithRetry(
    "https://api.firecrawl.dev/v1/scrape",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    options.timeout
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl scrape failed: HTTP ${response.status}: ${errorText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();
  const result = data.data ?? data;

  return {
    markdown: result.markdown ?? undefined,
    html: result.html ?? undefined,
    json: result.json ?? result.extract ?? undefined,
    metadata: {
      title: result.metadata?.title ?? undefined,
      description: result.metadata?.description ?? undefined,
      url: result.metadata?.url ?? url,
      statusCode: result.metadata?.statusCode ?? undefined,
    },
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Crawls a website starting from the given URL.
 *
 * Discovers and scrapes multiple pages, respecting depth and
 * path constraints.
 */
export async function firecrawlCrawl(
  url: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const apiKey = getFirecrawlApiKey();
  const startTime = Date.now();

  const body: Record<string, unknown> = {
    url,
    limit: options.limit ?? 10,
    scrapeOptions: {
      formats: ["markdown"],
      onlyMainContent: options.onlyMainContent ?? true,
    },
  };

  if (options.maxDepth != null) body.maxDepth = options.maxDepth;
  if (options.includePaths) body.includePaths = options.includePaths;
  if (options.excludePaths) body.excludePaths = options.excludePaths;

  // Start the crawl job
  const startResponse = await fetchWithRetry("https://api.firecrawl.dev/v1/crawl", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    throw new Error(`Firecrawl crawl failed: HTTP ${startResponse.status}: ${errorText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startData: any = await startResponse.json();
  const jobId = startData.id ?? startData.jobId;

  if (!jobId) {
    throw new Error("Firecrawl crawl did not return a job ID");
  }

  // Poll for completion (max 5 minutes)
  const maxWait = 5 * 60 * 1000;
  const pollInterval = 3000;
  let elapsed = 0;

  while (elapsed < maxWait) {
    await sleep(pollInterval);
    elapsed += pollInterval;

    const statusResponse = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!statusResponse.ok) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statusData: any = await statusResponse.json();

    if (statusData.status === "completed" || statusData.status === "done") {
      const pages = (statusData.data ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (page: any) => ({
          url: page.metadata?.url ?? page.url ?? "",
          markdown: page.markdown ?? undefined,
          title: page.metadata?.title ?? undefined,
          description: page.metadata?.description ?? undefined,
        })
      );

      return {
        pages,
        totalPages: pages.length,
        latencyMs: Date.now() - startTime,
      };
    }

    if (statusData.status === "failed") {
      throw new Error(`Firecrawl crawl failed: ${statusData.error ?? "Unknown error"}`);
    }
  }

  throw new Error("Firecrawl crawl timed out after 5 minutes");
}

/**
 * Extracts structured data from a URL using a JSON schema.
 *
 * Convenience wrapper around firecrawlScrape with JSON format.
 */
export async function firecrawlExtract<T = unknown>(
  url: string,
  schema: Record<string, unknown>,
  prompt?: string
): Promise<T> {
  const result = await firecrawlScrape(url, {
    formats: ["json"],
    jsonSchema: schema,
    jsonPrompt: prompt,
    onlyMainContent: true,
  });

  if (!result.json) {
    throw new Error("Firecrawl extraction returned no data");
  }

  return result.json as T;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFirecrawlApiKey(): string {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY is not set. Add it to your environment.");
  }
  return apiKey;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeout?: number,
  maxRetries = 2
): Promise<Response> {
  const controller = timeout ? new AbortController() : undefined;
  const timeoutId = timeout ? setTimeout(() => controller!.abort(), timeout) : undefined;

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          ...(controller ? { signal: controller.signal } : {}),
        });

        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after")) || 5;
          await sleep(retryAfter * 1000);
          continue;
        }

        if (response.status >= 500 && attempt < maxRetries) {
          await sleep(2000 * (attempt + 1));
          continue;
        }

        return response;
      } catch (error) {
        if (attempt < maxRetries) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }

    throw new Error("Max retries exceeded");
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
