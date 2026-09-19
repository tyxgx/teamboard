import express from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  getReactions,
  getReads,
  markRead,
  searchMessages,
  toggleReaction,
} from '../controllers/engagement.controller';
import { deleteAvatar, getAvatar, MAX_AVATAR_BYTES, uploadAvatar } from '../controllers/avatar.controller';
import { rateLimit } from '../middlewares/rateLimit';
import { deleteMessage, editMessage } from '../controllers/messageActions.controller';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_ATTACHMENT_BYTES,
  getAttachment,
  uploadAttachment,
} from '../controllers/attachment.controller';

const router = express.Router();

const reactLimiter = rateLimit({ windowMs: 60_000, max: 90, name: 'reaction' });
const editLimiter = rateLimit({ windowMs: 60_000, max: 40, name: 'edit' });
const uploadLimiter = rateLimit({ windowMs: 60_000, max: 12, name: 'upload' });
const searchLimiter = rateLimit({ windowMs: 60_000, max: 60, name: 'search' });

router.post('/messages/:commentId/reactions', authenticate, reactLimiter, toggleReaction);
router.patch('/messages/:commentId', authenticate, editLimiter, editMessage);
router.delete('/messages/:commentId', authenticate, editLimiter, deleteMessage);
router.get('/boards/:boardId/reactions', authenticate, getReactions);
router.put('/boards/:boardId/read', authenticate, markRead);
router.get('/boards/:boardId/reads', authenticate, getReads);
router.get('/boards/:boardId/search', authenticate, searchLimiter, searchMessages);
router.post(
  '/boards/:boardId/attachments',
  authenticate,
  uploadLimiter,
  express.raw({ type: ALLOWED_IMAGE_TYPES, limit: MAX_ATTACHMENT_BYTES }),
  uploadAttachment
);
router.get('/attachments/:id', authenticate, getAttachment);

const avatarLimiter = rateLimit({ windowMs: 60_000, max: 10, name: 'avatar' });
router.put(
  '/user/avatar',
  authenticate,
  avatarLimiter,
  express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: MAX_AVATAR_BYTES }),
  uploadAvatar
);
router.delete('/user/avatar', authenticate, avatarLimiter, deleteAvatar);
router.get('/users/:id/avatar', authenticate, getAvatar);

// express.raw rejects oversized bodies with an error object; answer 413 instead of a generic 500.
router.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ message: 'Image is too large' });
    return;
  }
  next(err);
});

export default router;
