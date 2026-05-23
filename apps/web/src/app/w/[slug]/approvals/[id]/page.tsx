"use client";

/**
 * Approval Detail Page
 *
 * Full-screen view for reviewing a single approval request.
 * Shows complete content, context (operator, workflow, step),
 * approve / reject buttons with optional feedback, and audit trail.
 *
 * Phase 9.6.2 — Approval Detail
 */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { formatRelativeTime } from "@/lib/format";
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Clock,
  CheckCircle,
  XCircle,
  Robot,
  GitBranch,
  Warning,
  Info,
  ArrowRight,
  ChatDots,
} from "@phosphor-icons/react";
import { Badge, Button } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

interface ApprovalDetail {
  id: string;
  operatorName: string;
  operatorId: string;
  workflowName: string;
  executionId: string;
  stepName: string;
  stepDescription: string;
  content: string;
  context: {
    reason: string;
    impact: string;
    nextStep: string;
  };
  status: ApprovalStatus;
  requestedAt: number;
  expiresAt: number | null;
  respondedAt: number | null;
  respondedBy: string | null;
  feedback: string | null;
  history: AuditEntry[];
}

interface AuditEntry {
  action: string;
  actor: string;
  timestamp: number;
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

const MOCK_APPROVAL_MAP: Record<string, ApprovalDetail> = {
  appr_001: {
    id: "appr_001",
    operatorName: "Content Operator",
    operatorId: "op_content_1",
    workflowName: "Weekly Blog Pipeline",
    executionId: "exec_001",
    stepName: "Publish to CMS",
    stepDescription:
      "This step publishes the finalized article to WordPress via the CMS integration. Once approved, the article goes live immediately.",
    content:
      'Article "Building AI Agents in 2024" is ready for publishing to WordPress.\n\n' +
      "Word count: 1,487\n" +
      "SEO score: 85/100\n" +
      "Reading time: ~6 minutes\n\n" +
      "Key topics covered:\n" +
      "- Agent architecture patterns\n" +
      "- Tool use and function calling\n" +
      "- Evaluation and testing strategies\n" +
      "- Production deployment considerations\n\n" +
      "The article includes 3 code examples and 2 diagrams.",
    context: {
      reason:
        "Publishing requires human approval to ensure brand voice consistency and technical accuracy before content goes live.",
      impact:
        "Once approved, the article will be immediately visible to all site visitors. It will also trigger the social media distribution workflow.",
      nextStep:
        "After publishing, the Social Post Generation workflow will create Twitter and LinkedIn posts promoting the article.",
    },
    status: "pending",
    requestedAt: 1716200200000,
    expiresAt: 1716286600000,
    respondedAt: null,
    respondedBy: null,
    feedback: null,
    history: [
      { action: "Execution started", actor: "Content Operator", timestamp: 1716199000000 },
      { action: "Step 4/6 reached — approval required", actor: "System", timestamp: 1716200200000 },
    ],
  },
  appr_002: {
    id: "appr_002",
    operatorName: "Growth Operator",
    operatorId: "op_growth_1",
    workflowName: "A/B Test Analysis",
    executionId: "exec_003",
    stepName: "Apply pricing change",
    stepDescription:
      "This step applies the recommended pricing change to the billing system. The change affects all new subscriptions immediately.",
    content:
      "Recommended pricing adjustment based on A/B test results:\n\n" +
      "Current: Pro plan at $29/mo\n" +
      "Proposed: Pro plan at $39/mo\n\n" +
      "A/B Test Results (30-day window):\n" +
      "- Control ($29): 4.2% conversion rate\n" +
      "- Variant ($39): 4.7% conversion rate (+12%)\n" +
      "- Statistical significance: 95.3%\n" +
      "- Projected annual revenue impact: +$84,000\n\n" +
      "Note: Existing subscribers will not be affected.",
    context: {
      reason:
        "Pricing changes require manual approval due to direct revenue impact and potential customer sentiment effects.",
      impact:
        "New Pro plan subscribers will be charged $39/mo. This affects the checkout page, pricing page, and all marketing materials referencing pricing.",
      nextStep:
        "After approval, the billing system will be updated and marketing materials will be queued for refresh.",
    },
    status: "pending",
    requestedAt: 1716195000000,
    expiresAt: 1716281400000,
    respondedAt: null,
    respondedBy: null,
    feedback: null,
    history: [
      { action: "A/B test concluded", actor: "Growth Operator", timestamp: 1716194000000 },
      {
        action: "Analysis complete — approval required",
        actor: "System",
        timestamp: 1716195000000,
      },
    ],
  },
  appr_003: {
    id: "appr_003",
    operatorName: "Community Operator",
    operatorId: "op_community_1",
    workflowName: "Discord Engagement",
    executionId: "exec_005",
    stepName: "Send announcement",
    stepDescription:
      "This step posts an announcement to the #general channel in Discord. The message is visible to all community members.",
    content:
      "Draft announcement for #general:\n\n" +
      "🚀 **SDK v2.0 is here!**\n\n" +
      "We're excited to announce the release of our SDK v2.0 with major improvements:\n\n" +
      "• **New streaming API** — real-time responses with 50% less latency\n" +
      "• **TypeScript-first** — full type safety out of the box\n" +
      "• **Plugin system** — extend functionality with community plugins\n\n" +
      "⚠️ This is a breaking release. Please check our migration guide: [link]\n\n" +
      "Questions? Drop them in #support and our team will help!\n\n" +
      "Happy building! 🛠️",
    context: {
      reason:
        "Community announcements with breaking changes require approval to ensure messaging is clear and support channels are prepared.",
      impact:
        "The announcement will be visible to 2,400+ community members. It may trigger a spike in #support activity.",
      nextStep:
        "After posting, the bot will pin the message and create a follow-up thread for questions.",
    },
    status: "pending",
    requestedAt: 1716190000000,
    expiresAt: 1716276400000,
    respondedAt: null,
    respondedBy: null,
    feedback: null,
    history: [
      {
        action: "Draft generated by Community Operator",
        actor: "Community Operator",
        timestamp: 1716189000000,
      },
      { action: "Review requested", actor: "System", timestamp: 1716190000000 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApprovalDetailPage() {
  const { slug, isLoading, workspace } = useWorkspaceContext();
  const params = useParams();
  const approvalId = params.id as string;

  const [feedback, setFeedback] = useState("");
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // TODO: Replace with real Convex query
  const approval = MOCK_APPROVAL_MAP[approvalId] ?? null;

  function handleAction(action: "approve" | "reject") {
    // TODO: Wire to Convex mutation
    setActionNotice(action === "approve" ? "Approve" : "Reject");
  }

  // Guard: loading state
  if (isLoading || !workspace || !slug) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-[13px] text-[var(--text-muted)]">Loading workspace…</div>
      </div>
    );
  }

  // Not found
  if (!approval) {
    return (
      <div className="space-y-6">
        <Link
          href={`/w/${slug}/approvals`}
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft size={14} />
          Back to Approvals
        </Link>
        <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <Warning size={28} className="text-[var(--text-muted)]" />
          <h2 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">
            Approval not found
          </h2>
          <p className="mt-1.5 max-w-sm text-[12px] text-[var(--text-muted)]">
            The approval request you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[approval.status];
  const StatusIcon = cfg.icon;
  const isPending = approval.status === "pending";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/w/${slug}/approvals`}
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
      >
        <ArrowLeft size={14} />
        Back to Approvals
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-medium leading-snug text-[var(--text-primary)]">
              {approval.stepName}
            </h1>
            <Badge variant={cfg.badge}>
              <StatusIcon size={12} />
              {cfg.label}
            </Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px] text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <Robot size={14} className="text-[var(--text-muted)]" />
              {approval.operatorName}
            </span>
            <span className="text-[var(--text-muted)]">•</span>
            <span className="flex items-center gap-1.5">
              <GitBranch size={14} className="text-[var(--text-muted)]" />
              {approval.workflowName}
            </span>
            <span className="text-[var(--text-muted)]">•</span>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">{approval.id}</span>
          </div>
        </div>
      </div>

      {/* Meta bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-5 py-3">
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
          <Clock size={14} className="text-[var(--text-muted)]" />
          <span>Requested {formatRelativeTime(approval.requestedAt)}</span>
        </div>
        {isPending && approval.expiresAt && <ExpiresCountdown expiresAt={approval.expiresAt} />}
        {approval.respondedAt && (
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
            <CheckCircle size={14} className="text-[var(--text-muted)]" />
            <span>
              Responded {formatRelativeTime(approval.respondedAt)}
              {approval.respondedBy ? ` by ${approval.respondedBy}` : ""}
            </span>
          </div>
        )}
        <Link
          href={`/w/${slug}/executions/${approval.executionId}`}
          className="ml-auto flex items-center gap-1 text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
        >
          View execution
          <ArrowRight size={12} />
        </Link>
      </div>

      {/* Two-column layout: Content + Context */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Content — spans 2 cols */}
        <div className="space-y-5 lg:col-span-2">
          {/* Content Preview */}
          <section className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Content to Review
            </h2>
            <div className="whitespace-pre-wrap rounded-[10px] bg-[var(--bg-input)] px-4 py-3 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {approval.content}
            </div>
          </section>

          {/* Step description */}
          <section className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Step Description
            </h2>
            <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {approval.stepDescription}
            </p>
          </section>

          {/* Action notice */}
          {actionNotice && (
            <div className="flex items-center gap-2 rounded-[8px] bg-[var(--semantic-info-bg)] px-4 py-3">
              <Info size={16} className="shrink-0 text-[var(--semantic-info-fg)]" />
              <span className="text-[13px] text-[var(--semantic-info-fg)]">
                {actionNotice} action is not yet connected to the backend. This feature is coming
                soon.
              </span>
            </div>
          )}

          {/* Existing feedback (if responded) */}
          {approval.feedback && (
            <section className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
              <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                Response Feedback
              </h2>
              <div className="flex items-start gap-2 rounded-[8px] bg-[var(--bg-input)] px-3 py-2.5">
                <ChatDots size={14} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                <div>
                  <div className="text-[11px] font-medium text-[var(--text-muted)]">
                    {approval.respondedBy}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                    {approval.feedback}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Actions (pending only) */}
          {isPending && !actionNotice && (
            <section className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
              <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                Your Response
              </h2>

              {/* Feedback input */}
              <div className="mb-4">
                <label
                  htmlFor="feedback"
                  className="mb-1.5 block text-[12px] text-[var(--text-muted)]"
                >
                  Feedback (optional)
                </label>
                <textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Add a comment explaining your decision..."
                  rows={3}
                  className="w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--border-focus)]"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={() => handleAction("approve")}>
                  <ThumbsUp size={14} />
                  Approve
                </Button>
                <Button variant="secondary" onClick={() => handleAction("reject")}>
                  <ThumbsDown size={14} />
                  Reject
                </Button>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar — context + audit trail */}
        <div className="space-y-5">
          {/* Context: Why */}
          <section className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Why Approval is Needed
            </h2>
            <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {approval.context.reason}
            </p>
          </section>

          {/* Context: Impact */}
          <section className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Impact
            </h2>
            <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {approval.context.impact}
            </p>
          </section>

          {/* Context: What Happens Next */}
          <section className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              What Happens Next
            </h2>
            <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {approval.context.nextStep}
            </p>
          </section>

          {/* Audit Trail */}
          <section className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Activity
            </h2>
            <div className="space-y-3">
              {approval.history.map((entry, i) => (
                <div key={`${entry.timestamp}-${i}`} className="flex items-start gap-2">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--border-default)]" />
                  <div>
                    <div className="text-[12px] text-[var(--text-secondary)]">{entry.action}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {entry.actor} • {formatRelativeTime(entry.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
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
      <span className="flex items-center gap-1 text-[12px] text-[var(--semantic-negative-fg)]">
        <Warning size={14} />
        Expired
      </span>
    );
  }

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const isUrgent = hours < 4;

  return (
    <span
      className={`flex items-center gap-1 text-[12px] ${
        isUrgent ? "text-[var(--semantic-warning-fg)]" : "text-[var(--text-muted)]"
      }`}
    >
      <Clock size={14} />
      Expires in {hours > 0 ? `${hours}h ` : ""}
      {minutes}m
    </span>
  );
}
