import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------------------
 * Grid — Responsive grid layouts matching design system spacing
 * --------------------------------------------------------------------------- */

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns (responsive by default) */
  cols?: 1 | 2 | 3 | 4;
  /** Gap size */
  gap?: "sm" | "md" | "lg";
}

const colClasses = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
} as const;

const gapClasses = {
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
} as const;

/**
 * Grid — Responsive CSS grid with design system gap values.
 */
function Grid({ cols = 3, gap = "md", className, children, ...props }: GridProps) {
  return (
    <div className={cn("grid", colClasses[cols], gapClasses[gap], className)} {...props}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * StatCardGrid — Specific grid for stat/KPI cards
 * Uses auto-fill with minmax for responsive stat cards
 * --------------------------------------------------------------------------- */

function StatCardGrid({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * TwoColumnLayout — Main content + sidebar panel split
 * --------------------------------------------------------------------------- */

export interface TwoColumnLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Width of the right panel */
  panelWidth?: "sm" | "md" | "lg";
}

const panelWidthClasses = {
  sm: "lg:grid-cols-[1fr_320px]",
  md: "lg:grid-cols-[1fr_420px]",
  lg: "lg:grid-cols-[1fr_520px]",
} as const;

function TwoColumnLayout({
  panelWidth = "md",
  className,
  children,
  ...props
}: TwoColumnLayoutProps) {
  return (
    <div
      className={cn("grid grid-cols-1 gap-4", panelWidthClasses[panelWidth], className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Grid, StatCardGrid, TwoColumnLayout };
