"use client";

import { cn } from "@/lib/cn";
import { ArrowUp, ArrowDown } from "@phosphor-icons/react";

export interface StatCardProps {
  /** Card title/label */
  title: string;
  /** Main metric value */
  value: string | number;
  /** Optional unit (ms, k, $, %) */
  unit?: string;
  /** Delta percentage (positive = up, negative = down) */
  delta?: number;
  /** Delta comparison label (e.g., "vs last week") */
  deltaLabel?: string;
  /** Optional icon component */
  icon?: React.ReactNode;
  /** Mini bar chart data (array of values 0-1) */
  sparkline?: number[];
  className?: string;
}

/**
 * StatCard — KPI metric card with trend delta and optional mini sparkline.
 *
 * Follows the design system statCard spec:
 * - Header: icon + title
 * - Metric: large numeral + unit | mini bar chart
 * - Delta: colored arrow + percentage + comparison label
 */
function StatCard({
  title,
  value,
  unit,
  delta,
  deltaLabel,
  icon,
  sparkline,
  className,
}: StatCardProps) {
  const isPositive = delta !== undefined && delta >= 0;
  const isNegative = delta !== undefined && delta < 0;

  return (
    <div
      className={cn(
        "flex min-h-[120px] flex-col rounded-[14px] border border-[var(--border-subtle)]",
        "bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
        <span className="text-[12px] text-[var(--text-label)]">{title}</span>
      </div>

      {/* Metric row */}
      <div className="mt-3 flex items-end justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--text-primary)]">
            {value}
          </span>
          {unit && (
            <span className="text-[16px] font-medium leading-none tracking-[-0.01em] text-[var(--text-secondary)]">
              {unit}
            </span>
          )}
        </div>

        {/* Mini sparkline */}
        {sparkline && sparkline.length > 0 && (
          <div className="flex h-10 items-end gap-[2px]">
            {sparkline.map((val, i) => {
              const isLast = i === sparkline.length - 1;
              return (
                <div
                  key={i}
                  className={cn(
                    "w-[5px] rounded-[1px]",
                    isLast ? "bg-[var(--chart-bar-active)]" : "bg-[var(--chart-bar)]"
                  )}
                  style={{ height: `${Math.max(val * 100, 8)}%` }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Delta */}
      {delta !== undefined && (
        <div className="mt-2 flex items-center gap-1">
          {isPositive && (
            <ArrowUp size={12} weight="bold" className="text-[var(--semantic-positive-fg)]" />
          )}
          {isNegative && (
            <ArrowDown size={12} weight="bold" className="text-[var(--semantic-negative-fg)]" />
          )}
          <span
            className={cn(
              "text-[12px] font-medium",
              isPositive && "text-[var(--semantic-positive-fg)]",
              isNegative && "text-[var(--semantic-negative-fg)]"
            )}
          >
            {Math.abs(delta)}%
          </span>
          {deltaLabel && <span className="text-[12px] text-[var(--text-muted)]">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}

export { StatCard };
