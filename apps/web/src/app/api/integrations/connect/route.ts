import { NextRequest, NextResponse } from "next/server";
import { Composio } from "@composio/core";

export async function POST(request: NextRequest) {
  try {
    const { userId, integrationId } = await request.json();

    if (!userId || !integrationId) {
      return NextResponse.json({ error: "Missing userId or integrationId" }, { status: 400 });
    }

    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Composio API key not configured" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: "App URL not configured" }, { status: 500 });
    }

    const composio = new Composio({ apiKey });
    const session = await composio.create(userId);

    // Construct the correct redirect URL
    const redirectUrl = `${appUrl}/integrations/callback`;

    // Generate the OAuth connection URL with the correct redirect
    const connectionUrl = await composio.getConnectedAccount({
      integrationId,
      entityId: userId,
      redirectUrl,
    });

    return NextResponse.json({
      connectionUrl,
      sessionId: session.sessionId,
    });
  } catch (error) {
    console.error("Error creating integration connection:", error);
    return NextResponse.json({ error: "Failed to create integration connection" }, { status: 500 });
  }
}
