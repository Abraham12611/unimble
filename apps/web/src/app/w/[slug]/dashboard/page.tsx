"use client";

import { useWorkspaceContext } from "@/lib/workspace-context";

export default function WorkspaceDashboardPage() {
  const { workspace } = useWorkspaceContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-medium leading-snug">{workspace?.name ?? "Dashboard"}</h1>
        <p className="mt-1 text-[12px] text-[#888888]">Workspace overview and recent activity</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active operators", value: "0" },
          { label: "Executions this week", value: "0" },
          { label: "Content published", value: "0" },
          { label: "Pending approvals", value: "0" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
              {stat.label}
            </div>
            <div className="mt-2 text-[36px] font-semibold leading-none tracking-tight text-[#F0F0F0]">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Recent Activity</div>
        <div className="mt-3 text-[12px] text-[#555555]">
          No activity yet. Deploy an operator to get started.
        </div>
      </div>
    </div>
  );
}
