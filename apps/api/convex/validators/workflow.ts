import { z } from "zod";

export const workflowValidator = z.object({
  workspaceId: z.string().trim().min(1).optional(),
  operatorId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1_000).optional(),
  trigger: z.unknown().optional(),
  steps: z.unknown().optional(),
  status: z.string().trim().min(1).max(120).optional(),
  version: z.number().int().positive().optional(),
});
