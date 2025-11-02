import { useEffect, useMemo, useState, type FC, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

type BoardItem = {
  id: string;
  code: string;
  name: string;
};

type SidebarProps = {
  boards: BoardItem[];
  activeCode?: string;
  pinned?: string[];
  lastActivity?: Record<string, string | undefined>;
  onSelectBoard?: (code: string) => void;
  onTogglePin?: (code: string) => void;
  onRequestLeave?: (board: BoardItem) => void;
  onRequestDelete?: (board: BoardItem) => void;
  isAdmin?: boolean;
};

const formatTime = (iso?: string) => {
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

export const Sidebar: FC<SidebarProps> = ({
  boards,
  activeCode,
  pinned = [],
  lastActivity = {},
  onSelectBoard,
  onTogglePin,
  onRequestLeave,
  onRequestDelete,
  isAdmin = false,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const closeMenu = () => setMenuOpen(null);

  const handleSelect = (board: BoardItem) => {
    if (onSelectBoard) {
      onSelectBoard(board.code);
    } else {
      navigate(`/board/${board.code}`);
    }
    closeMenu();
  };

  const handlePin = (board: BoardItem) => {
    onTogglePin?.(board.code);
    closeMenu();
  };

  const handleLeave = (board: BoardItem) => {
    onRequestLeave?.(board);
    closeMenu();
  };

  const handleDelete = (board: BoardItem) => {
    onRequestDelete?.(board);
    closeMenu();
  };

  useEffect(() => {
    const handleDocumentClick = () => setMenuOpen(null);
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  const sortedBoards = useMemo(() => {
    const pinnedSet = new Set(pinned);
    return [...boards].sort((a, b) => {
      const aPinned = pinnedSet.has(a.code);
      const bPinned = pinnedSet.has(b.code);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const aTime = lastActivity[a.code] ? new Date(lastActivity[a.code]!).getTime() : 0;
      const bTime = lastActivity[b.code] ? new Date(lastActivity[b.code]!).getTime() : 0;
      if (aTime !== bTime) {
        return bTime - aTime; // newest first
      }

      return a.name.localeCompare(b.name);
    });
  }, [boards, pinned, lastActivity]);

  const filteredBoards = useMemo(() => {
    const lower = query.toLowerCase();
    return sortedBoards.filter((board) => board.name.toLowerCase().includes(lower));
  }, [sortedBoards, query]);

  return (
    <aside className="flex h-full w-[300px] flex-col bg-slate-900/95 text-slate-200">
      <div className="px-5 pb-1 pt-6">
        <h1 className="text-2xl font-bold text-emerald-400">TeamBoard</h1>
      </div>

      <div className="px-5 pb-3 pt-4">
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
          <p className="px-2 text-xs text-slate-500">No boards found.</p>
        ) : (
          <div className="space-y-1.5">
            {filteredBoards.map((board) => {
              const isActive = board.code === activeCode;
              const timeLabel = formatTime(lastActivity[board.code]);
              const pinnedLabel = pinned.includes(board.code);

              return (
                <div key={board.id} className="group relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(board)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSelect(board);
                      }
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 pr-12 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${
                      isActive ? "bg-slate-700/60" : "hover:bg-slate-700/40"
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
                      <p className={`truncate text-sm font-semibold text-slate-100 ${isActive ? "" : "group-hover:text-white"}`}>
                        {board.name}
                        {pinnedLabel ? <span className="ml-2 text-xs text-emerald-400">pinned</span> : null}
                      </p>
                      <p className="truncate text-xs text-slate-400">{timeLabel || "No activity yet"}</p>
                    </div>

                    <span className="ml-2 text-xs text-slate-400">{timeLabel}</span>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuOpen((prev) => (prev === board.code ? null : board.code));
                      }}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                      }}
                      className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-700/50 group-hover:block"
                      aria-label="More options"
                    >
                      ⋮
                    </button>
                  </div>

                  {menuOpen === board.code ? (
                    <div
                      className="absolute right-0 top-full z-30 mt-2 w-44 rounded-xl bg-slate-800/95 py-2 text-sm text-slate-100 shadow-xl"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MenuItem onClick={() => handlePin(board)}>
                        {pinnedLabel ? "Unpin chat" : "Pin chat"}
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          console.log("TODO: mark as unread", board.code);
                          closeMenu();
                        }}
                      >
                        Mark as unread
                      </MenuItem>
                      <MenuItem onClick={() => handleLeave(board)}>Leave board</MenuItem>
                      <MenuItem onClick={() => handleDelete(board)}>Delete board</MenuItem>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};

type MenuItemProps = {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

const MenuItem: FC<MenuItemProps> = ({ children, onClick, disabled = false }) => (
  <button
    type="button"
    onClick={disabled ? undefined : onClick}
    className={`flex w-full items-center px-4 py-2 text-left text-xs transition hover:bg-slate-700/70 ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    disabled={disabled}
  >
    {children}
  </button>
);
