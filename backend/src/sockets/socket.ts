// ✅ STEP 1: Create a socket.ts file and move Socket.io logic there
// File: src/sockets/socket.ts

import { Server } from "socket.io";
import http from "http";

// ✅ Maintain mapping for disconnect events
const userMap = new Map<string, { name: string; boardCode: string }>();

export function setupSocket(server: http.Server) {
  const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
  const io = new Server(server, {
    cors: {
      origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN.split(",").map((s) => s.trim()),
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 New client connected:", socket.id);

    socket.on("join-board", ({ boardCode, name }) => {
      socket.join(boardCode);
      userMap.set(socket.id, { name, boardCode });
      console.log(`📥 ${name} joined board: ${boardCode}`);
      socket.to(boardCode).emit("user-joined", { name });
    });

    socket.on("send-message", ({ boardCode, message, sender, visibility, actualSender }) => {
      // Normalize visibility to match API enums
      const normalizedVisibility = visibility === "ADMIN_ONLY" ? "ADMIN_ONLY" : "EVERYONE";
      const dataToSend = { message, sender, visibility: normalizedVisibility, actualSender };
      io.to(boardCode).emit("receive-message", dataToSend);
    });

    socket.on("disconnect", () => {
      const user = userMap.get(socket.id);
      if (user) {
        console.log(`❌ ${user.name} disconnected from board: ${user.boardCode}`);
        socket.to(user.boardCode).emit("user-left", { name: user.name });
        userMap.delete(socket.id);
      }
    });
  });
}
