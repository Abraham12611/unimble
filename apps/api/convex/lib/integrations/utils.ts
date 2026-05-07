/**
 * Shared utilities for integration modules.
 *
 * Provides common fetch-with-retry, sleep, and timeout helpers
 * used across all AI service and platform integrations.
 */

/**
 * Fetches a URL with automatic retry on 429 and 5xx errors.
 *
 * Each retry attempt gets its own AbortController if a timeout
 * is specified, so rate-limit sleeps don't consume the timeout
 * budget of subsequent attempts.
 *
 * @param url - The URL to fetch
 * @param init - Standard fetch RequestInit options
 * @param options - Retry and timeout configuration
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: {
    /** Per-attempt timeout in ms (default: none) */
    timeout?: number;
    /** Max retry attempts (default: 2) */
    maxRetries?: number;
    /** Base delay multiplier in ms (default: 1000) */
    baseDelay?: number;
  } = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelay = options.baseDelay ?? 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Create a fresh AbortController per attempt so timeouts
    // don't carry over from previous attempts or sleep delays.
    let controller: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (options.timeout) {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller!.abort(), options.timeout);
    }

    try {
      const response = await fetch(url, {
        ...init,
        ...(controller ? { signal: controller.signal } : {}),
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after")) || 2;
        if (timeoutId) clearTimeout(timeoutId);
        if (attempt < maxRetries) {
          await sleep(retryAfter * 1000);
          continue;
        }
        return response;
      }

      if (response.status >= 500 && attempt < maxRetries) {
        if (timeoutId) clearTimeout(timeoutId);
        await sleep(baseDelay * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (attempt < maxRetries) {
        await sleep(baseDelay * (attempt + 1));
        continue;
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  throw new Error("Max retries exceeded");
}

/**
 * Sleeps for the specified number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
