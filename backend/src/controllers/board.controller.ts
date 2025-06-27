import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { nanoid } from 'nanoid';

// ✅ Create a new board (Admin by default)
export const createBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    const code = nanoid(8);

    const board = await prisma.board.create({
      data: {
        name,
        code,
        createdBy: req.user.id,
        members: {
          create: {
            userId: req.user.id,
            role: 'ADMIN',
          },
        },
      },
    });

    res.status(201).json(board);
  } catch (error) {
    console.error('❌ Error creating board:', error);
    res.status(500).json({ message: 'Error creating board' });
  }
};

// ✅ Get boards where user is a member
export const getBoards = async (req: Request, res: Response): Promise<void> => {
  try {
    const boards = await prisma.board.findMany({
      where: {
        members: {
          some: {
            userId: req.user.id,
          },
        },
      },
    });

    res.status(200).json(boards);
  } catch (error) {
    console.error('❌ Error fetching boards:', error);
    res.status(500).json({ message: 'Error fetching boards' });
  }
};

// ✅ Get a single board with visible comments
export const getBoardById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        members: true,
        comments: {
          where: {
            OR: [
              { visibility: 'EVERYONE' },
              {
                AND: [{ visibility: 'ADMIN_ONLY' }, { board: { createdBy: req.user.id } }],
              },
              { createdById: req.user.id },
            ],
          },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    res.status(200).json(board);
  } catch (error) {
    console.error('❌ Error fetching board:', error);
    res.status(500).json({ message: 'Error fetching board' });
  }
};

// ✅ Join board by invite code
export const joinBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    const board = await prisma.board.findUnique({ where: { code } });
    if (!board) {
      res.status(404).json({ message: 'Board not found with this code' });
      return;
    }

    const existing = await prisma.boardMembership.findUnique({
      where: {
        userId_boardId: {
          userId,
          boardId: board.id,
        },
      },
    });

    if (existing) {
      res.status(400).json({ message: 'Already a member of this board' });
      return;
    }

    await prisma.boardMembership.create({
      data: {
        userId,
        boardId: board.id,
        role: 'MEMBER',
      },
    });

    res.status(200).json({ message: 'Successfully joined the board', board });
  } catch (error) {
    console.error('❌ Error joining board:', error);
    res.status(500).json({ message: 'Error joining board' });
  }
};