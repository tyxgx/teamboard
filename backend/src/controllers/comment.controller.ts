import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { getIO } from '../sockets/socket';
import { canViewComment } from './access';

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

const rtmEnabledFlag = () => process.env.RTM_ENABLED === 'true';

/**
 * Broadcasts a newly-created comment over Socket.io.
 *
 * Two rules that were previously violated and caused a real leak (see CODE_REVIEW.md C2):
 * 1. `actualSender` (the real name behind an "anonymous" comment) is NEVER put on a socket
 *    broadcast. Admins can still see it via the REST fetch, which already gates it correctly
 *    by role — this just stops it also being pushed to every socket in the room in real time.
 * 2. ADMIN_ONLY comments are only emitted to the board's admin room (`${boardCode}:admin`,
 *    joined only by verified admins in socket.ts's `join-board` handler), never to the
 *    general room — previously every member received admin-only content over the socket
 *    even though the REST path correctly hid it from them.
 */
function broadcastNewComment(params: {
  io: ReturnType<typeof getIO>;
  boardCode: string;
  // The legacy (non-realtime) path doesn't load replies/attachments, so those are optional here.
  comment: Omit<CommentWithAuthor, 'parent' | 'attachment'> &
    Partial<Pick<CommentWithAuthor, 'parent' | 'attachment'>>;
  boardActivity: {
    lastActivity: Date;
    lastCommentPreview: string | null;
    lastCommentAt: Date | null;
    lastCommentVisibility: string | null;
    lastCommentAnonymous: boolean;
    lastCommentSenderId: string | null;
  };
  senderId: string;
  clientMessageId: string | null;
}) {
  const { io, boardCode, comment, boardActivity, senderId, clientMessageId } = params;
  const isAdminOnly = comment.visibility === 'ADMIN_ONLY';
  const senderDisplay = comment.anonymous ? 'Anonymous' : comment.createdBy.name;

  const activityPayload = {
    boardCode,
    lastActivity: boardActivity.lastActivity.toISOString(),
    lastCommentPreview: boardActivity.lastCommentPreview,
    lastCommentAt: boardActivity.lastCommentAt ? boardActivity.lastCommentAt.toISOString() : null,
    lastCommentVisibility: boardActivity.lastCommentVisibility,
    lastCommentAnonymous: boardActivity.lastCommentAnonymous,
    lastCommentSenderId: boardActivity.lastCommentSenderId,
    // Never reveal the real name behind an anonymous comment to the whole room.
    lastCommentSenderName: comment.anonymous ? null : senderDisplay,
  };

  const messagePayload = {
    id: comment.id,
    boardCode,
    message: comment.content,
    visibility: comment.visibility,
    sender: senderDisplay,
    createdAt: comment.createdAt.toISOString(),
    senderId,
    clientMessageId,
    replyTo: replyToPreview(comment.parent),
    attachment: comment.attachment ?? null,
  };

  const targetRoom = isAdminOnly ? `${boardCode}:admin` : boardCode;
  io.to(targetRoom).emit('board-activity', activityPayload);
  io.to(targetRoom).emit('receive-message', messagePayload);
  io.to(targetRoom).emit('message:new', { ...messagePayload, clientId: clientMessageId });
}

export const createComment = async (req: Request, res: Response) => {
  const rtmEnabled = rtmEnabledFlag();
  if (!rtmEnabled) {
    return legacyCreateComment(req, res);
  }
  return realtimeCreateComment(req, res);
};

async function legacyCreateComment(req: Request, res: Response) {
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

    // Allow members to create admin-only messages (they can send messages only admins will see)
    // Anonymous mode is always available - no need to check board.anonymousEnabled

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
        lastCommentSenderName: comment.createdBy.name,
      },
      select: {
        code: true,
        lastActivity: true,
        lastCommentAt: true,
        lastCommentPreview: true,
        lastCommentVisibility: true,
        lastCommentAnonymous: true,
        lastCommentSenderId: true,
        lastCommentSenderName: true,
      },
    });

    try {
      const io = getIO();
      const room = updatedBoard.code;

      const roomSockets = await io.in(room).fetchSockets();
      if (roomSockets.length === 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`⚠️ No connected clients in room: ${room}`);
        }
      }

      broadcastNewComment({
        io,
        boardCode: updatedBoard.code,
        comment,
        boardActivity: updatedBoard,
        senderId: req.user.id,
        clientMessageId: clientMessageId ?? null,
      });
    } catch (error) {
      console.error('❌ Socket emit error:', error);
    }

    res.status(201).json({
      ...comment,
      createdAt: comment.createdAt,
      clientMessageId: clientMessageId ?? null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating comment' });
  }
}

