"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
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
    <html>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#090909",
          color: "#F0F0F0",
          fontFamily: "'Geist', 'SF Pro Text', 'Inter', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: "400px",
            padding: "0 24px",
          }}
        >
          <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "12px" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "#888888",
              marginBottom: "24px",
            }}
          >
            {error.digest
              ? `Error ID: ${error.digest}`
              : "An unexpected error occurred. The team has been notified."}
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 16px",
              background: "#161616",
              border: "1px solid #2A2A2A",
              borderRadius: "6px",
              color: "#F0F0F0",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
