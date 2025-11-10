import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import socketClient, { getSocketConnectionState, onConnectionChange } from "./socket";
import realtimeService, { initRealtimeService } from "./realtime/RealtimeService";
import { Sidebar } from "./components/chat/Sidebar";
import { ChatHeader } from "./components/chat/ChatHeader";
import { MessageList, type ChatMessage } from "./components/chat/MessageList";
import { ChatComposer } from "./components/chat/ChatComposer";
import { RightPanel } from "./components/chat/RightPanel";
import { ConfirmModal } from "./components/ui/ConfirmModal";
// TASK 2.1: Import IndexedDB cache services
import { boardsCache, boardDetailsCache } from "./cache/cacheService";

const BACKEND = import.meta.env.VITE_BACKEND_URL;
const HIDDEN_STORAGE_KEY = "tb.hiddenBoards";
const UNREAD_STORAGE_KEY = "tb.unreadByBoard";
const LAST_BOARD_KEY = "tb.lastBoardCode";
const REDIRECT_KEY = "tb.redirect";

type MembershipStatus = "ACTIVE" | "LEFT";

type User = {
  id: string;
  name: string;
  email: string;
};

type BoardSummary = {
  id: string;
  code: string;
  name: string;
  pinned: boolean;
  lastActivity: string | null;
  anonymousEnabled: boolean;
  memberCount: number;
  role: "ADMIN" | "MEMBER" | null;
  isCreator: boolean;
  membershipStatus: MembershipStatus;
  readOnly: boolean;
  lastCommentPreview: string | null;
  lastCommentAt: string | null;
  lastCommentVisibility: "EVERYONE" | "ADMIN_ONLY" | null;
  lastCommentAnonymous: boolean;
  lastCommentSenderName: string | null;
};

type BoardMember = {
  id: string;
  userId: string;
  role: "ADMIN" | "MEMBER";
  pinned: boolean;
  user: { id: string; name: string; email: string };
};

type BoardDetails = {
  id: string;
  name: string;
  code: string;
  anonymousEnabled: boolean;
  lastActivity: string | null;
  members: BoardMember[];
  membershipRole: "ADMIN" | "MEMBER";
  membershipStatus: MembershipStatus;
  readOnly: boolean;
  isCreator: boolean;
};

type ModalState = { type: "leave"; board: { id: string; code: string; name: string } } | null;

const parseJSON = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const sortBoardSummaries = (boards: BoardSummary[]) => {
  const rank = (status: MembershipStatus) => (status === "ACTIVE" ? 0 : 1);
  return [...boards].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const statusDiff = rank(a.membershipStatus) - rank(b.membershipStatus);
    if (statusDiff !== 0) return statusDiff;
    const timeA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const timeB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return a.name.localeCompare(b.name);
  });
};

// Debounce helper
const debounce = <T extends (...args: any[]) => void>(fn: T, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

const isRealtimeMessagingEnabled = () =>
  (import.meta.env.VITE_RTM_ENABLED === "true") || localStorage.getItem("tb.rtm") === "1";

const normalizeMessage = (message: ChatMessage) => {
  const createdAtValue = message.createdAt
    ? new Date(message.createdAt).toISOString()
    : new Date().toISOString();
  return {
    ...message,
    createdAt: createdAtValue,
  };
};

const mergeMessages = (existing: ChatMessage[], incoming: ChatMessage[]) => {
  const map = new Map<string, ChatMessage>();
  const keyFor = (message: ChatMessage) =>
    message.id ?? message.clientMessageId ?? `${message.createdAt}-${message.message}`;
  existing.forEach((message) => map.set(keyFor(message), message));
  incoming.forEach((message) => {
    const key = keyFor(message);
    if (map.has(key)) {
      const existingMessage = map.get(key)!;
      map.set(key, {
        ...existingMessage,
        ...message,
        status: existingMessage.status ?? message.status,
      });
    } else {
      map.set(key, message);
    }
  });
  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
  );
};

const mapServerMessage = (
  payload: any,
  fallbackCode?: string
): ChatMessage & { boardCode?: string } => ({
  id: payload.id ?? undefined,
  clientMessageId: payload.clientMessageId ?? payload.clientId ?? undefined,
  boardCode: payload.boardCode ?? fallbackCode,
  sender: payload.sender ?? "Unknown",
  actualSender: payload.actualSender ?? undefined,
  message: payload.message ?? "",
  visibility: payload.visibility ?? "EVERYONE",
  createdAt: payload.createdAt ?? new Date().toISOString(),
  userId: payload.userId ?? undefined,
  senderId: payload.senderId ?? undefined,
});

const usePersistentState = <T,>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] => {
  const [state, setState] = useState<T>(() => parseJSON(localStorage.getItem(key), initialValue));

  const setPersistentValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const nextValue = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
        localStorage.setItem(key, JSON.stringify(nextValue));
        return nextValue;
      });
    },
    [key]
  );

  return [state, setPersistentValue];
};

