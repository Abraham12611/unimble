"use client";

/**
 * Execution Detail Page
 *
 * Shows execution header, step-by-step timeline with expandable details,
 * error display, retry action, and approval gates.
 *
 * Phase 9.5.2 — Execution Detail
 */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { formatRelativeTime, formatDuration } from "@/lib/format";
import {
  ArrowLeft,
  ArrowClockwise,
  CheckCircle,
  XCircle,
  Lightning,
  CaretDown,
  CaretRight,
  Robot,
  Clock,
  CurrencyDollar,
  Warning,
  Info,
  ThumbsUp,
  ThumbsDown,
  ChatDots,
} from "@phosphor-icons/react";
import { Badge, Button } from "@/components/ui";
import { type ExecutionStatus, STATUS_CONFIG } from "@/lib/executions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = "completed" | "failed" | "running" | "pending" | "skipped";

interface ExecutionStep {
  id: string;
  name: string;
  status: StepStatus;
  durationMs: number;
  startedAt: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  llmCalls?: LLMCall[];
  toolCalls?: ToolCall[];
}

interface LLMCall {
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
}

interface ToolCall {
  tool: string;
  input: string;
  output: string;
  latencyMs: number;
  success: boolean;
}

interface ApprovalGate {
  id: string;
  stepName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: number;
  respondedAt?: number;
  respondedBy?: string;
  content: string;
  feedback?: string;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STEP_STATUS_CONFIG: Record<
  StepStatus,
  { color: string; icon: typeof CheckCircle; dotBg: string }
> = {
  completed: {
    color: "text-[var(--semantic-positive-fg)]",
    icon: CheckCircle,
    dotBg: "bg-[var(--semantic-positive-fg)]",
  },
  failed: {
    color: "text-[var(--semantic-negative-fg)]",
    icon: XCircle,
    dotBg: "bg-[var(--semantic-negative-fg)]",
  },
  running: {
    color: "text-[var(--semantic-info-fg)]",
    icon: Lightning,
    dotBg: "bg-[var(--semantic-info-fg)]",
  },
  pending: {
    color: "text-[var(--text-muted)]",
    icon: Clock,
    dotBg: "bg-[var(--text-muted)]",
  },
  skipped: {
    color: "text-[var(--text-disabled)]",
    icon: CaretRight,
    dotBg: "bg-[var(--text-disabled)]",
  },
};

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

// Static timestamps to avoid impure Date.now() during render
const MOCK_EXECUTION = {
  id: "exec_001",
  operatorName: "Content Operator",
  operatorId: "op_content_1",
  workflowName: "Weekly Blog Pipeline",
  status: "completed" as ExecutionStatus,
  startedAt: 1716200000000,
  completedAt: 1716200272000,
  durationMs: 272000,
  costUsd: 0.42,
  triggeredBy: "Schedule",
};

const MOCK_STEPS: ExecutionStep[] = [
  {
    id: "step_1",
    name: "Analyze trending topics",
    status: "completed",
    durationMs: 45000,
    startedAt: 1716200000000,
    input: { sources: ["HackerNews", "Reddit", "Twitter"], limit: 20 },
    output: { topics: ["AI agents", "LLM fine-tuning", "Edge computing"], confidence: 0.92 },
    llmCalls: [{ model: "gpt-4o", tokensIn: 2400, tokensOut: 850, costUsd: 0.08, latencyMs: 3200 }],
  },
  {
    id: "step_2",
    name: "Generate outline",
    status: "completed",
    durationMs: 32000,
    startedAt: 1716200045000,
    input: { topic: "AI agents", style: "technical blog", wordCount: 1500 },
    output: {
      sections: ["Introduction", "Architecture", "Implementation", "Conclusion"],
      estimatedWords: 1450,
    },
    llmCalls: [
      { model: "gpt-4o", tokensIn: 1800, tokensOut: 1200, costUsd: 0.07, latencyMs: 4100 },
    ],
  },
  {
    id: "step_3",
    name: "Draft article",
    status: "completed",
    durationMs: 95000,
    startedAt: 1716200077000,
    input: { outline: "...", tone: "professional", includeCodeExamples: true },
    output: { wordCount: 1487, readabilityScore: 72 },
    llmCalls: [
      { model: "gpt-4o", tokensIn: 3200, tokensOut: 4500, costUsd: 0.18, latencyMs: 12000 },
    ],
  },
  {
    id: "step_4",
    name: "SEO optimization",
    status: "completed",
    durationMs: 28000,
    startedAt: 1716200172000,
    input: { article: "...", targetKeywords: ["AI agents", "autonomous agents"] },
    output: { seoScore: 85, suggestions: 3, appliedSuggestions: 3 },
    toolCalls: [
      {
        tool: "seo-analyzer",
        input: "Analyze article for SEO",
        output: "Score: 85/100, 3 suggestions applied",
        latencyMs: 2100,
        success: true,
      },
    ],
  },
  {
    id: "step_5",
    name: "Publish to CMS",
    status: "completed",
    durationMs: 12000,
    startedAt: 1716200200000,
    input: { platform: "WordPress", status: "draft", category: "Engineering" },
    output: { postId: "wp_12345", url: "https://blog.example.com/ai-agents", status: "published" },
    toolCalls: [
      {
        tool: "wordpress-api",
        input: "Create post",
        output: "Post created: wp_12345",
        latencyMs: 1800,
        success: true,
      },
    ],
  },
  {
    id: "step_6",
    name: "Generate social posts",
    status: "completed",
    durationMs: 18000,
    startedAt: 1716200212000,
    input: { article: "...", platforms: ["Twitter", "LinkedIn"] },
    output: { postsGenerated: 2 },
    llmCalls: [
      { model: "gpt-4o-mini", tokensIn: 800, tokensOut: 400, costUsd: 0.02, latencyMs: 1500 },
    ],
  },
];

const MOCK_APPROVALS: ApprovalGate[] = [
  {
    id: "appr_1",
    stepName: "Publish to CMS",
    status: "approved",
    requestedAt: 1716200200000,
    respondedAt: 1716200210000,
    respondedBy: "Abraham Dahunsi",
    content: 'Article "Building AI Agents" ready for publishing to WordPress.',
    feedback: "Looks great, ship it!",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExecutionDetailPage() {
  const { slug, isLoading, workspace } = useWorkspaceContext();
  const params = useParams();
  const executionId = params?.id as string;

  const [retryNotice, setRetryNotice] = useState(false);

  // TODO: Replace with real Convex query
  const execution = MOCK_EXECUTION;
  const steps = MOCK_STEPS;
  const approvals = MOCK_APPROVALS;

  const cfg = STATUS_CONFIG[execution.status];
  const StatusIcon = cfg.icon;

  function handleRetry() {
    // TODO: Wire to Convex mutation
    setRetryNotice(true);
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
      {/* Back link + Header */}
      <div className="space-y-4">
        <Link
          href={`/w/${slug}/executions`}
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft size={14} />
          Back to Executions
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-input)]">
              <Robot size={20} className="text-[var(--text-secondary)]" />
            </div>
            <div>
              <h1 className="text-[18px] font-medium leading-snug text-[var(--text-primary)]">
                {execution.workflowName}
              </h1>
              <div className="mt-1 flex items-center gap-3 text-[12px] text-[var(--text-secondary)]">
                <span className="font-mono text-[var(--text-muted)]">{executionId}</span>
                <span>•</span>
                <span>{execution.operatorName}</span>
                <span>•</span>
                <span>{execution.triggeredBy}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(execution.status === "failed" || execution.status === "cancelled") && (
              <Button onClick={handleRetry} variant="secondary" disabled={retryNotice}>
                <ArrowClockwise size={14} />
                Retry
              </Button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-5 py-3">
          <div className="flex items-center gap-2">
            <Badge variant={cfg.badge}>
              <StatusIcon size={12} />
              {cfg.label}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
            <Clock size={14} className="text-[var(--text-muted)]" />
            <span>Started {formatRelativeTime(execution.startedAt)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
            <Lightning size={14} className="text-[var(--text-muted)]" />
            <span>
              {execution.status === "running"
                ? "In progress…"
                : formatDuration(execution.durationMs)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
            <CurrencyDollar size={14} className="text-[var(--text-muted)]" />
            <span>${execution.costUsd.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
            <Info size={14} className="text-[var(--text-muted)]" />
            <span>{steps.length} steps</span>
          </div>
        </div>

        {/* Retry notice */}
        {retryNotice && (
          <div className="flex items-center gap-2 rounded-[8px] bg-[var(--semantic-info-bg)] px-4 py-3">
            <Info size={16} className="shrink-0 text-[var(--semantic-info-fg)]" />
            <span className="text-[13px] text-[var(--semantic-info-fg)]">
              Retry is not yet connected to the backend. This feature is coming soon.
            </span>
          </div>
        )}
      </div>

      {/* Step Timeline */}
      <div className="space-y-2">
        <h2 className="text-[15px] font-medium text-[var(--text-primary)]">Execution Timeline</h2>
        <div className="space-y-0">
          {steps.map((step, index) => (
            <StepRow key={step.id} step={step} isLast={index === steps.length - 1} />
          ))}
        </div>
      </div>

      {/* Approval Gates */}
      {approvals.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[15px] font-medium text-[var(--text-primary)]">Approval Gates</h2>
          <div className="space-y-3">
            {approvals.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step Row (expandable)
// ---------------------------------------------------------------------------

function StepRow({ step, isLast }: { step: ExecutionStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STEP_STATUS_CONFIG[step.status];
  const Icon = cfg.icon;

  return (
    <div className="relative">
      {/* Timeline connector line */}
      {!isLast && (
        <div className="absolute left-[15px] top-[36px] bottom-0 w-px bg-[var(--border-subtle)]" />
      )}

      {/* Row header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left transition-colors hover:bg-[var(--bg-card-hover)]"
      >
        {/* Status dot */}
        <div className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-card)] ${cfg.color}`}
          >
            <Icon size={12} weight={step.status === "running" ? "fill" : "regular"} />
          </div>
        </div>

        {/* Step info */}
        <div className="flex flex-1 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">{step.name}</span>
            <span className={`text-[11px] capitalize ${cfg.color}`}>{step.status}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[var(--text-muted)]">
              {step.status === "running" ? "In progress…" : formatDuration(step.durationMs)}
            </span>
            <span className="text-[var(--text-muted)] transition-transform group-hover:text-[var(--text-secondary)]">
              {expanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
            </span>
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mb-2 ml-[38px] space-y-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
          {/* Error */}
          {step.error && (
            <div className="flex items-start gap-2 rounded-[8px] bg-[var(--semantic-negative-bg)] px-3 py-2.5">
              <Warning size={14} className="mt-0.5 shrink-0 text-[var(--semantic-negative-fg)]" />
              <span className="text-[12px] text-[var(--semantic-negative-fg)]">{step.error}</span>
            </div>
          )}

          {/* Input / Output */}
          <div className="grid gap-3 sm:grid-cols-2">
            {step.input && (
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                  Input
                </div>
                <pre className="overflow-x-auto rounded-[6px] bg-[var(--bg-input)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {JSON.stringify(step.input, null, 2)}
                </pre>
              </div>
            )}
            {step.output && (
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                  Output
                </div>
                <pre className="overflow-x-auto rounded-[6px] bg-[var(--bg-input)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {JSON.stringify(step.output, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* LLM Calls */}
          {step.llmCalls && step.llmCalls.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                LLM Calls
              </div>
              <div className="space-y-1.5">
                {step.llmCalls.map((call, i) => (
                  <div
                    key={`${call.model}-${call.latencyMs}-${i}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[6px] bg-[var(--bg-input)] px-3 py-2 text-[11px]"
                  >
                    <span className="font-mono font-medium text-[var(--text-primary)]">
                      {call.model}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {call.tokensIn.toLocaleString()} in / {call.tokensOut.toLocaleString()} out
                    </span>
                    <span className="text-[var(--text-muted)]">${call.costUsd.toFixed(3)}</span>
                    <span className="text-[var(--text-muted)]">{call.latencyMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool Calls */}
          {step.toolCalls && step.toolCalls.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                Tool Calls
              </div>
              <div className="space-y-1.5">
                {step.toolCalls.map((call, i) => (
                  <div
                    key={`${call.tool}-${call.latencyMs}-${i}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[6px] bg-[var(--bg-input)] px-3 py-2 text-[11px]"
                  >
                    <span className="font-mono font-medium text-[var(--text-primary)]">
                      {call.tool}
                    </span>
                    <span className="text-[var(--text-secondary)]">{call.output}</span>
                    <span className="text-[var(--text-muted)]">{call.latencyMs}ms</span>
                    {call.success ? (
                      <CheckCircle size={12} className="text-[var(--semantic-positive-fg)]" />
                    ) : (
                      <XCircle size={12} className="text-[var(--semantic-negative-fg)]" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approval Card
// ---------------------------------------------------------------------------

function ApprovalCard({ approval }: { approval: ApprovalGate }) {
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const isApproved = approval.status === "approved";
  const isRejected = approval.status === "rejected";
  const isPending = approval.status === "pending";

  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {isApproved && <ThumbsUp size={16} className="text-[var(--semantic-positive-fg)]" />}
          {isRejected && <ThumbsDown size={16} className="text-[var(--semantic-negative-fg)]" />}
          {isPending && <Clock size={16} className="text-[var(--semantic-warning-fg)]" />}
          <span className="text-[13px] font-medium text-[var(--text-primary)]">
            {approval.stepName}
          </span>
        </div>
        <Badge variant={isApproved ? "positive" : isRejected ? "negative" : "warning"}>
          {approval.status === "approved" && <ThumbsUp size={12} />}
          {approval.status === "rejected" && <ThumbsDown size={12} />}
          {approval.status === "pending" && <Clock size={12} />}
          <span className="capitalize">{approval.status}</span>
        </Badge>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
        {approval.content}
      </p>

      {approval.feedback && (
        <div className="mt-3 flex items-start gap-2 rounded-[8px] bg-[var(--bg-input)] px-3 py-2.5">
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
      )}

      <div className="mt-3 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
        <span>Requested {formatRelativeTime(approval.requestedAt)}</span>
        {approval.respondedAt && (
          <>
            <span>•</span>
            <span>Responded {formatRelativeTime(approval.respondedAt)}</span>
          </>
        )}
      </div>

      {/* Pending approval actions */}
      {isPending && (
        <div className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => setActionNotice("Approve")}
              disabled={actionNotice !== null}
            >
              <ThumbsUp size={14} />
              Approve
            </Button>
            <Button
              variant="secondary"
              onClick={() => setActionNotice("Reject")}
              disabled={actionNotice !== null}
            >
              <ThumbsDown size={14} />
              Reject
            </Button>
          </div>
          {actionNotice && (
            <div className="flex items-center gap-2 rounded-[8px] bg-[var(--semantic-info-bg)] px-4 py-3">
              <Info size={16} className="shrink-0 text-[var(--semantic-info-fg)]" />
              <span className="text-[13px] text-[var(--semantic-info-fg)]">
                {actionNotice} action is not yet connected to the backend. This feature is coming
                soon.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
