"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  MagnifyingGlass,
  ArrowLeft,
  ArrowRight,
  CaretDown,
  Warning,
  XCircle,
  CheckCircle,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Mock data — TODO: replace with Convex platform-admin query
// ---------------------------------------------------------------------------

type OrgStatus = "active" | "blocked" | "trial";
type Plan = "Starter" | "Pro" | "Enterprise";
type BlockReason = "payment_default" | "abuse" | "spam" | "security" | "request" | "other";

interface Org {
  id: string;
  name: string;
  plan: Plan;
  users: number;
  mrr: number;
  status: OrgStatus;
  blockReason?: BlockReason;
  blockedSince?: string;
  lastActive: string;
  createdAt: string;
  owner: string;
  executions: number;
}

const MOCK_ORGS: Org[] = [
  {
    id: "org1",
    name: "TechCorp Inc",
    plan: "Enterprise",
    users: 45,
    mrr: 999,
    status: "active",
    lastActive: "2 min ago",
    createdAt: "Jan 2026",
    owner: "john@techcorp.com",
    executions: 4521,
  },
  {
    id: "org2",
    name: "StartupXYZ",
    plan: "Pro",
    users: 8,
    mrr: 299,
    status: "active",
    lastActive: "1 hour ago",
    createdAt: "Feb 2026",
    owner: "ceo@startupxyz.io",
    executions: 1230,
  },
  {
    id: "org3",
    name: "DevAgency",
    plan: "Pro",
    users: 12,
    mrr: 299,
    status: "active",
    lastActive: "3 hours ago",
    createdAt: "Feb 2026",
    owner: "admin@devagency.co",
    executions: 890,
  },
  {
    id: "org4",
    name: "DefaultedCo",
    plan: "Pro",
    users: 3,
    mrr: 0,
    status: "blocked",
    blockReason: "payment_default",
    blockedSince: "Mar 15, 2026",
    lastActive: "2 days ago",
    createdAt: "Dec 2025",
    owner: "owner@defaultedco.com",
    executions: 45,
  },
  {
    id: "org5",
    name: "SpammerCo",
    plan: "Starter",
    users: 1,
    mrr: 0,
    status: "blocked",
    blockReason: "abuse",
    blockedSince: "Mar 31, 2026",
    lastActive: "1 day ago",
    createdAt: "Mar 2026",
    owner: "info@spammer.co",
    executions: 12,
  },
  {
    id: "org6",
    name: "GrowthLabs",
    plan: "Pro",
    users: 6,
    mrr: 299,
    status: "trial",
    lastActive: "30 min ago",
    createdAt: "Apr 2026",
    owner: "founder@growthlabs.io",
    executions: 320,
  },
  {
    id: "org7",
    name: "ContentFirst",
    plan: "Starter",
    users: 3,
    mrr: 49,
    status: "active",
    lastActive: "12 hours ago",
    createdAt: "Mar 2026",
    owner: "team@contentfirst.co",
    executions: 210,
  },
];

