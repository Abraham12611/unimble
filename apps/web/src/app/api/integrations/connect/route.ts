import { auth } from "@clerk/nextjs/server";
import { Composio } from "@composio/core";

const COMPOSIO_TOOLKIT_MAP: Record<string, string> = {
  slack: "slack",
  discord: "discord",
  notion: "notion",
  github: "github",
  x: "twitter",
  linkedin: "linkedin",
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { service?: string };
  const service = body.service;
  const toolkit = service ? COMPOSIO_TOOLKIT_MAP[service] : undefined;

  if (!service || !toolkit) {
    return Response.json({ error: "Invalid service" }, { status: 400 });
  }

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Composio API key not configured" }, { status: 500 });
  }

  try {
    const composio = new Composio({ apiKey });
    const session = await composio.create(userId);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const connectionRequest = await session.authorize(toolkit, {
      callbackUrl: `${appUrl}/integrations/callback`,
    });

    return Response.json({ redirectUrl: connectionRequest.redirectUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
