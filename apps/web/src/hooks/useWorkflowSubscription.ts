import { useSubscription } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Hook for subscribing to real-time updates for workflows in a workspace
 */
export function useWorkflowsSubscription(workspaceId: Id<"workspaces">) {
  return useSubscription(api.subscriptions.workflowsSubscription, { workspaceId });
}

/**
 * Hook for subscribing to real-time updates for a specific workflow
 */
export function useWorkflowSubscription(workflowId: Id<"workflows">) {
  return useSubscription(api.subscriptions.workflowSubscription, { workflowId });
}

/**
 * Hook for subscribing to real-time updates for workflow versions
 */
export function useWorkflowVersionsSubscription(workflowId: Id<"workflows">) {
  return useSubscription(api.subscriptions.workflowVersionsSubscription, { workflowId });
}

/**
 * Hook for subscribing to real-time updates for workflows by status
 */
export function useWorkflowsByStatusSubscription(workspaceId: Id<"workspaces">, status: string) {
  return useSubscription(api.subscriptions.workflowsByStatusSubscription, {
    workspaceId,
    status,
  });
}
