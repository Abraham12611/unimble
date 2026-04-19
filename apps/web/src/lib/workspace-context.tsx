"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspaces } from "./convexHooks";

type Workspace = {
  _id: string;
  name: string;
  slug: string;
  organizationId?: string;
  ownerId: string;
  plan?: string;
  status?: string;
  settings?: unknown;
};

type WorkspaceContextValue = {
  /** The currently active workspace (undefined while loading, null if not found). */
  workspace: Workspace | null | undefined;
  /** All workspaces the user has access to (undefined while loading). */
  workspaces: Workspace[] | undefined;
  /** The workspace slug from the URL. */
  slug: string | undefined;
  /** Whether workspace data is still loading. */
  isLoading: boolean;
  /** Switch to a different workspace by slug. */
  switchWorkspace: (slug: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Provides workspace context derived from the URL slug parameter.
 *
 * Expects to be rendered inside a route with a `[slug]` param
 * (e.g. `/w/[slug]/dashboard`).
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const router = useRouter();

  const slug = typeof params?.slug === "string" ? params.slug : undefined;

  const allWorkspaces = useWorkspaces();
  const workspaces = useMemo(() => {
    if (!allWorkspaces) return undefined;
    return allWorkspaces as unknown as Workspace[];
  }, [allWorkspaces]);

  // Find the workspace matching the current URL slug
  const workspace = useMemo(() => {
    if (!workspaces) return undefined; // still loading
    if (!slug) return null; // no slug in URL
    return workspaces.find((ws) => ws.slug === slug) ?? null;
  }, [workspaces, slug]);

  const isLoading = workspaces === undefined;

  const switchWorkspace = useCallback(
    (newSlug: string) => {
      // Replace the slug segment in the current path
      const currentPath = window.location.pathname;
      const slugPattern = /^\/w\/[^/]+/;

      if (slugPattern.test(currentPath)) {
        const newPath = currentPath.replace(slugPattern, `/w/${newSlug}`);
        router.push(newPath);
      } else {
        router.push(`/w/${newSlug}/dashboard`);
      }
    },
    [router]
  );

  // Persist last used workspace slug
  useEffect(() => {
    if (slug && workspace) {
      try {
        localStorage.setItem("unimble:lastWorkspaceSlug", slug);
      } catch {
        // localStorage may be unavailable
      }
    }
  }, [slug, workspace]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      workspaces,
      slug,
      isLoading,
      switchWorkspace,
    }),
    [workspace, workspaces, slug, isLoading, switchWorkspace]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/**
 * Access the current workspace context.
 * Must be used inside a WorkspaceProvider.
 */
export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspaceContext must be used inside a WorkspaceProvider");
  }
  return ctx;
}

/**
 * Returns the last used workspace slug from localStorage,
 * or the first workspace slug from the user's workspace list.
 */
export function getLastWorkspaceSlug(): string | null {
  try {
    return localStorage.getItem("unimble:lastWorkspaceSlug");
  } catch {
    return null;
  }
}
