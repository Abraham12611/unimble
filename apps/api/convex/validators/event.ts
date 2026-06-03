import { z } from "zod";

export const eventValidator = z.object({
  workspaceId: z.string(),
  userId: z.string().optional(),
  type: z.string(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  metadata: z.any().optional(),
  timestamp: z.number(),
});

export type EventValidator = z.infer<typeof eventValidator>;
