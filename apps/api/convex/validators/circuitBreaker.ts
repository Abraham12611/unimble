import { z } from "zod";

export const circuitBreakerValidator = z.object({
  workspaceId: z.string(),
  integrationKey: z.string(),
  state: z.enum(["closed", "open", "half_open"]),
  failureCount: z.number(),
  halfOpenSuccessCount: z.number().optional(),
  lastFailureAt: z.number().optional(),
  lastSuccessAt: z.number().optional(),
  openedAt: z.number().optional(),
  halfOpenAt: z.number().optional(),
  config: z.any().optional(),
  updatedAt: z.number(),
});

export type CircuitBreakerValidator = z.infer<typeof circuitBreakerValidator>;
