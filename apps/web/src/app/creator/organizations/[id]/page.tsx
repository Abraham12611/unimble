"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  CurrencyDollar,
  ChartBar,
  Gear,
  Users,
  XCircle,
  CheckCircle,
  Warning,
  ChatCircle,
  Plus,
  Sliders,
  UserSwitch,
  Export,
  Envelope,
  Trash,
  Pulse,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Mock data — TODO: replace with Convex platform-admin query by id
// ---------------------------------------------------------------------------

const MOCK_ORG = {
  id: "org1",
  name: "TechCorp Inc",
  plan: "Enterprise" as const,
  mrr: 999,
  users: 45,
  status: "active" as "active" | "blocked",
  blockReason: undefined as string | undefined,
  blockedSince: undefined as string | undefined,
  createdAt: "January 15, 2026",
  owner: "john@techcorp.com",
  executions: 4521,
  apiCalls: 125000,
  llmTokens: 2500000,
  estimatedCost: 450,
  operatorsActive: 12,
};

const MOCK_USERS = [
  { id: "u1", email: "john@techcorp.com", role: "Owner", lastActive: "2 min ago" },
  { id: "u2", email: "sarah@techcorp.com", role: "Admin", lastActive: "1 hour ago" },
  { id: "u3", email: "dev@techcorp.com", role: "Member", lastActive: "Yesterday" },
];

const MOCK_BILLING_HISTORY = [
  { date: "Apr 1, 2026", amount: "$999", status: "Paid", invoice: "INV-2026-04" },
  { date: "Mar 1, 2026", amount: "$999", status: "Paid", invoice: "INV-2026-03" },
  { date: "Feb 1, 2026", amount: "$999", status: "Paid", invoice: "INV-2026-02" },
  { date: "Jan 1, 2026", amount: "$999", status: "Paid", invoice: "INV-2026-01" },
];

const MOCK_ACTIVITY = [
  { id: "act1", event: "Operator executed: Content Generator", time: "2 min ago", type: "exec" },
  { id: "act2", event: "User sarah@techcorp.com logged in", time: "1 hour ago", type: "auth" },
  { id: "act3", event: "Workflow 'Weekly Report' triggered", time: "3 hours ago", type: "exec" },
  { id: "act4", event: "API key rotated by john@techcorp.com", time: "1 day ago", type: "admin" },
  { id: "act5", event: "New user invited: dev@techcorp.com", time: "2 days ago", type: "admin" },
];

const MOCK_USAGE_LIMITS = {
  operatorsMax: 20,
  executionsPerDay: 10000,
  apiCallsPerMonth: 500000,
  llmTokensPerMonth: 10000000,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "overview" | "users" | "usage" | "billing" | "activity" | "settings";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: User },
  { id: "users", label: "Users", icon: Users },
  { id: "usage", label: "Usage", icon: ChartBar },
  { id: "billing", label: "Billing", icon: CurrencyDollar },
  { id: "activity", label: "Activity", icon: Pulse },
  { id: "settings", label: "Settings", icon: Gear },
];

// ---------------------------------------------------------------------------
// Tab components
// ---------------------------------------------------------------------------

