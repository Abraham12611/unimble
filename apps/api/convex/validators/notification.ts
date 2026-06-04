import { z } from "zod";

export const notificationValidator = z.object({
  userId: z.string(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  read: z.boolean().optional(),
  createdAt: z.number(),
  readAt: z.number().optional(),
});

export type Notification = z.infer<typeof notificationValidator>;
