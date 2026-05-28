"use client";

import { notFound } from "next/navigation";

export default function SentryTestPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#090909] text-[#F0F0F0]">
      <h1 className="text-xl font-medium">Sentry Integration Test</h1>
      <p className="text-[#888888] text-sm">This page is only available in development mode.</p>
      <div className="flex gap-4">
        <button
          onClick={() => {
            throw new Error("Sentry test — client-side unhandled error");
          }}
          className="px-4 py-2 bg-red-950 border border-red-900 rounded-md text-sm hover:bg-red-900 transition-colors cursor-pointer"
        >
          Throw client error
        </button>
        <button
          onClick={async () => {
            const res = await fetch("/api/sentry-test");
            const data = await res.json();
            alert(JSON.stringify(data));
          }}
          className="px-4 py-2 bg-[#161616] border border-[#2A2A2A] rounded-md text-sm hover:bg-[#1C1C1C] transition-colors cursor-pointer"
        >
          Trigger server error (API)
        </button>
      </div>
    </div>
  );
}
