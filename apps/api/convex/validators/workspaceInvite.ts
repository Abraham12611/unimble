import { z } from "zod";

export const workspaceInviteValidator = z.object({
  workspaceId: z.string(),
  email: z.string().email("Invalid email address"),
  invitedBy: z.string(),
  status: z.enum(["pending", "accepted", "expired"]),
  expiresAt: z.number().optional(),
  createdAt: z.number(),
});

export type WorkspaceInviteValidator = z.infer<typeof workspaceInviteValidator>;
