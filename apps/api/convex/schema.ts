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
    webhookPath: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_operator", ["operatorId"])
    .index("by_workspace_and_operator", ["workspaceId", "operatorId"])
    .index("by_status", ["status"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_webhook_path", ["webhookPath"]),

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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_execution", ["executionId"])
    .index("by_status", ["status"])
    .index("by_requested_at", ["requestedAt"])
    .index("by_execution_and_status", ["executionId", "status"]),

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

  // Notifications — in-app notification system for approvals, escalations, etc.
  notifications: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.optional(v.id("users")),
    type: v.string(),
    title: v.string(),
    message: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    read: v.boolean(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_user_and_read", ["userId", "read"])
    .index("by_workspace_and_type", ["workspaceId", "type"]),

  // Escalations — tracks escalation events for approvals and errors
  escalations: defineTable({
    workspaceId: v.id("workspaces"),
    executionId: v.id("executions"),
    stepId: v.string(),
    type: v.string(),
    reason: v.string(),
    severity: v.string(),
    status: v.string(),
    assignedTo: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("users")),
    resolution: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_execution", ["executionId"])
    .index("by_status", ["status"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_assigned_to", ["assignedTo"]),

  // Dead Letter Queue — captures failed executions that exhausted retries
  deadLetterQueue: defineTable({
    workspaceId: v.id("workspaces"),
    executionId: v.id("executions"),
    workflowId: v.id("workflows"),
    stepId: v.string(),
    error: v.any(),
    errorCategory: v.string(),
    retryCount: v.number(),
    status: v.union(v.literal("pending"), v.literal("retried"), v.literal("discarded")),
    retriedAt: v.optional(v.number()),
    discardedAt: v.optional(v.number()),
    discardedBy: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_execution", ["executionId"])
    .index("by_status", ["status"])
    .index("by_workspace_and_status", ["workspaceId", "status"]),

  // Agent Memories — long-term memory with vector search (Phase 7.4)
  memories: defineTable({
    workspaceId: v.id("workspaces"),
    operatorId: v.optional(v.id("operators")),
    /** Memory scope: workspace, operator, agent, execution */
    scope: v.string(),
    /** Scope-specific ID (operator ID, agent ID, etc.) */
    scopeId: v.string(),
    /** Category for filtering (preference, fact, pattern, content, feedback) */
    category: v.string(),
    /** The memory content text */
    content: v.string(),
    /** Embedding vector for semantic search */
    embedding: v.optional(v.array(v.float64())),
    /** Importance score 0-1 */
    importance: v.number(),
    /** Source of this memory (agent, user, system) */
    source: v.string(),
    /** Optional metadata */
    metadata: v.optional(v.any()),
    /** Number of times this memory has been accessed */
    accessCount: v.number(),
    /** Last time this memory was accessed */
    lastAccessedAt: v.optional(v.number()),
    /** Whether this memory is active or archived */
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_scope", ["workspaceId", "scope"])
    .index("by_workspace_and_category", ["workspaceId", "category"])
    .index("by_scope_and_id", ["scope", "scopeId"])
    .index("by_status", ["status"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["workspaceId", "scope", "scopeId", "category", "status"],
    }),

  // Circuit Breakers — per-integration failure tracking
  circuitBreakers: defineTable({
    workspaceId: v.id("workspaces"),
    integrationKey: v.string(),
    state: v.union(v.literal("closed"), v.literal("open"), v.literal("half_open")),
    failureCount: v.number(),
    halfOpenSuccessCount: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    openedAt: v.optional(v.number()),
    halfOpenAt: v.optional(v.number()),
    config: v.optional(v.any()),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_key", ["workspaceId", "integrationKey"]),
});
