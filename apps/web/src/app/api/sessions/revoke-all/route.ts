import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST() {
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
      limit: 500,
      offset: 0,
    });
  } catch {
    return NextResponse.json({ error: "Clerk API error" }, { status: 502 });
  }

  const sessionIds = response.data
    .map((s) => s.id)
    .filter((id) => (sessionId ? id !== sessionId : true));

  const results = await Promise.allSettled(
    sessionIds.map((id) => client.sessions.revokeSession(id))
  );
  const revokedCount = results.filter((r) => r.status === "fulfilled").length;
  const failedCount = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({ ok: true, revokedCount, failedCount });
}
