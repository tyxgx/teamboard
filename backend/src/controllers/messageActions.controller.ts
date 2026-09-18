import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { getIO } from '../sockets/socket';
import { canViewComment, getBoardAccess } from './access';

/**
 * The board list shows a preview of the latest message. If that exact message was edited or
 * deleted, recompute the preview from what is left, so removed text doesn't linger in every
 * member's sidebar. Runs only when the touched message was the board's latest.
 */
async function refreshBoardPreviewIfLatest(boardId: string, boardCode: string, touchedCreatedAt: Date) {
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { lastCommentAt: true } });
  if (!board?.lastCommentAt || board.lastCommentAt.getTime() !== touchedCreatedAt.getTime()) return;
  const latest = await prisma.comment.findFirst({
    where: { boardId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { createdBy: { select: { name: true } } },
  });
  const data = latest
    ? {
        lastCommentAt: latest.createdAt,
        lastCommentPreview: (latest.content.trim() || '📷 Photo').slice(0, 140),
        lastCommentVisibility: latest.visibility,
        lastCommentAnonymous: latest.anonymous,
        lastCommentSenderId: latest.createdById,
        lastCommentSenderName: latest.createdBy.name,
      }
    : {
        lastCommentAt: null,
        lastCommentPreview: null,
        lastCommentVisibility: null,
        lastCommentAnonymous: false,
        lastCommentSenderId: null,
        lastCommentSenderName: null,
      };
  const updated = await prisma.board.update({ where: { id: boardId }, data });
  try {
    // Same payload shape as a new message's board-activity; admin-only previews stay in the admin room.
    getIO()
      .to(updated.lastCommentVisibility === 'ADMIN_ONLY' ? `${boardCode}:admin` : boardCode)
      .emit('board-activity', {
        boardCode,
        lastActivity: updated.lastActivity.toISOString(),
        lastCommentPreview: updated.lastCommentPreview,
        lastCommentAt: updated.lastCommentAt ? updated.lastCommentAt.toISOString() : null,
        lastCommentVisibility: updated.lastCommentVisibility,
        lastCommentAnonymous: updated.lastCommentAnonymous,
        lastCommentSenderId: updated.lastCommentSenderId,
        lastCommentSenderName: updated.lastCommentAnonymous ? null : updated.lastCommentSenderName,
      });
  } catch (socketError) {
    console.warn('Socket not ready for board-activity refresh', socketError);
  }
}

const room = (boardCode: string, adminOnly: boolean) => (adminOnly ? `${boardCode}:admin` : boardCode);

/**
 * PATCH /api/messages/:commentId  { content }
 * Only the author can edit, and only while still an active member. Visibility, anonymity and
 * sender are never changed by an edit, so the socket payload carries just the new text.
 */
export const editMessage = async (req: Request, res: Response) => {
  const commentId = String(req.params.commentId);
  const content = req.body?.content;
  if (typeof content !== 'string' || content.length > 5000) {
    res.status(400).json({ message: 'Message must be 5000 characters or fewer' });
    return;
  }
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        boardId: true,
        visibility: true,
        createdById: true,
        createdAt: true,
        attachment: { select: { id: true } },
      },
    });
    if (!comment) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }
    const access = await getBoardAccess(req.user.id, comment.boardId);
    if (!access || !access.active || !canViewComment(comment, req.user.id, access.admin)) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }
    if (comment.createdById !== req.user.id) {
      res.status(403).json({ message: 'You can only edit your own messages' });
      return;
    }
    if (content.trim().length === 0 && !comment.attachment) {
      res.status(400).json({ message: 'Message cannot be empty' });
      return;
    }
    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { content, editedAt: new Date() },
      select: { id: true, content: true, editedAt: true },
    });
    await refreshBoardPreviewIfLatest(comment.boardId, access.board.code, comment.createdAt);
    try {
      getIO()
        .to(room(access.board.code, comment.visibility === 'ADMIN_ONLY'))
        .emit('message:edited', {
          boardCode: access.board.code,
          id: updated.id,
          message: updated.content,
          editedAt: updated.editedAt?.toISOString() ?? null,
        });
    } catch (socketError) {
      console.warn('Socket not ready for message:edited', socketError);
    }
    res.json({ id: updated.id, message: updated.content, editedAt: updated.editedAt });
  } catch (error) {
    console.error('editMessage failed', error);
    res.status(500).json({ message: 'Unable to edit message' });
  }
};

/** DELETE /api/messages/:commentId — the author, or a board admin (moderation), may delete. */
export const deleteMessage = async (req: Request, res: Response) => {
  const commentId = String(req.params.commentId);
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, boardId: true, visibility: true, createdById: true, createdAt: true },
    });
    if (!comment) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }
    const access = await getBoardAccess(req.user.id, comment.boardId);
    if (!access || !access.active || !canViewComment(comment, req.user.id, access.admin)) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }
    if (comment.createdById !== req.user.id && !access.admin) {
      res.status(403).json({ message: 'Only the author or a board admin can delete this message' });
      return;
    }
    // Reactions and the attachment cascade; replies keep existing with their quote cleared (parentId -> null).
    await prisma.comment.delete({ where: { id: commentId } });
    await refreshBoardPreviewIfLatest(comment.boardId, access.board.code, comment.createdAt);
    try {
      getIO()
        .to(room(access.board.code, comment.visibility === 'ADMIN_ONLY'))
        .emit('message:deleted', { boardCode: access.board.code, id: commentId });
    } catch (socketError) {
      console.warn('Socket not ready for message:deleted', socketError);
    }
    res.status(204).end();
  } catch (error) {
    console.error('deleteMessage failed', error);
    res.status(500).json({ message: 'Unable to delete message' });
  }
};
