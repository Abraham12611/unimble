"use client";

import Link from "next/link";
import { use, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useOperator, useExecutions, useWorkflowsByOperator } from "@/lib/convexHooks";
import {
  Robot,
  ArrowLeft,
  Play,
  Pause,
  Trash,
  Circle,
  CheckCircle,
  XCircle,
  Clock,
  GitBranch,
  Gear,
  Brain,
  ListChecks,
  Warning,
} from "@phosphor-icons/react";

type Operator = {
  _id: string;
  name: string;
  type: string;
  status?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  settings?: Record<string, unknown>;
  capabilities?: string[];
  memoryKeys?: string[];
};
type Execution = { _id: string; status?: string; createdAt: number; updatedAt: number };
type Workflow = { _id: string; name: string; status?: string; trigger?: unknown };

const TABS = [
  { id: "overview", label: "Overview", icon: Robot },
  { id: "executions", label: "Executions", icon: Play },
  { id: "workflows", label: "Workflows", icon: GitBranch },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "settings", label: "Settings", icon: Gear },
] as const;
type TabId = (typeof TABS)[number]["id"];

function StatusBadge({ status }: { status?: string }) {
  const cfg: Record<string, { cls: string; dot: string }> = {
    active: { cls: "text-[#22C55E] bg-[rgba(34,197,94,0.08)]", dot: "bg-[#22C55E]" },
    paused: { cls: "text-[#F59E0B] bg-[rgba(245,158,11,0.08)]", dot: "bg-[#F59E0B]" },
    error: { cls: "text-[#EF4444] bg-[rgba(239,68,68,0.08)]", dot: "bg-[#EF4444]" },
  };
  const c = cfg[status ?? ""] ?? { cls: "text-[#555555] bg-[rgba(85,85,85,0.08)]", dot: "bg-[#555555]" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium capitalize ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status ?? "idle"}
    </span>
  );
}

function ExecStatusPill({ status }: { status?: string }) {
  const cfg: Record<string, string> = {
    completed: "text-[#22C55E]",
    failed: "text-[#EF4444]",
    running: "text-[#3B82F6]",
    pending_approval: "text-[#F59E0B]",
  };
  return (
    <span className={`text-[12px] capitalize ${cfg[status ?? ""] ?? "text-[#555555]"}`}>{status ?? "unknown"}</span>
  );
}

