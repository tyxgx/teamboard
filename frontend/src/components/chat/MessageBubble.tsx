import React, { type ReactNode } from "react";

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

export const MessageBubble = React.memo(({
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
  const bubbleColor = isOwn 
    ? "bg-emerald-500 text-white" 
    : "bg-slate-50 text-slate-900";
  const displayName = isAnonymous ? "Anonymous" : authorName;

  return (
    <div className={`flex w-full gap-2 px-4 ${alignment}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 md:max-w-[70%] ${bubbleColor} ${
          isOwn ? "rounded-br-md" : "rounded-bl-md"
        }`}
        data-visibility={audience === "ADMIN_ONLY" ? "admin" : "everyone"}
      >
        {!isOwn && (
          <div className="mb-1.5 flex items-center gap-2">
            {isAnonymous ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                  ANON
                </span>
                <span className="text-slate-600">
                  {displayName}
                  {actualSender ? <span className="text-slate-400"> ({actualSender})</span> : null}
                </span>
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-600">{displayName}</span>
            )}
            {audience === "ADMIN_ONLY" ? (
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Admin
              </span>
            ) : null}
          </div>
        )}

        <div className={`wrap-anywhere text-[15px] leading-relaxed whitespace-pre-wrap ${
          isOwn ? "text-white" : "text-slate-900"
        }`}>
          {children}
        </div>

        {timeLabel ? (
          <div className={`mt-1.5 flex items-center gap-1.5 ${
            isOwn ? "justify-end text-emerald-50" : "justify-start text-slate-400"
          }`}>
            <span className="text-[11px]">{timeLabel}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
});
