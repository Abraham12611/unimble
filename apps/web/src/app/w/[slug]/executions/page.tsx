"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useExecutions, useOperators } from "@/lib/convexHooks";
import {
  Play,
  MagnifyingGlass,
  CircleFill,
  CheckCircle,
  XCircle,
  Clock,
  ArrowClockwise,
} from "@phosphor-icons/react";

type Execution = {
  _id: string;
  operatorId?: string;
  workflowId?: string;
  status?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
};
type Operator = { _id: string; name: string };

const STATUS_OPTIONS = ["all", "running", "completed", "failed", "pending_approval", "cancelled"];

function StatusPill({ status }: { status?: string }) {
  const cfg: Record<string, { icon: React.ReactNode; classes: string }> = {
    running: { icon: <CircleFill size={8} className="animate-pulse" />, classes: "text-[#3B82F6] bg-[rgba(59,130,246,0.1)]" },
    completed: { icon: <CheckCircle size={10} weight="fill" />, classes: "text-[#22C55E] bg-[rgba(34,197,94,0.1)]" },
    failed: { icon: <XCircle size={10} weight="fill" />, classes: "text-[#EF4444] bg-[rgba(239,68,68,0.1)]" },
    pending_approval: { icon: <Clock size={10} />, classes: "text-[#F59E0B] bg-[rgba(245,158,11,0.1)]" },
    cancelled: { icon: <XCircle size={10} />, classes: "text-[#555555] bg-[rgba(85,85,85,0.1)]" },
  };
  const c = cfg[status ?? ""] ?? { icon: <CircleFill size={8} />, classes: "text-[#555555] bg-[rgba(85,85,85,0.1)]" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${c.classes}`}>
      {c.icon}
      {status ?? "idle"}
    </span>
  );
}

function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ExecutionsPage() {
  const { workspace } = useWorkspaceContext();
  const slug = workspace?.slug;
  const wid = workspace?._id;

  const executions = useExecutions(wid) as Execution[] | undefined;
  const operators = useOperators(wid) as Operator[] | undefined;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const operatorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const op of operators ?? []) m.set(op._id, op.name);
    return m;
  }, [operators]);

  const filtered = useMemo(() => {
    let list = [...(executions ?? [])].sort((a, b) => b.createdAt - a.createdAt);
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e._id.toLowerCase().includes(q) ||
          (e.operatorId && operatorMap.get(e.operatorId)?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [executions, statusFilter, search, operatorMap]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[18px] font-medium leading-snug">Executions</h1>
        <p className="mt-1 text-[12px] text-[#888888]">Monitor all operator execution runs</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-[280px] flex-1">
          <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555555]" />
          <input type="text" placeholder="Search executions…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] pl-8 pr-3 py-1.5 text-[13px] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]" />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`rounded-[6px] px-2.5 py-1 text-[11px] capitalize transition-colors ${statusFilter === s ? "bg-[#1C1C1C] text-[#F0F0F0]" : "text-[#555555] hover:text-[#888888]"}`}>
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {executions === undefined && (
        <div className="flex items-center justify-center py-16">
          <ArrowClockwise size={20} className="animate-spin text-[#3A3A3A]" />
        </div>
      )}

      {/* Empty */}
      {executions !== undefined && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Play size={36} className="text-[#2A2A2A]" />
          <div>
            <div className="text-[15px] font-medium">No executions {search ? "found" : "yet"}</div>
            <div className="mt-1 text-[12px] text-[#555555]">
              {search ? "Try a different search." : "Executions will appear here once operators run."}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#222222]">
                {["ID", "Operator", "Status", "Started", "Updated"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1C1C]">
              {filtered.map((exe) => (
                <tr key={exe._id} className="group transition-colors hover:bg-[#1A1A1A]">
                  <td className="px-4 py-3">
                    <Link href={`/w/${slug}/executions/${exe._id}`}
                      className="font-mono text-[12px] text-[#6366F1] hover:underline">
                      {exe._id.slice(-12)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#888888]">
                    {exe.operatorId ? (operatorMap.get(exe.operatorId) ?? exe.operatorId.slice(-8)) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={exe.status} />
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
  );
}
