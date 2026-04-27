"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plugs,
  CheckCircle,
  Warning,
  XCircle,
  ArrowClockwise,
  Trash,
  Clock,
  CircleNotch,
} from "@phosphor-icons/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useIntegrationMeta, useDisconnectToolkit } from "@/lib/integrationHooks";
import { useQuery } from "convex/react";
import { anyApi } from "convex/server";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IntegrationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { slug: wsSlug } = useWorkspaceContext();

  const integrationId = typeof params?.id === "string" ? params.id : "";

  // Fetch the integration record from DB
  const integration = useQuery(
    anyApi.integrations.getIntegration,
    integrationId ? { id: integrationId } : "skip"
  );

  // Fetch the catalog metadata for this provider
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = (integration as any)?.provider;
  const meta = useIntegrationMeta(provider);

  const disconnectToolkit = useDisconnectToolkit();

  const [disconnecting, setDisconnecting] = useState(false);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);
  const [error, setError] = useState("");

  const handleDisconnect = useCallback(async () => {
    if (!integrationId) return;
    setDisconnecting(true);
    setError("");

    try {
      await disconnectToolkit({ integrationId });
      router.push(`/w/${wsSlug}/integrations`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
      setDisconnecting(false);
      setShowConfirmDisconnect(false);
    }
  }, [integrationId, disconnectToolkit, router, wsSlug]);

  if (!integration || !meta) {
    return (
      <div className="flex items-center justify-center py-20">
        <CircleNotch size={24} className="animate-spin text-[#555555]" />
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const integ = integration as any;
  const status = integ.status ?? "unknown";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/w/${wsSlug}/integrations`}
        className="inline-flex items-center gap-1.5 text-[12px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
      >
        <ArrowLeft size={14} />
        Back to Integrations
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#1A1A1A] text-[#888888]">
            <Plugs size={20} />
          </div>
          <div>
            <h1 className="text-[18px] font-medium leading-snug text-[#F0F0F0]">{meta.name}</h1>
            <StatusBadge status={status} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#888888] transition-colors hover:bg-[#222222] hover:text-[#F0F0F0]"
          >
            <ArrowClockwise size={12} />
            Test Connection
          </button>
          <button
            type="button"
            onClick={() => setShowConfirmDisconnect(true)}
            className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-3 py-1.5 text-[12px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.15)]"
          >
            <Trash size={12} />
            Disconnect
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#222222] bg-[rgba(239,68,68,0.12)] px-4 py-3">
          <Warning size={16} className="text-[#EF4444]" />
          <span className="text-[13px] text-[#EF4444]">{error}</span>
        </div>
      )}

      {/* Connection Details Card */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <h2 className="mb-4 text-[15px] font-medium text-[#F0F0F0]">Connection Details</h2>
        <div className="space-y-3">
          <DetailRow label="Provider" value={meta.name} />
          <DetailRow
            label="Auth Type"
            value={
              meta.authType === "oauth"
                ? "OAuth 2.0"
                : meta.authType === "api_key"
                  ? "API Key"
                  : "Bot Token"
            }
          />
          <DetailRow label="Connected" value={formatDate(integ.createdAt)} />
          {integ.lastUsedAt && (
            <DetailRow label="Last Used" value={formatRelativeTime(integ.lastUsedAt)} />
          )}
          <DetailRow label="Status" value={status} />
        </div>
      </div>

      {/* Permissions Card */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <h2 className="mb-4 text-[15px] font-medium text-[#F0F0F0]">Permissions</h2>
        <ul className="space-y-2">
          {meta.permissions?.map((perm: string) => (
            <li key={perm} className="flex items-center gap-2 text-[13px] text-[#F0F0F0]">
              <CheckCircle size={14} className="shrink-0 text-[#22C55E]" />
              {perm}
            </li>
          ))}
        </ul>
      </div>

      {/* Danger Zone */}
      <div className="rounded-[14px] border border-[rgba(239,68,68,0.2)] bg-[#161616] p-5">
        <h2 className="mb-2 text-[15px] font-medium text-[#EF4444]">Danger Zone</h2>
        <p className="mb-4 text-[12px] text-[#888888]">
          Disconnecting will revoke access and may break operators using this integration.
        </p>
        <button
          type="button"
          onClick={() => setShowConfirmDisconnect(true)}
          className="rounded-[6px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-4 py-2 text-[13px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.15)]"
        >
          Disconnect {meta.name}
        </button>
      </div>

      {/* Confirm Disconnect Modal */}
      {showConfirmDisconnect && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirmDisconnect(false);
          }}
          onKeyDown={() => {}}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm disconnect"
        >
          <div className="w-full max-w-sm rounded-[14px] border border-[#222222] bg-[#161616] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.7)]">
            <h3 className="text-[15px] font-medium text-[#F0F0F0]">Disconnect {meta.name}?</h3>
            <p className="mt-2 text-[12px] text-[#888888]">
              This will revoke access, delete stored credentials, and may break operators using this
              integration.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmDisconnect(false)}
                className="flex-1 rounded-[6px] border border-[#2A2A2A] bg-transparent px-3 py-2 text-[13px] font-medium text-[#888888] transition-colors hover:bg-[#1C1C1C]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-[13px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.15)] disabled:opacity-50"
              >
                {disconnecting ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <Trash size={14} />
                )}
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#22C55E]">
        <CheckCircle size={12} weight="fill" />
        Connected
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#EF4444]">
        <XCircle size={12} weight="fill" />
        Error
      </span>
    );
  }
  if (status === "disconnected") {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#888888]">
        <Clock size={12} />
        Disconnected
      </span>
    );
  }
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#A0A0A0]">{status}</span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#222222] pb-2">
      <span className="text-[12px] text-[#888888]">{label}</span>
      <span className="text-[13px] text-[#F0F0F0]">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
