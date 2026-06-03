"use client";

import { CheckCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface SelectableCardProps {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description?: string;
  disabled?: boolean;
  size?: "compact" | "default";
}

export function SelectableCard({
  selected,
  onClick,
  icon,
  title,
  description,
  disabled = false,
  size = "default",
}: SelectableCardProps) {
  const isCompact = size === "compact";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative w-full text-left transition-colors duration-200 ${
        isCompact ? "rounded-[10px] px-4 py-3" : "rounded-[14px] p-5"
      } border ${
        selected
          ? "border-[#6366F1] bg-[rgba(99,102,241,0.12)]"
          : disabled
            ? "border-[#222222] bg-[#111111] opacity-50 cursor-not-allowed"
            : "border-[#222222] bg-[#111111] hover:bg-[#1C1C1C]"
      }`}
      style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      {selected && !isCompact && (
        <div className="absolute right-3 top-3">
          <CheckCircle size={16} weight="fill" className="text-[#6366F1]" />
        </div>
      )}

      <div className={`flex items-center gap-3 ${isCompact ? "" : "flex-col items-start"}`}>
        <div
          className={`shrink-0 ${isCompact ? "" : "mb-2"}`}
          style={{ color: selected ? "#6366F1" : "#555555" }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div
            className={`font-medium text-[#F0F0F0] ${isCompact ? "text-[13px]" : "text-[13px]"}`}
          >
            {title}
          </div>
          {description && (
            <div className={`mt-0.5 text-[#888888] ${isCompact ? "text-[12px]" : "text-[12px]"}`}>
              {description}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
