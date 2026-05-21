"use client";

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "text-[13px] font-medium",
    "transition-colors duration-[120ms]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chart-primary)]/50",
    "disabled:pointer-events-none disabled:opacity-40",
    "cursor-pointer",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-[var(--bg-card)] border border-[var(--border-default)]",
          "text-[var(--text-primary)]",
          "hover:bg-[var(--bg-card-hover)]",
          "shadow-[var(--shadow-card)]",
        ],
        secondary: [
          "bg-transparent border border-[var(--border-subtle)]",
          "text-[var(--text-secondary)]",
          "hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]",
        ],
        ghost: [
          "bg-transparent border-none",
          "text-[var(--text-secondary)]",
          "hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]",
        ],
        danger: [
          "bg-[var(--semantic-negative-bg)] border border-[var(--semantic-negative-fg)]/20",
          "text-[var(--semantic-negative-fg)]",
          "hover:bg-[var(--semantic-negative-fg)]/20",
        ],
        positive: [
          "bg-[var(--semantic-positive-bg)] border border-[var(--semantic-positive-fg)]/20",
          "text-[var(--semantic-positive-fg)]",
          "hover:bg-[var(--semantic-positive-fg)]/20",
        ],
      },
      size: {
        sm: "h-7 px-2.5 rounded-[6px] text-[12px]",
        md: "h-8 px-3.5 rounded-[6px]",
        lg: "h-9 px-4 rounded-[10px]",
        icon: "h-8 w-8 rounded-[6px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Show loading spinner */
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="h-3.5 w-3.5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
