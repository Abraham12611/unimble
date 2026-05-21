"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label text above the input */
  label?: string;
  /** Error message below the input */
  error?: string;
  /** Helper text below the input */
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[12px] text-[var(--text-label)]">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            "h-9 w-full rounded-[6px] border px-3 text-[13px]",
            "bg-[var(--bg-input)] text-[var(--text-primary)]",
            "placeholder:text-[var(--text-muted)]",
            "transition-colors duration-[120ms]",
            "focus-visible:outline-none",
            error
              ? "border-[var(--semantic-negative-fg)] focus-visible:border-[var(--semantic-negative-fg)]"
              : "border-[var(--border-subtle)] focus-visible:border-[var(--border-focus)]",
            "disabled:cursor-not-allowed disabled:opacity-40",
            className
          )}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-[11px] text-[var(--semantic-negative-fg)]">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-[11px] text-[var(--text-muted)]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };

/* ---------------------------------------------------------------------------
 * Textarea
 * --------------------------------------------------------------------------- */

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[12px] text-[var(--text-label)]">
            {label}
          </label>
        )}
        <textarea
          id={inputId}
          ref={ref}
          className={cn(
            "min-h-[80px] w-full rounded-[6px] border px-3 py-2 text-[13px]",
            "bg-[var(--bg-input)] text-[var(--text-primary)]",
            "placeholder:text-[var(--text-muted)]",
            "transition-colors duration-[120ms] resize-y",
            "focus-visible:outline-none",
            error
              ? "border-[var(--semantic-negative-fg)]"
              : "border-[var(--border-subtle)] focus-visible:border-[var(--border-focus)]",
            "disabled:cursor-not-allowed disabled:opacity-40",
            className
          )}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-[11px] text-[var(--semantic-negative-fg)]">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-[11px] text-[var(--text-muted)]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
