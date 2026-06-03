import { z } from "zod";

export const escalationValidator = z.object({
  workspaceId: z.string(),
  executionId: z.string(),
  stepId: z.string(),
  type: z.string(),
  reason: z.string().min(1, "Reason is required"),
  severity: z.string(),
  status: z.string(),
  assignedTo: z.string().optional(),
  resolvedAt: z.number().optional(),
  resolvedBy: z.string().optional(),
  resolution: z.string().optional(),
  metadata: z.any().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EscalationValidator = z.infer<typeof escalationValidator>;
