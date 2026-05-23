"use client";

import { useState } from "react";
import {
  Key,
  Eye,
  EyeSlash,
  ArrowClockwise,
  Trash,
  Plus,
  X,
  CheckCircle,
  Globe,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Mock data — TODO: replace with Convex queries
// ---------------------------------------------------------------------------

type ApiKey = {
  id: string;
  name: string;
  env: "production" | "development";
  masked: string;
  created: string;
  lastUsed: string;
};

type Webhook = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
};

const MOCK_KEYS: ApiKey[] = [
  {
    id: "key_1",
    name: "Production Key",
    env: "production",
    masked: "unimble_prod_••••••••••••••••abc123",
    created: "Mar 1, 2026",
    lastUsed: "2 hours ago",
  },
  {
    id: "key_2",
    name: "Development Key",
    env: "development",
    masked: "unimble_dev_••••••••••••••••def456",
    created: "Mar 5, 2026",
    lastUsed: "1 day ago",
  },
];

const MOCK_WEBHOOKS: Webhook[] = [
  {
    id: "wh_1",
    url: "https://api.acme.com/webhooks/unimble",
    events: ["execution.completed", "execution.failed"],
    active: true,
  },
];

const WEBHOOK_EVENT_OPTIONS = [
  "execution.completed",
  "execution.failed",
  "approval.requested",
  "approval.completed",
  "operator.deployed",
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EnvBadge({ env }: { env: "production" | "development" }) {
  return (
    <span
      className={cn(
        "rounded-[6px] px-2 py-0.5 text-[11px] font-medium",
        env === "production"
          ? "bg-[rgba(239,68,68,0.12)] text-[#EF4444]"
          : "bg-[rgba(99,102,241,0.12)] text-[#6366F1]"
      )}
    >
      {env}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ApiSettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>(MOCK_KEYS);
  const [webhooks, setWebhooks] = useState<Webhook[]>(MOCK_WEBHOOKS);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteWebhookId, setConfirmDeleteWebhookId] = useState<string | null>(null);

  function handleDeleteKey(id: string) {
    // TODO: Wire to Convex mutation
    setKeys((prev) => prev.filter((k) => k.id !== id));
    setConfirmDeleteId(null);
  }

  function handleDeleteWebhook(id: string) {
    // TODO: Wire to Convex mutation
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
    setConfirmDeleteWebhookId(null);
  }

  // Create key form state
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyEnv, setNewKeyEnv] = useState<"production" | "development">("production");
  const [newKeyPerms, setNewKeyPerms] = useState({
    read: true,
    execute: true,
    manage: false,
    integrations: false,
  });

  // Create webhook form state
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState<Set<string>>(
    new Set(["execution.completed", "execution.failed"])
  );

  function toggleReveal(id: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleWebhookEvent(event: string) {
    setNewWebhookEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* API Keys */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
        <div className="flex items-center justify-between border-b border-[#222222] px-5 py-3">
          <div className="flex items-center gap-2">
            <Key size={15} className="text-[#888888]" />
            <div className="text-[15px] font-medium text-[#F0F0F0]">API Keys</div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            <Plus size={13} />
            Create New Key
          </button>
        </div>

        <div className="divide-y divide-[#1A1A1A]">
          {keys.map((key) => {
            const isRevealed = revealedKeys.has(key.id);
            const isConfirming = confirmDeleteId === key.id;
            return (
              <div key={key.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[#F0F0F0]">{key.name}</span>
                      <EnvBadge env={key.env} />
                    </div>
                    <div className="font-mono text-[12px] text-[#555555]">
                      {isRevealed ? (
                        <span className="text-[#F0F0F0]">
                          unimble_{key.env === "production" ? "prod" : "dev"}
                          _sk_live_example_key_redacted
                        </span>
                      ) : (
                        key.masked
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[#555555]">
                      <span>Created {key.created}</span>
                      <span>·</span>
                      <span>Last used {key.lastUsed}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleReveal(key.id)}
                      title={isRevealed ? "Hide" : "Reveal"}
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
                    >
                      {isRevealed ? <EyeSlash size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      type="button"
                      title="Regenerate"
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
                    >
                      <ArrowClockwise size={14} />
                    </button>
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteKey(key.id)}
                          className="rounded-[6px] bg-[rgba(239,68,68,0.12)] px-2 py-1 text-[11px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.2)]"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-[6px] px-2 py-1 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(key.id)}
                        title="Delete key"
                        className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#EF4444]"
                      >
                        <Trash size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Webhooks */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
        <div className="flex items-center justify-between border-b border-[#222222] px-5 py-3">
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-[#888888]" />
            <div className="text-[15px] font-medium text-[#F0F0F0]">Webhooks</div>
          </div>
          <button
            type="button"
            onClick={() => setShowWebhookModal(true)}
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            <Plus size={13} />
            Add Webhook
          </button>
        </div>

        <div className="divide-y divide-[#1A1A1A]">
          {webhooks.map((wh) => {
            const isConfirming = confirmDeleteWebhookId === wh.id;
            return (
              <div key={wh.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-[#F0F0F0] break-all">
                        {wh.url}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-[6px] px-2 py-0.5 text-[11px] font-medium",
                          wh.active
                            ? "bg-[rgba(34,197,94,0.1)] text-[#22C55E]"
                            : "bg-[rgba(160,160,160,0.08)] text-[#A0A0A0]"
                        )}
                      >
                        {wh.active ? "active" : "inactive"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {wh.events.map((ev) => (
                        <span
                          key={ev}
                          className="rounded-[4px] bg-[#1A1A1A] px-1.5 py-0.5 font-mono text-[10px] text-[#888888]"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteWebhook(wh.id)}
                          className="rounded-[6px] bg-[rgba(239,68,68,0.12)] px-2 py-1 text-[11px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.2)]"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteWebhookId(null)}
                          className="rounded-[6px] px-2 py-1 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteWebhookId(wh.id)}
                        title="Delete webhook"
                        className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#EF4444]"
                      >
                        <Trash size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-3 text-[12px] text-[#555555]">
        API key management and webhook delivery will be fully wired in a future phase. Mutations
        above are UI placeholders.
      </div>

      {/* Create API Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-[14px] border border-[#222222] bg-[#161616] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-medium text-[#F0F0F0]">Create API Key</div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[12px] text-[#666666]">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. CI/CD Pipeline"
                  className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[12px] text-[#666666]">Environment</label>
                <div className="space-y-1.5">
                  {(["production", "development"] as const).map((env) => (
                    <label key={env} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="env"
                        value={env}
                        checked={newKeyEnv === env}
                        onChange={() => setNewKeyEnv(env)}
                        className="accent-[#6366F1]"
                      />
                      <span className="text-[13px] text-[#F0F0F0] capitalize">{env}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[12px] text-[#666666]">Permissions</label>
                <div className="space-y-1.5">
                  {(
                    [
                      { key: "read", label: "Read operators" },
                      { key: "execute", label: "Execute workflows" },
                      { key: "manage", label: "Manage operators" },
                      { key: "integrations", label: "Manage integrations" },
                    ] as const
                  ).map((perm) => (
                    <label key={perm.key} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newKeyPerms[perm.key]}
                        onChange={(e) =>
                          setNewKeyPerms((p) => ({ ...p, [perm.key]: e.target.checked }))
                        }
                        className="rounded-sm accent-[#6366F1]"
                      />
                      <span className="text-[13px] text-[#F0F0F0]">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-[6px] border border-[#2A2A2A] py-2 text-[13px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newKeyName.trim()}
                  onClick={() => setShowCreateModal(false)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-[#F0F0F0] py-2 text-[13px] font-medium text-[#090909] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle size={14} />
                  Create Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Webhook Modal */}
      {showWebhookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-[14px] border border-[#222222] bg-[#161616] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-medium text-[#F0F0F0]">Add Webhook</div>
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[12px] text-[#666666]">Endpoint URL</label>
                <input
                  type="url"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="https://your-app.com/webhooks"
                  className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[12px] text-[#666666]">Events to send</label>
                <div className="space-y-1.5">
                  {WEBHOOK_EVENT_OPTIONS.map((ev) => (
                    <label key={ev} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newWebhookEvents.has(ev)}
                        onChange={() => toggleWebhookEvent(ev)}
                        className="rounded-sm accent-[#6366F1]"
                      />
                      <span className="font-mono text-[12px] text-[#F0F0F0]">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(false)}
                  className="flex-1 rounded-[6px] border border-[#2A2A2A] py-2 text-[13px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newWebhookUrl.trim() || newWebhookEvents.size === 0}
                  onClick={() => setShowWebhookModal(false)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-[#F0F0F0] py-2 text-[13px] font-medium text-[#090909] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle size={14} />
                  Add Webhook
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
