import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId, sessionId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();

  let response: Awaited<ReturnType<(typeof client.sessions)["getSessionList"]>>;
  try {
    response = await client.sessions.getSessionList({
      userId,
      status: "active",
      limit: 50,
      offset: 0,
    });
  } catch {
    return NextResponse.json({ error: "Clerk API error" }, { status: 502 });
  }

  const sessions = response.data.map((s) => ({
    id: s.id,
    status: s.status,
    lastActiveAt: s.lastActiveAt,
    expireAt: s.expireAt,
    abandonAt: s.abandonAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));

  return NextResponse.json({ sessions, currentSessionId: sessionId ?? null });
}
