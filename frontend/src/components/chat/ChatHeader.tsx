type ChatHeaderProps = {
  title: string;
  onOpenSidebar?: () => void;
  onOpenRightPanel?: () => void;
};

export const ChatHeader = ({ title, onOpenSidebar, onOpenRightPanel }: ChatHeaderProps) => (
  <header className="flex min-h-[64px] items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:min-h-[76px] md:px-6 md:py-4">
    <button
      type="button"
      onClick={onOpenSidebar}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 transition hover:bg-slate-200 md:hidden"
      aria-label="Open navigation"
    >
      ☰
    </button>

    <div className="flex-1 text-center">
      <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">{title}</h2>
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
