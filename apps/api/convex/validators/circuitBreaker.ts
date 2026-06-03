import { z } from "zod";

export const circuitBreakerValidator = z.object({
  name: z.string(),
  state: z.enum(["closed", "open", "half-open"]),
  failureCount: z.number(),
  lastFailureTime: z.number(),
  nextRetryTime: z.number(),
  config: z.record(z.unknown()).optional(),
});

export type CircuitBreaker = z.infer<typeof circuitBreakerValidator>;
