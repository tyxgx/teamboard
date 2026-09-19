import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { List, useListRef } from "react-window";
import type { RowComponentProps } from "react-window";
import { MessageBubble } from "./MessageBubble";
import { AttachmentImage } from "./AttachmentImage";
import { MessageText } from "./MessageText";
import type { ReactionSummary } from "./ReactionBar";

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
  status?: "sending" | "sent" | "failed";
  parentId?: string | null;
  editedAt?: string | null;
  mentions?: string[];
  replyTo?: { id: string; sender: string; snippet: string } | null;
  attachment?: { id: string; mime: string; size: number } | null;
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
  onRetryMessage?: (clientMessageId: string) => void;
  reactionsById?: Record<string, ReactionSummary[]>;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onReply?: (message: ChatMessage) => void;
  mentionNames?: string[];
  onEditMessage?: (message: ChatMessage) => void;
  onDeleteMessage?: (message: ChatMessage) => void;
  /** "Seen by …" label shown under the caller's most recent message */
  seenBy?: { messageId: string; label: string } | null;
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
  onRetryMessage,
  reactionsById,
  onToggleReaction,
  onReply,
  mentionNames = [],
  onEditMessage,
  onDeleteMessage,
  seenBy,
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
    // Filter out ADMIN_ONLY messages for non-admin users, but allow them to see their own messages
    const filteredMessages = messages.filter((msg) => {
      if (msg.visibility === "ADMIN_ONLY" && !isAdmin) {
        // Allow members to see their own admin-only messages
        const isOwnMessage = currentUserId && (msg.userId === currentUserId || msg.senderId === currentUserId);
        if (!isOwnMessage) {
          return false; // Non-admins cannot see other people's admin-only messages
        }
      }
      return true;
    });
    filteredMessages.forEach((msg) => {
      const key = humanizeDate(msg.createdAt) || "";
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(msg);
    });
    return Object.entries(buckets);
  }, [messages, isAdmin, currentUserId]);

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
  const bubbleExtras = (msg: ChatMessage) => {
    const own = Boolean(currentUserId && (msg.userId === currentUserId || msg.senderId === currentUserId));
    const sent = Boolean(msg.id) && msg.status !== "sending" && msg.status !== "failed";
    return {
    edited: Boolean(msg.editedAt),
    onEdit: own && sent && onEditMessage ? () => onEditMessage(msg) : undefined,
    onDelete: (own || isAdmin) && sent && onDeleteMessage ? () => onDeleteMessage(msg) : undefined,
    replyTo: msg.replyTo ?? null,
    image: msg.attachment ? <AttachmentImage id={msg.attachment.id} mime={msg.attachment.mime} /> : undefined,
    reactions: msg.id ? reactionsById?.[msg.id] : undefined,
    onReact: msg.id && onToggleReaction ? (emoji: string) => onToggleReaction(msg.id!, emoji) : undefined,
    onReply: msg.id && onReply ? () => onReply(msg) : undefined,
    seenBy: seenBy && msg.id === seenBy.messageId ? seenBy.label : undefined,
  };
  };

  // react-window needs a height per row. Messages vary (quotes, images, reactions, long text), so estimate.
  const estimateRowHeight = (index: number) => {
    const item = virtualItems[index];
    if (!item || item.type === "header") return 48;
    const m = item.message;
    if (m.system) return 44;
    const lines = Math.max(1, Math.ceil((m.message?.length ?? 0) / 48)) + (m.message?.split("\n").length ?? 1) - 1;
    let h = 76 + (lines - 1) * 24;
    if (m.replyTo) h += 52;
    if (m.attachment) h += 270;
    if (m.id && reactionsById?.[m.id]?.length) h += 32;
    if (seenBy && m.id === seenBy.messageId) h += 16;
    return h;
  };

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
    
    // Group messages: reduce spacing if same sender and within 2 minutes
    const prevItem = index > 0 ? virtualItems[index - 1] : null;
    const prevMsg = prevItem && 'message' in prevItem ? prevItem.message : null;
    const isGrouped = prevMsg && 
      !prevMsg.system &&
      prevMsg.sender === msg.sender && 
      prevMsg.userId === msg.userId &&
      prevMsg.createdAt && 
      new Date(createdAt).getTime() - new Date(prevMsg.createdAt).getTime() < 120000; // 2 minutes
    const gap = isGrouped ? "gap-0.5" : "gap-1";

    return (
      <div style={style} className={`flex flex-col ${gap}`}>
        <MessageBubble
          key={item.key}
          isOwn={isOwn}
          isAnonymous={msg.sender === "Anonymous"}
          audience={msg.visibility}
          authorName={msg.sender}
          actualSender={actualName}
          timestamp={createdAt}
          {...bubbleExtras(msg)}
        >
          <span><MessageText text={msg.message} mentionNames={mentionNames} selfName={currentUserName} isOwn={isOwn} /></span>
          {msg.status === "sending" ? (
            <span className="ml-2 inline-flex items-center text-[11px] opacity-60">
              <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current"></span>
              sending
            </span>
          ) : null}
          {msg.status === "failed" ? (
            <button
                type="button"
                onClick={() => msg.clientMessageId && onRetryMessage?.(msg.clientMessageId)}
                className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 align-middle text-[10px] font-semibold text-red-500 hover:bg-red-500/20"
              >
                Not sent · Retry
              </button>
          ) : null}
        </MessageBubble>
      </div>
    );
  };

  return (
    <div className="relative flex-1 overflow-hidden">
      {shouldVirtualize ? (
        // TASK 2.2: Virtualized rendering for large message lists
        <div ref={containerRef} role="log" aria-label="Messages" className="h-full bg-gradient-to-b from-slate-50 via-slate-50/80 to-slate-100/50">
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
            rowHeight={estimateRowHeight}
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
          role="log"
          aria-label="Messages"
          onScroll={updateNearBottom}
          className="h-full overflow-y-auto bg-gradient-to-b from-slate-50 via-slate-50/80 to-slate-100/50 py-4"
          style={{ scrollBehavior: "smooth" }}
        >
          <div ref={topSentinelRef} />
          <div className="flex flex-col gap-1">
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
                  <div key={i} className="flex w-full gap-2 justify-start animate-pulse px-4">
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
              <div className="mx-auto max-w-sm px-6 py-14 text-center">
                <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-xl text-emerald-600">💬</span>
                <p className="text-base font-semibold text-slate-800">This board is quiet. Say something.</p>
                <ul className="mt-4 space-y-2 text-left text-sm text-slate-500">
                  <li><span aria-hidden>🕶️</span> Turn on anonymous to post without your name.</li>
                  <li><span aria-hidden>🛡️</span> Members can send admin-only notes that only admins see.</li>
                  <li><span aria-hidden>@</span> Type @ to mention someone.</li>
                  <li><span aria-hidden>⌨️</span> Press <kbd className="rounded border border-slate-200 px-1 font-mono text-xs">?</kbd> for shortcuts.</li>
                </ul>
              </div>
            ) : (
              grouped.map(([label, bucket]) => (
                <Fragment key={label || bucket[0]?.id || Math.random().toString()}>
                  {label ? (
                    <div className="relative my-3 flex items-center justify-center text-xs uppercase tracking-wider text-slate-400">
                      <span className="z-10 rounded-full bg-slate-100 px-3 py-1 shadow-sm">{label}</span>
                      <span className="absolute inset-x-0 h-px bg-slate-200" aria-hidden />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-1">
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
                      
                      // Group messages: reduce spacing if same sender and within 2 minutes
                      const prevMsg = index > 0 ? bucket[index - 1] : null;
                      const isGrouped = prevMsg && 
                        !prevMsg.system &&
                        prevMsg.sender === msg.sender && 
                        prevMsg.userId === msg.userId &&
                        prevMsg.createdAt && 
                        new Date(createdAt).getTime() - new Date(prevMsg.createdAt).getTime() < 120000; // 2 minutes
                      const gap = isGrouped ? "mb-0.5" : "mb-1";

                      return (
                        <div key={msg.id ?? msg.clientMessageId ?? `${label}-${index}`} className={gap}>
                          <MessageBubble
                            isOwn={isOwn}
                            isAnonymous={msg.sender === "Anonymous"}
                            audience={msg.visibility}
                            authorName={msg.sender}
                            actualSender={actualName}
                            timestamp={createdAt}
                            {...bubbleExtras(msg)}
                          >
                            <span><MessageText text={msg.message} mentionNames={mentionNames} selfName={currentUserName} isOwn={isOwn} /></span>
                            {msg.status === "sending" ? (
                              <span className="ml-2 inline-flex items-center text-[11px] opacity-60">
                                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current"></span>
                                sending
                              </span>
                            ) : null}
                            {msg.status === "failed" ? (
                              <button
                type="button"
                onClick={() => msg.clientMessageId && onRetryMessage?.(msg.clientMessageId)}
                className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 align-middle text-[10px] font-semibold text-red-500 hover:bg-red-500/20"
              >
                Not sent · Retry
              </button>
                            ) : null}
                          </MessageBubble>
                        </div>
                      );
                    })}
                  </div>
                </Fragment>
              ))
            )}

            {typingIndicator.length ? (
              <div aria-live="polite" className="ml-12 max-w-max rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-500">
                {typingIndicator.join(", ")} {typingIndicator.length > 1 ? "are" : "is"} typing…
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
