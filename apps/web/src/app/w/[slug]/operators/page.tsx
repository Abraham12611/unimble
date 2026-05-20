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
  active: { dot: "bg-[#22C55E]", text: "text-[#22C55E]" },
  paused: { dot: "bg-[#F59E0B]", text: "text-[#F59E0B]" },
  error: { dot: "bg-[#EF4444]", text: "text-[#EF4444]" },
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
  const operators: OperatorSummary[] = [];

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
          <h1 className="text-[18px] font-medium leading-snug text-[#F0F0F0]">Operators</h1>
          <p className="mt-1 text-[12px] text-[#888888]">
            {operators.length} operator{operators.length !== 1 ? "s" : ""} deployed
          </p>
        </div>
        <Link
          href={`/w/${slug}/operators/deploy`}
          className="inline-flex items-center gap-2 rounded-[6px] border border-[#2A2A2A] bg-[#161616] px-4 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#1C1C1C]"
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
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]"
          />
          <input
            type="text"
            placeholder="Search operators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] py-2 pl-9 pr-3 text-[13px] text-[#F0F0F0] placeholder-[#555555] outline-none focus:border-[#3A3A3A]"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OperatorStatus | "all")}
          className="rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
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
          className="rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
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
        <div className="flex items-center rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A]">
          <button
            onClick={() => setViewMode("grid")}
            className={`flex h-8 w-8 items-center justify-center rounded-l-[5px] transition-colors ${
              viewMode === "grid"
                ? "bg-[#1C1C1C] text-[#F0F0F0]"
                : "text-[#555555] hover:text-[#888888]"
            }`}
            title="Grid view"
          >
            <SquaresFour size={14} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex h-8 w-8 items-center justify-center rounded-r-[5px] transition-colors ${
              viewMode === "list"
                ? "bg-[#1C1C1C] text-[#F0F0F0]"
                : "text-[#555555] hover:text-[#888888]"
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
      className="group rounded-[14px] border border-[#222222] bg-[#161616] p-5 transition-colors hover:bg-[#1C1C1C]"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A]">
          <Robot size={18} className="text-[#888888]" />
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] opacity-0 transition-opacity hover:bg-[#1C1C1C] hover:text-[#888888] group-hover:opacity-100"
        >
          <DotsThree size={16} weight="bold" />
        </button>
      </div>

      {/* Name & Status */}
      <div className="mt-3">
        <div className="text-[15px] font-medium text-[#F0F0F0]">{operator.name}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${statusColor.dot}`} />
          <span className={`text-[12px] capitalize ${statusColor.text}`}>{operator.status}</span>
        </div>
      </div>

      {/* Meta */}
      <div className="mt-4 space-y-1.5 border-t border-[#222222] pt-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[#555555]">Type</span>
          <span className="text-[#888888]">{TYPE_LABELS[operator.type]}</span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[#555555]">Last run</span>
          <span className="text-[#888888]">
            {operator.lastRunAt ? formatRelativeTime(operator.lastRunAt) : "Never"}
          </span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[#555555]">Executions (7d)</span>
          <span className="text-[#888888]">{operator.executionsThisWeek}</span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[#555555]">Success rate</span>
          <span className="text-[#888888]">{operator.successRate}%</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-[#222222] pt-3">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="inline-flex items-center gap-1 rounded-[6px] border border-[#2A2A2A] px-2.5 py-1.5 text-[12px] text-[#888888] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
        >
          <Play size={12} /> Run
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="inline-flex items-center gap-1 rounded-[6px] border border-[#2A2A2A] px-2.5 py-1.5 text-[12px] text-[#888888] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
        >
          <Pause size={12} /> Pause
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-[6px] border border-[#2A2A2A] px-2.5 py-1.5 text-[12px] text-[#888888] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
        >
          <Gear size={12} />
        </button>
      </div>
    </Link>
  );
}

function OperatorTable({ operators, slug }: { operators: OperatorSummary[]; slug: string }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#222222] bg-[#161616]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#222222]">
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
              Name
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
              Type
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
              Status
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
              Last Run
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
              Executions
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
              Success
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
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
                className="border-b border-[#222222] last:border-0 transition-colors hover:bg-[#1C1C1C]"
              >
                <td className="px-4 py-3">
                  <Link href={`/w/${slug}/operators/${op.id}`} className="flex items-center gap-2">
                    <Robot size={16} className="text-[#888888]" />
                    <span className="text-[13px] font-medium text-[#F0F0F0]">{op.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-[12px] text-[#888888]">{TYPE_LABELS[op.type]}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusColor.dot}`} />
                    <span className={`text-[12px] capitalize ${statusColor.text}`}>
                      {op.status}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-[12px] text-[#888888]">
                  {op.lastRunAt ? formatRelativeTime(op.lastRunAt) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-[12px] text-[#888888]">
                  {op.executionsThisWeek}
                </td>
                <td className="px-4 py-3 text-right text-[12px] text-[#888888]">
                  {op.successRate}%
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] hover:bg-[#222222] hover:text-[#888888]">
                      <Play size={14} />
                    </button>
                    <button className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] hover:bg-[#222222] hover:text-[#888888]">
                      <Pause size={14} />
                    </button>
                    <button className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] hover:bg-[#222222] hover:text-[#888888]">
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
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-[#222222] bg-[#161616] px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-[#2A2A2A] bg-[#1A1A1A]">
        <Robot size={28} className="text-[#555555]" />
      </div>
      <h2 className="mt-4 text-[15px] font-medium text-[#F0F0F0]">No operators yet</h2>
      <p className="mt-1.5 max-w-sm text-[12px] text-[#555555]">
        Deploy your first AI operator to automate content, growth, community, or feedback.
      </p>
      <Link
        href={`/w/${slug}/operators/deploy`}
        className="mt-5 inline-flex items-center gap-2 rounded-[6px] border border-[#2A2A2A] bg-[#161616] px-4 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#1C1C1C]"
      >
        <Plus size={14} />
        Deploy Operator
      </Link>
    </div>
  );
}

function NoResultsState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-[#222222] bg-[#161616] px-6 py-12 text-center">
      <MagnifyingGlass size={24} className="text-[#555555]" />
      <h2 className="mt-3 text-[15px] font-medium text-[#F0F0F0]">No matching operators</h2>
      <p className="mt-1.5 max-w-sm text-[12px] text-[#555555]">
        Try adjusting your search or filters to find what you&apos;re looking for.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (imported from shared lib)
// ---------------------------------------------------------------------------
