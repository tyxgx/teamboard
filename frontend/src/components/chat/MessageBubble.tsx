import type { ReactNode } from "react";

type MessageBubbleProps = {
  isOwn: boolean;
  isAnonymous: boolean;
  audience: "EVERYONE" | "ADMIN_ONLY";
  authorName: string;
  actualSender?: string;
  timestamp?: string;
  children: ReactNode;
};

const formatTime = (timestamp?: string) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const MessageBubble = ({
  isOwn,
  isAnonymous,
  audience,
  authorName,
  actualSender,
  timestamp,
  children,
}: MessageBubbleProps) => {
  const timeLabel = formatTime(timestamp);
  const alignment = isOwn ? "justify-end" : "justify-start";
  const bubbleColor = isOwn ? "bg-emerald-50 border border-emerald-400 text-slate-900" : "bg-white border border-slate-200 text-slate-800";
  const displayName = isAnonymous ? "Anonymous" : authorName;

  return (
    <div className={`flex w-full gap-3 ${alignment}`}>
      <div className="w-9" aria-hidden />
      <div
        className={`max-w-[85%] rounded-2xl border px-4 py-3 shadow-sm md:max-w-[65%] ${bubbleColor}`}
        data-visibility={audience === "ADMIN_ONLY" ? "admin" : "everyone"}
      >
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
          {isAnonymous ? (
            <span className="flex items-center gap-2 text-slate-600">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                ANON
              </span>
              <span>
                {displayName}
                {actualSender ? <span className="text-slate-400"> ({actualSender})</span> : null}
              </span>
            </span>
          ) : (
            <span className="text-slate-700">{displayName}</span>
          )}
          {audience === "ADMIN_ONLY" ? (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
              Admin only
            </span>
          ) : null}
        </div>

        <div className="wrap-anywhere text-sm leading-relaxed whitespace-pre-wrap">{children}</div>

        {timeLabel ? (
          <div className="mt-2 text-right text-[11px] font-medium text-slate-500">{timeLabel}</div>
        ) : null}
      </div>
      <div className="w-9" aria-hidden />
    </div>
  );
};
