"use client";

import { Bell, EnvelopeSimple, ChatCircle } from "@phosphor-icons/react";

function DisabledToggle({ on }: { on: boolean }) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon — will be available after connecting integrations"
      className="relative h-5 w-9 cursor-not-allowed rounded-full opacity-50"
    >
      <div className={`h-full w-full rounded-full ${on ? "bg-[#6366F1]" : "bg-[#2A2A2A]"}`}>
        <div
          className={`h-5 w-5 rounded-full bg-[#F0F0F0] shadow transition-transform ${
            on ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </div>
    </button>
  );
}

/**
 * Notification settings placeholder.
 * Actual notification delivery (email via Resend/SendGrid, Slack webhooks)
 * will be wired up in Phase 5 (Integrations).
 */
export default function NotificationSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <EnvelopeSimple size={16} className="text-[#888888]" />
          <div className="text-[15px] font-medium text-[#F0F0F0]">Email Notifications</div>
          <span className="rounded-[6px] bg-[rgba(160,160,160,0.08)] px-2 py-0.5 text-[11px] font-medium text-[#555555]">
            Coming soon
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {[
            {
              label: "Execution failures",
              description: "Get notified when a workflow execution fails",
              defaultOn: true,
            },
            {
              label: "Approval requests",
              description: "Get notified when content needs your approval",
              defaultOn: true,
            },
            {
              label: "Weekly summary",
              description: "Receive a weekly digest of workspace activity",
              defaultOn: true,
            },
            {
              label: "All execution completions",
              description: "Get notified for every completed execution",
              defaultOn: false,
            },
            {
              label: "Integration issues",
              description: "Get notified when an integration has errors",
              defaultOn: true,
            },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-1">
              <div>
                <div className="text-[13px] text-[#F0F0F0]">{item.label}</div>
                <div className="text-[12px] text-[#555555]">{item.description}</div>
              </div>
              <DisabledToggle on={item.defaultOn} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <ChatCircle size={16} className="text-[#888888]" />
          <div className="text-[15px] font-medium text-[#F0F0F0]">Slack Notifications</div>
          <span className="rounded-[6px] bg-[rgba(160,160,160,0.08)] px-2 py-0.5 text-[11px] font-medium text-[#555555]">
            Coming soon
          </span>
        </div>
        <div className="mt-3 text-[12px] text-[#555555]">
          Slack integration will be available after connecting Slack in the Integrations settings.
        </div>
      </div>

      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-[#888888]" />
          <div className="text-[15px] font-medium text-[#F0F0F0]">In-App Notifications</div>
          <span className="rounded-[6px] bg-[rgba(160,160,160,0.08)] px-2 py-0.5 text-[11px] font-medium text-[#555555]">
            Coming soon
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {[
            { label: "Desktop notifications", defaultOn: true },
            { label: "Sound for alerts", defaultOn: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-1">
              <div className="text-[13px] text-[#F0F0F0]">{item.label}</div>
              <DisabledToggle on={item.defaultOn} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-3 text-[12px] text-[#555555]">
        Notification delivery is coming soon. These settings will take effect once email and Slack
        integrations are connected in Phase 5.
      </div>
    </div>
  );
}
