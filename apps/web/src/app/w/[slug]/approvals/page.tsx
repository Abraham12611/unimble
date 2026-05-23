"use client";

/**
 * Approvals Dashboard
 *
 * Displays pending and historical approval requests across all operators.
 * Supports filtering by status and operator, bulk actions, and links
 * to a detail modal for each approval.
 *
 * Phase 9.6.1 — Approvals Dashboard
 */

import { useState, useMemo } from "react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { formatRelativeTime } from "@/lib/format";
import {
  ThumbsUp,
  ThumbsDown,
  Clock,
  MagnifyingGlass,
  Funnel,
  CheckCircle,
  XCircle,
  Eye,
  Robot,
  Warning,
  Info,
} from "@phosphor-icons/react";
import { Badge, Button } from "@/components/ui";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

interface ApprovalItem {
  id: string;
  operatorName: string;
  operatorId: string;
  workflowName: string;
  stepName: string;
  content: string;
  status: ApprovalStatus;
  requestedAt: number;
  expiresAt: number | null;
  respondedAt: number | null;
  respondedBy: string | null;
  feedback: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  ApprovalStatus,
  { badge: "warning" | "positive" | "negative" | "neutral"; icon: typeof Clock; label: string }
> = {
  pending: { badge: "warning", icon: Clock, label: "Pending" },
  approved: { badge: "positive", icon: CheckCircle, label: "Approved" },
  rejected: { badge: "negative", icon: XCircle, label: "Rejected" },
  expired: { badge: "neutral", icon: Clock, label: "Expired" },
};

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_APPROVALS: ApprovalItem[] = [
  {
    id: "appr_001",
    operatorName: "Content Operator",
    operatorId: "op_content_1",
    workflowName: "Weekly Blog Pipeline",
    stepName: "Publish to CMS",
    content:
      'Article "Building AI Agents in 2024" is ready for publishing to WordPress. 1,487 words, SEO score 85/100.',
    status: "pending",
    requestedAt: 1716200200000,
    expiresAt: 1716286600000,
    respondedAt: null,
    respondedBy: null,
    feedback: null,
  },
  {
    id: "appr_002",
    operatorName: "Growth Operator",
    operatorId: "op_growth_1",
    workflowName: "A/B Test Analysis",
    stepName: "Apply pricing change",
    content:
      "Recommended pricing adjustment: increase Pro plan from $29/mo to $39/mo based on A/B test results showing 12% higher conversion at the new price point.",
    status: "pending",
    requestedAt: 1716195000000,
    expiresAt: 1716281400000,
    respondedAt: null,
    respondedBy: null,
    feedback: null,
  },
  {
    id: "appr_003",
    operatorName: "Community Operator",
    operatorId: "op_community_1",
    workflowName: "Discord Engagement",
    stepName: "Send announcement",
    content:
      "Draft announcement for #general: new SDK v2.0 release with breaking changes. Includes migration guide link and support channel mention.",
    status: "pending",
    requestedAt: 1716190000000,
    expiresAt: 1716276400000,
    respondedAt: null,
    respondedBy: null,
    feedback: null,
  },
  {
    id: "appr_004",
    operatorName: "Content Operator",
    operatorId: "op_content_1",
    workflowName: "Social Post Generation",
    stepName: "Publish tweets",
    content:
      "Generated 3 tweets promoting the latest blog post. Thread format with images attached.",
    status: "approved",
    requestedAt: 1716180000000,
    expiresAt: null,
    respondedAt: 1716180600000,
    respondedBy: "Abraham Dahunsi",
    feedback: "Looks great, ship it!",
  },
  {
    id: "appr_005",
    operatorName: "Feedback Operator",
    operatorId: "op_feedback_1",
    workflowName: "Issue Triage",
    stepName: "Close stale issues",
    content:
      "Batch close 12 stale GitHub issues that have had no activity for 90+ days. Comment added explaining closure reason.",
    status: "rejected",
    requestedAt: 1716175000000,
    expiresAt: null,
    respondedAt: 1716176000000,
    respondedBy: "Abraham Dahunsi",
    feedback: "Some of these issues are still valid. Please review individually.",
  },
  {
    id: "appr_006",
    operatorName: "Documentation Operator",
    operatorId: "op_docs_1",
    workflowName: "API Docs Update",
    stepName: "Publish docs changes",
    content: "Updated 8 API endpoint docs with new request/response schemas for v2.0.",
    status: "approved",
    requestedAt: 1716170000000,
    expiresAt: null,
    respondedAt: 1716171200000,
    respondedBy: "Abraham Dahunsi",
    feedback: null,
  },
  {
    id: "appr_007",
    operatorName: "Growth Operator",
    operatorId: "op_growth_1",
    workflowName: "SEO Audit",
    stepName: "Apply meta tag changes",
    content: "Update meta descriptions on 15 landing pages based on SEO audit recommendations.",
    status: "expired",
    requestedAt: 1716150000000,
    expiresAt: 1716236400000,
    respondedAt: null,
    respondedBy: null,
    feedback: null,
  },
];

// Unique operators for filter dropdown
const OPERATOR_OPTIONS = Array.from(
  new Map(MOCK_APPROVALS.map((a) => [a.operatorId, a.operatorName])).entries()
).map(([id, name]) => ({ id, name }));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApprovalsPage() {
  const { slug, isLoading, workspace } = useWorkspaceContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

  // TODO: Replace with real Convex query
  const approvals = MOCK_APPROVALS;

  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === "pending"),
    [approvals]
  );

  const historyApprovals = useMemo(
    () => approvals.filter((a) => a.status !== "pending"),
    [approvals]
  );

  function filterList(list: ApprovalItem[]) {
    return list.filter((a) => {
      if (operatorFilter !== "all" && a.operatorId !== operatorFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !a.id.toLowerCase().includes(q) &&
          !a.operatorName.toLowerCase().includes(q) &&
          !a.workflowName.toLowerCase().includes(q) &&
          !a.content.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }

  const filteredPending = filterList(pendingApprovals);
  const filteredHistory = filterList(historyApprovals);

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll(list: ApprovalItem[]) {
    const allSelected = list.every((a) => selectedIds.has(a.id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        list.forEach((a) => next.delete(a.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        list.forEach((a) => next.add(a.id));
        return next;
      });
    }
  }

  function handleBulkAction(action: "approve" | "reject") {
    // TODO: Wire to Convex mutation
    setBulkNotice(action === "approve" ? "Bulk approve" : "Bulk reject");
    setSelectedIds(new Set());
  }

  // Guard: loading state
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
            Approvals
          </h1>
          <p className="mt-1 flex items-center gap-3 text-[12px] text-[var(--text-secondary)]">
            <span>{approvals.length} total</span>
            {pendingApprovals.length > 0 && (
              <span className="flex items-center gap-1 text-[var(--semantic-warning-fg)]">
                <Clock size={12} weight="fill" />
                {pendingApprovals.length} pending
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
            placeholder="Search approvals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] py-2 pl-9 pr-3 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--border-focus)]"
          />
        </div>

        {/* Operator Filter */}
        <div className="flex items-center gap-1.5">
          <Funnel size={14} className="text-[var(--text-muted)]" />
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
      </div>

      {/* Bulk notice */}
      {bulkNotice && (
        <div className="flex items-center gap-2 rounded-[8px] bg-[var(--semantic-info-bg)] px-4 py-3">
          <Info size={16} className="shrink-0 text-[var(--semantic-info-fg)]" />
          <span className="text-[13px] text-[var(--semantic-info-fg)]">
            {bulkNotice} is not yet connected to the backend. This feature is coming soon.
          </span>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {pendingApprovals.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--semantic-warning-bg)] px-1.5 text-[11px] font-medium text-[var(--semantic-warning-fg)]">
                {pendingApprovals.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending">
          {filteredPending.length === 0 ? (
            <EmptyState
              type="pending"
              hasFilters={searchQuery !== "" || operatorFilter !== "all"}
            />
          ) : (
            <div className="space-y-3">
              {/* Bulk actions bar */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                  <input
                    type="checkbox"
                    checked={filteredPending.every((a) => selectedIds.has(a.id))}
                    onChange={() => toggleSelectAll(filteredPending)}
                    className="rounded-sm"
                  />
                  Select all ({filteredPending.length})
                </label>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[var(--text-muted)]">
                      {selectedIds.size} selected
                    </span>
                    <Button size="sm" variant="primary" onClick={() => handleBulkAction("approve")}>
                      <ThumbsUp size={12} />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleBulkAction("reject")}
                    >
                      <ThumbsDown size={12} />
                      Reject
                    </Button>
                  </div>
                )}
              </div>

              {/* Cards */}
              {filteredPending.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  selected={selectedIds.has(approval.id)}
                  onToggle={() => toggleSelection(approval.id)}
                  slug={slug}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          {filteredHistory.length === 0 ? (
            <EmptyState
              type="history"
              hasFilters={searchQuery !== "" || operatorFilter !== "all"}
            />
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  selected={false}
                  onToggle={() => {}}
                  slug={slug}
                  showResponse
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approval Card
// ---------------------------------------------------------------------------

function ApprovalCard({
  approval,
  selected,
  onToggle,
  slug,
  showResponse = false,
}: {
  approval: ApprovalItem;
  selected: boolean;
  onToggle: () => void;
  slug: string;
  showResponse?: boolean;
}) {
  const cfg = STATUS_CONFIG[approval.status];
  const StatusIcon = cfg.icon;
  const isPending = approval.status === "pending";

  return (
    <div
      className={`rounded-[14px] border bg-[var(--bg-card)] p-5 transition-colors ${
        selected ? "border-[var(--semantic-info-fg)]" : "border-[var(--border-subtle)]"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Selection checkbox (pending only) */}
        {isPending && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="mt-1 shrink-0 rounded-sm"
          />
        )}

        <div className="flex-1 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Robot size={14} className="text-[var(--text-muted)]" />
                <span className="text-[13px] font-medium text-[var(--text-primary)]">
                  {approval.operatorName}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">•</span>
                <span className="text-[12px] text-[var(--text-secondary)]">
                  {approval.workflowName}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <span>Step: {approval.stepName}</span>
                <span>•</span>
                <span className="font-mono">{approval.id}</span>
              </div>
            </div>
            <Badge variant={cfg.badge}>
              <StatusIcon size={12} />
              {cfg.label}
            </Badge>
          </div>

          {/* Content preview */}
          <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {approval.content}
          </p>

          {/* Timestamps */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span>Requested {formatRelativeTime(approval.requestedAt)}</span>
            {isPending && approval.expiresAt && <ExpiresCountdown expiresAt={approval.expiresAt} />}
            {showResponse && approval.respondedAt && (
              <>
                <span>•</span>
                <span>
                  {approval.status === "approved" ? "Approved" : "Rejected"}{" "}
                  {formatRelativeTime(approval.respondedAt)}
                  {approval.respondedBy ? ` by ${approval.respondedBy}` : ""}
                </span>
              </>
            )}
          </div>

          {/* Response feedback (history) */}
          {showResponse && approval.feedback && (
            <div className="flex items-start gap-2 rounded-[8px] bg-[var(--bg-input)] px-3 py-2.5">
              <Info size={14} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
              <span className="text-[12px] text-[var(--text-secondary)]">{approval.feedback}</span>
            </div>
          )}

          {/* Quick actions for pending */}
          {isPending && (
            <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
              <a
                href={`/w/${slug}/approvals/${approval.id}`}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]"
              >
                <Eye size={12} />
                Review
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expires Countdown
// ---------------------------------------------------------------------------

function ExpiresCountdown({ expiresAt }: { expiresAt: number }) {
  const now = Date.now();
  const remaining = expiresAt - now;

  if (remaining <= 0) {
    return (
      <span className="flex items-center gap-1 text-[var(--semantic-negative-fg)]">
        <Warning size={11} />
        Expired
      </span>
    );
  }

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  const isUrgent = hours < 4;

  return (
    <span
      className={`flex items-center gap-1 ${
        isUrgent ? "text-[var(--semantic-warning-fg)]" : "text-[var(--text-muted)]"
      }`}
    >
      <Clock size={11} />
      Expires in {hours > 0 ? `${hours}h ` : ""}
      {minutes}m
    </span>
  );
}

// ---------------------------------------------------------------------------
// Empty States
// ---------------------------------------------------------------------------

function EmptyState({ type, hasFilters }: { type: "pending" | "history"; hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-12 text-center">
        <MagnifyingGlass size={24} className="text-[var(--text-muted)]" />
        <h2 className="mt-3 text-[15px] font-medium text-[var(--text-primary)]">
          No matching approvals
        </h2>
        <p className="mt-1.5 max-w-sm text-[12px] text-[var(--text-muted)]">
          Try adjusting your search or filters.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-input)]">
        {type === "pending" ? (
          <ThumbsUp size={28} className="text-[var(--text-muted)]" />
        ) : (
          <Clock size={28} className="text-[var(--text-muted)]" />
        )}
      </div>
      <h2 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">
        {type === "pending" ? "No pending approvals" : "No approval history"}
      </h2>
      <p className="mt-1.5 max-w-sm text-[12px] text-[var(--text-muted)]">
        {type === "pending"
          ? "All caught up! Approvals will appear here when operators need your input."
          : "Your approval history will appear here once you respond to requests."}
      </p>
    </div>
  );
}
