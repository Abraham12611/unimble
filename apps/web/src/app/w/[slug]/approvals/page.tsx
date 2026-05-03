"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useExecutions, useOperators } from "@/lib/convexHooks";
import {
  CheckSquare,
  Check,
  X,
  ArrowClockwise,
  Clock,
  Warning,
  CheckCircle,
  XCircle,
} from "@phosphor-icons/react";

type Execution = { _id: string; operatorId?: string; status?: string; createdAt: number };
type Approval = {
  _id: string;
  executionId: string;
  stepId?: string;
  message?: string;
  contentPreview?: string;
  status: string;
  createdAt: number;
  respondedAt?: number;
  respondedBy?: string;
  decision?: string;
  note?: string;
};
type Operator = { _id: string; name: string };

function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") return <span className="flex items-center gap-1 text-[11px] text-[#F59E0B]"><Clock size={11} /> Pending</span>;
  if (status === "approved") return <span className="flex items-center gap-1 text-[11px] text-[#22C55E]"><CheckCircle size={11} weight="fill" /> Approved</span>;
  if (status === "rejected") return <span className="flex items-center gap-1 text-[11px] text-[#EF4444]"><XCircle size={11} weight="fill" /> Rejected</span>;
  return <span className="text-[11px] text-[#555555]">{status}</span>;
}

function ApprovalRow({
  approval,
  operatorName,
  executionId,
  slug,
  onRespond,
}: {
  approval: Approval;
  operatorName?: string;
  executionId: string;
  slug?: string;
  onRespond: (id: string, decision: "approved" | "rejected", note?: string) => void;
}) {
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<"approved" | "rejected" | null>(null);

  const isPending = approval.status === "pending";

  return (
    <div className="rounded-[12px] border border-[#222222] bg-[#161616] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Warning size={14} className="shrink-0 text-[#F59E0B]" />
            <span className="text-[13px] font-medium">Content approval required</span>
          </div>
          <div className="mt-1 text-[11px] text-[#555555]">
            {operatorName && <span className="mr-2 text-[#888888]">{operatorName}</span>}
            Execution{" "}
            <Link href={`/w/${slug}/executions/${executionId}`} className="font-mono text-[#6366F1] hover:underline">
              {executionId.slice(-10)}
            </Link>
            {" · "}{ago(approval.createdAt)}
          </div>
        </div>
        <StatusBadge status={approval.status} />
      </div>

      {approval.message && (
        <div className="rounded-[8px] bg-[#111111] px-3 py-2 text-[12px] text-[#888888]">
          {approval.message}
        </div>
      )}

      {approval.contentPreview && (
        <div className="rounded-[8px] border border-[#222222] bg-[#0E0E0E] px-3 py-2.5 font-mono text-[11px] text-[#888888] whitespace-pre-wrap line-clamp-6">
          {approval.contentPreview}
        </div>
      )}

      {isPending && !confirming && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirming("approved")}
            className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-3 py-1.5 text-[12px] text-[#22C55E] hover:bg-[rgba(34,197,94,0.12)]">
            <Check size={12} weight="bold" /> Approve
          </button>
          <button type="button" onClick={() => setConfirming("rejected")}
            className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-3 py-1.5 text-[12px] text-[#EF4444] hover:bg-[rgba(239,68,68,0.12)]">
            <X size={12} weight="bold" /> Reject
          </button>
        </div>
      )}

      {isPending && confirming && (
        <div className="space-y-2">
          <textarea
            placeholder={`Add a note (optional)…`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[12px] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => { onRespond(approval._id, confirming, note); setConfirming(null); setNote(""); }}
              className={`flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] font-medium ${confirming === "approved" ? "bg-[#22C55E] text-[#090909] hover:bg-[#16A34A]" : "bg-[#EF4444] text-white hover:bg-[#DC2626]"}`}>
              {confirming === "approved" ? <Check size={12} weight="bold" /> : <X size={12} weight="bold" />}
              Confirm {confirming}
            </button>
            <button type="button" onClick={() => { setConfirming(null); setNote(""); }}
              className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] hover:bg-[#222222]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isPending && approval.note && (
        <div className="text-[11px] text-[#555555]">Note: {approval.note}</div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  const { workspace } = useWorkspaceContext();
  const wid = workspace?._id;
  const slug = workspace?.slug;

  const executions = useExecutions(wid) as Execution[] | undefined;
  const operators = useOperators(wid) as Operator[] | undefined;

  const respondApproval = useMutation(anyApi.executions.respondExecutionApproval);

  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [error, setError] = useState<string | null>(null);

  const pendingExecutions = useMemo(
    () => (executions ?? []).filter((e) => e.status === "pending_approval"),
    [executions]
  );

  const approvalQueries = useQuery(
    anyApi.executions.listExecutionApprovals,
    pendingExecutions.length > 0 ? { executionId: pendingExecutions[0]._id } : "skip"
  ) as Approval[] | undefined;

  const operatorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const op of operators ?? []) m.set(op._id, op.name);
    return m;
  }, [operators]);

  async function handleRespond(id: string, decision: "approved" | "rejected", note?: string) {
    setError(null);
    try {
      await respondApproval({ id, decision, note });
    } catch (e) {
      setError(String(e));
    }
  }

  const isLoading = executions === undefined;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[18px] font-medium leading-snug">Approvals</h1>
        <p className="mt-1 text-[12px] text-[#888888]">Review and approve AI-generated content before publishing</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#222222]">
        {(["pending", "all"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`border-b-2 px-4 pb-2 pt-1 text-[13px] font-medium capitalize transition-colors ${tab === t ? "border-[#F0F0F0] text-[#F0F0F0]" : "border-transparent text-[#555555] hover:text-[#888888]"}`}>
            {t}
            {t === "pending" && pendingExecutions.length > 0 && (
              <span className="ml-1.5 rounded-full bg-[#F59E0B] px-1.5 py-0.5 text-[10px] font-semibold text-[#090909]">
                {pendingExecutions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <ArrowClockwise size={20} className="animate-spin text-[#3A3A3A]" />
        </div>
      )}

      {!isLoading && tab === "pending" && pendingExecutions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckSquare size={40} className="text-[#2A2A2A]" />
          <div>
            <div className="text-[15px] font-medium">All caught up!</div>
            <div className="mt-1 text-[12px] text-[#555555]">No content waiting for your review.</div>
          </div>
        </div>
      )}

      {!isLoading && tab === "pending" && pendingExecutions.length > 0 && (
        <div className="space-y-3">
          <div className="text-[12px] text-[#555555]">{pendingExecutions.length} execution{pendingExecutions.length !== 1 ? "s" : ""} awaiting approval</div>
          {pendingExecutions.map((exe) => (
            <div key={exe._id} className="rounded-[14px] border border-[rgba(245,158,11,0.2)] bg-[#161616] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Warning size={14} className="text-[#F59E0B]" />
                  <span className="text-[13px] font-medium">Execution requires approval</span>
                </div>
                <Link href={`/w/${slug}/executions/${exe._id}`}
                  className="text-[11px] text-[#6366F1] hover:underline">
                  View execution →
                </Link>
              </div>
              <div className="text-[11px] text-[#555555]">
                {exe.operatorId && operatorMap.get(exe.operatorId) && (
                  <span className="mr-2 text-[#888888]">{operatorMap.get(exe.operatorId)}</span>
                )}
                Started {ago(exe.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && tab === "all" && (
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5 text-center">
          <div className="text-[13px] text-[#555555]">
            Full approval history will be visible here. Select an execution to view its approval log.
          </div>
        </div>
      )}
    </div>
  );
}
