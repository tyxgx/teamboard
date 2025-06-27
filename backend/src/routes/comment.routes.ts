import express from 'express';
import { createComment, getComments } from '../controllers/comment.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { commentSchema } from '../validators/comment.schema';

const router = express.Router();

/**
 * @swagger
 * /api/comments:
 *   post:
 *     summary: Add a comment to a board
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *               - visibility
 *               - boardId
 *             properties:
 *               content:
 *                 type: string
 *               visibility:
 *                 type: string
 *                 enum: [EVERYONE, ADMIN_ONLY]
 *               boardId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', authenticate, validate(commentSchema), createComment);

/**
 * @swagger
 * /api/comments/{boardId}:
 *   get:
 *     summary: Get comments for a board
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of comments
 *       401:
 *         description: Unauthorized
 */
router.get('/:boardId', authenticate, getComments);

export default router;