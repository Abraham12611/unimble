"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Folder, Target, Robot, Plugs, Users } from "@phosphor-icons/react";
import type { OnboardingData } from "../types";

interface CompletionStepProps {
  data: OnboardingData;
}

export function CompletionStep({ data }: CompletionStepProps) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (secondsLeft === 0) {
      router.push("/dashboard");
    }
  }, [secondsLeft, router]);

  const connectedCount = data.integrations.filter((i) => i.connected).length;
  const inviteCount = data.inviteEmails
    .split(/[,\n;]+/)
    .map((e) => e.trim())
    .filter(Boolean).length;

  const summary = [
    { icon: <Folder size={16} />, label: data.workspaceName || "My Workspace" },
    { icon: <Target size={16} />, label: data.useCase || "General" },
    {
      icon: <Robot size={16} />,
      label: `${data.operatorTemplates.length} operator${data.operatorTemplates.length !== 1 ? "s" : ""} configured`,
    },
    {
      icon: <Plugs size={16} />,
      label:
        connectedCount > 0
          ? `${connectedCount} integration${connectedCount !== 1 ? "s" : ""} connected`
          : "No integrations yet",
    },
    ...(inviteCount > 0
      ? [
          {
            icon: <Users size={16} />,
            label: `${inviteCount} invite${inviteCount !== 1 ? "s" : ""} sent`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090909] p-6">
      <div
        className="w-full max-w-[420px] rounded-[14px] border border-[#222222] bg-[#161616] p-8"
        style={{
          boxShadow: "0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="animate-in fade-in zoom-in duration-400">
            <CheckCircle size={48} weight="fill" className="text-[#22C55E]" />
          </div>

          <h1 className="mt-4 text-[18px] font-medium text-[#F0F0F0]">You're all set!</h1>

          <p className="mt-2 text-[13px] text-[#888888]">Your workspace is ready to go.</p>

          <div className="mt-4 w-full rounded-[10px] border border-[#222222] bg-[#111111] p-4 text-left">
            {summary.map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5">
                <span className="text-[#555555]">{item.icon}</span>
                <span className="text-[12px] text-[#F0F0F0]">{item.label}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-6 w-full rounded-[6px] bg-[#F0F0F0] px-6 py-2.5 text-[13px] font-medium text-[#090909] transition-colors duration-200 hover:bg-[#e6e6e6]"
          >
            Go to dashboard
          </button>

          <p className="mt-3 text-[12px] text-[#555555]">Taking you there in {secondsLeft}s…</p>

          {/* Countdown bar */}
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#111111]">
            <div
              className="h-full bg-[#3B82F6]"
              style={{
                width: `${(secondsLeft / 5) * 100}%`,
                transition: "width 1s linear",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
