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
  ioInstance = new Server(server, {
    cors: {
      origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN.split(",").map((s) => s.trim()),
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  const io = getIO();

  io.on("connection", (socket) => {
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      console.log("🔌 New client connected:", socket.id);
    }

    socket.on("join-board", ({ boardCode, name }) => {
      socket.join(boardCode);
      userMap.set(socket.id, { name, boardCode });
      if (isDev) {
        console.log(`📥 ${name} joined board: ${boardCode}`);
      }
      socket.to(boardCode).emit("user-joined", { name });
      socket.emit("joined-room", { boardCode });
    });

    socket.on("send-message", () => {
      // No-op: REST pipeline broadcasts messages to avoid duplicates.
    });

    socket.on("disconnect", () => {
      const user = userMap.get(socket.id);
      if (user) {
        if (isDev) {
          console.log(`❌ ${user.name} disconnected from board: ${user.boardCode}`);
        }
        socket.to(user.boardCode).emit("user-left", { name: user.name });
        userMap.delete(socket.id);
      }
    });
  });
}
