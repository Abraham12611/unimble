"use node";

/**
 * Firehose Integration
 *
 * Provides real-time web monitoring via the Firehose API (SSE).
 * Used by operators to monitor brand mentions, track competitor
 * announcements, and react to industry news in real-time.
 *
 * Firehose streams web events (news articles, blog posts, etc.)
 * matching Lucene-style queries. Events are ML-classified by
 * content type.
 *
 * Note: SSE streaming is long-lived and should be managed by the
 * workflow engine (Phase 6). This module provides the setup,
 * rule management, and one-shot polling functions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A Firehose monitoring rule. */
export interface FirehoseRule {
  /** Rule ID (returned by Firehose API) */
  id: string;
  /** Lucene query string */
  query: string;
  /** Human-readable tag for this rule */
  tag: string;
  /** Whether the rule is active */
  isActive: boolean;
  /** When the rule was created */
  createdAt?: string;
}

/** A web event from the Firehose stream. */
export interface FirehoseEvent {
  /** Event ID */
  id: string;
  /** Article/page title */
  title: string;
  /** Article/page URL */
  url: string;
  /** Content excerpt or summary */
  excerpt?: string;
  /** Source domain */
  source: string;
  /** ML-classified category */
  category?: string;
  /** Language code */
  language?: string;
  /** Publication timestamp */
  publishedAt?: string;
  /** Matched rule tags */
  matchedTags: string[];
}

/** Options for creating a monitoring rule. */
export interface CreateRuleInput {
  /** Lucene query (e.g. 'title:"RevenueCat" AND page_category:"/News"') */
  query: string;
  /** Human-readable tag */
  tag: string;
}

/** Options for polling recent events. */
export interface PollOptions {
  /** Only return events matching these tags */
  tags?: string[];
  /** Max events to return */
  limit?: number;
  /** Only events after this timestamp (ISO) */
  since?: string;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Creates a new monitoring rule on Firehose.
 *
 * Rules define what web events to track using Lucene query syntax.
 * Events matching the rule will appear in the stream.
 */
export async function firehoseCreateRule(input: CreateRuleInput): Promise<FirehoseRule> {
  const apiKey = getFirehoseApiKey();

  const response = await fetchWithRetry("https://api.firehose.io/v1/rules", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      value: input.query,
      tag: input.tag,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firehose create rule failed: HTTP ${response.status}: ${errorText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();

  return {
    id: String(data.id ?? data.rule_id ?? ""),
    query: input.query,
    tag: input.tag,
    isActive: true,
    createdAt: data.created_at ?? new Date().toISOString(),
  };
}

/**
 * Lists all active monitoring rules.
 */
export async function firehoseListRules(): Promise<FirehoseRule[]> {
  const apiKey = getFirehoseApiKey();

  const response = await fetchWithRetry("https://api.firehose.io/v1/rules", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firehose list rules failed: HTTP ${response.status}: ${errorText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();
  const rules = data.rules ?? data.data ?? data ?? [];

  if (!Array.isArray(rules)) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rules.map((r: any) => ({
    id: String(r.id ?? ""),
    query: r.value ?? r.query ?? "",
    tag: r.tag ?? "",
    isActive: r.is_active ?? r.active ?? true,
    createdAt: r.created_at ?? undefined,
  }));
}

/**
 * Deletes a monitoring rule.
 */
export async function firehoseDeleteRule(ruleId: string): Promise<void> {
  const apiKey = getFirehoseApiKey();

  const response = await fetchWithRetry(`https://api.firehose.io/v1/rules/${ruleId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firehose delete rule failed: HTTP ${response.status}: ${errorText}`);
  }
}

/**
 * Polls for recent events matching active rules.
 *
 * This is a one-shot fetch — for continuous monitoring, use the
 * SSE stream via the workflow engine (Phase 6).
 */
export async function firehosePollEvents(options: PollOptions = {}): Promise<FirehoseEvent[]> {
  const apiKey = getFirehoseApiKey();

  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.since) params.set("since", options.since);
  if (options.tags?.length) params.set("tags", options.tags.join(","));

  const url = `https://api.firehose.io/v1/events?${params.toString()}`;

  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firehose poll failed: HTTP ${response.status}: ${errorText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();
  const events = data.events ?? data.data ?? data ?? [];

  if (!Array.isArray(events)) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return events.map((e: any) => normalizeEvent(e));
}

// ---------------------------------------------------------------------------
// Response normalization
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEvent(raw: any): FirehoseEvent {
  return {
    id: String(raw.id ?? raw.event_id ?? ""),
    title: String(raw.title ?? raw.headline ?? ""),
    url: String(raw.url ?? raw.link ?? ""),
    excerpt: raw.excerpt ?? raw.description ?? raw.summary ?? undefined,
    source: raw.source ?? raw.domain ?? raw.site ?? "",
    category: raw.page_category ?? raw.category ?? raw.type ?? undefined,
    language: raw.language ?? raw.lang ?? undefined,
    publishedAt: raw.published_at ?? raw.publishedAt ?? raw.date ?? undefined,
    matchedTags: Array.isArray(raw.matched_tags) ? raw.matched_tags : raw.tag ? [raw.tag] : [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFirehoseApiKey(): string {
  const apiKey = process.env.FIREHOSE_API_KEY;
  if (!apiKey) {
    throw new Error("FIREHOSE_API_KEY is not set. Add it to your environment.");
  }
  return apiKey;
}

async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after")) || 2;
        await sleep(retryAfter * 1000);
        continue;
      }

      if (response.status >= 500 && attempt < maxRetries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw new Error("Max retries exceeded");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
