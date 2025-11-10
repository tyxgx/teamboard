import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { nanoid } from 'nanoid';
import { MembershipStatus, Visibility } from '@prisma/client';
import { getIO } from '../sockets/socket';

const boardSummarySelect = {
  id: true,
  name: true,
  code: true,
  lastActivity: true,
  anonymousEnabled: true,
  createdBy: true,
  lastCommentAt: true,
  lastCommentPreview: true,
  lastCommentVisibility: true,
  lastCommentAnonymous: true,
  lastCommentSenderId: true,
  lastCommentSenderName: true,
  _count: { select: { members: true } },
} as const;

function buildBoardSummary(
  board: {
    id: string;
    name: string;
    code: string;
    lastActivity: Date;
    anonymousEnabled: boolean;
    createdBy: string;
    lastCommentAt: Date | null;
    lastCommentPreview: string | null;
    lastCommentVisibility: Visibility | null;
    lastCommentAnonymous: boolean;
    lastCommentSenderId: string | null;
    lastCommentSenderName: string | null;
    _count: { members: number };
  },
  membership: { role: string; pinned: boolean; status: MembershipStatus } | null,
  userId: string,
  lastCommentSenderName: string | null
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
    membershipStatus: membership?.status ?? 'ACTIVE',
    readOnly: membership?.status === 'LEFT',
    lastCommentPreview: board.lastCommentPreview,
    lastCommentAt: board.lastCommentAt,
    lastCommentVisibility: board.lastCommentVisibility ?? null,
    lastCommentAnonymous: board.lastCommentAnonymous,
    lastCommentSenderName,
  };
}

async function getBoardMembership(userId: string, boardId: string) {
  return prisma.boardMembership.findUnique({
    where: { userId_boardId: { userId, boardId } },
    select: {
      userId: true,
      boardId: true,
      role: true,
      pinned: true,
      status: true,
      leftAt: true,
    },
  });
}

