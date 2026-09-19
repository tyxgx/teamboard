import { ThemeToggle } from "../ui/ThemeToggle";

type ChatHeaderProps = {
  title: string;
  onOpenSidebar?: () => void;
  onOpenRightPanel?: () => void;
  socketConnected?: boolean;
  onOpenPalette?: () => void;
};

export const ChatHeader = ({ title, onOpenSidebar, onOpenRightPanel, socketConnected = true, onOpenPalette }: ChatHeaderProps) => (
  <header className="flex min-h-[64px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-sm md:min-h-[76px] md:px-6 md:py-4">
    <button
      type="button"
      onClick={onOpenSidebar}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-600 transition hover:bg-slate-100 md:hidden"
      aria-label="Open navigation"
    >
      ☰
    </button>

    <div className="flex flex-1 items-center justify-center gap-2 overflow-hidden">
      <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{title}</h2>
      <div className="flex shrink-0 items-center gap-1.5" title={socketConnected ? "Connected" : "Reconnecting..."}>
        <div
          className={`h-2 w-2 rounded-full ${
            socketConnected ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
          }`}
          aria-label={socketConnected ? "Connected" : "Reconnecting"}
        />
        {!socketConnected && (
          <span className="text-xs text-slate-500">Reconnecting...</span>
        )}
      </div>
    </div>

    <div className="flex items-center gap-1">
      {onOpenPalette ? (
        <button
          type="button"
          onClick={onOpenPalette}
          className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs text-slate-500 transition hover:bg-slate-100 md:inline-flex"
          aria-label="Open command palette"
        >
          Search <kbd className="rounded border border-slate-200 px-1.5 font-mono text-[10px]">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</kbd>
        </button>
      ) : null}
      <ThemeToggle />
      <button
        type="button"
        onClick={onOpenRightPanel}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-600 transition hover:bg-slate-100 lg:hidden"
        aria-label="Open details"
      >
        ℹ️
      </button>
    </div>
  </header>
);
