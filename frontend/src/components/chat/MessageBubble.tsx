import type { FC, ReactNode } from "react";

type MessageBubbleProps = {
  isOwn: boolean;
  isAnonymous: boolean;
  audience: "EVERYONE" | "ADMIN_ONLY";
  authorName: string;
  actualSender?: string;
  avatar?: string;
  timestamp?: string;
  children: ReactNode;
};

const formatTime = (timestamp?: string) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const MessageBubble: FC<MessageBubbleProps> = ({
  isOwn,
  isAnonymous,
  audience,
  authorName,
  actualSender,
  avatar,
  timestamp,
  children,
}) => {
  const timeLabel = formatTime(timestamp);
  const bubbleClasses = isOwn
    ? "bg-emerald-50 border border-emerald-400 text-slate-900"
    : "bg-white border border-slate-200 text-slate-800";

  return (
    <div className={`flex w-full gap-3 ${isOwn ? "justify-end" : "justify-start"}`}>
      {!isOwn ? (
        <div className="mt-6 h-9 w-9 shrink-0 rounded-full bg-slate-200 text-sm font-semibold text-slate-600 grid place-items-center">
          {avatar ?? authorName.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <div className="w-9" />
      )}

      <div className={`max-w-[65%] rounded-2xl px-4 py-3 shadow-sm ${bubbleClasses}`} data-visibility={audience === "ADMIN_ONLY" ? "admin" : "everyone"}>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
          {isAnonymous ? (
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                Anon
              </span>
              <span className="flex items-center gap-1 text-slate-600">
                🕶️ Anonymous{actualSender ? <span className="text-slate-400">({actualSender})</span> : null}
              </span>
            </span>
          ) : (
            <span className="font-semibold text-slate-700">{authorName}</span>
          )}
          {audience === "ADMIN_ONLY" ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
              Admin only
            </span>
          ) : null}
        </div>

        <div className="text-sm leading-relaxed">{children}</div>

        {timeLabel ? (
          <div className="mt-2 text-right text-[11px] font-medium text-slate-500">{timeLabel}</div>
        ) : null}
      </div>

      {isOwn ? (
        <div className="mt-6 h-9 w-9 shrink-0 rounded-full bg-emerald-500 text-sm font-semibold text-white grid place-items-center">
          {avatar ?? "You".slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <div className="w-9" />
      )}
    </div>
  );
};
