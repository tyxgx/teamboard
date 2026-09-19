import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useDialogFocus } from "../../hooks/useDialogFocus";

const BACKEND = import.meta.env.VITE_BACKEND_URL as string;

type Result = { id: string; message: string; sender: string; visibility: string; createdAt: string };

export const SearchDialog = ({
  open,
  boardId,
  boardName,
  onClose,
}: {
  open: boolean;
  boardId?: string;
  boardName?: string;
  onClose: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useDialogFocus(open, ref, onClose);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setError(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!open || !boardId || q.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`${BACKEND}/api/boards/${boardId}/search`, {
          params: { q },
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        setResults(res.data.results);
      } catch (e: any) {
        if (!axios.isCancel(e)) setError("Search failed. Try again.");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, boardId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/60 px-4 pt-[12vh] backdrop-blur-sm animate-[fadeIn_0.12s_ease-out]"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Search messages"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={boardName ? `Search in ${boardName}…` : "Search this board…"}
          aria-label="Search messages"
          className="w-full border-b border-slate-200 bg-transparent px-5 py-4 text-base text-slate-900 outline-none placeholder:text-slate-400"
        />
        <div className="max-h-96 overflow-y-auto p-2" aria-live="polite">
          {query.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">Type at least 2 characters.</p>
          ) : loading && !results ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">Searching…</p>
          ) : error ? (
            <p className="px-3 py-6 text-center text-sm text-red-500">{error}</p>
          ) : results && results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">No messages match “{query.trim()}”.</p>
          ) : (
            results?.map((r) => (
              <div key={r.id} className="rounded-lg px-3 py-2.5 hover:bg-slate-50">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{r.sender}</span>
                  <span>{new Date(r.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                  {r.visibility === "ADMIN_ONLY" ? (
                    <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold uppercase text-slate-600">Admin-only</span>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-3 text-sm text-slate-800 wrap-anywhere">{r.message || "📷 Photo"}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
