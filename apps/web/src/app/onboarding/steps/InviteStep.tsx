"use client";

import { useState } from "react";
import { Users } from "@phosphor-icons/react";
import { TagInput } from "../components";
import type { OnboardingData } from "../types";

interface InviteStepProps {
  data: Pick<OnboardingData, "inviteEmails" | "workspaceName">;
  onChange: (data: Pick<OnboardingData, "inviteEmails">) => void;
}

export function InviteStep({ data, onChange }: InviteStepProps) {
  const [mode, setMode] = useState<"tags" | "textarea">("tags");

  const emails = data.inviteEmails
    .split(/[,\n;]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  const handleTagsChange = (tags: string[]) => {
    onChange({ inviteEmails: tags.join("\n") });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="onboarding-invite-emails" className="text-[12px] text-[#666666]">
          Invite emails
        </label>

        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode("tags")}
            className={`text-[12px] ${mode === "tags" ? "text-[#F0F0F0]" : "text-[#555555]"} hover:text-[#F0F0F0]`}
          >
            Enter one by one
          </button>
          <span className="text-[#222222]">|</span>
          <button
            type="button"
            onClick={() => setMode("textarea")}
            className={`text-[12px] ${mode === "textarea" ? "text-[#F0F0F0]" : "text-[#555555]"} hover:text-[#F0F0F0]`}
          >
            Paste multiple
          </button>
        </div>

        {mode === "tags" ? (
          <TagInput tags={emails} onChange={handleTagsChange} placeholder="name@company.com" />
        ) : (
          <textarea
            id="onboarding-invite-emails"
            value={data.inviteEmails}
            onChange={(e) => onChange({ inviteEmails: e.target.value })}
            placeholder="name@company.com, other@company.com"
            rows={6}
            className="w-full resize-none rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none transition-colors duration-200 focus:border-[#3A3A3A]"
          />
        )}
      </div>

      {emails.length > 0 && (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#222222] bg-[#111111] p-3">
          <Users size={16} className="shrink-0 text-[#3B82F6]" />
          <span className="text-[12px] text-[#888888]">
            {emails.length} {emails.length === 1 ? "person" : "people"} will be invited
            {data.workspaceName ? ` to "${data.workspaceName}"` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
