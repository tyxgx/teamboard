// ✅ STEP 1: Create a socket.ts file and move Socket.io logic there
// File: src/sockets/socket.ts

import { Server } from "socket.io";
import http from "http";

// ✅ Maintain mapping for disconnect events
const userMap = new Map<string, { name: string; boardCode: string }>();

export function setupSocket(server: http.Server) {
  const io = new Server(server, {
    cors: {
      origin: "*", // ❗ Replace with actual Vercel frontend URL in prod
      methods: ["GET", "POST"],
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
      const dataToSend = { message, sender, visibility: visibility || "public", actualSender };
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