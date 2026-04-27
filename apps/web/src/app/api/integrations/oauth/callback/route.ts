/**
 * OAuth callback route for integration connections.
 *
 * Composio handles the actual token exchange — this route receives
 * the redirect after the user authorizes on the provider's page,
 * then redirects back to the integrations page with a success/error
 * status in the URL search params.
 *
 * Security:
 * - The `state` parameter is HMAC-SHA256 signed by the server.
 * - Format: `{workspaceSlug}:{timestamp}:{signature}`
 * - Requests without a valid signed state are rejected.
 * - No fallback paths — state is always required.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the HMAC-signed OAuth state parameter.
 *
 * State format: `{workspaceSlug}:{timestamp}:{hmacSignature}`
 *
 * Checks:
 * 1. State is present and has 3 parts
 * 2. HMAC signature matches (timing-safe comparison)
 * 3. Timestamp is within the last 10 minutes
 */
function validateOAuthState(state: string | null): {
  valid: boolean;
  workspace: string;
  reason?: string;
} {
  if (!state) {
    return { valid: false, workspace: "", reason: "missing_state" };
  }

  // Split into exactly 3 parts: workspace, timestamp, signature
  const firstColon = state.indexOf(":");
  const lastColon = state.lastIndexOf(":");
  if (firstColon === -1 || lastColon === firstColon) {
    return { valid: false, workspace: "", reason: "malformed_state" };
  }

  const workspace = state.substring(0, firstColon);
  const timestampStr = state.substring(firstColon + 1, lastColon);
  const receivedSig = state.substring(lastColon + 1);

  if (!workspace || !timestampStr || !receivedSig) {
    return { valid: false, workspace: "", reason: "malformed_state" };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return { valid: false, workspace: "", reason: "invalid_timestamp" };
  }

  // Verify HMAC signature
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    console.error("OAUTH_STATE_SECRET is not set");
    return { valid: false, workspace: "", reason: "server_error" };
  }

  const payload = `${workspace}:${timestampStr}`;
  const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");

  // Timing-safe comparison to prevent timing attacks
  const receivedBuf = Buffer.from(receivedSig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");

  if (receivedBuf.length !== expectedBuf.length || !timingSafeEqual(receivedBuf, expectedBuf)) {
    return { valid: false, workspace, reason: "invalid_signature" };
  }

  // Check timestamp freshness (10-minute window)
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  const age = Date.now() - timestamp;
  if (age < 0 || age > TEN_MINUTES_MS) {
    return { valid: false, workspace, reason: "expired_state" };
  }

  return { valid: true, workspace };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const status = searchParams.get("status") ?? "unknown";
  const toolkit = searchParams.get("toolkit") ?? "";
  const connectedAccountId = searchParams.get("connected_account_id") ?? "";
  const error = searchParams.get("error") ?? "";
  const state = searchParams.get("state");

  // Validate HMAC-signed state — always required, no fallback
  const { valid, workspace, reason } = validateOAuthState(state);

  if (!valid) {
    // If we have a workspace from the (invalid) state, redirect there
    // with an error so the user can retry. Otherwise go to dashboard.
    if (workspace) {
      const errorUrl = new URL(`/w/${workspace}/integrations`, baseUrl);
      errorUrl.searchParams.set("status", "error");
      errorUrl.searchParams.set("error", reason ?? "invalid_state");
      if (toolkit) errorUrl.searchParams.set("toolkit", toolkit);
      return NextResponse.redirect(errorUrl);
    }

    const fallbackUrl = new URL("/dashboard", baseUrl);
    fallbackUrl.searchParams.set("integration_error", reason ?? "invalid_state");
    return NextResponse.redirect(fallbackUrl);
  }

  // State is valid — build the redirect URL
  const redirectUrl = new URL(`/w/${workspace}/integrations`, baseUrl);

  if (status === "success" && toolkit) {
    redirectUrl.searchParams.set("connected", toolkit);
    redirectUrl.searchParams.set("status", "success");
    if (connectedAccountId) {
      redirectUrl.searchParams.set("account_id", connectedAccountId);
    }
  } else {
    redirectUrl.searchParams.set("status", "error");
    if (toolkit) redirectUrl.searchParams.set("toolkit", toolkit);
    if (error) redirectUrl.searchParams.set("error", error);
  }

  return NextResponse.redirect(redirectUrl);
}
