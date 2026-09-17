import { z } from 'zod';

export const commentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(5000, 'Comment must be 5000 characters or fewer'),
  visibility: z.enum(['EVERYONE', 'ADMIN_ONLY']),
  boardId: z.string().uuid('Invalid board ID'),
  anonymous: z.boolean().optional().default(false),
  clientMessageId: z.string().optional(),
});
