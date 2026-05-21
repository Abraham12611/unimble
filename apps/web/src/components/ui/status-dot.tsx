import { cn } from "@/lib/cn";

export type StatusDotVariant = "healthy" | "warning" | "error" | "neutral";

const dotColors: Record<StatusDotVariant, string> = {
  healthy: "bg-[var(--semantic-positive-fg)]",
  warning: "bg-[var(--semantic-warning-fg)]",
  error: "bg-[var(--semantic-negative-fg)]",
  neutral: "bg-[var(--semantic-neutral-fg)]",
};

export interface StatusDotProps {
  variant: StatusDotVariant;
  /** Optional label text next to the dot */
  label?: string;
  className?: string;
}

/**
 * StatusDot — Inline colored dot indicating live health status.
 * 6px circle with optional label text.
 */
function StatusDot({ variant, label, className }: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColors[variant])}
        aria-hidden="true"
      />
      {label && <span className="text-[12px] text-[var(--text-secondary)]">{label}</span>}
    </span>
  );
}

export { StatusDot };
