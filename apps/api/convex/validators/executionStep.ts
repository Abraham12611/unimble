import { z } from "zod";

export const executionStepValidator = z.object({
  executionId: z.string(),
  stepId: z.string(),
  name: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
});

export type ExecutionStep = z.infer<typeof executionStepValidator>;
