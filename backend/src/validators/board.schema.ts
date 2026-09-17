import { z } from 'zod';

export const boardSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Board name is required')
    .max(200, 'Board name must be 200 characters or fewer'),
});

export const joinBoardSchema = z.object({
  code: z.string().trim().min(1, 'Board code is required'),
});
