"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useWorkflows, useOperators } from "@/lib/convexHooks";
import {
  GitBranch,
  Plus,
  MagnifyingGlass,
  ArrowClockwise,
  CircleFill,
  Calendar,
  Clock,
} from "@phosphor-icons/react";

type Workflow = {
  _id: string;
  name: string;
  description?: string;
  status?: string;
  trigger?: unknown;
  operatorId?: string;
  createdAt: number;
  updatedAt: number;
  version?: number;
};
type Operator = { _id: string; name: string };

function StatusDot({ status }: { status?: string }) {
  const color = status === "active" ? "bg-[#22C55E]" : status === "paused" ? "bg-[#F59E0B]" : "bg-[#555555]";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}

function triggerLabel(trigger: unknown): string {
  if (!trigger || typeof trigger !== "object") return "Manual";
  const t = trigger as { type?: string; schedule?: string };
  if (t.type === "schedule") return t.schedule ?? "Scheduled";
  if (t.type === "webhook") return "Webhook";
  if (t.type === "event") return "Event";
  return t.type ?? "Manual";
}

function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function WorkflowsPage() {
  const { workspace } = useWorkspaceContext();
  const slug = workspace?.slug;
  const wid = workspace?._id;

  const workflows = useWorkflows(wid) as Workflow[] | undefined;
  const operators = useOperators(wid) as Operator[] | undefined;

  const [search, setSearch] = useState("");

  const operatorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const op of operators ?? []) m.set(op._id, op.name);
    return m;
  }, [operators]);

  const filtered = useMemo(() => {
    let list = [...(workflows ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
    if (search) list = list.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [workflows, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-medium leading-snug">Workflows</h1>
          <p className="mt-1 text-[12px] text-[#888888]">Automation logic for your operators</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-[320px]">
        <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555555]" />
        <input type="text" placeholder="Search workflows…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] pl-8 pr-3 py-1.5 text-[13px] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]" />
      </div>

      {/* Loading */}
      {workflows === undefined && (
        <div className="flex items-center justify-center py-16">
          <ArrowClockwise size={20} className="animate-spin text-[#3A3A3A]" />
        </div>
      )}

      {/* Empty */}
      {workflows !== undefined && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <GitBranch size={36} className="text-[#2A2A2A]" />
          <div>
            <div className="text-[15px] font-medium">No workflows {search ? "found" : "yet"}</div>
            <div className="mt-1 text-[12px] text-[#555555]">
              {search ? "Try a different search." : "Workflows are created automatically when you deploy operators."}
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
                {["Name", "Operator", "Trigger", "Status", "Version", "Updated"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1C1C]">
              {filtered.map((wf) => (
                <tr key={wf._id} className="transition-colors hover:bg-[#1A1A1A]">
                  <td className="px-4 py-3">
                    <Link href={`/w/${slug}/workflows/${wf._id}`}
                      className="font-medium text-[13px] text-[#F0F0F0] hover:text-[#6366F1]">
                      {wf.name}
                    </Link>
                    {wf.description && (
                      <div className="mt-0.5 text-[11px] text-[#555555] truncate max-w-[240px]">{wf.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#888888]">
                    {wf.operatorId ? (operatorMap.get(wf.operatorId) ?? "—") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-[12px] text-[#888888]">
                      <Calendar size={11} />
                      {triggerLabel(wf.trigger)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-[12px] capitalize text-[#888888]">
                      <StatusDot status={wf.status} />
                      {wf.status ?? "idle"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#555555]">v{wf.version ?? 1}</td>
                  <td className="px-4 py-3 text-[12px] text-[#555555]">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {ago(wf.updatedAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
