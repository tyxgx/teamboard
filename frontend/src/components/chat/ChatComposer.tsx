import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

type Visibility = "EVERYONE" | "ADMIN_ONLY";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  anonymous: boolean;
  onToggleAnonymous: (value: boolean) => void;
  visibility: Visibility;
  onChangeVisibility: (value: Visibility) => void;
  isAdmin?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  readOnlyMessage?: string;
  replyingTo?: { sender: string; snippet: string } | null;
  onCancelReply?: () => void;
  attachment?: { name: string; previewUrl: string } | null;
  uploading?: boolean;
  onPickImage?: (file: File) => void;
  onClearAttachment?: () => void;
  editing?: boolean;
  onCancelEdit?: () => void;
  onEditLast?: () => void;
  /** People who can be @-mentioned (active members of the board) */
  mentionables?: { id: string; name: string }[];
};

export const ChatComposer = ({
  value,
  onChange,
  onSend,
  anonymous,
  onToggleAnonymous,
  visibility,
  onChangeVisibility,
  isAdmin = false,
  disabled = false,
  readOnly = false,
  readOnlyMessage,
  replyingTo,
  onCancelReply,
  attachment,
  uploading = false,
  onPickImage,
  onClearAttachment,
  editing = false,
  onCancelEdit,
  onEditLast,
  mentionables = [],
}: ChatComposerProps) => {
  const [caret, setCaret] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = Boolean(value.trim() || attachment) && !uploading;

  // "@par" right before the caret opens the suggestion list
  const mentionQuery = useMemo(() => {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([^@\n]{0,30})$/.exec(before);
    return m ? { query: m[2], start: before.length - m[2].length - 1 } : null;
  }, [value, caret]);
  const suggestions = useMemo(() => {
    if (!mentionQuery || mentionDismissed) return [];
    const q = mentionQuery.query.toLowerCase();
    return mentionables.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, mentionables, mentionDismissed]);

  const insertMention = (name: string) => {
    if (!mentionQuery) return;
    const after = value.slice(caret);
    const next = `${value.slice(0, mentionQuery.start)}@${name} ${after}`;
    onChange(next);
    setMentionIndex(0);
    const pos = mentionQuery.start + name.length + 2;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const trySendMessage = () => {
    if (disabled || readOnly) return;
    if (!canSend) return;
    onSend();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
    setCaret(event.target.selectionStart ?? event.target.value.length);
    setMentionDismissed(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent?.isComposing) return;
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(suggestions[Math.min(mentionIndex, suggestions.length - 1)].name);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMentionDismissed(true);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      trySendMessage();
    } else if (event.key === "Escape" && (replyingTo || editing)) {
      event.stopPropagation();
      if (editing) onCancelEdit?.();
      else onCancelReply?.();
    } else if (event.key === "ArrowUp" && !value && !editing && onEditLast) {
      event.preventDefault();
      onEditLast();
    }
  };

  const toggleAnonymous = () => {
    if (disabled || readOnly) return;
    // Anonymous mode is always available - users can toggle it on/off
    onToggleAnonymous(!anonymous);
  };

  const toggleVisibility = () => {
    if (disabled || readOnly) return;
    // Only allow members (not admins) to use admin-only feature
    if (isAdmin) return;
    const newVisibility = visibility === "EVERYONE" ? "ADMIN_ONLY" : "EVERYONE";
    onChangeVisibility(newVisibility);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        trySendMessage();
      }}
      className="shrink-0 border-t border-slate-200/80 bg-white px-3 pb-4 pt-3 md:px-4"
    >
      {readOnly && readOnlyMessage ? (
        <div className="mx-auto mb-3 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700">
          {readOnlyMessage}
        </div>
      ) : null}

      {editing ? (
        <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between gap-3 rounded-xl border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span className="font-semibold">Editing message · Enter to save, Esc to cancel</span>
          <button type="button" onClick={onCancelEdit} aria-label="Cancel edit" className="rounded-md px-1.5 text-base leading-none hover:bg-amber-100">×</button>
        </div>
      ) : null}

      {replyingTo ? (
        <div className="mx-auto mb-2 flex max-w-3xl items-start justify-between gap-3 rounded-xl border-l-2 border-emerald-500 bg-slate-100 px-3 py-2 text-xs text-slate-600">
          <div className="min-w-0">
            <span className="font-semibold">Replying to {replyingTo.sender || "message"}</span>
            <p className="line-clamp-1 wrap-anywhere">{replyingTo.snippet}</p>
          </div>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="shrink-0 rounded-md px-1.5 text-base leading-none text-slate-500 hover:bg-slate-200">×</button>
        </div>
      ) : null}

      {attachment || uploading ? (
        <div className="mx-auto mb-2 flex max-w-3xl items-center gap-3 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
          {attachment ? (
            <img src={attachment.previewUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
          ) : (
            <div className="h-12 w-12 animate-pulse rounded-lg bg-slate-200" />
          )}
          <span className="min-w-0 flex-1 truncate">{uploading ? "Uploading…" : attachment?.name}</span>
          {attachment ? (
            <button type="button" onClick={onClearAttachment} aria-label="Remove image" className="rounded-md px-1.5 text-base leading-none text-slate-500 hover:bg-slate-200">×</button>
          ) : null}
        </div>
      ) : null}

      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-3xl border border-slate-200/70 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-shadow focus-within:shadow-[0_10px_30px_rgba(16,185,129,0.14)] md:flex-row md:flex-wrap md:items-end lg:flex-nowrap">
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={toggleAnonymous}
            disabled={disabled || readOnly}
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg transition active:scale-95 ${
              anonymous ? "bg-emerald-500 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            } disabled:cursor-not-allowed disabled:opacity-60`}
            aria-label={anonymous ? "Disable anonymous" : "Enable anonymous"}
            aria-pressed={anonymous}
            title={anonymous ? "Anonymous on (click to disable)" : "Anonymous off (click to enable)"}
          >
            🕶️
          </button>

          {!isAdmin ? (
            <button
              type="button"
              onClick={toggleVisibility}
              disabled={disabled || readOnly}
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg transition active:scale-95 ${
                visibility === "ADMIN_ONLY" ? "bg-blue-500 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              } disabled:cursor-not-allowed disabled:opacity-60`}
              aria-label={visibility === "ADMIN_ONLY" ? "Send to everyone" : "Send to admins only"}
              aria-pressed={visibility === "ADMIN_ONLY"}
              title={visibility === "ADMIN_ONLY" ? "Admin only (only admins will see this)" : "Everyone (click to send to admins only)"}
            >
              🛡️
            </button>
          ) : null}

          {onPickImage ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onPickImage(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled || readOnly || uploading}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-600 transition hover:bg-slate-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Attach an image"
                title="Attach an image (max 2 MB)"
              >
                📎
              </button>
            </>
          ) : null}
        </div>

        <div className="relative flex min-w-0 flex-1">
        {suggestions.length > 0 ? (
          <ul
            role="listbox"
            aria-label="Mention someone"
            className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
          >
            {suggestions.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === mentionIndex}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(p.name);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${
                    i === mentionIndex ? "bg-emerald-500/10 text-emerald-700" : "text-slate-700"
                  }`}
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          ref={textareaRef}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={readOnly ? "You can no longer send messages in this board." : "Type a message"}
          rows={1}
          disabled={disabled || readOnly}
          className="wrap-anywhere min-h-[40px] max-h-[140px] w-full flex-1 resize-none overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 md:min-w-[200px]"
        />
        </div>

        <button
          type="submit"
          disabled={disabled || readOnly || !canSend}
          className="flex h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(16,185,129,0.6)] transition hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-emerald-300 disabled:shadow-none lg:self-end"
          aria-label="Send message"
        >
          ➤
        </button>
      </div>

    </form>
  );
};
