"use client";

import { useState } from "react";
import { User, FloppyDisk, CheckCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export default function ProfilePage() {
  const [name, setName] = useState("John Doe");
  const [email] = useState("john@acme.com");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    // TODO: Wire to Clerk user update / Convex mutation
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Avatar</div>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#1A1A1A] border border-[#2A2A2A]">
            <User size={28} className="text-[#555555]" />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
            >
              Upload
            </button>
            <button
              type="button"
              className="rounded-[6px] border border-[#2A2A2A] px-3 py-1.5 text-[12px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
            >
              Remove
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[#555555]">Recommended: 256×256 px, PNG or SVG</p>
      </div>

      {/* Profile info */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Profile</div>
        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <label className="text-[12px] text-[#666666]">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-[#666666]">Email</label>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={email}
                disabled
                className="flex-1 rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#555555] outline-none cursor-not-allowed"
              />
              <div className="flex items-center gap-1 text-[11px] text-[#22C55E]">
                <CheckCircle size={12} weight="fill" />
                Verified
              </div>
            </div>
            <p className="text-[11px] text-[#555555]">
              Email changes are managed through your authentication provider.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-[#666666]">Bio (optional)</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell your team a bit about yourself"
              rows={3}
              className="w-full resize-none rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 rounded-[6px] border px-4 py-2 text-[13px] font-medium transition-colors",
              saved
                ? "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] text-[#22C55E]"
                : "border-[#2A2A2A] bg-[#1C1C1C] text-[#F0F0F0] hover:bg-[#222222] disabled:cursor-not-allowed disabled:text-[#555555]"
            )}
          >
            {saved ? <CheckCircle size={14} weight="fill" /> : <FloppyDisk size={14} />}
            {saving ? "Saving…" : saved ? "Saved" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
