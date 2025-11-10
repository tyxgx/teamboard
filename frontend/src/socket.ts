// src/socket.ts
import { io, Socket } from "socket.io-client";

// Get backend URL with fallback
const BACKEND = (import.meta.env.VITE_BACKEND_URL as string) || "https://teamboard-ohg8.onrender.com";

// Log backend URL for debugging (helpful in production)
if (!import.meta.env.VITE_BACKEND_URL) {
  console.warn("[rt] VITE_BACKEND_URL not set, using fallback:", BACKEND);
} else if (import.meta.env.DEV) {
  console.log("[rt] Backend URL:", BACKEND);
}

let isConnected = false;
let connectionListeners: Array<(connected: boolean) => void> = [];

// Validate backend URL before creating socket
if (!BACKEND || BACKEND.trim() === "") {
  console.error("[rt] CRITICAL: Backend URL is empty! Socket will not connect.");
}

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

// Expose socket for debugging (development and production for diagnostics)
if (typeof window !== "undefined") {
  (window as any).__socket__ = socket;
  (window as any).__socketBackend__ = BACKEND;
}

const updateConnectionState = (connected: boolean) => {
  isConnected = connected;
  connectionListeners.forEach((listener) => listener(connected));
};

socket.on("connect", () => {
  updateConnectionState(true);
  // Always log connection in production for debugging
  console.log("[rt] ✅ Socket connected", socket.id, "to", BACKEND);
});

socket.on("disconnect", (reason) => {
  updateConnectionState(false);
  // Always log disconnects for debugging
  console.warn("[rt] ❌ Socket disconnected:", reason);
});

socket.on("reconnect_attempt", (attempt) => {
  // Log reconnection attempts for debugging
  console.log("[rt] 🔄 Reconnect attempt", attempt);
});

socket.on("reconnect", (attempt) => {
  updateConnectionState(true);
  // Always log successful reconnections
  console.log("[rt] ✅ Reconnected after", attempt, "attempts");
});

socket.on("connect_error", (error) => {
  updateConnectionState(false);
  // Enhanced error logging for debugging
  const errorMsg = error?.message ?? String(error);
  console.error("[rt] ❌ Connection error:", errorMsg);
  console.error("[rt] Backend URL:", BACKEND);
  console.error("[rt] Error details:", error);
  
  // Check for common issues
  if (errorMsg.includes("CORS")) {
    console.error("[rt] ⚠️ CORS issue detected - check FRONTEND_ORIGIN in backend");
  }
  if (errorMsg.includes("timeout") || errorMsg.includes("ECONNREFUSED")) {
    console.error("[rt] ⚠️ Backend might be down or unreachable");
  }
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
