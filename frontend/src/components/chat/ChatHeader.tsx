type ChatHeaderProps = {
  title: string;
  onOpenSidebar?: () => void;
  onOpenRightPanel?: () => void;
  socketConnected?: boolean;
};

export const ChatHeader = ({ title, onOpenSidebar, onOpenRightPanel, socketConnected = true }: ChatHeaderProps) => (
  <header className="flex min-h-[64px] items-center justify-between border-b border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 px-4 py-3 md:min-h-[76px] md:px-6 md:py-4">
    <button
      type="button"
      onClick={onOpenSidebar}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 transition hover:bg-slate-200 md:hidden"
      aria-label="Open navigation"
    >
      ☰
    </button>

    <div className="flex flex-1 items-center justify-center gap-2">
      <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">{title}</h2>
      <div className="flex items-center gap-1.5" title={socketConnected ? "Connected" : "Reconnecting..."}>
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

    <button
      type="button"
      onClick={onOpenRightPanel}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 transition hover:bg-slate-200 lg:hidden"
      aria-label="Open details"
    >
      ℹ️
    </button>
  </header>
);
