// src/socket.ts
import { io } from "socket.io-client";

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

const socket = io(BACKEND, {
  withCredentials: true,
});

export default socket;
