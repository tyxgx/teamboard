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
    ? "bg-emerald-500 text-white shadow-sm" 
    : "bg-white text-slate-900 shadow-sm";
  const displayName = isAnonymous ? "Anonymous" : authorName;

  return (
    <div className={`flex w-full gap-2 px-4 ${alignment} animate-[fadeIn_0.2s_ease-in]`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 md:max-w-[75%] ${bubbleColor} ${
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
                ADMIN-ONLY
              </span>
            ) : null}
          </div>
        )}
        
        {/* Show ADMIN-ONLY badge on own messages too */}
        {isOwn && audience === "ADMIN_ONLY" && (
          <div className="mb-1.5 flex items-center justify-end gap-2">
            <span className="rounded-full bg-white/20 backdrop-blur-sm border border-white/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              ADMIN-ONLY
            </span>
          </div>
        )}

        <div className={`wrap-anywhere text-base leading-6 whitespace-pre-wrap ${
          isOwn ? "text-white" : "text-slate-900"
        }`}>
          {children}
        </div>

        {(timeLabel || isOwn) && (
          <div className={`mt-1.5 flex items-center gap-1.5 ${
            isOwn ? "justify-end text-emerald-50" : "justify-start text-slate-400"
          }`}>
            {timeLabel && <span className="text-[11px]">{timeLabel}</span>}
            {isOwn && (
              <span className="text-[11px] opacity-70">✓</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
