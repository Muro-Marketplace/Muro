"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api-client";

/**
 * Inline counter-offer dialog for purchase_offer cards inside the
 * MessageInbox. Mirrors the dialog used on /artist-portal/offers and
 * /venue-portal/offers (see OffersList.tsx) so the negotiation flow is
 * identical regardless of where the user starts from.
 *
 * The thread message metadata only stores the offer id + the current
 * amount, so we GET /api/offers/[id] on open to recover the
 * artist_slug / work_ids / collection_id that POST /api/offers needs
 * for a counter. This works for both new offers (which now carry
 * artistSlug in metadata) and legacy ones (which don't).
 */
interface Props {
  offerId: string;
  /** Current live amount on the offer being countered, in pence. */
  currentAmountPence: number;
  /** Headline shown in the dialog so the user knows what they're countering. */
  title: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface OfferDetails {
  artist_slug: string | null;
  work_ids: string[];
  collection_id: string | null;
  amount_pence: number;
  status: string;
}

export default function CounterOfferDialog({ offerId, currentAmountPence, title, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState<string>((currentAmountPence / 100).toFixed(0));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<OfferDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingDetails(true);
    authFetch(`/api/offers/${offerId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.offer) {
          setOffer({
            artist_slug: data.offer.artist_slug ?? null,
            work_ids: Array.isArray(data.offer.work_ids) ? data.offer.work_ids : [],
            collection_id: data.offer.collection_id ?? null,
            amount_pence: data.offer.amount_pence ?? currentAmountPence,
            status: data.offer.status ?? "pending",
          });
          // Use the latest server-side amount as the seed, in case the
          // thread message lagged behind a counter from elsewhere.
          if (typeof data.offer.amount_pence === "number") {
            setAmount((data.offer.amount_pence / 100).toFixed(0));
          }
        } else {
          setError(data?.message || data?.error || "Could not load offer details.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load offer details.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offerId, currentAmountPence]);

  async function submit() {
    if (!offer) return;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Counter price must be greater than zero.");
      return;
    }
    if (!offer.artist_slug) {
      setError("Cannot counter this offer (artist not found).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch("/api/offers", {
        method: "POST",
        body: JSON.stringify({
          artistSlug: offer.artist_slug,
          workIds: offer.work_ids,
          collectionId: offer.collection_id || undefined,
          amountPence: Math.round(amt * 100),
          message: message.trim() || undefined,
          parentOfferId: offerId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || data?.error || "Could not send counter.");
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const amtParsed = parseFloat(amount);
  const validAmount = Number.isFinite(amtParsed) && amtParsed > 0;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-sm w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium mb-2">Counter offer</h2>
        <p className="text-xs text-muted mb-5">
          Countering <span className="text-foreground">{title}</span>. Current offer:{" "}
          <strong>£{(currentAmountPence / 100).toFixed(2)}</strong>. Suggest a new price.
        </p>

        <label htmlFor="counter-offer-amount" className="block text-xs uppercase tracking-wider text-muted mb-1.5">
          Your counter (£)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/60 text-sm">£</span>
          <input
            id="counter-offer-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={loadingDetails}
            className="w-full pl-7 pr-3 py-3 bg-background border border-border rounded-sm text-base focus:outline-none focus:border-accent/60 disabled:opacity-60"
            autoFocus
          />
        </div>
        {amount && !validAmount && (
          <p className="text-xs text-red-600 mt-1.5">
            Counter price must be greater than zero.
          </p>
        )}

        <label htmlFor="counter-offer-message" className="block text-xs uppercase tracking-wider text-muted mb-1.5 mt-4">
          Message <span className="normal-case text-muted/70">(optional)</span>
        </label>
        <textarea
          id="counter-offer-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={loadingDetails}
          className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 resize-y disabled:opacity-60"
        />

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={submit}
            disabled={busy || loadingDetails || !validAmount}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Sending…" : loadingDetails ? "Loading…" : "Send counter"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