const BLOCK_REASON_LABELS: Record<BlockReason, string> = {
  payment_default: "Payment default",
  abuse: "Abuse",
  spam: "Spam",
  security: "Security",
  request: "Request",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ org }: { org: Org }) {
  if (org.status === "blocked") {
    return (
      <div className="flex items-center gap-1">
        <span className="rounded-[6px] bg-[rgba(239,68,68,0.12)] px-2 py-0.5 text-[11px] font-medium text-[#EF4444]">
          blocked
        </span>
        {org.blockReason && (
          <span className="text-[10px] text-[#555555]">
            ({BLOCK_REASON_LABELS[org.blockReason]})
          </span>
        )}
      </div>
    );
  }
  if (org.status === "trial") {
    return (
      <span className="rounded-[6px] bg-[rgba(245,158,11,0.12)] px-2 py-0.5 text-[11px] font-medium text-[#F59E0B]">
        trial
      </span>
    );
  }
  return (
    <span className="rounded-[6px] bg-[rgba(34,197,94,0.1)] px-2 py-0.5 text-[11px] font-medium text-[#22C55E]">
      active
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OrganizationsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrgStatus>("all");
  const [planFilter, setPlanFilter] = useState<"all" | Plan>("all");
  const [confirmBlockId, setConfirmBlockId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Org[]>(MOCK_ORGS);

  const filtered = useMemo(() => {
    return orgs.filter((o) => {
      const matchSearch =
        search === "" ||
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.owner.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      const matchPlan = planFilter === "all" || o.plan === planFilter;
      return matchSearch && matchStatus && matchPlan;
    });
  }, [orgs, search, statusFilter, planFilter]);

  function handleBlock(id: string) {
    // TODO: Wire to Convex platform-admin mutation
    setOrgs((prev) =>
      prev.map((o) =>
        o.id === id
          ? { ...o, status: "blocked" as OrgStatus, blockReason: "other", blockedSince: "Today" }
          : o
      )
    );
    setConfirmBlockId(null);
  }

  function handleUnblock(id: string) {
    // TODO: Wire to Convex platform-admin mutation
    setOrgs((prev) =>
      prev.map((o) =>
        o.id === id
          ? { ...o, status: "active" as OrgStatus, blockReason: undefined, blockedSince: undefined }
          : o
      )
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            href="/creator"
            className="flex items-center gap-1 text-[12px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
          >
            <ArrowLeft size={13} />
            Dashboard
          </Link>
          <span className="text-[#333333]">/</span>
          <h1 className="text-[18px] font-medium text-[#F0F0F0]">Organisations</h1>
        </div>
        <div className="text-[12px] text-[#555555]">
          {filtered.length} of {orgs.length} orgs
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1" style={{ minWidth: "200px" }}>
          <MagnifyingGlass
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]"
          />
          <input
            type="text"
            placeholder="Search orgs or owners…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] pl-8 pr-3 text-[12px] text-[#F0F0F0] placeholder-[#555555] outline-none focus:border-[#3A3A3A]"
          />
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-8 appearance-none rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] pl-3 pr-7 text-[12px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
            <option value="trial">Trial</option>
          </select>
          <CaretDown
            size={11}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#555555]"
          />
        </div>

        {/* Plan filter */}
        <div className="relative">
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
            className="h-8 appearance-none rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] pl-3 pr-7 text-[12px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
          >
            <option value="all">All plans</option>
            <option value="Starter">Starter</option>
            <option value="Pro">Pro</option>
            <option value="Enterprise">Enterprise</option>
          </select>
          <CaretDown
            size={11}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#555555]"
          />
        </div>
      </div>

      {/* Org list */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="rounded-[14px] border border-[#222222] bg-[#161616] px-5 py-10 text-center text-[12px] text-[#555555]">
            No organisations match your filters.
          </div>
        ) : (
          filtered.map((org) => {
            const isConfirming = confirmBlockId === org.id;
            return (
              <div
                key={org.id}
                className={cn(
                  "rounded-[14px] border bg-[#161616] px-5 py-4 transition-colors",
                  org.status === "blocked"
                    ? "border-[rgba(239,68,68,0.2)]"
                    : "border-[#222222] hover:bg-[#1C1C1C]"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* Name + status */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-[#F0F0F0]">{org.name}</span>
                      <StatusBadge org={org} />
                    </div>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#555555]">
                      <span>
                        Plan: <span className="text-[#888888]">{org.plan}</span>
                      </span>
                      <span>
                        Users: <span className="text-[#888888]">{org.users}</span>
                      </span>
                      <span>
                        MRR:{" "}
                        <span className="text-[#888888]">{org.mrr > 0 ? `$${org.mrr}` : "—"}</span>
                      </span>
                      <span>
                        Since: <span className="text-[#888888]">{org.createdAt}</span>
                      </span>
                      {org.status === "blocked" && org.blockedSince && (
                        <span className="text-[#EF4444]">Blocked: {org.blockedSince}</span>
                      )}
                    </div>

                    <div className="text-[11px] text-[#555555]">Last active: {org.lastActive}</div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleBlock(org.id)}
                          className="flex items-center gap-1 rounded-[6px] bg-[rgba(239,68,68,0.12)] px-2.5 py-1.5 text-[11px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.2)]"
                        >
                          <XCircle size={12} />
                          Confirm block
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmBlockId(null)}
                          className="rounded-[6px] border border-[#2A2A2A] px-2.5 py-1.5 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <Link
                          href={`/creator/organizations/${org.id}`}
                          className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-2.5 py-1.5 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                        >
                          View
                        </Link>
                        {org.status === "blocked" ? (
                          <button
                            type="button"
                            onClick={() => handleUnblock(org.id)}
                            className="flex items-center gap-1 rounded-[6px] bg-[rgba(34,197,94,0.1)] px-2.5 py-1.5 text-[11px] font-medium text-[#22C55E] transition-colors hover:bg-[rgba(34,197,94,0.18)]"
                          >
                            <CheckCircle size={12} />
                            Unblock
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmBlockId(org.id)}
                            className="flex items-center gap-1 rounded-[6px] border border-[rgba(239,68,68,0.3)] px-2.5 py-1.5 text-[11px] text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                          >
                            <Warning size={12} />
                            Block
                          </button>
                        )}
                        <Link
                          href={`/creator/organizations/${org.id}`}
                          className="flex items-center gap-0.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-2.5 py-1.5 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                        >
                          Details <ArrowRight size={11} />
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
