"use client";

import { Check } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface MultiSelectCardProps {
  selected: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}

export function MultiSelectCard({
  selected,
  onToggle,
  icon,
  title,
  description,
  disabled = false,
}: MultiSelectCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`flex w-full items-start gap-4 rounded-[14px] border p-5 text-left transition-colors duration-200 ${
        selected
          ? "border-[#6366F1] bg-[rgba(99,102,241,0.12)]"
          : disabled
            ? "border-[#222222] bg-[#111111] opacity-50 cursor-not-allowed"
            : "border-[#222222] bg-[#111111] hover:bg-[#1C1C1C]"
      }`}
      style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      {/* Checkbox */}
      <div
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-200 ${
          selected ? "border-[#6366F1] bg-[#6366F1]" : "border-[#2A2A2A] bg-transparent"
        }`}
      >
        {selected && <Check size={12} weight="bold" className="text-[#F0F0F0]" />}
      </div>

      {/* Content */}
      <div className="min-w-0">
        <div className="mb-1" style={{ color: selected ? "#6366F1" : "#555555" }}>
          {icon}
        </div>
        <div className="text-[13px] font-medium text-[#F0F0F0]">{title}</div>
        <div className="mt-1 text-[12px] text-[#888888]">{description}</div>
      </div>
    </button>
  );
}
