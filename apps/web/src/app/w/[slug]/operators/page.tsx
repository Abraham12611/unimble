"use client";

/**
 * Operators List Page
 *
 * Displays all deployed operators with status, metrics, and quick actions.
 * Supports grid/list view toggle and filtering by status/type.
 *
 * Phase 8.7.1 — Operator List Page
 */

import { useState } from "react";
import Link from "next/link";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { formatRelativeTime } from "@/lib/format";
import {
  Robot,
  Plus,
  Pause,
  Play,
  Gear,
  DotsThree,
  SquaresFour,
  List,
  MagnifyingGlass,
} from "@phosphor-icons/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OperatorStatus = "active" | "paused" | "error";
type OperatorType = "content" | "growth" | "community" | "feedback" | "documentation" | "custom";
type ViewMode = "grid" | "list";

interface OperatorSummary {
  id: string;
  name: string;
  type: OperatorType;
  status: OperatorStatus;
  lastRunAt?: number;
  lastRunStatus?: "success" | "failed";
  nextRunAt?: number;
  executionsThisWeek: number;
  successRate: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<OperatorStatus, { dot: string; text: string }> = {
  active: { dot: "bg-[var(--semantic-positive-fg)]", text: "text-[var(--semantic-positive-fg)]" },
  paused: { dot: "bg-[var(--semantic-warning-fg)]", text: "text-[var(--semantic-warning-fg)]" },
  error: { dot: "bg-[var(--semantic-negative-fg)]", text: "text-[var(--semantic-negative-fg)]" },
};

const TYPE_LABELS: Record<OperatorType, string> = {
  content: "Content",
  growth: "Growth",
  community: "Community",
  feedback: "Feedback",
  documentation: "Docs",
  custom: "Custom",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OperatorsListPage() {
  const { slug: rawSlug } = useWorkspaceContext();
  const slug = rawSlug ?? "";
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [statusFilter, setStatusFilter] = useState<OperatorStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<OperatorType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // TODO: Replace with real Convex query
  // Static timestamps to avoid impure Date.now() during render
  const operators: OperatorSummary[] = [
    {
      id: "op_content_1",
      name: "Content Operator",
      type: "content",
      status: "active",
      lastRunAt: 1716200000000,
      lastRunStatus: "success",
      nextRunAt: 1716300000000,
      executionsThisWeek: 47,
      successRate: 96,
    },
    {
      id: "op_growth_1",
      name: "Growth Operator",
      type: "growth",
      status: "active",
      lastRunAt: 1716190000000,
      lastRunStatus: "success",
      nextRunAt: 1716220000000,
      executionsThisWeek: 32,
      successRate: 91,
    },
    {
      id: "op_community_1",
      name: "Community Operator",
      type: "community",
      status: "paused",
      lastRunAt: 1716100000000,
      lastRunStatus: "success",
      executionsThisWeek: 18,
      successRate: 100,
    },
    {
      id: "op_feedback_1",
      name: "Feedback Operator",
      type: "feedback",
      status: "active",
      lastRunAt: 1716150000000,
      lastRunStatus: "success",
      nextRunAt: 1716350000000,
      executionsThisWeek: 24,
      successRate: 88,
    },
    {
      id: "op_docs_1",
      name: "Documentation Operator",
      type: "documentation",
      status: "error",
      lastRunAt: 1716195000000,
      lastRunStatus: "failed",
      executionsThisWeek: 6,
      successRate: 67,
    },
  ];

  const filteredOperators = operators.filter((op) => {
    if (statusFilter !== "all" && op.status !== statusFilter) return false;
    if (typeFilter !== "all" && op.type !== typeFilter) return false;
    if (searchQuery && !op.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-medium leading-snug text-[var(--text-primary)]">
            Operators
          </h1>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            {operators.length} operator{operators.length !== 1 ? "s" : ""} deployed
          </p>
        </div>
        <Link
          href={`/w/${slug}/operators/deploy`}
          className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-card)] px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]"
        >
          <Plus size={14} />
          Deploy Operator
        </Link>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlass
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            placeholder="Search operators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] py-2 pl-9 pr-3 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--border-focus)]"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OperatorStatus | "all")}
          className="rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="error">Error</option>
        </select>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as OperatorType | "all")}
          className="rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
        >
          <option value="all">All Types</option>
          <option value="content">Content</option>
          <option value="growth">Growth</option>
          <option value="community">Community</option>
          <option value="feedback">Feedback</option>
          <option value="documentation">Docs</option>
          <option value="custom">Custom</option>
        </select>

        {/* View Toggle */}
        <div className="flex items-center rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)]">
          <button
            onClick={() => setViewMode("grid")}
            className={`flex h-8 w-8 items-center justify-center rounded-l-[5px] transition-colors ${
              viewMode === "grid"
                ? "bg-[var(--bg-card-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
            title="Grid view"
          >
            <SquaresFour size={14} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex h-8 w-8 items-center justify-center rounded-r-[5px] transition-colors ${
              viewMode === "list"
                ? "bg-[var(--bg-card-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
            title="List view"
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {operators.length === 0 ? (
        <EmptyState slug={slug} />
      ) : filteredOperators.length === 0 ? (
        <NoResultsState />
      ) : viewMode === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOperators.map((op) => (
            <OperatorCard key={op.id} operator={op} slug={slug} />
          ))}
        </div>
      ) : (
        <OperatorTable operators={filteredOperators} slug={slug} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OperatorCard({ operator, slug }: { operator: OperatorSummary; slug: string }) {
  const statusColor = STATUS_COLORS[operator.status];

  return (
    <Link
      href={`/w/${slug}/operators/${operator.id}`}
      className="group rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 transition-colors hover:bg-[var(--bg-card-hover)]"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-input)]">
          <Robot size={18} className="text-[var(--text-secondary)]" />
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-secondary)] group-hover:opacity-100"
        >
          <DotsThree size={16} weight="bold" />
        </button>
      </div>

      {/* Name & Status */}
      <div className="mt-3">
        <div className="text-[15px] font-medium text-[var(--text-primary)]">{operator.name}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${statusColor.dot}`} />
          <span className={`text-[12px] capitalize ${statusColor.text}`}>{operator.status}</span>
        </div>
      </div>

      {/* Meta */}
      <div className="mt-4 space-y-1.5 border-t border-[var(--border-subtle)] pt-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[var(--text-muted)]">Type</span>
          <span className="text-[var(--text-secondary)]">{TYPE_LABELS[operator.type]}</span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[var(--text-muted)]">Last run</span>
          <span className="text-[var(--text-secondary)]">
            {operator.lastRunAt ? formatRelativeTime(operator.lastRunAt) : "Never"}
          </span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[var(--text-muted)]">Executions (7d)</span>
          <span className="text-[var(--text-secondary)]">{operator.executionsThisWeek}</span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[var(--text-muted)]">Success rate</span>
          <span className="text-[var(--text-secondary)]">{operator.successRate}%</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-default)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
        >
          <Play size={12} /> Run
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-default)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
        >
          <Pause size={12} /> Pause
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-default)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
        >
          <Gear size={12} />
        </button>
      </div>
    </Link>
  );
}

