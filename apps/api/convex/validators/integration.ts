import { z } from "zod";

export const integrationValidator = z.object({
  workspaceId: z.string().trim().min(1),
  provider: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  credentialsRef: z.string().trim().min(1).optional(),
  config: z.unknown().optional(),
  status: z.string().trim().min(1).max(120).optional(),
});
