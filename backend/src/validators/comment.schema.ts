import { z } from 'zod';

export const commentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty'),
  visibility: z.enum(['EVERYONE', 'ADMIN_ONLY']),
  boardId: z.string().uuid('Invalid board ID'),
});
