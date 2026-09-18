import { useRef, type ChangeEvent, type KeyboardEvent } from "react";

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
}: ChatComposerProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trySendMessage = () => {
    if (disabled || readOnly) return;
    if (!value.trim()) return;
    onSend();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent?.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      trySendMessage();
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
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={readOnly ? "You can no longer send messages in this board." : "Type a message"}
          rows={1}
          disabled={disabled || readOnly}
          className="wrap-anywhere min-h-[40px] max-h-[140px] w-full flex-1 resize-none overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 md:min-w-[200px]"
        />

        <button
          type="submit"
          disabled={disabled || readOnly || !value.trim()}
          className="flex h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(16,185,129,0.6)] transition hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-emerald-300 disabled:shadow-none lg:self-end"
          aria-label="Send message"
        >
          ➤
        </button>
      </div>

    </form>
  );
};
