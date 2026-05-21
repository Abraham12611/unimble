"use client";

import Link from "next/link";
import {
  Robot,
  Play,
  FileText,
  ChatCircle,
  CheckCircle,
  XCircle,
  Clock,
  Plugs,
  Plus,
  ArrowRight,
  Warning,
} from "@phosphor-icons/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { PageHeader } from "@/components/layout";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/cn";
import { StatCardGrid } from "@/components/layout";

/* ---------------------------------------------------------------------------
 * Dashboard Home — Phase 9.3
 *
 * Sections per screen spec (02-dashboard.md):
 * A. Quick Stats Row
 * B. Operator Status Grid
 * C. Recent Activity Feed
 * D. Pending Approvals
 * E. Empty State (when no operators deployed)
 * --------------------------------------------------------------------------- */

// Mock data — will be replaced with Convex queries
const MOCK_STATS = {
  activeOperators: 3,
  executionsThisWeek: 127,
  contentPublished: 5,
  communityInteractions: 234,
};

const MOCK_OPERATORS = [
  {
    id: "op_1",
    name: "Content Operator",
    type: "content",
    status: "active" as const,
    lastRun: "2 hours ago",
    lastRunSuccess: true,
    nextRun: "Monday 9:00 AM",
  },
  {
    id: "op_2",
    name: "Growth Operator",
    type: "growth",
    status: "active" as const,
    lastRun: "5 hours ago",
    lastRunSuccess: true,
    nextRun: "Tomorrow 6:00 AM",
  },
  {
    id: "op_3",
    name: "Community Operator",
    type: "community",
    status: "paused" as const,
    lastRun: "1 day ago",
    lastRunSuccess: true,
    nextRun: "Paused",
  },
];

const MOCK_ACTIVITY = [
  {
    id: "act_1",
    type: "content_published" as const,
    operator: "Content Operator",
    message: 'Published blog post: "10 Tips for Mobile Monetization"',
    time: "2 hours ago",
    meta: "Blog post • 1,234 views",
  },
  {
    id: "act_2",
    type: "execution_completed" as const,
    operator: "Growth Operator",
    message: "Weekly growth pipeline completed successfully",
    time: "5 hours ago",
    meta: "3 experiments • $2.40",
  },
  {
    id: "act_3",
    type: "approval_pending" as const,
    operator: "Content Operator",
    message: "Awaiting approval: Twitter thread draft",
    time: "6 hours ago",
    meta: "Thread • 8 tweets",
  },
  {
    id: "act_4",
    type: "execution_failed" as const,
    operator: "Community Operator",
    message: "Discord response failed: rate limit exceeded",
    time: "1 day ago",
    meta: "Retrying in 15 min",
  },
  {
    id: "act_5",
    type: "integration_connected" as const,
    operator: "System",
    message: "Connected WordPress integration",
    time: "2 days ago",
    meta: "blog.acme.com",
  },
];

const MOCK_APPROVALS = [
  { id: "apr_1", title: "Blog post draft", operator: "Content Operator" },
  { id: "apr_2", title: "Twitter thread", operator: "Growth Operator" },
  { id: "apr_3", title: "Discord response", operator: "Community Operator" },
];

// Activity type → icon mapping
const ACTIVITY_ICONS: Record<string, typeof FileText> = {
  content_published: FileText,
  execution_completed: CheckCircle,
  execution_failed: XCircle,
  approval_pending: Clock,
  integration_connected: Plugs,
  operator_deployed: Robot,
};

const ACTIVITY_COLORS: Record<string, string> = {
  content_published: "text-[var(--semantic-positive-fg)]",
  execution_completed: "text-[var(--semantic-positive-fg)]",
  execution_failed: "text-[var(--semantic-negative-fg)]",
  approval_pending: "text-[var(--semantic-warning-fg)]",
  integration_connected: "text-[var(--semantic-info-fg)]",
  operator_deployed: "text-[var(--chart-primary)]",
};

const STATUS_MAP = {
  active: { variant: "healthy" as const, label: "Active" },
  paused: { variant: "warning" as const, label: "Paused" },
  error: { variant: "error" as const, label: "Error" },
  idle: { variant: "neutral" as const, label: "Idle" },
};

/* ---------------------------------------------------------------------------
 * Empty State — shown when no operators are deployed
 * --------------------------------------------------------------------------- */

function EmptyDashboard({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)]">
        <Robot size={32} className="text-[var(--text-muted)]" />
      </div>
      <h2 className="mt-4 text-[18px] font-medium text-[var(--text-primary)]">
        Welcome to Unimble! 👋
      </h2>
      <p className="mt-2 max-w-sm text-[13px] text-[var(--text-secondary)]">
        Deploy your first AI operator to get started. We recommend starting with the Content
        Operator.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link href={`/w/${slug}/operators`}>
          <Button>
            <Plus size={14} />
            Deploy Content Operator
          </Button>
        </Link>
      </div>
      <Link
        href={`/w/${slug}/operators`}
        className="mt-3 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        or explore all operators →
      </Link>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Operator Status Card
 * --------------------------------------------------------------------------- */

