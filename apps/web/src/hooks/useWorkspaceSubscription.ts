import { useSubscription } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Hook for subscribing to real-time updates for a specific workspace
 */
export function useWorkspaceSubscription(workspaceId: Id<"workspaces">) {
  return useSubscription(api.subscriptions.workspaceSubscription, { workspaceId });
}

/**
 * Hook for subscribing to real-time updates for all user's workspaces
 */
export function useUserWorkspacesSubscription() {
  return useSubscription(api.subscriptions.userWorkspacesSubscription, {});
}

/**
 * Hook for subscribing to real-time updates for workspace members
 */
export function useWorkspaceMembersSubscription(workspaceId: Id<"workspaces">) {
  return useSubscription(api.subscriptions.workspaceMembersSubscription, { workspaceId });
}
