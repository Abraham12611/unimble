import { useSubscription } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Hook for subscribing to real-time updates for executions in a workspace
 */
export function useExecutionsSubscription(workspaceId: Id<"workspaces">) {
  return useSubscription(api.subscriptions.executionsSubscription, { workspaceId });
}

/**
 * Hook for subscribing to real-time updates for a specific execution
 */
export function useExecutionSubscription(executionId: Id<"executions">) {
  return useSubscription(api.subscriptions.executionSubscription, { executionId });
}

/**
 * Hook for subscribing to real-time updates for execution steps
 */
export function useExecutionStepsSubscription(executionId: Id<"executions">) {
  return useSubscription(api.subscriptions.executionStepsSubscription, { executionId });
}

/**
 * Hook for subscribing to real-time updates for executions by status
 */
export function useExecutionsByStatusSubscription(workspaceId: Id<"workspaces">, status: string) {
  return useSubscription(api.subscriptions.executionsByStatusSubscription, {
    workspaceId,
    status,
  });
}

/**
 * Hook for subscribing to real-time updates for pending approvals
 */
export function usePendingApprovalsSubscription() {
  return useSubscription(api.subscriptions.pendingApprovalsSubscription, {});
}
