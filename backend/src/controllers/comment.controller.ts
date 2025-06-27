import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createComment = async (req: Request, res: Response) => {
  try {
    const { content, visibility, boardId } = req.body;

    const board = await prisma.board.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    if (visibility === 'ADMIN_ONLY' && req.user.role !== 'ADMIN' && board.adminId !== req.user.id) {
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

    const comments = await prisma.comment.findMany({
      where: {
        boardId,
        OR: [
          { visibility: 'EVERYONE' },
          {
            AND: [{ visibility: 'ADMIN_ONLY' }, { board: { adminId: req.user.id } }],
          },
          { createdById: req.user.id },
        ],
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

    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching comments' });
  }
};
