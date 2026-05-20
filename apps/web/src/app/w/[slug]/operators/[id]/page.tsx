"use client";

/**
 * Operator Detail Page
 *
 * Shows operator overview, executions, memory, and settings in a tabbed layout.
 *
 * Phase 8.7.2 — Operator Detail Page
 */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { formatRelativeTime, formatDuration } from "@/lib/format";
import {
  Robot,
  Play,
  Pause,
  Gear,
  DotsThree,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Lightning,
  Brain,
  CalendarBlank,
} from "@phosphor-icons/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "overview" | "executions" | "memory" | "settings";

interface ExecutionRow {
  id: string;
  workflowName: string;
  startedAt: number;
  durationMs: number;
  status: "completed" | "failed" | "running" | "cancelled";
  costUsd: number;
}

interface MemoryEntry {
  key: string;
  value: string;
  source: "learned" | "manual" | "imported";
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OperatorDetailPage() {
  const { slug: rawSlug } = useWorkspaceContext();
  const slug = rawSlug ?? "";
  const params = useParams();
  const operatorId = params?.id as string;
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // TODO: Replace with real Convex query
  const operator = {
    id: operatorId,
    name: "Content Operator",
    type: "content" as const,
    status: "active" as const,
    executionsThisWeek: 12,
    successRate: 98,
    avgDurationMs: 272000,
    costThisWeek: 18.5,
    nextRunAt: Date.now() + 86400000 * 2,
    nextWorkflow: "Weekly Content Pipeline",
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "executions", label: "Executions" },
    { id: "memory", label: "Memory" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/w/${slug}/operators`}
            className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#888888]"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A]">
            <Robot size={20} className="text-[#888888]" />
          </div>
          <div>
            <h1 className="text-[18px] font-medium leading-snug text-[#F0F0F0]">{operator.name}</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                <span className="text-[12px] capitalize text-[#22C55E]">{operator.status}</span>
              </span>
              <span className="text-[12px] text-[#555555]">•</span>
              <span className="text-[12px] text-[#888888]">Content</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#161616] px-3 py-2 text-[13px] text-[#F0F0F0] transition-colors hover:bg-[#1C1C1C]">
            <Play size={14} /> Run Now
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#161616] px-3 py-2 text-[13px] text-[#888888] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]">
            <Pause size={14} /> Pause
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#161616] px-3 py-2 text-[13px] text-[#888888] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]">
            <Gear size={14} />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#2A2A2A] bg-[#161616] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#888888]">
            <DotsThree size={16} weight="bold" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#222222]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-[13px] font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-[#F0F0F0] text-[#F0F0F0]"
                : "text-[#555555] hover:text-[#888888]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <OverviewTab operator={operator} />}
      {activeTab === "executions" && <ExecutionsTab slug={slug} operatorId={operatorId} />}
      {activeTab === "memory" && <MemoryTab />}
      {activeTab === "settings" && <SettingsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({
  operator,
}: {
  operator: {
    executionsThisWeek: number;
    successRate: number;
    avgDurationMs: number;
    costThisWeek: number;
    nextRunAt: number;
    nextWorkflow: string;
  };
}) {
  const stats = [
    {
      label: "Executions (7d)",
      value: String(operator.executionsThisWeek),
      trend: "+20%",
      trendPositive: true,
    },
    { label: "Success rate", value: `${operator.successRate}%`, trend: null, trendPositive: true },
    {
      label: "Avg duration",
      value: formatDuration(operator.avgDurationMs),
      trend: "-10%",
      trendPositive: true,
    },
    {
      label: "Cost (7d)",
      value: `$${operator.costThisWeek.toFixed(2)}`,
      trend: "+5%",
      trendPositive: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
              {stat.label}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[28px] font-semibold leading-none tracking-tight text-[#F0F0F0]">
                {stat.value}
              </span>
              {stat.trend && (
                <span
                  className={`text-[12px] font-medium ${stat.trendPositive ? "text-[#22C55E]" : "text-[#EF4444]"}`}
                >
                  {stat.trend}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Next Run */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <CalendarBlank size={16} className="text-[#888888]" />
          <span className="text-[13px] text-[#888888]">Next scheduled run</span>
        </div>
        <div className="mt-2 text-[15px] font-medium text-[#F0F0F0]">
          {new Date(operator.nextRunAt).toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
        <div className="mt-1 text-[12px] text-[#555555]">{operator.nextWorkflow}</div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Recent Activity</div>
        <div className="mt-3 text-[12px] text-[#555555]">No recent activity to display.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Executions Tab
// ---------------------------------------------------------------------------

function ExecutionsTab({}: { slug: string; operatorId: string }) {
  // TODO: Replace with real Convex query
  const executions: ExecutionRow[] = [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <select className="rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none">
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
        </select>
      </div>

      {executions.length === 0 ? (
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] px-6 py-12 text-center">
          <Lightning size={24} className="mx-auto text-[#555555]" />
          <p className="mt-2 text-[12px] text-[#555555]">
            No executions yet. Run the operator to see results here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-[#222222] bg-[#161616]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#222222]">
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
                  Workflow
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
                  Started
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {executions.map((exec) => (
                <tr
                  key={exec.id}
                  className="border-b border-[#222222] last:border-0 hover:bg-[#1C1C1C]"
                >
                  <td className="px-4 py-3 font-mono text-[12px] text-[#888888]">
                    {exec.id.slice(0, 12)}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#F0F0F0]">{exec.workflowName}</td>
                  <td className="px-4 py-3 text-[12px] text-[#888888]">
                    {formatRelativeTime(exec.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#888888]">
                    {formatDuration(exec.durationMs)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={exec.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-[12px] text-[#888888]">
                    ${exec.costUsd.toFixed(2)}
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

// ---------------------------------------------------------------------------
// Memory Tab
// ---------------------------------------------------------------------------

function MemoryTab() {
  // TODO: Replace with real Convex query
  const memories: MemoryEntry[] = [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative max-w-xs flex-1">
          <input
            type="text"
            placeholder="Search memories..."
            className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] py-2 pl-3 pr-3 text-[13px] text-[#F0F0F0] placeholder-[#555555] outline-none focus:border-[#3A3A3A]"
          />
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#161616] px-3 py-2 text-[13px] text-[#888888] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]">
          + Add Memory
        </button>
      </div>

      {memories.length === 0 ? (
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] px-6 py-12 text-center">
          <Brain size={24} className="mx-auto text-[#555555]" />
          <p className="mt-2 text-[12px] text-[#555555]">
            No memories yet. The operator will learn from its executions over time.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((mem) => (
            <div key={mem.key} className="rounded-[14px] border border-[#222222] bg-[#161616] p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] font-medium text-[#F0F0F0]">{mem.key}</span>
                <span className="rounded-[6px] bg-[rgba(160,160,160,0.08)] px-2 py-0.5 text-[11px] font-medium text-[#A0A0A0]">
                  {mem.source}
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#888888]">{mem.value}</p>
              <div className="mt-2 text-[11px] text-[#555555]">
                Updated {formatRelativeTime(mem.updatedAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

function SettingsTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Configuration</div>
        <p className="mt-1 text-[12px] text-[#555555]">
          Operator settings will be configurable here once connected to the backend.
        </p>
      </div>

      {/* Danger Zone */}
      <div className="rounded-[14px] border border-[#EF4444]/20 bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#EF4444]">Danger Zone</div>
        <p className="mt-1 text-[12px] text-[#888888]">
          Permanently delete this operator and all its data.
        </p>
        <button className="mt-4 rounded-[6px] border border-[#EF4444]/30 px-3 py-2 text-[13px] font-medium text-[#EF4444] transition-colors hover:bg-[#EF4444]/10">
          Delete Operator
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
    completed: { bg: "bg-[rgba(34,197,94,0.1)]", text: "text-[#22C55E]", icon: CheckCircle },
    failed: { bg: "bg-[rgba(239,68,68,0.12)]", text: "text-[#EF4444]", icon: XCircle },
    running: { bg: "bg-[rgba(59,130,246,0.12)]", text: "text-[#3B82F6]", icon: Lightning },
    cancelled: { bg: "bg-[rgba(160,160,160,0.08)]", text: "text-[#A0A0A0]", icon: XCircle },
  };

  const style = styles[status] ?? styles.cancelled;
  const Icon = style.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[12px] font-medium ${style.bg} ${style.text}`}
    >
      <Icon size={12} />
      <span className="capitalize">{status}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers (imported from @/lib/format)
// ---------------------------------------------------------------------------
