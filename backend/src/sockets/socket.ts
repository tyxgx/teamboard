// ✅ STEP 1: Create a socket.ts file and move Socket.io logic there
// File: src/sockets/socket.ts

import { Server } from "socket.io";
import http from "http";

// ✅ Maintain mapping for disconnect events
const userMap = new Map<string, { name: string; boardCode: string }>();

let ioInstance: Server | null = null;

export function getIO() {
  if (!ioInstance) {
    throw new Error("Socket.io has not been initialised. Call setupSocket first.");
  }
  return ioInstance;
}

export function setupSocket(server: http.Server) {
  const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
  const LOG_LEVEL = process.env.SOCKET_LOG_LEVEL || (process.env.NODE_ENV === "production" ? "error" : "debug");
  
  ioInstance = new Server(server, {
    cors: {
      origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN.split(",").map((s) => s.trim()),
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 20000,
    pingInterval: 25000,
    allowEIO3: true,
  });

  const io = getIO();

  io.on("connection", (socket) => {
    const isDev = process.env.NODE_ENV !== "production";
    const shouldLog = LOG_LEVEL === "debug" || isDev;
    
    if (shouldLog) {
      console.log("🔌 New client connected:", socket.id);
    }

    socket.on("join-board", ({ boardCode, name }) => {
      socket.join(boardCode);
      userMap.set(socket.id, { name, boardCode });
      if (shouldLog) {
        console.log(`📥 ${name} joined board: ${boardCode}`);
      }
      socket.to(boardCode).emit("user-joined", { name });
      if (process.env.RTM_ENABLED === "true") {
        socket.to(boardCode).emit("system:join", { name, boardCode, at: new Date().toISOString() });
      }
      socket.emit("joined-room", { boardCode });
    });

    socket.on("send-message", () => {
      // No-op: REST pipeline broadcasts messages to avoid duplicates.
    });

    socket.on("disconnect", (reason) => {
      const user = userMap.get(socket.id);
      if (user) {
        if (shouldLog) {
          console.log(`❌ ${user.name} disconnected from board: ${user.boardCode}, reason: ${reason}`);
        }
        socket.to(user.boardCode).emit("user-left", { name: user.name });
        if (process.env.RTM_ENABLED === "true") {
          socket.to(user.boardCode).emit("system:leave", { name: user.name, boardCode: user.boardCode, at: new Date().toISOString() });
        }
        userMap.delete(socket.id);
      }
    });

    socket.on("read:upto", (payload: { boardCode: string; cursor?: string; cursorId?: string }) => {
      if (process.env.RTM_ENABLED !== "true") return;
      const { boardCode, cursor, cursorId } = payload || {};
      if (!boardCode) return;
      socket.to(boardCode).emit("read:upto", { boardCode, cursor: cursor ?? null, cursorId: cursorId ?? null, at: new Date().toISOString() });
    });
  });
  
  // Log connection errors
  io.engine.on("connection_error", (err) => {
    if (LOG_LEVEL === "debug" || process.env.NODE_ENV !== "production") {
      console.error("Socket.io connection error:", err);
    }
  });
}

export function isSocketConnected(): boolean {
  if (!ioInstance) return false;
  return ioInstance.sockets.sockets.size > 0;
}

export function getConnectedClientsCount(): number {
  if (!ioInstance) return 0;
  return ioInstance.sockets.sockets.size;
}
