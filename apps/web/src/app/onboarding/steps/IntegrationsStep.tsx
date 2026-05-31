"use client";

import {
  ChatTeardropText,
  DiscordLogo,
  Notepad,
  GithubLogo,
  XLogo,
  LinkedinLogo,
  Check,
  Info,
} from "@phosphor-icons/react";
import type { OnboardingData, IntegrationService } from "../types";
import { INTEGRATION_SERVICES } from "../types";

interface IntegrationsStepProps {
  data: Pick<OnboardingData, "integrations">;
  onChange: (data: Pick<OnboardingData, "integrations">) => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  ChatTeardropText: <ChatTeardropText size={32} />,
  DiscordLogo: <DiscordLogo size={32} />,
  Notepad: <Notepad size={32} />,
  GithubLogo: <GithubLogo size={32} />,
  XLogo: <XLogo size={32} />,
  LinkedinLogo: <LinkedinLogo size={32} />,
};

export function IntegrationsStep({ data, onChange }: IntegrationsStepProps) {
  const toggleIntegration = (service: IntegrationService) => {
    const next = data.integrations.map((i) =>
      i.service === service ? { ...i, connected: !i.connected } : i
    );
    onChange({ integrations: next });
  };

  const connectedCount = data.integrations.filter((i) => i.connected).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {INTEGRATION_SERVICES.map((service) => {
          const integration = data.integrations.find((i) => i.service === service.value) ?? {
            service: service.value,
            connected: false,
          };
          const isConnected = integration.connected;

          return (
            <div
              key={service.value}
              className={`rounded-[14px] border p-5 transition-colors duration-200 ${
                isConnected
                  ? "border-[#22C55E] bg-[rgba(34,197,94,0.08)]"
                  : "border-[#222222] bg-[#111111]"
              }`}
            >
              <div className="mb-2" style={{ color: isConnected ? "#22C55E" : "#555555" }}>
                {ICON_MAP[service.icon]}
              </div>
              <div className="text-[13px] font-medium text-[#F0F0F0]">{service.label}</div>
              <button
                type="button"
                onClick={() => toggleIntegration(service.value)}
                className={`mt-2 inline-flex items-center gap-1 rounded-[6px] border px-3 py-1.5 text-[12px] font-medium transition-colors duration-200 ${
                  isConnected
                    ? "border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.1)] text-[#22C55E]"
                    : "border-[#2A2A2A] bg-transparent text-[#F0F0F0] hover:bg-[#1C1C1C]"
                }`}
              >
                {isConnected && <Check size={12} weight="bold" />}
                {isConnected ? "Connected" : "Connect"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-[10px] border border-[#222222] bg-[#111111] p-3">
        <Info size={16} className="mt-0.5 shrink-0 text-[#3B82F6]" />
        <span className="text-[12px] text-[#888888]">
          Connected tools appear in your integration settings and can be used by operators
          immediately.
        </span>
      </div>

      {connectedCount > 0 && (
        <p className="text-[12px] text-[#888888]">
          {connectedCount} tool{connectedCount !== 1 ? "s" : ""} connected
        </p>
      )}
    </div>
  );
}
