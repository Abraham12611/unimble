"use client";

import type { OnboardingData } from "../types";

interface WorkspaceStepProps {
  data: Pick<OnboardingData, "workspaceName">;
  onChange: (data: Pick<OnboardingData, "workspaceName">) => void;
}

export function WorkspaceStep({ data, onChange }: WorkspaceStepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="onboarding-workspace-name" className="text-[12px] text-[#666666]">
          Workspace name
        </label>
        <input
          id="onboarding-workspace-name"
          value={data.workspaceName}
          onChange={(e) => onChange({ workspaceName: e.target.value })}
          placeholder="e.g. Unimble HQ"
          className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none transition-colors duration-200 focus:border-[#3A3A3A]"
        />
      </div>

      <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-3 text-[12px] text-[#888888]">
        This will become your default workspace. You can invite teammates and create more workspaces
        later.
      </div>
    </div>
  );
}
