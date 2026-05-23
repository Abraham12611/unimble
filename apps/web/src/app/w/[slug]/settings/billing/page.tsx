"use client";

import { CreditCard, Download, ArrowUpRight, CheckCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Mock data — TODO: replace with Convex + billing provider queries
// ---------------------------------------------------------------------------

const MOCK_PLAN = {
  name: "Pro",
  price: "$49/month",
  renews: "June 1, 2026",
  features: [
    "3 operators",
    "1,000 executions/month",
    "10 integrations",
    "3 team members",
    "Email support",
  ],
};

const MOCK_USAGE = [
  { label: "Executions", used: 847, limit: 1000 },
  { label: "Operators", used: 2, limit: 3 },
  { label: "Integrations", used: 5, limit: 10 },
  { label: "Team Members", used: 2, limit: 3 },
];

const MOCK_PAYMENT = {
  brand: "Visa",
  last4: "4242",
  expires: "12/2027",
};

const MOCK_HISTORY = [
  { date: "May 1, 2026", description: "Pro Plan — May", amount: "$49.00" },
  { date: "Apr 1, 2026", description: "Pro Plan — April", amount: "$49.00" },
  { date: "Mar 1, 2026", description: "Pro Plan — March", amount: "$49.00" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(Math.round((used / limit) * 100), 100);
  const isWarning = pct >= 80 && pct < 100;
  const isDanger = pct >= 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1A1A1A]">
      <div
        className={cn(
          "h-full rounded-full",
          isDanger ? "bg-[#EF4444]" : isWarning ? "bg-[#F59E0B]" : "bg-[#6366F1]"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function BillingPage() {
  return (
    <div className="space-y-6">
      {/* Current plan */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-[15px] font-medium text-[#F0F0F0]">Current Plan</div>
              <span className="rounded-[6px] bg-[rgba(99,102,241,0.12)] px-2 py-0.5 text-[12px] font-medium text-[#6366F1]">
                {MOCK_PLAN.name}
              </span>
            </div>
            <div className="mt-1 text-[13px] font-semibold text-[#F0F0F0]">{MOCK_PLAN.price}</div>
            <div className="mt-0.5 text-[12px] text-[#555555]">Renews: {MOCK_PLAN.renews}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
            >
              Change Plan
            </button>
            <button
              type="button"
              className="rounded-[6px] border border-[rgba(239,68,68,0.3)] bg-transparent px-3 py-1.5 text-[12px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)]"
            >
              Cancel Subscription
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-[#222222] pt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[#555555]">
            Includes
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {MOCK_PLAN.features.map((f) => (
              <li key={f} className="flex items-center gap-1.5 text-[12px] text-[#888888]">
                <CheckCircle size={12} className="shrink-0 text-[#22C55E]" weight="fill" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Usage this period */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Usage — May 2026</div>
        <div className="mt-4 space-y-4">
          {MOCK_USAGE.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#888888]">{item.label}</span>
                <span className="font-mono text-[#F0F0F0]">
                  {item.used.toLocaleString()} / {item.limit.toLocaleString()}
                </span>
              </div>
              <UsageBar used={item.used} limit={item.limit} />
            </div>
          ))}
          <div className="mt-2 border-t border-[#222222] pt-3 text-[12px] text-[#555555]">
            AI Usage: $34.50 (included in plan) &nbsp;·&nbsp; Overage: $0.00
          </div>
        </div>
      </div>

      {/* Payment method */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Payment Method</div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-14 items-center justify-center rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A]">
              <CreditCard size={18} className="text-[#888888]" />
            </div>
            <div>
              <div className="text-[13px] text-[#F0F0F0]">
                {MOCK_PAYMENT.brand} ending in {MOCK_PAYMENT.last4}
              </div>
              <div className="text-[12px] text-[#555555]">Expires {MOCK_PAYMENT.expires}</div>
            </div>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            Update
            <ArrowUpRight size={12} />
          </button>
        </div>
      </div>

      {/* Billing history */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
        <div className="border-b border-[#222222] px-5 py-3">
          <div className="text-[15px] font-medium text-[#F0F0F0]">Billing History</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1A1A1A]">
                {["Date", "Description", "Amount", ""].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-[#555555]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {MOCK_HISTORY.map((row) => (
                <tr key={row.date} className="transition-colors hover:bg-[#1C1C1C]">
                  <td className="px-5 py-3 text-[12px] text-[#888888]">{row.date}</td>
                  <td className="px-5 py-3 text-[13px] text-[#F0F0F0]">{row.description}</td>
                  <td className="px-5 py-3 font-mono text-[13px] text-[#F0F0F0]">{row.amount}</td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[11px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
                    >
                      <Download size={12} />
                      Invoice
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-3 text-[12px] text-[#555555]">
        Billing management will be fully wired once the billing provider (Stripe) integration is
        complete. Buttons above are UI placeholders.
      </div>
    </div>
  );
}
