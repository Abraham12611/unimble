/**
 * Frontend hooks for integration management.
 *
 * Wraps Convex queries, mutations, and actions for the integrations
 * feature. Provides type-safe access to the integration catalog,
 * workspace connections, and OAuth/API-key flows.
 */

import { anyApi } from "convex/server";
import { useQuery, useMutation, useAction } from "convex/react";

// ---------------------------------------------------------------------------
// Catalog queries (static registry, no workspace needed)
// ---------------------------------------------------------------------------

export function useIntegrationCatalog(opts?: {
  category?: string;
  search?: string;
  activeOnly?: boolean;
}) {
  return useQuery(anyApi.integrations.getIntegrationCatalog, {
    category: opts?.category,
    search: opts?.search,
    activeOnly: opts?.activeOnly,
  });
}

export function useIntegrationCategories() {
  return useQuery(anyApi.integrations.getIntegrationCategories, {});
}

export function useIntegrationMeta(slug?: string) {
  return useQuery(anyApi.integrations.getIntegrationMeta, slug ? { slug } : "skip");
}

// ---------------------------------------------------------------------------
// Workspace integration queries (from Convex DB)
// ---------------------------------------------------------------------------

export function useWorkspaceIntegrations(workspaceId?: string) {
  return useQuery(anyApi.integrations.listIntegrations, workspaceId ? { workspaceId } : "skip");
}

export function useIntegrationByProvider(workspaceId?: string, provider?: string) {
  return useQuery(
    anyApi.integrations.getIntegrationByProvider,
    workspaceId && provider ? { workspaceId, provider } : "skip"
  );
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useUpsertIntegration() {
  return useMutation(anyApi.integrations.upsertIntegration);
}

export function useDisconnectIntegration() {
  return useMutation(anyApi.integrations.disconnectIntegration);
}

export function useDeleteIntegration() {
  return useMutation(anyApi.integrations.deleteIntegration);
}

// ---------------------------------------------------------------------------
// Actions (external API calls)
// ---------------------------------------------------------------------------

export function useTestComposioConnection() {
  return useAction(anyApi.integrations.testComposioConnection);
}

export function useGetToolkitStatuses() {
  return useAction(anyApi.integrations.getToolkitStatuses);
}

export function useInitiateToolkitAuth() {
  return useAction(anyApi.integrations.initiateToolkitAuth);
}

export function useValidateApiKey() {
  return useAction(anyApi.integrations.validateApiKey);
}

export function useConnectWithApiKey() {
  return useAction(anyApi.integrations.connectWithApiKey);
}
