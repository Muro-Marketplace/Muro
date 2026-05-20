"use client";

import { useEffect, useRef, useState } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  reasonRequired?: boolean;
  reasonPlaceholder?: string;
  reasonMaxLength?: number;
  onConfirm: (payload?: { reason?: string }) => void;
  onClose: () => void;
}

/**
 * Reusable confirm dialog. Replaces native confirm()/alert() calls across
 * the artist + venue + admin portals.
 *
 * - Esc closes (calls onClose).
 * - Click outside closes.
 * - Cancel button is auto-focused on open.
 * - When reasonRequired, blocks submit until the reason textarea has
 *   non-empty trimmed content; passes the trimmed reason to onConfirm.
 * - destructive switches the confirm button to red treatment for
 *   delete/reject flows.
 *
 * Class tokens align with CounterPlacementDialog: bg-background / bg-surface
 * for the modal panel + inputs, border-border for borders, text-muted /
 * text-foreground for type, and bg-accent / text-red-600 for the confirm
 * button (red when destructive).
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  reasonRequired = false,
  reasonPlaceholder = "",
  reasonMaxLength = 600,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setReason("");
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Reason state is reset whenever the dialog closes (Cancel / Esc / outside
  // click) or after a successful confirm so reopening starts fresh, without
  // a setState-in-effect cascading render. Consumers that mount/unmount the
  // dialog get the same behaviour for free via React's unmount.
  function closeAndReset() {
    setReason("");
    onClose();
  }

  function handleConfirm() {
    if (reasonRequired) {
      const trimmed = reason.trim();
      if (trimmed.length === 0) return; // block
      onConfirm({ reason: trimmed });
    } else {
      onConfirm(undefined);
    }
    setReason("");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4"
      onClick={closeAndReset}
    >
      <div
        className="bg-background rounded-sm max-w-md w-full p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="confirm-dialog-title"
          className="text-lg font-medium text-foreground"
        >
          {title}
        </h3>
        {body && <p className="text-sm text-muted mt-2 leading-relaxed">{body}</p>}
        {reasonRequired && (
          <label className="block mt-4">
            <span className="text-xs text-muted">Reason</span>
            <textarea
              aria-label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, reasonMaxLength))}
              rows={3}
              maxLength={reasonMaxLength}
              placeholder={reasonPlaceholder}
              className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm mt-1 focus:outline-none focus:border-accent/50 resize-y"
            />
          </label>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <button
            ref={cancelRef}
            type="button"
            onClick={closeAndReset}
            className="text-sm px-4 py-2 border border-border rounded-sm text-muted hover:text-foreground transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`text-sm px-4 py-2 rounded-sm text-white font-medium transition-colors ${
              destructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-accent hover:bg-accent/90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
