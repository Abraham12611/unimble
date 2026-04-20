"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { CheckCircle, XCircle, ArrowRight } from "@phosphor-icons/react";

type AcceptState = "idle" | "accepting" | "success" | "error";

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = typeof params?.workspaceId === "string" ? params.workspaceId : undefined;

  const acceptInvite = useMutation(anyApi.workspaces.acceptWorkspaceInvite);

  const [state, setState] = useState<AcceptState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAccept() {
    if (!workspaceId) return;
    setState("accepting");
    setErrorMessage(null);
    try {
      await acceptInvite({ workspaceId });
      setState("success");
    } catch (err) {
      setState("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  // Auto-accept on mount for a smoother UX
  useEffect(() => {
    if (workspaceId && state === "idle") {
      handleAccept();
    }
  }, [workspaceId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090909] p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {state === "accepting" && (
          <div className="space-y-3">
            <div className="text-[15px] font-medium text-[#F0F0F0]">Accepting invitation…</div>
            <div className="text-[12px] text-[#888888]">
              Please wait while we add you to the workspace.
            </div>
          </div>
        )}

        {state === "success" && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <CheckCircle size={48} weight="fill" className="text-[#22C55E]" />
            </div>
            <div className="text-[15px] font-medium text-[#F0F0F0]">
              You&apos;ve joined the workspace!
            </div>
            <div className="text-[12px] text-[#888888]">
              You now have access to this workspace and its resources.
            </div>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
            >
              <span>Go to Dashboard</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <XCircle size={48} weight="fill" className="text-[#EF4444]" />
            </div>
            <div className="text-[15px] font-medium text-[#F0F0F0]">
              Could not accept invitation
            </div>
            <div className="text-[12px] text-[#888888]">
              {errorMessage ?? "The invitation may have expired or already been used."}
            </div>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
            >
              <span>Go to Dashboard</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
