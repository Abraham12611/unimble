"use client";

import { WarningCircle } from "@phosphor-icons/react";

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
}: OnboardingStepLayoutProps) {
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090909] px-6 py-10">
      <div className="w-full max-w-[520px] space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <img src="/unimble-logo.svg" alt="Unimble" className="h-10" />
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px] text-[#888888]">
            <span>
              Step {stepIndex + 1} of {totalSteps}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#111111]">
            <div
              className="h-full bg-[#3B82F6] transition-all"
              style={{
                width: `${progress}%`,
                transitionDuration: "350ms",
                transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              }}
            />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h1 className="text-[20px] font-medium text-[#F0F0F0]">{stepTitle}</h1>
          <p className="text-[13px] leading-relaxed text-[#888888]">{stepDescription}</p>
        </div>

        {/* Error */}
        {saveError && (
          <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">
            <WarningCircle size={16} weight="fill" />
            {saveError}
          </div>
        )}

        {/* Content */}
        <div className="space-y-5">{children}</div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[#222222] pt-5">
          <button
            type="button"
            onClick={onBack}
            disabled={isFirst || saving}
            className={`rounded-[10px] border px-4 py-2.5 text-[13px] font-medium transition-colors duration-200 ${
              isFirst
                ? "cursor-not-allowed border-[#222222] text-[#555555]"
                : "border-[#2A2A2A] text-[#F0F0F0] hover:bg-[#111111]"
            }`}
          >
            Back
          </button>

          <div className="flex items-center gap-2">
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                disabled={saving}
                className="rounded-[10px] px-3 py-2.5 text-[13px] font-medium text-[#888888] transition-colors duration-200 hover:text-[#F0F0F0]"
              >
                Skip for now
              </button>
            )}

            <button
              type="button"
              onClick={onContinue}
              disabled={!canContinue || saving}
              className={`rounded-[10px] border px-5 py-2.5 text-[13px] font-medium transition-colors duration-200 ${
                canContinue && !saving
                  ? "border-[#2A2A2A] bg-[#F0F0F0] text-[#090909] hover:bg-[#e6e6e6]"
                  : "cursor-not-allowed border-[#222222] bg-[#111111] text-[#555555]"
              }`}
            >
              {saving ? "Saving…" : (continueLabel ?? (isLast ? "Finish" : "Continue"))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
