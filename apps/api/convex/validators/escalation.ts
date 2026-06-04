import { z } from "zod";

export const escalationValidator = z.object({
  executionId: z.string(),
  level: z.number(),
  reason: z.string(),
  escalatedTo: z.string(),
  status: z.enum(["pending", "acknowledged", "resolved"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number(),
  resolvedAt: z.number().optional(),
});

export type Escalation = z.infer<typeof escalationValidator>;