function OverviewTab({
  org,
  onBlock,
  onUnblock,
}: {
  org: typeof MOCK_ORG;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState([
    {
      id: "n1",
      text: "VIP customer — CEO is investor contact. Handle with care.",
      author: "Abraham",
      date: "Jan 20, 2026",
    },
  ]);
  const [addingNote, setAddingNote] = useState(false);

  function submitNote() {
    if (!note.trim()) return;
    setNotes((prev) => [
      ...prev,
      {
        id: `n${Date.now()}`,
        text: note.trim(),
        author: "Abraham",
        date: new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      },
    ]);
    setNote("");
    setAddingNote(false);
  }

  return (
    <div className="space-y-4">
      {/* Org info */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[13px] font-medium text-[#F0F0F0]">Organisation Info</div>
        <div className="mt-4 space-y-2">
          {[
            { label: "Name", value: org.name },
            { label: "ID", value: org.id },
            { label: "Created", value: org.createdAt },
            { label: "Plan", value: `${org.plan} ($${org.mrr}/mo)` },
            { label: "Status", value: org.status },
            { label: "Owner", value: org.owner },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between border-b border-[#1A1A1A] pb-2 last:border-0 last:pb-0"
            >
              <span className="text-[12px] text-[#555555]">{row.label}</span>
              <span
                className={cn(
                  "text-[12px]",
                  row.label === "Status" && org.status === "blocked"
                    ? "text-[#EF4444]"
                    : row.label === "Status"
                      ? "text-[#22C55E]"
                      : "text-[#F0F0F0]"
                )}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Usage this month */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[13px] font-medium text-[#F0F0F0]">Usage This Month</div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: "Active Operators", value: String(org.operatorsActive) },
            { label: "Executions", value: org.executions.toLocaleString() },
            { label: "API Calls", value: org.apiCalls.toLocaleString() },
            { label: "LLM Tokens", value: `${(org.llmTokens / 1000000).toFixed(1)}M` },
            { label: "Est. Cost", value: `$${org.estimatedCost}` },
          ].map((m) => (
            <div key={m.label} className="rounded-[10px] border border-[#1A1A1A] bg-[#111111] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#555555]">{m.label}</div>
              <div className="mt-1.5 text-[20px] font-semibold text-[#F0F0F0]">{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[13px] font-medium text-[#F0F0F0]">Quick Actions</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            <UserSwitch size={13} />
            Impersonate Admin
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            <Envelope size={13} />
            Send Message
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            <Sliders size={13} />
            Adjust Limits
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            <Export size={13} />
            Export Data
          </button>
          {org.status === "blocked" ? (
            <button
              type="button"
              onClick={onUnblock}
              className="flex items-center gap-1.5 rounded-[6px] bg-[rgba(34,197,94,0.1)] px-3 py-2 text-[12px] font-medium text-[#22C55E] transition-colors hover:bg-[rgba(34,197,94,0.18)]"
            >
              <CheckCircle size={13} />
              Unblock Organisation
            </button>
          ) : (
            <button
              type="button"
              onClick={onBlock}
              className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(239,68,68,0.3)] px-3 py-2 text-[12px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)]"
            >
              <XCircle size={13} />
              Block Organisation
            </button>
          )}
        </div>
      </div>

      {/* Internal notes */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#F0F0F0]">
            <ChatCircle size={14} className="text-[#888888]" />
            Notes (internal)
          </div>
          <button
            type="button"
            onClick={() => setAddingNote(true)}
            className="flex items-center gap-1 text-[11px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
          >
            <Plus size={11} />
            Add Note
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-[10px] border border-[#1A1A1A] bg-[#111111] px-3 py-2.5"
            >
              <div className="text-[12px] text-[#F0F0F0]">{n.text}</div>
              <div className="mt-1.5 text-[10px] text-[#555555]">
                Added by {n.author} on {n.date}
              </div>
            </div>
          ))}
        </div>

        {addingNote && (
          <div className="mt-3 space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add an internal note…"
              rows={3}
              className="w-full rounded-[8px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[12px] text-[#F0F0F0] placeholder-[#555555] outline-none focus:border-[#3A3A3A] resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitNote}
                disabled={!note.trim()}
                className="rounded-[6px] bg-[#222222] px-3 py-1.5 text-[11px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#2A2A2A] disabled:cursor-not-allowed disabled:text-[#555555]"
              >
                Save Note
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingNote(false);
                  setNote("");
                }}
                className="rounded-[6px] px-3 py-1.5 text-[11px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UsersTab() {
  return (
    <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
      <div className="border-b border-[#222222] px-5 py-3">
        <div className="text-[13px] font-medium text-[#F0F0F0]">Team Members</div>
      </div>
      <div className="divide-y divide-[#1A1A1A]">
        {MOCK_USERS.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <div className="text-[13px] text-[#F0F0F0]">{u.email}</div>
              <div className="mt-0.5 text-[11px] text-[#555555]">Last active: {u.lastActive}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-[6px] border border-[#2A2A2A] px-2 py-0.5 text-[11px] text-[#888888]">
                {u.role}
              </span>
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
              >
                <UserSwitch size={12} />
                Impersonate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageTab() {
  const limits = MOCK_USAGE_LIMITS;
  const org = MOCK_ORG;
  const [editingLimits, setEditingLimits] = useState(false);
  const [operatorsMax, setOperatorsMax] = useState(String(limits.operatorsMax));
  const [execPerDay, setExecPerDay] = useState(String(limits.executionsPerDay));

  const usageRows = [
    { label: "Operators", used: org.operatorsActive, max: limits.operatorsMax, unit: "" },
    { label: "Executions", used: org.executions, max: limits.executionsPerDay, unit: "/day" },
    { label: "API Calls", used: org.apiCalls, max: limits.apiCallsPerMonth, unit: "/mo" },
    { label: "LLM Tokens", used: org.llmTokens, max: limits.llmTokensPerMonth, unit: "/mo" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-medium text-[#F0F0F0]">Usage vs Limits</div>
          <button
            type="button"
            onClick={() => setEditingLimits(!editingLimits)}
            className="flex items-center gap-1 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-2.5 py-1 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
          >
            <Sliders size={12} />
            {editingLimits ? "Cancel" : "Override Limits"}
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {usageRows.map((row) => {
            const pct = Math.min(100, Math.round((row.used / row.max) * 100));
            return (
              <div key={row.label}>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="text-[#888888]">{row.label}</span>
                  <span className="text-[#555555]">
                    {row.used.toLocaleString()} / {row.max.toLocaleString()}
                    {row.unit}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#1A1A1A]">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      pct >= 90 ? "bg-[#EF4444]" : pct >= 70 ? "bg-[#F59E0B]" : "bg-[#6366F1]"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {editingLimits && (
          <div className="mt-5 space-y-3 rounded-[10px] border border-[#2A2A2A] bg-[#111111] p-4">
            <div className="text-[12px] font-medium text-[#F0F0F0]">Override Limits</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-[#555555]">Max Operators</label>
                <input
                  type="number"
                  value={operatorsMax}
                  onChange={(e) => setOperatorsMax(e.target.value)}
                  className="h-8 w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-2 text-[12px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#555555]">Executions / day</label>
                <input
                  type="number"
                  value={execPerDay}
                  onChange={(e) => setExecPerDay(e.target.value)}
                  className="h-8 w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-2 text-[12px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingLimits(false)}
              className="rounded-[6px] bg-[rgba(34,197,94,0.1)] px-3 py-1.5 text-[11px] font-medium text-[#22C55E] transition-colors hover:bg-[rgba(34,197,94,0.18)]"
            >
              Save Overrides
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BillingTab() {
  return (
    <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
      <div className="border-b border-[#222222] px-5 py-3">
        <div className="text-[13px] font-medium text-[#F0F0F0]">Billing History</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1A1A1A]">
              {["Date", "Amount", "Status", "Invoice", ""].map((h) => (
                <th
                  key={h}
                  className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-[#555555]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1A1A1A]">
            {MOCK_BILLING_HISTORY.map((row) => (
              <tr key={row.invoice} className="transition-colors hover:bg-[#1C1C1C]">
                <td className="px-5 py-3 text-[12px] text-[#888888]">{row.date}</td>
                <td className="px-5 py-3 text-[13px] font-medium text-[#F0F0F0]">{row.amount}</td>
                <td className="px-5 py-3">
                  <span className="rounded-[6px] bg-[rgba(34,197,94,0.1)] px-2 py-0.5 text-[11px] font-medium text-[#22C55E]">
                    {row.status}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-[11px] text-[#555555]">{row.invoice}</td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    className="text-[11px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActivityTab() {
  return (
    <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
      <div className="text-[13px] font-medium text-[#F0F0F0]">Org Activity Log</div>
      <div className="mt-4 space-y-3">
        {MOCK_ACTIVITY.map((a) => (
          <div
            key={a.id}
            className="flex items-start gap-3 border-b border-[#1A1A1A] pb-3 last:border-0 last:pb-0"
          >
            <div
              className={cn(
                "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                a.type === "exec"
                  ? "bg-[#6366F1]"
                  : a.type === "auth"
                    ? "bg-[#3B82F6]"
                    : "bg-[#888888]"
              )}
            />
            <div className="flex-1">
              <div className="text-[12px] text-[#F0F0F0]">{a.event}</div>
              <div className="mt-0.5 text-[11px] text-[#555555]">{a.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsTab({ onDelete }: { onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[13px] font-medium text-[#F0F0F0]">Organisation Settings</div>
        <div className="mt-4 space-y-3 text-[12px] text-[#555555]">
          <p>Feature flags, plan overrides, and advanced settings will be available here.</p>
          <p className="text-[11px]">TODO: Wire to Convex platform-admin mutations.</p>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-[14px] border border-[rgba(239,68,68,0.2)] bg-[#161616] p-5">
        <div className="flex items-center gap-2 text-[13px] font-medium text-[#EF4444]">
          <Warning size={14} />
          Danger Zone
        </div>
        <div className="mt-3 text-[12px] text-[#555555]">
          Permanently delete this organisation and all associated data. This cannot be undone.
        </div>
        <div className="mt-4 flex items-center gap-2">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1.5 rounded-[6px] bg-[rgba(239,68,68,0.12)] px-3 py-1.5 text-[12px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.2)]"
              >
                <Trash size={13} />
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-[6px] border border-[#2A2A2A] px-3 py-1.5 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(239,68,68,0.3)] px-3 py-1.5 text-[12px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)]"
            >
              <Trash size={13} />
              Delete Organisation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OrgDetailPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [org, setOrg] = useState(MOCK_ORG);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  function handleBlock() {
    // TODO: Wire to Convex platform-admin mutation
    setOrg((prev) => ({
      ...prev,
      status: "blocked",
      blockReason: "other",
      blockedSince: "Today",
    }));
    setShowBlockConfirm(false);
  }

  function handleUnblock() {
    // TODO: Wire to Convex platform-admin mutation
    setOrg((prev) => ({
      ...prev,
      status: "active",
      blockReason: undefined,
      blockedSince: undefined,
    }));
  }

  function handleDelete() {
    // TODO: Wire to Convex platform-admin mutation
    window.location.href = "/creator/organizations";
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[12px] text-[#555555]">
            <Link href="/creator" className="transition-colors hover:text-[#F0F0F0]">
              Dashboard
            </Link>
            <span className="text-[#333333]">/</span>
            <Link
              href="/creator/organizations"
              className="flex items-center gap-1 transition-colors hover:text-[#F0F0F0]"
            >
              <ArrowLeft size={11} />
              Organisations
            </Link>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-[18px] font-medium text-[#F0F0F0]">{org.name}</h1>
            {org.status === "blocked" ? (
              <span className="rounded-[6px] bg-[rgba(239,68,68,0.12)] px-2 py-0.5 text-[11px] font-medium text-[#EF4444]">
                blocked
              </span>
            ) : (
              <span className="rounded-[6px] bg-[rgba(34,197,94,0.1)] px-2 py-0.5 text-[11px] font-medium text-[#22C55E]">
                active
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Block confirmation banner */}
      {showBlockConfirm && (
        <div className="flex items-center justify-between rounded-[10px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-4 py-3">
          <span className="text-[12px] text-[#EF4444]">
            Are you sure you want to block <strong>{org.name}</strong>? Their operators and
            workflows will be paused.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleBlock}
              className="rounded-[6px] bg-[rgba(239,68,68,0.12)] px-3 py-1.5 text-[11px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.2)]"
            >
              Block
            </button>
            <button
              type="button"
              onClick={() => setShowBlockConfirm(false)}
              className="rounded-[6px] border border-[#2A2A2A] px-3 py-1.5 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-[#222222]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-[13px] font-medium transition-colors",
                isActive
                  ? "border-[#F0F0F0] text-[#F0F0F0]"
                  : "border-transparent text-[#555555] hover:text-[#888888]"
              )}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab
          org={org}
          onBlock={() => setShowBlockConfirm(true)}
          onUnblock={handleUnblock}
        />
      )}
      {activeTab === "users" && <UsersTab />}
      {activeTab === "usage" && <UsageTab />}
      {activeTab === "billing" && <BillingTab />}
      {activeTab === "activity" && <ActivityTab />}
      {activeTab === "settings" && <SettingsTab onDelete={handleDelete} />}
    </div>
  );
}
