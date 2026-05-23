"use client";

/**
 * Analytics Dashboard
 *
 * Phase 9.7.1 — Analytics Dashboard
 *
 * Sections per screen spec (06-analytics.md Screen 01):
 * A. Key Metrics Row (4 stat cards)
 * B. Executions Over Time (line chart)
 * C. Cost Over Time (stacked area chart)
 * D. By Operator (table)
 * E. By Workflow (table)
 * F. Cost Breakdown (two pie-style donut charts)
 * G. Error Analysis (table)
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChartBar,
  ArrowUp,
  ArrowDown,
  Minus,
  Robot,
  GitBranch,
  XCircle,
  Export,
  CaretDown,
  ArrowUpRight,
  Warning,
} from "@phosphor-icons/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { PageHeader } from "@/components/layout";
import { StatCard } from "@/components/ui/stat-card";
import { StatCardGrid } from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DateRange = "7d" | "30d" | "90d" | "this_month" | "last_month";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
};

const MOCK_METRICS = {
  totalExecutions: { value: 847, delta: 12 },
  successRate: { value: 96.2, delta: 2.1 },
  totalCost: { value: 156.32, delta: 8 },
  avgDuration: { value: "3m 42s", delta: -15 },
};

// Executions over time — 7 data points (last 7 days)
const MOCK_EXECUTIONS_CHART = [
  { label: "Mon", total: 98, success: 95, failed: 3 },
  { label: "Tue", total: 112, success: 108, failed: 4 },
  { label: "Wed", total: 134, success: 130, failed: 4 },
  { label: "Thu", total: 89, success: 87, failed: 2 },
  { label: "Fri", total: 145, success: 140, failed: 5 },
  { label: "Sat", total: 78, success: 76, failed: 2 },
  { label: "Sun", total: 191, success: 185, failed: 6 },
];

// Cost over time — 7 data points ($)
const MOCK_COST_CHART = [
  { label: "Mon", inference: 14.2, toolCalls: 2.1, other: 0.8 },
  { label: "Tue", inference: 18.5, toolCalls: 3.2, other: 1.1 },
  { label: "Wed", inference: 22.1, toolCalls: 4.0, other: 1.4 },
  { label: "Thu", inference: 11.8, toolCalls: 1.9, other: 0.7 },
  { label: "Fri", inference: 24.3, toolCalls: 4.5, other: 1.6 },
  { label: "Sat", inference: 9.4, toolCalls: 1.5, other: 0.5 },
  { label: "Sun", inference: 29.2, toolCalls: 5.1, other: 1.8 },
];

const MOCK_BY_OPERATOR = [
  {
    id: "op_1",
    name: "Content Operator",
    executions: 312,
    successRate: 98,
    avgDuration: "4m 12s",
    cost: 67.5,
    trend: "up" as const,
  },
  {
    id: "op_2",
    name: "Growth Operator",
    executions: 245,
    successRate: 94,
    avgDuration: "2m 45s",
    cost: 45.2,
    trend: "flat" as const,
  },
  {
    id: "op_3",
    name: "Community Operator",
    executions: 290,
    successRate: 97,
    avgDuration: "1m 30s",
    cost: 43.62,
    trend: "up" as const,
  },
];

const MOCK_BY_WORKFLOW = [
  {
    id: "wf_1",
    name: "Weekly Content Pipeline",
    operator: "Content",
    executions: 12,
    successRate: 100,
    avgDuration: "5m 30s",
    cost: 24.0,
  },
  {
    id: "wf_2",
    name: "Daily Engagement",
    operator: "Growth",
    executions: 210,
    successRate: 95,
    avgDuration: "1m 15s",
    cost: 31.5,
  },
  {
    id: "wf_3",
    name: "Community Triage",
    operator: "Community",
    executions: 280,
    successRate: 97,
    avgDuration: "1m 20s",
    cost: 42.0,
  },
];

const MOCK_COST_BY_MODEL = [
  { model: "claude-3.5-sonnet", pct: 65, color: "var(--chart-primary)" },
  { model: "gpt-4o", pct: 20, color: "var(--chart-secondary)" },
  { model: "gpt-4o-mini", pct: 15, color: "var(--chart-bar-active)" },
];

const MOCK_COST_BY_OPERATOR = [
  { name: "Content Operator", pct: 43, color: "var(--chart-primary)" },
  { name: "Growth Operator", pct: 29, color: "var(--chart-secondary)" },
  { name: "Community Operator", pct: 28, color: "var(--chart-bar-active)" },
];

const MOCK_ERRORS = [
  {
    id: "err_1",
    time: "2h ago",
    operator: "Growth",
    workflow: "Daily Engagement",
    type: "Rate Limit",
    message: "Twitter API limit exceeded",
  },
  {
    id: "err_2",
    time: "1d ago",
    operator: "Content",
    workflow: "Weekly Pipeline",
    type: "Timeout",
    message: "WordPress API timeout",
  },
];

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------

/** Converts an array of values to a normalized polyline points string for an SVG viewBox 0 0 W H */
function toPolylinePoints(values: number[], width: number, height: number, padding = 4): string {
  const max = Math.max(...values, 1);
  const step = (width - padding * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = padding + i * step;
      const y = height - padding - (v / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Mini SVG line chart used in Executions Over Time */
function LineChart({
  data,
  showSuccess,
  showFailed,
}: {
  data: typeof MOCK_EXECUTIONS_CHART;
  showSuccess: boolean;
  showFailed: boolean;
}) {
  const W = 480;
  const H = 120;
  const totals = data.map((d) => d.total);
  const successes = data.map((d) => d.success);
  const failures = data.map((d) => d.failed);
  const maxVal = Math.max(...totals, 1);

  function points(values: number[]) {
    return toPolylinePoints(values, W, H, 8);
  }

  // Area fill path for "total"
  const step = (W - 16) / (data.length - 1);
  const areaPoints = totals.map((v, i) => {
    const x = 8 + i * step;
    const y = H - 8 - (v / maxVal) * (H - 16);
    return `${x},${y}`;
  });
  const areaPath = `M${areaPoints[0]} L${areaPoints.slice(1).join(" L")} L${8 + (data.length - 1) * step},${H - 8} L8,${H - 8} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" height={120}>
        {/* Area fill */}
        <path d={areaPath} fill="var(--chart-primary)" fillOpacity={0.08} />
        {/* Total line */}
        <polyline
          points={points(totals)}
          fill="none"
          stroke="var(--chart-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Success line */}
        {showSuccess && (
          <polyline
            points={points(successes)}
            fill="none"
            stroke="var(--semantic-positive-fg)"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            strokeLinejoin="round"
          />
        )}
        {/* Failed line */}
        {showFailed && (
          <polyline
            points={points(failures)}
            fill="none"
            stroke="var(--semantic-negative-fg)"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {/* X-axis labels */}
      <div className="mt-1 flex justify-between px-2">
        {data.map((d) => (
          <span key={d.label} className="text-[10px] text-[var(--text-muted)]">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Stacked area chart for Cost Over Time */
function StackedAreaChart({ data }: { data: typeof MOCK_COST_CHART }) {
  const W = 480;
  const H = 120;
  const maxVal = Math.max(...data.map((d) => d.inference + d.toolCalls + d.other), 1);
  const pad = 8;
  const step = (W - pad * 2) / (data.length - 1);

  function pts(values: number[]) {
    return values
      .map((v, i) => `${pad + i * step},${H - pad - (v / maxVal) * (H - pad * 2)}`)
      .join(" ");
  }

  const inferenceTotals = data.map((d) => d.inference + d.toolCalls + d.other);
  const toolTotals = data.map((d) => d.toolCalls + d.other);
  const otherTotals = data.map((d) => d.other);

  function areaPath(tops: number[], bottoms: number[]) {
    const topPoints = tops.map(
      (v, i) => `${pad + i * step},${H - pad - (v / maxVal) * (H - pad * 2)}`
    );
    const btmPoints = [...bottoms]
      .reverse()
      .map(
        (v, i) =>
          `${pad + (bottoms.length - 1 - i) * step},${H - pad - (v / maxVal) * (H - pad * 2)}`
      );
    return `M${topPoints[0]} L${topPoints.slice(1).join(" L")} L${btmPoints[0]} L${btmPoints.slice(1).join(" L")} Z`;
  }

  const zeros = data.map(() => 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" height={120}>
        {/* Inference area (bottom to top of inference) */}
        <path d={areaPath(inferenceTotals, zeros)} fill="var(--chart-primary)" fillOpacity={0.25} />
        {/* Tool calls area */}
        <path d={areaPath(toolTotals, zeros)} fill="var(--chart-secondary)" fillOpacity={0.25} />
        {/* Other area */}
        <path d={areaPath(otherTotals, zeros)} fill="var(--chart-bar-active)" fillOpacity={0.3} />
        {/* Top line */}
        <polyline
          points={pts(inferenceTotals)}
          fill="none"
          stroke="var(--chart-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1 flex justify-between px-2">
        {data.map((d) => (
          <span key={d.label} className="text-[10px] text-[var(--text-muted)]">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal donut/pie chart using CSS conic-gradient */
function DonutChart({
  segments,
}: {
  segments: { model?: string; name?: string; pct: number; color: string }[];
}) {
  const conicStops = segments.reduce<string[]>((acc, seg) => {
    const prev = acc.length === 0 ? 0 : parseFloat(acc[acc.length - 1].split(" ").pop()!);
    acc.push(`${seg.color} ${prev}% ${prev + seg.pct}%`);
    return acc;
  }, []);

  return (
    <div className="flex items-center gap-4">
      <div
        className="h-20 w-20 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${conicStops.join(", ")})`,
          mask: "radial-gradient(circle, transparent 42%, black 43%)",
          WebkitMask: "radial-gradient(circle, transparent 42%, black 43%)",
        }}
      />
      <div className="space-y-1.5">
        {segments.map((seg) => (
          <div key={seg.model ?? seg.name} className="flex items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: seg.color }} />
            <span className="text-[11px] text-[var(--text-secondary)]">
              {seg.model ?? seg.name}
            </span>
            <span className="ml-auto text-[11px] font-medium text-[var(--text-primary)]">
              {seg.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Trend arrow chip */
function TrendChip({ trend, delta }: { trend?: "up" | "down" | "flat"; delta?: number }) {
  const d = delta ?? 0;
  const isUp = trend === "up" || d > 0;

  if (trend === "flat" || d === 0) {
    return (
      <span className="flex items-center gap-0.5 text-[11px] text-[var(--text-muted)]">
        <Minus size={10} /> —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-[11px] font-medium",
        isUp ? "text-[var(--semantic-positive-fg)]" : "text-[var(--semantic-negative-fg)]"
      )}
    >
      {isUp ? <ArrowUp size={10} weight="bold" /> : <ArrowDown size={10} weight="bold" />}
      {delta !== undefined ? `${Math.abs(d)}%` : ""}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { slug, workspace, isLoading } = useWorkspaceContext();
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFailed, setShowFailed] = useState(false);
  const [sortCol, setSortCol] = useState<"executions" | "successRate" | "cost">("executions");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedOperators = useMemo(() => {
    return [...MOCK_BY_OPERATOR].sort((a, b) => {
      const va = a[sortCol] as number;
      const vb = b[sortCol] as number;
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [sortCol, sortDir]);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

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
      <PageHeader
        title="Analytics"
        description="Usage metrics, costs, and performance insights"
        actions={
          <div className="flex items-center gap-2">
            {/* Date range picker */}
            <div className="relative flex items-center gap-1 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                className="appearance-none bg-transparent text-[12px] text-[var(--text-primary)] outline-none pr-4"
              >
                {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((k) => (
                  <option key={k} value={k}>
                    {DATE_RANGE_LABELS[k]}
                  </option>
                ))}
              </select>
              <CaretDown
                size={12}
                className="pointer-events-none absolute right-2 text-[var(--text-muted)]"
              />
            </div>
            <button className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]">
              <Export size={13} />
              Export CSV
            </button>
          </div>
        }
      />

      {/* Section A — Key Metrics */}
      <StatCardGrid>
        <StatCard
          title="Total Executions"
          value={MOCK_METRICS.totalExecutions.value.toLocaleString()}
          delta={MOCK_METRICS.totalExecutions.delta}
          deltaLabel="vs previous period"
          icon={<ChartBar size={16} />}
          sparkline={[0.5, 0.6, 0.8, 0.5, 0.9, 0.7, 1.0]}
        />
        <StatCard
          title="Success Rate"
          value={MOCK_METRICS.successRate.value}
          unit="%"
          delta={MOCK_METRICS.successRate.delta}
          deltaLabel="vs previous period"
          icon={<Robot size={16} />}
          sparkline={[0.9, 0.92, 0.91, 0.94, 0.93, 0.96, 0.96]}
        />
        <StatCard
          title="Total Cost"
          value={`$${MOCK_METRICS.totalCost.value.toFixed(2)}`}
          delta={MOCK_METRICS.totalCost.delta}
          deltaLabel="vs previous period"
          icon={<ChartBar size={16} />}
          sparkline={[0.4, 0.55, 0.7, 0.45, 0.8, 0.65, 0.9]}
        />
        <StatCard
          title="Avg Duration"
          value={MOCK_METRICS.avgDuration.value}
          delta={MOCK_METRICS.avgDuration.delta}
          deltaLabel="vs previous period"
          icon={<Robot size={16} />}
          sparkline={[0.9, 0.8, 0.85, 0.7, 0.65, 0.6, 0.55]}
        />
      </StatCardGrid>

      {/* Section B + C — Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Executions Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Executions Over Time</CardTitle>
            <div className="flex items-center gap-3 text-[11px]">
              <label className="flex cursor-pointer items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={showSuccess}
                  onChange={(e) => setShowSuccess(e.target.checked)}
                  className="h-3 w-3 rounded-sm"
                />
                <span className="text-[var(--semantic-positive-fg)]">Success</span>
              </label>
              <label className="flex cursor-pointer items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={showFailed}
                  onChange={(e) => setShowFailed(e.target.checked)}
                  className="h-3 w-3 rounded-sm"
                />
                <span className="text-[var(--semantic-negative-fg)]">Failed</span>
              </label>
            </div>
          </CardHeader>
          <CardContent>
            <LineChart
              data={MOCK_EXECUTIONS_CHART}
              showSuccess={showSuccess}
              showFailed={showFailed}
            />
            <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>
                Total: {MOCK_EXECUTIONS_CHART.reduce((s, d) => s + d.total, 0)} executions
              </span>
              <span className="text-[var(--semantic-negative-fg)]">
                {MOCK_EXECUTIONS_CHART.reduce((s, d) => s + d.failed, 0)} failed
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Cost Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Over Time</CardTitle>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[var(--chart-primary)]" />
                AI Inference
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[var(--chart-secondary)]" />
                Tool Calls
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[var(--chart-bar-active)]" />
                Other
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <StackedAreaChart data={MOCK_COST_CHART} />
            <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>
                Total: $
                {MOCK_COST_CHART.reduce(
                  (s, d) => s + d.inference + d.toolCalls + d.other,
                  0
                ).toFixed(2)}
              </span>
              <Link
                href={`/w/${slug}/analytics/costs`}
                className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cost details <ArrowUpRight size={11} />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section D — By Operator */}
      <Card noPadding>
        <CardHeader className="px-5 pt-5">
          <CardTitle className="flex items-center gap-2">
            <Robot size={16} className="text-[var(--text-muted)]" />
            By Operator
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {[
                    { key: null, label: "Operator" },
                    { key: "executions", label: "Executions" },
                    { key: "successRate", label: "Success Rate" },
                    { key: null, label: "Avg Duration" },
                    { key: "cost", label: "Cost" },
                    { key: null, label: "Trend" },
                  ].map(({ key, label }) => (
                    <th
                      key={label}
                      onClick={() => key && toggleSort(key as typeof sortCol)}
                      className={cn(
                        "px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]",
                        key && "cursor-pointer hover:text-[var(--text-secondary)]"
                      )}
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        {key &&
                          sortCol === key &&
                          (sortDir === "desc" ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {sortedOperators.map((op) => (
                  <tr
                    key={op.id}
                    className="group transition-colors hover:bg-[var(--bg-card-hover)]"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Robot size={14} className="text-[var(--text-muted)]" />
                        <span className="text-[13px] font-medium text-[var(--text-primary)]">
                          {op.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[var(--text-secondary)]">
                      {op.executions.toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "text-[13px] font-medium",
                          op.successRate >= 97
                            ? "text-[var(--semantic-positive-fg)]"
                            : op.successRate >= 90
                              ? "text-[var(--semantic-warning-fg)]"
                              : "text-[var(--semantic-negative-fg)]"
                        )}
                      >
                        {op.successRate}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[var(--text-secondary)]">
                      {op.avgDuration}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[var(--text-secondary)]">
                      ${op.cost.toFixed(2)}
                    </td>
                    <td className="px-5 py-3">
                      <TrendChip trend={op.trend} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Section E — By Workflow */}
      <Card noPadding>
        <CardHeader className="px-5 pt-5">
          <CardTitle className="flex items-center gap-2">
            <GitBranch size={16} className="text-[var(--text-muted)]" />
            By Workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {[
                    "Workflow",
                    "Operator",
                    "Executions",
                    "Success Rate",
                    "Avg Duration",
                    "Cost",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {MOCK_BY_WORKFLOW.map((wf) => (
                  <tr key={wf.id} className="transition-colors hover:bg-[var(--bg-card-hover)]">
                    <td className="px-5 py-3 text-[13px] font-medium text-[var(--text-primary)]">
                      {wf.name}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="neutral">{wf.operator}</Badge>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[var(--text-secondary)]">
                      {wf.executions.toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "text-[13px] font-medium",
                          wf.successRate >= 97
                            ? "text-[var(--semantic-positive-fg)]"
                            : "text-[var(--semantic-warning-fg)]"
                        )}
                      >
                        {wf.successRate}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[var(--text-secondary)]">
                      {wf.avgDuration}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[var(--text-secondary)]">
                      ${wf.cost.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Section F — Cost Breakdown */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cost by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart segments={MOCK_COST_BY_MODEL} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cost by Operator</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart segments={MOCK_COST_BY_OPERATOR} />
          </CardContent>
        </Card>
      </div>

      {/* Section G — Error Analysis */}
      <Card noPadding>
        <CardHeader className="px-5 pt-5">
          <CardTitle className="flex items-center gap-2">
            <XCircle size={16} className="text-[var(--semantic-negative-fg)]" />
            Error Analysis
          </CardTitle>
          <Link
            href={`/w/${slug}/executions`}
            className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            View all errors →
          </Link>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {MOCK_ERRORS.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
              <Warning size={24} className="text-[var(--text-muted)]" />
              <p className="mt-2 text-[12px] text-[var(--text-muted)]">No errors in this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    {["Time", "Operator", "Workflow", "Error Type", "Message"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {MOCK_ERRORS.map((err) => (
                    <tr key={err.id} className="transition-colors hover:bg-[var(--bg-card-hover)]">
                      <td className="px-5 py-3 text-[12px] text-[var(--text-muted)]">{err.time}</td>
                      <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)]">
                        {err.operator}
                      </td>
                      <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)]">
                        {err.workflow}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="negative">{err.type}</Badge>
                      </td>
                      <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)]">
                        {err.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
