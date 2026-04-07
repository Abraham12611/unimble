import { z } from "zod";

export const executionValidator = z.object({
  workspaceId: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  operatorId: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).max(120),
  input: z.unknown().optional(),
});
