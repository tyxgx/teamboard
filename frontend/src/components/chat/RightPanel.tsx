import type { FC } from "react";

type Member = {
  userId: string;
  role: "ADMIN" | "MEMBER";
  name?: string;
};

type RightPanelProps = {
  boardCode: string;
  adminName?: string;
  members: Member[];
  isAdmin: boolean;
  anonymousEnabled: boolean;
  onToggleAnonymous: (enabled: boolean) => void;
  onRequestLeave?: () => void;
  onRequestDelete?: () => void;
};

export const RightPanel: FC<RightPanelProps> = ({
  boardCode,
  adminName,
  members,
  isAdmin,
  anonymousEnabled,
  onToggleAnonymous,
  onRequestLeave,
  onRequestDelete,
}) => {
  const toggle = () => {
    if (!isAdmin) return;
    onToggleAnonymous(!anonymousEnabled);
  };

  return (
    <aside className="hidden h-full w-[280px] flex-col overflow-y-auto border-l border-slate-200 bg-slate-50/80 p-6 xl:flex">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Board code</p>
        <p className="mt-1 select-all text-lg font-semibold text-slate-900">{boardCode}</p>
        <p className="mt-3 text-sm text-slate-500">
          Share this code with teammates so they can join the space. Only admins can manage anonymous
          messaging.
        </p>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Members</h3>
        <p className="text-xs text-slate-500">Admins are highlighted with a badge.</p>
        <ul className="mt-4 space-y-3">
          {members.length === 0 ? (
            <li className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500">No members found.</li>
          ) : (
            members.map((member) => {
              const displayName = member.name ?? member.userId.slice(0, 8);
              const isAdmin = member.role === "ADMIN";
              return (
                <li key={member.userId} className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
                  <span className="font-medium">{displayName}</span>
                  {isAdmin ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      Admin
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">Member</span>
                  )}
                </li>
              );
            })
          )}
        </ul>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRequestLeave}
            className="w-full rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-50"
          >
            Leave board
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            className="w-full rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
          >
            Delete board
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm text-sm text-slate-600">
        <h3 className="text-sm font-semibold text-slate-900">Anonymous mode</h3>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {anonymousEnabled ? "Enabled" : "Disabled"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={anonymousEnabled}
            aria-label="Toggle anonymous mode"
            disabled={!isAdmin}
            onClick={toggle}
            className={`relative h-6 w-11 rounded-full transition ${
              anonymousEnabled ? "bg-emerald-500" : "bg-slate-300"
            } ${isAdmin ? "" : "opacity-60 cursor-not-allowed"}`}
          >
            <span
              className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                anonymousEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <p className="mt-2">
          When enabled by admins, anyone can post messages without revealing their name. Admins can still
          see who sent an anonymous message to maintain accountability.
        </p>
        {adminName ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Admin contact: {adminName}
          </p>
        ) : null}
      </div>
    </aside>
  );
};
