export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "🙏"] as const;

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

export const ReactionBar = ({
  reactions,
  onToggle,
  isOwn,
}: {
  reactions: ReactionSummary[];
  onToggle: (emoji: string) => void;
  isOwn: boolean;
}) => {
  if (!reactions.length) return null;
  return (
    <div className={`mt-1.5 flex flex-wrap gap-1 ${isOwn ? "justify-end" : ""}`}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          aria-pressed={r.mine}
          aria-label={`${r.emoji} ${r.count} ${r.mine ? "(you reacted)" : ""}`}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
            r.mine
              ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-700"
              : "border-slate-200 bg-white/70 text-slate-600 hover:border-emerald-500/40"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  );
};

/** Hover toolbar: quick reactions + reply. Always in the DOM for keyboard users (focus-within reveals it). */
export const MessageActions = ({
  isOwn,
  onReact,
  onReply,
}: {
  isOwn: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
}) => (
  <div
    className={`absolute -top-3 z-10 flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1 py-0.5 text-sm opacity-0 shadow-md transition group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 ${
      isOwn ? "right-2" : "left-2"
    }`}
  >
    {REACTION_EMOJIS.map((e) => (
      <button
        key={e}
        type="button"
        onClick={() => onReact(e)}
        aria-label={`React ${e}`}
        className="rounded-full px-1 py-0.5 transition hover:scale-125 hover:bg-slate-100"
      >
        {e}
      </button>
    ))}
    <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden />
    <button
      type="button"
      onClick={onReply}
      aria-label="Reply"
      className="rounded-full px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
    >
      Reply
    </button>
  </div>
);
