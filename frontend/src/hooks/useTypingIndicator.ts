import { useCallback, useEffect, useRef, useState } from "react";
import socketClient from "../socket";

/**
 * Who is typing in the open board. Entries expire on their own after a few seconds, so a dropped
 * "stopped typing" can never leave an indicator stuck. Names are only shown when the sender is not
 * in anonymous mode; the server broadcasts anonymous typers as null ("Someone").
 */
export const useTypingIndicator = (boardCode: string | undefined, anonymousMode: boolean) => {
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  const lastEmitRef = useRef(0);

  useEffect(() => {
    const timers = timersRef.current;
    if (!boardCode) return;
    const onTyping = (payload: { boardCode: string; name: string | null }) => {
      if (payload.boardCode !== boardCode) return;
      const label = payload.name ?? "Someone";
      const existing = timers.get(label);
      if (existing) window.clearTimeout(existing);
      timers.set(
        label,
        window.setTimeout(() => {
          timers.delete(label);
          setTypingNames(Array.from(timers.keys()));
        }, 3500)
      );
      setTypingNames(Array.from(timers.keys()));
    };
    socketClient.on("typing", onTyping);
    return () => {
      socketClient.off("typing", onTyping);
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      setTypingNames([]);
    };
  }, [boardCode]);

  /** Call on every composer change; emits at most once per 2s. */
  const notifyTyping = useCallback(
    (value: string) => {
      const now = Date.now();
      if (!boardCode || !value || now - lastEmitRef.current < 2000) return;
      lastEmitRef.current = now;
      socketClient.emit("typing", { boardCode, anonymous: anonymousMode });
    },
    [boardCode, anonymousMode]
  );

  return { typingNames, notifyTyping };
};
