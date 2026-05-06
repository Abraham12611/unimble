/**
 * Workflow Engine — Human-in-the-Loop
 *
 * Manages notifications, feedback requests, and escalations for
 * workflow steps that require human intervention.
 *
 * This module provides:
 * - Notification dispatch for approval requests
 * - Workspace-level approval queue queries
 * - Feedback request handling (structured input from humans)
 * - Escalation rules and resolution tracking
 *
 * Phase 6.4 — Human-in-the-Loop
 */

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireWorkspaceAccess, requireWorkspaceMember } from "../lib/auth";

// ---------------------------------------------------------------------------
// 6.4.1 — Notification dispatch
// ---------------------------------------------------------------------------

/**
 * Creates an in-app notification for workspace members.
 * Called internally when an approval is requested, an escalation
 * occurs, or a feedback request is created.
 */
export async function createNotificationImpl(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    userId?: Id<"users">;
    type: string;
    title: string;
    message?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: unknown;
  }
): Promise<Id<"notifications">> {
  const now = Date.now();

  return await ctx.db.insert("notifications", {
    workspaceId: args.workspaceId,
    userId: args.userId,
    type: args.type,
    title: args.title,
    message: args.message,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    metadata: args.metadata,
    read: false,
    readAt: undefined,
    createdAt: now,
  });
}

/**
 * Internal mutation: sends approval notification to workspace members.
 * Called by pauseForApproval in stepRunner.ts.
 */
export const notifyApprovalRequested = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    executionId: v.id("executions"),
    stepId: v.string(),
    approvalType: v.string(),
    content: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Notify all workspace owners and admins
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const approvers = members.filter((m) => m.role === "owner" || m.role === "admin");

    for (const member of approvers) {
      await createNotificationImpl(ctx, {
        workspaceId: args.workspaceId,
        userId: member.userId,
        type: "approval_requested",
        title: `Approval needed: ${args.approvalType}`,
        message: `A workflow step requires your approval before continuing.`,
        resourceType: "approval",
        resourceId: `${args.executionId}/${args.stepId}`,
        metadata: {
          executionId: args.executionId,
          stepId: args.stepId,
          approvalType: args.approvalType,
          contentPreview: typeof args.content === "string" ? args.content.slice(0, 200) : undefined,
        },
      });
    }

    return { notified: approvers.length };
  },
});

// ---------------------------------------------------------------------------
// 6.4.1 — Approval queue queries
// ---------------------------------------------------------------------------

/**
 * Lists pending approvals for a workspace.
 * Used by the dashboard approval queue.
 */
export const listPendingApprovals = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);

    // Get all executions for this workspace
    const executions = await ctx.db
      .query("executions")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "waiting_approval")
      )
      .collect();

    if (executions.length === 0) return [];

    // Get pending approvals for these executions
    const approvals = [];
    for (const exe of executions) {
      const exeApprovals = await ctx.db
        .query("approvals")
        .withIndex("by_execution_and_status", (q) =>
          q.eq("executionId", exe._id).eq("status", "pending")
        )
        .collect();

      for (const approval of exeApprovals) {
        approvals.push({
          ...approval,
          workflowId: exe.workflowId,
          operatorId: exe.operatorId,
        });
      }
    }

    return approvals;
  },
});

/**
 * Gets a single approval with full context for the detail view.
 */
export const getApprovalDetail = query({
  args: {
    approvalId: v.id("approvals"),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");

    const execution = await ctx.db.get(approval.executionId);
    if (!execution) throw new Error("Execution not found");

    await requireWorkspaceAccess(ctx, execution.workspaceId);

    const workflow = await ctx.db.get(execution.workflowId);
    const operator = execution.operatorId ? await ctx.db.get(execution.operatorId) : null;

    return {
      approval,
      execution: {
        _id: execution._id,
        status: execution.status,
        startedAt: execution.startedAt,
        input: execution.input,
      },
      workflow: workflow ? { _id: workflow._id, name: workflow.name } : null,
      operator: operator ? { _id: operator._id, name: operator.name, type: operator.type } : null,
    };
  },
});

/**
 * Approves with optional edits to the content.
 * Extends the basic respondExecutionApproval with edit capability.
 */
