import { anyApi } from "convex/server";
import { useQuery } from "convex/react";

// ---------------------------------------------------------------------------
// Single-resource hooks
// ---------------------------------------------------------------------------

export function useCurrentUser() {
  return useQuery(anyApi.users.getCurrentUser, {});
}

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

export function useExecutions(workspaceId?: string, status?: string) {
  return useQuery(anyApi.executions.listExecutions, workspaceId ? { workspaceId, status } : "skip");
}

export function useExecution(executionId?: string) {
  return useQuery(anyApi.executions.getExecution, executionId ? { id: executionId } : "skip");
}

export function useExecutionSteps(executionId?: string, status?: string) {
  return useQuery(
    anyApi.executions.listExecutionSteps,
    executionId ? { executionId, status } : "skip"
  );
}

export function useExecutionApprovals(executionId?: string, status?: string) {
  return useQuery(
    anyApi.executions.listExecutionApprovals,
    executionId ? { executionId, status } : "skip"
  );
}

export function useOperator(operatorId?: string) {
  return useQuery(anyApi.operators.getOperator, operatorId ? { id: operatorId } : "skip");
}

export function useWorkflow(workflowId?: string) {
  return useQuery(anyApi.workflows.getWorkflow, workflowId ? { id: workflowId } : "skip");
}

export function useWorkflowVersions(workflowId?: string) {
  return useQuery(
    anyApi.workflows.listWorkflowVersions,
    workflowId ? { workflowId } : "skip"
  );
}

export function useWorkflowsByOperator(workspaceId?: string, operatorId?: string) {
  return useQuery(
    anyApi.workflows.listWorkflows,
    workspaceId ? { workspaceId, operatorId } : "skip"
  );
}

export function useExecutionStep(stepId?: string) {
  return useQuery(anyApi.executions.getExecutionStep, stepId ? { id: stepId } : "skip");
}

