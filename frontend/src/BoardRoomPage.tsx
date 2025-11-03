// src/BoardRoomPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import socketClient from "./socket";
import { Sidebar } from "./components/chat/Sidebar";
import { ChatHeader } from "./components/chat/ChatHeader";
import { MessageList, type ChatMessage } from "./components/chat/MessageList";
import { ChatComposer } from "./components/chat/ChatComposer";
import { RightPanel } from "./components/chat/RightPanel";
import { ConfirmModal } from "./components/ui/ConfirmModal";

const BACKEND = import.meta.env.VITE_BACKEND_URL;

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
  isCreator: boolean;
  comments?: ChatMessage[];
};

type ModalState = {
  type: "leave" | "delete";
  board: { code: string; name: string };
} | null;

const sortBoards = (list: BoardSummary[]) => {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aTime = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const bTime = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.name.localeCompare(b.name);
  });
};

export default function BoardRoomPage() {
  const { boardCode } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [boardDetails, setBoardDetails] = useState<BoardDetails | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] = useState<"EVERYONE" | "ADMIN_ONLY">("EVERYONE");
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminRef = useRef(false);
  const joinedBoardsRef = useRef<Set<string>>(new Set());
  const pendingMessagesRef = useRef<Set<string>>(new Set());
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return { Authorization: `Bearer ${token}` } as const;
  }, []);

  const updateBoardMeta = useCallback((code: string, updates: Partial<BoardSummary>) => {
    setBoards((prev) =>
      sortBoards(
        prev.map((board) => (board.code === code ? { ...board, ...updates } : board))
      )
    );
  }, []);

  const removeBoardFromState = useCallback((code: string) => {
    setBoards((prev) => prev.filter((board) => board.code !== code));
    joinedBoardsRef.current.delete(code);
  }, []);

  const loadBoards = useCallback(async () => {
    const headers = getAuthHeaders();
    if (!headers) return;
    const response = await axios.get(`${BACKEND}/api/boards`, { headers });
    const data: BoardSummary[] = response.data;
    setBoards(sortBoards(data));
  }, [getAuthHeaders]);

  const loadComments = useCallback(async (id: string) => {
    const headers = getAuthHeaders();
    if (!headers) return;
    const response = await axios.get(`${BACKEND}/api/comments/${id}`, {
      headers,
    });
    setMessages(response.data);
  }, [getAuthHeaders]);

  const loadBoardDetails = useCallback(
    async (code: string) => {
      const headers = getAuthHeaders();
      if (!headers) return null;
      const response = await axios.get(`${BACKEND}/api/boards/by-code/${code}`, {
        headers,
      });
      const data: BoardDetails = response.data;
      setBoardDetails(data);
      setBoardId(data.id);
      const adminFlag = data.isCreator || data.membershipRole === "ADMIN";
      setIsAdmin(adminFlag);
      isAdminRef.current = adminFlag;
      setAnonymousMode(false);
      updateBoardMeta(code, {
        anonymousEnabled: data.anonymousEnabled,
        lastActivity: data.lastActivity ?? null,
      });
      return data;
    },
    [getAuthHeaders, updateBoardMeta]
  );

  useEffect(() => {
    const headers = getAuthHeaders();
    if (!headers) {
      setUser(null);
      setAuthLoading(false);
      return;
    }

    const bootstrap = async () => {
      try {
        setAuthLoading(true);
        const authResponse = await axios.get(`${BACKEND}/api/test-auth`, {
          headers,
        });
        setUser({
          id: authResponse.data.user.id,
          name: authResponse.data.user.name,
          email: authResponse.data.user.email,
        });
        await loadBoards();
      } catch (error) {
        console.error("Failed to bootstrap user", error);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    bootstrap();
  }, [getAuthHeaders, loadBoards]);

  useEffect(() => {
    let active = true;
    const fetchBoard = async () => {
      if (!boardCode) {
        setBoardDetails(null);
        setBoardId(null);
        setMessages([]);
        return;
      }
      try {
        setLoadingHistory(true);
        setCommentsError(null);
        const details = await loadBoardDetails(boardCode);
        if (!details || !active) return;
        setMessages(details.comments ?? []);
      } catch (error) {
        console.error("Unable to fetch board details", error);
        if (active) {
          setBoardDetails(null);
          setBoardId(null);
          setMessages([]);
        }
      } finally {
        if (active) setLoadingHistory(false);
      }
    };

    fetchBoard();
    return () => {
      active = false;
    };
  }, [boardCode, loadBoardDetails, loadComments, navigate]);

  useEffect(() => {
    if (!boardCode || !user) return;
    const joinedBoards = joinedBoardsRef.current;
    if (joinedBoards.has(boardCode)) return;
    socketClient.emit("join-board", { boardCode, name: user.name });
    joinedBoards.add(boardCode);
  }, [boardCode, user]);

  useEffect(() => {
    const socket = socketClient;

    const handleReceiveMessage = (data: ChatMessage & { senderId?: string; clientMessageId?: string }) => {
      const isOwnAdminOnly =
        data.visibility === "ADMIN_ONLY" && data.senderId && data.senderId === user?.id;
      if (data.visibility === "ADMIN_ONLY" && !isAdminRef.current && !isOwnAdminOnly) return;
      if (data.clientMessageId && data.senderId === user?.id && pendingMessagesRef.current.has(data.clientMessageId)) {
        pendingMessagesRef.current.delete(data.clientMessageId);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          ...data,
          createdAt: data.createdAt ?? new Date().toISOString(),
        },
      ]);
      if (boardCode) {
        updateBoardMeta(boardCode, { lastActivity: new Date().toISOString() });
      }
    };

    const handleBoardActivity = ({ boardCode: code, lastActivity }: { boardCode: string; lastActivity: string }) => {
      updateBoardMeta(code, { lastActivity });
      if (boardDetails?.code === code) {
        setBoardDetails((prev) => (prev ? { ...prev, lastActivity } : prev));
      }
    };

    const handleBoardUpdated = ({ boardCode: code, anonymousEnabled }: { boardCode: string; anonymousEnabled: boolean }) => {
      updateBoardMeta(code, { anonymousEnabled });
      if (boardDetails?.code === code) {
        setBoardDetails((prev) => (prev ? { ...prev, anonymousEnabled } : prev));
        if (!anonymousEnabled) {
          setAnonymousMode(false);
        }
      }
    };

    const handleBoardDeleted = ({ boardCode: code }: { boardCode: string }) => {
      removeBoardFromState(code);
      if (boardCode === code) {
        setBoardDetails(null);
        setBoardId(null);
        setMessages([]);
        navigate("/app");
      }
    };

    const handleMembershipUpdated = ({ boardCode: code, userId: memberUserId, action }: { boardCode: string; userId: string; action: string }) => {
      const isCurrentBoard = boardDetails?.code === code;

      if (action === "joined") {
        if (isCurrentBoard) {
          void loadBoardDetails(code);
        }
        return;
      }

      if (action === "left") {
        if (memberUserId === user?.id) {
          removeBoardFromState(code);
          if (boardCode === code) {
            setBoardDetails(null);
            setBoardId(null);
            setMessages([]);
            navigate("/app");
          }
        } else if (isCurrentBoard) {
          void loadBoardDetails(code);
        }
      }
    };

    socket.on("receive-message", handleReceiveMessage);
    socket.on("board-activity", handleBoardActivity);
    socket.on("board-updated", handleBoardUpdated);
    socket.on("board-deleted", handleBoardDeleted);
    socket.on("membership-updated", handleMembershipUpdated);

    return () => {
      socket.off("receive-message", handleReceiveMessage);
      socket.off("board-activity", handleBoardActivity);
      socket.off("board-updated", handleBoardUpdated);
      socket.off("board-deleted", handleBoardDeleted);
      socket.off("membership-updated", handleMembershipUpdated);
    };
  }, [boardCode, boardDetails?.code, loadBoardDetails, navigate, removeBoardFromState, updateBoardMeta, user?.id]);

  const handleSendMessage = async () => {
    const content = message.trim();
    if (!content || !user || !boardCode || !boardId) return;

    const createdAt = new Date().toISOString();
    const clientMessageId = `client-${Date.now()}`;
    pendingMessagesRef.current.add(clientMessageId);
    setMessages((prev) => [
      ...prev,
      {
        id: clientMessageId,
        message: content,
        sender: anonymousMode ? "Anonymous" : user.name,
        actualSender: user.name,
        visibility,
        createdAt,
        senderId: user.id,
        userId: user.id,
      },
    ]);

    socketClient.emit("send-message", {
      boardCode,
      message: content,
      visibility,
      sender: anonymousMode ? "Anonymous" : user.name,
      actualSender: user.name,
      senderId: user.id,
      clientMessageId,
    });

    updateBoardMeta(boardCode, { lastActivity: new Date().toISOString() });

    const headers = getAuthHeaders();
    if (headers) {
      try {
        await axios.post(
          `${BACKEND}/api/comments`,
          { content, visibility, boardId, anonymous: anonymousMode },
          { headers }
        );
      } catch (error) {
        console.warn("Failed to persist comment", error);
      }
    }

    setMessage("");
  };

  const handleAnonymousToggle = async (enabled: boolean) => {
    if (!boardId) return;
    const headers = getAuthHeaders();
    if (!headers) return;
    try {
      await axios.patch(
        `${BACKEND}/api/boards/${boardId}/anonymous`,
        { enabled },
        { headers }
      );
      updateBoardMeta(boardCode ?? "", { anonymousEnabled: enabled });
      setBoardDetails((prev) => (prev ? { ...prev, anonymousEnabled: enabled } : prev));
      if (!enabled) {
        setAnonymousMode(false);
      }
    } catch (error) {
      console.error("Failed to toggle anonymous mode", error);
    }
  };

  const handleTogglePin = async (code: string) => {
    const target = boards.find((board) => board.code === code);
    if (!target) return;
    const headers = getAuthHeaders();
    if (!headers) return;
    try {
      const response = await axios.patch(
        `${BACKEND}/api/boards/${target.id}/pin`,
        { pinned: !target.pinned },
        { headers }
      );
      const updated: BoardSummary = response.data;
      setBoards((prev) => sortBoards(prev.map((board) => (board.id === updated.id ? updated : board))));
    } catch (error) {
      console.error("Failed to update pinned status", error);
    }
  };

  const openLeaveModal = (board: { code: string; name: string }) => setModal({ type: "leave", board });
  const openDeleteModal = (board: { code: string; name: string }) => setModal({ type: "delete", board });

  const handleRetryComments = useCallback(async () => {
    if (!boardId) return;
    try {
      setCommentsError(null);
      await loadComments(boardId);
    } catch (error) {
      console.warn("Retrying comments failed", error);
      setCommentsError("Couldn't load previous messages. You can still chat.");
    }
  }, [boardId, loadComments]);

  const handleModalConfirm = async () => {
    if (!modal) return;
    const headers = getAuthHeaders();
    if (!headers) {
      setModal(null);
      return;
    }
    const target = boards.find((board) => board.code === modal.board.code);
    if (!target) {
      setModal(null);
      return;
    }

    try {
      if (modal.type === "leave") {
        await axios.delete(`${BACKEND}/api/boards/${target.id}/leave`, { headers });
      } else {
        await axios.delete(`${BACKEND}/api/boards/${target.id}`, { headers });
      }
      removeBoardFromState(target.code);
      if (boardCode === target.code) {
        setBoardDetails(null);
        setBoardId(null);
        setMessages([]);
        navigate("/app");
      }
    } catch (error) {
      console.error("Failed to process board action", error);
    } finally {
      setModal(null);
    }
  };

  const handleModalCancel = () => setModal(null);

  const currentBoardSummary = useMemo(
    () => boards.find((board) => board.code === boardCode) ?? null,
    [boards, boardCode]
  );

  const composerAnonymousAllowed = boardDetails?.anonymousEnabled ?? currentBoardSummary?.anonymousEnabled ?? false;

  useEffect(() => {
    if (!composerAnonymousAllowed) {
      setAnonymousMode(false);
    }
  }, [composerAnonymousAllowed]);

  return (
    <div className="h-screen overflow-hidden bg-slate-100">
      <div className="mx-auto flex h-full max-w-[1600px] overflow-hidden">
        <Sidebar
          boards={boards}
          activeCode={boardCode ?? undefined}
          pinned={boards.filter((board) => board.pinned).map((board) => board.code)}
          lastActivity={Object.fromEntries(boards.map((board) => [board.code, board.lastActivity ?? undefined]))}
          onSelectBoard={(code) => navigate(`/board/${code}`)}
          onTogglePin={handleTogglePin}
          onRequestLeave={(board) => openLeaveModal({ code: board.code, name: board.name })}
          onRequestDelete={(board) => openDeleteModal({ code: board.code, name: board.name })}
          isAdmin={isAdmin}
        />

        <div className="flex h-full flex-1 flex-col overflow-hidden bg-slate-50">
          <ChatHeader
            title={boardDetails?.name ?? currentBoardSummary?.name ?? "TeamBoard"}
            memberCount={boardDetails?.members.length ?? currentBoardSummary?.memberCount ?? 0}
            anonymousEnabled={boardDetails?.anonymousEnabled ?? currentBoardSummary?.anonymousEnabled ?? false}
            isAdmin={isAdmin}
          />

          {commentsError ? (
            <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>{commentsError}</span>
              <button
                type="button"
                onClick={handleRetryComments}
                className="rounded-md border border-amber-300 px-3 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
                disabled={loadingHistory}
              >
                Retry
              </button>
            </div>
          ) : null}

          <MessageList
            messages={messages}
            isAdmin={isAdmin}
            currentUserId={user?.id}
            currentUserName={user?.name}
            typingIndicator={[]}
            isLoading={authLoading || loadingHistory}
          />

          <ChatComposer
            message={message}
            onMessageChange={setMessage}
            onSend={handleSendMessage}
            anonymous={anonymousMode}
            onToggleAnonymous={setAnonymousMode}
            visibility={visibility}
            onChangeVisibility={setVisibility}
            isAnonymousAllowed={composerAnonymousAllowed}
            disabled={!user || !boardId}
          />
        </div>

        <RightPanel
          boardCode={boardCode ?? ""}
          adminName={
            boardDetails?.members?.find((member) => member.role === "ADMIN")?.user?.name || "Admin"
          }
          members={boardDetails?.members ?? []}
          isAdmin={isAdmin}
          anonymousEnabled={boardDetails?.anonymousEnabled ?? currentBoardSummary?.anonymousEnabled ?? false}
          onToggleAnonymous={handleAnonymousToggle}
          onRequestLeave={() => {
            if (boardDetails) {
              openLeaveModal({ code: boardDetails.code, name: boardDetails.name });
            }
          }}
          onRequestDelete={() => {
            if (boardDetails) {
              openDeleteModal({ code: boardDetails.code, name: boardDetails.name });
            }
          }}
        />
      </div>

      <ConfirmModal
        open={Boolean(modal)}
        title={modal ? `${modal.type === "leave" ? "Leave" : "Delete"} board: "${modal.board.name}"?` : ""}
        description={
          modal
            ? modal.type === "leave"
              ? "You can rejoin if you have an invite code."
              : "This action will remove the board for you. Admins may remove it for everyone."
            : undefined
        }
        confirmLabel={modal ? (modal.type === "leave" ? "Leave board" : "Delete board") : ""}
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
      />
    </div>
  );
}
