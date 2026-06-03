import { z } from "zod";

export const learningValidator = z.object({
  workspaceId: z.string(),
  type: z.string(),
  observation: z.string().min(1, "Observation is required"),
  evidence: z.any().optional(),
  confidence: z.number().min(0).max(1),
  status: z.string(),
  appliedAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type LearningValidator = z.infer<typeof learningValidator>;
