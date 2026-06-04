import { z } from "zod";

export const approvalValidator = z.object({
  executionId: z.string(),
  approverId: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  content: z.record(z.string(), z.unknown()).optional(),
  feedback: z.string().optional(),
  createdAt: z.number(),
  reviewedAt: z.number().optional(),
});

export type Approval = z.infer<typeof approvalValidator>;
