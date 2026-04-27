/**
 * Composio client wrapper for Unimble.
 *
 * Provides a singleton Composio client instance and helper functions
 * for creating user sessions, checking toolkit connections, and
 * initiating OAuth authorization flows.
 *
 * Must be used from Convex **actions** (not queries/mutations) because
 * the Composio SDK makes external HTTP calls.
 *
 * @see https://docs.composio.dev
 */

import { Composio } from "@composio/core";

let _client: Composio | null = null;

/**
 * Returns a singleton Composio client, lazily initialized.
 * Reads `COMPOSIO_API_KEY` from the Convex environment.
 */
export function getComposioClient(): Composio {
  if (_client) return _client;

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY is not set. Add it to your Convex environment variables.");
  }

  _client = new Composio({ apiKey });
  return _client;
}

/**
 * Creates a Composio session for a given user.
 *
 * Each Unimble workspace maps to a Composio `user_id` so that
 * connected accounts are scoped per-workspace.
 *
 * @param workspaceId - The Convex workspace ID used as the Composio user_id
 * @param toolkits - Optional list of toolkit slugs to include in the session
 */
export async function createComposioSession(workspaceId: string, toolkits?: string[]) {
  const client = getComposioClient();
  const session = await client.create(workspaceId, {
    ...(toolkits ? { toolkits } : {}),
    manageConnections: false, // We handle OAuth redirects ourselves
  });
  return session;
}

/**
 * Checks which toolkits are connected for a given workspace.
 *
 * @param workspaceId - The Convex workspace ID
 * @param toolkitSlugs - Optional filter to check specific toolkits only
 * @returns Array of toolkit connection statuses
 */
export async function getToolkitStatuses(workspaceId: string, toolkitSlugs?: string[]) {
  const session = await createComposioSession(workspaceId, toolkitSlugs);
  const toolkits = await session.toolkits({
    ...(toolkitSlugs ? { toolkits: toolkitSlugs } : {}),
  });

  return toolkits.items.map((toolkit) => ({
    name: toolkit.name,
    slug: toolkit.slug,
    isConnected: toolkit.connection?.isActive ?? false,
    connectedAccountId: toolkit.connection?.connectedAccount?.id ?? null,
    connectedAccountStatus: toolkit.connection?.connectedAccount?.status ?? null,
  }));
}

/**
 * Initiates an OAuth authorization flow for a toolkit.
 *
 * @param workspaceId - The Convex workspace ID
 * @param toolkitSlug - The toolkit to authorize (e.g. "github", "gmail")
 * @returns The redirect URL the user should visit to complete OAuth
 */
export async function initiateToolkitAuth(workspaceId: string, toolkitSlug: string) {
  const session = await createComposioSession(workspaceId, [toolkitSlug]);
  const connectionRequest = await session.authorize(toolkitSlug);

  return {
    redirectUrl: connectionRequest.redirectUrl,
  };
}

/**
 * Tests the Composio connection by verifying the API key is valid.
 * Returns basic account info on success.
 */
export async function testComposioConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const client = getComposioClient();
    // Create a test session to verify the API key works
    const session = await client.create("__unimble_connection_test__");
    const toolkits = await session.toolkits({ limit: 1 });
    return {
      ok: true,
      message: `Composio connected. ${toolkits.totalPages ?? 0} toolkit pages available.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, message: `Composio connection failed: ${message}` };
  }
}