const commentInclude = {
  createdBy: { select: { id: true, name: true } },
  parent: {
    select: {
      id: true,
      content: true,
      anonymous: true,
      visibility: true,
      createdById: true,
      createdBy: { select: { name: true } },
    },
  },
  attachment: { select: { id: true, mime: true, size: true } },
} satisfies Prisma.CommentInclude;

type CommentWithAuthor = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

/** Short quote of the replied-to message; the real name behind an anonymous parent is never included. */
function replyToPreview(
  parent: CommentWithAuthor['parent'] | undefined,
  viewer?: { id: string; admin: boolean }
) {
  if (!parent) return null;
  if (viewer && !canViewComment(parent, viewer.id, viewer.admin)) {
    return { id: parent.id, sender: '', snippet: 'Original message unavailable' };
  }
  const revealed = viewer ? !parent.anonymous || viewer.admin || parent.createdById === viewer.id : !parent.anonymous;
  return {
    id: parent.id,
    sender: revealed ? parent.createdBy.name : 'Anonymous',
    snippet: parent.content.trim().slice(0, 120) || '📷 Photo',
  };
}

async function realtimeCreateComment(req: Request, res: Response) {
  const startTime = Date.now();
  const { content, visibility: requestedVisibility, boardId, anonymous = false, clientMessageId, parentId, attachmentId } = req.body;
  let visibility: 'EVERYONE' | 'ADMIN_ONLY' = requestedVisibility;
  const clientId =
    typeof clientMessageId === 'string' && clientMessageId.trim().length > 0
      ? clientMessageId.trim()
      : undefined;

  try {
    const boardQueryStart = Date.now();
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: {
        id: true,
        code: true,
        createdBy: true,
        anonymousEnabled: true,
      },
    });
    const boardQueryTime = Date.now() - boardQueryStart;
    if (boardQueryTime > 100) {
      console.warn(`[perf] Board query took ${boardQueryTime}ms`);
    }

    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    const membershipQueryStart = Date.now();
    const membership = await getMembership(req.user.id, boardId);
    const membershipQueryTime = Date.now() - membershipQueryStart;
    if (membershipQueryTime > 100) {
      console.warn(`[perf] Membership query took ${membershipQueryTime}ms`);
    }

    if (!membership) {
      res.status(403).json({ message: 'You are not a member of this board' });
      return;
    }

    if (membership.status !== 'ACTIVE') {
      res.status(403).json({ message: 'You left this board. Rejoin to post.' });
      return;
    }

    const isAdmin = board.createdBy === req.user.id || membership.role === 'ADMIN';

    // Allow members to create admin-only messages (they can send messages only admins will see)
    // Anonymous mode is always available - no need to check board.anonymousEnabled

    let parentIdToUse: string | undefined;
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, boardId: true, visibility: true, createdById: true },
      });
      // Same "not found" for missing, other-board and hidden parents so admin-only messages can't be probed.
      if (!parent || parent.boardId !== boardId || !canViewComment(parent, req.user.id, isAdmin)) {
        res.status(404).json({ message: 'The message you are replying to was not found' });
        return;
      }
      // A reply to an admin-only message can never be more public than its parent.
      if (parent.visibility === 'ADMIN_ONLY') visibility = 'ADMIN_ONLY';
      parentIdToUse = parent.id;
    }

    let attachmentToUse: string | undefined;
    if (attachmentId) {
      const att = await prisma.attachment.findFirst({
        where: { id: attachmentId, boardId, uploaderId: req.user.id, commentId: null },
        select: { id: true },
      });
      if (!att) {
        res.status(400).json({ message: 'Attachment not found or already used' });
        return;
      }
      attachmentToUse = att.id;
    }

    let comment: CommentWithAuthor | null = null;
    if (clientId) {
      const duplicateCheckStart = Date.now();
      comment = await prisma.comment.findFirst({
        where: { boardId, clientId },
        include: commentInclude,
      });
      const duplicateCheckTime = Date.now() - duplicateCheckStart;
      if (duplicateCheckTime > 100) {
        console.warn(`[perf] Duplicate check query took ${duplicateCheckTime}ms`);
      }
    }

    let createdNew = false;
    if (!comment) {
      try {
        const createStart = Date.now();
        comment = await prisma.comment.create({
          data: {
            content,
            visibility,
            createdById: req.user.id,
            boardId,
            anonymous,
            clientId,
            parentId: parentIdToUse,
          },
          include: commentInclude,
        });
        const createTime = Date.now() - createStart;
        if (createTime > 200) {
          console.warn(`[perf] Comment create took ${createTime}ms`);
        }
        createdNew = true;
        if (attachmentToUse) {
          await prisma.attachment.update({
            where: { id: attachmentToUse },
            data: { commentId: comment.id },
          });
          comment = await prisma.comment.findUniqueOrThrow({
            where: { id: comment.id },
            include: commentInclude,
          });
        }
      } catch (error) {
        if (
          clientId &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          comment = await prisma.comment.findFirst({
            where: { boardId, clientId },
            include: commentInclude,
          });
        } else {
          throw error;
        }
      }
    }

    if (!comment) {
      res.status(500).json({ message: 'Unable to create comment' });
      return;
    }

    const io = getIO();
    const room = board.code;

    if (createdNew) {
      const previewSource = content.trim().length > 0 ? content.trim() : '📷 Photo';
      const preview = previewSource.slice(0, 140);

      const boardUpdateStart = Date.now();
      const updatedBoard = await prisma.board.update({
        where: { id: boardId },
        data: {
          lastActivity: comment.createdAt,
          lastCommentAt: comment.createdAt,
          lastCommentPreview: preview,
          lastCommentVisibility: comment.visibility,
          lastCommentAnonymous: comment.anonymous,
          lastCommentSenderId: req.user.id,
          lastCommentSenderName: comment.createdBy.name,
        },
        select: {
          code: true,
          lastActivity: true,
          lastCommentAt: true,
          lastCommentPreview: true,
          lastCommentVisibility: true,
          lastCommentAnonymous: true,
          lastCommentSenderId: true,
          lastCommentSenderName: true,
        },
      });
      const boardUpdateTime = Date.now() - boardUpdateStart;
      if (boardUpdateTime > 200) {
        console.warn(`[perf] Board update took ${boardUpdateTime}ms`);
      }

      try {
        const roomSockets = await io.in(room).fetchSockets();
        if (roomSockets.length === 0 && process.env.NODE_ENV !== 'production') {
          console.warn(`⚠️ No connected clients in room: ${room}`);
        }

        broadcastNewComment({
          io,
          boardCode: updatedBoard.code,
          comment,
          boardActivity: updatedBoard,
          senderId: req.user.id,
          clientMessageId: clientId ?? null,
        });
      } catch (error) {
        console.error('❌ Socket emit error:', error);
      }
    }

    // Always emit ack so clients can reconcile optimistic messages
    try {
      const roomSockets = await io.in(room).fetchSockets();
      const ackPayload = {
        boardCode: room,
        clientId: clientId ?? null,
        id: comment.id,
        createdAt: comment.createdAt.toISOString(),
      };

      if (process.env.NODE_ENV !== 'production' || process.env.RTM_ENABLED === 'true') {
        console.log(
          `[rtm] Emitting message:ack to room "${room}" (${roomSockets.length} clients)`,
          {
            clientId: clientId ?? null,
            messageId: comment.id,
          }
        );
      }

      io.to(room).emit('message:ack', ackPayload);

      // Also emit to sender's socket directly if they're connected
      if (roomSockets.length === 0 && process.env.NODE_ENV !== 'production') {
        console.warn(`[rtm] ⚠️ No clients in room "${room}" to receive message:ack`);
      }
    } catch (error) {
      console.error('❌ Socket ACK emit error:', error);
    }

    const totalTime = Date.now() - startTime;
    if (totalTime > 1000) {
      console.warn(`[perf] ⚠️ Total comment create took ${totalTime}ms (SLOW)`);
    } else if (totalTime > 500) {
      console.warn(`[perf] Comment create took ${totalTime}ms`);
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`[perf] Comment create took ${totalTime}ms`);
    }

    res.status(createdNew ? 201 : 200).json({
      ...comment,
      clientId: clientId ?? null,
      clientMessageId: clientId ?? null,
      createdAt: comment.createdAt,
      replyTo: replyToPreview(comment.parent, { id: req.user.id, admin: isAdmin }),
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[perf] ❌ Error after ${totalTime}ms:`, error);
    console.error('❌ Error creating realtime comment:', error);
    res.status(500).json({ message: 'Error creating comment' });
  }
}

export const getComments = async (req: Request, res: Response) => {
  const rtmEnabled = rtmEnabledFlag();
  if (!rtmEnabled) {
    return legacyGetComments(req, res);
  }
  const { boardId } = req.params as { boardId: string };
  const ctxResult = await resolveBoardContextById(boardId, req.user.id);
  if (!ctxResult.ok) {
    res.status(ctxResult.status).json({ message: ctxResult.message });
    return;
  }
  await respondWithRealtimeComments(req, res, ctxResult.context);
};

type BoardContext = {
  boardId: string;
  boardCode: string;
  admin: boolean;
  leftCutoff: Date | null;
  baseWhere: Prisma.CommentWhereInput;
};

type BoardContextResult =
  { ok: true; context: BoardContext } | { ok: false; status: number; message: string };

const firstQueryValue = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return value.length > 0 ? firstQueryValue(value[0]) : undefined;
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value);
};

const parseDateParam = (raw?: string | null): Date | null => {
  if (!raw) return null;
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

async function resolveBoardContextById(
  boardId: string,
  userId: string
): Promise<BoardContextResult> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, code: true, createdBy: true },
  });
  if (!board) {
    return { ok: false, status: 404, message: 'Board not found' };
  }
  return resolveBoardContext(board, userId);
}

async function resolveBoardContextByCode(
  boardCode: string,
  userId: string
): Promise<BoardContextResult> {
  const board = await prisma.board.findUnique({
    where: { code: boardCode },
    select: { id: true, code: true, createdBy: true },
  });
  if (!board) {
    return { ok: false, status: 404, message: 'Board not found' };
  }
  return resolveBoardContext(board, userId);
}

async function resolveBoardContext(
  board: { id: string; code: string; createdBy: string },
  userId: string
): Promise<BoardContextResult> {
  const membership = await getMembership(userId, board.id);
  if (!membership) {
    return { ok: false, status: 403, message: 'You are not a member of this board' };
  }

  const isLeft = membership.status === 'LEFT';
  const leftCutoff = isLeft && membership.leftAt ? membership.leftAt : null;
  const admin = !isLeft && (board.createdBy === userId || membership.role === 'ADMIN');

  const orClauses: Prisma.CommentWhereInput[] = [
    { visibility: 'EVERYONE' },
    { createdById: userId },
  ];
  if (admin) {
    orClauses.push({ visibility: 'ADMIN_ONLY' });
  }

  const baseWhere: Prisma.CommentWhereInput = {
    boardId: board.id,
    OR: orClauses,
  };

  return {
    ok: true,
    context: {
      boardId: board.id,
      boardCode: board.code,
      admin,
      leftCutoff,
      baseWhere,
    },
  };
}

async function respondWithRealtimeComments(req: Request, res: Response, ctx: BoardContext) {
  const limitRaw = firstQueryValue(req.query.limit);
  const cursorRaw = firstQueryValue(req.query.cursor);
  const beforeRaw = firstQueryValue(req.query.before);
  const cursorIdRaw = firstQueryValue(req.query.cursorId);
  const offsetRaw = firstQueryValue(req.query.offset);
  const sinceRaw = firstQueryValue(req.query.since);

  const limit = Math.min(parseInt(String(limitRaw ?? '50'), 10) || 50, 100);
  const cursorDate = parseDateParam(cursorRaw ?? null);
  const beforeDate = parseDateParam(beforeRaw ?? null);
  const sinceDate = parseDateParam(sinceRaw ?? null);
  const offset = beforeDate || cursorDate ? 0 : parseInt(String(offsetRaw ?? '0'), 10) || 0;

  const where: Prisma.CommentWhereInput = {
    ...ctx.baseWhere,
    OR: Array.isArray(ctx.baseWhere.OR) ? [...ctx.baseWhere.OR] : ctx.baseWhere.OR,
  };
  if (ctx.baseWhere.AND) {
    where.AND = Array.isArray(ctx.baseWhere.AND) ? [...ctx.baseWhere.AND] : [ctx.baseWhere.AND];
  }

  const andFilters: Prisma.CommentWhereInput[] = [];

  if (sinceDate) {
    andFilters.push({ createdAt: { gt: sinceDate } });
  }
  if (ctx.leftCutoff) {
    andFilters.push({ createdAt: { lte: ctx.leftCutoff } });
  }
  if (cursorDate) {
    if (cursorIdRaw) {
      andFilters.push({
        OR: [
          { createdAt: { gt: cursorDate } },
          {
            AND: [{ createdAt: { equals: cursorDate } }, { id: { gt: cursorIdRaw } }],
          },
        ],
      });
    } else {
      andFilters.push({ createdAt: { gt: cursorDate } });
    }
  }
  if (beforeDate) {
    if (cursorIdRaw) {
      andFilters.push({
        OR: [
          { createdAt: { lt: beforeDate } },
          {
            AND: [{ createdAt: { equals: beforeDate } }, { id: { lt: cursorIdRaw } }],
          },
        ],
      });
    } else {
      andFilters.push({ createdAt: { lt: beforeDate } });
    }
  }

  if (andFilters.length) {
    const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [...existingAnd, ...andFilters];
  }

  const orderBy = beforeDate
    ? [{ createdAt: 'desc' as const }, { id: 'desc' as const }]
    : [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

  const total =
    !beforeDate && !cursorDate && offset > 0 ? await prisma.comment.count({ where }) : undefined;

  const comments = await prisma.comment.findMany({
    where,
    include: commentInclude,
    orderBy,
    take: limit,
    skip: beforeDate || cursorDate ? 0 : offset,
  });

  if (beforeDate) {
    comments.reverse();
  }

  const shaped = comments.map((c) => {
    const isOwn = c.createdById === req.user.id;
    const maskedToOthers = c.anonymous && !ctx.admin && !isOwn;
    const sender = maskedToOthers ? 'Anonymous' : c.createdBy.name;
    const actualSender = c.anonymous && ctx.admin ? c.createdBy.name : undefined;
    return {
      id: c.id,
      message: c.content,
      visibility: c.visibility as 'EVERYONE' | 'ADMIN_ONLY',
      sender,
      actualSender,
      createdAt: c.createdAt,
      userId: c.createdById,
      senderId: c.createdById,
      clientMessageId: c.clientId ?? null,
      replyTo: replyToPreview(c.parent, { id: req.user.id, admin: ctx.admin }),
      attachment: c.attachment,
    };
  });

  const lastComment = shaped.length > 0 ? shaped[shaped.length - 1] : null;
  const nextCursor = lastComment?.createdAt ? new Date(lastComment.createdAt).toISOString() : null;
  const nextCursorId = lastComment?.id ?? null;
  const hasMore = shaped.length === limit;

  const payload: Record<string, unknown> = {
    comments: shaped,
    limit,
    hasMore,
    cursor: nextCursor,
    cursorId: nextCursorId,
  };

  if (!beforeDate && !cursorDate) {
    payload.offset = offset;
    if (total !== undefined) {
      payload.total = total;
    }
  }

  res.json(payload);
}

async function legacyGetComments(req: Request, res: Response) {
  try {
    const { boardId } = req.params as { boardId: string };

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { createdBy: true },
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

    const isLeft = membership.status === 'LEFT';
    const leftCutoff = isLeft && membership.leftAt ? membership.leftAt : null;
    const admin = !isLeft && (board.createdBy === req.user.id || membership.role === 'ADMIN');

    const orClauses: any[] = [{ visibility: 'EVERYONE' }, { createdById: req.user.id }];
    if (admin) {
      orClauses.push({ visibility: 'ADMIN_ONLY' });
    }

    const sinceRaw = firstQueryValue(req.query.since);
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

    const limitRaw = firstQueryValue(req.query.limit);
    const cursorRaw = firstQueryValue(req.query.cursor);
    const offsetRaw = firstQueryValue(req.query.offset);
    const limit = Math.min(parseInt(String(limitRaw || '50'), 10) || 50, 100);

    let cursorDate: Date | null = null;
    if (cursorRaw) {
      const parsed = new Date(String(cursorRaw));
      if (!Number.isNaN(parsed.getTime())) {
        cursorDate = parsed;
      }
    }

    const offset = cursorDate ? 0 : parseInt(String(offsetRaw || '0'), 10) || 0;

    if (cursorDate) {
      commentWhere.createdAt = {
        ...commentWhere.createdAt,
        gt: cursorDate,
      };
    }

    const total = offset > 0 ? await prisma.comment.count({ where: commentWhere }) : undefined;

    const comments = await prisma.comment.findMany({
      where: commentWhere,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      ...(cursorDate ? {} : { skip: offset }),
    });

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
        clientMessageId: c.clientId ?? null,
      };
    });

    const lastComment = shaped.length > 0 ? shaped[shaped.length - 1] : null;
    const nextCursor = lastComment?.createdAt
      ? new Date(lastComment.createdAt).toISOString()
      : null;
    const hasMore = shaped.length === limit;

    res.json({
      comments: shaped,
      ...(total !== undefined && { total }),
      limit,
      ...(cursorDate ? { cursor: nextCursor, hasMore } : { offset }),
    });
  } catch (error) {
    console.error('❌ Error fetching comments:', error);
    res.status(500).json({ message: 'Error fetching comments' });
  }
}

async function legacyGetCommentsByCode(req: Request, res: Response) {
  try {
    const { boardCode } = req.params as { boardCode: string };

    const board = await prisma.board.findUnique({
      where: { code: boardCode },
      select: { id: true, createdBy: true },
    });
    if (!board) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }

    const membership = await getMembership(req.user.id, board.id);
    if (!membership) {
      res.status(403).json({ message: 'You are not a member of this board' });
      return;
    }

    const isLeft = membership.status === 'LEFT';
    const leftCutoff = isLeft && membership.leftAt ? membership.leftAt : null;
    const admin = !isLeft && (board.createdBy === req.user.id || membership.role === 'ADMIN');

    const orClauses: any[] = [{ visibility: 'EVERYONE' }, { createdById: req.user.id }];
    if (admin) {
      orClauses.push({ visibility: 'ADMIN_ONLY' });
    }

    const sinceRaw = firstQueryValue(req.query.since);
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
      boardId: board.id,
      OR: orClauses,
    };

    if (Object.keys(createdAtFilter).length > 0) {
      commentWhere.createdAt = createdAtFilter;
    }

    const limitRaw = firstQueryValue(req.query.limit);
    const offsetRaw = firstQueryValue(req.query.offset);
    const limit = Math.min(parseInt(String(limitRaw || '50'), 10) || 50, 100);
    const offset = parseInt(String(offsetRaw || '0'), 10) || 0;

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
        clientMessageId: c.clientId ?? null,
      };
    });

    res.json({
      comments: shaped,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('❌ Error fetching comments by code:', error);
    res.status(500).json({ message: 'Error fetching comments' });
  }
}

// TASK 1.3: New endpoint to get comments by boardCode (enables parallel fetch with board details)
export const getCommentsByCode = async (req: Request, res: Response) => {
  const rtmEnabled = rtmEnabledFlag();
  if (!rtmEnabled) {
    return legacyGetCommentsByCode(req, res);
  }
  const { boardCode } = req.params as { boardCode: string };
  const ctxResult = await resolveBoardContextByCode(boardCode, req.user.id);
  if (!ctxResult.ok) {
    res.status(ctxResult.status).json({ message: ctxResult.message });
    return;
  }
  await respondWithRealtimeComments(req, res, ctxResult.context);
};
