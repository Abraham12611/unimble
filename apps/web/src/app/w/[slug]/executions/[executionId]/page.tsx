"use client";

import Link from "next/link";
import { use, useState } from "react";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useExecution, useExecutionSteps, useExecutionApprovals } from "@/lib/convexHooks";
import {
  ArrowLeft,
  Play,
  XCircle,
  CheckCircle,
  Circle,
  Clock,
  ArrowClockwise,
  Warning,
  Check,
  X,
  CaretDown,
  CaretRight,
  StopCircle,
} from "@phosphor-icons/react";

type Execution = {
  _id: string;
  operatorId?: string;
  workflowId?: string;
  status?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  context?: Record<string, unknown>;
};
type Step = {
  _id: string;
  name?: string;
  type?: string;
  status?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  attemptCount?: number;
};
type Approval = {
  _id: string;
  executionId: string;
  stepId?: string;
  message?: string;
  contentPreview?: string;
  status: string;
  createdAt: number;
  decision?: string;
  note?: string;
};

function statusColor(s?: string) {
  return {
    completed: "text-[#22C55E]",
    failed: "text-[#EF4444]",
    running: "text-[#3B82F6]",
    pending_approval: "text-[#F59E0B]",
    cancelled: "text-[#555555]",
  }[s ?? ""] ?? "text-[#555555]";
}
function statusBg(s?: string) {
  return {
    completed: "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.06)]",
    failed: "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)]",
    running: "border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.06)]",
    pending_approval: "border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.06)]",
  }[s ?? ""] ?? "border-[#222222] bg-[#161616]";
}

function StatusIcon({ status, size = 14 }: { status?: string; size?: number }) {
  switch (status) {
    case "completed": return <CheckCircle size={size} weight="fill" className="text-[#22C55E]" />;
    case "failed": return <XCircle size={size} weight="fill" className="text-[#EF4444]" />;
    case "running": return <Circle size={size} weight="fill" className="animate-pulse text-[#3B82F6]" />;
    case "pending_approval": return <Clock size={size} className="text-[#F59E0B]" />;
    case "cancelled": return <StopCircle size={size} className="text-[#555555]" />;
    default: return <Circle size={size} weight="fill" className="text-[#555555]" />;
  }
}

