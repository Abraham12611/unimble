import { anyApi } from "convex/server";
import { useQuery } from "convex/react";

export function useWorkspaces() {
  return useQuery(anyApi.workspaces.listWorkspaces, {});
}

export function useWorkspace(workspaceId?: string) {
  return useQuery(anyApi.workspaces.getWorkspace, workspaceId ? { id: workspaceId } : "skip");
}

export function useOperators(workspaceId?: string) {
  return useQuery(anyApi.operators.listOperators, workspaceId ? { workspaceId } : "skip");
}

export function useWorkflows(workspaceId?: string) {
  return useQuery(anyApi.workflows.listWorkflows, workspaceId ? { workspaceId } : "skip");
}
