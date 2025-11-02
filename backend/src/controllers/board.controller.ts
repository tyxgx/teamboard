import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { nanoid } from 'nanoid';
import { getIO } from '../sockets/socket';

function buildBoardSummary(
  board: {
    id: string;
    name: string;
    code: string;
    lastActivity: Date;
    anonymousEnabled: boolean;
    createdBy: string;
    _count: { members: number };
  },
  membership: { role: string; pinned: boolean } | null,
  userId: string
) {
  return {
    id: board.id,
    name: board.name,
    code: board.code,
    lastActivity: board.lastActivity,
    anonymousEnabled: board.anonymousEnabled,
    memberCount: board._count.members,
    pinned: membership?.pinned ?? false,
    role: membership?.role ?? null,
    isCreator: board.createdBy === userId,
  };
}

async function getBoardMembership(userId: string, boardId: string) {
  return prisma.boardMembership.findUnique({
    where: { userId_boardId: { userId, boardId } },
  });
}

function ensureMembershipExists(membership: any) {
  if (!membership) {
    const error = new Error('FORBIDDEN');
    // @ts-ignore attach status
    error.status = 403;
    throw error;
  }
}

function ensureBoardExists<T>(board: T | null): asserts board is NonNullable<T> {
  if (!board) {
    const error = new Error('NOT_FOUND');
    // @ts-ignore attach status
    error.status = 404;
    throw error;
  }
}

function isAdmin(userId: string, board: { createdBy: string }, membership: { role: string } | null) {
  return board.createdBy === userId || membership?.role === 'ADMIN';
}

// ✅ Create a new board (Admin by default)
export const createBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    const code = nanoid(8);
    const now = new Date();

    const board = await prisma.board.create({
      data: {
        name,
        code,
        createdBy: req.user.id,
        lastActivity: now,
        members: {
          create: {
            userId: req.user.id,
            role: 'ADMIN',
          },
        },
      },
      include: {
        members: true,
      },
    });

    res.status(201).json(board);
  } catch (error) {
    console.error('❌ Error creating board:', error);
    res.status(500).json({ message: 'Error creating board' });
  }
};

