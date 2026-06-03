"use client";

import type { OnboardingData, CompanySize } from "../types";

interface CompanyStepProps {
  data: Pick<OnboardingData, "companyName" | "companySize">;
  onChange: (data: Pick<OnboardingData, "companyName" | "companySize">) => void;
}

const SIZE_OPTIONS: { value: CompanySize; label: string }[] = [
  { value: "1-10", label: "1-10" },
  { value: "11-50", label: "11-50" },
  { value: "51-200", label: "51-200" },
  { value: "201-500", label: "201-500" },
  { value: "500+", label: "500+" },
];

export function CompanyStep({ data, onChange }: CompanyStepProps) {
  return (
    <div className="space-y-5">
      {/* Company Name */}
      <div className="space-y-1">
        <label htmlFor="onboarding-company-name" className="text-[12px] text-[#666666]">
          Company name
        </label>
        <input
          id="onboarding-company-name"
          value={data.companyName}
          onChange={(e) => onChange({ ...data, companyName: e.target.value })}
          placeholder="e.g. Unimble"
          className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none transition-colors duration-200 focus:border-[#3A3A3A]"
        />
      </div>

      {/* Company Size */}
      <div className="space-y-2">
        <label className="text-[12px] text-[#666666]">Company size</label>
        <div className="grid grid-cols-5 gap-2">
          {SIZE_OPTIONS.map((size) => (
            <button
              key={size.value}
              type="button"
              onClick={() => onChange({ ...data, companySize: size.value })}
              className={`rounded-[10px] border py-2.5 text-center text-[13px] font-medium transition-colors duration-200 ${
                data.companySize === size.value
                  ? "border-[#6366F1] bg-[rgba(99,102,241,0.12)] text-[#F0F0F0]"
                  : "border-[#222222] bg-[#111111] text-[#888888] hover:bg-[#1C1C1C]"
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      {/* Helper */}
      <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-3 text-[12px] text-[#888888]">
        This helps us recommend the right operators and set sensible rate limits.
      </div>
    </div>
  );
}