function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function duration(start?: number, end?: number) {
  if (!start || !end) return "—";
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function StepRow({ step }: { step: Step }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = step.input || step.output || step.error;

  return (
    <div className={`rounded-[10px] border ${statusBg(step.status)}`}>
      <button type="button" onClick={() => hasDetail && setExpanded((v) => !v)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hasDetail ? "cursor-pointer" : ""}`}>
        <StatusIcon status={step.status} size={13} />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium">{step.name ?? step.type ?? "Step"}</span>
          {step.type && step.name && (
            <span className="ml-2 text-[11px] text-[#555555] capitalize">{step.type}</span>
          )}
        </div>
        <div className="shrink-0 text-[11px] text-[#555555]">
          {duration(step.startedAt, step.completedAt)}
        </div>
        {(step.attemptCount ?? 0) > 1 && (
          <span className="text-[10px] text-[#F59E0B]">×{step.attemptCount}</span>
        )}
        {hasDetail && (
          <span className="text-[#555555]">
            {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
          </span>
        )}
      </button>

      {expanded && hasDetail && (
        <div className="border-t border-[#1C1C1C] px-4 py-3 space-y-2">
          {step.error && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#EF4444] mb-1">Error</div>
              <pre className="rounded-[6px] bg-[#0E0E0E] px-3 py-2 text-[11px] text-[#EF4444] overflow-x-auto whitespace-pre-wrap">{step.error}</pre>
            </div>
          )}
          {step.output != null && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#555555] mb-1">Output</div>
              <pre className="rounded-[6px] bg-[#0E0E0E] px-3 py-2 text-[11px] text-[#888888] overflow-x-auto whitespace-pre-wrap max-h-40">{JSON.stringify(step.output, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExecutionDetailPage({ params }: { params: Promise<{ slug: string; executionId: string }> }) {
  const { executionId } = use(params);
  const { workspace } = useWorkspaceContext();
  const slug = workspace?.slug;

  const execution = useExecution(executionId) as Execution | null | undefined;
  const steps = useExecutionSteps(executionId) as Step[] | undefined;
  const approvals = useExecutionApprovals(executionId) as Approval[] | undefined;

  const cancelExecution = useMutation(anyApi.executions.cancelExecution);
  const retryExecution = useMutation(anyApi.executions.retryExecution);
  const respondApproval = useMutation(anyApi.executions.respondExecutionApproval);

  const [actionError, setActionError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState("");

  async function handleCancel() {
    if (!executionId) return;
    try { await cancelExecution({ id: executionId }); } catch (e) { setActionError(String(e)); }
  }
  async function handleRetry() {
    if (!executionId) return;
    try { await retryExecution({ id: executionId }); } catch (e) { setActionError(String(e)); }
  }
  async function handleApproval(id: string, decision: "approved" | "rejected") {
    try {
      await respondApproval({ id, decision, note: approvalNote || undefined });
      setRespondingId(null);
      setApprovalNote("");
    } catch (e) {
      setActionError(String(e));
    }
  }

  if (execution === undefined) {
    return <div className="flex items-center justify-center py-24 text-[13px] text-[#555555]">Loading…</div>;
  }
  if (execution === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <Play size={36} className="text-[#2A2A2A]" />
        <div className="text-[15px] font-medium">Execution not found</div>
        <Link href={`/w/${slug}/executions`} className="text-[13px] text-[#6366F1] hover:underline">← Back to executions</Link>
      </div>
    );
  }

  const pendingApprovals = (approvals ?? []).filter((a) => a.status === "pending");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={`/w/${slug}/executions`}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[#555555] hover:bg-[#1C1C1C] hover:text-[#888888]">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-mono text-[16px] font-medium">{executionId.slice(-16)}</h1>
            <span className={`flex items-center gap-1.5 text-[12px] capitalize ${statusColor(execution.status)}`}>
              <StatusIcon status={execution.status} size={12} />
              {execution.status ?? "unknown"}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#555555]">
            Started {ago(execution.createdAt)} · Updated {ago(execution.updatedAt)}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {execution.status === "running" && (
            <button type="button" onClick={handleCancel}
              className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-3 py-1.5 text-[12px] text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)]">
              <StopCircle size={12} /> Cancel
            </button>
          )}
          {execution.status === "failed" && (
            <button type="button" onClick={handleRetry}
              className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] hover:bg-[#222222]">
              <ArrowClockwise size={12} /> Retry
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">{actionError}</div>
      )}

      {/* Pending approvals gate */}
      {pendingApprovals.length > 0 && (
        <div className="rounded-[14px] border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.04)] p-5 space-y-3">
          <div className="flex items-center gap-2 text-[#F59E0B]">
            <Warning size={16} />
            <span className="text-[14px] font-medium">Approval required to continue</span>
          </div>
          {pendingApprovals.map((ap) => (
            <div key={ap._id} className="space-y-2">
              {ap.message && <p className="text-[13px] text-[#888888]">{ap.message}</p>}
              {ap.contentPreview && (
                <pre className="rounded-[8px] border border-[#222222] bg-[#0E0E0E] px-3 py-2.5 text-[11px] text-[#888888] whitespace-pre-wrap overflow-x-auto max-h-48">{ap.contentPreview}</pre>
              )}
              {respondingId === ap._id ? (
                <div className="space-y-2">
                  <textarea value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)}
                    placeholder="Add a note (optional)…" rows={2}
                    className="w-full resize-none rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[12px] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleApproval(ap._id, "approved")}
                      className="flex items-center gap-1.5 rounded-[6px] bg-[#22C55E] px-3 py-1.5 text-[12px] font-medium text-[#090909] hover:bg-[#16A34A]">
                      <Check size={12} weight="bold" /> Approve
                    </button>
                    <button type="button" onClick={() => handleApproval(ap._id, "rejected")}
                      className="flex items-center gap-1.5 rounded-[6px] bg-[#EF4444] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#DC2626]">
                      <X size={12} weight="bold" /> Reject
                    </button>
                    <button type="button" onClick={() => { setRespondingId(null); setApprovalNote(""); }}
                      className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] hover:bg-[#222222]">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRespondingId(ap._id)}
                    className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-3 py-1.5 text-[12px] text-[#22C55E] hover:bg-[rgba(34,197,94,0.12)]">
                    <Check size={12} weight="bold" /> Approve / Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Steps timeline */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[14px] font-medium mb-4">Execution Steps</div>
        {!steps || steps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            {execution.status === "running" ? (
              <>
                <ArrowClockwise size={20} className="animate-spin text-[#3A3A3A]" />
                <div className="text-[12px] text-[#555555]">Execution in progress…</div>
              </>
            ) : (
              <div className="text-[12px] text-[#555555]">No steps recorded.</div>
            )}
          </div>
        ) : (
          <div className="space-y-2 relative">
            <div className="absolute left-[18px] top-6 bottom-6 w-px bg-[#222222]" />
            <div className="relative space-y-2 pl-8">
              {[...steps].sort((a, b) => a.createdAt - b.createdAt).map((step) => (
                <StepRow key={step._id} step={step} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {execution.error && (
        <div className="rounded-[14px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.04)] p-5">
          <div className="flex items-center gap-2 text-[#EF4444] mb-2">
            <XCircle size={14} weight="fill" />
            <span className="text-[13px] font-medium">Execution Error</span>
          </div>
          <pre className="text-[12px] text-[#EF4444] whitespace-pre-wrap overflow-x-auto">{execution.error}</pre>
        </div>
      )}

      {/* Approval history */}
      {approvals && approvals.length > 0 && (
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
          <div className="text-[14px] font-medium mb-3">Approval History</div>
          <div className="space-y-2">
            {approvals.map((ap) => (
              <div key={ap._id} className="flex items-center gap-3 rounded-[8px] bg-[#111111] px-3 py-2">
                {ap.status === "approved" ? <CheckCircle size={13} weight="fill" className="shrink-0 text-[#22C55E]" /> :
                  ap.status === "rejected" ? <XCircle size={13} weight="fill" className="shrink-0 text-[#EF4444]" /> :
                  <Clock size={13} className="shrink-0 text-[#F59E0B]" />}
                <span className="text-[12px] capitalize text-[#888888]">{ap.status}</span>
                {ap.note && <span className="text-[11px] text-[#555555]">— {ap.note}</span>}
                <span className="ml-auto text-[11px] text-[#555555]">{ago(ap.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
