import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type Body = {
  sessionId?: string;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const client = await clerkClient();
  const session = await client.sessions.getSession(sessionId);
  if (session.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const revoked = await client.sessions.revokeSession(sessionId);

  return NextResponse.json({ ok: true, revoked });
}
