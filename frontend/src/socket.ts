// src/socket.ts
import { io } from "socket.io-client";

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

const socket = io(BACKEND, {
  withCredentials: true,
  transports: ["polling", "websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 10000,
});

if (import.meta.env.DEV) {
  socket.on("connect_error", (error) => {
    console.warn("Socket connect_error:", error?.message ?? error);
  });
}

export default socket;
