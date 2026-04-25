"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { X } from "@phosphor-icons/react";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const createWorkspace = useMutation(anyApi.workspaces.createWorkspace);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugify(name);
  const canCreate = name.trim().length > 0 && !creating;

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      await createWorkspace({
        name: name.trim(),
        slug: slug || undefined,
        description: description.trim() || undefined,
      });
      onClose();
      // Navigate to the new workspace
      if (slug) {
        router.push(`/w/${slug}/dashboard`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-[14px] border border-[#2A2A2A] bg-[#161616] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-[#F0F0F0]">Create Workspace</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-[6px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-2 text-[12px] text-[#EF4444]">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <label htmlFor="new-ws-name" className="text-[12px] text-[#666666]">
              Workspace Name
            </label>
            <input
              id="new-ws-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              placeholder="My Workspace"
              autoFocus
              className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
            />
            {slug && (
              <p className="text-[11px] text-[#555555]">
                URL: unimble.app/w/<span className="text-[#888888]">{slug}</span>
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="new-ws-desc" className="text-[12px] text-[#666666]">
              Description <span className="text-[#555555]">(optional)</span>
            </label>
            <textarea
              id="new-ws-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this workspace for?"
              rows={2}
              className="w-full resize-none rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] px-4 py-2 text-[13px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:text-[#555555]"
          >
            {creating ? "Creating…" : "Create Workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}
