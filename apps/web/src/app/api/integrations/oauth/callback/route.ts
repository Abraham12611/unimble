/**
 * OAuth callback route for integration connections.
 *
 * Composio handles the actual token exchange — this route receives
 * the redirect after the user authorizes on the provider's page,
 * then redirects back to the integrations page with a success/error
 * status in the URL search params.
 *
 * Expected query params from Composio redirect:
 *   - connected_account_id: The Composio connected account ID
 *   - status: "success" | "failed"
 *   - toolkit: The toolkit slug (e.g. "github")
 *   - workspace: The workspace slug (passed via state)
 *
 * We redirect to: /w/{slug}/integrations?connected={toolkit}&status={status}
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const status = searchParams.get("status") ?? "unknown";
  const toolkit = searchParams.get("toolkit") ?? "";
  const workspace = searchParams.get("workspace") ?? "";
  const connectedAccountId = searchParams.get("connected_account_id") ?? "";
  const error = searchParams.get("error") ?? "";

  // Build the redirect URL back to the integrations page
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  if (!workspace) {
    // Fallback: redirect to dashboard if no workspace context
    const fallbackUrl = new URL("/dashboard", baseUrl);
    fallbackUrl.searchParams.set("integration_error", "missing_workspace");
    return NextResponse.redirect(fallbackUrl);
  }

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
