"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-[#F0F0F0]">
      <div className="text-center space-y-3 max-w-md px-6">
        <h2 className="text-xl font-medium">Something went wrong</h2>
        <p className="text-[#888888] text-sm">
          {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="mt-2 px-4 py-2 bg-[#161616] border border-[#2A2A2A] rounded-md text-sm hover:bg-[#1C1C1C] transition-colors cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
