"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";

type SessionRow = {
  id: string;
  status: string;
  lastActiveAt: number | null;
  expireAt: number | null;
  abandonAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type SessionsResponse = {
  sessions: SessionRow[];
  currentSessionId: string | null;
};

function formatUnixSeconds(value: number | null): string {
  if (!value) return "—";
  return new Date(value * 1000).toLocaleString();
}

export function SessionsClient() {
  const { signOut } = useClerk();

  const [data, setData] = useState<SessionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [isRevokingAll, setIsRevokingAll] = useState(false);

  const currentSessionId = data?.currentSessionId ?? null;

  const sessions = useMemo(() => {
    return data?.sessions ?? [];
  }, [data]);

  async function refresh() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (res.status === 401) {
        setError("You are signed out.");
        setData(null);
        return;
      }
      if (!res.ok) {
        setError("Failed to load sessions.");
        setData(null);
        return;
      }
      const json = (await res.json()) as SessionsResponse;
      setData(json);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function revokeSession(sessionId: string) {
    setBusySessionId(sessionId);
    setError(null);
    try {
      const res = await fetch("/api/sessions/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (res.status === 401) {
        setError("You are signed out.");
        return;
      }

      if (res.status === 403) {
        setError("You can only revoke your own sessions.");
        return;
      }

      if (!res.ok) {
        setError("Failed to revoke session.");
        return;
      }

      if (sessionId === currentSessionId) {
        await signOut({ redirectUrl: "/sign-in" });
        return;
      }

      await refresh();
    } finally {
      setBusySessionId(null);
    }
  }

  async function revokeAllOtherSessions() {
    setIsRevokingAll(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions/revoke-all", { method: "POST" });
      if (res.status === 401) {
        setError("You are signed out.");
        return;
      }
      if (!res.ok) {
        setError("Failed to revoke sessions.");
        return;
      }

      await signOut({ redirectUrl: "/sign-in" });
    } finally {
      setIsRevokingAll(false);
    }
  }

  return (
    <div className="flex-1 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Sessions</h1>
        <button
          onClick={revokeAllOtherSessions}
          disabled={isRevokingAll}
          className="rounded-md border border-[#222222] bg-[#0f0f0f] px-3 py-2 text-sm text-[#F0F0F0] disabled:opacity-60"
        >
          {isRevokingAll ? "Signing out…" : "Sign out all devices"}
        </button>
      </div>

      <p className="mt-2 text-sm text-[#C7C7C7]">Manage your active sessions across devices.</p>

      {isLoading ? <p className="mt-6 text-sm text-[#C7C7C7]">Loading…</p> : null}
      {error ? <p className="mt-6 text-sm text-red-400">{error}</p> : null}

      {!isLoading && !error ? (
        <div className="mt-6 overflow-hidden rounded-[14px] border border-[#222222]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#161616] text-[#C7C7C7]">
              <tr>
                <th className="px-4 py-3 font-medium">Session</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last active</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="bg-[#0f0f0f] text-[#F0F0F0]">
              {sessions.map((s) => {
                const isCurrent = s.id === currentSessionId;
                return (
                  <tr key={s.id} className="border-t border-[#222222]">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{s.id}</div>
                      {isCurrent ? (
                        <div className="mt-1 text-xs text-[#C7C7C7]">Current</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{s.status}</td>
                    <td className="px-4 py-3">{formatUnixSeconds(s.lastActiveAt)}</td>
                    <td className="px-4 py-3">{formatUnixSeconds(s.expireAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => revokeSession(s.id)}
                        disabled={busySessionId === s.id || isRevokingAll}
                        className="rounded-md border border-[#222222] bg-transparent px-3 py-1.5 text-xs text-[#F0F0F0] disabled:opacity-60"
                      >
                        {busySessionId === s.id ? "Revoking…" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
