import { z } from 'zod';

export const boardPinSchema = z.object({
  pinned: z.boolean(),
});

export type BoardPinInput = z.infer<typeof boardPinSchema>;
