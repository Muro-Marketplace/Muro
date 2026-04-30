"use client";

// Venue "Make an Offer" modal. Surfaced from artwork detail pages,
// collection pages, and the venue portal. Auth gate: signed-out users
// are bounced to /login; signed-in non-venues see a clear explainer.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

interface Props {
  open: boolean;
  onClose: () => void;
  artistSlug: string;
  artistName: string;
  /** EITHER a list of workIds OR a single collectionId. */
  workIds?: string[];
  workTitle?: string; // Display only.
  /** Size label of the variant the buyer is offering on — pins the
   *  60% floor against the right size on the server. */
  sizeLabel?: string;
  collectionId?: string;
  collectionTitle?: string; // Display only.
  /** Asking price in pounds, used to surface the minimum. */
  askingPriceGbp?: number | null;
  /** Optional callback fired after a successful submit. */
  onSubmitted?: () => void;
}

// Outer wrapper just gates on `open`. The body component owns its own
// local state — fresh-mounted each open, so we don't need an effect
// to reset.
export default function MakeOfferModal(props: Props) {
  if (!props.open) return null;
  return <MakeOfferModalBody {...props} />;
}

function MakeOfferModalBody({
  onClose,
  artistSlug,
  artistName,
  workIds,
  workTitle,
  sizeLabel,
  collectionId,
  collectionTitle,
  askingPriceGbp,
  onSubmitted,
}: Props) {
  const { user, userType, loading: authLoading } = useAuth();
  const router = useRouter();
  const [amount, setAmount] = useState<string>(
    askingPriceGbp ? String(Math.round(askingPriceGbp * 0.85)) : ""
  );
  const [message, setMessage] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const minPriceGbp = askingPriceGbp ? Math.ceil(askingPriceGbp * 0.6 * 100) / 100 : null;

  const target = workTitle || collectionTitle || "this work";

  // Auth-required state — push to login with a return path.
  if (!authLoading && !user) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
        <div className="bg-background rounded-sm w-full max-w-md p-6">
          <h2 className="text-lg font-medium mb-2">Sign in to make an offer</h2>
          <p className="text-sm text-muted mb-5">Offers are sent through your Wallplace account so the artist can respond, counter, or accept.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/")}`)}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-sm transition-colors"
            >
              Sign in
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Non-venue gate.
  if (!authLoading && user && userType !== "venue") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
        <div className="bg-background rounded-sm w-full max-w-md p-6">
          <h2 className="text-lg font-medium mb-2">Offers are venue-only</h2>
          <p className="text-sm text-muted mb-5 leading-relaxed">
            Make-an-Offer is currently available to <strong>venues</strong> on Wallplace.
            If you&rsquo;re browsing as a customer, you can complete a standard purchase from the artwork page at the listed price.
          </p>
          <button type="button" onClick={onClose} className="w-full px-4 py-2 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors">
            Got it
          </button>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/offers", {
        method: "POST",
        body: JSON.stringify({
          artistSlug,
          workIds: workIds || [],
          collectionId: collectionId || undefined,
          amountPence: Math.round(numericAmount * 100),
          sizeLabel: sizeLabel || undefined,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.minimumPence) {
          setError(`Minimum offer is £${(data.minimumPence / 100).toFixed(2)}. ${data.message || ""}`);
        } else {
          setError(data.message || data.error || "Could not submit offer.");
        }
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
      onSubmitted?.();
      setTimeout(() => {
        onClose();
        setSubmitted(false);
      }, 1800);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-sm w-full max-w-md p-6">
        {submitted ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h2 className="text-lg font-medium mb-2">Offer sent</h2>
            <p className="text-sm text-muted">{artistName} will see it in their offers inbox.</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <h2 className="text-lg font-medium">Make an offer</h2>
              <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
              </button>
            </div>
            <p className="text-xs text-muted mb-5">
              Sending offer to <strong>{artistName}</strong> for {target}.
            </p>

            <label htmlFor="offer-amount" className="block text-xs uppercase tracking-wider text-muted mb-1.5">Your offer (£)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/60 text-sm">£</span>
              <input
                id="offer-amount"
                type="number"
                inputMode="decimal"
                min={minPriceGbp ?? 0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-7 pr-3 py-3 bg-background border border-border rounded-sm text-base focus:outline-none focus:border-accent/60"
                placeholder="0.00"
                autoFocus
              />
            </div>
            {askingPriceGbp != null && (
              <p className="text-[11px] text-muted mt-1.5">
                Asking price <strong>£{askingPriceGbp.toFixed(2)}</strong>. Offers can be up to 40% below the listed price (minimum <strong>£{minPriceGbp?.toFixed(2)}</strong>).
              </p>
            )}

            <label htmlFor="offer-message" className="block text-xs uppercase tracking-wider text-muted mb-1.5 mt-5">Message <span className="normal-case text-muted/70">(optional)</span></label>
            <textarea
              id="offer-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Why are you interested? Where would the work hang?"
              className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 resize-y"
            />

            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

            <div className="flex gap-2 mt-5">
              <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-sm transition-colors disabled:opacity-60">
                {submitting ? "Sending…" : "Send offer"}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