// ✅ Get boards where user is a member (with pinned + lastActivity)
export const getBoards = async (req: Request, res: Response): Promise<void> => {
  try {
    const memberships = await prisma.boardMembership.findMany({
      where: { userId: req.user.id },
      include: {
        board: {
          select: {
            id: true,
            name: true,
            code: true,
            lastActivity: true,
            anonymousEnabled: true,
            createdBy: true,
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: [
        { pinned: 'desc' },
        { board: { lastActivity: 'desc' } },
        { board: { name: 'asc' } },
      ],
    });

    const result = memberships.map((membership) =>
      buildBoardSummary(membership.board, { role: membership.role, pinned: membership.pinned }, req.user.id)
    );

    res.status(200).json(result);
  } catch (error) {
    console.error('❌ Error fetching boards:', error);
    res.status(500).json({ message: 'Error fetching boards' });
  }
};

// ✅ Get a single board with visible comments
export const getBoardById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const membership = await getBoardMembership(req.user.id, id);
    ensureMembershipExists(membership);

    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    ensureBoardExists(board);

    const admin = isAdmin(req.user.id, board, membership);
    const orClauses: any[] = [
      { visibility: 'EVERYONE' },
      { createdById: req.user.id },
    ];
    if (admin) {
      orClauses.push({ visibility: 'ADMIN_ONLY' });
    }

    const comments = await prisma.comment.findMany({
      where: { boardId: id, OR: orClauses },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const shapedComments = comments.map((comment) => {
      const isOwn = comment.createdById === req.user.id;
      const maskedToOthers = comment.anonymous && !admin && !isOwn;
      return {
        id: comment.id,
        message: comment.content,
        visibility: comment.visibility,
        sender: maskedToOthers ? 'Anonymous' : comment.createdBy.name,
        actualSender: comment.anonymous && admin ? comment.createdBy.name : undefined,
        createdAt: comment.createdAt,
      };
    });

    res.status(200).json({
      id: board.id,
      name: board.name,
      code: board.code,
      anonymousEnabled: board.anonymousEnabled,
      lastActivity: board.lastActivity,
      members: board.members,
      comments: shapedComments,
      membershipRole: membership!.role,
      isCreator: board.createdBy === req.user.id,
    });
  } catch (error: any) {
    if (error.status === 403) {
      res.status(403).json({ message: 'You are not a member of this board' });
      return;
    }
    if (error.status === 404) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }
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

    const membership = await prisma.boardMembership.create({
      data: {
        userId,
        boardId: board.id,
        role: 'MEMBER',
      },
      include: {
        board: {
          select: {
            id: true,
            name: true,
            code: true,
            lastActivity: true,
            anonymousEnabled: true,
            createdBy: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    try {
      getIO().to(board.code).emit('membership-updated', {
        boardCode: board.code,
        userId,
        action: 'joined',
      });
    } catch (socketError) {
      console.warn('Socket not initialised when emitting membership-updated (joined)', socketError);
    }

    res.status(200).json(buildBoardSummary(membership.board, { role: membership.role, pinned: membership.pinned }, userId));
  } catch (error) {
    console.error('❌ Error joining board:', error);
    res.status(500).json({ message: 'Error joining board' });
  }
};

// ✅ Get board by invite code (includes minimal data)
export const getBoardByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;

    const board = await prisma.board.findUnique({
      where: { code },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    ensureBoardExists(board);

    const membership = board.members.find((member) => member.userId === req.user.id);
    ensureMembershipExists(membership);

    const admin = isAdmin(req.user.id, board, membership!);
    const orClauses: any[] = [
      { visibility: 'EVERYONE' },
      { createdById: req.user.id },
    ];
    if (admin) {
      orClauses.push({ visibility: 'ADMIN_ONLY' });
    }

    const comments = await prisma.comment.findMany({
      where: { boardId: board.id, OR: orClauses },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const shapedComments = comments.map((comment) => {
      const isOwn = comment.createdById === req.user.id;
      const maskedToOthers = comment.anonymous && !admin && !isOwn;
      return {
        id: comment.id,
        message: comment.content,
        visibility: comment.visibility,
        sender: maskedToOthers ? 'Anonymous' : comment.createdBy.name,
        actualSender: comment.anonymous && admin ? comment.createdBy.name : undefined,
        createdAt: comment.createdAt,
        userId: comment.createdById,
        senderId: comment.createdById,
      };
    });

    res.status(200).json({
      id: board.id,
      name: board.name,
      code: board.code,
      anonymousEnabled: board.anonymousEnabled,
      lastActivity: board.lastActivity,
      members: board.members,
       comments: shapedComments,
      membershipRole: membership!.role,
      isCreator: board.createdBy === req.user.id,
    });
  } catch (error: any) {
    if (error.status === 404) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }
    if (error.status === 403) {
      res.status(403).json({ message: 'You are not a member of this board' });
      return;
    }
    console.error('❌ Error fetching board by code:', error);
    res.status(500).json({ message: 'Error fetching board by code' });
  }
};

export const updateBoardAnonymous = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { enabled } = req.body as { enabled: boolean };

    const board = await prisma.board.findUnique({ where: { id }, select: { id: true, code: true, createdBy: true } });
    ensureBoardExists(board);

    const membership = await getBoardMembership(req.user.id, id);
    if (!isAdmin(req.user.id, board, membership)) {
      res.status(403).json({ message: 'Only admins can change anonymous settings' });
      return;
    }

    const updated = await prisma.board.update({
      where: { id },
      data: { anonymousEnabled: enabled },
      select: { anonymousEnabled: true, code: true },
    });

    try {
      getIO().to(updated.code).emit('board-updated', {
        boardCode: updated.code,
        anonymousEnabled: updated.anonymousEnabled,
      });
    } catch (socketError) {
      console.warn('Socket not initialised when emitting board-updated', socketError);
    }

    res.json({ anonymousEnabled: updated.anonymousEnabled });
  } catch (error) {
    console.error('❌ Error updating anonymous mode:', error);
    res.status(500).json({ message: 'Error updating anonymous mode' });
  }
};

export const updateBoardPin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { pinned } = req.body as { pinned: boolean };

    const membership = await prisma.boardMembership.update({
      where: { userId_boardId: { userId: req.user.id, boardId: id } },
      data: { pinned },
      include: {
        board: {
          select: {
            id: true,
            name: true,
            code: true,
            lastActivity: true,
            anonymousEnabled: true,
            createdBy: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    res.json(buildBoardSummary(membership.board, { role: membership.role, pinned: membership.pinned }, req.user.id));
  } catch (error) {
    console.error('❌ Error updating pinned status:', error);
    res.status(500).json({ message: 'Error updating pinned status' });
  }
};

export const leaveBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const membership = await prisma.boardMembership.findUnique({
      where: { userId_boardId: { userId: req.user.id, boardId: id } },
      include: {
        board: { select: { code: true } },
      },
    });

    if (!membership) {
      res.status(204).send();
      return;
    }

    await prisma.boardMembership.delete({ where: { userId_boardId: { userId: req.user.id, boardId: id } } });

    try {
      getIO().to(membership.board.code).emit('membership-updated', {
        boardCode: membership.board.code,
        userId: req.user.id,
        action: 'left',
      });
    } catch (socketError) {
      console.warn('Socket not initialised when emitting membership-updated', socketError);
    }

    res.status(204).send();
  } catch (error) {
    console.error('❌ Error leaving board:', error);
    res.status(500).json({ message: 'Error leaving board' });
  }
};

export const deleteBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const board = await prisma.board.findUnique({
      where: { id },
      select: { id: true, code: true, createdBy: true },
    });
    ensureBoardExists(board);

    const membership = await getBoardMembership(req.user.id, id);
    if (!isAdmin(req.user.id, board, membership)) {
      res.status(403).json({ message: 'Only admins can delete this board' });
      return;
    }

    await prisma.comment.deleteMany({ where: { boardId: id } });
    await prisma.boardMembership.deleteMany({ where: { boardId: id } });
    await prisma.board.delete({ where: { id } });

    try {
      getIO().to(board.code).emit('board-deleted', {
        boardCode: board.code,
      });
    } catch (socketError) {
      console.warn('Socket not initialised when emitting board-deleted', socketError);
    }

    res.status(204).send();
  } catch (error: any) {
    if (error.status === 404) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }
    console.error('❌ Error deleting board:', error);
    res.status(500).json({ message: 'Error deleting board' });
  }
};
