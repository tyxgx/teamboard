// ✅ STEP 1: Create a socket.ts file and move Socket.io logic there
// File: src/sockets/socket.ts

import { Server, Socket } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/client';

const JWT_SECRET = process.env.JWT_SECRET!;

interface JwtPayload {
  userId: string;
}

// ✅ Maintain mapping for disconnect events
const userMap = new Map<string, { name: string; boardCode: string }>();

// Typing indicators are throttled server-side too, so a misbehaving client can't flood a room.
const TYPING_MIN_INTERVAL_MS = 1000;
const lastTypingAt = new Map<string, number>();

let ioInstance: Server | null = null;

/**
 * Verifies the socket's JWT (attached client-side as `auth: { token }`, see frontend/src/socket.ts)
 * and returns the authenticated userId, or null if missing/invalid.
 */
function getAuthenticatedUserId(socket: Socket): string | null {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Looks up whether `userId` is an ACTIVE member of the board identified by `boardCode`,
 * and whether they're an admin (board creator or ADMIN role). Returns null if not a member
 * at all — callers must reject the join in that case (see CODE_REVIEW.md C2: previously
 * `join-board` had no auth/membership check at all, letting anyone who knew a board's invite
 * code silently listen to its live messages, including admin-only ones).
 */
async function verifyBoardAccess(
  userId: string,
  boardCode: string
): Promise<{ isAdmin: boolean } | null> {
  const board = await prisma.board.findUnique({
    where: { code: boardCode },
    select: { id: true, createdBy: true },
  });
  if (!board) return null;

  const membership = await prisma.boardMembership.findUnique({
    where: { userId_boardId: { userId, boardId: board.id } },
    select: { role: true, status: true },
  });
  if (!membership || membership.status !== 'ACTIVE') return null;

  return { isAdmin: board.createdBy === userId || membership.role === 'ADMIN' };
}

export function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.io has not been initialised. Call setupSocket first.');
  }
  return ioInstance;
}

export function setupSocket(server: http.Server) {
  const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
  const LOG_LEVEL =
    process.env.SOCKET_LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'error' : 'debug');

  // Log CORS configuration for debugging
  const corsOrigins =
    FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN.split(',').map((s) => s.trim());
  if (process.env.NODE_ENV !== 'production' || LOG_LEVEL === 'debug') {
    console.log('[socket] CORS origins:', corsOrigins);
    console.log('[socket] FRONTEND_ORIGIN env:', FRONTEND_ORIGIN);
  }

  ioInstance = new Server(server, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
      // Explicitly allow WebSocket upgrades
      allowedHeaders: ['Authorization', 'Content-Type'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
    allowEIO3: true,
    // Enable CORS for WebSocket handshake
    allowUpgrades: true,
  });

  const io = getIO();

  io.on('connection', (socket) => {
    const isDev = process.env.NODE_ENV !== 'production';
    const shouldLog = LOG_LEVEL === 'debug' || isDev;

    if (shouldLog) {
      console.log('🔌 New client connected:', socket.id);
    }

    socket.on('join-board', async ({ boardCode, name }) => {
      try {
        if (!boardCode || typeof boardCode !== 'string') {
          socket.emit('join-error', { message: 'boardCode is required' });
          return;
        }

        const userId = getAuthenticatedUserId(socket);
        if (!userId) {
          socket.emit('join-error', { message: 'Unauthorized: missing or invalid token' });
          return;
        }

        const access = await verifyBoardAccess(userId, boardCode);
        if (!access) {
          socket.emit('join-error', { message: 'You are not a member of this board' });
          return;
        }

        socket.join(boardCode);
        if (access.isAdmin) {
          // Admins additionally join a board-scoped admin room so admin-only comments
          // (and, previously, de-anonymized sender names) can be routed to just them —
          // see comment.controller.ts's broadcastNewComment.
          socket.join(`${boardCode}:admin`);
        }
        userMap.set(socket.id, { name, boardCode });
        if (shouldLog) {
          console.log(`📥 ${name} joined board: ${boardCode}`);
        }
        socket.to(boardCode).emit('user-joined', { name });
        if (process.env.RTM_ENABLED === 'true') {
          socket
            .to(boardCode)
            .emit('system:join', { name, boardCode, at: new Date().toISOString() });
        }
        socket.emit('joined-room', { boardCode });
      } catch (err) {
        console.error('[socket] join-board error:', err);
        socket.emit('join-error', { message: 'Failed to join board' });
      }
    });

    socket.on('send-message', () => {
      // No-op: REST pipeline broadcasts messages to avoid duplicates.
    });

    // Ephemeral typing indicator: socket-only, nothing is stored. The sender must already be in the
    // room (join-board verified membership). Name is only revealed when the client explicitly says it
    // is NOT typing anonymously; anything else is broadcast as an anonymous "someone".
    socket.on('typing', (payload: { boardCode?: string; anonymous?: boolean }) => {
      const boardCode = payload?.boardCode;
      if (!boardCode || typeof boardCode !== 'string' || !socket.rooms.has(boardCode)) return;
      const now = Date.now();
      if (now - (lastTypingAt.get(socket.id) ?? 0) < TYPING_MIN_INTERVAL_MS) return;
      lastTypingAt.set(socket.id, now);
      const name = payload.anonymous === false ? (userMap.get(socket.id)?.name ?? null) : null;
      socket.to(boardCode).emit('typing', { boardCode, name });
    });

    socket.on('disconnect', (reason) => {
      lastTypingAt.delete(socket.id);
      const user = userMap.get(socket.id);
      if (user) {
        if (shouldLog) {
          console.log(
            `❌ ${user.name} disconnected from board: ${user.boardCode}, reason: ${reason}`
          );
        }
        socket.to(user.boardCode).emit('user-left', { name: user.name });
        if (process.env.RTM_ENABLED === 'true') {
          socket.to(user.boardCode).emit('system:leave', {
            name: user.name,
            boardCode: user.boardCode,
            at: new Date().toISOString(),
          });
        }
        userMap.delete(socket.id);
      }
    });

    socket.on('read:upto', (payload: { boardCode: string; cursor?: string; cursorId?: string }) => {
      if (process.env.RTM_ENABLED !== 'true') return;
      const { boardCode, cursor, cursorId } = payload || {};
      if (!boardCode) return;
      socket.to(boardCode).emit('read:upto', {
        boardCode,
        cursor: cursor ?? null,
        cursorId: cursorId ?? null,
        at: new Date().toISOString(),
      });
    });
  });

  // Log connection errors (always log for debugging)
  io.engine.on('connection_error', (err) => {
    console.error('[socket] ❌ Connection error:', err.message || err);
    if (err.message?.includes('CORS')) {
      console.error('[socket] ⚠️ CORS error - check FRONTEND_ORIGIN includes client origin');
    }
  });

  // Log successful setup
  console.log('[socket] ✅ Socket.io server initialized');
  console.log('[socket] Transports:', ['websocket', 'polling']);
  console.log('[socket] RTM enabled:', process.env.RTM_ENABLED === 'true');
}

export function isSocketConnected(): boolean {
  if (!ioInstance) return false;
  return ioInstance.sockets.sockets.size > 0;
}

export function getConnectedClientsCount(): number {
  if (!ioInstance) return 0;
  return ioInstance.sockets.sockets.size;
}
