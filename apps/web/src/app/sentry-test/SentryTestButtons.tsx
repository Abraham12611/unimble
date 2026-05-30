"use client";

import * as Sentry from "@sentry/nextjs";

export function SentryTestButtons() {
  return (
    <div className="flex gap-4">
      <button
        onClick={() => {
          const err = new Error("Sentry test — client-side captured error");
          Sentry.captureException(err);
          alert(
            "Error captured — check Sentry dashboard and DevTools Network tab for sentry.io request"
          );
        }}
        className="px-4 py-2 bg-red-950 border border-red-900 rounded-md text-sm hover:bg-red-900 transition-colors cursor-pointer"
      >
        Capture client error
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
  );
}
