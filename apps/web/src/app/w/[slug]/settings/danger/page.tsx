"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { Warning, Trash } from "@phosphor-icons/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { useCurrentUser } from "@/lib/convexHooks";

export default function DangerZonePage() {
  const { workspace } = useWorkspaceContext();
  const currentUser = useCurrentUser() as { _id: string; role?: string } | null | undefined;
  const router = useRouter();
  const deleteWorkspace = useMutation(anyApi.workspaces.deleteWorkspace);

  const isCreator = currentUser?.role === "creator";
  const isOwner = workspace?.ownerId === currentUser?._id;
  const canDelete = isCreator || isOwner;

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const expectedConfirmText = `delete ${workspace?.slug ?? ""}`;
  const confirmMatches = confirmText.trim().toLowerCase() === expectedConfirmText;

  async function handleDelete() {
    if (!workspace?._id || !confirmMatches || !canDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteWorkspace({ id: workspace._id });
      router.push("/dashboard");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {!canDelete && (
        <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-3 text-[12px] text-[#555555]">
          Only the workspace owner can perform these actions.
        </div>
      )}

      {deleteError && (
        <div className="rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">
          {deleteError}
        </div>
      )}

      <div className="rounded-[14px] border border-[rgba(239,68,68,0.25)] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <Warning size={16} className="text-[#EF4444]" />
          <div className="text-[15px] font-medium text-[#F0F0F0]">Delete Workspace</div>
        </div>
        <p className="mt-2 text-[12px] text-[#888888]">
          Permanently delete this workspace and all its data. This includes all operators,
          workflows, executions, integrations, and team member access. This action cannot be undone.
        </p>

        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={!canDelete}
            className="mt-4 rounded-[6px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-4 py-2 text-[13px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.15)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete this workspace
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-[10px] border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.04)] p-4">
            <div className="text-[13px] font-medium text-[#EF4444]">
              Are you sure? This cannot be undone.
            </div>
            <div className="text-[12px] text-[#888888]">
              Type{" "}
              <code className="rounded bg-[#1A1A1A] px-1.5 py-0.5 font-mono text-[11px] text-[#F0F0F0]">
                {expectedConfirmText}
              </code>{" "}
              to confirm:
            </div>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expectedConfirmText}
              className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[rgba(239,68,68,0.4)]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={!confirmMatches || deleting}
                className="flex items-center gap-1.5 rounded-[6px] bg-[#EF4444] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash size={14} />
                <span>{deleting ? "Deleting…" : "Delete Workspace"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                }}
                className="rounded-[6px] px-4 py-2 text-[13px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5 opacity-50">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Transfer Ownership</div>
        <p className="mt-2 text-[12px] text-[#555555]">
          Transfer this workspace to another team member. Coming soon.
        </p>
      </div>
    </div>
  );
}
