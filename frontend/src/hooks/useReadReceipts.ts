import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import socketClient from "../socket";
import type { ChatMessage } from "../components/chat/MessageList";

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

type Params = {
  boardId?: string;
  boardCode?: string;
  messages: ChatMessage[];
  members: { userId: string; user: { name: string } }[];
  userId?: string;
  readOnly: boolean;
  authHeaders: () => Record<string, string> | undefined;
};

/**
 * Marks the open board as read (debounced, only while the tab is visible), tracks when each other
 * member last caught up, and derives the "Seen by …" label for the caller's most recent message.
 */
export const useReadReceipts = ({ boardId, boardCode, messages, members, userId, readOnly, authHeaders }: Params) => {
  const [reads, setReads] = useState<Record<string, string>>({});

  useEffect(() => {
    setReads({});
  }, [boardId]);

  useEffect(() => {
    const headers = authHeaders();
    if (!boardId || !headers || readOnly) return;
    let cancelled = false;
    axios
      .get(`${BACKEND}/api/boards/${boardId}/reads`, { headers })
      .then((res) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const r of res.data.reads as { userId: string; lastReadAt: string }[]) next[r.userId] = r.lastReadAt;
        setReads(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [boardId, authHeaders, readOnly]);

  useEffect(() => {
    const headers = authHeaders();
    if (!boardId || !headers || readOnly || messages.length === 0) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        axios.put(`${BACKEND}/api/boards/${boardId}/read`, undefined, { headers }).catch(() => undefined);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [messages.length, boardId, authHeaders, readOnly]);

  useEffect(() => {
    if (!boardCode) return;
    const onRead = (p: { boardCode: string; userId: string; at: string }) => {
      if (p.boardCode === boardCode && p.userId !== userId) setReads((prev) => ({ ...prev, [p.userId]: p.at }));
    };
    socketClient.on("read:update", onRead);
    return () => {
      socketClient.off("read:update", onRead);
    };
  }, [boardCode, userId]);

  return useMemo(() => {
    if (!userId) return null;
    const own = [...messages]
      .reverse()
      .find((m) => m.id && m.status !== "sending" && m.status !== "failed" && (m.userId === userId || m.senderId === userId));
    if (!own?.id || !own.createdAt) return null;
    const sentAt = new Date(own.createdAt).getTime();
    const names = members
      .filter((m) => m.userId !== userId && reads[m.userId] && new Date(reads[m.userId]).getTime() >= sentAt)
      .map((m) => m.user.name.split(" ")[0]);
    if (names.length === 0) return null;
    const label = names.length <= 2 ? `Seen by ${names.join(", ")}` : `Seen by ${names[0]} +${names.length - 1}`;
    return { messageId: own.id, label };
  }, [messages, reads, members, userId]);
};
