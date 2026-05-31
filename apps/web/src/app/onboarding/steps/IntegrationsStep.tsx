"use client";

import { useState, useEffect } from "react";
import {
  ChatTeardropText,
  DiscordLogo,
  Notepad,
  GithubLogo,
  XLogo,
  LinkedinLogo,
  Check,
  Info,
  Spinner,
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
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (service: IntegrationService) => {
    setError(null);

    const next = data.integrations.map((i) =>
      i.service === service ? { ...i, connecting: true } : i
    );
    onChange({ integrations: next });

    try {
      const res = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to generate connection link");
      }

      const { redirectUrl } = (await res.json()) as { redirectUrl: string };

      const popup = window.open(
        redirectUrl,
        "composio-auth",
        "width=600,height=700,scrollbars=yes,status=yes"
      );

      if (!popup) {
        throw new Error("Popup blocked. Please allow popups for this site.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setError(msg);
      const reset = data.integrations.map((i) =>
        i.service === service ? { ...i, connecting: false } : i
      );
      onChange({ integrations: reset });
    }
  };

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "COMPOSIO_INTEGRATION_COMPLETE") return;

      const { status, connectedAccountId } = event.data as {
        status: string;
        connectedAccountId?: string;
      };

      if (status === "success" && connectedAccountId) {
        const connectingService = data.integrations.find((i) => i.connecting)?.service;
        if (connectingService) {
          const next = data.integrations.map((i) =>
            i.service === connectingService
              ? {
                  ...i,
                  connected: true,
                  connecting: false,
                  connectedAccountId,
                }
              : { ...i, connecting: false }
          );
          onChange({ integrations: next });
        }
      } else {
        const reset = data.integrations.map((i) => ({
          ...i,
          connecting: false,
        }));
        onChange({ integrations: reset });
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [data.integrations, onChange]);

  const connectedCount = data.integrations.filter((i) => i.connected).length;

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {INTEGRATION_SERVICES.map((service) => {
          const integration = data.integrations.find((i) => i.service === service.value) ?? {
            service: service.value,
            connected: false,
          };
          const isConnected = integration.connected;
          const isConnecting = integration.connecting;

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
                onClick={() => handleConnect(service.value)}
                disabled={isConnected || isConnecting}
                className={`mt-2 inline-flex items-center gap-1 rounded-[6px] border px-3 py-1.5 text-[12px] font-medium transition-colors duration-200 ${
                  isConnected
                    ? "border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.1)] text-[#22C55E]"
                    : isConnecting
                      ? "cursor-wait border-[#2A2A2A] bg-transparent text-[#888888]"
                      : "border-[#2A2A2A] bg-transparent text-[#F0F0F0] hover:bg-[#1C1C1C]"
                }`}
              >
                {isConnected && <Check size={12} weight="bold" />}
                {isConnecting && <Spinner size={12} className="animate-spin" />}
                {isConnecting ? "Connecting..." : isConnected ? "Connected" : "Connect"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-[10px] border border-[#222222] bg-[#111111] p-3">
        <Info size={16} className="mt-0.5 shrink-0 text-[#3B82F6]" />
        <span className="text-[12px] text-[#888888]">
          You will be redirected to each platform to authorize access. You can manage or revoke
          connections later in Settings.
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
