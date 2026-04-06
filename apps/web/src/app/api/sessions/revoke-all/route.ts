import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST() {
  const { userId, sessionId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: "Session context unavailable" }, { status: 400 });
  }

  const client = await clerkClient();
  const sessionIds: string[] = [];
  const limit = 100;
  for (let offset = 0; offset <= 5_000; offset += limit) {
    let response: Awaited<ReturnType<(typeof client.sessions)["getSessionList"]>>;
    try {
      response = await client.sessions.getSessionList({
        userId,
        status: "active",
        limit,
        offset,
      });
    } catch {
      return NextResponse.json({ error: "Clerk API error" }, { status: 502 });
    }

    sessionIds.push(...response.data.map((s) => s.id));
    if (response.data.length < limit) break;
  }

  const otherSessionIds = sessionIds.filter((id) => id !== sessionId);

  let revokedCount = 0;
  let failedCount = 0;
  const batchSize = 10;
  for (let i = 0; i < otherSessionIds.length; i += batchSize) {
    const batch = otherSessionIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((id) => client.sessions.revokeSession(id)));
    revokedCount += results.filter((r) => r.status === "fulfilled").length;
    failedCount += results.filter((r) => r.status === "rejected").length;
  }

  return NextResponse.json({ ok: true, revokedCount, failedCount });
}
