import { z } from "zod";

export const deadLetterQueueValidator = z.object({
  workspaceId: z.string(),
  executionId: z.string(),
  workflowId: z.string(),
  stepId: z.string(),
  error: z.any(),
  errorCategory: z.string(),
  retryCount: z.number(),
  status: z.enum(["pending", "retried", "discarded"]),
  retriedAt: z.number().optional(),
  discardedAt: z.number().optional(),
  discardedBy: z.string().optional(),
  metadata: z.any().optional(),
  createdAt: z.number(),
});

export type DeadLetterQueueValidator = z.infer<typeof deadLetterQueueValidator>;
