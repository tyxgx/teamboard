import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { canViewComment, getBoardAccess } from './access';

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_PENDING_PER_USER = 10;

/** Identify the real format from the bytes; never trust the client's Content-Type header. SVG is deliberately unsupported (script injection). */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/** POST /api/boards/:boardId/attachments  (raw image body) -> { id, mime, size } */
export const uploadAttachment = async (req: Request, res: Response) => {
  const boardId = String(req.params.boardId);
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ message: 'Send the image as the raw request body (png, jpeg, webp or gif)' });
    return;
  }
  const mime = sniffImageType(body);
  if (!mime) {
    res.status(415).json({ message: 'Only png, jpeg, webp and gif images are supported' });
    return;
  }
  try {
    const access = await getBoardAccess(req.user.id, boardId);
    if (!access || !access.active) {
      res.status(403).json({ message: 'You are not an active member of this board' });
      return;
    }
    const pending = await prisma.attachment.count({
      where: { boardId, uploaderId: req.user.id, commentId: null },
    });
    if (pending >= MAX_PENDING_PER_USER) {
      res.status(429).json({ message: 'Too many unsent uploads. Send or discard some first.' });
      return;
    }
    const created = await prisma.attachment.create({
      data: { boardId, uploaderId: req.user.id, mime, size: body.length, data: new Uint8Array(body) },
      select: { id: true, mime: true, size: true },
    });
    res.status(201).json(created);
  } catch (error) {
    console.error('uploadAttachment failed', error);
    res.status(500).json({ message: 'Upload failed' });
  }
};

/** GET /api/attachments/:id — bytes, only for people who could see the message carrying it. */
export const getAttachment = async (req: Request, res: Response) => {
  try {
    const att = await prisma.attachment.findUnique({
      where: { id: String(req.params.id) },
      include: { comment: { select: { visibility: true, createdById: true } } },
    });
    if (!att) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    const access = await getBoardAccess(req.user.id, att.boardId);
    if (!access || !access.active) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    const allowed = att.comment
      ? canViewComment(att.comment, req.user.id, access.admin)
      : att.uploaderId === req.user.id; // not yet sent: only the uploader
    if (!allowed) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    res.set({
      'Content-Type': att.mime,
      'Content-Length': String(att.size),
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    res.send(Buffer.from(att.data));
  } catch (error) {
    console.error('getAttachment failed', error);
    res.status(500).json({ message: 'Unable to load image' });
  }
};
