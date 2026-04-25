"use client";

import { useEffect, useRef, useState } from "react";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { FloppyDisk } from "@phosphor-icons/react";
import { useWorkspaceContext, type Workspace } from "@/lib/workspace-context";
import { useCurrentUser } from "@/lib/convexHooks";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Normalize slug while typing — allows trailing hyphens so users can type naturally. */
function normalizeSlugInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-");
}

/** Final slug cleanup — strips leading/trailing hyphens. Applied on blur and before save. */
function finalizeSlug(input: string): string {
  return input.replace(/^-+|-+$/g, "");
}

export default function GeneralSettingsPage() {
  const { workspace } = useWorkspaceContext();
  const currentUser = useCurrentUser() as { _id: string; role?: string } | null | undefined;
  const updateWorkspace = useMutation(anyApi.workspaces.updateWorkspace);

  const isCreator = currentUser?.role === "creator";
  const isOwner = workspace?.ownerId === currentUser?._id;
  const canEdit = isCreator || isOwner;

  const wsId = workspace?._id;
  const wsName = workspace?.name;
  const wsDesc = (workspace as Workspace | null)?.description;
  const wsSlug = workspace?.slug;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Only sync form when workspace identity changes (navigate to different workspace).
  // Does NOT re-fire on real-time updates to wsName/wsDesc/wsSlug, so in-progress
  // edits are never silently discarded.
  const prevWsId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (wsId && wsId !== prevWsId.current) {
      prevWsId.current = wsId;
      setName(wsName ?? "");
      setDescription(wsDesc ?? "");
      setSlug(wsSlug ?? "");
    }
  }, [wsId, wsName, wsDesc, wsSlug]);

  const finalSlug = finalizeSlug(slug);
  const slugValid = slug === "" || SLUG_PATTERN.test(finalSlug);
  const nameValid = name.trim().length > 0;
  const hasChanges =
    name !== (wsName ?? "") || description !== (wsDesc ?? "") || slug !== (wsSlug ?? "");

  async function handleSave() {
    if (!wsId || !canEdit || !slugValid || !nameValid) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateWorkspace({
        id: wsId,
        name: name.trim(),
        description: description.trim() || null,
        slug: finalSlug || null,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {saveError && (
        <div className="rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">
          {saveError}
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-[10px] border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)] p-3 text-[12px] text-[#22C55E]">
          Settings saved successfully.
        </div>
      )}

      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Workspace Information</div>
        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <label htmlFor="ws-name" className="text-[12px] text-[#666666]">
              Workspace Name
            </label>
            <input
              id="ws-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              placeholder="My Workspace"
              className={`w-full rounded-[6px] border bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] disabled:cursor-not-allowed disabled:text-[#555555] ${
                !nameValid && name !== (wsName ?? "")
                  ? "border-[rgba(239,68,68,0.4)] focus:border-[rgba(239,68,68,0.6)]"
                  : "border-[#2A2A2A] focus:border-[#3A3A3A]"
              }`}
            />
            {!nameValid && name !== (wsName ?? "") && (
              <p className="mt-1 text-[11px] text-[#EF4444]">Workspace name is required.</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="ws-description" className="text-[12px] text-[#666666]">
              Description
            </label>
            <textarea
              id="ws-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
              placeholder="What is this workspace for?"
              rows={3}
              className="w-full resize-none rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A] disabled:cursor-not-allowed disabled:text-[#555555]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="ws-slug" className="text-[12px] text-[#666666]">
              Workspace URL
            </label>
            <div className="flex items-center gap-0">
              <span className="rounded-l-[6px] border border-r-0 border-[#2A2A2A] bg-[#111111] px-3 py-2 text-[13px] text-[#555555]">
                unimble.app/w/
              </span>
              <input
                id="ws-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(normalizeSlugInput(e.target.value))}
                onBlur={() => setSlug(finalizeSlug(slug))}
                disabled={!canEdit}
                placeholder="my-workspace"
                className={`flex-1 rounded-r-[6px] border bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] disabled:cursor-not-allowed disabled:text-[#555555] ${
                  !slugValid && slug !== ""
                    ? "border-[rgba(239,68,68,0.4)] focus:border-[rgba(239,68,68,0.6)]"
                    : "border-[#2A2A2A] focus:border-[#3A3A3A]"
                }`}
              />
            </div>
            {!slugValid && slug !== "" && (
              <p className="mt-1 text-[11px] text-[#EF4444]">
                URL must contain only lowercase letters, numbers, and hyphens.
              </p>
            )}
            {slugValid && finalSlug !== (wsSlug ?? "") && finalSlug !== "" && (
              <p className="mt-1 text-[11px] text-[#F59E0B]">
                Changing the URL will break existing links and bookmarks.
              </p>
            )}
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges || !slugValid || !nameValid}
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:text-[#555555]"
          >
            <FloppyDisk size={14} />
            <span>{saving ? "Saving…" : "Save Changes"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
