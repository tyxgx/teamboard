import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { sniffImageType } from './attachment.controller';

export const MAX_AVATAR_BYTES = 256 * 1024;
// No GIF: avatars are static, and it keeps animated content out of member lists.
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** PUT /api/user/avatar  (raw image body, up to 256 KB) */
export const uploadAvatar = async (req: Request, res: Response) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ message: 'Send the image as the raw request body (png, jpeg or webp)' });
    return;
  }
  const mime = sniffImageType(body);
  if (!mime || !AVATAR_TYPES.includes(mime)) {
    res.status(415).json({ message: 'Avatars must be png, jpeg or webp images' });
    return;
  }
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarMime: mime, avatarData: new Uint8Array(body) },
    });
    res.status(204).end();
  } catch (error) {
    console.error('uploadAvatar failed', error);
    res.status(500).json({ message: 'Unable to save avatar' });
  }
};

export const deleteAvatar = async (req: Request, res: Response) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarMime: null, avatarData: null } });
    res.status(204).end();
  } catch (error) {
    console.error('deleteAvatar failed', error);
    res.status(500).json({ message: 'Unable to remove avatar' });
  }
};

/** GET /api/users/:id/avatar — yourself, or someone you share a board with. 404 when none is set. */
export const getAvatar = async (req: Request, res: Response) => {
  const userId = String(req.params.id);
  try {
    if (userId !== req.user.id) {
      const shared = await prisma.boardMembership.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          board: { members: { some: { userId: req.user.id, status: 'ACTIVE' } } },
        },
        select: { id: true },
      });
      if (!shared) {
        res.status(404).json({ message: 'Not found' });
        return;
      }
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarMime: true, avatarData: true },
    });
    if (!user?.avatarData || !user.avatarMime) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    res.set({
      'Content-Type': user.avatarMime,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    res.send(Buffer.from(user.avatarData));
  } catch (error) {
    console.error('getAvatar failed', error);
    res.status(500).json({ message: 'Unable to load avatar' });
  }
};
