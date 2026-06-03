import { z } from "zod";

export const workflowVersionValidator = z.object({
  workflowId: z.string(),
  workspaceId: z.string(),
  operatorId: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  trigger: z.any().optional(),
  steps: z.any().optional(),
  status: z.string().optional(),
  version: z.number(),
  createdAt: z.number(),
  createdBy: z.string().optional(),
});

export type WorkflowVersionValidator = z.infer<typeof workflowVersionValidator>;
