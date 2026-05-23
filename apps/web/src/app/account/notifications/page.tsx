"use client";

import { useState, useRef, useEffect } from "react";
import { EnvelopeSimple, ChatCircle, Bell, FloppyDisk, CheckCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

type NotifKey =
  | "email_failures"
  | "email_approvals"
  | "email_weekly"
  | "email_all"
  | "email_integrations"
  | "slack_failures"
  | "slack_approvals"
  | "slack_all"
  | "inapp_desktop"
  | "inapp_sound";

const DEFAULT_PREFS: Record<NotifKey, boolean> = {
  email_failures: true,
  email_approvals: true,
  email_weekly: true,
  email_all: false,
  email_integrations: true,
  slack_failures: true,
  slack_approvals: true,
  slack_all: false,
  inapp_desktop: true,
  inapp_sound: false,
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors",
        checked ? "bg-[#6366F1]" : "bg-[#2A2A2A]"
      )}
    >
      <div
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-[#F0F0F0] shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export default function AccountNotificationsPage() {
  const [prefs, setPrefs] = useState<Record<NotifKey, boolean>>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  function set(key: NotifKey, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  function handleSave() {
    // TODO: Wire to Convex mutation
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaved(true);
    saveTimerRef.current = setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-6">
      {/* Email notifications */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <EnvelopeSimple size={15} className="text-[#888888]" />
          <div className="text-[15px] font-medium text-[#F0F0F0]">Email Notifications</div>
        </div>
        <div className="mt-4 space-y-3">
          {(
            [
              {
                key: "email_failures",
                label: "Execution failures",
                description: "When a workflow execution fails",
              },
              {
                key: "email_approvals",
                label: "Approval requests",
                description: "When content needs your approval",
              },
              {
                key: "email_weekly",
                label: "Weekly summary",
                description: "Weekly digest of workspace activity",
              },
              {
                key: "email_all",
                label: "All execution completions",
                description: "Notify on every completed execution",
              },
              {
                key: "email_integrations",
                label: "Integration issues",
                description: "When an integration has errors",
              },
            ] as { key: NotifKey; label: string; description: string }[]
          ).map((item) => (
            <div key={item.key} className="flex items-center justify-between py-0.5">
              <div>
                <div className="text-[13px] text-[#F0F0F0]">{item.label}</div>
                <div className="text-[11px] text-[#555555]">{item.description}</div>
              </div>
              <Toggle checked={prefs[item.key]} onChange={(v) => set(item.key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Slack notifications */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <ChatCircle size={15} className="text-[#888888]" />
          <div className="text-[15px] font-medium text-[#F0F0F0]">Slack Notifications</div>
        </div>
        <div className="mt-2 text-[12px] text-[#555555]">
          Channel: <span className="font-mono text-[#888888]">#unimble-alerts</span>
        </div>
        <div className="mt-4 space-y-3">
          {(
            [
              { key: "slack_failures", label: "Execution failures" },
              { key: "slack_approvals", label: "Approval requests" },
              { key: "slack_all", label: "All execution completions" },
            ] as { key: NotifKey; label: string }[]
          ).map((item) => (
            <div key={item.key} className="flex items-center justify-between py-0.5">
              <div className="text-[13px] text-[#F0F0F0]">{item.label}</div>
              <Toggle checked={prefs[item.key]} onChange={(v) => set(item.key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* In-app notifications */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-[#888888]" />
          <div className="text-[15px] font-medium text-[#F0F0F0]">In-App Notifications</div>
        </div>
        <div className="mt-4 space-y-3">
          {(
            [
              { key: "inapp_desktop", label: "Show desktop notifications" },
              { key: "inapp_sound", label: "Play sound for alerts" },
            ] as { key: NotifKey; label: string }[]
          ).map((item) => (
            <div key={item.key} className="flex items-center justify-between py-0.5">
              <div className="text-[13px] text-[#F0F0F0]">{item.label}</div>
              <Toggle checked={prefs[item.key]} onChange={(v) => set(item.key, v)} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className={cn(
            "flex items-center gap-1.5 rounded-[6px] border px-4 py-2 text-[13px] font-medium transition-colors",
            saved
              ? "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] text-[#22C55E]"
              : "border-[#2A2A2A] bg-[#1C1C1C] text-[#F0F0F0] hover:bg-[#222222]"
          )}
        >
          {saved ? <CheckCircle size={14} weight="fill" /> : <FloppyDisk size={14} />}
          {saved ? "Saved" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
