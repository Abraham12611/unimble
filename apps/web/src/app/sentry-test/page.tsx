import { notFound } from "next/navigation";
import { SentryTestButtons } from "./SentryTestButtons";

export default function SentryTestPage() {
  if (process.env.NODE_ENV !== "development" && process.env.SENTRY_TEST_ENABLED !== "1") {
    notFound();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#090909] text-[#F0F0F0]">
      <h1 className="text-xl font-medium">Sentry Integration Test</h1>
      <p className="text-[#888888] text-sm">This page is only available in development mode.</p>
      <SentryTestButtons />
    </div>
  );
}