function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function OperatorDetailPage({ params }: { params: Promise<{ slug: string; operatorId: string }> }) {
  const { operatorId } = use(params);
  const router = useRouter();
  const { workspace } = useWorkspaceContext();
  const slug = workspace?.slug;
  const wid = workspace?._id;

  const operator = useOperator(operatorId) as Operator | null | undefined;
  const executions = useExecutions(wid) as Execution[] | undefined;
  const workflows = useWorkflowsByOperator(wid, operatorId) as Workflow[] | undefined;

  const pauseOp = useMutation(anyApi.operators.pauseOperator);
  const resumeOp = useMutation(anyApi.operators.resumeOperator);
  const deleteOp = useMutation(anyApi.operators.deleteOperator);

  const [tab, setTab] = useState<TabId>("overview");
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const opExecutions = useMemo(
    () => [...(executions ?? [])].filter((e) => (e as { operatorId?: string }).operatorId === operatorId).sort((a, b) => b.createdAt - a.createdAt),
    [executions, operatorId]
  );

  const completedCount = opExecutions.filter((e) => e.status === "completed").length;
  const failedCount = opExecutions.filter((e) => e.status === "failed").length;
  const successRate = opExecutions.length > 0 ? Math.round((completedCount / opExecutions.length) * 100) : null;

  async function handlePause() {
    if (!operatorId) return;
    setActionError(null);
    try { await pauseOp({ id: operatorId }); } catch (e) { setActionError(String(e)); }
  }
  async function handleResume() {
    if (!operatorId) return;
    setActionError(null);
    try { await resumeOp({ id: operatorId }); } catch (e) { setActionError(String(e)); }
  }
  async function handleDelete() {
    if (!operatorId) return;
    setActionError(null);
    try {
      await deleteOp({ id: operatorId });
      router.push(`/w/${slug}/operators`);
    } catch (e) {
      setActionError(String(e));
      setConfirmDelete(false);
    }
  }

  if (operator === undefined) {
    return (
      <div className="flex items-center justify-center py-24 text-[13px] text-[#555555]">Loading…</div>
    );
  }
  if (operator === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <Robot size={36} className="text-[#2A2A2A]" />
        <div className="text-[15px] font-medium">Operator not found</div>
        <Link href={`/w/${slug}/operators`} className="text-[13px] text-[#6366F1] hover:underline">← Back to operators</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={`/w/${slug}/operators`}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[#555555] hover:bg-[#1C1C1C] hover:text-[#888888]">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[18px] font-medium leading-snug">{operator.name}</h1>
            <StatusBadge status={operator.status} />
          </div>
          <p className="mt-1 text-[12px] text-[#555555] capitalize">{operator.type?.replace(/_/g, " ")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {operator.status === "active" ? (
            <button type="button" onClick={handlePause}
              className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] hover:bg-[#222222]">
              <Pause size={12} /> Pause
            </button>
          ) : (
            <button type="button" onClick={handleResume}
              className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.06)] px-3 py-1.5 text-[12px] text-[#22C55E] hover:bg-[rgba(34,197,94,0.1)]">
              <Play size={12} /> Resume
            </button>
          )}
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-3 py-1.5 text-[12px] text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)]">
            <Trash size={12} /> Delete
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#222222]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-[13px] font-medium transition-colors ${tab === id ? "border-[#F0F0F0] text-[#F0F0F0]" : "border-transparent text-[#555555] hover:text-[#888888]"}`}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {operator.description && (
              <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
                <div className="text-[13px] font-medium mb-2">Description</div>
                <p className="text-[13px] text-[#888888] leading-relaxed">{operator.description}</p>
              </div>
            )}
            <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
              <div className="text-[13px] font-medium mb-3">Execution Summary</div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total", value: opExecutions.length },
                  { label: "Success rate", value: successRate !== null ? `${successRate}%` : "—" },
                  { label: "Failed", value: failedCount },
                ].map((s) => (
                  <div key={s.label} className="rounded-[10px] bg-[#111111] p-3 text-center">
                    <div className="text-[22px] font-semibold">{s.value}</div>
                    <div className="text-[10px] text-[#555555]">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-4">
              <div className="text-[12px] font-medium mb-2 text-[#888888]">Details</div>
              {[
                { label: "Type", value: operator.type?.replace(/_/g, " ") },
                { label: "Created", value: ago(operator.createdAt) },
                { label: "Updated", value: ago(operator.updatedAt) },
                { label: "Schedule", value: (operator.settings?.schedule as string) ?? "Manual" },
                { label: "Approval", value: operator.settings?.requireApproval ? "Required" : "Auto-publish" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-[#1C1C1C] last:border-0">
                  <span className="text-[11px] text-[#555555]">{r.label}</span>
                  <span className="text-[12px] capitalize">{r.value ?? "—"}</span>
                </div>
              ))}
            </div>

            {(operator.capabilities?.length ?? 0) > 0 && (
              <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-4">
                <div className="text-[12px] font-medium mb-2 text-[#888888]">Capabilities</div>
                <div className="flex flex-wrap gap-1">
                  {operator.capabilities?.map((c) => (
                    <span key={c} className="rounded-[4px] bg-[rgba(99,102,241,0.1)] px-2 py-0.5 text-[11px] text-[#6366F1] capitalize">
                      {c.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Executions tab */}
      {tab === "executions" && (
        <div>
          {opExecutions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Play size={32} className="text-[#2A2A2A]" />
              <div className="text-[13px] text-[#555555]">No executions yet for this operator.</div>
            </div>
          ) : (
            <div className="rounded-[14px] border border-[#222222] bg-[#161616] overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#222222]">
                    {["ID", "Status", "Started", "Updated"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C1C1C]">
                  {opExecutions.map((exe) => (
                    <tr key={exe._id} className="hover:bg-[#1A1A1A]">
                      <td className="px-4 py-3">
                        <Link href={`/w/${slug}/executions/${exe._id}`}
                          className="font-mono text-[12px] text-[#6366F1] hover:underline">
                          {exe._id.slice(-12)}
                        </Link>
                      </td>
                      <td className="px-4 py-3"><ExecStatusPill status={exe.status} /></td>
                      <td className="px-4 py-3 text-[12px] text-[#555555]">{ago(exe.createdAt)}</td>
                      <td className="px-4 py-3 text-[12px] text-[#555555]">{ago(exe.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Workflows tab */}
      {tab === "workflows" && (
        <div>
          {!workflows || workflows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <GitBranch size={32} className="text-[#2A2A2A]" />
              <div className="text-[13px] text-[#555555]">No workflows configured for this operator.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {workflows.map((wf) => (
                <Link key={wf._id} href={`/w/${slug}/workflows/${wf._id}`}
                  className="flex items-center gap-3 rounded-[12px] border border-[#222222] bg-[#161616] p-4 hover:border-[#2A2A2A]">
                  <GitBranch size={14} className="shrink-0 text-[#555555]" />
                  <span className="flex-1 text-[13px] font-medium">{wf.name}</span>
                  <span className="text-[12px] capitalize text-[#555555]">{wf.status ?? "idle"}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Memory tab */}
      {tab === "memory" && (
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={16} className="text-[#888888]" />
            <div className="text-[14px] font-medium">Operator Memory</div>
          </div>
          {(operator.memoryKeys?.length ?? 0) === 0 ? (
            <div className="text-[12px] text-[#555555]">
              This operator has no persisted memory yet. Memory is stored after the first execution.
            </div>
          ) : (
            <div className="space-y-2">
              {operator.memoryKeys?.map((key) => (
                <div key={key} className="flex items-center justify-between rounded-[8px] bg-[#111111] px-3 py-2">
                  <span className="font-mono text-[12px] text-[#888888]">{key}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings tab */}
      {tab === "settings" && (
        <div className="space-y-4 max-w-lg">
          <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
            <div className="text-[14px] font-medium mb-3">Operator Settings</div>
            <div className="space-y-3">
              {[
                { label: "Schedule", value: (operator.settings?.schedule as string) ?? "manual" },
                { label: "Require approval", value: operator.settings?.requireApproval ? "Yes" : "No" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-2 border-b border-[#1C1C1C] last:border-0">
                  <span className="text-[13px] text-[#888888]">{r.label}</span>
                  <span className="text-[12px] capitalize">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-[#555555]">
            Full settings editing will be available in a future update. To reconfigure, delete and redeploy this operator.
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDelete(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-[16px] border border-[#2A2A2A] bg-[#161616] p-6">
            <div className="flex items-center gap-2 text-[#EF4444]">
              <Warning size={18} /><div className="text-[15px] font-medium">Delete operator?</div>
            </div>
            <p className="mt-2 text-[13px] text-[#888888]">
              This will permanently delete <strong className="text-[#F0F0F0]">{operator.name}</strong> and all associated data.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[13px] hover:bg-[#222222]">Cancel</button>
              <button type="button" onClick={handleDelete}
                className="rounded-[6px] bg-[#EF4444] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#DC2626]">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
