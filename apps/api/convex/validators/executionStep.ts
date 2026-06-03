import { z } from "zod";

export const executionStepValidator = z.object({
  executionId: z.string(),
  stepId: z.string(),
  name: z.string().min(1, "Name is required"),
  type: z.string(),
  status: z.string(),
  input: z.any().optional(),
  output: z.any().optional(),
  error: z.any().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  retryCount: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ExecutionStepValidator = z.infer<typeof executionStepValidator>;
