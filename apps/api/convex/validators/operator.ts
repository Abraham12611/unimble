import { z } from "zod";

export const operatorValidator = z.object({
  workspaceId: z.string().trim().min(1),
  type: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500).optional(),
  config: z.unknown().optional(),
  status: z.string().trim().min(1).max(120).optional(),
  memory: z.unknown().optional(),
  metrics: z.unknown().optional(),
});
