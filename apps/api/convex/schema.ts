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
});
