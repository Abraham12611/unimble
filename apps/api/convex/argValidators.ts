import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

export const convexValidators = {
  paginationOpts: paginationOptsValidator,

  // Common primitives
  stringField: v.string(),
  optionalString: v.optional(v.string()),
  optionalNullableString: v.optional(v.union(v.string(), v.null())),

  // Common ids
  userId: v.id("users"),
  workspaceId: v.id("workspaces"),
  organizationId: v.id("organizations"),
  operatorId: v.id("operators"),
  workflowId: v.id("workflows"),
  executionId: v.id("executions"),

  // Common enums
  platformRole: v.union(v.literal("user"), v.literal("creator")),
};
