import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { getIO } from '../sockets/socket';

async function getMembership(userId: string, boardId: string) {
  return prisma.boardMembership.findUnique({
    where: { userId_boardId: { userId, boardId } },
    select: {
      role: true,
      status: true,
      leftAt: true,
    },
  });
}

export const createComment = async (req: Request, res: Response) => {
  try {
    const { content, visibility, boardId, anonymous = false, clientMessageId } = req.body;

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, code: true, createdBy: true, anonymousEnabled: true, lastActivity: true },
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

    if (membership.status !== 'ACTIVE') {
      res.status(403).json({ message: 'You left this board. Rejoin to post.' });
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

    const previewSource = content.trim().length > 0 ? content.trim() : content;
    const preview = previewSource.slice(0, 140);

    const updatedBoard = await prisma.board.update({
      where: { id: boardId },
      data: {
        lastActivity: comment.createdAt,
        lastCommentAt: comment.createdAt,
        lastCommentPreview: preview,
        lastCommentVisibility: comment.visibility,
        lastCommentAnonymous: comment.anonymous,
        lastCommentSenderId: req.user.id,
      },
      select: {
        code: true,
        lastActivity: true,
        lastCommentAt: true,
        lastCommentPreview: true,
        lastCommentVisibility: true,
        lastCommentAnonymous: true,
        lastCommentSenderId: true,
      },
    });

    try {
      const io = getIO();
      const room = updatedBoard.code;
      
      // Verify there are connected clients before emitting
      const roomSockets = await io.in(room).fetchSockets();
      if (roomSockets.length === 0) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`⚠️ No connected clients in room: ${room}`);
        }
      }
      
      const senderDisplay = comment.anonymous ? 'Anonymous' : comment.createdBy.name;
      const actualSender = comment.anonymous ? comment.createdBy.name : undefined;

      // Emit board activity update
      io.to(room).emit('board-activity', {
        boardCode: updatedBoard.code,
        lastActivity: updatedBoard.lastActivity.toISOString(),
        lastCommentPreview: updatedBoard.lastCommentPreview,
        lastCommentAt: updatedBoard.lastCommentAt ? updatedBoard.lastCommentAt.toISOString() : null,
        lastCommentVisibility: updatedBoard.lastCommentVisibility,
        lastCommentAnonymous: updatedBoard.lastCommentAnonymous,
        lastCommentSenderId: updatedBoard.lastCommentSenderId,
        lastCommentSenderName: comment.createdBy.name,
      });

      // Emit message with delivery verification
      io.to(room).emit('receive-message', {
        id: comment.id,
        boardCode: updatedBoard.code,
        message: comment.content,
        visibility: comment.visibility,
        sender: senderDisplay,
        actualSender,
        createdAt: comment.createdAt.toISOString(),
        senderId: req.user.id,
        clientMessageId: clientMessageId ?? null,
      });
      
      if (process.env.NODE_ENV !== "production") {
        console.log(`📤 Emitted message to room ${room}, ${roomSockets.length} clients`);
      }
    } catch (error) {
      console.error('❌ Socket emit error:', error);
      // Don't fail the request if socket emit fails - message is already saved
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

    const isLeft = membership.status === 'LEFT';
    const leftCutoff = isLeft && membership.leftAt ? membership.leftAt : null;
    const admin = !isLeft && (board.createdBy === req.user.id || membership.role === 'ADMIN');

    const orClauses: any[] = [
      { visibility: 'EVERYONE' },
      { createdById: req.user.id },
    ];
    if (admin) {
      orClauses.push({ visibility: 'ADMIN_ONLY' });
    }

    const sinceRaw = Array.isArray(req.query.since) ? req.query.since[0] : req.query.since;
    let sinceDate: Date | null = null;
    if (sinceRaw) {
      const parsed = new Date(String(sinceRaw));
      if (!Number.isNaN(parsed.getTime())) {
        sinceDate = parsed;
      }
    }

    const createdAtFilter: { gt?: Date; lte?: Date } = {};
    if (sinceDate) {
      createdAtFilter.gt = sinceDate;
    }
    if (leftCutoff) {
      createdAtFilter.lte = leftCutoff;
    }

    const commentWhere: any = {
      boardId,
      OR: orClauses,
    };

    if (Object.keys(createdAtFilter).length > 0) {
      commentWhere.createdAt = createdAtFilter;
    }

    // Parse pagination params
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const offsetRaw = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
    const limit = Math.min(parseInt(String(limitRaw || '100'), 10) || 100, 100);
    const offset = parseInt(String(offsetRaw || '0'), 10) || 0;

    // Get total count for pagination metadata
    const total = await prisma.comment.count({ where: commentWhere });

    const comments = await prisma.comment.findMany({
      where: commentWhere,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
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

    // Return backward-compatible response with pagination metadata
    res.json({
      comments: shaped,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('❌ Error fetching comments:', error);
    res.status(500).json({ message: 'Error fetching comments' });
  }
};
