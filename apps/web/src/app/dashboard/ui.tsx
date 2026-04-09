"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useMemo, useState } from "react";
import { useOperators, useWorkflows, useWorkspaces } from "@/lib/convexHooks";

export function DashboardClient() {
  const workspaces = useWorkspaces();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(undefined);

  const workspaceOptions = useMemo(() => {
    if (!workspaces) return [];
    return (workspaces as unknown[]).map((ws) => {
      const workspace = ws as { _id: unknown; name?: unknown };
      return {
        id: String(workspace._id),
        name: typeof workspace.name === "string" ? workspace.name : "(unnamed)",
      };
    });
  }, [workspaces]);

  const effectiveWorkspaceId = selectedWorkspaceId ?? workspaceOptions[0]?.id;
  const operators = useOperators(effectiveWorkspaceId);
  const workflows = useWorkflows(effectiveWorkspaceId);

  return (
    <div className="flex-1 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Dashboard</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/settings/sessions"
            className="rounded-md border border-[#222222] bg-[#0f0f0f] px-3 py-2 text-sm text-[#F0F0F0]"
          >
            Sessions
          </Link>
          <UserButton userProfileMode="navigation" userProfileUrl="/settings/profile" />
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[15px] font-medium text-[#F0F0F0]">Workspace</div>
              <div className="mt-1 text-[12px] text-[#888888]">
                Changes to workspaces, operators, and workflows will update instantly.
              </div>
            </div>

            <div className="w-full sm:w-[260px]">
              <select
                value={effectiveWorkspaceId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || undefined;
                  setSelectedWorkspaceId(id);
                }}
                disabled={workspaces === undefined || workspaceOptions.length === 0}
                className="h-9 w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-[13px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
              >
                {workspaces === undefined ? (
                  <option value="">Loading workspaces…</option>
                ) : workspaceOptions.length === 0 ? (
                  <option value="">No workspaces found</option>
                ) : (
                  workspaceOptions.map((ws: { id: string; name: string }) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
            <div className="text-[15px] font-medium text-[#F0F0F0]">Operators</div>
            <div className="mt-3 space-y-2">
              {effectiveWorkspaceId ? (
                operators === undefined ? (
                  <div className="text-[12px] text-[#888888]">Loading operators…</div>
                ) : operators.length === 0 ? (
                  <div className="text-[12px] text-[#888888]">No operators yet.</div>
                ) : (
                  (operators as unknown[]).map((op) => {
                    const operator = op as { _id: unknown; name?: unknown; status?: unknown };
                    return (
                      <div
                        key={String(operator._id)}
                        className="flex items-center justify-between rounded-[10px] border border-[#222222] bg-[#111111] px-3 py-2"
                      >
                        <div className="text-[13px] text-[#F0F0F0]">
                          {typeof operator.name === "string" ? operator.name : "(unnamed)"}
                        </div>
                        <div className="text-[12px] text-[#555555]">
                          {typeof operator.status === "string" ? operator.status : ""}
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                <div className="text-[12px] text-[#888888]">Select a workspace to begin.</div>
              )}
            </div>
          </div>

          <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
            <div className="text-[15px] font-medium text-[#F0F0F0]">Workflows</div>
            <div className="mt-3 space-y-2">
              {effectiveWorkspaceId ? (
                workflows === undefined ? (
                  <div className="text-[12px] text-[#888888]">Loading workflows…</div>
                ) : workflows.length === 0 ? (
                  <div className="text-[12px] text-[#888888]">No workflows yet.</div>
                ) : (
                  (workflows as unknown[]).map((wf) => {
                    const workflow = wf as { _id: unknown; name?: unknown; version?: unknown };
                    return (
                      <div
                        key={String(workflow._id)}
                        className="flex items-center justify-between rounded-[10px] border border-[#222222] bg-[#111111] px-3 py-2"
                      >
                        <div className="text-[13px] text-[#F0F0F0]">
                          {typeof workflow.name === "string" ? workflow.name : "(unnamed)"}
                        </div>
                        <div className="text-[12px] text-[#555555]">
                          v{typeof workflow.version === "number" ? workflow.version : 0}
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                <div className="text-[12px] text-[#888888]">Select a workspace to begin.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
