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

  let session: Awaited<ReturnType<(typeof client.sessions)["getSession"]>>;
  try {
    session = await client.sessions.getSession(sessionId);
  } catch (err) {
    const status =
      typeof err === "object" && err !== null && "status" in err
        ? (err as { status?: unknown }).status
        : undefined;

    if (typeof status === "number" && status === 404) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Clerk API error" }, { status: 502 });
  }

  if (session.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let revoked: Awaited<ReturnType<(typeof client.sessions)["revokeSession"]>>;
  try {
    revoked = await client.sessions.revokeSession(sessionId);
  } catch {
    return NextResponse.json({ error: "Clerk API error" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, revoked });
}
