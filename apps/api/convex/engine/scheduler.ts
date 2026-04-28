/**
 * Workflow Engine — Schedule Trigger System
 *
 * Manages cron-based scheduled workflow execution. Uses Convex's
 * built-in cron system to check for due workflows every minute,
 * then creates execution records for any that are ready to run.
 *
 * Schedule data is stored in the workflow's `trigger` field:
 * {
 *   type: "schedule",
 *   cron: "0 9 * * MON",
 *   timezone: "America/New_York",
 *   nextRunAt: 1714384800000,
 *   enabled: true
 * }
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";

// ---------------------------------------------------------------------------
// Cron expression parsing (simplified)
// ---------------------------------------------------------------------------

/**
 * Parses a cron expression and checks if a given time matches.
 *
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 * Supports: numbers, ranges (1-5), lists (1,3,5), wildcards (*), steps (x/n)
 *
 * @param cron - The cron expression
 * @param date - The date to check
 * @param timezone - Optional IANA timezone (e.g. "America/New_York").
 *   If provided, the date is interpreted in that timezone.
 *   If omitted, UTC is used.
 */
export function cronMatches(cron: string, date: Date, timezone?: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = parts;

  // Get date components in the target timezone
  const { minute, hour, day, month, weekday } = getDateComponents(date, timezone);

  return (
    fieldMatches(minExpr, minute, 0, 59) &&
    fieldMatches(hourExpr, hour, 0, 23) &&
    fieldMatches(domExpr, day, 1, 31) &&
    fieldMatches(monExpr, month, 1, 12) &&
    fieldMatches(dowExpr, weekday, 0, 6)
  );
}

/**
 * Extracts date components in a given timezone using Intl API.
 * Falls back to UTC if the timezone is invalid or not provided.
 */
function getDateComponents(
  date: Date,
  timezone?: string
): {
  minute: number;
  hour: number;
  day: number;
  month: number;
  weekday: number;
} {
  if (!timezone) {
    return {
      minute: date.getUTCMinutes(),
      hour: date.getUTCHours(),
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      weekday: date.getUTCDay(),
    };
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
      hour12: false,
    });

    const partsMap = new Map<string, string>();
    for (const part of formatter.formatToParts(date)) {
      partsMap.set(part.type, part.value);
    }

    const weekdayStr = partsMap.get("weekday") ?? "";
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return {
      minute: parseInt(partsMap.get("minute") ?? "0", 10),
      hour: parseInt(partsMap.get("hour") ?? "0", 10),
      day: parseInt(partsMap.get("day") ?? "1", 10),
      month: parseInt(partsMap.get("month") ?? "1", 10),
      weekday: weekdayMap[weekdayStr] ?? date.getUTCDay(),
    };
  } catch {
    // Invalid timezone — fall back to UTC
    return {
      minute: date.getUTCMinutes(),
      hour: date.getUTCHours(),
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      weekday: date.getUTCDay(),
    };
  }
}

function fieldMatches(expr: string, value: number, min: number, max: number): boolean {
  if (expr === "*") return true;

  // Handle step: */n or range/n
  if (expr.includes("/")) {
    const [rangeExpr, stepStr] = expr.split("/");
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) return false;

    const rangeStart = rangeExpr === "*" ? min : parseInt(rangeExpr, 10);
    if (isNaN(rangeStart)) return false;

    return (value - rangeStart) % step === 0 && value >= rangeStart;
  }

  // Handle list: 1,3,5
  if (expr.includes(",")) {
    return expr.split(",").some((part) => fieldMatches(part.trim(), value, min, max));
  }

  // Handle range: 1-5
  if (expr.includes("-")) {
    const [startStr, endStr] = expr.split("-");
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end)) return false;
    return value >= start && value <= end;
  }

  // Single value
  const num = parseInt(expr, 10);
  return !isNaN(num) && value === num;
}

/**
 * Calculates the next run time for a cron expression.
 * Scans forward minute-by-minute up to 7 days.
 */
export function getNextRunTime(cron: string, after: Date, timezone?: string): Date | null {
  const maxMinutes = 7 * 24 * 60; // 7 days
  const candidate = new Date(after.getTime());
  // Start from the next minute
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  for (let i = 0; i < maxMinutes; i++) {
    if (cronMatches(cron, candidate, timezone)) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  return null; // No match within 7 days
}

// ---------------------------------------------------------------------------
// Schedule checker (called by Convex cron)
// ---------------------------------------------------------------------------

/**
 * Internal query: finds all workflows with schedule triggers
 * that are due to run (nextRunAt <= now and enabled).
 */
export const getDueScheduledWorkflows = internalQuery({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const now = Date.now();

    // Query all active workflows and filter for due schedules.
    // In production with many workflows, this should use an index
    // on trigger.nextRunAt. For now, we scan active workflows.
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(1000);

    const due: Array<{
      workflowId: string;
      workspaceId: string;
      operatorId?: string;
      cron: string;
    }> = [];

    for (const wf of workflows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trigger = wf.trigger as any;
      if (
        trigger?.type === "schedule" &&
        trigger?.enabled === true &&
        trigger?.nextRunAt &&
        trigger.nextRunAt <= now
      ) {
        due.push({
          workflowId: wf._id,
          workspaceId: wf.workspaceId,
          operatorId: wf.operatorId ?? undefined,
          cron: trigger.cron,
        });
      }
    }

    return due;
  },
});

/**
 * Internal mutation: creates an execution for a scheduled workflow
 * and updates the nextRunAt to the next occurrence.
 */
export const triggerScheduledWorkflow = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const now = Date.now();

    // Find due workflows
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(1000);

    let triggered = 0;

    for (const wf of workflows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trigger = wf.trigger as any;
      if (
        trigger?.type !== "schedule" ||
        trigger?.enabled !== true ||
        !trigger?.nextRunAt ||
        trigger.nextRunAt > now
      ) {
        continue;
      }

      // Create execution
      await ctx.db.insert("executions", {
        workspaceId: wf.workspaceId,
        workflowId: wf._id,
        operatorId: wf.operatorId,
        status: "queued",
        input: { triggeredBy: "schedule", cron: trigger.cron },
        output: undefined,
        error: undefined,
        startedAt: now,
        completedAt: undefined,
        duration: undefined,
        cost: undefined,
        createdAt: now,
        updatedAt: now,
      });

      // Calculate next run time
      const nextRun = getNextRunTime(trigger.cron, new Date(now), trigger.timezone);

      await ctx.db.patch(wf._id, {
        trigger: {
          ...trigger,
          nextRunAt: nextRun?.getTime() ?? now + 86400000,
        },
        updatedAt: now,
      });

      triggered++;
    }

    return { triggered };
  },
});
