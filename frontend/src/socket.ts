// src/socket.ts
import { io, Socket } from "socket.io-client";

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

let isConnected = false;
let connectionListeners: Array<(connected: boolean) => void> = [];

const socket: Socket = io(BACKEND, {
  withCredentials: true,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  forceNew: false,
});

const updateConnectionState = (connected: boolean) => {
  isConnected = connected;
  connectionListeners.forEach((listener) => listener(connected));
};

socket.on("connect", () => {
  updateConnectionState(true);
  if (import.meta.env.DEV) {
    console.log("[rt] socket connected", socket.id);
  }
});

socket.on("disconnect", (reason) => {
  updateConnectionState(false);
  if (import.meta.env.DEV) {
    console.log("[rt] socket disconnected", reason);
  }
});

socket.on("reconnect_attempt", (attempt) => {
  if (import.meta.env.DEV) {
    console.log("[rt] reconnect attempt", attempt);
  }
});

socket.on("reconnect", (attempt) => {
  updateConnectionState(true);
  if (import.meta.env.DEV) {
    console.log("[rt] reconnected", attempt);
  }
});

socket.on("connect_error", (error) => {
  updateConnectionState(false);
  // Log connection errors even in production for debugging
  console.warn("[rt] connect_error:", error?.message ?? error);
});

export function getSocketConnectionState(): boolean {
  return isConnected && socket.connected;
}

export function onConnectionChange(listener: (connected: boolean) => void): () => void {
  connectionListeners.push(listener);
  // Return cleanup function
  return () => {
    connectionListeners = connectionListeners.filter((l) => l !== listener);
  };
}

export default socket;
