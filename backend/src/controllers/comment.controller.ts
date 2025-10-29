import { Request, Response } from 'express';
import { prisma } from '../db/client';

async function isBoardAdmin(userId: string, boardId: string) {
  const membership = await prisma.boardMembership.findFirst({
    where: { userId, boardId, role: 'ADMIN' },
    select: { id: true },
  });
  return Boolean(membership);
}

export const createComment = async (req: Request, res: Response) => {
  try {
    const { content, visibility, boardId, anonymous = false } = req.body;

    const board = await prisma.board.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    // Only board admins can create ADMIN_ONLY comments
    if (visibility === 'ADMIN_ONLY' && !(await isBoardAdmin(req.user.id, boardId))) {
      res.status(403).json({
        message: 'Only admins can create admin-only comments',
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

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ message: 'Error creating comment' });
  }
};

export const getComments = async (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;

    const admin = await isBoardAdmin(req.user.id, boardId);

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
      };
    });

    res.json(shaped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching comments' });
  }
};
