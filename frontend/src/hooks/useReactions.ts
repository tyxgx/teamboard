import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import socketClient from "../socket";
import type { ChatMessage } from "../components/chat/MessageList";
import type { ReactionSummary } from "../components/chat/ReactionBar";

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

type Params = {
  boardId?: string;
  boardCode?: string;
  messages: ChatMessage[];
  authHeaders: () => Record<string, string> | undefined;
};

/** Reaction chips per message: lazy-loaded for messages on screen, live-updated over the socket. */
export const useReactions = ({ boardId, boardCode, messages, authHeaders }: Params) => {
  const [reactionsById, setReactionsById] = useState<Record<string, ReactionSummary[]>>({});
  const loadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadedRef.current = new Set();
    setReactionsById({});
  }, [boardId]);

  useEffect(() => {
    const headers = authHeaders();
    if (!boardId || !headers) return;
    const missing = messages
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id) && !loadedRef.current.has(id as string))
      .slice(-200);
    if (missing.length === 0) return;
    missing.forEach((id) => loadedRef.current.add(id));
    axios
      .get(`${BACKEND}/api/boards/${boardId}/reactions`, { params: { ids: missing.join(",") }, headers })
      .then((res) => setReactionsById((prev) => ({ ...prev, ...res.data.reactions })))
      .catch(() => missing.forEach((id) => loadedRef.current.delete(id)));
  }, [messages, boardId, authHeaders]);

  useEffect(() => {
    if (!boardCode) return;
    // The socket only carries counts (never who reacted), so keep our own "mine" flags.
    const onUpdate = (p: { boardCode: string; commentId: string; counts: { emoji: string; count: number }[] }) => {
      if (p.boardCode !== boardCode) return;
      setReactionsById((prev) => {
        const mine = new Set((prev[p.commentId] ?? []).filter((r) => r.mine).map((r) => r.emoji));
        return {
          ...prev,
          [p.commentId]: p.counts.map((c) => ({ emoji: c.emoji, count: c.count, mine: mine.has(c.emoji) })),
        };
      });
    };
    socketClient.on("reaction:update", onUpdate);
    return () => {
      socketClient.off("reaction:update", onUpdate);
    };
  }, [boardCode]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const headers = authHeaders();
      if (!headers) return;
      const before = reactionsById[messageId] ?? [];
      // Optimistic flip; the server's answer replaces it either way.
      setReactionsById((prev) => {
        const list = prev[messageId] ?? [];
        const existing = list.find((r) => r.emoji === emoji);
        let next: ReactionSummary[];
        if (!existing) next = [...list, { emoji, count: 1, mine: true }];
        else if (existing.mine)
          next = list.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0);
        else next = list.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r));
        return { ...prev, [messageId]: next };
      });
      try {
        const res = await axios.post(`${BACKEND}/api/messages/${messageId}/reactions`, { emoji }, { headers });
        setReactionsById((prev) => ({ ...prev, [messageId]: res.data.reactions }));
      } catch (error: any) {
        setReactionsById((prev) => ({ ...prev, [messageId]: before }));
        toast.error(error?.response?.status === 429 ? "Slow down a little." : "Couldn't add that reaction.");
      }
    },
    [authHeaders, reactionsById]
  );

  return { reactionsById, toggleReaction };
};
