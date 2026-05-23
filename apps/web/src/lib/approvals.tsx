"use client";

/**
 * Shared approval types, constants, and components.
 *
 * Used by both the approvals dashboard and detail pages to keep
 * type definitions, status configuration, and common UI in sync.
 */

import { useState, useEffect } from "react";
import { Clock, CheckCircle, XCircle, Warning } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type ApprovalBadgeVariant = "warning" | "positive" | "negative" | "neutral";

export interface ApprovalStatusConfig {
  badge: ApprovalBadgeVariant;
  icon: Icon;
  label: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const APPROVAL_STATUS_CONFIG: Record<ApprovalStatus, ApprovalStatusConfig> = {
  pending: { badge: "warning", icon: Clock, label: "Pending" },
  approved: { badge: "positive", icon: CheckCircle, label: "Approved" },
  rejected: { badge: "negative", icon: XCircle, label: "Rejected" },
  expired: { badge: "neutral", icon: Clock, label: "Expired" },
};

// ---------------------------------------------------------------------------
// Expires Countdown — ticks every 30 seconds so the display stays live
// ---------------------------------------------------------------------------

const TICK_INTERVAL_MS = 30_000;

export function ExpiresCountdown({
  expiresAt,
  size = "sm",
}: {
  expiresAt: number;
  size?: "sm" | "md";
}) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const remaining = expiresAt - now;

  const iconSize = size === "sm" ? 11 : 14;
  const textClass = size === "sm" ? "" : "text-[12px]";

  if (remaining <= 0) {
    return (
      <span className={`flex items-center gap-1 text-[var(--semantic-negative-fg)] ${textClass}`}>
        <Warning size={iconSize} />
        Expired
      </span>
    );
  }

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const isUrgent = hours < 4;

  return (
    <span
      className={`flex items-center gap-1 ${textClass} ${
        isUrgent ? "text-[var(--semantic-warning-fg)]" : "text-[var(--text-muted)]"
      }`}
    >
      <Clock size={iconSize} />
      Expires in {hours > 0 ? `${hours}h ` : ""}
      {minutes}m
    </span>
  );
}
