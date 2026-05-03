"use client";

import { useState } from "react";
import {
  Plugs,
  X,
  Check,
  ArrowSquareOut,
  Key,
  Globe,
  ChartBar,
  EnvelopeSimple,
  ChatCircle,
  FileText,
  VideoCamera,
  MusicNote,
} from "@phosphor-icons/react";

type Integration = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ElementType;
  iconColor: string;
  authType: "oauth" | "api_key";
  connected?: boolean;
  comingSoon?: boolean;
};

const INTEGRATIONS: Integration[] = [
  { id: "twitter", name: "X (Twitter)", description: "Publish threads, monitor mentions, engage with your audience.", category: "social", icon: ChatCircle, iconColor: "text-[#1DA1F2] bg-[rgba(29,161,242,0.1)]", authType: "oauth" },
  { id: "linkedin", name: "LinkedIn", description: "Post articles and updates to your professional network.", category: "social", icon: Globe, iconColor: "text-[#0A66C2] bg-[rgba(10,102,194,0.1)]", authType: "oauth" },
  { id: "substack", name: "Substack", description: "Publish newsletters and manage your subscriber list.", category: "publishing", icon: EnvelopeSimple, iconColor: "text-[#FF6719] bg-[rgba(255,103,25,0.1)]", authType: "api_key" },
  { id: "medium", name: "Medium", description: "Publish long-form articles to your Medium publication.", category: "publishing", icon: FileText, iconColor: "text-[#F0F0F0] bg-[rgba(240,240,240,0.08)]", authType: "api_key" },
  { id: "ghost", name: "Ghost", description: "Sync posts to your Ghost-powered blog or newsletter.", category: "publishing", icon: FileText, iconColor: "text-[#15171A] bg-[rgba(240,240,240,0.08)]", authType: "api_key" },
  { id: "slack", name: "Slack", description: "Get notifications and post content updates to channels.", category: "notifications", icon: ChatCircle, iconColor: "text-[#E01E5A] bg-[rgba(224,30,90,0.1)]", authType: "oauth" },
  { id: "notion", name: "Notion", description: "Sync content calendars and publish to Notion databases.", category: "productivity", icon: FileText, iconColor: "text-[#F0F0F0] bg-[rgba(240,240,240,0.08)]", authType: "oauth" },
  { id: "youtube", name: "YouTube", description: "Publish video descriptions and manage channel content.", category: "video", icon: VideoCamera, iconColor: "text-[#FF0000] bg-[rgba(255,0,0,0.1)]", authType: "oauth", comingSoon: true },
  { id: "spotify", name: "Spotify / Podcasts", description: "Sync podcast episode notes and promotional content.", category: "audio", icon: MusicNote, iconColor: "text-[#1DB954] bg-[rgba(29,185,84,0.1)]", authType: "api_key", comingSoon: true },
  { id: "google_analytics", name: "Google Analytics", description: "Pull content performance metrics into analytics dashboards.", category: "analytics", icon: ChartBar, iconColor: "text-[#F59E0B] bg-[rgba(245,158,11,0.1)]", authType: "oauth", comingSoon: true },
  { id: "posthog", name: "PostHog", description: "Import product analytics events to inform content strategy.", category: "analytics", icon: ChartBar, iconColor: "text-[#F0F0F0] bg-[rgba(240,240,240,0.08)]", authType: "api_key", comingSoon: true },
  { id: "airtable", name: "Airtable", description: "Use Airtable bases as content calendars or data sources.", category: "productivity", icon: Globe, iconColor: "text-[#FFBF00] bg-[rgba(255,191,0,0.1)]", authType: "api_key", comingSoon: true },
];

const CATEGORIES = ["all", "social", "publishing", "notifications", "productivity", "analytics", "video", "audio"];

function ConnectModal({
  integration,
  onClose,
}: {
  integration: Integration;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const Icon = integration.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-[16px] border border-[#2A2A2A] bg-[#161616] p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${integration.iconColor}`}>
              <Icon size={20} />
            </div>
            <div>
              <div className="text-[15px] font-medium">Connect {integration.name}</div>
              <div className="text-[12px] text-[#555555]">{integration.description}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#555555] hover:text-[#888888]">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5">
          {integration.authType === "oauth" ? (
            <div className="space-y-3">
              <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-3 text-[12px] text-[#888888]">
                You'll be redirected to {integration.name} to grant permission. Unimble will only request the scopes needed to publish content.
              </div>
              <button type="button"
                className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2.5 text-[13px] font-medium hover:bg-[#222222]">
                <ArrowSquareOut size={14} /> Connect via OAuth
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[12px] text-[#666666]">API Key</label>
                <div className="relative">
                  <Key size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555555]" />
                  <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-…"
                    className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] pl-8 pr-3 py-2 text-[13px] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]" />
                </div>
              </div>
              <button type="button" disabled={!apiKey.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-[6px] bg-[#6366F1] px-4 py-2.5 text-[13px] font-medium text-white hover:bg-[#5153CC] disabled:opacity-40">
                <Check size={14} /> Save Connection
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [category, setCategory] = useState("all");
  const [connectTarget, setConnectTarget] = useState<Integration | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());

  const filtered = category === "all" ? INTEGRATIONS : INTEGRATIONS.filter((i) => i.category === category);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[18px] font-medium leading-snug">Integrations</h1>
        <p className="mt-1 text-[12px] text-[#888888]">Connect the platforms your operators publish to and read from</p>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((cat) => (
          <button key={cat} type="button" onClick={() => setCategory(cat)}
            className={`rounded-[6px] px-3 py-1.5 text-[12px] capitalize transition-colors ${category === cat ? "bg-[#1C1C1C] text-[#F0F0F0]" : "text-[#555555] hover:text-[#888888]"}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((integration) => {
          const Icon = integration.icon;
          const isConnected = connected.has(integration.id);
          return (
            <div key={integration.id}
              className={`rounded-[14px] border bg-[#161616] p-4 transition-colors ${isConnected ? "border-[rgba(34,197,94,0.2)]" : "border-[#222222] hover:border-[#2A2A2A]"} ${integration.comingSoon ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${integration.iconColor}`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium">{integration.name}</div>
                    <div className="text-[10px] capitalize text-[#555555]">{integration.category}</div>
                  </div>
                </div>
                {integration.comingSoon ? (
                  <span className="shrink-0 rounded-[4px] bg-[rgba(160,160,160,0.08)] px-1.5 py-0.5 text-[10px] text-[#555555]">Soon</span>
                ) : isConnected ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-[#22C55E]">
                    <Check size={10} weight="bold" /> Connected
                  </span>
                ) : (
                  <button type="button" onClick={() => setConnectTarget(integration)}
                    className="shrink-0 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-2.5 py-1 text-[11px] font-medium hover:bg-[#222222]">
                    Connect
                  </button>
                )}
              </div>
              <p className="mt-2.5 text-[11px] text-[#888888] leading-relaxed line-clamp-2">
                {integration.description}
              </p>
            </div>
          );
        })}
      </div>

      {connectTarget && (
        <ConnectModal integration={connectTarget} onClose={() => setConnectTarget(null)} />
      )}
    </div>
  );
}
