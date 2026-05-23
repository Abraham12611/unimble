"use client";

/**
 * Cost Management Page
 *
 * Phase 9.7.2 — Cost Management
 *
 * Sections per screen spec (06-analytics.md Screen 03):
 * A. Current Period Summary (progress bars)
 * B. Budget Settings (monthly budget + alert thresholds)
 * C. Cost by Day (bar chart)
 * D. Cost by Model (table)
 * E. Cost Optimization Suggestions
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CurrencyDollar,
  Warning,
  CheckCircle,
  Lightbulb,
  Robot,
  CalendarBlank,
  ArrowUpRight,
  FloppyDisk,
} from "@phosphor-icons/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_PERIOD = {
  label: "May 2026",
  executions: { used: 847, limit: 1000 },
  tokens: { used: 1_400_000, limit: 2_000_000 },
  cost: { used: 156.32, limit: 200 },
  daysRemaining: 8,
  projected: 195,
};

const MOCK_COST_BY_DAY = [
  { label: "May 16", cost: 4.2 },
  { label: "May 17", cost: 5.8 },
  { label: "May 18", cost: 7.1 },
  { label: "May 19", cost: 3.9 },
  { label: "May 20", cost: 8.4 },
  { label: "May 21", cost: 6.2 },
  { label: "May 22", cost: 9.6 },
  { label: "May 23", cost: 11.2 },
  { label: "May 24", cost: 5.1 },
  { label: "May 25", cost: 7.8 },
  { label: "May 26", cost: 9.0 },
  { label: "May 27", cost: 10.3 },
  { label: "May 28", cost: 6.7 },
  { label: "May 29", cost: 8.9 },
  { label: "May 30", cost: 12.1 },
];

const MOCK_COST_BY_MODEL = [
  {
    model: "claude-3.5-sonnet",
    tokens: "1.2M",
    cost: 108.0,
    pct: 69,
    color: "var(--chart-primary)",
  },
  { model: "gpt-4o", tokens: "150K", cost: 30.0, pct: 19, color: "var(--chart-secondary)" },
  { model: "gpt-4o-mini", tokens: "200K", cost: 10.0, pct: 6, color: "var(--chart-bar-active)" },
  {
    model: "text-embedding-3-small",
    tokens: "500K",
    cost: 8.32,
    pct: 5,
    color: "var(--chart-bar)",
  },
];

const MOCK_SUGGESTIONS = [
  {
    id: "sug_1",
    title: "Switch Community Operator to gpt-4o-mini for simple responses",
    savings: 15,
    operator: "Community Operator",
  },
  {
    id: "sug_2",
    title: "Enable caching for repeated queries",
    savings: 8,
    operator: null,
  },
  {
    id: "sug_3",
    title: "Reduce Content Operator temperature to decrease token usage",
    savings: 5,
    operator: "Content Operator",
  },
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Progress bar row */
function UsageRow({
  label,
  used,
  limit,
  formatUsed,
  formatLimit,
}: {
  label: string;
  used: number;
  limit: number;
  formatUsed: string;
  formatLimit: string;
}) {
  const pct = Math.min(Math.round((used / limit) * 100), 100);
  const isWarning = pct >= 80 && pct < 100;
  const isDanger = pct >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-mono text-[var(--text-primary)]">
          {formatUsed} / {formatLimit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-input)]">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isDanger
              ? "bg-[var(--semantic-negative-fg)]"
              : isWarning
                ? "bg-[var(--semantic-warning-fg)]"
                : "bg-[var(--chart-primary)]"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <span
          className={cn(
            "font-medium",
            isDanger
              ? "text-[var(--semantic-negative-fg)]"
              : isWarning
                ? "text-[var(--semantic-warning-fg)]"
                : "text-[var(--text-muted)]"
          )}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}

