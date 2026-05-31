"use client";

import type { StepDef } from "../types";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";

interface OnboardingStepLayoutProps {
  stepIndex: number;
  totalSteps: number;
  stepTitle: string;
  stepDescription: string;
  children: React.ReactNode;
  onBack: () => void;
  onContinue: () => void;
  onSkip?: () => void;
  canContinue: boolean;
  continueLabel?: string;
  isFirst?: boolean;
  isLast?: boolean;
  saving?: boolean;
  saveError?: string | null;
  steps: StepDef[];
  onStepClick?: (index: number) => void;
  maxReachableIndex: number;
}

export function OnboardingStepLayout({
  stepIndex,
  totalSteps,
  stepTitle,
  stepDescription,
  children,
  onBack,
  onContinue,
  onSkip,
  canContinue,
  continueLabel,
  isFirst = false,
  isLast = false,
  saving = false,
  saveError = null,
  steps,
  onStepClick,
  maxReachableIndex,
}: OnboardingStepLayoutProps) {
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div className="flex min-h-screen items-start justify-center bg-[#090909] p-4 pt-8 sm:p-6 sm:pt-12">
      <div className="w-full max-w-[800px] space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-[18px] font-medium leading-snug text-[#F0F0F0]">
              Set up your workspace
            </h1>
            <p className="text-[12px] leading-relaxed text-[#888888]">
              This takes about 3 minutes. You can change everything later.
            </p>
          </div>
          <div className="shrink-0 text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
            Step {stepIndex + 1} of {totalSteps}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#111111]">
            <div
              className="h-full bg-[#3B82F6] transition-all duration-350"
              style={{
                width: `${progress}%`,
                transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
            <span>{steps[0].title}</span>
            <span>{steps[steps.length - 1].title}</span>
          </div>
        </div>

        {/* Content grid */}
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <div className="space-y-2">
            {steps.map((s, idx) => {
              const active = idx === stepIndex;
              const done = idx < stepIndex;
              const disabled = idx > maxReachableIndex;

              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    if (disabled || !onStepClick) return;
                    onStepClick(idx);
                  }}
                  disabled={disabled}
                  className={`w-full rounded-[10px] border px-3 py-2 text-left transition-colors duration-200 ${
                    active
                      ? "border-[#3A3A3A] bg-[#1C1C1C]"
                      : disabled
                        ? "border-[#222222] bg-transparent opacity-50"
                        : "border-[#222222] bg-transparent hover:bg-[#111111]"
                  }`}
                  style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-[13px] font-medium text-[#F0F0F0]">{s.title}</div>
                      <div className="text-[12px] text-[#888888]">
                        {s.optional ? "Optional" : done ? "Completed" : "Required"}
                      </div>
                    </div>
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] ${
                        done
                          ? "border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.1)] text-[#22C55E]"
                          : active
                            ? "border-[#3B82F6] bg-[rgba(59,130,246,0.12)] text-[#3B82F6]"
                            : "border-[#222222] text-[#555555]"
                      }`}
                    >
                      {done ? <CheckCircle size={14} weight="fill" /> : idx + 1}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Main content */}
          <div className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-[15px] font-medium text-[#F0F0F0]">{stepTitle}</h2>
              <p className="text-[12px] leading-relaxed text-[#888888]">{stepDescription}</p>
            </div>

            {saveError && (
              <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">
                <WarningCircle size={16} weight="fill" />
                {saveError}
              </div>
            )}

            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-[#222222] pt-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={isFirst || saving}
              className={`h-9 rounded-[10px] border px-3 text-[13px] font-medium transition-colors duration-200 ${
                isFirst
                  ? "cursor-not-allowed border-[#222222] text-[#555555]"
                  : "border-[#2A2A2A] text-[#F0F0F0] hover:bg-[#111111]"
              }`}
            >
              Back
            </button>

            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                disabled={saving}
                className="h-9 rounded-[10px] px-3 text-[13px] font-medium text-[#888888] transition-colors duration-200 hover:text-[#F0F0F0]"
              >
                Skip for now
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue || saving}
            className={`h-9 rounded-[10px] border px-4 text-[13px] font-medium transition-colors duration-200 ${
              canContinue && !saving
                ? "border-[#2A2A2A] bg-[#1C1C1C] text-[#F0F0F0] hover:bg-[#222222]"
                : "cursor-not-allowed border-[#222222] bg-[#111111] text-[#555555]"
            }`}
          >
            {saving ? "Saving…" : (continueLabel ?? (isLast ? "Finish" : "Continue"))}
          </button>
        </div>
      </div>
    </div>
  );
}
