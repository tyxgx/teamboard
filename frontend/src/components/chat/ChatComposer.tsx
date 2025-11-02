import { useRef, type ChangeEvent, type FC, type FormEvent, type KeyboardEvent } from "react";

type Visibility = "EVERYONE" | "ADMIN_ONLY";

type ChatComposerProps = {
  message: string;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  anonymous: boolean;
  onToggleAnonymous: (value: boolean) => void;
  visibility: Visibility;
  onChangeVisibility: (value: Visibility) => void;
  isAnonymousAllowed: boolean;
  disabled?: boolean;
};

export const ChatComposer: FC<ChatComposerProps> = ({
  message,
  onMessageChange,
  onSend,
  anonymous,
  onToggleAnonymous,
  visibility,
  onChangeVisibility,
  isAnonymousAllowed,
  disabled = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const trySendMessage = () => {
    if (!message.trim() || disabled) return false;
    onSend();
    resetTextareaHeight();
    return true;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void trySendMessage();
  };

  const handleInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onMessageChange(event.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent?.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void trySendMessage();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
      <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-500 transition hover:bg-slate-200 disabled:cursor-not-allowed"
          aria-label="Add attachment"
          disabled={disabled}
        >
          📎
        </button>

        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none overflow-hidden bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400"
        />

        <label className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(event) => onToggleAnonymous(event.target.checked)}
            disabled={!isAnonymousAllowed || disabled}
            className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 disabled:cursor-not-allowed"
          />
          Anonymous
        </label>

        <div className="flex items-center rounded-full bg-slate-100 p-1 text-xs font-medium text-slate-600">
          <button
            type="button"
            onClick={() => onChangeVisibility("EVERYONE")}
            disabled={disabled}
            className={`rounded-full px-3 py-1 transition ${
              visibility === "EVERYONE" ? "bg-emerald-500 text-white" : "hover:bg-slate-200"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Everyone
          </button>
          <button
            type="button"
            onClick={() => onChangeVisibility("ADMIN_ONLY")}
            disabled={disabled}
            className={`rounded-full px-3 py-1 transition ${
              visibility === "ADMIN_ONLY" ? "bg-blue-500 text-white" : "hover:bg-slate-200"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Admin only
          </button>
        </div>

        <button
          type="submit"
          disabled={disabled || !message.trim()}
          className="flex h-11 items-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          <span>Send</span>
          <span aria-hidden>➤</span>
        </button>
      </div>

      {!isAnonymousAllowed ? (
        <p className="mt-2 text-xs text-slate-400">Admin has turned off anonymous messages.</p>
      ) : null}
    </form>
  );
};