/** Bar chart — daily costs */
function DailyBarChart({ data }: { data: { label: string; cost: number }[] }) {
  const max = Math.max(...data.map((d) => d.cost), 1);

  return (
    <div className="space-y-2">
      <div className="flex h-28 items-end gap-1">
        {data.map((d) => {
          const h = Math.max((d.cost / max) * 100, 4);
          return (
            <div
              key={d.label}
              className="group relative flex flex-1 flex-col items-center justify-end"
            >
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-[4px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] text-[var(--text-primary)] opacity-0 whitespace-nowrap transition-opacity group-hover:opacity-100">
                ${d.cost.toFixed(2)}
              </div>
              <div
                className="w-full rounded-t-[3px] bg-[var(--chart-bar)] transition-colors group-hover:bg-[var(--chart-primary)]"
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* X-axis labels — show every 3rd */}
      <div className="flex items-center gap-1">
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 text-center text-[9px] text-[var(--text-muted)]">
            {i % 3 === 0 ? d.label.replace("May ", "") : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CostManagementPage() {
  const { slug, workspace, isLoading } = useWorkspaceContext();

  const [monthlyBudget, setMonthlyBudget] = useState(200);
  const [alerts, setAlerts] = useState({
    at50: true,
    at80: true,
    at100: true,
  });
  const [saved, setSaved] = useState(false);

  function handleSave() {
    // TODO: Wire to Convex mutation
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (isLoading || !workspace || !slug) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-[13px] text-[var(--text-muted)]">Loading workspace…</div>
      </div>
    );
  }

  const projectedOverBudget = MOCK_PERIOD.projected > monthlyBudget;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Link
              href={`/w/${slug}/analytics`}
              className="flex items-center gap-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ArrowLeft size={12} />
              Analytics
            </Link>
          </div>
          <h1 className="text-[18px] font-medium leading-snug text-[var(--text-primary)]">
            Cost Management
          </h1>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            Track and optimise your AI spend
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5">
            <CalendarBlank size={13} className="text-[var(--text-muted)]" />
            <span className="text-[12px] text-[var(--text-primary)]">{MOCK_PERIOD.label}</span>
          </div>
          <Link
            href={`/w/${slug}/settings/billing`}
            className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
          >
            View Billing
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>

      {/* Main grid: 2 columns on desktop */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Section A — Current Period Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CurrencyDollar size={16} className="text-[var(--text-muted)]" />
                {MOCK_PERIOD.label} Usage
              </CardTitle>
              <span className="text-[12px] text-[var(--text-muted)]">
                {MOCK_PERIOD.daysRemaining} days remaining
              </span>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                <UsageRow
                  label="Executions"
                  used={MOCK_PERIOD.executions.used}
                  limit={MOCK_PERIOD.executions.limit}
                  formatUsed={MOCK_PERIOD.executions.used.toLocaleString()}
                  formatLimit={MOCK_PERIOD.executions.limit.toLocaleString()}
                />
                <UsageRow
                  label="AI Tokens"
                  used={MOCK_PERIOD.tokens.used}
                  limit={MOCK_PERIOD.tokens.limit}
                  formatUsed={`${(MOCK_PERIOD.tokens.used / 1_000_000).toFixed(1)}M`}
                  formatLimit={`${(MOCK_PERIOD.tokens.limit / 1_000_000).toFixed(0)}M`}
                />
                <UsageRow
                  label="Cost"
                  used={MOCK_PERIOD.cost.used}
                  limit={monthlyBudget}
                  formatUsed={`$${MOCK_PERIOD.cost.used.toFixed(0)}`}
                  formatLimit={`$${monthlyBudget}`}
                />
              </div>

              {/* Projection banner */}
              <div
                className={cn(
                  "mt-5 flex items-start gap-3 rounded-[10px] border px-4 py-3",
                  projectedOverBudget
                    ? "border-[var(--semantic-negative-fg)]/20 bg-[var(--semantic-negative-bg)]"
                    : "border-[var(--semantic-positive-fg)]/15 bg-[var(--semantic-positive-bg)]"
                )}
              >
                {projectedOverBudget ? (
                  <Warning
                    size={15}
                    className="mt-0.5 shrink-0 text-[var(--semantic-negative-fg)]"
                  />
                ) : (
                  <CheckCircle
                    size={15}
                    className="mt-0.5 shrink-0 text-[var(--semantic-positive-fg)]"
                  />
                )}
                <div className="text-[12px]">
                  <span
                    className={cn(
                      "font-medium",
                      projectedOverBudget
                        ? "text-[var(--semantic-negative-fg)]"
                        : "text-[var(--semantic-positive-fg)]"
                    )}
                  >
                    Projected end-of-month: ${MOCK_PERIOD.projected}
                  </span>
                  <span className="ml-1 text-[var(--text-secondary)]">
                    {projectedOverBudget
                      ? `— ${((MOCK_PERIOD.projected / monthlyBudget - 1) * 100).toFixed(0)}% over budget`
                      : "— within budget"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section C — Cost by Day */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Day</CardTitle>
              <span className="text-[12px] text-[var(--text-muted)]">
                Last {MOCK_COST_BY_DAY.length} days
              </span>
            </CardHeader>
            <CardContent>
              <DailyBarChart data={MOCK_COST_BY_DAY} />
            </CardContent>
          </Card>

          {/* Section D — Cost by Model */}
          <Card noPadding>
            <CardHeader className="px-5 pt-5">
              <CardTitle>Cost by Model</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      {["Model", "Tokens", "Cost", "% of Total", ""].map((h) => (
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
                    {MOCK_COST_BY_MODEL.map((row) => (
                      <tr
                        key={row.model}
                        className="transition-colors hover:bg-[var(--bg-card-hover)]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: row.color }}
                            />
                            <span className="font-mono text-[12px] text-[var(--text-primary)]">
                              {row.model}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono text-[12px] text-[var(--text-secondary)]">
                          {row.tokens}
                        </td>
                        <td className="px-5 py-3 text-[13px] font-medium text-[var(--text-primary)]">
                          ${row.cost.toFixed(2)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--bg-input)]">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${row.pct}%`, background: row.color }}
                              />
                            </div>
                            <span className="text-[12px] text-[var(--text-secondary)]">
                              {row.pct}%
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3" />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[var(--border-default)]">
                      <td className="px-5 py-3 text-[12px] font-medium text-[var(--text-secondary)]">
                        Total
                      </td>
                      <td className="px-5 py-3 font-mono text-[12px] text-[var(--text-muted)]">
                        —
                      </td>
                      <td className="px-5 py-3 text-[13px] font-semibold text-[var(--text-primary)]">
                        ${MOCK_COST_BY_MODEL.reduce((s, r) => s + r.cost, 0).toFixed(2)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Section B — Budget Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Budget Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Monthly budget input */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    Monthly Budget
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-[13px] text-[var(--text-muted)]">$</span>
                    <input
                      type="number"
                      min={0}
                      value={monthlyBudget}
                      onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                      className="w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] py-2 pl-7 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                </div>

                {/* Thresholds */}
                <div>
                  <label className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    Alert Thresholds
                  </label>
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={alerts.at50}
                        onChange={(e) => setAlerts((a) => ({ ...a, at50: e.target.checked }))}
                        className="mt-0.5 rounded-sm"
                      />
                      <div>
                        <div className="text-[12px] font-medium text-[var(--text-primary)]">
                          50% — Notify via email
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          at ${(monthlyBudget * 0.5).toFixed(0)}
                        </div>
                      </div>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={alerts.at80}
                        onChange={(e) => setAlerts((a) => ({ ...a, at80: e.target.checked }))}
                        className="mt-0.5 rounded-sm"
                      />
                      <div>
                        <div className="text-[12px] font-medium text-[var(--text-primary)]">
                          80% — Notify via email + Slack
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          at ${(monthlyBudget * 0.8).toFixed(0)}
                        </div>
                      </div>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={alerts.at100}
                        onChange={(e) => setAlerts((a) => ({ ...a, at100: e.target.checked }))}
                        className="mt-0.5 rounded-sm"
                      />
                      <div>
                        <div className="text-[12px] font-medium text-[var(--text-primary)]">
                          100% — Pause non-critical operators
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          at ${monthlyBudget}
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-[6px] border py-2 text-[13px] font-medium transition-colors",
                    saved
                      ? "border-[var(--semantic-positive-fg)]/20 bg-[var(--semantic-positive-bg)] text-[var(--semantic-positive-fg)]"
                      : "border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                  )}
                >
                  {saved ? (
                    <>
                      <CheckCircle size={14} weight="fill" />
                      Saved
                    </>
                  ) : (
                    <>
                      <FloppyDisk size={14} />
                      Save Settings
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Section E — Optimization Suggestions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb size={16} className="text-[var(--semantic-warning-fg)]" />
                Optimization Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {MOCK_SUGGESTIONS.map((sug, i) => (
                  <div
                    key={sug.id}
                    className="rounded-[10px] border border-[var(--border-subtle)] p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-input)] text-[10px] font-semibold text-[var(--text-muted)]">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                          {sug.title}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between">
                          {sug.operator && (
                            <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                              <Robot size={11} />
                              {sug.operator}
                            </div>
                          )}
                          <Badge variant="positive" className="ml-auto">
                            ~${sug.savings}/mo
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="mt-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2.5">
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Total potential savings:{" "}
                    <span className="font-semibold text-[var(--semantic-positive-fg)]">
                      ~${MOCK_SUGGESTIONS.reduce((s, r) => s + r.savings, 0)}/month
                    </span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
