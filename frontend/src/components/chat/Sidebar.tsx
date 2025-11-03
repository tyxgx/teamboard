import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type MembershipStatus = "ACTIVE" | "LEFT";

export type SidebarBoard = {
  id: string;
  code: string;
  name: string;
  pinned: boolean;
  lastActivity: string | null;
  lastCommentPreview: string | null;
  lastCommentAt: string | null;
  lastCommentVisibility: "EVERYONE" | "ADMIN_ONLY" | null;
  lastCommentAnonymous: boolean;
  lastCommentSenderName: string | null;
  membershipStatus: MembershipStatus;
  readOnly: boolean;
  unread: number;
};

type SidebarProps = {
  boards: SidebarBoard[];
  activeCode?: string | null;
  unreadByBoard: Record<string, number>;
  onSelectBoard: (code: string) => void;
  onTogglePin: (code: string) => void;
  onHideBoard: (board: { id: string; code: string; name: string }) => void;
  onLeaveBoard: (board: { id: string; code: string; name: string }) => void;
  onCreateBoard: () => void;
  onJoinBoard: () => void;
  onLogout: () => void;
  showFooterActions: boolean;
  variant?: "desktop" | "mobile";
  onClose?: () => void;
};

const formatRelative = (iso?: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const buildPreview = (board: SidebarBoard) => {
  if (!board.lastCommentPreview) return "No messages yet";
  const label =
    board.lastCommentAnonymous && board.lastCommentSenderName
      ? `Anonymous (${board.lastCommentSenderName})`
      : board.lastCommentAnonymous
      ? "Anonymous"
      : board.lastCommentSenderName ?? "Someone";
  return `${label}: ${board.lastCommentPreview}`;
};

export const Sidebar = ({
  boards,
  activeCode,
  unreadByBoard,
  onSelectBoard,
  onTogglePin,
  onHideBoard,
  onLeaveBoard,
  onCreateBoard,
  onJoinBoard,
  onLogout,
  showFooterActions,
  variant = "desktop",
  onClose,
}: SidebarProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [accountMenu, setAccountMenu] = useState(false);

  const filteredBoards = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return boards;
    return boards.filter((board) => board.name.toLowerCase().includes(trimmed));
  }, [boards, query]);

  const closeMenus = () => {
    setMenuOpen(null);
    setAccountMenu(false);
  };

  const closeIfMobile = () => {
    if (variant === "mobile" && onClose) {
      onClose();
    }
  };

  const containerClass =
    variant === "mobile"
      ? "flex h-full w-[85vw] max-w-[320px] flex-col bg-slate-900/95 text-slate-100 md:hidden"
      : "hidden h-full flex-col bg-slate-900/95 text-slate-100 md:flex md:w-[300px]";

  return (
    <aside className={containerClass}>
      <div className="flex items-center justify-between px-5 pb-4 pt-6">
        <button
          type="button"
          className="text-left"
          onClick={() => {
            closeMenus();
            navigate("/app");
          }}
        >
          <h1 className="text-2xl font-bold text-emerald-400">TeamBoard</h1>
          <p className="text-xs text-slate-400">Live, anonymous team feedback</p>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setAccountMenu((prev) => !prev);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-lg transition hover:bg-slate-700"
            aria-label="Account menu"
          >
            ⋮
          </button>
          {accountMenu ? (
            <div
              className="absolute right-0 z-30 mt-2 w-44 rounded-xl bg-slate-800/95 py-2 text-sm shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  closeMenus();
                  closeIfMobile();
                  onLogout();
                }}
                className="block w-full px-4 py-2 text-left text-slate-200 transition hover:bg-slate-700/50"
              >
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="flex items-center gap-2 rounded-full bg-slate-800/80 px-4 py-2 text-sm text-slate-300">
          <span aria-hidden>🔍</span>
          <input
            type="search"
            placeholder="Search boards"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent text-sm text-slate-300 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {filteredBoards.length === 0 ? (
          <p className="px-3 text-xs text-slate-500">No boards found.</p>
        ) : (
          <div className="space-y-1.5">
            {filteredBoards.map((board) => {
              const isActive = board.code === activeCode;
              const isReadOnly = board.readOnly;
              const unread = unreadByBoard[board.code] ?? board.unread ?? 0;
              const preview = buildPreview(board);
              const timeLabel = formatRelative(board.lastCommentAt ?? board.lastActivity);

              return (
                <div key={board.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      closeMenus();
                      closeIfMobile();
                      onSelectBoard(board.code);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                      isActive ? "bg-slate-700/60 shadow-inner" : "hover:bg-slate-700/40"
                    }`}
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-600/80 text-sm font-semibold text-slate-100">
                      {board.name
                        .split(" ")
                        .map((word) => word[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-100">{board.name}</p>
                        {board.pinned ? (
                          <span className="text-xs uppercase tracking-wide text-emerald-400">Pinned</span>
                        ) : null}
                        {isReadOnly ? (
                          <span className="text-xs uppercase tracking-wide text-amber-400">Read only</span>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-slate-400">{preview}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {timeLabel ? (
                        <span className="text-xs text-slate-400">{timeLabel}</span>
                      ) : null}
                      {unread > 0 ? (
                        <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-emerald-500 px-2 text-[11px] font-semibold text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      ) : null}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuOpen((prev) => (prev === board.id ? null : board.id));
                    }}
                    className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-700/60 group-hover:block"
                    aria-label="Board actions"
                  >
                    ⋮
                  </button>

                  {menuOpen === board.id ? (
                    <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded-xl bg-slate-800/95 py-2 text-sm text-slate-100 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          closeMenus();
                          closeIfMobile();
                          onTogglePin(board.code);
                        }}
                        className="block w-full px-4 py-2 text-left transition hover:bg-slate-700/50"
                      >
                        {board.pinned ? "Unpin board" : "Pin board"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          closeMenus();
                          closeIfMobile();
                          onHideBoard(board);
                        }}
                        className="block w-full px-4 py-2 text-left transition hover:bg-slate-700/50"
                      >
                        Remove from sidebar
                      </button>
                      {board.membershipStatus === "ACTIVE" ? (
                        <button
                          type="button"
                          onClick={() => {
                            closeMenus();
                            closeIfMobile();
                            onLeaveBoard(board);
                          }}
                          className="block w-full px-4 py-2 text-left text-red-300 transition hover:bg-red-500/20 hover:text-red-100"
                        >
                          Leave board
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showFooterActions ? (
        <div className="border-t border-slate-800/60 bg-slate-900/70 px-4 py-4">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                closeMenus();
                closeIfMobile();
                onCreateBoard();
              }}
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Create new board
            </button>
            <button
              type="button"
              onClick={() => {
                closeMenus();
                closeIfMobile();
                onJoinBoard();
              }}
              className="rounded-full border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-500 transition hover:bg-emerald-500/10"
            >
              Join with code
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
};
