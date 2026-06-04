import { z } from "zod";

export const eventValidator = z.object({
  type: z.string(),
  source: z.string(),
  data: z.record(z.unknown()),
  timestamp: z.number(),
  processed: z.boolean().optional(),
});

export type Event = z.infer<typeof eventValidator>;
