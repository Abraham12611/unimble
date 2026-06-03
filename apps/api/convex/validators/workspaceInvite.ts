import { z } from "zod";

export const workspaceInviteValidator = z.object({
  workspaceId: z.string(),
  email: z.string().email(),
  role: z.enum(["member", "admin"]),
  status: z.enum(["pending", "accepted", "expired"]),
  invitedBy: z.string(),
  invitedAt: z.number(),
  expiresAt: z.number().optional(),
});

export type WorkspaceInvite = z.infer<typeof workspaceInviteValidator>;
