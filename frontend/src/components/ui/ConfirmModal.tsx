import { useRef } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import type { ReactNode } from "react";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: string | ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmModal = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "default",
  onConfirm,
  onCancel,
}: ConfirmModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onCancel);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
        {description ? (
          typeof description === "string" ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
          ) : (
            <div className="mt-2 text-sm leading-relaxed text-slate-600">{description}</div>
          )
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="order-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:order-none sm:w-auto"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`w-full rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-95 sm:w-auto ${
              confirmVariant === "danger"
                ? "bg-red-500 shadow-[0_6px_16px_-6px_rgba(239,68,68,0.6)] hover:bg-red-600"
                : "bg-emerald-500 shadow-[0_6px_16px_-6px_rgba(16,185,129,0.6)] hover:bg-emerald-600"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
