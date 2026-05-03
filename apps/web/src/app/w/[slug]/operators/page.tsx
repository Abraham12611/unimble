"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useOperators } from "@/lib/convexHooks";
import {
  Robot,
  Plus,
  Play,
  Pause,
  Trash,
  DotsThree,
  MagnifyingGlass,
  CircleFill,
  ArrowClockwise,
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
};

const OPERATOR_TYPES = [
  { value: "content_growth", label: "Content Growth" },
  { value: "community_engagement", label: "Community" },
  { value: "feedback_loop", label: "Feedback Loop" },
  { value: "documentation_agent", label: "Documentation" },
  { value: "cross_platform_publishing", label: "Publishing" },
] as const;

function typeLabel(type: string) {
  return OPERATOR_TYPES.find((t) => t.value === type)?.label ?? type;
}

function StatusBadge({ status }: { status?: string }) {
  const cfg = {
    active: { dot: "bg-[#22C55E]", text: "text-[#22C55E]", bg: "bg-[rgba(34,197,94,0.08)]" },
    paused: { dot: "bg-[#F59E0B]", text: "text-[#F59E0B]", bg: "bg-[rgba(245,158,11,0.08)]" },
    deploying: { dot: "bg-[#3B82F6]", text: "text-[#3B82F6]", bg: "bg-[rgba(59,130,246,0.08)]" },
    error: { dot: "bg-[#EF4444]", text: "text-[#EF4444]", bg: "bg-[rgba(239,68,68,0.08)]" },
  }[status ?? ""] ?? { dot: "bg-[#555555]", text: "text-[#555555]", bg: "bg-[rgba(85,85,85,0.08)]" };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.text} ${cfg.bg}`}>
      <CircleFill size={6} className={cfg.dot} />
      {status ?? "idle"}
    </span>
  );
}

function OperatorMenu({
  operator,
  onPause,
  onResume,
  onDelete,
}: {
  operator: Operator;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#2A2A2A] hover:text-[#888888]"
      >
        <DotsThree size={16} weight="bold" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-[10px] border border-[#2A2A2A] bg-[#161616] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.7)]">
            {operator.status === "active" ? (
              <button type="button" onClick={() => { onPause(operator._id); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[#888888] hover:bg-[#1C1C1C] hover:text-[#F0F0F0]">
                <Pause size={13} /> Pause
              </button>
            ) : (
              <button type="button" onClick={() => { onResume(operator._id); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[#888888] hover:bg-[#1C1C1C] hover:text-[#F0F0F0]">
                <Play size={13} /> Resume
              </button>
            )}
            <button type="button" onClick={() => { onDelete(operator._id); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)]">
              <Trash size={13} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function OperatorsPage() {
  const { workspace } = useWorkspaceContext();
  const slug = workspace?.slug;
  const wid = workspace?._id;

  const operators = useOperators(wid) as Operator[] | undefined;
  const pauseOperator = useMutation(anyApi.operators.pauseOperator);
  const resumeOperator = useMutation(anyApi.operators.resumeOperator);
  const deleteOperator = useMutation(anyApi.operators.deleteOperator);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = operators ?? [];
    if (search) list = list.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    return list;
  }, [operators, search, statusFilter]);

  async function handlePause(id: string) {
    setActionError(null);
    try { await pauseOperator({ id }); } catch (e) { setActionError(String(e)); }
  }
  async function handleResume(id: string) {
    setActionError(null);
    try { await resumeOperator({ id }); } catch (e) { setActionError(String(e)); }
  }
  async function handleDelete(id: string) {
    setActionError(null);
    try { await deleteOperator({ id }); setConfirmDeleteId(null); } catch (e) { setActionError(String(e)); }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-medium leading-snug">Operators</h1>
          <p className="mt-1 text-[12px] text-[#888888]">AI agents that automate your content workflows</p>
        </div>
        <Link href={`/w/${slug}/operators/deploy`}
          className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2 text-[13px] font-medium hover:bg-[#222222]">
          <Plus size={14} /> Deploy Operator
        </Link>
      </div>

      {actionError && (
        <div className="rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">
          {actionError}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-[280px]">
          <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555555]" />
          <input
            type="text"
            placeholder="Search operators…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] pl-8 pr-3 py-1.5 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
          />
        </div>
        {["all", "active", "paused", "error"].map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
            className={`rounded-[6px] px-3 py-1.5 text-[12px] capitalize transition-colors ${statusFilter === s ? "bg-[#1C1C1C] text-[#F0F0F0]" : "text-[#555555] hover:text-[#888888]"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {operators === undefined && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ArrowClockwise size={24} className="animate-spin text-[#3A3A3A]" />
          <div className="text-[13px] text-[#555555]">Loading operators…</div>
        </div>
      )}

      {operators !== undefined && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Robot size={40} className="text-[#2A2A2A]" />
          <div>
            <div className="text-[15px] font-medium">No operators {search ? "found" : "deployed"}</div>
            <div className="mt-1 text-[12px] text-[#555555]">
              {search ? "Try a different search term." : "Deploy your first operator to start automating content."}
            </div>
          </div>
          {!search && (
            <Link href={`/w/${slug}/operators/deploy`}
              className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2 text-[13px] font-medium hover:bg-[#222222]">
              Deploy Operator
            </Link>
          )}
        </div>
      )}

      {/* Operator cards */}
      {filtered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((op) => (
            <div key={op._id} className="group relative rounded-[14px] border border-[#222222] bg-[#161616] p-5 transition-colors hover:border-[#2A2A2A]">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/w/${slug}/operators/${op._id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[rgba(99,102,241,0.12)]">
                      <Robot size={16} className="text-[#6366F1]" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium">{op.name}</div>
                      <div className="text-[11px] text-[#555555]">{typeLabel(op.type)}</div>
                    </div>
                  </div>
                </Link>
                <OperatorMenu operator={op} onPause={handlePause} onResume={handleResume}
                  onDelete={(id) => setConfirmDeleteId(id)} />
              </div>

              {op.description && (
                <p className="mt-3 text-[12px] text-[#888888] line-clamp-2">{op.description}</p>
              )}

              <div className="mt-3 flex items-center justify-between">
                <StatusBadge status={op.status} />
                <Link href={`/w/${slug}/operators/${op._id}`}
                  className="text-[11px] text-[#555555] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#888888]">
                  View details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-[16px] border border-[#2A2A2A] bg-[#161616] p-6">
            <div className="flex items-center gap-2 text-[#EF4444]">
              <Warning size={18} />
              <div className="text-[15px] font-medium">Delete operator?</div>
            </div>
            <p className="mt-2 text-[13px] text-[#888888]">
              This will permanently delete the operator and all associated data. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDeleteId(null)}
                className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[13px] hover:bg-[#222222]">
                Cancel
              </button>
              <button type="button" onClick={() => handleDelete(confirmDeleteId)}
                className="rounded-[6px] bg-[#EF4444] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#DC2626]">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
