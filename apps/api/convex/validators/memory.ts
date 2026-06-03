import { z } from "zod";

export const memoryValidator = z.object({
  workspaceId: z.string(),
  operatorId: z.string().optional(),
  scope: z.string(),
  scopeId: z.string(),
  category: z.string(),
  content: z.string().min(1, "Content is required"),
  embedding: z.array(z.number()).optional(),
  importance: z.number().min(0).max(1),
  source: z.string(),
  metadata: z.any().optional(),
  accessCount: z.number(),
  lastAccessedAt: z.number().optional(),
  status: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type MemoryValidator = z.infer<typeof memoryValidator>;
