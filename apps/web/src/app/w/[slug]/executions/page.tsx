"use client";

/**
 * Executions List Page
 *
 * Displays all workflow executions across operators with status, duration,
 * and cost. Supports filtering by status and operator, plus search.
 *
 * Phase 9.5.1 — Executions List
 */

import { useState } from "react";
import Link from "next/link";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { formatRelativeTime, formatDuration } from "@/lib/format";
import {
  Play,
  MagnifyingGlass,
  Lightning,
  CheckCircle,
  XCircle,
  Funnel,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExecutionStatus = "running" | "completed" | "failed" | "cancelled";

interface ExecutionRow {
  id: string;
  operatorName: string;
  operatorId: string;
  workflowName: string;
  startedAt: number;
  durationMs: number;
  status: ExecutionStatus;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  ExecutionStatus,
  {
    badge: "info" | "positive" | "negative" | "neutral" | "warning";
    icon: typeof CheckCircle;
    label: string;
  }
> = {
  running: { badge: "info", icon: Lightning, label: "Running" },
  completed: { badge: "positive", icon: CheckCircle, label: "Completed" },
  failed: { badge: "negative", icon: XCircle, label: "Failed" },
  cancelled: { badge: "neutral", icon: XCircle, label: "Cancelled" },
};

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

// Static timestamps to avoid impure Date.now() during render
const MOCK_EXECUTIONS: ExecutionRow[] = [
  {
    id: "exec_001",
    operatorName: "Content Operator",
    operatorId: "op_content_1",
    workflowName: "Weekly Blog Pipeline",
    startedAt: 1716200000000,
    durationMs: 272000,
    status: "completed",
    costUsd: 0.42,
  },
  {
    id: "exec_002",
    operatorName: "Growth Operator",
    operatorId: "op_growth_1",
    workflowName: "A/B Test Analysis",
    startedAt: 1716195000000,
    durationMs: 185000,
    status: "completed",
    costUsd: 0.31,
  },
  {
    id: "exec_003",
    operatorName: "Content Operator",
    operatorId: "op_content_1",
    workflowName: "Social Post Generation",
    startedAt: 1716192000000,
    durationMs: 0,
    status: "running",
    costUsd: 0.08,
  },
  {
    id: "exec_004",
    operatorName: "Feedback Operator",
    operatorId: "op_feedback_1",
    workflowName: "Issue Triage",
    startedAt: 1716190000000,
    durationMs: 45000,
    status: "failed",
    costUsd: 0.12,
  },
  {
    id: "exec_005",
    operatorName: "Community Operator",
    operatorId: "op_community_1",
    workflowName: "Discord Engagement",
    startedAt: 1716185000000,
    durationMs: 320000,
    status: "completed",
    costUsd: 0.55,
  },
  {
    id: "exec_006",
    operatorName: "Documentation Operator",
    operatorId: "op_docs_1",
    workflowName: "API Docs Update",
    startedAt: 1716180000000,
    durationMs: 150000,
    status: "cancelled",
    costUsd: 0.18,
  },
  {
    id: "exec_007",
    operatorName: "Growth Operator",
    operatorId: "op_growth_1",
    workflowName: "SEO Audit",
    startedAt: 1716175000000,
    durationMs: 420000,
    status: "completed",
    costUsd: 0.67,
  },
  {
    id: "exec_008",
    operatorName: "Content Operator",
    operatorId: "op_content_1",
    workflowName: "Weekly Blog Pipeline",
    startedAt: 1716170000000,
    durationMs: 95000,
    status: "failed",
    costUsd: 0.14,
  },
];

// Unique operators for filter dropdown
const OPERATOR_OPTIONS = Array.from(
  new Map(MOCK_EXECUTIONS.map((e) => [e.operatorId, e.operatorName])).entries()
).map(([id, name]) => ({ id, name }));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExecutionsListPage() {
  const { slug, isLoading, workspace } = useWorkspaceContext();

  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | "all">("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // TODO: Replace with real Convex query
  const executions = MOCK_EXECUTIONS;

  const filteredExecutions = executions.filter((exec) => {
    if (statusFilter !== "all" && exec.status !== statusFilter) return false;
    if (operatorFilter !== "all" && exec.operatorId !== operatorFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !exec.id.toLowerCase().includes(q) &&
        !exec.operatorName.toLowerCase().includes(q) &&
        !exec.workflowName.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const runningCount = executions.filter((e) => e.status === "running").length;
  const failedCount = executions.filter((e) => e.status === "failed").length;

  // Guard: loading state until workspace resolves
  if (isLoading || !workspace || !slug) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-[13px] text-[var(--text-muted)]">Loading workspace…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-medium leading-snug text-[var(--text-primary)]">
            Executions
          </h1>
          <p className="mt-1 flex items-center gap-3 text-[12px] text-[var(--text-secondary)]">
            <span>{executions.length} total</span>
            {runningCount > 0 && (
              <span className="flex items-center gap-1 text-[var(--semantic-info-fg)]">
                <Lightning size={12} weight="fill" />
                {runningCount} running
              </span>
            )}
            {failedCount > 0 && (
              <span className="flex items-center gap-1 text-[var(--semantic-negative-fg)]">
                <XCircle size={12} />
                {failedCount} failed
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative max-w-xs flex-1">
          <MagnifyingGlass
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            placeholder="Search by ID, operator, or workflow..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] py-2 pl-9 pr-3 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--border-focus)]"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          <Funnel size={14} className="text-[var(--text-muted)]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ExecutionStatus | "all")}
            className="rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
          >
            <option value="all">All Status</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Operator Filter */}
        <select
          value={operatorFilter}
          onChange={(e) => setOperatorFilter(e.target.value)}
          className="rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
        >
          <option value="all">All Operators</option>
          {OPERATOR_OPTIONS.map((op) => (
            <option key={op.id} value={op.id}>
              {op.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {executions.length === 0 ? (
        <EmptyState />
      ) : filteredExecutions.length === 0 ? (
        <NoResultsState />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    Operator
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    Workflow
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    Started
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredExecutions.map((exec) => {
                  const cfg = STATUS_CONFIG[exec.status];
                  const Icon = cfg.icon;
                  return (
                    <tr
                      key={exec.id}
                      className="border-b border-[var(--border-subtle)] last:border-0 transition-colors hover:bg-[var(--bg-card-hover)]"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/w/${slug}/executions/${exec.id}`}
                          className="font-mono text-[12px] text-[var(--semantic-info-fg)] hover:underline"
                        >
                          {exec.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-primary)]">
                        {exec.operatorName}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                        {exec.workflowName}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                        {formatRelativeTime(exec.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                        {exec.status === "running" ? (
                          <span className="flex items-center gap-1 text-[var(--semantic-info-fg)]">
                            <Lightning size={12} weight="fill" className="animate-pulse" />
                            In progress
                          </span>
                        ) : (
                          formatDuration(exec.durationMs)
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={cfg.badge}>
                          <Icon size={12} />
                          {cfg.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[12px] text-[var(--text-secondary)]">
                        ${exec.costUsd.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary row */}
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-3">
            <span className="text-[12px] text-[var(--text-muted)]">
              {filteredExecutions.length} execution{filteredExecutions.length !== 1 ? "s" : ""}
              {statusFilter !== "all" || operatorFilter !== "all" || searchQuery
                ? " (filtered)"
                : ""}
            </span>
            <span className="font-mono text-[12px] text-[var(--text-secondary)]">
              Total: ${filteredExecutions.reduce((sum, e) => sum + e.costUsd, 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-input)]">
        <Play size={28} className="text-[var(--text-muted)]" />
      </div>
      <h2 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">No executions yet</h2>
      <p className="mt-1.5 max-w-sm text-[12px] text-[var(--text-muted)]">
        Run an operator to see execution history here.
      </p>
    </div>
  );
}

function NoResultsState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-12 text-center">
      <MagnifyingGlass size={24} className="text-[var(--text-muted)]" />
      <h2 className="mt-3 text-[15px] font-medium text-[var(--text-primary)]">
        No matching executions
      </h2>
      <p className="mt-1.5 max-w-sm text-[12px] text-[var(--text-muted)]">
        Try adjusting your search or filters to find what you&apos;re looking for.
      </p>
    </div>
  );
}
