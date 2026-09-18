import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { getIO } from '../sockets/socket';
import { canViewComment, displaySender, getBoardAccess, visibleCommentsWhere } from './access';

export const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'] as const;

const room = (boardCode: string, adminOnly: boolean) => (adminOnly ? `${boardCode}:admin` : boardCode);

async function reactionSummary(commentId: string, viewerId: string) {
  const rows = await prisma.reaction.findMany({
    where: { commentId },
    select: { emoji: true, userId: true },
  });
  const byEmoji = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userId === viewerId) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }
  return Array.from(byEmoji, ([emoji, v]) => ({ emoji, ...v }));
}

/** POST /api/messages/:commentId/reactions  { emoji }  — toggles the caller's reaction. */
export const toggleReaction = async (req: Request, res: Response) => {
  const commentId = String(req.params.commentId);
  const emoji = req.body?.emoji;
  if (typeof emoji !== 'string' || !(ALLOWED_REACTIONS as readonly string[]).includes(emoji)) {
    res.status(400).json({ message: 'Unsupported reaction' });
    return;
  }
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, boardId: true, visibility: true, createdById: true },
    });
    if (!comment) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }
    const access = await getBoardAccess(req.user.id, comment.boardId);
    if (!access || !access.active) {
      res.status(403).json({ message: 'You are not an active member of this board' });
      return;
    }
    if (!canViewComment(comment, req.user.id, access.admin)) {
      // Same answer as "doesn't exist" so hidden admin-only messages can't be probed.
      res.status(404).json({ message: 'Message not found' });
      return;
    }

    const key = { commentId_userId_emoji: { commentId, userId: req.user.id, emoji } };
    const existing = await prisma.reaction.findUnique({ where: key });
    if (existing) {
      await prisma.reaction.delete({ where: key });
    } else {
      await prisma.reaction.create({ data: { commentId, userId: req.user.id, emoji } });
    }

    const reactions = await reactionSummary(commentId, req.user.id);
    try {
      // Counts only: who reacted is never broadcast, so anonymous messages stay anonymous.
      getIO()
        .to(room(access.board.code, comment.visibility === 'ADMIN_ONLY'))
        .emit('reaction:update', {
          boardCode: access.board.code,
          commentId,
          counts: reactions.map(({ emoji: e, count }) => ({ emoji: e, count })),
        });
    } catch (socketError) {
      console.warn('Socket not ready for reaction:update', socketError);
    }
    res.json({ commentId, reactions });
  } catch (error) {
    console.error('toggleReaction failed', error);
    res.status(500).json({ message: 'Unable to update reaction' });
  }
};

/** GET /api/boards/:boardId/reactions?ids=a,b,c  — reaction summaries for messages the caller may see. */
export const getReactions = async (req: Request, res: Response) => {
  const boardId = String(req.params.boardId);
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
  try {
    const access = await getBoardAccess(req.user.id, boardId);
    if (!access) {
      res.status(403).json({ message: 'You are not a member of this board' });
      return;
    }
    if (ids.length === 0) {
      res.json({ reactions: {} });
      return;
    }
    const rows = await prisma.reaction.findMany({
      where: { commentId: { in: ids }, comment: visibleCommentsWhere(req.user.id, access) },
      select: { commentId: true, emoji: true, userId: true },
    });
    const out: Record<string, { emoji: string; count: number; mine: boolean }[]> = {};
    for (const r of rows) {
      const list = (out[r.commentId] ??= []);
      let entry = list.find((e) => e.emoji === r.emoji);
      if (!entry) {
        entry = { emoji: r.emoji, count: 0, mine: false };
        list.push(entry);
      }
      entry.count += 1;
      if (r.userId === req.user.id) entry.mine = true;
    }
    res.json({ reactions: out });
  } catch (error) {
    console.error('getReactions failed', error);
    res.status(500).json({ message: 'Unable to load reactions' });
  }
};

/** PUT /api/boards/:boardId/read — records that the caller has seen everything up to now. */
export const markRead = async (req: Request, res: Response) => {
  const boardId = String(req.params.boardId);
  try {
    const access = await getBoardAccess(req.user.id, boardId);
    if (!access || !access.active) {
      res.status(403).json({ message: 'You are not an active member of this board' });
      return;
    }
    const at = new Date();
    await prisma.boardMembership.update({
      where: { userId_boardId: { userId: req.user.id, boardId } },
      data: { lastReadAt: at },
    });
    try {
      getIO()
        .to(access.board.code)
        .emit('read:update', { boardCode: access.board.code, userId: req.user.id, at: at.toISOString() });
    } catch (socketError) {
      console.warn('Socket not ready for read:update', socketError);
    }
    res.json({ lastReadAt: at.toISOString() });
  } catch (error) {
    console.error('markRead failed', error);
    res.status(500).json({ message: 'Unable to record read state' });
  }
};

/** GET /api/boards/:boardId/reads — when each other active member last caught up (drives "Seen by"). */
export const getReads = async (req: Request, res: Response) => {
  const boardId = String(req.params.boardId);
  try {
    const access = await getBoardAccess(req.user.id, boardId);
    if (!access || !access.active) {
      res.status(403).json({ message: 'You are not an active member of this board' });
      return;
    }
    const rows = await prisma.boardMembership.findMany({
      where: { boardId, status: 'ACTIVE', lastReadAt: { not: null }, userId: { not: req.user.id } },
      select: { userId: true, lastReadAt: true, user: { select: { name: true } } },
    });
    res.json({
      reads: rows.map((r) => ({ userId: r.userId, name: r.user.name, lastReadAt: r.lastReadAt })),
    });
  } catch (error) {
    console.error('getReads failed', error);
    res.status(500).json({ message: 'Unable to load read state' });
  }
};

/** GET /api/boards/:boardId/search?q=  — search only within messages the caller is allowed to see. */
export const searchMessages = async (req: Request, res: Response) => {
  const boardId = String(req.params.boardId);
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2 || q.length > 100) {
    res.status(400).json({ message: 'Search must be 2 to 100 characters' });
    return;
  }
  try {
    const access = await getBoardAccess(req.user.id, boardId);
    if (!access) {
      res.status(403).json({ message: 'You are not a member of this board' });
      return;
    }
    const base = visibleCommentsWhere(req.user.id, access);
    const comments = await prisma.comment.findMany({
      where: {
        AND: [
          base,
          { content: { contains: q, mode: 'insensitive' } },
          ...(access.leftAt && !access.active ? [{ createdAt: { lte: access.leftAt } }] : []),
        ],
      },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
    });
    res.json({
      results: comments.map((c) => ({
        id: c.id,
        message: c.content,
        sender: displaySender(c, req.user.id, access.admin),
        visibility: c.visibility,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error('searchMessages failed', error);
    res.status(500).json({ message: 'Search failed' });
  }
};
