"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { EnvelopeSimple, X, Clock, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface InviteActionsProps {
  invite: {
    _id: string;
    email: string;
    status: "pending" | "accepted" | "expired";
    createdAt: number;
    expiresAt?: number;
    invitedBy: {
      name?: string;
      email: string;
    };
    workspaceId: string;
  };
  onInvitesChange: () => void;
}

export function InviteActions({ invite, onInvitesChange }: InviteActionsProps) {
  const [isResending, setIsResending] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resendInvite = useMutation(anyApi.workspaces.inviteWorkspaceMember);
  const cancelInvite = useMutation(anyApi.workspaces.cancelWorkspaceInvite);

  const handleResend = async () => {
    if (isResending) return;

    setIsResending(true);
    setError(null);

    try {
      await resendInvite({
        workspaceId: invite.workspaceId,
        email: invite.email,
      });
      onInvitesChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend invitation");
    } finally {
      setIsResending(false);
    }
  };

  const handleCancel = async () => {
    if (isCancelling) return;

    setIsCancelling(true);
    setError(null);

    try {
      await cancelInvite({
        inviteId: invite._id,
      });
      onInvitesChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel invitation");
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusIcon = () => {
    switch (invite.status) {
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "accepted":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "expired":
        return <WarningCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (invite.status) {
      case "pending":
        return "Pending";
      case "accepted":
        return "Accepted";
      case "expired":
        return "Expired";
      default:
        return "Unknown";
    }
  };

  const isExpired = invite.expiresAt && invite.expiresAt < Date.now();
  const canResend = invite.status === "expired" || isExpired;
  const canCancel = invite.status === "pending" && !isExpired;

  return (
    <div className="flex items-center justify-between p-4 border border-[#2A2A2A] rounded-[10px] bg-[#161616]">
      <div className="flex items-center space-x-3">
        {getStatusIcon()}
        <div>
          <div className="font-medium text-[#F0F0F0]">{invite.email}</div>
          <div className="text-sm text-[#888888]">
            Invited by {invite.invitedBy.name || invite.invitedBy.email} • {getStatusText()}
          </div>
          {invite.expiresAt && (
            <div className="text-xs text-[#666666]">
              Expires {new Date(invite.expiresAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {canResend && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResend}
            disabled={isResending}
            className="text-[#888888] hover:text-[#F0F0F0]"
          >
            <EnvelopeSimple className="h-4 w-4 mr-1" />
            {isResending ? "Resending..." : "Resend"}
          </Button>
        )}

        {canCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isCancelling}
            className="text-red-500 hover:text-red-400"
          >
            <X className="h-4 w-4 mr-1" />
            {isCancelling ? "Cancelling..." : "Cancel"}
          </Button>
        )}
      </div>

      {error && <div className="col-span-2 text-sm text-red-500 mt-2">{error}</div>}
    </div>
  );
}
