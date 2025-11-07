import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { List, useListRef } from "react-window";
import type { RowComponentProps } from "react-window";
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
  hasMoreMessages?: boolean;
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
  hasMoreMessages,
}: MessageListProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useListRef(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [isLoadingOlderState, setIsLoadingOlderState] = useState(false);
  const [containerHeight, setContainerHeight] = useState(600);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth", itemCount?: number) => {
    if (listRef.current && itemCount !== undefined) {
      // Virtualized list - scroll to end
      listRef.current?.scrollToRow({ index: itemCount - 1, align: "end", behavior: behavior === "smooth" ? "smooth" : "instant" });
    } else {
      const el = containerRef.current;
      if (!el) return;
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior });
      });
    }
  };

  const updateNearBottom = () => {
    if (listRef.current) {
      // For virtualized list, we'll check scroll position differently
      // For now, assume near bottom if we're at the end
      setNearBottom(true); // Simplified - can be enhanced
    } else {
      const el = containerRef.current;
      if (!el) return;
      const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
      setNearBottom(distance <= 120);
    }
  };

  // TASK 2.2: Update container height when it changes
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    updateNearBottom();
  }, []);

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
      if (scrollPercentage >= 0.8 && !isLoadingOlderState && !isLoadingOlder && scrollTop > 0 && hasMoreMessages !== false) {
        setIsLoadingOlderState(true);
        onLoadOlder();
        setTimeout(() => setIsLoadingOlderState(false), 500);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [onLoadOlder, isLoadingOlderState, isLoadingOlder, hasMoreMessages]);

  // Also observe top sentinel as fallback (when actually at top)
  useEffect(() => {
    if (!onLoadOlder) return;
    const sentinel = topSentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingOlderState && !isLoadingOlder && hasMoreMessages !== false) {
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
  }, [onLoadOlder, isLoadingOlderState, isLoadingOlder, hasMoreMessages]);

  const grouped = useMemo(() => {
    const buckets: Record<string, ChatMessage[]> = {};
    messages.forEach((msg) => {
      const key = humanizeDate(msg.createdAt) || "";
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(msg);
    });
    return Object.entries(buckets);
  }, [messages]);

  // TASK 2.2: Flatten grouped messages into a single array for virtualization
  // Each item is either a date header (type: 'header') or a message (type: 'message')
  type VirtualItem = 
    | { type: 'header'; label: string; key: string }
    | { type: 'message'; message: ChatMessage; label: string; index: number; key: string };
  
  const virtualItems = useMemo((): VirtualItem[] => {
    const items: VirtualItem[] = [];
    grouped.forEach(([label, bucket]) => {
      if (label) {
        items.push({ type: 'header', label, key: `header-${label}` });
      }
      bucket.forEach((msg, index) => {
        items.push({
          type: 'message',
          message: msg,
          label,
          index,
          key: msg.id ?? msg.clientMessageId ?? `${label}-${index}`,
        });
      });
    });
    return items;
  }, [grouped]);

  // TASK 2.2: Only virtualize if we have more than 50 messages
  const shouldVirtualize = messages.length > 50;

  // TASK 2.2: Scroll to bottom when new messages arrive (after virtualItems is defined)
  useEffect(() => {
    if (nearBottom && !shouldVirtualize) {
      scrollToBottom(messages.length <= 2 ? "auto" : "smooth");
    } else if (nearBottom && shouldVirtualize && listRef.current && virtualItems.length > 0) {
      // For virtualized list, scroll to end when new messages arrive
      listRef.current?.scrollToRow({ index: virtualItems.length - 1, align: "end", behavior: "smooth" });
    }
  }, [messages, typingIndicator, nearBottom, shouldVirtualize, virtualItems.length]);

  // TASK 2.2: Render function for virtualized list items
  const renderVirtualItem = ({ index, style }: RowComponentProps) => {
    const item = virtualItems[index];
    if (!item) return <div style={style} />;

    if (item.type === 'header') {
      return (
        <div style={style} className="relative my-3 flex items-center justify-center text-xs uppercase tracking-wider text-slate-400">
          <span className="z-10 rounded-full bg-slate-100 px-3 py-1 shadow-sm">{item.label}</span>
          <span className="absolute inset-x-0 h-px bg-slate-200" aria-hidden />
        </div>
      );
    }

    const msg = item.message;
    if (msg.system) {
      return (
        <div style={style} className="mx-auto max-w-sm rounded-full bg-slate-100 px-4 py-2 text-center text-xs font-semibold text-slate-500 wrap-anywhere">
          {msg.message}
        </div>
      );
    }

    const actualName = msg.actualSender && isAdmin ? msg.actualSender : undefined;
    const comparableName = actualName ?? msg.sender;
    const isOwnById = currentUserId && (msg.userId === currentUserId || msg.senderId === currentUserId);
    const isOwnByName = comparableName && currentUserName ? comparableName === currentUserName : false;
    const isOwn = Boolean(isOwnById || isOwnByName);
    const createdAt = msg.createdAt ?? new Date().toISOString();

    return (
      <div style={style} className="flex flex-col gap-3">
        <MessageBubble
          key={item.key}
          isOwn={isOwn}
          isAnonymous={msg.sender === "Anonymous"}
          audience={msg.visibility}
          authorName={msg.sender}
          actualSender={actualName}
          timestamp={createdAt}
        >
          {msg.message}
        </MessageBubble>
      </div>
    );
  };

  return (
    <div className="relative flex-1 overflow-hidden">
      {shouldVirtualize ? (
        // TASK 2.2: Virtualized rendering for large message lists
        <div ref={containerRef} className="h-full bg-white dark:bg-slate-800 dark:text-slate-100">
          {/* Loading indicator for older messages */}
          {(isLoadingOlder || isLoadingOlderState) && messages.length > 0 && hasMoreMessages !== false ? (
            <div className="flex justify-center py-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
                <span>Loading older messages...</span>
              </div>
            </div>
          ) : null}
          <List
            listRef={listRef}
            defaultHeight={containerHeight}
            rowCount={virtualItems.length}
            rowHeight={80} // Approximate height per item (header: ~40px, message: ~80px)
            rowComponent={renderVirtualItem}
            rowProps={{}}
            style={{ padding: '16px', height: containerHeight }}
            onRowsRendered={({ startIndex }) => {
              updateNearBottom();
              // Handle prefetch for older messages when scrolling near top
              if (onLoadOlder && startIndex < 5 && !isLoadingOlderState && !isLoadingOlder && hasMoreMessages !== false) {
                setIsLoadingOlderState(true);
                onLoadOlder();
                setTimeout(() => setIsLoadingOlderState(false), 500);
              }
            }}
          />
        </div>
      ) : (
        // Non-virtualized rendering for small message lists (<50 messages)
        <div
          ref={containerRef}
          onScroll={updateNearBottom}
          className="h-full overflow-y-auto bg-white dark:bg-slate-800 dark:text-slate-100 px-3 py-4 md:px-6 md:py-6"
          style={{ scrollBehavior: "smooth" }}
        >
          <div ref={topSentinelRef} />
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {/* Loading indicator for older messages */}
            {(isLoadingOlder || isLoadingOlderState) && messages.length > 0 && hasMoreMessages !== false ? (
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
      )}

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
