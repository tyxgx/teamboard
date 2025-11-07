// src/socket.ts
import { io } from "socket.io-client";

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

const socket = io(BACKEND, {
  withCredentials: true,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 10000,
});

if (import.meta.env.DEV) {
  socket.on("connect", () => {
    console.log("[rt] socket connected", socket.id);
  });
  socket.on("disconnect", (reason) => {
    console.log("[rt] socket disconnected", reason);
  });
  socket.on("reconnect_attempt", (attempt) => {
    console.log("[rt] reconnect attempt", attempt);
  });
  socket.on("reconnect", (attempt) => {
    console.log("[rt] reconnected", attempt);
  });
  socket.on("connect_error", (error) => {
    console.warn("[rt] connect_error:", error?.message ?? error);
  });
}

export default socket;
