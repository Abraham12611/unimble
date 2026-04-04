import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST() {
  const { userId, sessionId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  const response = await client.sessions.getSessionList({
    userId,
    status: "active",
    limit: 500,
    offset: 0,
  });

  const sessionIds = response.data
    .map((s) => s.id)
    .filter((id) => (sessionId ? id !== sessionId : true));

  await Promise.all(sessionIds.map((id) => client.sessions.revokeSession(id)));

  return NextResponse.json({ ok: true, revokedCount: sessionIds.length });
}
