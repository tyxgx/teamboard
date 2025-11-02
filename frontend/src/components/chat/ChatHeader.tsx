import type { FC } from "react";

type ChatHeaderProps = {
  title: string;
  memberCount: number;
  anonymousEnabled: boolean;
  isAdmin: boolean;
};

export const ChatHeader: FC<ChatHeaderProps> = ({ title, memberCount, anonymousEnabled, isAdmin }) => {
  return (
    <header className="flex min-h-[76px] items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{memberCount} members</p>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
            anonymousEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
          }`}
        >
          Anonymous: {anonymousEnabled ? "Enabled" : "Disabled"}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          {isAdmin ? "You are admin" : "Member"}
        </span>
      </div>
    </header>
  );
};
