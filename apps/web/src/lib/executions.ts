/**
 * Shared execution types and constants.
 *
 * Used by both the executions list and detail pages to keep
 * type definitions and status configuration in sync.
 */

import type { Icon } from "@phosphor-icons/react";
import { Lightning, CheckCircle, XCircle } from "@phosphor-icons/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecutionStatus = "running" | "completed" | "failed" | "cancelled";

export type BadgeVariant = "info" | "positive" | "negative" | "neutral" | "warning";

export interface StatusConfig {
  badge: BadgeVariant;
  icon: Icon;
  label: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATUS_CONFIG: Record<ExecutionStatus, StatusConfig> = {
  running: { badge: "info", icon: Lightning, label: "Running" },
  completed: { badge: "positive", icon: CheckCircle, label: "Completed" },
  failed: { badge: "negative", icon: XCircle, label: "Failed" },
  cancelled: { badge: "neutral", icon: XCircle, label: "Cancelled" },
};
