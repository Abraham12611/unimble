"use client";

import { useEffect, useCallback, useRef, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { overlay, modal as modalVariants } from "@/lib/motion";

export interface ModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Modal description */
  description?: string;
  /** Modal content */
  children: React.ReactNode;
  /** Max width class */
  size?: "sm" | "md" | "lg";
  /** Whether clicking overlay closes the modal */
  closeOnOverlayClick?: boolean;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

/**
 * Modal — Accessible dialog with overlay, animations, and keyboard support.
 */
function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  closeOnOverlayClick = true,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, handleKeyDown]);

  // Focus trap — focus first focusable element on open
  useEffect(() => {
    if (open && contentRef.current) {
      const focusable = contentRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-[var(--bg-overlay)]"
            variants={overlay}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={closeOnOverlayClick ? onClose : undefined}
            aria-hidden="true"
          />

          {/* Content */}
          <motion.div
            ref={contentRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            className={cn(
              "relative w-full rounded-[14px] border border-[var(--border-default)]",
              "bg-[var(--bg-surface)] shadow-[var(--shadow-popup)]",
              "p-6",
              sizeClasses[size]
            )}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Header */}
            {(title || description) && (
              <div className="mb-4">
                {title && (
                  <h2 id={titleId} className="text-[15px] font-medium text-[var(--text-primary)]">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descriptionId} className="mt-1 text-[12px] text-[var(--text-secondary)]">
                    {description}
                  </p>
                )}
              </div>
            )}

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "absolute right-4 top-4",
                "flex h-7 w-7 items-center justify-center rounded-[6px]",
                "text-[var(--text-muted)] transition-colors",
                "hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
              )}
              aria-label="Close"
            >
              <X size={16} />
            </button>

            {/* Body */}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export { Modal };
