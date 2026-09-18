import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export type PaletteCommand = {
  id: string;
  label: string;
  hint?: string;
  section: "Boards" | "Actions";
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
};

export const CommandPalette = ({ open, onClose, commands }: Props) => {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  const run = (cmd?: PaletteCommand) => {
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[index]);
    }
  };

  let lastSection = "";
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/60 px-4 pt-[15vh] backdrop-blur-sm animate-[fadeIn_0.12s_ease-out]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Jump to a board or run an action…"
          aria-label="Search commands"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[index] ? `palette-${results[index].id}` : undefined}
          className="w-full border-b border-slate-200 bg-transparent px-5 py-4 text-base text-slate-900 outline-none placeholder:text-slate-400"
        />
        <ul id="palette-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-500">No matches</li>
          ) : (
            results.map((cmd, i) => {
              const header = cmd.section !== lastSection ? cmd.section : null;
              lastSection = cmd.section;
              return (
                <li key={cmd.id} role="presentation">
                  {header ? (
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{header}</p>
                  ) : null}
                  <button
                    type="button"
                    id={`palette-${cmd.id}`}
                    role="option"
                    aria-selected={i === index}
                    onMouseMove={() => setIndex(i)}
                    onClick={() => run(cmd)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                      i === index ? "bg-emerald-500/10 text-emerald-700" : "text-slate-700"
                    }`}
                  >
                    <span className="truncate">{cmd.label}</span>
                    {cmd.hint ? <span className="ml-3 shrink-0 font-mono text-xs text-slate-400">{cmd.hint}</span> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex gap-4 border-t border-slate-200 px-5 py-2 text-[11px] text-slate-400">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
};
