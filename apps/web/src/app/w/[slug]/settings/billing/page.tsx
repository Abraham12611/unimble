"use client";

import { Check, Lightning, ArrowSquareOut } from "@phosphor-icons/react";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with AI content automation.",
    features: ["1 workspace", "2 operators", "100 executions / month", "Community support"],
    current: true,
    cta: "Current plan",
  },
  {
    id: "growth",
    name: "Growth",
    price: "$49",
    period: "per month",
    description: "Scale your content operations.",
    features: ["3 workspaces", "10 operators", "2,000 executions / month", "Priority support", "Advanced analytics", "Custom schedules"],
    current: false,
    cta: "Upgrade to Growth",
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$149",
    period: "per month",
    description: "Full automation for growing teams.",
    features: ["Unlimited workspaces", "Unlimited operators", "20,000 executions / month", "Dedicated support", "SLA guarantee", "API access", "Custom integrations"],
    current: false,
    cta: "Upgrade to Pro",
  },
];

type Plan = { id: string; name: string; price: string; period: string; description: string; features: readonly string[]; current: boolean; cta: string; highlight?: boolean };

const USAGE_ITEMS = [
  { label: "Executions this month", used: 0, limit: 100, unit: "" },
  { label: "Active operators", used: 0, limit: 2, unit: "" },
  { label: "Storage", used: 0, limit: 512, unit: "MB" },
] as const;

export default function BillingPage() {
  return (
    <div className="space-y-6">
      {/* Current usage */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium">Current Usage</div>
        <div className="mt-4 space-y-3">
          {USAGE_ITEMS.map((item) => {
            const pct = item.limit > 0 ? (item.used / item.limit) * 100 : 0;
            const warn = pct > 80;
            return (
              <div key={item.label}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-[#888888]">{item.label}</span>
                  <span className={warn ? "text-[#F59E0B]" : "text-[#555555]"}>
                    {item.used}{item.unit} / {item.limit}{item.unit}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#222222]">
                  <div
                    className={`h-1.5 rounded-full transition-all ${warn ? "bg-[#F59E0B]" : "bg-[#6366F1]"}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[11px] text-[#555555]">Usage resets on the 1st of each month.</div>
      </div>

      {/* Plan cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(PLANS as Plan[]).map((plan) => (
          <div key={plan.id}
            className={`rounded-[14px] border p-5 ${plan.current ? "border-[rgba(99,102,241,0.4)] bg-[rgba(99,102,241,0.04)]" : plan.highlight ? "border-[rgba(99,102,241,0.2)] bg-[#161616]" : "border-[#222222] bg-[#161616]"}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[14px] font-semibold">{plan.name}</div>
                <div className="mt-0.5 text-[11px] text-[#555555]">{plan.description}</div>
              </div>
              {plan.highlight && (
                <span className="rounded-full bg-[rgba(99,102,241,0.15)] px-2 py-0.5 text-[10px] font-medium text-[#6366F1]">
                  Popular
                </span>
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-[28px] font-bold leading-none">{plan.price}</span>
              <span className="text-[11px] text-[#555555]">/{plan.period}</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-[12px] text-[#888888]">
                  <Check size={11} weight="bold" className="shrink-0 text-[#22C55E]" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={plan.current}
              className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-[6px] px-3 py-2 text-[12px] font-medium transition-colors ${plan.current ? "cursor-default border border-[#2A2A2A] bg-[#1C1C1C] text-[#555555]" : "border border-[#2A2A2A] bg-[#1C1C1C] hover:bg-[#222222]"}`}>
              {!plan.current && <ArrowSquareOut size={12} />}
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Billing info */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <Lightning size={16} className="text-[#888888]" />
          <div className="text-[15px] font-medium">Billing Information</div>
        </div>
        <div className="mt-3 text-[13px] text-[#555555]">
          You are on the Free plan. No payment method on file.
        </div>
        <button type="button" className="mt-3 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium hover:bg-[#222222]">
          Add payment method
        </button>
      </div>
    </div>
  );
}
