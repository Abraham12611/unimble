import Link from "next/link";
import {
  Buildings,
  XCircle,
  CurrencyDollar,
  Lightning,
  Pulse,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Heartbeat,
  Database,
  Cloud,
  Robot,
} from "@phosphor-icons/react/dist/ssr";

import { requireCreator } from "@/lib/requireCreator";

// ---------------------------------------------------------------------------
// Mock data — TODO: replace with Convex platform-admin queries
// ---------------------------------------------------------------------------

const MOCK_PLATFORM_STATS = {
  totalOrgs: 127,
  activeOrgs: 98,
  blockedOrgs: 3,
  totalUsers: 1245,
  mrr: 45230,
  mrrChange: 8.4,
  executionsPerDay: 45200,
  executionsChange: 12.1,
  apiCallsPerDay: 2100000,
  errorRate: 0.02,
};

const MOCK_RECENT_ACTIVITY = [
  {
    id: "a1",
    type: "signup",
    message: 'New org: "TechCorp Inc" signed up',
    time: "2 min ago",
  },
  {
    id: "a2",
    type: "payment",
    message: 'Payment received: "StartupXYZ" — $299',
    time: "15 min ago",
  },
  {
    id: "a3",
    type: "block",
    message: 'Org blocked: "SpammerCo" — abuse',
    time: "1 hour ago",
  },
  {
    id: "a4",
    type: "signup",
    message: 'New org: "DevAgency" signed up',
    time: "3 hours ago",
  },
  {
    id: "a5",
    type: "payment",
    message: 'Payment failed: "DefaultedCo" — 3rd attempt',
    time: "5 hours ago",
  },
];

const MOCK_TOP_ORGS = [
  {
    id: "org1",
    name: "TechCorp Inc",
    plan: "Enterprise",
    users: 45,
    mrr: 999,
    status: "active",
    lastActive: "2 min ago",
  },
  {
    id: "org2",
    name: "StartupXYZ",
    plan: "Pro",
    users: 8,
    mrr: 299,
    status: "active",
    lastActive: "1 hour ago",
  },
  {
    id: "org3",
    name: "DevAgency",
    plan: "Pro",
    users: 12,
    mrr: 299,
    status: "active",
    lastActive: "3 hours ago",
  },
  {
    id: "org4",
    name: "DefaultedCo",
    plan: "Pro",
    users: 3,
    mrr: 0,
    status: "blocked",
    lastActive: "2 days ago",
  },
];

const MOCK_REVENUE = {
  thisMonth: 45230,
  lastMonth: 41720,
  arr: 542760,
  avgPerOrg: 462,
  churnRate: 2.1,
  newMrrThisMonth: 5980,
};

const MOCK_SYSTEM_HEALTH = [
  { service: "API Gateway", status: "healthy", latency: "42ms", uptime: "99.98%" },
  { service: "Convex Backend", status: "healthy", latency: "18ms", uptime: "99.99%" },
  { service: "Agent Runtime", status: "healthy", latency: "120ms", uptime: "99.95%" },
  { service: "LLM Router", status: "degraded", latency: "890ms", uptime: "99.81%" },
  { service: "Integrations", status: "healthy", latency: "65ms", uptime: "99.93%" },
  { service: "Storage", status: "healthy", latency: "12ms", uptime: "100%" },
];

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  change,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  change?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#555555]">{label}</div>
      <div className="mt-2 text-[28px] font-semibold leading-none text-[#F0F0F0]">{value}</div>
      {(sub ?? change) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {change && (
            <span
              className={
                positive
                  ? "flex items-center gap-0.5 text-[11px] text-[#22C55E]"
                  : "flex items-center gap-0.5 text-[11px] text-[#EF4444]"
              }
            >
              {positive ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
              {change}
            </span>
          )}
          {sub && <span className="text-[11px] text-[#555555]">{sub}</span>}
        </div>
      )}
    </div>
  );
}

