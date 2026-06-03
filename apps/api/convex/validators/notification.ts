import { z } from "zod";

export const notificationValidator = z.object({
  workspaceId: z.string(),
  userId: z.string().optional(),
  type: z.string(),
  title: z.string().min(1, "Title is required"),
  message: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  metadata: z.any().optional(),
  read: z.boolean(),
  readAt: z.number().optional(),
  createdAt: z.number(),
});

export type NotificationValidator = z.infer<typeof notificationValidator>;
