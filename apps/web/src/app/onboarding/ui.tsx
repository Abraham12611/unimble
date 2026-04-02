"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type CompanySize = "1-10" | "11-50" | "51-200" | "201-500" | "500+";
type UseCase = "DevRel" | "Content" | "GTM" | "Community" | "Other";

type StepKey = "profile" | "company" | "useCase" | "workspace" | "invite";

type OnboardingData = {
  fullName: string;
  avatarUrl: string;
  companyName: string;
  companySize: CompanySize;
  useCase: UseCase;
  workspaceName: string;
  inviteEmails: string;
};

export function OnboardingClient() {
  const router = useRouter();
  const steps = useMemo(
    () => [
      { key: "profile" as const, title: "Profile", optional: false },
      { key: "company" as const, title: "Company", optional: false },
      { key: "useCase" as const, title: "Use case", optional: false },
      { key: "workspace" as const, title: "Workspace", optional: false },
      { key: "invite" as const, title: "Invite team", optional: true },
    ],
    []
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    fullName: "",
    avatarUrl: "",
    companyName: "",
    companySize: "1-10",
    useCase: "DevRel",
    workspaceName: "",
    inviteEmails: "",
  });

  const step = steps[stepIndex];
  const progress = ((stepIndex + 1) / steps.length) * 100;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const isStepComplete = (key: StepKey) => {
    if (key === "profile") return data.fullName.trim().length > 0;
    if (key === "company") return data.companyName.trim().length > 0;
    if (key === "useCase") return true;
    if (key === "workspace") return data.workspaceName.trim().length > 0;
    if (key === "invite") return true;
    return false;
  };

  const maxReachableIndex = (() => {
    for (let i = 0; i < steps.length; i += 1) {
      if (!isStepComplete(steps[i].key)) return i;
    }
    return steps.length - 1;
  })();

  const canContinue = isStepComplete(step.key);

  const goNext = () => {
    if (isLast) {
      router.push("/dashboard");
      return;
    }

    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const skipStep = () => {
    if (!step.optional) return;
    goNext();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[18px] font-medium leading-snug">Set up your workspace</h1>
          <p className="text-[12px] leading-relaxed text-[#888888]">
            This takes about 2 minutes. You can change everything later.
          </p>
        </div>
        <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
          Step {stepIndex + 1} of {steps.length}
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#111111]">
          <div className="h-full bg-[#3B82F6]" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-[#555555]">
          <span>{steps[0].title}</span>
          <span>{steps[steps.length - 1].title}</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
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
                  if (disabled) return;
                  setStepIndex(idx);
                }}
                disabled={disabled}
                className={`w-full rounded-[10px] border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-[#3A3A3A] bg-[#1C1C1C]"
                    : disabled
                      ? "border-[#222222] bg-transparent opacity-50"
                      : "border-[#222222] bg-transparent hover:bg-[#111111]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-[13px] font-medium text-[#F0F0F0]">{s.title}</div>
                    <div className="text-[12px] text-[#888888]">
                      {s.optional ? "Optional" : done ? "Completed" : "Required"}
                    </div>
                  </div>
                  <div
                    className={`h-6 w-6 rounded-full border text-center text-[12px] leading-6 ${
                      done
                        ? "border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.1)] text-[#22C55E]"
                        : active
                          ? "border-[#3A82F6] bg-[rgba(59,130,246,0.12)] text-[#3B82F6]"
                          : "border-[#222222] text-[#555555]"
                    }`}
                  >
                    {idx + 1}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-[15px] font-medium">{step.title}</h2>
            <p className="text-[12px] leading-relaxed text-[#888888]">
              {step.key === "profile" && "Tell us how you want to appear in Unimble."}
              {step.key === "company" && "This helps us tailor defaults and templates."}
              {step.key === "useCase" && "Pick your primary workflow focus."}
              {step.key === "workspace" && "Create your first workspace. You can add more later."}
              {step.key === "invite" && "Invite teammates now, or skip and do it later."}
            </p>
          </div>

          {step.key === "profile" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[12px] text-[#666666]">Full name</label>
                <input
                  value={data.fullName}
                  onChange={(e) => setData((d) => ({ ...d, fullName: e.target.value }))}
                  placeholder="e.g. Abraham Dahunsi"
                  className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] outline-none focus:border-[#3A3A3A]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[12px] text-[#666666]">Avatar URL (optional)</label>
                <input
                  value={data.avatarUrl}
                  onChange={(e) => setData((d) => ({ ...d, avatarUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] outline-none focus:border-[#3A3A3A]"
                />
              </div>
            </div>
          )}

          {step.key === "company" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[12px] text-[#666666]">Company name</label>
                <input
                  value={data.companyName}
                  onChange={(e) => setData((d) => ({ ...d, companyName: e.target.value }))}
                  placeholder="e.g. Unimble"
                  className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] outline-none focus:border-[#3A3A3A]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[12px] text-[#666666]">Company size</label>
                <select
                  value={data.companySize}
                  onChange={(e) =>
                    setData((d) => ({ ...d, companySize: e.target.value as CompanySize }))
                  }
                  className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] outline-none focus:border-[#3A3A3A]"
                >
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-200">51-200</option>
                  <option value="201-500">201-500</option>
                  <option value="500+">500+</option>
                </select>
              </div>
            </div>
          )}

          {step.key === "useCase" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["DevRel", "Content", "GTM", "Community", "Other"] as const).map((v) => {
                const selected = data.useCase === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setData((d) => ({ ...d, useCase: v }))}
                    className={`rounded-[14px] border p-4 text-left transition-colors ${
                      selected
                        ? "border-[#6366F1] bg-[rgba(99,102,241,0.12)]"
                        : "border-[#222222] bg-[#111111] hover:bg-[#1C1C1C]"
                    }`}
                  >
                    <div className="text-[13px] font-medium text-[#F0F0F0]">{v}</div>
                    <div className="mt-1 text-[12px] text-[#888888]">
                      {v === "DevRel" && "Community, docs, advocacy, developer education."}
                      {v === "Content" && "Blog posts, newsletters, social, SEO."}
                      {v === "GTM" && "Launches, campaigns, growth experiments."}
                      {v === "Community" && "Events, forums, moderation and engagement."}
                      {v === "Other" && "We’ll still tailor defaults based on your inputs."}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {step.key === "workspace" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[12px] text-[#666666]">Workspace name</label>
                <input
                  value={data.workspaceName}
                  onChange={(e) => setData((d) => ({ ...d, workspaceName: e.target.value }))}
                  placeholder="e.g. Unimble HQ"
                  className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] outline-none focus:border-[#3A3A3A]"
                />
              </div>

              <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-3 text-[12px] text-[#888888]">
                This will become your default workspace. You can invite teammates and create more
                workspaces later.
              </div>
            </div>
          )}

          {step.key === "invite" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[12px] text-[#666666]">Invite emails (optional)</label>
                <textarea
                  value={data.inviteEmails}
                  onChange={(e) => setData((d) => ({ ...d, inviteEmails: e.target.value }))}
                  placeholder="name@company.com\nother@company.com"
                  rows={6}
                  className="w-full resize-none rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] outline-none focus:border-[#3A3A3A]"
                />
              </div>

              <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-3 text-[12px] text-[#888888]">
                No invites will be sent in this step yet — we’re just collecting the list.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-[#222222] pt-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={isFirst}
            className={`h-9 rounded-[10px] border px-3 text-[13px] font-medium transition-colors ${
              isFirst
                ? "cursor-not-allowed border-[#222222] text-[#555555]"
                : "border-[#2A2A2A] text-[#F0F0F0] hover:bg-[#111111]"
            }`}
          >
            Back
          </button>

          {step.optional && (
            <button
              type="button"
              onClick={skipStep}
              className="h-9 rounded-[10px] border border-[#2A2A2A] px-3 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#111111]"
            >
              Skip
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={!canContinue}
          className={`h-9 rounded-[10px] border px-4 text-[13px] font-medium transition-colors ${
            canContinue
              ? "border-[#2A2A2A] bg-[#1C1C1C] text-[#F0F0F0] hover:bg-[#222222]"
              : "cursor-not-allowed border-[#222222] bg-[#111111] text-[#555555]"
          }`}
        >
          {isLast ? "Finish" : "Continue"}
        </button>
      </div>
    </div>
  );
}
