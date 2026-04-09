"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import {
  useExecutionApprovals,
  useExecutions,
  useExecutionSteps,
  useOperators,
  useWorkflows,
  useWorkspaces,
} from "@/lib/convexHooks";

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

  const workflowOptions = useMemo(() => {
    if (!workflows) return [];
    return (workflows as unknown[]).map((wf) => {
      const workflow = wf as { _id: unknown; name?: unknown };
      return {
        id: String(workflow._id),
        name: typeof workflow.name === "string" ? workflow.name : "(unnamed)",
      };
    });
  }, [workflows]);

  const executions = useExecutions(effectiveWorkspaceId);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | undefined>(undefined);

  const executionOptions = useMemo(() => {
    if (!executions) return [];
    return (executions as unknown[]).map((exe) => {
      const execution = exe as { _id: unknown; status?: unknown; startedAt?: unknown };
      const status = typeof execution.status === "string" ? execution.status : "";
      const startedAt = typeof execution.startedAt === "number" ? execution.startedAt : 0;
      return {
        id: String(execution._id),
        status,
        startedAt,
      };
    });
  }, [executions]);

  const effectiveExecutionId = selectedExecutionId ?? executionOptions[0]?.id;
  const steps = useExecutionSteps(effectiveExecutionId);
  const pendingApprovals = useExecutionApprovals(effectiveExecutionId, "pending");

  const createOperator = useMutation(anyApi.operators.createOperator);
  const createWorkflow = useMutation(anyApi.workflows.createWorkflow);
  const createExecution = useMutation(anyApi.executions.createExecution);
  const createStep = useMutation(anyApi.executions.createExecutionStep);
  const createApproval = useMutation(anyApi.executions.createExecutionApproval);
  const respondApproval = useMutation(anyApi.executions.respondExecutionApproval);

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
            <div className="flex items-center justify-between gap-3">
              <div className="text-[15px] font-medium text-[#F0F0F0]">Operators</div>
              <button
                type="button"
                disabled={!effectiveWorkspaceId}
                onClick={async () => {
                  if (!effectiveWorkspaceId) return;
                  const now = Date.now();
                  await createOperator({
                    workspaceId: effectiveWorkspaceId,
                    type: "manual",
                    name: `Test operator ${now}`,
                    status: "active",
                  });
                }}
                className="h-9 rounded-[10px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:border-[#222222] disabled:bg-[#111111] disabled:text-[#555555]"
              >
                Create test operator
              </button>
            </div>
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
            <div className="flex items-center justify-between gap-3">
              <div className="text-[15px] font-medium text-[#F0F0F0]">Workflows</div>
              <button
                type="button"
                disabled={!effectiveWorkspaceId}
                onClick={async () => {
                  if (!effectiveWorkspaceId) return;
                  const now = Date.now();
                  await createWorkflow({
                    workspaceId: effectiveWorkspaceId,
                    name: `Test workflow ${now}`,
                    status: "active",
                    steps: [],
                    trigger: { type: "manual" },
                  });
                }}
                className="h-9 rounded-[10px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:border-[#222222] disabled:bg-[#111111] disabled:text-[#555555]"
              >
                Create test workflow
              </button>
            </div>
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

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5 md:col-span-1">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-medium text-[#F0F0F0]">Executions</div>
              <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
                Live
              </div>
            </div>

            <div className="mt-3">
              <select
                value={effectiveExecutionId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || undefined;
                  setSelectedExecutionId(id);
                }}
                disabled={
                  !effectiveWorkspaceId || executions === undefined || executionOptions.length === 0
                }
                className="h-9 w-full rounded-[10px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-[13px] text-[#F0F0F0] outline-none focus:border-[#3A3A3A]"
              >
                {!effectiveWorkspaceId ? (
                  <option value="">Select a workspace</option>
                ) : executions === undefined ? (
                  <option value="">Loading executions…</option>
                ) : executionOptions.length === 0 ? (
                  <option value="">No executions yet</option>
                ) : (
                  executionOptions.map((exe) => (
                    <option key={exe.id} value={exe.id}>
                      {exe.status || "unknown"} · {new Date(exe.startedAt || 0).toLocaleString()}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="mt-3 text-[12px] text-[#888888]">
              Pending approvals: {pendingApprovals === undefined ? "…" : pendingApprovals.length}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!effectiveWorkspaceId || workflowOptions.length === 0}
                onClick={async () => {
                  if (!effectiveWorkspaceId) return;
                  const workflowId = workflowOptions[0]?.id;
                  if (!workflowId) return;

                  await createExecution({
                    workspaceId: effectiveWorkspaceId,
                    workflowId,
                    status: "queued",
                    input: { source: "dashboard" },
                  });
                }}
                className="h-9 rounded-[10px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:border-[#222222] disabled:bg-[#111111] disabled:text-[#555555]"
              >
                Create test execution
              </button>

              <button
                type="button"
                disabled={!effectiveExecutionId}
                onClick={async () => {
                  if (!effectiveExecutionId) return;

                  const stepId = (() => {
                    const first =
                      Array.isArray(steps) && steps.length > 0
                        ? (steps as unknown[])[0]
                        : undefined;
                    const s = first as { stepId?: unknown } | undefined;
                    return typeof s?.stepId === "string" && s.stepId.trim() ? s.stepId : "manual";
                  })();

                  await createApproval({
                    executionId: effectiveExecutionId,
                    stepId,
                    type: "manual",
                    content: { source: "dashboard" },
                  });
                }}
                className="h-9 rounded-[10px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:border-[#222222] disabled:bg-[#111111] disabled:text-[#555555]"
              >
                Create test approval
              </button>
            </div>

            {!effectiveWorkspaceId || workflowOptions.length > 0 ? null : (
              <div className="mt-3 text-[12px] text-[#888888]">
                You need at least 1 workflow in this workspace to create an execution.
              </div>
            )}
          </div>

          <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5 md:col-span-1">
            <div className="text-[15px] font-medium text-[#F0F0F0]">Steps</div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!effectiveExecutionId}
                onClick={async () => {
                  if (!effectiveExecutionId) return;
                  const now = Date.now();
                  await createStep({
                    executionId: effectiveExecutionId,
                    stepId: `manual-${now}`,
                    name: "Manual step",
                    type: "manual",
                    status: "queued",
                    input: { source: "dashboard" },
                  });
                }}
                className="h-9 rounded-[10px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:border-[#222222] disabled:bg-[#111111] disabled:text-[#555555]"
              >
                Create test step
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {effectiveExecutionId ? (
                steps === undefined ? (
                  <div className="text-[12px] text-[#888888]">Loading steps…</div>
                ) : steps.length === 0 ? (
                  <div className="text-[12px] text-[#888888]">No steps yet.</div>
                ) : (
                  (steps as unknown[]).map((s) => {
                    const step = s as {
                      _id: unknown;
                      name?: unknown;
                      status?: unknown;
                      type?: unknown;
                    };
                    return (
                      <div
                        key={String(step._id)}
                        className="flex items-center justify-between rounded-[10px] border border-[#222222] bg-[#111111] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] text-[#F0F0F0]">
                            {typeof step.name === "string" ? step.name : "(unnamed)"}
                          </div>
                          <div className="text-[12px] text-[#555555]">
                            {typeof step.type === "string" ? step.type : ""}
                          </div>
                        </div>
                        <div className="text-[12px] text-[#888888]">
                          {typeof step.status === "string" ? step.status : ""}
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                <div className="text-[12px] text-[#888888]">Select an execution to begin.</div>
              )}
            </div>
          </div>

          <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5 md:col-span-1">
            <div className="text-[15px] font-medium text-[#F0F0F0]">Pending approvals</div>
            <div className="mt-3 space-y-2">
              {effectiveExecutionId ? (
                pendingApprovals === undefined ? (
                  <div className="text-[12px] text-[#888888]">Loading approvals…</div>
                ) : pendingApprovals.length === 0 ? (
                  <div className="text-[12px] text-[#888888]">No pending approvals.</div>
                ) : (
                  (pendingApprovals as unknown[]).map((a) => {
                    const approval = a as {
                      _id: unknown;
                      type?: unknown;
                      stepId?: unknown;
                      requestedAt?: unknown;
                    };
                    const requestedAt =
                      typeof approval.requestedAt === "number" ? approval.requestedAt : undefined;
                    return (
                      <div
                        key={String(approval._id)}
                        className="rounded-[10px] border border-[#222222] bg-[#111111] px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[13px] text-[#F0F0F0]">
                            {typeof approval.type === "string" ? approval.type : "approval"}
                          </div>
                          <div className="text-[12px] text-[#555555]">
                            {typeof approval.stepId === "string" ? approval.stepId : ""}
                          </div>
                        </div>
                        {requestedAt !== undefined && (
                          <div className="mt-1 text-[12px] text-[#888888]">
                            Requested {new Date(requestedAt).toLocaleString()}
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await respondApproval({
                                id: String(approval._id),
                                status: "approved",
                              });
                            }}
                            className="h-8 rounded-[10px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await respondApproval({
                                id: String(approval._id),
                                status: "rejected",
                              });
                            }}
                            className="h-8 rounded-[10px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                <div className="text-[12px] text-[#888888]">Select an execution to begin.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
