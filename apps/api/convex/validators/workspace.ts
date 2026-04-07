import { z } from "zod";

export const workspaceValidator = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  status: z.string().trim().min(1).max(120).optional(),
  plan: z.string().trim().min(1).max(120).optional(),
  settings: z.unknown().optional(),
  organizationId: z.string().trim().min(1).optional(),
});
