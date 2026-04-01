/**
 * @unimble/shared - Shared utilities and types
 * This package contains shared types, constants, and utility functions
 * used across the Unimble monorepo.
 * @packageDocumentation
 */

/**
 * Formats a date to a human-readable string
 * @param date - The date to format
 * @param locale - The locale to use for formatting (default: 'en-US')
 * @returns A formatted date string
 * @example
 * ```ts
 * formatDate(new Date()) // "January 1, 2024"
 * ```
 */
export function formatDate(date: Date, locale: string = "en-US"): string {
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Generates a unique identifier
 * @returns A unique string identifier
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Truncates a string to a specified length
 * @param str - The string to truncate
 * @param maxLength - Maximum length before truncation
 * @param suffix - Suffix to append when truncated (default: '...')
 * @returns The truncated string
 */
export function truncate(
  str: string,
  maxLength: number,
  suffix: string = "..."
): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Workspace role types
 */
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

/**
 * User status types
 */
export type UserStatus = "active" | "inactive" | "pending";

/**
 * Common API response structure
 */
export interface ApiResponse<T> {
  /** Whether the request was successful */
  success: boolean;
  /** The response data */
  data?: T;
  /** Error message if unsuccessful */
  error?: string;
  /** Additional metadata */
  meta?: Record<string, unknown>;
}
