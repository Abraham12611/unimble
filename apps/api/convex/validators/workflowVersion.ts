import { z } from "zod";

export const workflowVersionValidator = z.object({
  workflowId: z.string(),
  version: z.number(),
  name: z.string(),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()),
  createdBy: z.string(),
  createdAt: z.number(),
  isActive: z.boolean(),
});

export type WorkflowVersion = z.infer<typeof workflowVersionValidator>;