export const approveWithEdits = mutation({
  args: {
    approvalId: v.id("approvals"),
    edits: v.optional(v.any()),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");

    const execution = await ctx.db.get(approval.executionId);
    if (!execution) throw new Error("Execution not found");

    const { user, isOwner, isAdmin, memberRole } = await requireWorkspaceMember(
      ctx,
      execution.workspaceId
    );

    // Only owners and admins can approve workflow steps
    if (!isOwner && !isAdmin && memberRole !== "admin") {
      throw new Error("Only workspace owners and admins can approve workflow steps");
    }

    if (approval.status !== "pending") {
      throw new Error("Approval has already been responded to");
    }

    const now = Date.now();

    // Update approval with edits
    await ctx.db.patch(args.approvalId, {
      status: "approved",
      feedback: {
        edits: args.edits,
        comment: args.feedback,
        approvedWithEdits: !!args.edits,
      },
      respondedAt: now,
      respondedBy: user._id,
      updatedAt: now,
    });

    // Find the step record and resume execution
    const stepRecord = await ctx.db
      .query("executionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", approval.executionId))
      .filter((q) => q.eq(q.field("stepId"), approval.stepId))
      .first();

    if (stepRecord && stepRecord.status === "running") {
      await ctx.db.patch(stepRecord._id, {
        status: "completed",
        output: {
          approved: true,
          edits: args.edits,
          feedback: args.feedback,
          approvedWithEdits: !!args.edits,
        },
        completedAt: now,
        updatedAt: now,
      });
    }

    // Resume execution
    if (execution.status === "waiting_approval") {
      await ctx.db.patch(execution._id, {
        status: "running",
        updatedAt: now,
      });
    }

    // Create notification for approval response
    await createNotificationImpl(ctx, {
      workspaceId: execution.workspaceId,
      type: "approval_responded",
      title: `Approval granted${args.edits ? " with edits" : ""}`,
      message: args.feedback ?? undefined,
      resourceType: "approval",
      resourceId: `${approval.executionId}/${approval.stepId}`,
    });

    return args.approvalId;
  },
});

// ---------------------------------------------------------------------------
// 6.4.2 — Feedback Request
// ---------------------------------------------------------------------------

/**
 * Creates a feedback request step record.
 * Unlike approvals (binary approve/reject), feedback requests
 * collect structured input from humans (text, ratings, selections).
 */
export const createFeedbackRequest = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    executionId: v.id("executions"),
    stepId: v.string(),
    feedbackType: v.string(),
    prompt: v.string(),
    schema: v.optional(v.any()),
    content: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Create approval record with feedback type
    const approvalId = await ctx.db.insert("approvals", {
      executionId: args.executionId,
      stepId: args.stepId,
      type: `feedback:${args.feedbackType}`,
      content: {
        prompt: args.prompt,
        schema: args.schema,
        data: args.content,
      },
      status: "pending",
      requestedAt: now,
      respondedAt: undefined,
      respondedBy: undefined,
      feedback: undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Notify workspace members
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const reviewers = members.filter((m) => m.role === "owner" || m.role === "admin");

    for (const member of reviewers) {
      await createNotificationImpl(ctx, {
        workspaceId: args.workspaceId,
        userId: member.userId,
        type: "feedback_requested",
        title: `Feedback needed: ${args.feedbackType}`,
        message: args.prompt,
        resourceType: "feedback",
        resourceId: `${args.executionId}/${args.stepId}`,
        metadata: {
          executionId: args.executionId,
          stepId: args.stepId,
          feedbackType: args.feedbackType,
          approvalId,
        },
      });
    }

    return approvalId;
  },
});

/**
 * Submits feedback for a feedback request.
 * Resumes the workflow with the provided feedback data.
 */
export const submitFeedback = mutation({
  args: {
    approvalId: v.id("approvals"),
    feedback: v.any(),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Feedback request not found");

    const execution = await ctx.db.get(approval.executionId);
    if (!execution) throw new Error("Execution not found");

    const { user, isOwner, isAdmin, memberRole } = await requireWorkspaceMember(
      ctx,
      execution.workspaceId
    );

    // Only owners and admins can submit feedback
    if (!isOwner && !isAdmin && memberRole !== "admin") {
      throw new Error("Only workspace owners and admins can submit feedback");
    }

    if (approval.status !== "pending") {
      throw new Error("Feedback has already been submitted");
    }

    const now = Date.now();

    // Update approval with feedback
    await ctx.db.patch(args.approvalId, {
      status: "approved",
      feedback: args.feedback,
      respondedAt: now,
      respondedBy: user._id,
      updatedAt: now,
    });

    // Find and complete the step
    const stepRecord = await ctx.db
      .query("executionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", approval.executionId))
      .filter((q) => q.eq(q.field("stepId"), approval.stepId))
      .first();

    if (stepRecord && stepRecord.status === "running") {
      await ctx.db.patch(stepRecord._id, {
        status: "completed",
        output: {
          feedbackReceived: true,
          feedback: args.feedback,
          respondedBy: user._id,
        },
        completedAt: now,
        updatedAt: now,
      });
    }

    // Resume execution
    if (execution.status === "waiting_approval") {
      await ctx.db.patch(execution._id, {
        status: "running",
        updatedAt: now,
      });
    }

    return args.approvalId;
  },
});

// ---------------------------------------------------------------------------
// 6.4.3 — Escalation
// ---------------------------------------------------------------------------

/**
 * Escalation severity levels.
 */
export type EscalationSeverity = "low" | "medium" | "high" | "critical";

/**
 * Creates an escalation record when an approval times out,
 * errors exceed thresholds, or manual escalation is triggered.
 */
