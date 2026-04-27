"use node";

/**
 * Token Management Module
 *
 * Handles OAuth token lifecycle: refresh, expiry detection,
 * validation, and revocation. Works with Composio's managed
 * OAuth to keep connected accounts active.
 *
 * Token refresh is primarily handled by Composio automatically.
 * This module provides:
 * 1. Expiry detection for proactive refresh
 * 2. Validation to check if a token is still usable
 * 3. Revocation for clean disconnects
 * 4. Status tracking for the integration health dashboard
 *
 * Note: Actual background refresh scheduling will be implemented
 * in Phase 6 (Workflow Engine) using Convex cron jobs. This module
 * provides the primitives those jobs will call.
 */

import { createComposioSession, revokeConnectedAccount } from "../composio";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Health status of a connected integration's token. */
export interface TokenHealth {
  /** Whether the token is currently valid and usable */
  isValid: boolean;
  /** Whether the token is approaching expiry (< 24h remaining) */
  // TODO(phase-6): Implement expiry detection when Composio exposes
  // token expiry timestamps. Currently always false.
  isExpiringSoon: boolean;
  /** Whether the token has already expired */
  isExpired: boolean;
  /** Human-readable status message */
  message: string;
  /** When the token was last validated */
  checkedAt: number;
  /** When the token expires (if known) */
  expiresAt?: number;
}

/** Result of a token refresh attempt. */
export interface TokenRefreshResult {
  ok: boolean;
  message: string;
  /** New connected account ID if the refresh created a new one */
  newAccountId?: string;
}

/** Result of a token revocation. */
export interface TokenRevocationResult {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

/**
 * Checks the health of a connected integration's token.
 *
 * Queries Composio to verify the connected account is still active
 * and the token hasn't expired.
 *
 * @param workspaceId - The workspace ID (Composio user_id)
 * @param toolkitSlug - The toolkit to check (e.g. "github")
 * @returns Token health status
 */
export async function checkTokenHealth(
  workspaceId: string,
  toolkitSlug: string
): Promise<TokenHealth> {
  try {
    const session = await createComposioSession(workspaceId, [toolkitSlug]);
    const toolkits = await session.toolkits({
      toolkits: [toolkitSlug],
    });

    const toolkit = toolkits.items.find((t) => t.slug === toolkitSlug);

    if (!toolkit) {
      return {
        isValid: false,
        isExpiringSoon: false,
        isExpired: true,
        message: `Toolkit ${toolkitSlug} not found in session`,
        checkedAt: Date.now(),
      };
    }

    const isActive = toolkit.connection?.isActive ?? false;
    const account = toolkit.connection?.connectedAccount;
    const status = account?.status;

    if (!isActive || !account) {
      return {
        isValid: false,
        isExpiringSoon: false,
        isExpired: true,
        message: "No active connection found",
        checkedAt: Date.now(),
      };
    }

    if (status === "expired") {
      return {
        isValid: false,
        isExpiringSoon: false,
        isExpired: true,
        message: "Token has expired — reconnection required",
        checkedAt: Date.now(),
      };
    }

    if (status === "active") {
      return {
        isValid: true,
        isExpiringSoon: false,
        isExpired: false,
        message: "Token is active and valid",
        checkedAt: Date.now(),
      };
    }

    // Unknown status — treat as potentially valid but flag it
    return {
      isValid: true,
      isExpiringSoon: false,
      isExpired: false,
      message: `Token status: ${status ?? "unknown"}`,
      checkedAt: Date.now(),
    };
  } catch (error) {
    return {
      isValid: false,
      isExpiringSoon: false,
      isExpired: false,
      message: error instanceof Error ? error.message : "Failed to check token health",
      checkedAt: Date.now(),
    };
  }
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/**
 * Attempts to refresh a connected integration's token.
 *
 * For OAuth integrations, Composio handles token refresh automatically.
 * This function triggers a manual refresh check by re-authorizing
 * the toolkit, which prompts Composio to refresh if needed.
 *
 * @param workspaceId - The workspace ID
 * @param toolkitSlug - The toolkit to refresh
 * @returns Refresh result
 */
export async function refreshToken(
  workspaceId: string,
  toolkitSlug: string
): Promise<TokenRefreshResult> {
  try {
    // Check current health first
    const health = await checkTokenHealth(workspaceId, toolkitSlug);

    if (health.isValid && !health.isExpiringSoon) {
      return {
        ok: true,
        message: "Token is still valid — no refresh needed",
      };
    }

    // For expired tokens, the user needs to re-authorize
    if (health.isExpired) {
      return {
        ok: false,
        message: "Token has expired. User must re-authorize via OAuth.",
      };
    }

    // If the health check itself failed (isValid=false, isExpired=false),
    // report the failure rather than silently retrying
    if (!health.isValid) {
      return {
        ok: false,
        message: `Health check failed: ${health.message}`,
      };
    }

    // For expiring-soon tokens, Composio should auto-refresh
    // TODO(phase-6): This branch is currently unreachable because
    // isExpiringSoon is always false. Will be activated when expiry
    // detection is implemented with Composio token timestamps.
    // We trigger a session creation to prompt the refresh
    const session = await createComposioSession(workspaceId, [toolkitSlug]);
    const toolkits = await session.toolkits({
      toolkits: [toolkitSlug],
    });
    const toolkit = toolkits.items.find((t) => t.slug === toolkitSlug);

    if (toolkit?.connection?.isActive) {
      return {
        ok: true,
        message: "Token refreshed successfully",
        newAccountId: toolkit.connection.connectedAccount?.id ?? undefined,
      };
    }

    return {
      ok: false,
      message: "Token refresh failed — re-authorization may be needed",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Token refresh failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Token revocation
// ---------------------------------------------------------------------------

/**
 * Revokes a connected account's token, removing it from Composio.
 *
 * @param connectedAccountId - The Composio connected account ID
 * @returns Revocation result
 */
export async function revokeToken(connectedAccountId: string): Promise<TokenRevocationResult> {
  return revokeConnectedAccount(connectedAccountId);
}

// ---------------------------------------------------------------------------
// Batch health check
// ---------------------------------------------------------------------------

/**
 * Checks the health of multiple integrations at once.
 * Used by the dashboard to show integration health status.
 *
 * @param workspaceId - The workspace ID
 * @param toolkitSlugs - List of toolkit slugs to check
 * @returns Map of toolkit slug to health status
 */
export async function checkMultipleTokenHealth(
  workspaceId: string,
  toolkitSlugs: string[]
): Promise<Record<string, TokenHealth>> {
  const results: Record<string, TokenHealth> = {};

  // Check each toolkit sequentially to avoid rate limiting
  for (const slug of toolkitSlugs) {
    results[slug] = await checkTokenHealth(workspaceId, slug);
  }

  return results;
}