function OperatorCard({ operator, slug }: { operator: (typeof MOCK_OPERATORS)[0]; slug: string }) {
  const status = STATUS_MAP[operator.status];

  return (
    <Card hoverable>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Robot size={16} className="text-[var(--text-secondary)]" />
          <span className="text-[13px] font-medium text-[var(--text-primary)]">
            {operator.name}
          </span>
        </div>
        <StatusDot variant={status.variant} label={status.label} />
      </div>
      <CardContent>
        <div className="space-y-1.5 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">Last run</span>
            <span className="flex items-center gap-1 text-[var(--text-secondary)]">
              {operator.lastRun}
              {operator.lastRunSuccess ? (
                <CheckCircle size={12} className="text-[var(--semantic-positive-fg)]" />
              ) : (
                <XCircle size={12} className="text-[var(--semantic-negative-fg)]" />
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">Next run</span>
            <span className="text-[var(--text-secondary)]">{operator.nextRun}</span>
          </div>
        </div>
      </CardContent>
      <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
        <Button size="sm" variant="ghost">
          <Play size={12} /> Run Now
        </Button>
        <Button size="sm" variant="ghost">
          {operator.status === "paused" ? "Resume" : "Pause"}
        </Button>
        <Link href={`/w/${slug}/operators/${operator.id}`} className="ml-auto">
          <Button size="sm" variant="ghost">
            Settings
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Activity Feed Item
 * --------------------------------------------------------------------------- */

function ActivityItem({ activity }: { activity: (typeof MOCK_ACTIVITY)[0] }) {
  const Icon = ACTIVITY_ICONS[activity.type] || FileText;
  const colorClass = ACTIVITY_COLORS[activity.type] || "text-[var(--text-muted)]";

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className={cn("mt-0.5 shrink-0", colorClass)}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-[var(--text-primary)] leading-snug">
          {activity.message}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span>{activity.time}</span>
          <span>•</span>
          <span>{activity.meta}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Main Dashboard Page
 * --------------------------------------------------------------------------- */

export default function WorkspaceDashboardPage() {
  const { workspace, slug } = useWorkspaceContext();
  const workspaceSlug = slug ?? "";

  // For now, use mock data. In production, this would be Convex queries.
  const hasOperators = MOCK_OPERATORS.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={workspace?.name ?? "Dashboard"}
        description="Workspace overview and recent activity"
        actions={
          <Link href={`/w/${workspaceSlug}/operators`}>
            <Button>
              <Plus size={14} />
              New Operator
            </Button>
          </Link>
        }
      />

      {!hasOperators ? (
        <EmptyDashboard slug={workspaceSlug} />
      ) : (
        <>
          {/* Section A — Quick Stats */}
          <StatCardGrid>
            <StatCard
              title="Active Operators"
              value={MOCK_STATS.activeOperators}
              icon={<Robot size={16} />}
              sparkline={[0.3, 0.5, 0.4, 0.6, 0.7, 0.8]}
            />
            <StatCard
              title="Executions (7d)"
              value={MOCK_STATS.executionsThisWeek}
              delta={12}
              deltaLabel="vs last week"
              icon={<Play size={16} />}
              sparkline={[0.4, 0.3, 0.6, 0.5, 0.7, 0.9, 0.8]}
            />
            <StatCard
              title="Content Published"
              value={MOCK_STATS.contentPublished}
              delta={2}
              deltaLabel="this week"
              icon={<FileText size={16} />}
              sparkline={[0.2, 0.4, 0.3, 0.5, 0.6, 0.7]}
            />
            <StatCard
              title="Community Interactions"
              value={MOCK_STATS.communityInteractions}
              delta={18}
              deltaLabel="vs last week"
              icon={<ChatCircle size={16} />}
              sparkline={[0.5, 0.6, 0.4, 0.7, 0.8, 0.9, 1.0]}
            />
          </StatCardGrid>

          {/* Main content: 2-column on desktop */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
            {/* Left column */}
            <div className="space-y-4">
              {/* Section B — Operator Status Grid */}
              <Card noPadding>
                <CardHeader className="px-5 pt-5">
                  <CardTitle>Operators</CardTitle>
                  <Link
                    href={`/w/${workspaceSlug}/operators`}
                    className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    View all →
                  </Link>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {MOCK_OPERATORS.map((op) => (
                      <OperatorCard key={op.id} operator={op} slug={workspaceSlug} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Section D — Pending Approvals */}
              {MOCK_APPROVALS.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock size={16} className="text-[var(--semantic-warning-fg)]" />
                      {MOCK_APPROVALS.length} pending approvals
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {MOCK_APPROVALS.map((approval) => (
                        <div
                          key={approval.id}
                          className="flex items-center justify-between rounded-[6px] border border-[var(--border-subtle)] px-3 py-2"
                        >
                          <div>
                            <div className="text-[13px] text-[var(--text-primary)]">
                              {approval.title}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              {approval.operator}
                            </div>
                          </div>
                          <Badge variant="warning">Review</Badge>
                        </div>
                      ))}
                    </div>
                    <Link
                      href={`/w/${workspaceSlug}/executions`}
                      className="mt-3 flex items-center gap-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Review all <ArrowRight size={12} />
                    </Link>
                  </CardContent>
                </Card>
              )}

              {/* Section C — Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {MOCK_ACTIVITY.map((activity) => (
                      <ActivityItem key={activity.id} activity={activity} />
                    ))}
                  </div>
                  <Link
                    href={`/w/${workspaceSlug}/executions`}
                    className="mt-3 flex items-center gap-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    View all activity <ArrowRight size={12} />
                  </Link>
                </CardContent>
              </Card>

              {/* Alert example */}
              <div className="flex items-start gap-3 rounded-[10px] border border-[var(--semantic-warning-fg)]/20 bg-[var(--semantic-warning-bg)] p-3">
                <Warning size={16} className="mt-0.5 shrink-0 text-[var(--semantic-warning-fg)]" />
                <div>
                  <div className="text-[12px] font-medium text-[var(--semantic-warning-fg)]">
                    Approaching execution limit
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    847 / 1,000 executions used this billing period (85%)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