export default function BoardRoomPage() {
  const { boardCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState<User | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [boardDetails, setBoardDetails] = useState<BoardDetails | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [visibility, setVisibility] = useState<"EVERYONE" | "ADMIN_ONLY">("EVERYONE");
  const [anonymousMode, setAnonymousMode] = useState(false); // Anonymous mode OFF by default - user's choice per message
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isRightPanelOpen, setRightPanelOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [switchingBoard, setSwitchingBoard] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  // TASK 2.4: Track cursor for cursor-based pagination (currently unused, reserved for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_nextCursor, setNextCursor] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [optimisticBoardName, setOptimisticBoardName] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [createBoardError, setCreateBoardError] = useState<string | null>(null);
  const [joinBoardError, setJoinBoardError] = useState<string | null>(null);
  const [initialLoadProgress, setInitialLoadProgress] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [createBoardName, setCreateBoardName] = useState("");
  const [joinCodeValue, setJoinCodeValue] = useState("");

  const [hiddenBoardIds, setHiddenBoardIds] = usePersistentState<string[]>(HIDDEN_STORAGE_KEY, []);
  const [unreadByBoard, setUnreadByBoard] = usePersistentState<Record<string, number>>(UNREAD_STORAGE_KEY, {});

  const pendingMessagesRef = useRef<Set<string>>(new Set());
  const activeRoomRef = useRef<string | null>(null);
  const lastReceivedRef = useRef<Record<string, string>>({});
  const lastDeltaRunRef = useRef<Record<string, number>>({});
  
  // Cache for prefetched board data
  const boardCacheRef = useRef<Map<string, { details: BoardDetails; comments: ChatMessage[]; timestamp: number }>>(new Map());
  const CACHE_TTL = 30000; // 30 seconds
  
  // Cache for board list
  const boardListCacheRef = useRef<{ boards: BoardSummary[]; timestamp: number } | null>(null);
  const BOARD_LIST_CACHE_TTL = 30000; // 30 seconds

  const handleAuthFailure = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
    navigate("/", { replace: true });
  }, [navigate]);

  const activeBoardCode = boardDetails?.code ?? null;
  const readOnly = boardDetails?.readOnly ?? false;
  const isAdmin = boardDetails ? boardDetails.isCreator || boardDetails.membershipRole === "ADMIN" : false;

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return { Authorization: `Bearer ${token}` } as const;
  }, []);

  // Initialize socket IMMEDIATELY on mount (before any data fetch)
  useEffect(() => {
    // Initialize socket connection immediately
    initRealtimeService();
    const initialConnected = getSocketConnectionState();
    setSocketConnected(initialConnected);
    
    // Log initial connection state
    if (initialConnected) {
      console.log("[rt] ✅ Socket connected on mount");
    } else {
      console.warn("[rt] ⚠️ Socket not connected on mount - will retry");
      // Retry connection after a short delay
      const retryTimeout = setTimeout(() => {
        const retryConnected = getSocketConnectionState();
        if (!retryConnected) {
          console.warn("[rt] ⚠️ Socket still not connected after retry");
          // Try to manually connect if socket is available
          if (typeof window !== "undefined" && (window as any).__socket__) {
            (window as any).__socket__.connect();
          }
        } else {
          console.log("[rt] ✅ Socket connected after retry");
          setSocketConnected(true);
        }
      }, 2000);
      
      return () => clearTimeout(retryTimeout);
    }
    
    // Monitor socket connection state
    const cleanup = onConnectionChange((connected) => {
      setSocketConnected(connected);
      if (connected) {
        console.log("[rt] ✅ Socket connection restored");
      } else {
        console.warn("[rt] ⚠️ Socket connection lost");
      }
      // Rejoin room when connection is restored (handled in separate effect)
    });
    
    return cleanup;
  }, []);
  
  // Separate effect to handle rejoin on connection restore
  useEffect(() => {
    if (socketConnected && boardDetails?.code && user?.name && !readOnly) {
      realtimeService.rejoinOnConnect(user.name);
      activeRoomRef.current = realtimeService.getCurrentRoom();
    }
  }, [socketConnected, boardDetails?.code, user?.name, readOnly]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      localStorage.setItem(REDIRECT_KEY, `${location.pathname}${location.search}`);
      navigate("/");
    }
  }, [location.pathname, location.search, navigate]);

  const updateBoardSummary = useCallback((code: string, updates: Partial<BoardSummary>) => {
    startTransition(() => {
      setBoards((prev) => {
        const next = prev.map((board) => (board.code === code ? { ...board, ...updates } : board));
        return sortBoardSummaries(next);
      });
    });
  }, []);

  const applyUnread = useCallback(
    (code: string, updater: (prev: number) => number) => {
      startTransition(() => {
        setUnreadByBoard((prev) => {
          const nextValue = updater(prev[code] ?? 0);
          const next = { ...prev };
          if (nextValue <= 0) {
            delete next[code];
          } else {
            next[code] = nextValue;
          }
          return next;
        });
      });
    },
    [setUnreadByBoard]
  );

  const resetUnread = useCallback(
    (code: string) => {
      applyUnread(code, () => 0);
    },
    [applyUnread]
  );

  const updateLastReceived = useCallback((code: string, timestamp?: string) => {
    if (!code) return;
    const iso = timestamp
      ? (() => {
          const parsed = new Date(timestamp);
          return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
        })()
      : new Date().toISOString();
    lastReceivedRef.current[code] = iso;
  }, []);

  const mergeIncomingMessages = useCallback(
    (code: string, incoming: ChatMessage[]) => {
      if (!incoming.length) {
        if (!lastReceivedRef.current[code]) {
          updateLastReceived(code);
        }
        return;
      }
      const normalized = incoming.map((message) =>
        normalizeMessage({ ...message, boardCode: message.boardCode ?? code })
      );
      normalized.forEach((message) => {
        if (message.clientMessageId) {
          pendingMessagesRef.current.delete(message.clientMessageId);
        }
      });
      setMessages((prev) => mergeMessages(prev, normalized));
      const newest = normalized[normalized.length - 1];
      if (newest?.createdAt) {
        updateLastReceived(code, newest.createdAt);
      }
      updateBoardSummary(code, {
        lastActivity: newest.createdAt,
        lastCommentPreview: newest.message,
        lastCommentAt: newest.createdAt,
        lastCommentVisibility: newest.visibility,
        lastCommentAnonymous: newest.sender === "Anonymous",
        lastCommentSenderName: newest.actualSender ?? newest.sender,
      });
    },
    [updateBoardSummary, updateLastReceived]
  );

  const fetchDeltaForBoard = useCallback(
    async (code: string, boardId: string, sinceOverride?: string) => {
      const headers = getAuthHeaders();
      if (!headers) return;
      const sinceISO = sinceOverride ?? lastReceivedRef.current[code] ?? "1970-01-01T00:00:00.000Z";
      try {
        const response = await axios.get(
          `${BACKEND}/api/comments/${boardId}?since=${encodeURIComponent(sinceISO)}`,
          { headers }
        );
        const responseData = response.data;
        // Handle both old (array) and new (object with comments key) response formats
        const comments: ChatMessage[] = Array.isArray(responseData) ? responseData : (responseData.comments || []);
        const incoming = comments.map((message) => ({
          ...message,
          boardCode: code,
        }));
        mergeIncomingMessages(code, incoming);
      } catch (error: any) {
        if (error?.response?.status === 401) {
          handleAuthFailure();
          return;
        }
        if (import.meta.env.DEV) {
          console.warn("[rt] delta fetch failed", error);
        }
      } finally {
        lastDeltaRunRef.current[code] = Date.now();
        if (!lastReceivedRef.current[code]) {
          updateLastReceived(code);
        }
      }
    },
    [getAuthHeaders, handleAuthFailure, mergeIncomingMessages, updateLastReceived]
  );

  const loadBoards = useCallback(async (useCache = true) => {
    const headers = getAuthHeaders();
    if (!headers) return;
    
    // Check cache first for instant display
    if (useCache && boardListCacheRef.current) {
      const cached = boardListCacheRef.current;
      if (Date.now() - cached.timestamp < BOARD_LIST_CACHE_TTL) {
        setBoards(sortBoardSummaries(cached.boards));
        setHiddenBoardIds((prev) => prev.filter((id) => cached.boards.some((board) => board.id === id)));
        // Fetch fresh data in background (use separate function to avoid recursion)
        const fetchFresh = async () => {
          try {
            const response = await axios.get(`${BACKEND}/api/boards`, { headers });
            const summaries: BoardSummary[] = response.data;
            const sorted = sortBoardSummaries(summaries);
            boardListCacheRef.current = {
              boards: sorted,
              timestamp: Date.now(),
            };
            setBoards(sorted);
            setHiddenBoardIds((prev) => prev.filter((id) => summaries.some((board) => board.id === id)));
          } catch (error) {
            // Silently fail background refresh
          }
        };
        void fetchFresh();
        return;
      }
    }
    
    try {
      const response = await axios.get(`${BACKEND}/api/boards`, { headers });
      const summaries: BoardSummary[] = response.data;
      const sorted = sortBoardSummaries(summaries);
      
      // Update cache
      boardListCacheRef.current = {
        boards: sorted,
        timestamp: Date.now(),
      };
      
      setBoards(sorted);
      setHiddenBoardIds((prev) => prev.filter((id) => summaries.some((board) => board.id === id)));
    } catch (error) {
      console.error("Failed to load boards", error);
    }
  }, [getAuthHeaders, setHiddenBoardIds]);

  // Debounced version for non-initial calls
  const debouncedLoadBoards = useMemo(() => debounce(loadBoards, 300), [loadBoards]);

  const loadBoardDetails = useCallback(
    async (code: string, useCache = true) => {
      const headers = getAuthHeaders();
      if (!headers) return null;
      
      // TASK 2.1: Check IndexedDB cache first for instant display (persists across refreshes)
      if (useCache) {
        const indexedDBCached = await boardDetailsCache.get(code);
        if (indexedDBCached) {
          // Show cached data immediately
          setBoardDetails(indexedDBCached.details);
          mergeIncomingMessages(indexedDBCached.details.code, indexedDBCached.comments);
          
          // Also update in-memory cache
          boardCacheRef.current.set(code, {
            details: indexedDBCached.details,
            comments: indexedDBCached.comments,
            timestamp: Date.now(),
          });
          
          // Fetch fresh data in background
          const fetchFresh = async () => {
            try {
              const [boardResponse, commentsData] = await Promise.all([
                axios.get(`${BACKEND}/api/boards/by-code/${code}`, { headers }),
                axios.get(`${BACKEND}/api/comments/by-code/${code}?limit=50`, { headers })
              ]);
              const details = boardResponse.data as BoardDetails;
              const commentsResponseData = commentsData.data;
              const comments: ChatMessage[] = Array.isArray(commentsResponseData) ? commentsResponseData : (commentsResponseData.comments || []);
              const shapedMessages = comments.map((message) => ({
                ...message,
                boardCode: details.code,
              }));
              
              // Update both caches
              boardCacheRef.current.set(code, {
                details,
                comments: shapedMessages,
                timestamp: Date.now(),
              });
              await boardDetailsCache.set(code, details, shapedMessages);
              
              setBoardDetails(details);
              mergeIncomingMessages(details.code, shapedMessages);
              setOptimisticBoardName(null);
            } catch (error) {
              // Silently fail background refresh
            }
          };
          void fetchFresh();
          return indexedDBCached.details;
        }
        
        // Fallback to in-memory cache
        const cached = boardCacheRef.current.get(code);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          setBoardDetails(cached.details);
          mergeIncomingMessages(cached.details.code, cached.comments);
          // Still fetch fresh data in background (use a separate function to avoid recursion)
          const fetchFresh = async () => {
            try {
              const [boardResponse, commentsData] = await Promise.all([
                axios.get(`${BACKEND}/api/boards/by-code/${code}`, { headers }),
                axios.get(`${BACKEND}/api/comments/by-code/${code}?limit=50`, { headers })
              ]);
              const details = boardResponse.data as BoardDetails;
              const commentsResponseData = commentsData.data;
              const comments: ChatMessage[] = Array.isArray(commentsResponseData) ? commentsResponseData : (commentsResponseData.comments || []);
              const shapedMessages = comments.map((message) => ({
                ...message,
                boardCode: details.code,
              }));
              boardCacheRef.current.set(code, {
                details,
                comments: shapedMessages,
                timestamp: Date.now(),
              });
              await boardDetailsCache.set(code, details, shapedMessages);
              setBoardDetails(details);
              mergeIncomingMessages(details.code, shapedMessages);
              // Clear optimistic name when fresh data loads
              setOptimisticBoardName(null);
            } catch (error) {
              // Silently fail background refresh
            }
          };
          void fetchFresh();
          return cached.details;
        }
      }
      
      try {
        // TASK 1.3: Fetch board details and comments in parallel using new by-code endpoint
        const [boardResponse, commentsData] = await Promise.all([
          axios.get(`${BACKEND}/api/boards/by-code/${code}`, { headers }),
          axios.get(`${BACKEND}/api/comments/by-code/${code}?limit=50`, { headers })
        ]);
        const details = boardResponse.data as BoardDetails;
        const commentsResponseData = commentsData.data;
        // Handle both old (array) and new (object with comments key) response formats
        const comments: ChatMessage[] = Array.isArray(commentsResponseData) ? commentsResponseData : (commentsResponseData.comments || []);
        const shapedMessages = comments.map((message) => ({
          ...message,
          boardCode: details.code,
        }));
        
        // TASK 2.1: Update both in-memory and IndexedDB caches
        boardCacheRef.current.set(code, {
          details,
          comments: shapedMessages,
          timestamp: Date.now(),
        });
        await boardDetailsCache.set(code, details, shapedMessages);
        
        setBoardDetails(details);
        mergeIncomingMessages(details.code, shapedMessages);
        // TASK 2.4: Update cursor from response
        if (commentsResponseData.cursor) {
          setNextCursor(commentsResponseData.cursor);
        } else {
          setNextCursor(null);
        }
        // Clear optimistic name when real data loads (no flicker if names match)
        if (optimisticBoardName === details.name) {
          setOptimisticBoardName(null);
        } else {
          setOptimisticBoardName(null); // Clear anyway, real name will show
        }
        pendingMessagesRef.current.clear();
        if (details.readOnly && activeRoomRef.current === details.code) {
          activeRoomRef.current = null;
        }
        updateBoardSummary(code, {
          anonymousEnabled: details.anonymousEnabled,
          lastActivity: details.lastActivity ?? null,
          membershipStatus: details.membershipStatus,
          readOnly: details.readOnly,
          memberCount: details.members?.length || 0,
          role: details.membershipRole,
          isCreator: details.isCreator,
        });
        localStorage.setItem(LAST_BOARD_KEY, code);
        resetUnread(code);
        setCommentsError(null);
        setSwitchingBoard(null); // Clear loading state after data loads
        return details;
      } catch (error: any) {
        if (error?.response?.status === 401) {
          handleAuthFailure();
        }
        throw error;
      }
    },
    [getAuthHeaders, handleAuthFailure, mergeIncomingMessages, resetUnread, updateBoardSummary]
  );

  const loadComments = useCallback(
    async (boardId: string, code: string, cursor?: string | null) => {
      const headers = getAuthHeaders();
      if (!headers) return;
      try {
        // TASK 2.4: Use cursor-based pagination if cursor provided
        const url = cursor 
          ? `${BACKEND}/api/comments/${boardId}?limit=50&cursor=${encodeURIComponent(cursor)}`
          : `${BACKEND}/api/comments/${boardId}?limit=50`;
        const response = await axios.get(url, { headers });
        const responseData = response.data;
        // Handle both old (array) and new (object with comments key) response formats
        const history: ChatMessage[] = Array.isArray(responseData) ? responseData : (responseData.comments || []);
        // Reset hasMoreMessages when loading initial comments
        const hasMore = responseData.hasMore ?? (responseData.total ? history.length < responseData.total : history.length === 50);
        setHasMoreMessages(hasMore);
        mergeIncomingMessages(
          code,
          history.map((message) => ({ ...message, boardCode: code }))
        );
        
        // TASK 2.4: Update cursor for next pagination
        if (responseData.cursor) {
          setNextCursor(responseData.cursor);
        } else {
          setNextCursor(null);
        }
      } catch (error: any) {
        if (error?.response?.status === 401) {
          handleAuthFailure();
        }
        throw error;
      }
    },
    [getAuthHeaders, handleAuthFailure, mergeIncomingMessages]
  );

  useEffect(() => {
    const headers = getAuthHeaders();
    if (!headers) {
      setUser(null);
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        setInitialLoadProgress(25); // After cache read attempt
        // TASK 2.1: Try to get userId from token first (if we can decode it) or use a temp key
        // We'll use a temporary approach: try to read from any cached userId, or wait for auth
        let cachedBoards: BoardSummary[] | null = null;
        try {
          // Try to get cached boards from any userId (we'll refine this after auth)
          // For now, we'll check cache after we get the userId
        } catch (error) {
          // Ignore cache read errors
        }

        // Parallelize user + boards fetching for faster load
        const [authResponse, boardsResponse] = await Promise.all([
          axios.get(`${BACKEND}/api/test-auth`, { headers }),
          axios.get(`${BACKEND}/api/boards`, { headers }),
        ]);
        
        if (cancelled) return;
        
        setInitialLoadProgress(50); // After auth response
        
        // Update state in parallel
        const userData = authResponse.data.user as User;
        setUser(userData);
        
        // TASK 2.1: Now that we have userId, try to read from IndexedDB cache
        cachedBoards = await boardsCache.get(userData.id);
        if (cachedBoards && !cancelled) {
          // Show cached boards immediately
          setBoards(cachedBoards);
        }
        
        const summaries: BoardSummary[] = boardsResponse.data;
        const sorted = sortBoardSummaries(summaries);
        
        // TASK 2.1: For boards, use fresh data (boards can be added/deleted, so merging doesn't make sense)
        // Cached boards are only shown for instant display, then replaced with fresh data
        const finalBoards = sorted;
        
        // Update in-memory cache
        boardListCacheRef.current = {
          boards: finalBoards,
          timestamp: Date.now(),
        };
        
        // TASK 2.1: Write to IndexedDB cache
        await boardsCache.set(userData.id, finalBoards);
        
        setBoards(finalBoards);
        setHiddenBoardIds((prev) => prev.filter((id) => summaries.some((board) => board.id === id)));
        
        setInitialLoadProgress(100); // After boards response
        setIsInitialLoad(false); // Hide progress bar
        
        // PROMPT 2/7: Start preloading all boards in background (non-blocking)
        if (!cancelled) {
          void preloadAllBoards(finalBoards, headers);
        }
      } catch (error: any) {
        if (!cancelled) {
          console.error("Failed to bootstrap user", error);
          if (error?.response?.status === 401) {
            handleAuthFailure();
          } else {
            setUser(null);
          }
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [getAuthHeaders, handleAuthFailure, setHiddenBoardIds]);
  
  // PROMPT 7: Batch preload all boards after sign-in (defined before bootstrap to avoid dependency issues)
  const preloadAllBoards = useCallback(
    async (boardsToPreload: BoardSummary[], headers: Record<string, string>) => {
      // Limit to max 20 boards to avoid overwhelming API
      const boardsToProcess = boardsToPreload.slice(0, 20);
      
      // Prioritize: pinned first, then active, then left
      const sorted = [...boardsToProcess].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const statusRank = (s: MembershipStatus) => (s === "ACTIVE" ? 0 : 1);
        return statusRank(a.membershipStatus) - statusRank(b.membershipStatus);
      });
      
      // Preload in batches of 5
      const batchSize = 5;
      for (let i = 0; i < sorted.length; i += batchSize) {
        const batch = sorted.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (board) => {
            // Skip if already cached
            const cached = boardCacheRef.current.get(board.code);
            if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
            
            try {
              // TASK 1.3: Use parallel fetch for preloading too
              const [boardResponse, commentsData] = await Promise.all([
                axios.get(`${BACKEND}/api/boards/by-code/${board.code}`, { headers }),
                axios.get(`${BACKEND}/api/comments/by-code/${board.code}?limit=50`, { headers })
              ]);
              const details = boardResponse.data as BoardDetails;
              const commentsResponseData = commentsData.data;
              const comments: ChatMessage[] = Array.isArray(commentsResponseData) ? commentsResponseData : (commentsResponseData.comments || []);
              const shapedMessages = comments.map((message) => ({
                ...message,
                boardCode: details.code,
              }));
              
              // TASK 2.1: Update both in-memory and IndexedDB caches
              boardCacheRef.current.set(board.code, {
                details,
                comments: shapedMessages,
                timestamp: Date.now(),
              });
              await boardDetailsCache.set(board.code, details, shapedMessages);
            } catch (error) {
              // Silently fail - preloading shouldn't show errors
            }
          })
        );
        
        // Small delay between batches to avoid rate limiting
        if (i + batchSize < sorted.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!boardCode) {
      setBoardDetails(null);
      setMessages([]);
      setSidebarOpen(false);
      setRightPanelOpen(false);
      setLoadingHistory(false);
      setCommentsError(null);
      setComposerValue("");
      setAnonymousMode(false); // Reset to default (OFF) when switching boards
      setVisibility("EVERYONE");
      setNextCursor(null); // TASK 2.4: Clear cursor when switching boards (reserved for future use)
      pendingMessagesRef.current.clear();
      activeRoomRef.current = null;
      realtimeService.clearRoom();
      return;
    }

    // TASK 1.1: Join socket room immediately when boardCode is available, before loading board details
    if (user?.name) {
      realtimeService.joinIfNeeded(boardCode, user.name);
      activeRoomRef.current = realtimeService.getCurrentRoom();
    }

    setSidebarOpen(false);
    setRightPanelOpen(false);
    setLoadingHistory(true);
    setCommentsError(null);
    setMessages([]);
    setComposerValue("");
    setAnonymousMode(false); // Reset to default (OFF)
    setVisibility("EVERYONE");
    pendingMessagesRef.current.clear();
    // Don't clear activeRoomRef or realtimeService here since we just joined above

    let cancelled = false;

    const fetchBoard = async () => {
      try {
        const details = await loadBoardDetails(boardCode);
        if (!details || cancelled) return;
        // Clear switching state once data is loaded
        setSwitchingBoard(null);
      } catch (error: any) {
        if (error?.response?.status === 401) {
          handleAuthFailure();
          return;
        }
        console.error("Unable to fetch board details", error);
        if (error?.response?.status === 404 || error?.response?.status === 403) {
          activeRoomRef.current = null;
          realtimeService.clearRoom();
          navigate("/app");
          return;
        }
        setCommentsError("Unable to load messages. Try again.");
        setBoardDetails(null);
        setMessages([]);
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      }
    };

    void fetchBoard();

    return () => {
      cancelled = true;
    };
  }, [boardCode, user?.name, handleAuthFailure, loadBoardDetails, navigate]);

  // TASK 1.1: Socket join now happens immediately in boardCode effect above
  // This effect is kept as a fallback for when user loads after boardCode is already set
  useEffect(() => {
    const code = boardCode ?? null;
    if (!code || !user?.name) return;
    // Only join if not already joined (avoid duplicate joins)
    if (realtimeService.getCurrentRoom() !== code) {
      realtimeService.joinIfNeeded(code, user.name);
      activeRoomRef.current = realtimeService.getCurrentRoom();
    }
  }, [boardCode, user?.name]);

  useEffect(() => {
    if (!isAdmin && visibility === "ADMIN_ONLY") {
      setVisibility("EVERYONE");
    }
  }, [isAdmin, visibility]);

  useEffect(() => {
    const code = boardDetails?.code ?? null;
    const isReadOnly = boardDetails?.readOnly ?? false;
    if (!code) {
      if (activeRoomRef.current) {
        activeRoomRef.current = null;
      }
      realtimeService.clearRoom();
      return;
    }
    if (isReadOnly) {
      if (activeRoomRef.current === code) {
        activeRoomRef.current = null;
      }
      realtimeService.clearRoom();
      return;
    }
    if (!user?.name) return;
    // TASK 1.1: Socket join now happens immediately in boardCode effect
    // Only join here if not already joined (socket join happens earlier)
    if (realtimeService.getCurrentRoom() !== code) {
      realtimeService.joinIfNeeded(code, user.name);
      activeRoomRef.current = realtimeService.getCurrentRoom();
    }
  }, [boardDetails?.code, boardDetails?.readOnly, user?.name]);

  useEffect(() => {
    const handleConnect = () => {
      realtimeService.rejoinOnConnect(user?.name);
      activeRoomRef.current = realtimeService.getCurrentRoom();
      if (!boardDetails?.id || !boardDetails.code || readOnly) {
        return;
      }
      void fetchDeltaForBoard(
        boardDetails.code,
        boardDetails.id,
        lastReceivedRef.current[boardDetails.code]
      );
    };

    socketClient.on("connect", handleConnect);
    return () => {
      socketClient.off("connect", handleConnect);
    };
  }, [boardDetails?.code, boardDetails?.id, fetchDeltaForBoard, readOnly, user?.name]);

  useEffect(() => {
    if (!boardDetails?.id || !boardDetails.code || readOnly) return;
    let cancelled = false;
    
    // Adjust polling frequency based on socket connection state
    const getPollInterval = () => {
      return socketConnected ? 3000 : 2000; // Poll more frequently if socket is disconnected
    };
    
    const pollForMessages = () => {
      if (cancelled) return;
      const code = boardDetails.code;
      
      // If socket is disconnected, always poll (don't check lastReceived)
      if (!socketConnected) {
        const lastDelta = lastDeltaRunRef.current[code] ?? 0;
        if (Date.now() - lastDelta < 2000) {
          return;
        }
        void fetchDeltaForBoard(code, boardDetails.id);
        return;
      }
      
      // If socket is connected, use normal polling logic
      const lastISO = lastReceivedRef.current[code];
      if (lastISO) {
        const lastTime = new Date(lastISO).getTime();
        if (!Number.isNaN(lastTime) && Date.now() - lastTime < 12000) {
          return;
        }
      }
      const lastDelta = lastDeltaRunRef.current[code] ?? 0;
      if (Date.now() - lastDelta < 3000) {
        return;
      }
      void fetchDeltaForBoard(code, boardDetails.id);
    };
    
    const intervalId = window.setInterval(pollForMessages, getPollInterval());

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [boardDetails?.code, boardDetails?.id, fetchDeltaForBoard, readOnly, socketConnected]);

  useEffect(() => {
    const handleJoinedRoom = (payload: { boardCode: string }) => {
      if (!boardDetails?.id || !boardDetails.code || readOnly) return;
      if (payload.boardCode !== boardDetails.code) return;
      void fetchDeltaForBoard(
        boardDetails.code,
        boardDetails.id,
        lastReceivedRef.current[boardDetails.code]
      );
    };

    socketClient.on("joined-room", handleJoinedRoom);
    return () => {
      socketClient.off("joined-room", handleJoinedRoom);
    };
  }, [boardDetails?.code, boardDetails?.id, fetchDeltaForBoard, readOnly]);

  useEffect(() => {
    const handleReceiveMessage = (payload: any) => {
      console.log("[rt] 📩 Received message event (receive-message or message:new)", payload);
      const targetCode = payload.boardCode ?? activeBoardCode ?? null;
      if (!targetCode) {
        console.warn("[rt] ⚠️ handleReceiveMessage: No targetCode", { payload, activeBoardCode });
        return;
      }

      const normalized = normalizeMessage(mapServerMessage(payload, targetCode));

      let targetSnapshot: BoardSummary | undefined;

      setBoards((prev) => {
        let found = false;
        const next = prev.map((board) => {
          if (board.code !== targetCode) {
            return board;
          }
          found = true;
          const updatedBoard: BoardSummary = {
            ...board,
            lastActivity: normalized.createdAt ?? board.lastActivity,
            lastCommentPreview: normalized.message,
            lastCommentAt: normalized.createdAt ?? board.lastCommentAt,
            lastCommentVisibility: normalized.visibility ?? board.lastCommentVisibility,
            lastCommentAnonymous: normalized.sender === "Anonymous",
            lastCommentSenderName:
              normalized.sender === "Anonymous"
                ? normalized.actualSender ?? board.lastCommentSenderName
                : normalized.sender ?? board.lastCommentSenderName,
          };
          targetSnapshot = updatedBoard;
          return updatedBoard;
        });

        if (!found) {
          return prev;
        }

        return sortBoardSummaries(next);
      });

      if (!targetSnapshot) {
        return;
      }

      if (targetSnapshot.code === activeBoardCode) {
        setMessages((prev) => {
          // Deduplicate messages by ID or clientMessageId
          const existingIndex = prev.findIndex(
            (msg) => msg.id === normalized.id || 
            (normalized.clientMessageId && msg.clientMessageId === normalized.clientMessageId)
          );
          
          if (existingIndex >= 0) {
            // Update existing message
            if (normalized.clientMessageId && pendingMessagesRef.current.has(normalized.clientMessageId)) {
              pendingMessagesRef.current.delete(normalized.clientMessageId);
            }
            return prev.map((message, idx) =>
              idx === existingIndex
                ? {
                    ...message,
                    ...normalized,
                    status: message.status ?? normalized.status,
                  }
                : message
            );
          }
          
          // Add new message, ensuring proper order by createdAt
          const newMessages = [...prev, normalized].sort(
            (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
          );
          
          if (normalized.clientMessageId) {
            pendingMessagesRef.current.delete(normalized.clientMessageId);
          }
          
          return newMessages;
        });
      } else {
        if (targetSnapshot.readOnly || hiddenBoardIds.includes(targetSnapshot.id)) {
          return;
        }
        applyUnread(targetSnapshot.code, (count) => count + 1);
      }
      updateLastReceived(targetCode, normalized.createdAt);
    };

    const handleBoardActivity = (payload: any) => {
      const code = payload.boardCode;
      if (!code) return;
      const updates: Partial<BoardSummary> = {
        lastActivity: payload.lastActivity ?? null,
        lastCommentPreview: payload.lastCommentPreview ?? null,
        lastCommentAt: payload.lastCommentAt ?? null,
        lastCommentVisibility: payload.lastCommentVisibility ?? null,
        lastCommentAnonymous: Boolean(payload.lastCommentAnonymous),
      };
      if (payload.lastCommentSenderName !== undefined) {
        updates.lastCommentSenderName = payload.lastCommentSenderName;
      }
      updateBoardSummary(code, updates);
    };

    const handleBoardUpdated = (payload: any) => {
      const code = payload.boardCode;
      if (!code) return;
      updateBoardSummary(code, { anonymousEnabled: payload.anonymousEnabled });
      if (boardDetails?.code === code) {
        setBoardDetails((prev) => (prev ? { ...prev, anonymousEnabled: payload.anonymousEnabled } : prev));
        if (!payload.anonymousEnabled) {
          setAnonymousMode(false); // Reset to default (OFF) if anonymous is disabled on board
        }
      }
    };

    const handleBoardDeleted = (payload: any) => {
      const code = payload.boardCode;
      if (!code) return;
      setBoards((prev) => prev.filter((board) => board.code !== code));
      if (boardDetails?.code === code) {
        if (activeRoomRef.current === code) {
          activeRoomRef.current = null;
        }
        realtimeService.clearRoom();
        navigate("/app");
      }
    };

    const handleMembershipUpdated = (payload: { boardCode: string; userId: string; action: "joined" | "left" }) => {
      const { boardCode: code, userId, action } = payload;
      if (!user || !code) return;

      if (action === "joined") {
        if (userId === user.id) {
          updateBoardSummary(code, { membershipStatus: "ACTIVE", readOnly: false });
          if (boardDetails?.code === code) {
            setBoardDetails((prev) => (prev ? { ...prev, membershipStatus: "ACTIVE", readOnly: false } : prev));
          }
        }
        // Removed redundant loadBoardDetails call - optimistic updates handle UI
        return;
      }

      if (action === "left") {
        if (userId === user?.id) {
          updateBoardSummary(code, { membershipStatus: "LEFT", readOnly: true });
          if (activeRoomRef.current === code) {
            activeRoomRef.current = null;
          }
          realtimeService.clearRoom();
          resetUnread(code);
          if (boardDetails?.code === code) {
            setBoardDetails((prev) =>
              prev ? { ...prev, membershipStatus: "LEFT", readOnly: true } : prev
            );
            setMessages((prev) => prev);
            navigate("/app");
          }
        }
        // Removed redundant loadBoardDetails call - optimistic updates handle UI
      }
    };

    const handleUserJoined = (payload: { name: string }) => {
      if (!boardDetails?.code || !payload?.name) return;
      try {
        const systemMessage: ChatMessage = {
          id: `system-join-${Date.now()}`,
          sender: "System",
          message: `${payload.name} joined the board`,
          system: true,
          createdAt: new Date().toISOString(),
          visibility: "EVERYONE",
          boardCode: boardDetails.code,
        };
        setMessages((prev) => [...prev, systemMessage]);
        // Update member count in sidebar
        if (boardDetails && updateBoardSummary) {
          updateBoardSummary(boardDetails.code, {
            memberCount: (boardDetails.members?.length || 0) + 1,
          });
        }
      } catch (error) {
        console.error("Error handling user joined:", error);
      }
    };

    const handleUserLeft = (payload: { name: string }) => {
      if (!boardDetails?.code || !payload?.name) return;
      try {
        const systemMessage: ChatMessage = {
          id: `system-left-${Date.now()}`,
          sender: "System",
          message: `${payload.name} left the board`,
          system: true,
          createdAt: new Date().toISOString(),
          visibility: "EVERYONE",
          boardCode: boardDetails.code,
        };
        setMessages((prev) => [...prev, systemMessage]);
        // Update member count in sidebar
        if (boardDetails && updateBoardSummary) {
          updateBoardSummary(boardDetails.code, {
            memberCount: Math.max(0, (boardDetails.members?.length || 0) - 1),
          });
        }
      } catch (error) {
        console.error("Error handling user left:", error);
      }
    };

    socketClient.on("receive-message", handleReceiveMessage);
    socketClient.on("board-activity", handleBoardActivity);
    socketClient.on("board-updated", handleBoardUpdated);
    socketClient.on("board-deleted", handleBoardDeleted);
    socketClient.on("membership-updated", handleMembershipUpdated);
    socketClient.on("user-joined", handleUserJoined);
    socketClient.on("user-left", handleUserLeft);

    const rtmEnabled = isRealtimeMessagingEnabled();
    
    // Log RTM status
    console.log("[rt] RTM Status Check:", {
      rtmEnabled,
      envVar: import.meta.env.VITE_RTM_ENABLED,
      localStorage: localStorage.getItem("tb.rtm"),
      socketConnected: getSocketConnectionState(),
      socketId: socketClient.id,
    });

    // Register RTM listeners (message:new, message:ack) - these must persist across reconnects
    const registerRTMListeners = () => {
      if (!rtmEnabled) {
        console.warn("[rt] ⚠️ RTM is disabled - listeners not registered", {
          envVar: import.meta.env.VITE_RTM_ENABLED,
          localStorage: localStorage.getItem("tb.rtm"),
        });
        return;
      }

      // Remove existing listeners first to avoid duplicates
      socketClient.off("message:new");
      socketClient.off("message:ack");

      const handleMessageNew = (payload: any) => {
        handleReceiveMessage(payload);
      };

      const handleMessageAck = (payload: { boardCode?: string; clientId?: string; id: string; createdAt?: string }) => {
        console.log("[rt] 📨 Received message:ack", payload, {
          socketId: socketClient.id,
          socketConnected: socketClient.connected,
        });
        const targetCode = payload.boardCode ?? activeBoardCode ?? null;
        if (!targetCode) {
          console.warn("[rt] ⚠️ message:ack: No targetCode", { payload, activeBoardCode });
          return;
        }

        console.log("[rt] ✅ Processing message:ack for board:", targetCode, "clientId:", payload.clientId);

        setMessages((prev) => {
          const idx = prev.findIndex((msg) => (!!payload.clientId && msg.clientMessageId === payload.clientId) || msg.id === payload.id);
          if (idx < 0) {
            console.warn("[rt] ⚠️ message:ack: Message not found in list", { clientId: payload.clientId, id: payload.id, messageCount: prev.length });
            return prev;
          }

          console.log("[rt] ✅ Found message at index", idx, "updating status to 'sent'");
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            id: payload.id,
            status: "sent",
            createdAt: payload.createdAt ?? next[idx].createdAt,
          };
          return next;
        });

        if (payload.clientId) {
          pendingMessagesRef.current.delete(payload.clientId);
        }

        if (payload.createdAt) {
          updateLastReceived(targetCode, payload.createdAt);
        }
      };

      socketClient.on("message:new", handleMessageNew);
      socketClient.on("message:ack", handleMessageAck);

      const isConnected = getSocketConnectionState();
      console.log("[rt] ✅ RTM listeners registered", {
        socketConnected: isConnected,
        socketId: socketClient.id,
        activeBoardCode,
        timestamp: new Date().toISOString(),
      });
    };

    // Register listeners immediately
    registerRTMListeners();

    // Re-register on reconnect to ensure they persist
    const handleReconnect = () => {
      console.log("[rt] 🔄 Socket reconnected, re-registering RTM listeners");
      registerRTMListeners();
    };

    const handleConnect = () => {
      // Also register on initial connect (in case reconnect didn't fire)
      registerRTMListeners();
    };

    socketClient.on("reconnect", handleReconnect);
    socketClient.on("connect", handleConnect);

    return () => {
      socketClient.off("receive-message", handleReceiveMessage);
      socketClient.off("board-activity", handleBoardActivity);
      socketClient.off("board-updated", handleBoardUpdated);
      socketClient.off("board-deleted", handleBoardDeleted);
      socketClient.off("membership-updated", handleMembershipUpdated);
      socketClient.off("user-joined", handleUserJoined);
      socketClient.off("user-left", handleUserLeft);
      socketClient.off("reconnect", handleReconnect);
      socketClient.off("connect", handleConnect);
      // Remove RTM listeners
      socketClient.off("message:new");
      socketClient.off("message:ack");
    };
  }, [activeBoardCode, applyUnread, boardDetails, hiddenBoardIds, loadBoardDetails, navigate, updateBoardSummary, updateLastReceived, user]);

  const handleSendMessage = useCallback(async () => {
    if (!user || !boardDetails || !boardDetails.id || !boardDetails.code) return;
    const trimmed = composerValue.trim();
    if (!trimmed) return;
    const effectiveVisibility =
      visibility === "ADMIN_ONLY" && !isAdmin ? "EVERYONE" : visibility;
    if (visibility === "ADMIN_ONLY" && !isAdmin) {
      setVisibility("EVERYONE");
    }

    const legacySend = async () => {
      const clientMessageId = `client-${Date.now()}`;
      const createdAt = new Date().toISOString();
      const optimistic: ChatMessage = {
        id: clientMessageId,
        clientMessageId,
        boardCode: boardDetails.code,
        sender: anonymousMode ? "Anonymous" : user.name,
        actualSender: user.name,
        message: trimmed,
        visibility: effectiveVisibility,
        createdAt,
        senderId: user.id,
        userId: user.id,
      };

      setComposerValue("");
      pendingMessagesRef.current.add(clientMessageId);
      setMessages((prev) => [...prev, optimistic]);
      updateLastReceived(boardDetails.code, createdAt);

      startTransition(() => {
        updateBoardSummary(boardDetails.code, {
          lastActivity: createdAt,
          lastCommentPreview: trimmed,
          lastCommentAt: createdAt,
          lastCommentVisibility: effectiveVisibility,
          lastCommentAnonymous: anonymousMode,
          lastCommentSenderName: user.name,
        });
      });

      const headers = getAuthHeaders();
      if (!headers) return;
      try {
        await realtimeService.handleSend(
          {
            content: trimmed,
            visibility: effectiveVisibility,
            boardId: boardDetails.id,
            anonymous: anonymousMode,
            clientMessageId,
          },
          headers
        );
      } catch (error: any) {
        pendingMessagesRef.current.delete(clientMessageId);
        if (error?.response?.status === 401) {
          handleAuthFailure();
          return;
        }
        console.error("Failed to send message", error);
      }
    };

    const realtimeSend = async () => {
      const clientMessageId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `client-${Date.now()}`;
      const createdAt = new Date().toISOString();
      const optimistic: ChatMessage = {
        id: clientMessageId,
        clientMessageId,
        boardCode: boardDetails.code,
        sender: anonymousMode ? "Anonymous" : user.name,
        actualSender: user.name,
        message: trimmed,
        visibility: effectiveVisibility,
        createdAt,
        senderId: user.id,
        userId: user.id,
        status: "sending",
      };

      setComposerValue("");
      pendingMessagesRef.current.add(clientMessageId);
      setMessages((prev) => [...prev, optimistic]);
      updateLastReceived(boardDetails.code, createdAt);

      startTransition(() => {
        updateBoardSummary(boardDetails.code, {
          lastActivity: createdAt,
          lastCommentPreview: trimmed,
          lastCommentAt: createdAt,
          lastCommentVisibility: effectiveVisibility,
          lastCommentAnonymous: anonymousMode,
          lastCommentSenderName: user.name,
        });
      });

      const headers = getAuthHeaders();
      if (!headers) return;
      try {
        await realtimeService.handleSend(
          {
            content: trimmed,
            visibility: effectiveVisibility,
            boardId: boardDetails.id,
            anonymous: anonymousMode,
            clientMessageId,
          },
          headers
        );
      } catch (error: any) {
        pendingMessagesRef.current.delete(clientMessageId);
        setMessages((prev) =>
          prev.map((message) =>
            message.clientMessageId === clientMessageId ? { ...message, status: "failed" } : message
          )
        );
        if (error?.response?.status === 401) {
          handleAuthFailure();
          return;
        }
        console.error("Failed to send message", error);
      }
    };

    if (!isRealtimeMessagingEnabled()) {
      await legacySend();
      return;
    }

    await realtimeSend();
  }, [
    anonymousMode,
    boardDetails,
    composerValue,
    getAuthHeaders,
    handleAuthFailure,
    isAdmin,
    updateBoardSummary,
    updateLastReceived,
    user,
    visibility,
  ]);

  const handleToggleAnonymous = useCallback(
    async (enabled: boolean) => {
      if (!boardDetails) return;
      // Only admins can disable anonymous mode
      if (!enabled && !isAdmin) {
        return; // Prevent non-admins from disabling anonymous mode
      }
      const headers = getAuthHeaders();
      if (!headers) return;
      try {
        await axios.patch(
          `${BACKEND}/api/boards/${boardDetails.id}/anonymous`,
          { enabled },
          { headers }
        );
        setBoardDetails((prev) => (prev ? { ...prev, anonymousEnabled: enabled } : prev));
        updateBoardSummary(boardDetails.code, { anonymousEnabled: enabled });
        if (!enabled) setAnonymousMode(false); // If anonymous is disabled on board, reset to default (OFF) for next message
      } catch (error: any) {
        if (error?.response?.status === 401) {
          handleAuthFailure();
          return;
        }
        console.error("Failed to toggle anonymous mode", error);
      }
    },
    [boardDetails, getAuthHeaders, handleAuthFailure, updateBoardSummary, isAdmin]
  );

  const handleRetryComments = useCallback(async () => {
    if (!boardDetails?.id || !boardDetails.code) return;
    try {
      await loadComments(boardDetails.id, boardDetails.code);
      setCommentsError(null);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        handleAuthFailure();
        return;
      }
      console.error("Retry failed", error);
      setCommentsError("Unable to load messages. Try again.");
    }
  }, [boardDetails, handleAuthFailure, loadComments]);

  const handleLoadOlder = useCallback(async () => {
    if (!boardDetails?.id || loadingOlderMessages) return;
    setCommentsError(null);
    setLoadingOlderMessages(true);
    const rtmEnabled = isRealtimeMessagingEnabled();

    const legacyLoad = async () => {
      const currentCount = messages.length;
      const headers = getAuthHeaders();
      if (!headers) return;
      const response = await axios.get(
        `${BACKEND}/api/comments/${boardDetails.id}?limit=50&offset=${currentCount}`,
        { headers }
      );
      const responseData = response.data;
      const history: ChatMessage[] = Array.isArray(responseData) ? responseData : (responseData.comments || []);

      if (history.length === 0) {
        setHasMoreMessages(false);
      } else {
        const hasMore =
          responseData.hasMore ??
          (responseData.total ? currentCount + history.length < responseData.total : true);
        setHasMoreMessages(hasMore);
      }

      const olderMessages = history.map((message) => ({ ...message, boardCode: boardDetails.code }));
      setMessages((prev) => [...olderMessages, ...prev]);
    };

    const realtimeLoad = async () => {
      if (messages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      const oldest = messages[0];
      const referenceCreatedAt = oldest.createdAt
        ? new Date(oldest.createdAt).toISOString()
        : new Date().toISOString();
      const cursorIdValue = oldest.id ?? oldest.clientMessageId ?? "";

      let url = `${BACKEND}/api/comments/${boardDetails.id}?limit=50&before=${encodeURIComponent(
        referenceCreatedAt
      )}`;
      if (cursorIdValue) {
        url += `&cursorId=${encodeURIComponent(cursorIdValue)}`;
      }

      const headers = getAuthHeaders();
      if (!headers) return;
      const response = await axios.get(url, { headers });
      const responseData = response.data;
      const history: ChatMessage[] = Array.isArray(responseData) ? responseData : (responseData.comments || []);

      const hasMore =
        responseData.hasMore ?? (responseData.total ? history.length > 0 : history.length === 50);
      setHasMoreMessages(hasMore);

      const olderMessages = history.map((message) => ({ ...message, boardCode: boardDetails.code }));
      setMessages((prev) => [...olderMessages, ...prev]);
    };

    try {
      if (!rtmEnabled) {
        await legacyLoad();
      } else {
        await realtimeLoad();
      }
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [boardDetails, getAuthHeaders, loadingOlderMessages, messages, setCommentsError]);

  const handleCreateBoard = useCallback(async () => {
    const name = createBoardName.trim();
    if (!name) return;
    setCreateBoardError(null);
    const headers = getAuthHeaders();
    if (!headers) return;
    try {
      const response = await axios.post(
        `${BACKEND}/api/boards`,
        { name },
        { headers }
      );
      setCreateDialogOpen(false);
      setCreateBoardName("");
      setCreateBoardError(null);
      setSwitchingBoard(response.data.code); // Set loading state before navigation
      await loadBoards();
      navigate(`/board/${response.data.code}`);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        handleAuthFailure();
        return;
      }
      const errorMessage = error?.response?.data?.message || "Unable to create board. Please try again.";
      setCreateBoardError(errorMessage);
      console.error("Unable to create board", error);
    }
  }, [createBoardName, getAuthHeaders, handleAuthFailure, loadBoards, navigate]);

  const handleJoinBoard = useCallback(async () => {
    const code = joinCodeValue.trim();
    if (!code) return;
    setJoinBoardError(null);
    const headers = getAuthHeaders();
    if (!headers) return;
    try {
      const response = await axios.post(
        `${BACKEND}/api/boards/join`,
        { code },
        { headers }
      );
      setJoinDialogOpen(false);
      setJoinCodeValue("");
      setJoinBoardError(null);
      debouncedLoadBoards();
      const target = response.data?.board?.code ?? response.data?.code ?? code;
      navigate(`/board/${target}`);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        handleAuthFailure();
        return;
      }
      const errorMessage = error?.response?.data?.message || "Unable to join board. Please check the code and try again.";
      setJoinBoardError(errorMessage);
      console.error("Unable to join board", error);
    }
  }, [getAuthHeaders, handleAuthFailure, joinCodeValue, debouncedLoadBoards, navigate]);

  const handleLeaveBoard = useCallback(async () => {
    if (!modal || modal.type !== "leave") return;
    const headers = getAuthHeaders();
    if (!headers) return;
    try {
      await axios.delete(`${BACKEND}/api/boards/${modal.board.id}/leave`, { headers });
      updateBoardSummary(modal.board.code, { membershipStatus: "LEFT", readOnly: true });
      if (boardDetails?.code === modal.board.code) {
        if (activeRoomRef.current === modal.board.code) {
          activeRoomRef.current = null;
        }
        delete lastReceivedRef.current[modal.board.code];
        delete lastDeltaRunRef.current[modal.board.code];
        realtimeService.clearRoom();
        setBoardDetails((prev) =>
          prev ? { ...prev, membershipStatus: "LEFT", readOnly: true } : prev
        );
        navigate("/app");
      }
      debouncedLoadBoards();
    } catch (error: any) {
      if (error?.response?.status === 401) {
        handleAuthFailure();
        return;
      }
      console.error("Failed to leave board", error);
    } finally {
      setModal(null);
    }
  }, [boardDetails, getAuthHeaders, handleAuthFailure, debouncedLoadBoards, modal, navigate, updateBoardSummary]);

  const handleHideBoard = useCallback(
    (board: { id: string; code: string; name: string }) => {
      setHiddenBoardIds((prev) => (prev.includes(board.id) ? prev : [...prev, board.id]));
      applyUnread(board.code, () => 0);
      if (boardDetails?.code === board.code) {
        if (activeRoomRef.current === board.code) {
          activeRoomRef.current = null;
        }
        delete lastReceivedRef.current[board.code];
        delete lastDeltaRunRef.current[board.code];
        realtimeService.clearRoom();
        setRightPanelOpen(false);
        navigate("/app");
      }
    },
    [applyUnread, boardDetails, navigate, setHiddenBoardIds, setRightPanelOpen]
  );

  const visibleBoards = useMemo(
    () => boards.filter((board) => !hiddenBoardIds.includes(board.id)),
    [boards, hiddenBoardIds]
  );

  const sidebarBoards = useMemo(
    () =>
      visibleBoards.map((board) => ({
        ...board,
        unread: unreadByBoard[board.code] ?? 0,
      })),
    [unreadByBoard, visibleBoards]
  );

  useEffect(() => {
    setUnreadByBoard((prev) => {
      const allowed = new Set(boards.map((board) => board.code));
      let changed = false;
      const next: Record<string, number> = {};
      Object.entries(prev).forEach(([code, value]) => {
        if (allowed.has(code)) {
          next[code] = value;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [boards, setUnreadByBoard]);

  // Prefetch function for board data (single board)
  const prefetchBoard = useCallback(
    async (code: string) => {
      const headers = getAuthHeaders();
      if (!headers) return;
      
      // Don't prefetch if already cached or currently active
      const cached = boardCacheRef.current.get(code);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
      if (boardDetails?.code === code) return;
      
      try {
        const boardResponse = await axios.get(`${BACKEND}/api/boards/by-code/${code}`, { headers });
        const details = boardResponse.data as BoardDetails;
        // TASK 1.2: Reduced limit from 100 to 50 for faster first load
        const commentsData = await axios.get(`${BACKEND}/api/comments/${details.id}?limit=50`, { headers });
        const commentsResponseData = commentsData.data;
        const comments: ChatMessage[] = Array.isArray(commentsResponseData) ? commentsResponseData : (commentsResponseData.comments || []);
        const shapedMessages = comments.map((message) => ({
          ...message,
          boardCode: details.code,
        }));
        
        boardCacheRef.current.set(code, {
          details,
          comments: shapedMessages,
          timestamp: Date.now(),
        });
      } catch (error) {
        // Silently fail prefetch
      }
    },
    [getAuthHeaders, boardDetails?.code]
  );

  const handleSelectBoard = useCallback(
    (code: string) => {
      if (!code) return;
      if (boardDetails?.code === code) {
        setSidebarOpen(false);
        setRightPanelOpen(false);
        return;
      }
      
      // PROMPT 1: Update title instantly from boards list (synchronous, <16ms)
      const targetBoard = boards.find((b) => b.code === code);
      if (targetBoard) {
        setOptimisticBoardName(targetBoard.name);
      }
      
      // PROMPT 3: Check cache and set optimistic board details immediately
      const cached = boardCacheRef.current.get(code);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        // Show cached data instantly
        setBoardDetails(cached.details);
        mergeIncomingMessages(cached.details.code, cached.comments);
        setSwitchingBoard(null); // No skeleton needed, we have cache
      } else {
        // PROMPT 4: Show skeleton immediately for uncached boards
        setSwitchingBoard(code);
        // PROMPT 4: Set minimal optimistic boardDetails for title
        if (targetBoard) {
          setBoardDetails({
            id: "", // Will be replaced when real data loads
            name: targetBoard.name,
            code: targetBoard.code,
            anonymousEnabled: targetBoard.anonymousEnabled,
            lastActivity: targetBoard.lastActivity,
            members: [],
            membershipRole: targetBoard.role ?? "MEMBER",
            membershipStatus: targetBoard.membershipStatus,
            readOnly: targetBoard.readOnly,
            isCreator: targetBoard.isCreator,
          });
        }
        // PROMPT 6: Only clear messages if no cache (show skeleton instead)
        setMessages([]);
      }
      
      setCommentsError(null);
      setComposerValue("");
      setVisibility("EVERYONE");
      setAnonymousMode(false); // Reset to default (OFF) when switching boards
      setHasMoreMessages(true); // Reset when switching boards
      setSwitchingBoard(code); // Set loading state immediately
      pendingMessagesRef.current.clear();
      if (activeRoomRef.current === boardDetails?.code) {
        activeRoomRef.current = null;
      }
      realtimeService.clearRoom();
      setSidebarOpen(false);
      setRightPanelOpen(false);
      resetUnread(code);
      localStorage.setItem(LAST_BOARD_KEY, code);
      navigate(`/board/${code}`);
    },
    [boards, boardDetails?.code, navigate, resetUnread, mergeIncomingMessages]
  );

  const handleTogglePin = useCallback(
    async (code: string) => {
      const target = boards.find((board) => board.code === code);
      if (!target) return;
      const headers = getAuthHeaders();
      if (!headers) return;
      
      // Optimistic update - show change immediately
      const newPinnedState = !target.pinned;
      setBoards((prev) => sortBoardSummaries(prev.map((board) => 
        board.id === target.id ? { ...board, pinned: newPinnedState } : board
      )));
      
      try {
        const response = await axios.patch(
          `${BACKEND}/api/boards/${target.id}/pin`,
          { pinned: newPinnedState },
          { headers }
        );
        const updated: BoardSummary = response.data;
        // Update with server response (in case server has different data)
        setBoards((prev) => sortBoardSummaries(prev.map((board) => (board.id === updated.id ? updated : board))));
      } catch (error) {
        // Revert on error
        console.error("Failed to update pinned status", error);
        setBoards((prev) => sortBoardSummaries(prev.map((board) => 
          board.id === target.id ? { ...board, pinned: target.pinned } : board
        )));
      }
    },
    [boards, getAuthHeaders]
  );

  const handleCopyInvite = useCallback((code: string) => {
    const url = `${window.location.origin}/board/${code}`;
    navigator.clipboard
      .writeText(url)
      .catch((error) => console.error("Failed to copy invite link", error));
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem(REDIRECT_KEY);
    localStorage.removeItem(HIDDEN_STORAGE_KEY);
    localStorage.removeItem(UNREAD_STORAGE_KEY);
    localStorage.removeItem(LAST_BOARD_KEY);
    setUser(null);
    setBoards([]);
    setBoardDetails(null);
    setMessages([]);
    setComposerValue("");
    setAnonymousMode(false); // Reset to default (OFF)
    setVisibility("EVERYONE");
    setCreateDialogOpen(false);
    setJoinDialogOpen(false);
    setCreateBoardName("");
    setJoinCodeValue("");
    setModal(null);
    setSidebarOpen(false);
    setRightPanelOpen(false);
    setLoadingHistory(false);
    setCommentsError(null);
    setHiddenBoardIds([]);
    setUnreadByBoard({});
    activeRoomRef.current = null;
    realtimeService.clearRoom();
    navigate("/", { replace: true });
  }, [navigate, setHiddenBoardIds, setUnreadByBoard]);

  const readOnlyBanner = boardDetails?.readOnly
    ? "You left this board; history is read-only."
    : undefined;

  const sidebarCommonProps = {
    boards: sidebarBoards,
    activeCode: boardDetails?.code ?? null,
    onSelectBoard: handleSelectBoard,
    onTogglePin: handleTogglePin,
    onHideBoard: handleHideBoard,
    onLeaveBoard: (board: { id: string; code: string; name: string }) => setModal({ type: "leave", board }),
    onCreateBoard: () => setCreateDialogOpen(true),
    onJoinBoard: () => setJoinDialogOpen(true),
    onLogout: handleLogout,
    unreadByBoard,
    showFooterActions: Boolean(boardDetails?.code),
    onPrefetchBoard: prefetchBoard,
  } as const;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {isInitialLoad && user ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
          <div className="w-full max-w-md px-6">
            <p className="mb-4 text-center text-sm text-slate-600">Loading your boards...</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${initialLoadProgress}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
      <Sidebar variant="desktop" {...sidebarCommonProps} />

      <main className="flex h-full flex-1 flex-col overflow-hidden">
        <ChatHeader
          title={optimisticBoardName ?? boardDetails?.name ?? "TeamBoard"}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenRightPanel={() => {
            if (boardDetails) {
              setRightPanelOpen(true);
            }
          }}
          socketConnected={socketConnected}
        />

        {boardDetails ? (
          <>
            {switchingBoard && switchingBoard !== boardDetails?.code ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-500" />
                <p className="text-sm text-slate-600">Loading board...</p>
              </div>
            ) : (
              <MessageList
                key={boardDetails.code}
                messages={messages.map(normalizeMessage)}
                isAdmin={isAdmin}
                currentUserId={user?.id}
                currentUserName={user?.name}
                isLoading={loadingHistory || switchingBoard === boardDetails.code}
                isLoadingOlder={loadingOlderMessages}
                onLoadOlder={boardDetails.id ? handleLoadOlder : undefined}
                hasMoreMessages={hasMoreMessages}
              />
            )}

            {commentsError ? (
              <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {commentsError}{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => handleRetryComments()}
                >
                  Retry
                </button>
              </div>
            ) : null}

            <ChatComposer
              value={composerValue}
              onChange={setComposerValue}
              onSend={handleSendMessage}
              anonymous={anonymousMode}
              onToggleAnonymous={setAnonymousMode}
              visibility={visibility}
              onChangeVisibility={setVisibility}
              isAnonymousAllowed={boardDetails.anonymousEnabled}
              canUseAdminOnly={isAdmin}
              isAdmin={isAdmin}
              readOnly={readOnly}
              disabled={!user || readOnly}
              readOnlyMessage={readOnlyBanner}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
            <div>
              <h2 className="text-3xl font-semibold text-slate-800">Welcome to TeamBoard</h2>
              <p className="mt-2 text-sm text-slate-500">
                Create a new board or join one with a code to get started.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                type="button"
                onClick={() => setCreateDialogOpen(true)}
                className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-600"
              >
                Create board
              </button>
              <button
                type="button"
                onClick={() => setJoinDialogOpen(true)}
                className="rounded-full border border-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50"
              >
                Join with code
              </button>
            </div>
          </div>
        )}
      </main>

      <RightPanel
        board={boardDetails}
        isAdmin={isAdmin}
        isReadOnly={readOnly}
        onToggleAnonymous={handleToggleAnonymous}
        onCopyInvite={handleCopyInvite}
        isVisible={Boolean(boardDetails)}
      />

      {isSidebarOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center bg-slate-900/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="h-full w-[85vw] max-w-[320px]" onClick={(event) => event.stopPropagation()}>
            <Sidebar variant="mobile" {...sidebarCommonProps} onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      ) : null}

      {isRightPanelOpen && boardDetails ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-slate-900/60 lg:hidden"
          onClick={() => setRightPanelOpen(false)}
        >
          <div className="h-full w-[85vw] max-w-[360px] bg-white" onClick={(event) => event.stopPropagation()}>
            <RightPanel
              board={boardDetails}
              isAdmin={isAdmin}
              isReadOnly={readOnly}
              onToggleAnonymous={handleToggleAnonymous}
              onCopyInvite={handleCopyInvite}
              isVisible
              variant="mobile"
              onClose={() => setRightPanelOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={modal?.type === "leave"}
        title="Leave board?"
        description="You won't receive new messages after leaving, but you can still read past history."
        confirmLabel="Leave board"
        onConfirm={handleLeaveBoard}
        onCancel={() => setModal(null)}
      />

      <InputDialog
        title="Create a board"
        placeholder="Board name"
        confirmLabel="Create"
        open={createDialogOpen}
        value={createBoardName}
        onChange={(value) => {
          setCreateBoardName(value);
          setCreateBoardError(null);
        }}
        onClose={() => {
          setCreateDialogOpen(false);
          setCreateBoardName("");
          setCreateBoardError(null);
        }}
        onSubmit={handleCreateBoard}
        error={createBoardError}
      />

      <InputDialog
        title="Join a board"
        placeholder="Enter code"
        confirmLabel="Join"
        open={joinDialogOpen}
        value={joinCodeValue}
        onChange={(value) => {
          setJoinCodeValue(value);
          setJoinBoardError(null);
        }}
        onClose={() => {
          setJoinDialogOpen(false);
          setJoinCodeValue("");
          setJoinBoardError(null);
        }}
        onSubmit={handleJoinBoard}
        error={joinBoardError}
      />
      
    </div>
  );
}

type InputDialogProps = {
  open: boolean;
  title: string;
  placeholder: string;
  confirmLabel: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  error?: string | null;
};

const InputDialog = ({
  open,
  title,
  placeholder,
  confirmLabel,
  value,
  onChange,
  onSubmit,
  onClose,
  error,
}: InputDialogProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (value.trim()) {
                onSubmit();
              }
            }
          }}
          placeholder={placeholder}
          className={`mt-4 w-full rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 ${
            error
              ? "border-red-300 focus:border-red-500 focus:ring-red-200"
              : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-200"
          }`}
        />
        {error ? (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="order-1 w-full rounded-full border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 sm:order-none sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim()}
            className="w-full rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

