import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  try {
    throw new Error("Sentry test — server-side error from API route");
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({
      ok: false,
      message: "Error captured and sent to Sentry",
    });
  }
}
