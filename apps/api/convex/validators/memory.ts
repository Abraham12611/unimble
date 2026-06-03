import { z } from "zod";

export const memoryValidator = z.object({
  key: z.string(),
  value: z.record(z.unknown()),
  type: z.string().optional(),
  expiresAt: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Memory = z.infer<typeof memoryValidator>;
