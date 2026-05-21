"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const canCreate = name.trim().length > 0 && slug.length > 0 && !creating;

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      await createWorkspace({
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
      });
      onClose();
      router.push(`/w/${slug}/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Create Workspace" size="md">
      {error && (
        <div className="mb-4 rounded-[6px] border border-[var(--semantic-negative-fg)]/25 bg-[var(--semantic-negative-bg)] p-2 text-[12px] text-[var(--semantic-negative-fg)]">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <Input
            label="Workspace Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            placeholder="My Workspace"
            autoFocus
          />
          {slug ? (
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              URL: unimble.app/w/<span className="text-[var(--text-secondary)]">{slug}</span>
            </p>
          ) : name.trim().length > 0 ? (
            <p className="mt-1 text-[11px] text-[var(--semantic-negative-fg)]">
              Name must contain at least one letter or number for the URL.
            </p>
          ) : null}
        </div>

        <Textarea
          label="Description"
          hint="Optional — what is this workspace for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this workspace for?"
          rows={2}
        />
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!canCreate} loading={creating}>
          Create Workspace
        </Button>
      </div>
    </Modal>
  );
}
