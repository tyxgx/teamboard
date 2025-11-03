import axios from "axios";
import socket from "../socket";
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

  joinIfNeeded(boardCode: string, userName: string) {
    if (!boardCode || !userName) return;
    if (this.currentRoom !== boardCode || !this.hasJoined) {
      socket.emit("join-board", { boardCode, name: userName });
      this.currentRoom = boardCode;
      this.hasJoined = true;
      if (import.meta.env.DEV) {
        console.log("[rt] join-board emit", boardCode);
      }
    }
  }

  rejoinOnConnect(userName: string | undefined | null) {
    if (!userName || !this.currentRoom) return;
    if (!this.hasJoined) {
      socket.emit("join-board", { boardCode: this.currentRoom, name: userName });
      this.hasJoined = true;
      if (import.meta.env.DEV) {
        console.log("[rt] rejoin on connect", this.currentRoom);
      }
    }
  }

  clearRoom() {
    this.currentRoom = null;
    this.hasJoined = false;
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
