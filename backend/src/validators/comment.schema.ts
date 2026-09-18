import { z } from 'zod';

export const commentSchema = z
  .object({
    // May be empty only when an image is attached (checked below)
    content: z.string().max(5000, 'Comment must be 5000 characters or fewer'),
    visibility: z.enum(['EVERYONE', 'ADMIN_ONLY']),
    boardId: z.string().uuid('Invalid board ID'),
    anonymous: z.boolean().optional().default(false),
    clientMessageId: z.string().optional(),
    // Reply to an earlier message on the same board
    parentId: z.string().uuid('Invalid parent message ID').optional(),
    // Previously uploaded image (POST /api/boards/:boardId/attachments)
    attachmentId: z.string().uuid('Invalid attachment ID').optional(),
  })
  .refine((v) => v.content.trim().length > 0 || Boolean(v.attachmentId), {
    message: 'Comment cannot be empty',
    path: ['content'],
  });
