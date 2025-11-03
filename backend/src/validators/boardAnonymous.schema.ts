import { z } from 'zod';

export const boardAnonymousSchema = z.object({
  enabled: z.boolean(),
});

export type BoardAnonymousInput = z.infer<typeof boardAnonymousSchema>;