function OperatorTable({ operators, slug }: { operators: OperatorSummary[]; slug: string }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Name
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Type
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Status
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Last Run
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Executions
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Success
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {operators.map((op) => {
            const statusColor = STATUS_COLORS[op.status];
            return (
              <tr
                key={op.id}
                className="border-b border-[var(--border-subtle)] last:border-0 transition-colors hover:bg-[var(--bg-card-hover)]"
              >
                <td className="px-4 py-3">
                  <Link href={`/w/${slug}/operators/${op.id}`} className="flex items-center gap-2">
                    <Robot size={16} className="text-[var(--text-secondary)]" />
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">
                      {op.name}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                  {TYPE_LABELS[op.type]}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusColor.dot}`} />
                    <span className={`text-[12px] capitalize ${statusColor.text}`}>
                      {op.status}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                  {op.lastRunAt ? formatRelativeTime(op.lastRunAt) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-[12px] text-[var(--text-secondary)]">
                  {op.executionsThisWeek}
                </td>
                <td className="px-4 py-3 text-right text-[12px] text-[var(--text-secondary)]">
                  {op.successRate}%
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-secondary)]">
                      <Play size={14} />
                    </button>
                    <button className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-secondary)]">
                      <Pause size={14} />
                    </button>
                    <button className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-secondary)]">
                      <Gear size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-input)]">
        <Robot size={28} className="text-[var(--text-muted)]" />
      </div>
      <h2 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">No operators yet</h2>
      <p className="mt-1.5 max-w-sm text-[12px] text-[var(--text-muted)]">
        Deploy your first AI operator to automate content, growth, community, or feedback.
      </p>
      <Link
        href={`/w/${slug}/operators/deploy`}
        className="mt-5 inline-flex items-center gap-2 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-card)] px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]"
      >
        <Plus size={14} />
        Deploy Operator
      </Link>
    </div>
  );
}

function NoResultsState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-12 text-center">
      <MagnifyingGlass size={24} className="text-[var(--text-muted)]" />
      <h2 className="mt-3 text-[15px] font-medium text-[var(--text-primary)]">
        No matching operators
      </h2>
      <p className="mt-1.5 max-w-sm text-[12px] text-[var(--text-muted)]">
        Try adjusting your search or filters to find what you&apos;re looking for.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (imported from shared lib)
// ---------------------------------------------------------------------------
