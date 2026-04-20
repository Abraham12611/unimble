"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaces } from "@/lib/convexHooks";
import { getLastWorkspaceSlug } from "@/lib/workspace-context";

/**
 * Redirect page: sends the user to their workspace-scoped dashboard.
 *
 * Checks localStorage for the last used workspace slug first,
 * then falls back to the first workspace in the list.
 */
export default function DashboardRedirect() {
  const router = useRouter();
  const workspaces = useWorkspaces();

  useEffect(() => {
    if (!workspaces) return; // still loading

    const wsList = workspaces as unknown as { slug: string }[];

    if (wsList.length === 0) {
      // No workspaces — shouldn't happen after onboarding, but handle gracefully
      router.replace("/onboarding");
      return;
    }

    const lastSlug = getLastWorkspaceSlug();
    const match = lastSlug ? wsList.find((ws) => ws.slug === lastSlug) : undefined;
    const targetSlug = match?.slug ?? wsList[0].slug;

    router.replace(`/w/${targetSlug}/dashboard`);
  }, [workspaces, router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-[13px] text-[#555555]">Loading workspace…</div>
    </div>
  );
}
