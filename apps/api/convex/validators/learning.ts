import { z } from "zod";

export const learningValidator = z.object({
  operatorId: z.string(),
  type: z.string(),
  content: z.record(z.unknown()),
  confidence: z.number().optional(),
  timestamp: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export type Learning = z.infer<typeof learningValidator>;
