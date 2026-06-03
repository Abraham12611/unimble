import { z } from "zod";

export const approvalValidator = z.object({
  executionId: z.string(),
  stepId: z.string(),
  type: z.string(),
  content: z.any().optional(),
  status: z.string(),
  requestedAt: z.number(),
  respondedAt: z.number().optional(),
  respondedBy: z.string().optional(),
  feedback: z.any().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ApprovalValidator = z.infer<typeof approvalValidator>;