export const createEscalation = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    executionId: v.id("executions"),
    stepId: v.string(),
    type: v.string(),
    reason: v.string(),
    severity: v.string(),
    assignedTo: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const escalationId = await ctx.db.insert("escalations", {
      workspaceId: args.workspaceId,
      executionId: args.executionId,
      stepId: args.stepId,
      type: args.type,
      reason: args.reason,
      severity: args.severity,
      status: "open",
      assignedTo: args.assignedTo,
      resolvedAt: undefined,
      resolvedBy: undefined,
      resolution: undefined,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });

    // Determine who to notify based on severity
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // Critical: notify all owners; High: owners + admins; Medium/Low: assigned only
    let notifyMembers = members;
    if (args.severity === "critical") {
      notifyMembers = members.filter((m) => m.role === "owner");
    } else if (args.severity === "high") {
      notifyMembers = members.filter((m) => m.role === "owner" || m.role === "admin");
    } else if (args.assignedTo) {
      notifyMembers = members.filter((m) => m.userId === args.assignedTo);
    } else {
      notifyMembers = members.filter((m) => m.role === "owner" || m.role === "admin");
    }

    for (const member of notifyMembers) {
      await createNotificationImpl(ctx, {
        workspaceId: args.workspaceId,
        userId: member.userId,
        type: "escalation",
        title: `[${args.severity.toUpperCase()}] Escalation: ${args.type}`,
        message: args.reason,
        resourceType: "escalation",
        resourceId: String(escalationId),
        metadata: {
          escalationId,
          executionId: args.executionId,
          stepId: args.stepId,
          severity: args.severity,
        },
      });
    }

    return escalationId;
  },
});

/**
 * Resolves an escalation.
 */
export const resolveEscalation = mutation({
  args: {
    escalationId: v.id("escalations"),
    resolution: v.string(),
  },
  handler: async (ctx, args) => {
    const escalation = await ctx.db.get(args.escalationId);
    if (!escalation) throw new Error("Escalation not found");

    const { user, isOwner, isAdmin, memberRole } = await requireWorkspaceMember(
      ctx,
      escalation.workspaceId
    );

    // Only owners and admins can resolve escalations
    if (!isOwner && !isAdmin && memberRole !== "admin") {
      throw new Error("Only workspace owners and admins can resolve escalations");
    }

    if (escalation.status === "resolved") {
      throw new Error("Escalation is already resolved");
    }

    const now = Date.now();
    await ctx.db.patch(args.escalationId, {
      status: "resolved",
      resolvedAt: now,
      resolvedBy: user._id,
      resolution: args.resolution,
      updatedAt: now,
    });

    // Notify the workspace
    await createNotificationImpl(ctx, {
      workspaceId: escalation.workspaceId,
      type: "escalation_resolved",
      title: `Escalation resolved: ${escalation.type}`,
      message: args.resolution,
      resourceType: "escalation",
      resourceId: String(args.escalationId),
    });

    return args.escalationId;
  },
});

/**
 * Lists open escalations for a workspace.
 */
export const listEscalations = query({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);

    const status = args.status ?? "open";

    return await ctx.db
      .query("escalations")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", status)
      )
      .order("desc")
      .take(100);
  },
});

// ---------------------------------------------------------------------------
// Notification queries
// ---------------------------------------------------------------------------

/**
 * Lists notifications for the current user.
 */
export const listNotifications = query({
  args: {
    workspaceId: v.id("workspaces"),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceMember(ctx, args.workspaceId);

    // Get user-specific notifications
    let userNotifications;
    if (args.unreadOnly) {
      userNotifications = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_read", (q) => q.eq("userId", user._id).eq("read", false))
        .order("desc")
        .take(50);
    } else {
      userNotifications = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(50);
    }

    // Also get workspace-wide notifications (no userId)
    // These are broadcast notifications visible to all members
    let workspaceNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), undefined))
      .order("desc")
      .take(20);

    if (args.unreadOnly) {
      workspaceNotifications = workspaceNotifications.filter((n) => !n.read);
    }

    // Merge and sort by createdAt descending
    const all = [...userNotifications, ...workspaceNotifications];
    all.sort((a, b) => b.createdAt - a.createdAt);

    return all.slice(0, 50);
  },
});

/**
 * Marks a notification as read.
 */
export const markNotificationRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");

    const { user } = await requireWorkspaceMember(ctx, notification.workspaceId);

    // Ownership check: users can only mark their own notifications as read
    if (notification.userId !== undefined && notification.userId !== user._id) {
      throw new Error("Not authorized to mark this notification as read");
    }

    if (notification.read) return args.notificationId;

    await ctx.db.patch(args.notificationId, {
      read: true,
      readAt: Date.now(),
    });

    return args.notificationId;
  },
});

/**
 * Marks all notifications as read for the current user.
 */
export const markAllNotificationsRead = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceMember(ctx, args.workspaceId);

    // Query by workspace first, then filter by user to avoid
    // accidentally marking notifications from other workspaces
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.and(q.eq(q.field("userId"), user._id), q.eq(q.field("read"), false)))
      .collect();

    const now = Date.now();
    let count = 0;
    for (const notification of unread) {
      await ctx.db.patch(notification._id, {
        read: true,
        readAt: now,
      });
      count++;
    }

    return { marked: count };
  },
});

/**
 * Gets the unread notification count for the current user.
 */
export const getUnreadCount = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceMember(ctx, args.workspaceId);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => q.eq("userId", user._id).eq("read", false))
      .collect();

    return { count: unread.length };
  },
});
