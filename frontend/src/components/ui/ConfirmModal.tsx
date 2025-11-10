import { useEffect, ReactNode } from "react";

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
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description ? (
          typeof description === "string" ? (
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          ) : (
            <div className="mt-2 text-sm text-slate-600">{description}</div>
          )
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="order-1 w-full rounded-full border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 sm:order-none sm:w-auto"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`w-full rounded-full px-4 py-2 text-sm font-semibold text-white transition sm:w-auto ${
              confirmVariant === "danger"
                ? "bg-red-500 hover:bg-red-600"
                : "bg-emerald-500 hover:bg-emerald-600"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
