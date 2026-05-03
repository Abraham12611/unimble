"use client";

import { useMemo, useState } from "react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useExecutions, useOperators } from "@/lib/convexHooks";
import { ChartBar, ArrowUp, ArrowDown, TrendUp } from "@phosphor-icons/react";

type Execution = { _id: string; status?: string; createdAt: number; updatedAt: number; operatorId?: string };
type Operator = { _id: string; name: string; type: string };

// ─── Simple inline bar chart ─────────────────────────────────────────────────

function BarChart({ data, height = 80 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="group relative flex flex-1 flex-col items-center gap-1">
          <div
            style={{ height: `${(d.value / max) * (height - 16)}px` }}
            className="w-full rounded-t-[2px] bg-[#6366F1] opacity-70 transition-opacity group-hover:opacity-100 min-h-[2px]"
          />
          <div className="text-[9px] text-[#555555] truncate w-full text-center">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function SparkLine({ values, color = "#6366F1" }: { values: number[]; color?: string }) {
  if (values.length < 2) return <div className="h-8 w-24" />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 96;
  const h = 32;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({ label, value, sub, sparkValues, trend }: {
  label: string;
  value: string;
  sub?: string;
  sparkValues?: number[];
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <div className="text-[32px] font-semibold leading-none tracking-tight">{value}</div>
          {sub && (
            <div className={`mt-1 flex items-center gap-1 text-[11px] ${trend === "up" ? "text-[#22C55E]" : trend === "down" ? "text-[#EF4444]" : "text-[#555555]"}`}>
              {trend === "up" && <ArrowUp size={10} weight="bold" />}
              {trend === "down" && <ArrowDown size={10} weight="bold" />}
              {sub}
            </div>
          )}
        </div>
        {sparkValues && <SparkLine values={sparkValues} />}
      </div>
    </div>
  );
}

const TABS = ["Usage", "Performance", "Operators", "Content"] as const;
type Tab = (typeof TABS)[number];

export default function AnalyticsPage() {
  const { workspace } = useWorkspaceContext();
  const wid = workspace?._id;

  const executions = useExecutions(wid) as Execution[] | undefined;
  const operators = useOperators(wid) as Operator[] | undefined;

  const [tab, setTab] = useState<Tab>("Usage");

  // Build last-7-days execution counts by day
  const { dailyCounts, statusCounts, operatorCounts } = useMemo(() => {
    const execs = executions ?? [];
    const now = Date.now();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * 86400000);
      return { label: d.toLocaleDateString("en", { weekday: "short" }), ts: d.getTime(), count: 0 };
    });

    const statuses: Record<string, number> = {};
    const opCounts: Record<string, number> = {};

    for (const e of execs) {
      // daily
      for (const day of days) {
        const next = day.ts + 86400000;
        if (e.createdAt >= day.ts && e.createdAt < next) day.count++;
      }
      // status
      const s = e.status ?? "unknown";
      statuses[s] = (statuses[s] ?? 0) + 1;
      // operator
      if (e.operatorId) opCounts[e.operatorId] = (opCounts[e.operatorId] ?? 0) + 1;
    }

    return {
      dailyCounts: days.map((d) => ({ label: d.label, value: d.count })),
      statusCounts: statuses,
      operatorCounts: opCounts,
    };
  }, [executions]);

  const totalExecs = executions?.length ?? 0;
  const successRate = totalExecs === 0 ? "—" : `${Math.round(((statusCounts.completed ?? 0) / totalExecs) * 100)}%`;
  const weekTotal = dailyCounts.reduce((a, b) => a + b.value, 0);
  const sparkVals = dailyCounts.map((d) => d.value);

  const operatorRows = useMemo(() => {
    return (operators ?? [])
      .map((op) => ({ ...op, execCount: operatorCounts[op._id] ?? 0 }))
      .sort((a, b) => b.execCount - a.execCount);
  }, [operators, operatorCounts]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[18px] font-medium leading-snug">Analytics</h1>
        <p className="mt-1 text-[12px] text-[#888888]">Workspace performance and content metrics</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#222222]">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`border-b-2 px-4 pb-2 pt-1 text-[13px] font-medium transition-colors ${tab === t ? "border-[#F0F0F0] text-[#F0F0F0]" : "border-transparent text-[#555555] hover:text-[#888888]"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Usage tab */}
      {tab === "Usage" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total executions" value={String(totalExecs)} sub="all time" sparkValues={sparkVals} />
            <StatCard label="This week" value={String(weekTotal)} sub="last 7 days" trend="up" />
            <StatCard label="Success rate" value={successRate} sub="completed / total" trend="up" />
            <StatCard label="Active operators" value={String(operators?.length ?? 0)} />
          </div>

          <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
            <div className="mb-4 text-[14px] font-medium">Executions — Last 7 Days</div>
            {totalExecs === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <TrendUp size={32} className="text-[#2A2A2A]" />
                <div className="text-[12px] text-[#555555]">No execution data yet. Deploy operators to start seeing metrics.</div>
              </div>
            ) : (
              <BarChart data={dailyCounts} height={120} />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
              <div className="mb-3 text-[14px] font-medium">By Status</div>
              {Object.keys(statusCounts).length === 0 ? (
                <div className="text-[12px] text-[#555555]">No data yet.</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(statusCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => {
                      const pct = totalExecs > 0 ? (count / totalExecs) * 100 : 0;
                      const color = status === "completed" ? "bg-[#22C55E]" : status === "failed" ? "bg-[#EF4444]" : status === "running" ? "bg-[#3B82F6]" : "bg-[#555555]";
                      return (
                        <div key={status}>
                          <div className="flex justify-between text-[12px] mb-1">
                            <span className="capitalize text-[#888888]">{status.replace("_", " ")}</span>
                            <span className="text-[#555555]">{count} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#222222]">
                            <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
              <div className="mb-3 text-[14px] font-medium">Avg. Duration</div>
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <ChartBar size={28} className="text-[#2A2A2A]" />
                <div className="text-[12px] text-[#555555]">Duration tracking coming soon.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Performance tab */}
      {tab === "Performance" && (
        <div className="space-y-3">
          <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
            <div className="text-[14px] font-medium mb-2">Execution Success Rate Over Time</div>
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <TrendUp size={32} className="text-[#2A2A2A]" />
              <div className="text-[12px] text-[#555555]">Trend data will populate after your operators have run.</div>
            </div>
          </div>
        </div>
      )}

      {/* Operators tab */}
      {tab === "Operators" && (
        <div className="space-y-3">
          {operatorRows.length === 0 ? (
            <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-10 text-center">
              <div className="text-[13px] text-[#555555]">No operators yet. Deploy operators to see per-operator metrics.</div>
            </div>
          ) : (
            <div className="rounded-[14px] border border-[#222222] bg-[#161616] overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#222222]">
                    {["Operator", "Type", "Executions", "Share"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C1C1C]">
                  {operatorRows.map((op) => {
                    const share = totalExecs > 0 ? ((op.execCount / totalExecs) * 100).toFixed(0) : "0";
                    return (
                      <tr key={op._id} className="hover:bg-[#1A1A1A]">
                        <td className="px-4 py-3 text-[13px] font-medium">{op.name}</td>
                        <td className="px-4 py-3 text-[12px] capitalize text-[#888888]">{op.type.replace("_", " ")}</td>
                        <td className="px-4 py-3 text-[13px]">{op.execCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-[#222222]">
                              <div className="h-1.5 rounded-full bg-[#6366F1]" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-[11px] text-[#555555]">{share}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Content tab */}
      {tab === "Content" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {["Posts published", "Words generated", "Platforms reached"].map((label) => (
            <div key={label} className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
              <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">{label}</div>
              <div className="mt-2 text-[32px] font-semibold leading-none text-[#F0F0F0]">—</div>
              <div className="mt-1 text-[11px] text-[#555555]">Tracking via integrations</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