function ActivityIcon({ type }: { type: string }) {
  if (type === "signup") return <Buildings size={13} className="shrink-0 text-[#3B82F6]" />;
  if (type === "payment") return <CurrencyDollar size={13} className="shrink-0 text-[#22C55E]" />;
  if (type === "block") return <XCircle size={13} className="shrink-0 text-[#EF4444]" />;
  return <Lightning size={13} className="shrink-0 text-[#888888]" />;
}

function HealthDot({ status }: { status: string }) {
  if (status === "healthy")
    return <span className="inline-block h-2 w-2 rounded-full bg-[#22C55E]" />;
  if (status === "degraded")
    return <span className="inline-block h-2 w-2 rounded-full bg-[#F59E0B]" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-[#EF4444]" />;
}

function ServiceIcon({ service }: { service: string }) {
  if (service.includes("Agent")) return <Robot size={13} className="text-[#888888]" />;
  if (service.includes("Convex") || service.includes("Storage"))
    return <Database size={13} className="text-[#888888]" />;
  if (service.includes("LLM") || service.includes("Cloud"))
    return <Cloud size={13} className="text-[#888888]" />;
  return <Pulse size={13} className="text-[#888888]" />;
}

// ---------------------------------------------------------------------------
// Page (server component — auth guard runs here)
// ---------------------------------------------------------------------------

export default async function CreatorOverviewPage() {
  await requireCreator();

  const s = MOCK_PLATFORM_STATS;
  const r = MOCK_REVENUE;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-medium text-[#F0F0F0]">Creator Dashboard</h1>
          <p className="mt-0.5 text-[12px] text-[#888888]">
            Platform-wide administration — visible only to you
          </p>
        </div>
        <Link
          href="/creator/organizations"
          className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
        >
          <Buildings size={13} />
          Manage Orgs
        </Link>
      </div>

      {/* Platform KPI stats */}
      <div>
        <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-[#555555]">
          Platform Stats
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Orgs" value={s.totalOrgs.toLocaleString()} sub="all time" />
          <StatCard label="Active Orgs" value={s.activeOrgs.toLocaleString()} sub="this month" />
          <StatCard
            label="MRR"
            value={`$${(s.mrr / 1000).toFixed(1)}k`}
            change={`${s.mrrChange}% vs last month`}
            positive
          />
          <StatCard label="Blocked" value={String(s.blockedOrgs)} sub="organisations" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Users" value={s.totalUsers.toLocaleString()} sub="all orgs" />
          <StatCard
            label="Executions / day"
            value={`${(s.executionsPerDay / 1000).toFixed(1)}k`}
            change={`${s.executionsChange}% vs last week`}
            positive
          />
          <StatCard
            label="API Calls / day"
            value={`${(s.apiCallsPerDay / 1000000).toFixed(1)}M`}
            sub="platform-wide"
          />
          <StatCard label="Error Rate" value={`${s.errorRate}%`} sub="last 24 hours" />
        </div>
      </div>

      {/* Revenue metrics + System health — 2 col */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Revenue metrics */}
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#F0F0F0]">
            <CurrencyDollar size={14} className="text-[#888888]" />
            Revenue Metrics
          </div>
          <div className="mt-4 space-y-3">
            {[
              { label: "This Month", value: `$${r.thisMonth.toLocaleString()}`, highlight: true },
              { label: "Last Month", value: `$${r.lastMonth.toLocaleString()}` },
              { label: "ARR (annualised)", value: `$${r.arr.toLocaleString()}` },
              { label: "Avg MRR per Org", value: `$${r.avgPerOrg}` },
              {
                label: "New MRR this Month",
                value: `$${r.newMrrThisMonth.toLocaleString()}`,
                positive: true,
              },
              { label: "Churn Rate", value: `${r.churnRate}%`, negative: true },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between border-b border-[#1A1A1A] pb-3 last:border-0 last:pb-0"
              >
                <span className="text-[12px] text-[#888888]">{row.label}</span>
                <span
                  className={
                    row.highlight
                      ? "text-[13px] font-semibold text-[#F0F0F0]"
                      : row.positive
                        ? "text-[13px] font-medium text-[#22C55E]"
                        : row.negative
                          ? "text-[13px] font-medium text-[#EF4444]"
                          : "text-[13px] text-[#F0F0F0]"
                  }
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* System health */}
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#F0F0F0]">
            <Heartbeat size={14} className="text-[#888888]" />
            System Health
          </div>
          <div className="mt-4 space-y-2">
            {MOCK_SYSTEM_HEALTH.map((svc) => (
              <div
                key={svc.service}
                className="flex items-center justify-between rounded-[8px] border border-[#1A1A1A] bg-[#111111] px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <HealthDot status={svc.status} />
                  <ServiceIcon service={svc.service} />
                  <span className="text-[12px] text-[#F0F0F0]">{svc.service}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[#555555]">
                  <span>{svc.latency}</span>
                  <span className={svc.uptime === "100%" ? "text-[#22C55E]" : "text-[#888888]"}>
                    {svc.uptime}
                  </span>
                  <span
                    className={
                      svc.status === "healthy"
                        ? "rounded-[4px] bg-[rgba(34,197,94,0.1)] px-1.5 py-0.5 text-[10px] font-medium text-[#22C55E]"
                        : svc.status === "degraded"
                          ? "rounded-[4px] bg-[rgba(245,158,11,0.12)] px-1.5 py-0.5 text-[10px] font-medium text-[#F59E0B]"
                          : "rounded-[4px] bg-[rgba(239,68,68,0.12)] px-1.5 py-0.5 text-[10px] font-medium text-[#EF4444]"
                    }
                  >
                    {svc.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity + Org list preview — 2 col */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Recent activity */}
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#F0F0F0]">
            <Pulse size={14} className="text-[#888888]" />
            Recent Activity
          </div>
          <div className="mt-4 space-y-3">
            {MOCK_RECENT_ACTIVITY.map((a) => (
              <div key={a.id} className="flex items-start gap-2">
                <ActivityIcon type={a.type} />
                <div className="flex-1">
                  <span className="text-[12px] text-[#F0F0F0]">{a.message}</span>
                  <div className="mt-0.5 text-[11px] text-[#555555]">{a.time}</div>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/creator/organizations"
            className="mt-4 flex items-center gap-1 text-[11px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
          >
            View all activity <ArrowRight size={11} />
          </Link>
        </div>

        {/* Org list preview */}
        <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
          <div className="flex items-center justify-between border-b border-[#222222] px-5 py-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[#F0F0F0]">
              <Buildings size={14} className="text-[#888888]" />
              Organisations
            </div>
            <Link
              href="/creator/organizations"
              className="flex items-center gap-1 text-[11px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
            >
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-[#1A1A1A]">
            {MOCK_TOP_ORGS.map((org) => (
              <div key={org.id} className="flex items-center justify-between px-5 py-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#F0F0F0]">{org.name}</span>
                    {org.status === "blocked" ? (
                      <span className="rounded-[4px] bg-[rgba(239,68,68,0.12)] px-1.5 py-0.5 text-[10px] font-medium text-[#EF4444]">
                        blocked
                      </span>
                    ) : (
                      <span className="rounded-[4px] bg-[rgba(34,197,94,0.1)] px-1.5 py-0.5 text-[10px] font-medium text-[#22C55E]">
                        active
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#555555]">
                    {org.plan} · {org.users} users · {org.lastActive}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-medium text-[#F0F0F0]">
                    {org.mrr > 0 ? `$${org.mrr}/mo` : "—"}
                  </div>
                  <Link
                    href={`/creator/organizations/${org.id}`}
                    className="mt-0.5 flex items-center justify-end gap-0.5 text-[11px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
                  >
                    View <ArrowRight size={10} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
