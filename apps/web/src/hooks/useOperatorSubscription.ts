import { useSubscription } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Hook for subscribing to real-time updates for operators in a workspace
 */
export function useOperatorsSubscription(workspaceId: Id<"workspaces">) {
  return useSubscription(api.subscriptions.operatorsSubscription, { workspaceId });
}

/**
 * Hook for subscribing to real-time updates for a specific operator
 */
export function useOperatorSubscription(operatorId: Id<"operators">) {
  return useSubscription(api.subscriptions.operatorSubscription, { operatorId });
}

/**
 * Hook for subscribing to real-time updates for operators by status
 */
export function useOperatorsByStatusSubscription(workspaceId: Id<"workspaces">, status: string) {
  return useSubscription(api.subscriptions.operatorsByStatusSubscription, {
    workspaceId,
    status,
  });
}
