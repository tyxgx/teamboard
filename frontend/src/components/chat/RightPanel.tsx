type Member = {
  id: string;
  userId: string;
  role: "ADMIN" | "MEMBER";
  user: { id: string; name: string; email: string };
};

import { useRef, useState } from "react";
import { Avatar } from "../ui/Avatar";

type RightPanelProps = {
  board?: {
    code: string;
    members: Member[];
    anonymousEnabled: boolean;
  } | null;
  isReadOnly: boolean;
  onCopyInvite: (code: string) => void;
  onClose?: () => void;
  isVisible: boolean;
  variant?: "desktop" | "mobile";
  currentUserId?: string;
  onUploadAvatar?: (file: File) => void;
};

const roleLabel = (role: "ADMIN" | "MEMBER") => (role === "ADMIN" ? "Admin" : "Member");

export const RightPanel = ({
  board,
  isReadOnly,
  onCopyInvite,
  onClose,
  isVisible,
  variant = "desktop",
  currentUserId,
  onUploadAvatar,
}: RightPanelProps) => {
  // Hooks must run on every render, so they sit above the early return below.
  const [copied, setCopied] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  if (!board || !isVisible) return null;

  const containerClass =
    variant === "mobile"
      ? "flex h-full w-full flex-col overflow-y-auto bg-white p-6"
      : "hidden h-full w-[320px] flex-col overflow-y-auto border-l border-slate-200 bg-white p-6 lg:flex";

  const memberCount = board.members?.length || 0;

  const handleCopy = async () => {
    const url = `${window.location.origin}/board/${board.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      // Also call the prop callback if provided (for backward compatibility)
      onCopyInvite(board.code);
    } catch (error) {
      // Fallback for older browsers
      try {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        // Also call the prop callback if provided (for backward compatibility)
        onCopyInvite(board.code);
      } catch (fallbackError) {
        console.error("Failed to copy invite link", fallbackError);
      }
    }
  };

  return (
    <aside className={`relative ${containerClass}`}>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-base text-slate-600 transition hover:bg-slate-200 lg:hidden"
          aria-label="Close details"
        >
          ✕
        </button>
      ) : null}

      <section className="rounded-2xl border border-slate-200/70 bg-slate-50 px-5 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Invite code</h3>
        <div className="mt-2 flex items-center gap-2">
          <p className="select-all font-mono text-lg font-semibold tracking-wide text-slate-900">{board.code}</p>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-emerald-500 hover:text-emerald-600"
            aria-label="Copy invite link"
            title="Copy invite link"
          >
            {copied ? "✓" : "⧉"}
          </button>
          {copied ? <span className="text-xs font-medium text-emerald-600">Copied!</span> : null}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Share this link with teammates to let them join instantly. Codes work on desktop and mobile.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/70 bg-slate-50 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900">Members ({memberCount})</h3>
        <ul className="mt-4 space-y-1.5">
          {(!board.members || board.members.length === 0) ? (
            <li className="rounded-xl bg-white px-3 py-2 text-xs text-slate-500">No members yet.</li>
          ) : (
            board.members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
                <Avatar userId={member.userId} name={member.user.name} className="h-7 w-7 rounded-[8px]" />
                <span className="min-w-0 flex-1 truncate font-medium">{member.user.name}</span>
                {member.userId === currentUserId && onUploadAvatar ? (
                  <>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onUploadAvatar(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="shrink-0 rounded-md px-1.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-500/10"
                      aria-label="Change your photo"
                    >
                      Change photo
                    </button>
                  </>
                ) : null}
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    member.role === "ADMIN" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {roleLabel(member.role)}
                </span>
              </li>
            ))
          )}
        </ul>
        {isReadOnly ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            You left this board. Rejoin to post new messages.
          </p>
        ) : null}
      </section>
    </aside>
  );
};
