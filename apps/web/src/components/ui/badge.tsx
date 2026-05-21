import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Badge — Status/action label with semantic color fill.
 *
 * Maps directly to design system badge variants:
 * - healthy (positive) — green
 * - warning — amber
 * - blocked (negative) — red
 * - retried (info) — blue
 * - fallback (neutral) — gray
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1",
    "px-2 py-0.5 rounded-[6px]",
    "text-[12px] font-medium leading-tight",
    "whitespace-nowrap",
  ],
  {
    variants: {
      variant: {
        positive: "bg-[var(--semantic-positive-bg)] text-[var(--semantic-positive-fg)]",
        negative: "bg-[var(--semantic-negative-bg)] text-[var(--semantic-negative-fg)]",
        warning: "bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-fg)]",
        info: "bg-[var(--semantic-info-bg)] text-[var(--semantic-info-fg)]",
        neutral: "bg-[var(--semantic-neutral-bg)] text-[var(--semantic-neutral-fg)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
