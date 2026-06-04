import { z } from "zod";

export const deadLetterQueueValidator = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  error: z.string(),
  retryCount: z.number(),
  lastAttempt: z.number(),
  nextRetry: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type DeadLetterQueue = z.infer<typeof deadLetterQueueValidator>;
