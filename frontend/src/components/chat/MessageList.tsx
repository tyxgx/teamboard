import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble";

export type ChatMessage = {
  id?: string;
  clientMessageId?: string;
  boardCode?: string;
  sender: string;
  actualSender?: string;
  message: string;
  visibility: "EVERYONE" | "ADMIN_ONLY";
  createdAt?: string;
  system?: boolean;
  userId?: string;
  senderId?: string;
};

type MessageListProps = {
  messages: ChatMessage[];
  isAdmin: boolean;
  currentUserId?: string;
  currentUserName?: string;
  typingIndicator?: string[];
  isLoading?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => void;
};

const humanizeDate = (timestamp?: string) => {
  if (!timestamp) return "";
  const target = new Date(timestamp);
  if (Number.isNaN(target.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(target, today)) return "Today";
  if (sameDay(target, yesterday)) return "Yesterday";

  return target.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const MessageList = ({
  messages,
  isAdmin,
  currentUserId,
  currentUserName,
  typingIndicator = [],
  isLoading = false,
  isLoadingOlder = false,
  onLoadOlder,
}: MessageListProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [isLoadingOlderState, setIsLoadingOlderState] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = containerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    });
  };

  const updateNearBottom = () => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setNearBottom(distance <= 120);
  };

  useEffect(() => {
    updateNearBottom();
  }, []);

  useEffect(() => {
    if (nearBottom) {
      scrollToBottom(messages.length <= 2 ? "auto" : "smooth");
    }
  }, [messages, typingIndicator, nearBottom]);

  // Prefetch when user scrolls near top (80% scrolled = 20% from top)
  useEffect(() => {
    if (!onLoadOlder) return;
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const maxScroll = scrollHeight - clientHeight;
      
      // Avoid division by zero
      if (maxScroll <= 0) return;
      
      const scrollPercentage = scrollTop / maxScroll;
      
      // Trigger prefetch when 80% scrolled (20% from top)
      if (scrollPercentage >= 0.8 && !isLoadingOlderState && !isLoadingOlder && scrollTop > 0) {
        setIsLoadingOlderState(true);
        onLoadOlder();
        setTimeout(() => setIsLoadingOlderState(false), 500);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [onLoadOlder, isLoadingOlderState, isLoadingOlder]);

  // Also observe top sentinel as fallback (when actually at top)
  useEffect(() => {
    if (!onLoadOlder) return;
    const sentinel = topSentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingOlderState && !isLoadingOlder) {
          setIsLoadingOlderState(true);
          onLoadOlder();
          setTimeout(() => setIsLoadingOlderState(false), 500);
        }
      },
      {
        root: container,
        threshold: 1,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [onLoadOlder, isLoadingOlderState, isLoadingOlder]);

  const grouped = useMemo(() => {
    const buckets: Record<string, ChatMessage[]> = {};
    messages.forEach((msg) => {
      const key = humanizeDate(msg.createdAt) || "";
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(msg);
    });
    return Object.entries(buckets);
  }, [messages]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={updateNearBottom}
        className="h-full overflow-y-auto bg-white px-3 py-4 md:px-6 md:py-6"
        style={{ scrollBehavior: "smooth" }}
      >
        <div ref={topSentinelRef} />
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {/* Loading indicator for older messages */}
          {(isLoadingOlder || isLoadingOlderState) && messages.length > 0 ? (
            <div className="flex justify-center py-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
                <span>Loading older messages...</span>
              </div>
            </div>
          ) : null}
          {isLoading && messages.length === 0 ? (
            <>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex w-full gap-3 justify-start animate-pulse">
                  <div className="w-9" aria-hidden />
                  <div className="max-w-[65%] rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 shadow-sm">
                    <div className="mb-2 h-4 w-24 bg-slate-300 rounded" />
                    <div className="space-y-2">
                      <div className="h-4 bg-slate-300 rounded w-full" />
                      <div className="h-4 bg-slate-300 rounded w-3/4" />
                    </div>
                    <div className="mt-2 h-3 w-16 bg-slate-300 rounded ml-auto" />
                  </div>
                  <div className="w-9" aria-hidden />
                </div>
              ))}
            </>
          ) : grouped.length === 0 ? (
            <div className="py-20 text-center text-sm text-slate-400">No messages yet. Start the conversation!</div>
          ) : (
            grouped.map(([label, bucket]) => (
              <Fragment key={label || bucket[0]?.id || Math.random().toString()}>
                {label ? (
                  <div className="relative my-3 flex items-center justify-center text-xs uppercase tracking-wider text-slate-400">
                    <span className="z-10 rounded-full bg-slate-100 px-3 py-1 shadow-sm">{label}</span>
                    <span className="absolute inset-x-0 h-px bg-slate-200" aria-hidden />
                  </div>
                ) : null}
                <div className="flex flex-col gap-3">
                  {bucket.map((msg, index) => {
                    if (msg.system) {
                      return (
                        <div
                          key={msg.id ?? `${label}-${index}`}
                          className="mx-auto max-w-sm rounded-full bg-slate-100 px-4 py-2 text-center text-xs font-semibold text-slate-500 wrap-anywhere"
                        >
                          {msg.message}
                        </div>
                      );
                    }

                    const actualName = msg.actualSender && isAdmin ? msg.actualSender : undefined;
                    const comparableName = actualName ?? msg.sender;
                    const isOwnById =
                      currentUserId && (msg.userId === currentUserId || msg.senderId === currentUserId);
                    const isOwnByName = comparableName && currentUserName ? comparableName === currentUserName : false;
                    const isOwn = Boolean(isOwnById || isOwnByName);
                    const createdAt = msg.createdAt ?? new Date().toISOString();

                    return (
                      <MessageBubble
                        key={msg.id ?? msg.clientMessageId ?? `${label}-${index}`}
                        isOwn={isOwn}
                        isAnonymous={msg.sender === "Anonymous"}
                        audience={msg.visibility}
                        authorName={msg.sender}
                        actualSender={actualName}
                        timestamp={createdAt}
                      >
                        {msg.message}
                      </MessageBubble>
                    );
                  })}
                </div>
              </Fragment>
            ))
          )}

          {typingIndicator.length ? (
            <div className="ml-12 max-w-max rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-500">
              {typingIndicator.join(", ")} typing…
            </div>
          ) : null}
        </div>
      </div>

      {!nearBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-6 right-6 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-emerald-600"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
};
