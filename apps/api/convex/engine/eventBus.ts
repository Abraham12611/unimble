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
import type { MutationCtx } from "../_generated/server";
import { internalMutation, mutation } from "../_generated/server";
import { requireWorkspaceMember } from "../lib/auth";
import type { Id } from "../_generated/dataModel";

/**
 * Reserved event type prefixes that can only be emitted by
 * internal mutations (emitEvent), not by public callers.
 */
const RESERVED_EVENT_PREFIXES = [
  "operator.",
  "system.",
  "workflow.",
  "execution.",
  "agent.",
  "internal.",
];

function isReservedEventType(eventType: string): boolean {
  return RESERVED_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Shared helper — trigger matching
// ---------------------------------------------------------------------------

/**
 * Finds active workflows matching an event type in a workspace
 * and creates execution records for each match.
 */
async function triggerMatchingWorkflows(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  eventType: string,
  eventData: unknown,
  eventId: Id<"events">
): Promise<number> {
  const now = Date.now();

  const workflows = await ctx.db
    .query("workflows")
    .withIndex("by_workspace_and_status", (q) =>
      q.eq("workspaceId", workspaceId).eq("status", "active")
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
      trigger?.eventType !== eventType
    ) {
      continue;
    }

    if (trigger.filter && eventData) {
      if (!matchesFilter(trigger.filter, eventData)) {
        continue;
      }
    }

    await ctx.db.insert("executions", {
      workspaceId,
      workflowId: wf._id,
      operatorId: wf.operatorId,
      status: "queued",
      input: {
        triggeredBy: "event",
        eventType,
        eventData,
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

  return triggered;
}

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

/**
 * Emits an internal event and triggers matching workflows.
 * Used by operators and system components.
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

    const triggered = await triggerMatchingWorkflows(
      ctx,
      args.workspaceId,
      args.eventType,
      args.data,
      eventId
    );

    return { eventId, triggered };
  },
});

/**
 * Public mutation: emit an event (requires workspace membership).
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
    // Guard: reject reserved event type prefixes from public callers
    if (isReservedEventType(args.eventType)) {
      throw new Error(
        `Event type "${args.eventType}" is reserved for internal use. ` +
          `User events must use a custom prefix (e.g. "user.").`
      );
    }

    const { user } = await requireWorkspaceMember(ctx, args.workspaceId);

    const now = Date.now();

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

    const triggered = await triggerMatchingWorkflows(
      ctx,
      args.workspaceId,
      args.eventType,
      args.data,
      eventId
    );

    return { eventId, triggered };
  },
});

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------

function matchesFilter(
  filter: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
): boolean {
  if (!data || typeof data !== "object") return false;

  for (const [key, value] of Object.entries(filter)) {
    if (!deepEqual(data[key], value)) return false;
  }

  return true;
}

/**
 * Deep equality check for filter values.
 * Handles primitives, objects, and arrays.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  // Distinguish arrays from plain objects
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}
