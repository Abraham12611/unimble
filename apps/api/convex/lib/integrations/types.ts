/**
 * Shared types for all integration abstraction layers.
 *
 * These types define the common interfaces that operators use to
 * interact with external services. Each category (CMS, social, etc.)
 * extends these base types with category-specific fields.
 */

// ---------------------------------------------------------------------------
// Base types
// ---------------------------------------------------------------------------

/** Result of any integration action. */
export interface IntegrationActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Provider-specific metadata (rate limits, quotas, etc.) */
  meta?: Record<string, unknown>;
}

/** Common fields for content across all platforms. */
export interface ContentItem {
  /** Provider-specific ID */
  externalId: string;
  /** Title or headline */
  title: string;
  /** URL on the external platform */
  url?: string;
  /** ISO timestamp */
  createdAt?: string;
  /** ISO timestamp */
  updatedAt?: string;
}

/** Pagination params for list operations. */
export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

/** Paginated response wrapper. */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  total?: number;
}
