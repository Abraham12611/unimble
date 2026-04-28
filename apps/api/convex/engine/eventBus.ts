/**
 * Workflow Engine — Event Bus
 *
 * Internal event routing system. When an event is emitted (e.g.
 * "operator.goal_set", "content.published"), the event bus:
 * 1. Persists the event to the events table
 * 2. Finds workflows with matching event triggers
 * 3. Creates execution records for matched workflows
 *
 * Events are workspace-scoped — a workflow only receives events
 * from its own workspace.
 */

import { v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { requireWorkspaceMember } from "../lib/auth";

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

/**
 * Emits an internal event and triggers matching workflows.
 *
 * This is the primary way operators and system components
 * trigger event-driven workflows.
 */
export const emitEvent = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    eventType: v.string(),
    data: v.optional(v.any()),
    userId: v.optional(v.id("users")),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Persist the event
    const eventId = await ctx.db.insert("events", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      type: args.eventType,
      action: "emit",
      resourceType: args.resourceType ?? "system",
      resourceId: args.resourceId ?? "",
      metadata: args.data,
      timestamp: now,
    });

    // 2. Find workflows with matching event triggers
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "active")
      )
      .order("desc")
      .take(1000);

    let triggered = 0;

    for (const wf of workflows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trigger = wf.trigger as any;
      if (
        trigger?.type !== "event" ||
        trigger?.enabled !== true ||
        trigger?.eventType !== args.eventType
      ) {
        continue;
      }

      // Check optional filter
      if (trigger.filter && args.data) {
        if (!matchesFilter(trigger.filter, args.data)) {
          continue;
        }
      }

      // 3. Create execution
      await ctx.db.insert("executions", {
        workspaceId: args.workspaceId,
        workflowId: wf._id,
        operatorId: wf.operatorId,
        status: "queued",
        input: {
          triggeredBy: "event",
          eventType: args.eventType,
          eventData: args.data,
          eventId,
        },
        output: undefined,
        error: undefined,
        startedAt: now,
        completedAt: undefined,
        duration: undefined,
        cost: undefined,
        createdAt: now,
        updatedAt: now,
      });

      triggered++;
    }

    return { eventId, triggered };
  },
});

/**
 * Public mutation: emit an event (requires workspace membership).
 * Used by the frontend or external callers.
 */
export const emitWorkspaceEvent = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    eventType: v.string(),
    data: v.optional(v.any()),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceMember(ctx, args.workspaceId);

    const now = Date.now();

    // Persist the event
    const eventId = await ctx.db.insert("events", {
      workspaceId: args.workspaceId,
      userId: user._id,
      type: args.eventType,
      action: "emit",
      resourceType: args.resourceType ?? "user",
      resourceId: args.resourceId ?? "",
      metadata: args.data,
      timestamp: now,
    });

    // Find and trigger matching workflows
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "active")
      )
      .order("desc")
      .take(1000);

    let triggered = 0;

    for (const wf of workflows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trigger = wf.trigger as any;
      if (
        trigger?.type !== "event" ||
        trigger?.enabled !== true ||
        trigger?.eventType !== args.eventType
      ) {
        continue;
      }

      if (trigger.filter && args.data) {
        if (!matchesFilter(trigger.filter, args.data)) {
          continue;
        }
      }

      await ctx.db.insert("executions", {
        workspaceId: args.workspaceId,
        workflowId: wf._id,
        operatorId: wf.operatorId,
        status: "queued",
        input: {
          triggeredBy: "event",
          eventType: args.eventType,
          eventData: args.data,
          eventId,
        },
        output: undefined,
        error: undefined,
        startedAt: now,
        completedAt: undefined,
        duration: undefined,
        cost: undefined,
        createdAt: now,
        updatedAt: now,
      });

      triggered++;
    }

    return { eventId, triggered };
  },
});

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------

/**
 * Simple filter matching: checks if event data matches all
 * key-value pairs in the filter object.
 *
 * Supports flat key-value equality only. Nested/complex filters
 * can be added later.
 */
function matchesFilter(
  filter: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
): boolean {
  if (!data || typeof data !== "object") return false;

  for (const [key, value] of Object.entries(filter)) {
    if (data[key] !== value) return false;
  }

  return true;
}
