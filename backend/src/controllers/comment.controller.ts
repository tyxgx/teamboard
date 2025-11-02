import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { getIO } from '../sockets/socket';

async function getMembership(userId: string, boardId: string) {
  return prisma.boardMembership.findUnique({
    where: { userId_boardId: { userId, boardId } },
    select: { role: true },
  });
}

export const createComment = async (req: Request, res: Response) => {
  try {
    const { content, visibility, boardId, anonymous = false } = req.body;

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, code: true, createdBy: true, anonymousEnabled: true },
    });

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    const membership = await getMembership(req.user.id, boardId);
    if (!membership) {
      res.status(403).json({ message: 'You are not a member of this board' });
      return;
    }

    const isAdmin = board.createdBy === req.user.id || membership.role === 'ADMIN';

    // Only board admins can create ADMIN_ONLY comments
    if (visibility === 'ADMIN_ONLY' && !isAdmin) {
      res.status(403).json({
        message: 'Only admins can create admin-only comments',
      });
      return;
    }

    if (anonymous && !board.anonymousEnabled && !isAdmin) {
      res.status(403).json({
        message: 'Anonymous comments are disabled on this board',
      });
      return;
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        visibility,
        createdById: req.user.id,
        boardId,
        anonymous,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const updatedBoard = await prisma.board.update({
      where: { id: boardId },
      data: { lastActivity: new Date() },
      select: { code: true, lastActivity: true },
    });

    try {
      getIO().to(updatedBoard.code).emit('board-activity', {
        boardCode: updatedBoard.code,
        lastActivity: updatedBoard.lastActivity.toISOString(),
      });
    } catch (error) {
      console.warn('Socket not initialised when emitting board-activity', error);
    }

    res.status(201).json({
      ...comment,
      createdAt: comment.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating comment' });
  }
};

export const getComments = async (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;

    const board = await prisma.board.findUnique({ where: { id: boardId }, select: { createdBy: true } });
    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    const membership = await getMembership(req.user.id, boardId);
    if (!membership) {
      res.status(403).json({ message: 'You are not a member of this board' });
      return;
    }

    const admin = board.createdBy === req.user.id || membership.role === 'ADMIN';

    const orClauses: any[] = [
      { visibility: 'EVERYONE' },
      { createdById: req.user.id },
    ];
    if (admin) {
      orClauses.push({ visibility: 'ADMIN_ONLY' });
    }

    const comments = await prisma.comment.findMany({
      where: { boardId, OR: orClauses },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { id: 'asc' },
    });

    // Shape messages similar to socket events, applying anonymity rules
    const shaped = comments.map((c) => {
      const isOwn = c.createdById === req.user.id;
      const maskedToOthers = c.anonymous && !admin && !isOwn;
      const sender = maskedToOthers ? 'Anonymous' : c.createdBy.name;
      const actualSender = c.anonymous && admin ? c.createdBy.name : undefined;
      return {
        id: c.id,
        message: c.content,
        visibility: c.visibility as 'EVERYONE' | 'ADMIN_ONLY',
        sender,
        actualSender,
        createdAt: c.createdAt,
        userId: c.createdById,
      };
    });

    res.json(shaped);
  } catch (error) {
    console.error('❌ Error fetching comments:', error);
    res.status(500).json({ message: 'Error fetching comments' });
  }
};
