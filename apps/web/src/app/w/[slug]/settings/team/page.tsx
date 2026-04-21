"use client";

import { useMemo, useState } from "react";
import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { UserPlus, Trash } from "@phosphor-icons/react";
import { useWorkspaceContext } from "@/lib/workspace-context";

type MemberUser = {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
} | null;

type EnrichedMember = {
  _id: string;
  userId: string;
  role: string;
  joinedAt: number;
  user: MemberUser;
};

type Invite = {
  _id: string;
  email: string;
  status: string;
  createdAt: number;
};

export default function TeamPage() {
  const { workspace } = useWorkspaceContext();
  const workspaceId = workspace?._id;

  const members = useQuery(
    anyApi.workspaces.listWorkspaceMembersWithProfiles,
    workspaceId ? { workspaceId } : "skip"
  ) as EnrichedMember[] | undefined;

  const invites = useQuery(
    anyApi.workspaces.listWorkspaceInvites,
    workspaceId ? { workspaceId } : "skip"
  ) as Invite[] | undefined;

  const pendingInvites = useMemo(
    () => invites?.filter((i) => i.status === "pending") ?? [],
    [invites]
  );

  const inviteMember = useMutation(anyApi.workspaces.inviteWorkspaceMember);
  const removeMember = useMutation(anyApi.workspaces.removeWorkspaceMember);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  async function handleInvite() {
    if (!workspaceId || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      await inviteMember({ workspaceId, email: inviteEmail.trim() });
      setInviteEmail("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : String(err));
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!workspaceId) return;
    setActionError(null);
    try {
      await removeMember({ workspaceId, userId });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirmRemoveId(null);
    }
  }

  function getMemberDisplayName(member: EnrichedMember): string {
    if (member.user?.name) return member.user.name;
    if (member.user?.firstName) {
      return member.user.lastName
        ? `${member.user.firstName} ${member.user.lastName}`
        : member.user.firstName;
    }
    if (member.user?.email) return member.user.email;
    return "Unknown user";
  }

  function getMemberEmail(member: EnrichedMember): string | null {
    return member.user?.email ?? null;
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">
          {actionError}
        </div>
      )}

      {/* Invite section */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="text-[15px] font-medium text-[#F0F0F0]">Invite Team Member</div>
        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label htmlFor="invite-email" className="text-[12px] text-[#666666]">
              Email address
            </label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInvite();
              }}
              className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
            />
          </div>
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="flex h-9 items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:text-[#555555]"
          >
            <UserPlus size={14} />
            <span>{inviting ? "Sending…" : "Send Invite"}</span>
          </button>
        </div>
        {inviteError && <div className="mt-2 text-[12px] text-[#EF4444]">{inviteError}</div>}
      </div>

      {/* Members table */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
        <div className="border-b border-[#222222] px-5 py-3">
          <div className="text-[15px] font-medium text-[#F0F0F0]">
            Members{members ? ` (${members.length})` : ""}
          </div>
        </div>

        {members === undefined ? (
          <div className="px-5 py-4 text-[12px] text-[#555555]">Loading members…</div>
        ) : members.length === 0 ? (
          <div className="px-5 py-4 text-[12px] text-[#555555]">No members yet.</div>
        ) : (
          <div className="divide-y divide-[#222222]">
            {members.map((member) => {
              const displayName = getMemberDisplayName(member);
              const email = getMemberEmail(member);
              const isConfirming = confirmRemoveId === member._id;

              return (
                <div key={member._id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-[#F0F0F0]">{displayName}</div>
                    {email && displayName !== email && (
                      <div className="mt-0.5 text-[12px] text-[#888888]">{email}</div>
                    )}
                    <div className="mt-0.5 text-[12px] text-[#555555]">
                      Joined {new Date(member.joinedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-[6px] px-2 py-0.5 text-[12px] font-medium ${
                        member.role === "owner"
                          ? "bg-[rgba(99,102,241,0.12)] text-[#6366F1]"
                          : member.role === "admin"
                            ? "bg-[rgba(245,158,11,0.12)] text-[#F59E0B]"
                            : "bg-[rgba(160,160,160,0.08)] text-[#A0A0A0]"
                      }`}
                    >
                      {member.role}
                    </span>
                    {member.role !== "owner" && (
                      <>
                        {isConfirming ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleRemove(member.userId)}
                              className="rounded-[6px] bg-[rgba(239,68,68,0.12)] px-2 py-1 text-[11px] font-medium text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.2)]"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(null)}
                              className="rounded-[6px] px-2 py-1 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(member._id)}
                            title="Remove member"
                            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#EF4444]"
                          >
                            <Trash size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending invitations — only show when there are actual pending invites */}
      {pendingInvites.length > 0 && (
        <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
          <div className="border-b border-[#222222] px-5 py-3">
            <div className="text-[15px] font-medium text-[#F0F0F0]">
              Pending Invitations ({pendingInvites.length})
            </div>
          </div>
          <div className="divide-y divide-[#222222]">
            {pendingInvites.map((invite) => (
              <div key={invite._id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-[13px] text-[#F0F0F0]">{invite.email}</div>
                  <div className="mt-0.5 text-[12px] text-[#555555]">
                    Sent {new Date(invite.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span className="rounded-[6px] bg-[rgba(245,158,11,0.12)] px-2 py-0.5 text-[12px] font-medium text-[#F59E0B]">
                  pending
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
