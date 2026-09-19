import { prisma } from '../db/client';

export type MentionCandidate = { userId: string; name: string; isAdmin: boolean };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pure: which candidates does `content` @-mention? A mention is "@Full Name" (case-insensitive),
 * not followed by another letter/digit, so "@Al" never matches "Alice" and "@Alice" doesn't match "Alicia".
 * The author is never notified about themselves, and a mention in an ADMIN_ONLY message only reaches
 * people who can actually see the message (admins), so nothing leaks to members who can't read it.
 */
export function findMentions(
  content: string,
  candidates: MentionCandidate[],
  opts: { authorId: string; visibility: 'EVERYONE' | 'ADMIN_ONLY' }
): string[] {
  if (!content.includes('@')) return [];
  const found: string[] = [];
  for (const c of candidates) {
    if (c.userId === opts.authorId) continue;
    if (opts.visibility === 'ADMIN_ONLY' && !c.isAdmin) continue;
    const re = new RegExp(`(^|[^\\w])@${escapeRegExp(c.name)}(?![\\p{L}\\p{N}_])`, 'iu');
    if (re.test(content)) found.push(c.userId);
  }
  return found;
}

/** Loads the board's active members and returns the mentioned user ids. */
export async function resolveMentions(params: {
  boardId: string;
  boardCreatedBy: string;
  content: string;
  authorId: string;
  visibility: 'EVERYONE' | 'ADMIN_ONLY';
}): Promise<string[]> {
  if (!params.content.includes('@')) return [];
  const members = await prisma.boardMembership.findMany({
    where: { boardId: params.boardId, status: 'ACTIVE' },
    select: { userId: true, role: true, user: { select: { name: true } } },
  });
  return findMentions(
    params.content,
    members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      isAdmin: m.role === 'ADMIN' || m.userId === params.boardCreatedBy,
    })),
    { authorId: params.authorId, visibility: params.visibility }
  );
}