function ensureMembershipExists<T>(membership: T | null | undefined): asserts membership is NonNullable<T> {
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
// TASK 2.3: Add pagination support
export const getBoards = async (req: Request, res: Response): Promise<void> => {
  try {
    // Parse pagination params
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const offsetRaw = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
    const limit = Math.min(parseInt(String(limitRaw || '100'), 10) || 100, 200); // Max 200
    const offset = parseInt(String(offsetRaw || '0'), 10) || 0;

    // Get total count for pagination metadata
    const total = await prisma.boardMembership.count({
      where: { userId: req.user.id },
    });

    const memberships = await prisma.boardMembership.findMany({
      where: { userId: req.user.id },
      select: {
        role: true,
        pinned: true,
        status: true,
        board: { select: boardSummarySelect },
      },
      take: limit,
      skip: offset,
    });

    const summaries = memberships.map((membership) =>
      buildBoardSummary(
        membership.board,
        {
          role: membership.role,
          pinned: membership.pinned,
          status: membership.status,
        },
        req.user.id,
        membership.board.lastCommentSenderName ?? null
      )
    );

    const result = summaries.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const rank = (status: MembershipStatus) => (status === 'ACTIVE' ? 0 : 1);
      const statusDiff = rank(a.membershipStatus) - rank(b.membershipStatus);
      if (statusDiff !== 0) return statusDiff;
      const aTime = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const bTime = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.name.localeCompare(b.name);
    });

    // TASK 2.3: Return pagination metadata if pagination params were provided
    if (limitRaw || offsetRaw) {
      res.status(200).json({
        boards: result,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      });
    } else {
      // Backward compatible: return array if no pagination params
      res.status(200).json(result);
    }
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

    // TASK 3.4: Optimize query - filter active members at database level
    const board = await prisma.board.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        anonymousEnabled: true,
        lastActivity: true,
        createdBy: true,
        members: {
          where: { status: 'ACTIVE' }, // TASK 3.4: Filter at DB level
          select: {
            id: true,
            userId: true,
            boardId: true,
            role: true,
            status: true,
            leftAt: true,
            pinned: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    ensureBoardExists(board);

    const activeMembers = board.members; // Already filtered

    res.status(200).json({
      id: board.id,
      name: board.name,
      code: board.code,
      anonymousEnabled: board.anonymousEnabled,
      lastActivity: board.lastActivity,
      members: activeMembers,
      membershipRole: membership.role,
      membershipStatus: membership.status,
      readOnly: membership.status === 'LEFT',
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

    const board = await prisma.board.findUnique({ where: { code }, select: { id: true, code: true } });
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
      include: {
        board: { select: boardSummarySelect },
      },
    });

    if (existing && existing.status === 'ACTIVE') {
      res.status(400).json({ message: 'Already a member of this board' });
      return;
    }

    const membership =
      existing && existing.status === 'LEFT'
        ? await prisma.boardMembership.update({
            where: {
              userId_boardId: {
                userId,
                boardId: board.id,
              },
            },
            data: { status: 'ACTIVE', leftAt: null },
            include: { board: { select: boardSummarySelect } },
          })
        : await prisma.boardMembership.create({
            data: {
              userId,
              boardId: board.id,
              role: 'MEMBER',
            },
            include: { board: { select: boardSummarySelect } },
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

    res.status(200).json(
      buildBoardSummary(
        membership.board,
        {
          role: membership.role,
          pinned: membership.pinned,
          status: membership.status,
        },
        userId,
        membership.board.lastCommentSenderName ?? null
      )
    );
  } catch (error) {
    console.error('❌ Error joining board:', error);
    res.status(500).json({ message: 'Error joining board' });
  }
};

// ✅ Get board by invite code (includes minimal data)
export const getBoardByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;

    // TASK 3.4: Optimize query - filter active members at database level
    const board = await prisma.board.findUnique({
      where: { code },
      select: {
        id: true,
        name: true,
        code: true,
        anonymousEnabled: true,
        lastActivity: true,
        createdBy: true,
        members: {
          where: { status: 'ACTIVE' }, // TASK 3.4: Filter at DB level
          select: {
            id: true,
            userId: true,
            boardId: true,
            role: true,
            status: true,
            leftAt: true,
            pinned: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    ensureBoardExists(board);

    // TASK 3.4: Find membership separately if needed (for status check)
    const membership = await getBoardMembership(req.user.id, board.id);
    ensureMembershipExists(membership);

    const activeMembers = board.members; // Already filtered

    res.status(200).json({
      id: board.id,
      name: board.name,
      code: board.code,
      anonymousEnabled: board.anonymousEnabled,
      lastActivity: board.lastActivity,
      members: activeMembers,
      membershipRole: membership.role,
      membershipStatus: membership.status,
      readOnly: membership.status === 'LEFT',
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
    if (!membership || membership.status !== 'ACTIVE' || !isAdmin(req.user.id, board, membership)) {
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

    const member = await prisma.boardMembership.findUnique({
      where: { userId_boardId: { userId: req.user.id, boardId: id } },
      select: { status: true },
    });

    if (!member || member.status !== 'ACTIVE') {
      res.status(403).json({ message: 'Only active members can update pinned status' });
      return;
    }

    const membership = await prisma.boardMembership.update({
      where: { userId_boardId: { userId: req.user.id, boardId: id } },
      data: { pinned },
      include: {
        board: { select: boardSummarySelect },
      },
    });

    res.json(
      buildBoardSummary(
        membership.board,
        { role: membership.role, pinned: membership.pinned, status: membership.status },
        req.user.id,
        membership.board.lastCommentSenderName ?? null
      )
    );
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

    if (membership.status === 'LEFT') {
      res.status(204).send();
      return;
    }

    await prisma.boardMembership.update({
      where: { userId_boardId: { userId: req.user.id, boardId: id } },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
        pinned: false,
      },
    });

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

    // Allow deletion if user is the creator (regardless of membership status)
    // OR if user is admin with ACTIVE membership
    const isCreator = board.createdBy === req.user.id;
    const membership = await getBoardMembership(req.user.id, id);
    const isAdminWithActiveMembership = membership && membership.status === 'ACTIVE' && isAdmin(req.user.id, board, membership);
    
    if (!isCreator && !isAdminWithActiveMembership) {
      res.status(403).json({ message: 'Only board creators or active admins can delete this board' });
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

export const bulkLeaveBoards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boardIds } = req.body as { boardIds: string[] };

    if (!Array.isArray(boardIds) || boardIds.length === 0) {
      res.status(400).json({ message: 'boardIds must be a non-empty array' });
      return;
    }

    // Validate user has membership in all boards
    const memberships = await prisma.boardMembership.findMany({
      where: {
        userId: req.user.id,
        boardId: { in: boardIds },
      },
      include: {
        board: { select: { code: true } },
      },
    });

    const validBoardIds = memberships
      .filter((m) => m.status === 'ACTIVE')
      .map((m) => m.boardId);

    if (validBoardIds.length === 0) {
      res.status(200).json({ successCount: 0, failureCount: boardIds.length, results: [] });
      return;
    }

    // Update all memberships in a single transaction
    await prisma.$transaction(
      validBoardIds.map((boardId) =>
        prisma.boardMembership.update({
          where: { userId_boardId: { userId: req.user.id, boardId } },
          data: {
            status: 'LEFT',
            leftAt: new Date(),
            pinned: false,
          },
        })
      )
    );

    // Emit socket events for each board
    const io = getIO();
    memberships.forEach((membership) => {
      if (validBoardIds.includes(membership.boardId)) {
        try {
          io.to(membership.board.code).emit('membership-updated', {
            boardCode: membership.board.code,
            userId: req.user.id,
            action: 'left',
          });
        } catch (socketError) {
          console.warn('Socket error emitting membership-updated', socketError);
        }
      }
    });

    const successCount = validBoardIds.length;
    const failureCount = boardIds.length - successCount;

    res.status(200).json({
      successCount,
      failureCount,
      results: boardIds.map((id) => ({
        boardId: id,
        success: validBoardIds.includes(id),
      })),
    });
  } catch (error) {
    console.error('❌ Error in bulk leave boards:', error);
    res.status(500).json({ message: 'Error leaving boards' });
  }
};

export const bulkDeleteBoards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boardIds } = req.body as { boardIds: string[] };

    if (!Array.isArray(boardIds) || boardIds.length === 0) {
      res.status(400).json({ message: 'boardIds must be a non-empty array' });
      return;
    }

    // Validate user is admin for all boards
    const boards = await prisma.board.findMany({
      where: { id: { in: boardIds } },
      select: { id: true, code: true, createdBy: true },
    });

    const memberships = await prisma.boardMembership.findMany({
      where: {
        userId: req.user.id,
        boardId: { in: boardIds },
      },
    });

    const validBoardIds: string[] = [];
    const boardMap = new Map(boards.map((b) => [b.id, b]));
    const membershipMap = new Map(memberships.map((m) => [m.boardId, m]));

    for (const boardId of boardIds) {
      const board = boardMap.get(boardId);
      const membership = membershipMap.get(boardId);

      if (!board) continue;

      // Allow deletion if user is the creator (regardless of membership status)
      // OR if user is admin with ACTIVE membership
      const isCreator = board.createdBy === req.user.id;
      const isAdminWithActiveMembership = membership && membership.status === 'ACTIVE' && isAdmin(req.user.id, board, membership);

      if (isCreator || isAdminWithActiveMembership) {
        validBoardIds.push(boardId);
      }
    }

    if (validBoardIds.length === 0) {
      res.status(200).json({ successCount: 0, failureCount: boardIds.length, results: [] });
      return;
    }

    // Delete all in a single transaction
    await prisma.$transaction(
      validBoardIds.flatMap((boardId) => [
        prisma.comment.deleteMany({ where: { boardId } }),
        prisma.boardMembership.deleteMany({ where: { boardId } }),
        prisma.board.delete({ where: { id: boardId } }),
      ])
    );

    // Emit socket events for each deleted board
    const io = getIO();
    validBoardIds.forEach((boardId) => {
      const board = boardMap.get(boardId);
      if (board) {
        try {
          io.to(board.code).emit('board-deleted', {
            boardCode: board.code,
          });
        } catch (socketError) {
          console.warn('Socket error emitting board-deleted', socketError);
        }
      }
    });

    const successCount = validBoardIds.length;
    const failureCount = boardIds.length - successCount;

    res.status(200).json({
      successCount,
      failureCount,
      results: boardIds.map((id) => ({
        boardId: id,
        success: validBoardIds.includes(id),
      })),
    });
  } catch (error) {
    console.error('❌ Error in bulk delete boards:', error);
    res.status(500).json({ message: 'Error deleting boards' });
  }
};
