import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table - synced from Clerk
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    role: v.optional(v.string()),
    onboardingComplete: v.optional(v.boolean()),
    defaultWorkspaceId: v.optional(v.id("workspaces")),
    onboarding: v.optional(
      v.object({
        fullName: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        companyName: v.optional(v.string()),
        companySize: v.optional(v.string()),
        useCase: v.optional(v.string()),
        workspaceName: v.optional(v.string()),
        inviteEmails: v.optional(v.string()),
        completedAt: v.optional(v.number()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("users"),
    plan: v.optional(v.string()),
    status: v.optional(v.string()),
    settings: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_owner_and_status", ["ownerId", "status"]),

  // Workspaces table
  workspaces: defineTable({
    organizationId: v.optional(v.id("organizations")),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    ownerId: v.id("users"),
    status: v.optional(v.string()),
    plan: v.optional(v.string()),
    settings: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_organization", ["organizationId"])
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_owner_and_status", ["ownerId", "status"]),

  // Workspace members
  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: v.string(),
    permissions: v.optional(v.array(v.string())),
    invitedBy: v.optional(v.id("users")),
    joinedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_invited_by", ["invitedBy"])
    .index("by_workspace_and_user", ["workspaceId", "userId"]),

  workspaceInvites: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    invitedBy: v.id("users"),
    status: v.string(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_invited_by", ["invitedBy"])
    .index("by_workspace_and_email", ["workspaceId", "email"])
    .index("by_expires_at", ["expiresAt"]),

  operators: defineTable({
    workspaceId: v.id("workspaces"),
    type: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    config: v.optional(v.any()),
    status: v.optional(v.string()),
    memory: v.optional(v.any()),
    metrics: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_status", ["status"])
    .index("by_workspace_and_status", ["workspaceId", "status"]),

  workflows: defineTable({
    workspaceId: v.id("workspaces"),
    operatorId: v.optional(v.id("operators")),
    name: v.string(),
    description: v.optional(v.string()),
    trigger: v.optional(v.any()),
    steps: v.optional(v.any()),
    status: v.optional(v.string()),
    version: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_operator", ["operatorId"])
    .index("by_workspace_and_operator", ["workspaceId", "operatorId"])
    .index("by_status", ["status"])
    .index("by_workspace_and_status", ["workspaceId", "status"]),

  workflowVersions: defineTable({
    workflowId: v.id("workflows"),
    workspaceId: v.id("workspaces"),
    operatorId: v.optional(v.id("operators")),
    name: v.string(),
    description: v.optional(v.string()),
    trigger: v.optional(v.any()),
    steps: v.optional(v.any()),
    status: v.optional(v.string()),
    version: v.number(),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_workflow", ["workflowId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workflow_and_version", ["workflowId", "version"]),

  executions: defineTable({
    workspaceId: v.id("workspaces"),
    workflowId: v.id("workflows"),
    operatorId: v.optional(v.id("operators")),
    status: v.string(),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    error: v.optional(v.any()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    duration: v.optional(v.number()),
    cost: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_operator", ["operatorId"])
    .index("by_workspace_and_operator", ["workspaceId", "operatorId"])
    .index("by_workflow", ["workflowId"])
    .index("by_status", ["status"])
    .index("by_workspace_and_status", ["workspaceId", "status"]),

  executionSteps: defineTable({
    executionId: v.id("executions"),
    stepId: v.string(),
    name: v.string(),
    type: v.string(),
    status: v.string(),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    error: v.optional(v.any()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    retryCount: v.optional(v.number()),
    // Phase 6.5: unix ms after which the step is eligible for re-execution following a backoff delay
    retryAfter: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_execution", ["executionId"])
    .index("by_status", ["status"])
    .index("by_execution_and_status", ["executionId", "status"]),

  integrations: defineTable({
    workspaceId: v.id("workspaces"),
    provider: v.string(),
    name: v.string(),
    credentialsRef: v.optional(v.string()),
    config: v.optional(v.any()),
    status: v.optional(v.string()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_provider", ["provider"])
    .index("by_status", ["status"])
    .index("by_workspace_and_provider", ["workspaceId", "provider"]),

  // Phase 6.4: Human-in-the-Loop approval records.
  // Supports approval gates, feedback requests, and escalations.
  // type: "approval" | "feedback" | "escalation"
  // status: "pending" | "approved" | "rejected" | "timed-out" | "escalated"
  // timeoutBehavior: "auto-approve" | "auto-reject" | "escalate"
  approvals: defineTable({
    executionId: v.id("executions"),
    stepId: v.string(),
    type: v.string(),
    content: v.optional(v.any()),
    status: v.string(),
    requestedAt: v.number(),
    respondedAt: v.optional(v.number()),
    respondedBy: v.optional(v.id("users")),
    feedback: v.optional(v.any()),
    // Phase 6.4 additions: timeout & escalation configuration
    timeoutAt: v.optional(v.number()),
    timeoutBehavior: v.optional(v.string()),
    escalationChannel: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_execution", ["executionId"])
    .index("by_status", ["status"])
    .index("by_requested_at", ["requestedAt"])
    .index("by_execution_and_status", ["executionId", "status"])
    .index("by_timeout_at", ["timeoutAt"])
    // Compound index used by the batch timeout processor to efficiently
    // retrieve only pending approvals whose timeoutAt has elapsed.
    .index("by_status_and_timeout", ["status", "timeoutAt"]),

  // Phase 6.6: Structured step/execution lifecycle log events.
  // event: "step.started" | "step.completed" | "step.failed" | "step.retried" |
  //        "step.skipped" | "execution.started" | "execution.completed" |
  //        "execution.failed" | "approval.requested" | "approval.responded" |
  //        "approval.timed-out" | "approval.escalated"
  // level: "debug" | "info" | "warn" | "error"
  executionLogs: defineTable({
    executionId: v.id("executions"),
    workspaceId: v.id("workspaces"),
    stepId: v.optional(v.string()),
    event: v.string(),
    level: v.string(),
    message: v.string(),
    durationMs: v.optional(v.number()),
    inputHash: v.optional(v.string()),
    outputHash: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    metadata: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_execution", ["executionId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_execution_and_event", ["executionId", "event"])
    .index("by_timestamp", ["timestamp"]),

  // Phase 6.5: Dead-letter queue for permanently failed executions/steps.
  // A record is written after all retry attempts are exhausted.
  deadLetterQueue: defineTable({
    executionId: v.id("executions"),
    workspaceId: v.id("workspaces"),
    stepId: v.optional(v.string()),
    reason: v.string(),
    originalError: v.optional(v.any()),
    retryCount: v.number(),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_execution", ["executionId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_unresolved", ["workspaceId", "resolvedAt"]),

  // Phase 6.5: Per-integration/tool circuit breaker state.
  // key: opaque identifier e.g. "slack:message" or "openrouter:completion"
  // state: "closed" | "open" | "half-open"
  circuitBreakers: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    state: v.string(),
    failureCount: v.number(),
    successCount: v.number(),
    lastFailureAt: v.optional(v.number()),
    openedAt: v.optional(v.number()),
    nextRetryAt: v.optional(v.number()),
    threshold: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_key", ["workspaceId", "key"]),

  events: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.optional(v.id("users")),
    type: v.string(),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    metadata: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_workspace_and_type", ["workspaceId", "type"])
    .index("by_workspace_and_resource", ["workspaceId", "resourceType", "resourceId"]),

  learnings: defineTable({
    workspaceId: v.id("workspaces"),
    type: v.string(),
    observation: v.string(),
    evidence: v.optional(v.any()),
    confidence: v.number(),
    status: v.string(),
    appliedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_type", ["type"])
    .index("by_status", ["status"]),
});
