import { useRef } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

const rows: [string, string][] = [
  [`${mod} K`, "Open command palette"],
  ["?", "Show this sheet"],
  ["Enter", "Send message"],
  ["Shift Enter", "New line in message"],
  ["Esc", "Close dialog or panel"],
];

export const ShortcutsSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(open, ref, onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm animate-[fadeIn_0.12s_ease-out]"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="shortcuts-title" className="text-lg font-semibold tracking-tight text-slate-900">Keyboard shortcuts</h2>
        <dl className="mt-4 divide-y divide-slate-200">
          {rows.map(([keys, desc]) => (
            <div key={keys} className="flex items-center justify-between py-2.5 text-sm">
              <dt className="text-slate-600">{desc}</dt>
              <dd><kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700">{keys}</kbd></dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </div>
  );
};
