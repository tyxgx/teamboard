import axios from "axios";
import socket, { getSocketConnectionState } from "../socket";
import type { ChatMessage } from "../components/chat/MessageList";

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

export type OutgoingMessage = {
  content: string;
  visibility: "EVERYONE" | "ADMIN_ONLY";
  boardId: string;
  anonymous: boolean;
  clientMessageId: string;
};

type Headers = Readonly<Record<string, string>>;

class RealtimeService {
  private currentRoom: string | null = null;
  private hasJoined = false;
  private queue: OutgoingMessage[] = [];
  private lastHeaders: Headers | null = null;
  private isFlushing = false;
  private pendingJoin: { boardCode: string; userName: string } | null = null;
  private joinRetryCount = 0;
  private maxJoinRetries = 3;

  joinIfNeeded(boardCode: string, userName: string) {
    if (!boardCode || !userName) return;
    
    // If already joined to this room, no action needed
    if (this.currentRoom === boardCode && this.hasJoined) {
      return;
    }
    
    // Check if socket is connected before joining
    if (!getSocketConnectionState()) {
      // Queue join request if socket is not connected
      this.pendingJoin = { boardCode, userName };
      if (import.meta.env.DEV) {
        console.log("[rt] Socket not connected, queuing join for", boardCode);
      }
      return;
    }
    
    // Socket is connected, join immediately
    try {
      socket.emit("join-board", { boardCode, name: userName });
      this.currentRoom = boardCode;
      this.hasJoined = true;
      this.pendingJoin = null;
      this.joinRetryCount = 0;
      if (import.meta.env.DEV) {
        console.log("[rt] join-board emit", boardCode);
      }
    } catch (error) {
      console.error("[rt] Failed to join board:", error);
      this.hasJoined = false;
    }
  }

  rejoinOnConnect(userName: string | undefined | null) {
    if (!userName) return;
    
    // Rejoin current room if exists
    if (this.currentRoom && !this.hasJoined) {
      if (getSocketConnectionState()) {
        try {
          socket.emit("join-board", { boardCode: this.currentRoom, name: userName });
          this.hasJoined = true;
          this.joinRetryCount = 0;
          if (import.meta.env.DEV) {
            console.log("[rt] rejoin on connect", this.currentRoom);
          }
        } catch (error) {
          console.error("[rt] Failed to rejoin on connect:", error);
        }
      }
    }
    
    // Process pending join request
    if (this.pendingJoin && getSocketConnectionState()) {
      const { boardCode, userName: pendingUserName } = this.pendingJoin;
      try {
        socket.emit("join-board", { boardCode, name: pendingUserName });
        this.currentRoom = boardCode;
        this.hasJoined = true;
        this.pendingJoin = null;
        this.joinRetryCount = 0;
        if (import.meta.env.DEV) {
          console.log("[rt] processed pending join", boardCode);
        }
      } catch (error) {
        console.error("[rt] Failed to process pending join:", error);
        this.joinRetryCount++;
        if (this.joinRetryCount < this.maxJoinRetries) {
          // Retry after a short delay
          setTimeout(() => {
            if (getSocketConnectionState()) {
              this.rejoinOnConnect(pendingUserName);
            }
          }, 1000 * this.joinRetryCount);
        }
      }
    }
  }

  clearRoom() {
    this.currentRoom = null;
    this.hasJoined = false;
    this.pendingJoin = null;
    this.joinRetryCount = 0;
  }

  getCurrentRoom() {
    return this.currentRoom;
  }

  getLastHeaders() {
    return this.lastHeaders;
  }

  resetJoinState() {
    this.hasJoined = false;
  }

  async handleSend(payload: OutgoingMessage, headers: Headers) {
    this.lastHeaders = { ...headers };
    this.queue.push(payload);
    await this.flushQueue(headers);
  }

  async flushQueue(headers: Headers) {
    if (this.isFlushing) return;
    this.isFlushing = true;
    try {
      const remaining: OutgoingMessage[] = [];
      while (this.queue.length) {
        const entry = this.queue.shift()!;
        try {
          await axios.post(`${BACKEND}/api/comments`, entry, { headers });
        } catch (error) {
          remaining.push(entry);
          if (import.meta.env.DEV) {
            console.warn("[rt] send failed, will retry", error);
          }
          break;
        }
      }
      this.queue = remaining.concat(this.queue);
    } finally {
      this.isFlushing = false;
    }
  }

  async backfill(
    boardId: string,
    code: string,
    headers: Headers,
    merge: (incoming: ChatMessage[]) => void,
    since?: string
  ) {
    try {
      const url = new URL(`${BACKEND}/api/comments/${boardId}`);
      if (since) {
        url.searchParams.set("since", since);
      }
      const response = await axios.get(url.toString(), { headers });
      const history = (response.data as ChatMessage[]).map((message) => ({
        ...message,
        boardCode: code,
      }));
      merge(history);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[rt] backfill failed", error);
      }
    }
  }
}

const realtimeService = new RealtimeService();

const realtimeServiceConnectHandler = () => {
  realtimeService.resetJoinState();
  if (import.meta.env.DEV) {
    console.log("[rt] socket connected (service)");
  }
  const headers = realtimeService.getLastHeaders();
  if (realtimeService.getCurrentRoom() && headers) {
    void realtimeService.flushQueue(headers);
  }
};

const realtimeServiceDisconnectHandler = () => {
  if (import.meta.env.DEV) {
    console.log("[rt] socket disconnected (service)");
  }
};

export const initRealtimeService = () => {
  socket.off("connect", realtimeServiceConnectHandler);
  socket.off("disconnect", realtimeServiceDisconnectHandler);
  socket.on("connect", realtimeServiceConnectHandler);
  socket.on("disconnect", realtimeServiceDisconnectHandler);
};

export default realtimeService;
