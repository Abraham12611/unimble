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

import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";

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
      hourCycle: "h23",
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

  // Handle step: */n or range/n or start-end/n
  if (expr.includes("/")) {
    const [rangeExpr, stepStr] = expr.split("/");
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) return false;

    let rangeStart = min;
    let rangeEnd = max;

    if (rangeExpr === "*") {
      rangeStart = min;
      rangeEnd = max;
    } else if (rangeExpr.includes("-")) {
      const [startStr, endStr] = rangeExpr.split("-");
      rangeStart = parseInt(startStr, 10);
      rangeEnd = parseInt(endStr, 10);
      if (isNaN(rangeStart) || isNaN(rangeEnd)) return false;
    } else {
      rangeStart = parseInt(rangeExpr, 10);
      if (isNaN(rangeStart)) return false;
      rangeEnd = max;
    }

    return value >= rangeStart && value <= rangeEnd && (value - rangeStart) % step === 0;
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
 * Internal mutation: creates an execution for a scheduled workflow
 * and updates the nextRunAt to the next occurrence.
 */
export const triggerScheduledWorkflow = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const now = Date.now();
    let triggered = 0;

    // Process a single batch of active workflows per cron tick.
    //
    // Why no pagination loop: each triggered workflow gets its
    // nextRunAt patched to a future time, removing it from the
    // "due" set. On the next cron tick (1 min later), the query
    // returns a fresh batch that excludes already-processed ones.
    // Over successive ticks, all due workflows get processed.
    //
    // Safety cap: 100 triggers per tick to stay within Convex
    // mutation time limits.
    const BATCH_SIZE = 500;
    const MAX_TRIGGERS_PER_TICK = 100;

    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(BATCH_SIZE);

    for (const wf of workflows) {
      if (triggered >= MAX_TRIGGERS_PER_TICK) break;

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

      // Advance nextRunAt so this workflow drops out of the
      // "due" set and won't be re-triggered next tick
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
