"use node";

/**
 * Perplexity Integration
 *
 * Provides real-time research and fact-checking capabilities via
 * the Perplexity API. Used by operators to research topics before
 * content creation, fact-check generated content, and gather
 * competitive intelligence.
 *
 * Perplexity responses are grounded in real-time web search and
 * include citations, making them ideal for research tasks.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A citation from a Perplexity response. */
export interface PerplexityCitation {
  /** Source URL */
  url: string;
  /** Source title */
  title?: string;
  /** Snippet from the source */
  snippet?: string;
}

/** Result of a Perplexity search/research query. */
export interface PerplexityResult {
  /** The generated answer */
  content: string;
  /** Citations backing the answer */
  citations: PerplexityCitation[];
  /** Model used */
  model: string;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Latency in milliseconds */
  latencyMs: number;
}

/** Options for Perplexity queries. */
export interface PerplexityOptions {
  /** Model to use (default: sonar) */
  model?: string;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
  /** System prompt for context */
  systemPrompt?: string;
  /** Whether to return citations */
  returnCitations?: boolean;
}

// ---------------------------------------------------------------------------
// Available models
// ---------------------------------------------------------------------------

export const PERPLEXITY_MODELS = {
  /** Best for quick factual lookups */
  sonar: "sonar",
  /** Best for in-depth research */
  sonarPro: "sonar-pro",
  /** Best for reasoning-heavy research */
  sonarReasoning: "sonar-reasoning",
  /** Pro reasoning model */
  sonarReasoningPro: "sonar-reasoning-pro",
} as const;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Performs a research query using Perplexity's search-grounded AI.
 *
 * Best for: topic research, fact-checking, competitive analysis,
 * learning about new technologies.
 */
export async function perplexitySearch(
  query: string,
  options: PerplexityOptions = {}
): Promise<PerplexityResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not set. Add it to your environment.");
  }

  const model = options.model ?? PERPLEXITY_MODELS.sonar;
  const startTime = Date.now();

  const messages = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: query });

  const response = await fetchWithRetry("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.2,
      return_citations: options.returnCitations ?? true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error: HTTP ${response.status}: ${errorText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();
  const latencyMs = Date.now() - startTime;

  return {
    content: data.choices?.[0]?.message?.content ?? "",
    citations: parseCitations(data.citations ?? []),
    model: data.model ?? model,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
    latencyMs,
  };
}

/**
 * Performs in-depth research on a topic using the pro model.
 *
 * Uses sonar-pro for more thorough, multi-source research with
 * better citation coverage.
 */
export async function perplexityResearch(
  topic: string,
  context?: string,
  options: PerplexityOptions = {}
): Promise<PerplexityResult> {
  const systemPrompt =
    options.systemPrompt ??
    `You are a thorough research assistant. Provide comprehensive, 
well-structured research with citations. Focus on accuracy and 
recency of information.${context ? `\n\nContext: ${context}` : ""}`;

  return perplexitySearch(topic, {
    ...options,
    model: options.model ?? PERPLEXITY_MODELS.sonarPro,
    systemPrompt,
    maxTokens: options.maxTokens ?? 4096,
  });
}

/**
 * Fact-checks a claim or piece of content.
 *
 * Returns a structured assessment with supporting/contradicting
 * evidence and citations.
 */
export async function perplexityFactCheck(
  claim: string,
  options: PerplexityOptions = {}
): Promise<PerplexityResult> {
  const systemPrompt =
    options.systemPrompt ??
    `You are a fact-checker. Evaluate the following claim for accuracy.
Provide:
1. A verdict (True, False, Partially True, Unverifiable)
2. Supporting evidence with citations
3. Contradicting evidence if any
4. Context that affects the claim's accuracy
Be precise and cite your sources.`;

  return perplexitySearch(claim, {
    ...options,
    model: options.model ?? PERPLEXITY_MODELS.sonar,
    systemPrompt,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCitations(raw: any[]): PerplexityCitation[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((c) => {
    if (typeof c === "string") {
      return { url: c };
    }
    return {
      url: c.url ?? c.link ?? "",
      title: c.title ?? undefined,
      snippet: c.snippet ?? c.text ?? undefined,
    };
  });
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
