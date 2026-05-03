"use client";

import Link from "next/link";
import { use, useState, useMemo } from "react";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useWorkflow, useWorkflowVersions, useExecutions } from "@/lib/convexHooks";
import {
  ArrowLeft,
  GitBranch,
  Play,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  CircleFill,
  Warning,
  Trash,
  Copy,
} from "@phosphor-icons/react";

type Workflow = {
  _id: string;
  name: string;
  description?: string;
  status?: string;
  trigger?: unknown;
  steps?: unknown;
  operatorId?: string;
  version?: number;
  createdAt: number;
  updatedAt: number;
};
type WorkflowVersion = { _id: string; version: number; createdAt: number; createdBy?: string };
type Execution = { _id: string; workflowId?: string; status?: string; createdAt: number; updatedAt: number };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "executions", label: "Executions" },
  { id: "versions", label: "Versions" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function stepColor(s?: string) {
  return { completed: "text-[#22C55E]", failed: "text-[#EF4444]", running: "text-[#3B82F6]" }[s ?? ""] ?? "text-[#555555]";
}

function ExecIcon({ status }: { status?: string }) {
  switch (status) {
    case "completed": return <CheckCircle size={12} weight="fill" className="text-[#22C55E]" />;
    case "failed": return <XCircle size={12} weight="fill" className="text-[#EF4444]" />;
    case "running": return <CircleFill size={12} className="animate-pulse text-[#3B82F6]" />;
    default: return <CircleFill size={12} className="text-[#555555]" />;
  }
}

function triggerLabel(trigger: unknown) {
  if (!trigger || typeof trigger !== "object") return { type: "Manual", schedule: null };
  const t = trigger as { type?: string; schedule?: string; event?: string };
  return { type: t.type ?? "manual", schedule: t.schedule ?? t.event ?? null };
}

function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Very simple flow diagram using SVG boxes
function WorkflowDiagram({ steps }: { steps: unknown }) {
  const stepList = Array.isArray(steps) ? steps as { name?: string; type?: string }[] : [];
  if (stepList.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <GitBranch size={28} className="text-[#2A2A2A]" />
        <div className="text-[12px] text-[#555555]">No steps configured yet.</div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2">
      {stepList.map((step, i) => (
        <div key={i} className="flex items-center">
          <div className="flex h-10 min-w-[110px] items-center justify-center rounded-[8px] border border-[#2A2A2A] bg-[#111111] px-3 text-center">
            <div>
              <div className="text-[11px] font-medium capitalize">{step.name ?? step.type ?? `Step ${i + 1}`}</div>
              {step.type && step.name && <div className="text-[9px] text-[#555555] capitalize">{step.type}</div>}
            </div>
          </div>
          {i < stepList.length - 1 && (
            <div className="flex items-center px-1">
              <div className="h-px w-5 bg-[#2A2A2A]" />
              <div className="text-[#2A2A2A]">›</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function WorkflowDetailPage({ params }: { params: Promise<{ slug: string; workflowId: string }> }) {
  const { workflowId } = use(params);
  const { workspace } = useWorkspaceContext();
  const slug = workspace?.slug;
  const wid = workspace?._id;

  const workflow = useWorkflow(workflowId) as Workflow | null | undefined;
  const versions = useWorkflowVersions(workflowId) as WorkflowVersion[] | undefined;
  const allExecutions = useExecutions(wid) as Execution[] | undefined;

  const duplicateWorkflow = useMutation(anyApi.workflows.duplicateWorkflow);
  const deleteWorkflow = useMutation(anyApi.workflows.deleteWorkflow);

  const [tab, setTab] = useState<TabId>("overview");
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const wfExecutions = useMemo(
    () => [...(allExecutions ?? [])].filter((e) => e.workflowId === workflowId).sort((a, b) => b.createdAt - a.createdAt),
    [allExecutions, workflowId]
  );

  async function handleDuplicate() {
    if (!workflowId) return;
    try { await duplicateWorkflow({ id: workflowId }); } catch (e) { setActionError(String(e)); }
  }
  async function handleDelete() {
    if (!workflowId) return;
    try {
      await deleteWorkflow({ id: workflowId });
      window.location.href = `/w/${slug}/workflows`;
    } catch (e) {
      setActionError(String(e));
      setConfirmDelete(false);
    }
  }

  if (workflow === undefined) return <div className="flex items-center justify-center py-24 text-[13px] text-[#555555]">Loading…</div>;
  if (workflow === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <GitBranch size={36} className="text-[#2A2A2A]" />
        <div className="text-[15px] font-medium">Workflow not found</div>
        <Link href={`/w/${slug}/workflows`} className="text-[13px] text-[#6366F1] hover:underline">← Back to workflows</Link>
      </div>
    );
  }

  const trigger = triggerLabel(workflow.trigger);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={`/w/${slug}/workflows`}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[#555555] hover:bg-[#1C1C1C] hover:text-[#888888]">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-medium leading-snug">{workflow.name}</h1>
          {workflow.description && <p className="mt-1 text-[12px] text-[#888888]">{workflow.description}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={handleDuplicate}
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] hover:bg-[#222222]">
            <Copy size={12} /> Duplicate
          </button>
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-3 py-1.5 text-[12px] text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)]">
            <Trash size={12} /> Delete
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">{actionError}</div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#222222]">
        {TABS.map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`border-b-2 px-4 pb-2 pt-1 text-[13px] font-medium transition-colors ${tab === id ? "border-[#F0F0F0] text-[#F0F0F0]" : "border-transparent text-[#555555] hover:text-[#888888]"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Status", value: workflow.status ?? "idle", icon: <CircleFill size={10} className={workflow.status === "active" ? "text-[#22C55E]" : "text-[#555555]"} /> },
              { label: "Trigger", value: trigger.type, icon: <Calendar size={12} /> },
              { label: "Version", value: `v${workflow.version ?? 1}`, icon: <GitBranch size={12} /> },
            ].map((s) => (
              <div key={s.label} className="rounded-[12px] border border-[#222222] bg-[#161616] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#555555]">{s.label}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[14px] font-medium capitalize">
                  <span className="text-[#888888]">{s.icon}</span>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
            <div className="text-[14px] font-medium mb-3">Workflow Steps</div>
            <WorkflowDiagram steps={workflow.steps} />
          </div>
        </div>
      )}

      {/* Executions */}
      {tab === "executions" && (
        <div>
          {wfExecutions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Play size={32} className="text-[#2A2A2A]" />
              <div className="text-[13px] text-[#555555]">No executions via this workflow yet.</div>
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
                  {wfExecutions.map((exe) => (
                    <tr key={exe._id} className="hover:bg-[#1A1A1A]">
                      <td className="px-4 py-3">
                        <Link href={`/w/${slug}/executions/${exe._id}`}
                          className="font-mono text-[12px] text-[#6366F1] hover:underline">{exe._id.slice(-12)}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1.5 text-[12px] capitalize ${stepColor(exe.status)}`}>
                          <ExecIcon status={exe.status} />{exe.status ?? "unknown"}
                        </span>
                      </td>
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

      {/* Versions */}
      {tab === "versions" && (
        <div>
          {!versions || versions.length === 0 ? (
            <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5 text-center">
              <div className="text-[12px] text-[#555555]">No version history available.</div>
            </div>
          ) : (
            <div className="rounded-[14px] border border-[#222222] bg-[#161616] overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#222222]">
                    {["Version", "Created", "Author"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C1C1C]">
                  {[...versions].sort((a, b) => b.version - a.version).map((v, i) => (
                    <tr key={v._id} className="hover:bg-[#1A1A1A]">
                      <td className="px-4 py-3 text-[13px] font-medium">
                        v{v.version}
                        {i === 0 && <span className="ml-2 text-[10px] text-[#22C55E]">current</span>}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[#555555]">
                        <span className="flex items-center gap-1"><Clock size={11} />{ago(v.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[#888888]">{v.createdBy ?? "system"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settings */}
      {tab === "settings" && (
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
          <div className="text-[14px] font-medium mb-3">Workflow Settings</div>
          <div className="divide-y divide-[#1C1C1C]">
            {[
              { label: "Name", value: workflow.name },
              { label: "Status", value: workflow.status ?? "idle" },
              { label: "Trigger type", value: trigger.type },
              { label: "Schedule", value: trigger.schedule ?? "—" },
              { label: "Created", value: ago(workflow.createdAt) },
              { label: "Last updated", value: ago(workflow.updatedAt) },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2.5">
                <span className="text-[12px] text-[#555555]">{r.label}</span>
                <span className="text-[13px] capitalize">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDelete(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-[16px] border border-[#2A2A2A] bg-[#161616] p-6">
            <div className="flex items-center gap-2 text-[#EF4444]">
              <Warning size={18} /><span className="text-[15px] font-medium">Delete workflow?</span>
            </div>
            <p className="mt-2 text-[13px] text-[#888888]">This cannot be undone.</p>
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
