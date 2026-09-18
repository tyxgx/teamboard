import { Prisma } from '@prisma/client';
import { prisma } from '../db/client';

export type BoardAccess = {
  board: { id: string; code: string; createdBy: string };
  active: boolean;
  admin: boolean;
  leftAt: Date | null;
};

/** Loads a board + the caller's membership. Returns null if the board doesn't exist or they were never a member. */
export async function getBoardAccess(userId: string, boardId: string): Promise<BoardAccess | null> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, code: true, createdBy: true },
  });
  if (!board) return null;
  const membership = await prisma.boardMembership.findUnique({
    where: { userId_boardId: { userId, boardId } },
    select: { role: true, status: true, leftAt: true },
  });
  if (!membership) return null;
  const active = membership.status === 'ACTIVE';
  const admin = active && (board.createdBy === userId || membership.role === 'ADMIN');
  return { board, active, admin, leftAt: membership.leftAt };
}

/** Same visibility rule the message list uses: everyone's messages, your own, and (admins only) admin-only ones. */
export function visibleCommentsWhere(userId: string, access: BoardAccess): Prisma.CommentWhereInput {
  const or: Prisma.CommentWhereInput[] = [{ visibility: 'EVERYONE' }, { createdById: userId }];
  if (access.admin) or.push({ visibility: 'ADMIN_ONLY' });
  return { boardId: access.board.id, OR: or };
}

export function canViewComment(
  comment: { visibility: string; createdById: string },
  userId: string,
  admin: boolean
): boolean {
  return comment.visibility === 'EVERYONE' || comment.createdById === userId || admin;
}

/** Real name behind an anonymous message is only ever shown to admins (and the author); everyone else sees "Anonymous". */
export function displaySender(
  c: { anonymous: boolean; createdById: string; createdBy: { name: string } },
  viewerId: string,
  viewerIsAdmin: boolean
): string {
  return c.anonymous && !viewerIsAdmin && c.createdById !== viewerId ? 'Anonymous' : c.createdBy.name;
}
