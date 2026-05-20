"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";

const NOTE_MAX = 600;

/**
 * Modal counter-offer form. Opens inline so the user doesn't have to
 * navigate away from the placements list or the messages view to adjust
 * terms. Mirrors the shape of the counter form inside the placement
 * status panel: Paid loan + QR are independent tick toggles so counters
 * can express the full range (paid loan + QR + rev share, QR-only,
 * paid-only, or free display).
 *
 * On a successful PATCH, calls onSuccess so the caller can refresh /
 * optimistically update its local state.
 */
export interface CounterResult {
  placementId: string;
  monthlyFeeGbp: number | null;
  qrEnabled: boolean;
  revenueSharePercent: number | null;
  arrangementType: "free_loan" | "paid_loan" | "revenue_share" | "purchase";
  /** Current user's id, lets the caller optimistically flip requester_user_id. */
  senderUserId: string | null;
}

interface Props {
  placementId: string;
  /** Current user's id, echoed back to onSuccess so callers can
      optimistically flip requester_user_id on the placement without a
      round-trip. Optional for backward compat. */
  currentUserId?: string | null;
  /** Prefill from the current placement so the form doesn't start empty. */
  initial?: {
    monthly_fee_gbp?: number | null;
    revenue_share_percent?: number | null;
    qr_enabled?: boolean | null;
  };
  onClose: () => void;
  /** Fires on successful submit. If the parent wants to update its
      local state optimistically it can read the returned payload;
      otherwise it can just call its own reload. */
  onSuccess?: (result: CounterResult) => void;
}

export default function CounterPlacementDialog({ placementId, currentUserId, initial, onClose, onSuccess }: Props) {
  const seedFee = typeof initial?.monthly_fee_gbp === "number" ? initial.monthly_fee_gbp : 0;
  const seedRev = typeof initial?.revenue_share_percent === "number" ? initial.revenue_share_percent : 0;
  const [paidLoan, setPaidLoan] = useState<boolean>(seedFee > 0);
  const [fee, setFee] = useState<number | "">(seedFee > 0 ? seedFee : "");
  // Default QR on. If the initial terms passed `qr_enabled`, honour it;
  // otherwise leave the toggle on so the user immediately sees the
  // revenue-share field in its editable state.
  const [qr, setQr] = useState<boolean>(initial?.qr_enabled ?? true);
  // Allow "" so the user can fully clear the number and retype. Number
  // state only, stuck-at-zero happened because the state was `number`
  // and `Number("") || 0` coerced backspace back to 0 every keystroke.
  const [revShare, setRevShare] = useState<number | "">(seedRev > 0 ? seedRev : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // paidLoan toggle on -> paid_loan; QR-only (no monthly fee) -> revenue_share;
      // neither toggle on -> free_loan (free display).
      const arrangementType: "free_loan" | "paid_loan" | "revenue_share" = paidLoan
        ? "paid_loan"
        : qr
          ? "revenue_share"
          : "free_loan";
      const finalMonthlyFee = paidLoan && typeof fee === "number" ? fee : null;
      const finalRevShare = qr && typeof revShare === "number" && revShare > 0 ? revShare : null;
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({
          id: placementId,
          counter: {
            arrangementType,
            revenueSharePercent: finalRevShare ?? undefined,
            qrEnabled: qr,
            monthlyFeeGbp: finalMonthlyFee ?? undefined,
            message: note.trim() || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send counter");
        setBusy(false);
        return;
      }
      const result: CounterResult = {
        placementId,
        monthlyFeeGbp: finalMonthlyFee,
        qrEnabled: qr,
        revenueSharePercent: finalRevShare,
        arrangementType,
        senderUserId: currentUserId ?? null,
      };
      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(
            new CustomEvent("wallplace:placement-changed", {
              detail: { ...result, action: "counter" },
            }),
          );
        } catch (err) {
          // Listener errors must not stomp on the modal close — log and continue.
          console.warn("[counter-dialog] event listener error:", err);
        }
      }
      onSuccess?.(result);
      onClose();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-background rounded-sm max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-accent">Counter offer</p>
            <p className="text-sm text-foreground mt-0.5">Adjust the terms before sending back.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Paid loan toggle */}
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">Paid loan</p>
              <p className="text-[11px] text-muted leading-snug">Venue pays the artist monthly to display the work.</p>
            </div>
            <button
              type="button"
              onClick={() => setPaidLoan(!paidLoan)}
              className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${paidLoan ? "bg-accent" : "bg-border"}`}
              aria-pressed={paidLoan}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${paidLoan ? "translate-x-[22px]" : "translate-x-0.5"}`} />
            </button>
          </label>
          {paidLoan && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted flex-1">Monthly fee</span>
              <span className="text-xs text-muted">£</span>
              <input
                type="number"
                min={0}
                value={fee}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") { setFee(""); return; }
                  const n = Number(v);
                  if (!Number.isNaN(n)) setFee(n);
                }}
                placeholder="e.g. 80"
                className="w-24 px-3 py-2 bg-surface border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
              />
            </div>
          )}

          {/* QR toggle */}
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">QR display</p>
              <p className="text-[11px] text-muted leading-snug">Let visitors buy via a QR code. Venue earns a share of sales.</p>
            </div>
            <button
              type="button"
              onClick={() => setQr(!qr)}
              className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${qr ? "bg-accent" : "bg-border"}`}
              aria-pressed={qr}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${qr ? "translate-x-[22px]" : "translate-x-0.5"}`} />
            </button>
          </label>
          {qr && (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted flex-1">{paidLoan ? "Share on QR sales" : "Revenue share"}</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={revShare}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") { setRevShare(""); return; }
                    const n = Number(v);
                    if (!Number.isNaN(n)) setRevShare(Math.min(50, Math.max(0, n)));
                  }}
                  placeholder="e.g. 15"
                  className="w-16 px-2 py-2 bg-surface border border-border rounded-sm text-sm text-center focus:outline-none focus:border-accent/50"
                />
                <span className="text-xs text-muted">%</span>
              </div>
              <p className="text-[11px] text-muted mt-1">Max 50% to the venue.</p>
            </div>
          )}

          {!paidLoan && !qr && (
            <p className="text-[11px] text-muted italic">Neither option selected, sending as a free display.</p>
          )}

          <div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Add a note (optional)"
              rows={4}
              maxLength={NOTE_MAX}
              className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50 resize-y max-h-40"
            />
            <p className="text-[11px] text-muted mt-1 text-right">
              {note.length} / {NOTE_MAX}
            </p>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="flex-1 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-sm transition-colors disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send counter"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
