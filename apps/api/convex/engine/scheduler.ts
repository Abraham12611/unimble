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
 */
export function cronMatches(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = parts;

  return (
    fieldMatches(minExpr, date.getUTCMinutes(), 0, 59) &&
    fieldMatches(hourExpr, date.getUTCHours(), 0, 23) &&
    fieldMatches(domExpr, date.getUTCDate(), 1, 31) &&
    fieldMatches(monExpr, date.getUTCMonth() + 1, 1, 12) &&
    fieldMatches(dowExpr, date.getUTCDay(), 0, 6)
  );
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
export function getNextRunTime(cron: string, after: Date): Date | null {
  const maxMinutes = 7 * 24 * 60; // 7 days
  const candidate = new Date(after.getTime());
  // Start from the next minute
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  for (let i = 0; i < maxMinutes; i++) {
    if (cronMatches(cron, candidate)) {
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
      const nextRun = getNextRunTime(trigger.cron, new Date(now));

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

/**
 * Internal mutation: initializes the nextRunAt for a workflow
 * when its schedule trigger is first set or updated.
 */
export const initializeSchedule = internalMutation({
  args: {},
  handler: async () => {
    // This is called when a workflow's trigger is set to "schedule"
    // The caller passes the workflowId via scheduler
    // For now this is a placeholder — the actual initialization
    // happens in the workflow create/update mutations
    return { ok: true };
  },
});
