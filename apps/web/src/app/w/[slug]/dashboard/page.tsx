"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useOperators, useExecutions } from "@/lib/convexHooks";
import {
  Robot,
  CheckSquare,
  ArrowRight,
  Circle,
  Clock,
  CheckCircle,
  XCircle,
  Warning,
} from "@phosphor-icons/react";

type Operator = { _id: string; name: string; type: string; status?: string };
type Execution = {
  _id: string;
  operatorId?: string;
  status?: string;
  createdAt: number;
  updatedAt: number;
};

function statusDot(status?: string) {
  switch (status) {
    case "active": return "bg-[#22C55E]";
    case "paused": return "bg-[#F59E0B]";
    default: return "bg-[#555555]";
  }
}

function execColor(status?: string) {
  switch (status) {
    case "completed": return "text-[#22C55E]";
    case "failed": return "text-[#EF4444]";
    case "running": return "text-[#3B82F6]";
    case "pending_approval": return "text-[#F59E0B]";
    default: return "text-[#555555]";
  }
}

function ExecIcon({ status }: { status?: string }) {
  switch (status) {
    case "completed": return <CheckCircle size={13} weight="fill" />;
    case "failed": return <XCircle size={13} weight="fill" />;
    case "running": return <Circle size={13} weight="fill" className="animate-pulse" />;
    case "pending_approval": return <Clock size={13} />;
    default: return <Circle size={13} weight="fill" />;
  }
}

function ago(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function WorkspaceDashboardPage() {
  const { workspace } = useWorkspaceContext();
  const slug = workspace?.slug;
  const wid = workspace?._id;

  const operators = useOperators(wid) as Operator[] | undefined;
  const executions = useExecutions(wid) as Execution[] | undefined;

  const activeOps = useMemo(() => operators?.filter((o) => o.status === "active") ?? [], [operators]);
  const weeklyExecs = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return executions?.filter((e) => e.createdAt > weekAgo) ?? [];
  }, [executions]);
  const pendingApprovals = useMemo(() => executions?.filter((e) => e.status === "pending_approval") ?? [], [executions]);
  const recent = useMemo(() => [...(executions ?? [])].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10), [executions]);

  const stats = [
    { label: "Active operators", value: String(activeOps.length), href: "operators" },
    { label: "Executions this week", value: String(weeklyExecs.length), href: "executions" },
    { label: "Pending approvals", value: String(pendingApprovals.length), href: "approvals" },
    { label: "Total operators", value: String(operators?.length ?? 0), href: "operators" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-medium leading-snug">{workspace?.name ?? "Dashboard"}</h1>
        <p className="mt-1 text-[12px] text-[#888888]">Workspace overview and real-time activity</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={`/w/${slug}/${s.href}`}
            className="group rounded-[14px] border border-[#222222] bg-[#161616] p-5 transition-colors hover:border-[#2A2A2A] hover:bg-[#1A1A1A]"
          >
            <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
              {s.label}
            </div>
            <div className="mt-2 text-[36px] font-semibold leading-none tracking-tight text-[#F0F0F0]">
              {s.value}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Operator grid */}
        <div className="lg:col-span-2 rounded-[14px] border border-[#222222] bg-[#161616] p-5">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-medium">Operators</div>
            <Link href={`/w/${slug}/operators`} className="flex items-center gap-1 text-[12px] text-[#555555] hover:text-[#888888]">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {!operators || operators.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
              <Robot size={32} className="text-[#2A2A2A]" />
              <p className="text-[13px] text-[#555555]">No operators deployed yet.</p>
              <Link href={`/w/${slug}/operators/deploy`} className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium hover:bg-[#222222]">
                Deploy your first operator
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {operators.slice(0, 6).map((op) => (
                <Link key={op._id} href={`/w/${slug}/operators/${op._id}`}
                  className="flex items-center gap-3 rounded-[10px] border border-[#222222] bg-[#111111] p-3 hover:border-[#2A2A2A] hover:bg-[#1A1A1A]">
                  <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${statusDot(op.status)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{op.name}</div>
                    <div className="text-[11px] text-[#555555] capitalize">{op.type}</div>
                  </div>
                  <span className="shrink-0 rounded-[4px] bg-[rgba(160,160,160,0.07)] px-1.5 py-0.5 text-[10px] capitalize text-[#555555]">
                    {op.status ?? "idle"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Pending approvals panel */}
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-medium">Pending Approvals</div>
            <Link href={`/w/${slug}/approvals`} className="flex items-center gap-1 text-[12px] text-[#555555] hover:text-[#888888]">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {pendingApprovals.length === 0 ? (
            <div className="mt-6 py-8 text-center">
              <CheckSquare size={28} className="mx-auto text-[#2A2A2A]" />
              <div className="mt-2 text-[12px] text-[#555555]">No pending approvals</div>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {pendingApprovals.slice(0, 5).map((exe) => (
                <Link key={exe._id} href={`/w/${slug}/executions/${exe._id}`}
                  className="flex items-center gap-2 rounded-[8px] border border-[#222222] bg-[#111111] p-2.5 hover:border-[#2A2A2A]">
                  <Warning size={14} className="shrink-0 text-[#F59E0B]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px]">Approval required</div>
                    <div className="text-[11px] text-[#555555]">{ago(exe.createdAt)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-medium">Recent Activity</div>
          <Link href={`/w/${slug}/executions`} className="flex items-center gap-1 text-[12px] text-[#555555] hover:text-[#888888]">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="mt-3 text-[12px] text-[#555555]">No activity yet. Deploy an operator to get started.</div>
        ) : (
          <div className="mt-3 divide-y divide-[#1C1C1C]">
            {recent.map((exe) => (
              <Link key={exe._id} href={`/w/${slug}/executions/${exe._id}`}
                className="flex items-center gap-3 py-2.5 hover:opacity-80">
                <span className={`${execColor(exe.status)} flex shrink-0 items-center`}>
                  <ExecIcon status={exe.status} />
                </span>
                <div className="min-w-0 flex-1 text-[13px]">
                  Execution{" "}
                  <span className="font-mono text-[11px] text-[#555555]">{exe._id.slice(-8)}</span>
                </div>
                <div className="shrink-0 text-[11px] text-[#555555]">{ago(exe.updatedAt)}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
