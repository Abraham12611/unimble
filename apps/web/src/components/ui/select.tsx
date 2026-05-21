"use client";

import { forwardRef, useId } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, options, placeholder, id, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-[12px] text-[var(--text-label)]">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            className={cn(
              "h-9 w-full appearance-none rounded-[6px] border px-3 pr-8 text-[13px]",
              "bg-[var(--bg-input)] text-[var(--text-primary)]",
              "transition-colors duration-[120ms]",
              "focus-visible:outline-none",
              error
                ? "border-[var(--semantic-negative-fg)]"
                : "border-[var(--border-subtle)] focus-visible:border-[var(--border-focus)]",
              "disabled:cursor-not-allowed disabled:opacity-40",
              className
            )}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <CaretDown
            size={14}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
        </div>
        {error && (
          <p id={`${selectId}-error`} className="text-[11px] text-[var(--semantic-negative-fg)]">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${selectId}-hint`} className="text-[11px] text-[var(--text-muted)]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
