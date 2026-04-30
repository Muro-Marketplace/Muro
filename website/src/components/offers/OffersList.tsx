"use client";

// Shared offers list — used in both the venue (buyer) and artist
// (recipient) portals. Renders thumbnails of the works in the offer,
// venue + artist details, status, price, message, and the appropriate
// action buttons based on viewer role + offer status (Accept / Counter /
// Decline / Withdraw / Pay).

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { authFetch } from "@/lib/api-client";

interface EnrichedWork {
  id: string;
  title: string;
  image: string | null;
  dimensions: string | null;
  medium: string | null;
}

interface EnrichedCollection {
  id: string;
  title: string;
  work_ids: string[] | null;
}

interface EnrichedVenue {
  user_id: string;
  name: string;
  slug: string | null;
  location: string | null;
}

interface EnrichedArtist {
  slug: string;
  name: string;
}

interface OfferRow {
  id: string;
  buyer_user_id: string;
  artist_user_id: string;
  /** Sender of this row — distinguishes "venue offered" from
   *  "artist countered". Falls back to buyer_user_id for legacy rows. */
  created_by_user_id: string | null;
  artist_slug: string | null;
  work_ids: string[];
  collection_id: string | null;
  amount_pence: number;
  currency: string;
  message: string | null;
  status: string;
  expires_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
  paid_order_id: string | null;
  created_at: string;
  parent_offer_id: string | null;
  works?: EnrichedWork[];
  collection?: EnrichedCollection | null;
  venue?: EnrichedVenue | null;
  artist?: EnrichedArtist | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  countered: "bg-amber-50 text-amber-700 border-amber-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-foreground/5 text-foreground/40 border-border",
  withdrawn: "bg-foreground/5 text-foreground/40 border-border",
  expired: "bg-foreground/5 text-foreground/40 border-border",
  paid: "bg-emerald-50 text-emerald-800 border-emerald-300",
};

/**
 * Pretty status text. Earlier we rendered raw enum values like
 * "countered" / "accepted" — they read as terse and lower-case. We now
 * Title-case everything and translate "pending" into something more
 * human depending on the viewer's vantage:
 *   - sender of a pending offer: "Awaiting response"
 *   - recipient of a pending offer: "Pending"  (their action required)
 */
function formatStatus(status: string, viewerIsSender: boolean): string {
  if (status === "pending") return viewerIsSender ? "Awaiting response" : "Pending";
  if (!status) return "";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

interface Props {
  /** The viewer's user id, so we can decide which side of the offer they are. */
  viewerUserId: string;
  /** Show this side only — defaults to both. */
  filter?: "buyer" | "artist";
}

export default function OffersList({ viewerUserId, filter }: Props) {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counterFor, setCounterFor] = useState<OfferRow | null>(null);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter ? `/api/offers?role=${filter}` : "/api/offers";
      const res = await authFetch(url);
      const data = await res.json();
      setOffers(data.offers || []);
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // ?pay=<offerId>   — bell deep-link after an artist accepts: fire
  //                    Stripe checkout immediately so the venue
  //                    doesn't have to hunt for a "Complete payment"
  //                    button.
  // ?focus=<offerId> — email deep-link: scroll the matching offer
  //                    into view + briefly highlight it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const payId = sp.get("pay");
    const focusId = sp.get("focus");
    if (loading) return;

    if (payId) {
      const target = offers.find((o) => o.id === payId);
      if (target && target.status === "accepted" && target.buyer_user_id === viewerUserId) {
        const url = new URL(window.location.href);
        url.searchParams.delete("pay");
        window.history.replaceState({}, "", url.toString());
        pay(payId);
        return;
      }
    }

    if (focusId) {
      const el = document.getElementById(`offer-${focusId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-accent", "ring-offset-2");
        setTimeout(() => el.classList.remove("ring-2", "ring-accent", "ring-offset-2"), 2400);
        const url = new URL(window.location.href);
        url.searchParams.delete("focus");
        window.history.replaceState({}, "", url.toString());
      }
    }
    // Intentional: only run once when offers + loading have settled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, offers]);

  async function act(id: string, action: "accept" | "decline" | "withdraw") {
    setBusyId(id);
    setError(null);
    try {
      const res = await authFetch(`/api/offers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not update offer.");
      } else {
        // When a venue (buyer) accepts an artist's counter, jump
        // straight to Stripe rather than making them click a separate
        // "Complete payment" button. Lookup the offer locally first
        // so we know whether the actor was the buyer.
        if (action === "accept") {
          const accepted = offers.find((o) => o.id === id);
          if (accepted && accepted.buyer_user_id === viewerUserId) {
            await pay(id);
            return;
          }
        }
        await load();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function pay(id: string) {
    setBusyId(id);
    try {
      const res = await authFetch(`/api/offers/${id}/checkout`, { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Could not start checkout.");
        setBusyId(null);
      }
    } catch {
      setError("Network error. Please try again.");
      setBusyId(null);
    }
  }

  function openCounter(o: OfferRow) {
    setCounterAmount((o.amount_pence / 100).toFixed(0));
    setCounterMessage("");
    setCounterFor(o);
  }

  async function submitCounter() {
    if (!counterFor) return;
    const amt = parseFloat(counterAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid counter amount.");
      return;
    }
    setBusyId(counterFor.id);
    setError(null);
    try {
      const res = await authFetch("/api/offers", {
        method: "POST",
        body: JSON.stringify({
          artistSlug: counterFor.artist_slug,
          workIds: counterFor.work_ids,
          collectionId: counterFor.collection_id || undefined,
          amountPence: Math.round(amt * 100),
          message: counterMessage.trim() || undefined,
          parentOfferId: counterFor.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Could not send counter.");
      } else {
        setCounterFor(null);
        await load();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;
  if (offers.length === 0) {
    return (
      <p className="text-sm text-muted">
        No offers yet.{" "}
        {filter === "buyer" && (
          <Link href="/browse" className="text-accent hover:underline">Browse artwork</Link>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}

      {offers.map((o) => {
        const iAmBuyer = o.buyer_user_id === viewerUserId;
        const iAmArtist = o.artist_user_id === viewerUserId;
        // Sender = whoever made *this* offer/counter. Falls back to
        // buyer for legacy rows without created_by_user_id.
        const senderId = o.created_by_user_id || o.buyer_user_id;
        const iAmSender = senderId === viewerUserId;
        const iAmRecipient = !iAmSender && (iAmBuyer || iAmArtist);
        const formatted = `£${(o.amount_pence / 100).toFixed(2)}`;
        const works = o.works || [];
        const primaryWork = works[0];
        const targetTitle = o.collection?.title
          ? `Collection: ${o.collection.title}`
          : works.length === 1
            ? primaryWork?.title || "Artwork"
            : works.length > 1
              ? `${works.length} works`
              : "Artwork";

        const counterpartyName = iAmBuyer
          ? o.artist?.name || o.artist_slug || "Artist"
          : o.venue?.name || "Venue";
        const counterpartyHref = iAmBuyer && o.artist?.slug
          ? `/browse/${o.artist.slug}`
          : iAmArtist && o.venue?.slug
            ? `/venues/${o.venue.slug}`
            : undefined;

        return (
          <article
            key={o.id}
            id={`offer-${o.id}`}
            className="bg-surface border border-border rounded-sm overflow-hidden transition-shadow"
          >
            <div className="flex flex-col sm:flex-row">
              {primaryWork?.image && (
                <div className="relative w-full sm:w-32 h-32 shrink-0 bg-foreground/5">
                  <Image
                    src={primaryWork.image}
                    alt={primaryWork.title}
                    fill
                    className="object-cover"
                    sizes="128px"
                    unoptimized
                  />
                  {works.length > 1 && (
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/65 text-white rounded-sm text-[10px]">
                      +{works.length - 1}
                    </span>
                  )}
                </div>
              )}

              <div className="flex-1 p-4 sm:p-5">
                <header className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-base font-medium">{formatted}</p>
                    <p className="text-xs text-muted">
                      {targetTitle} ·{" "}
                      {counterpartyHref ? (
                        <Link href={counterpartyHref} className="hover:text-accent">
                          {iAmBuyer ? `to ${counterpartyName}` : `from ${counterpartyName}`}
                        </Link>
                      ) : (
                        <>{iAmBuyer ? `to ${counterpartyName}` : `from ${counterpartyName}`}</>
                      )}
                      {iAmArtist && o.venue?.location ? ` · ${o.venue.location}` : ""}
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-sm border ${STATUS_BADGE[o.status] || STATUS_BADGE.pending}`}>
                    {formatStatus(o.status, iAmSender)}
                  </span>
                </header>

                {works.length > 0 && (
                  <ul className="space-y-0.5 mb-3">
                    {works.map((w) => (
                      <li key={w.id} className="text-[11px] text-muted">
                        <span className="text-foreground/80 font-medium">{w.title}</span>
                        {w.dimensions ? ` · ${w.dimensions}` : ""}
                        {w.medium ? ` · ${w.medium}` : ""}
                      </li>
                    ))}
                  </ul>
                )}

                {o.message && (
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap mb-3">
                    &ldquo;{o.message}&rdquo;
                  </p>
                )}

                <footer className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {/* Recipient of an open offer: accept, counter, or
                      decline. "Recipient" is the side that did not
                      create this row — derived from created_by_user_id.
                      Both venue and artist see the full trio when
                      they're the recipient: a venue receiving an
                      artist's counter needs Accept and Decline as
                      much as the artist does on the original offer.
                      Earlier we restricted Accept/Decline to the
                      artist, which broke counter negotiation entirely
                      from the venue's side. */}
                  {iAmRecipient && (o.status === "pending" || o.status === "countered") && (
                    <>
                      <button
                        type="button"
                        onClick={() => act(o.id, "accept")}
                        disabled={busyId === o.id}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-sm transition-colors disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => openCounter(o)}
                        disabled={busyId === o.id}
                        className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-sm transition-colors disabled:opacity-60"
                      >
                        Counter
                      </button>
                      <button
                        type="button"
                        onClick={() => act(o.id, "decline")}
                        disabled={busyId === o.id}
                        className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-sm transition-colors disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {/* Sender of an open offer: just withdraw. Lets
                      either side pull their own offer/counter without
                      the API rejecting an artist trying to withdraw
                      their own counter. */}
                  {iAmSender && (o.status === "pending" || o.status === "countered") && (
                    <button
                      type="button"
                      onClick={() => act(o.id, "withdraw")}
                      disabled={busyId === o.id}
                      className="px-3 py-1.5 text-xs font-medium text-muted bg-surface hover:bg-foreground/5 border border-border rounded-sm transition-colors disabled:opacity-60"
                    >
                      Withdraw
                    </button>
                  )}
                  {iAmBuyer && o.status === "accepted" && (
                    <button
                      type="button"
                      onClick={() => pay(o.id)}
                      disabled={busyId === o.id}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded-sm transition-colors disabled:opacity-60"
                    >
                      Complete payment — {formatted}
                    </button>
                  )}
                  {o.status === "paid" && (
                    <span className="text-xs text-emerald-700">Paid · order {o.paid_order_id}</span>
                  )}
                  <span className="text-[10px] text-muted ml-auto">
                    {new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </footer>
              </div>
            </div>
          </article>
        );
      })}

      {counterFor && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-sm w-full max-w-md p-6">
            <h2 className="text-lg font-medium mb-2">Counter offer</h2>
            <p className="text-xs text-muted mb-5">
              Current offer: <strong>£{(counterFor.amount_pence / 100).toFixed(2)}</strong>. Suggest a new price.
            </p>
            <label htmlFor="counter-amount" className="block text-xs uppercase tracking-wider text-muted mb-1.5">Your counter (£)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/60 text-sm">£</span>
              <input
                id="counter-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                className="w-full pl-7 pr-3 py-3 bg-background border border-border rounded-sm text-base focus:outline-none focus:border-accent/60"
                autoFocus
              />
            </div>
            <label htmlFor="counter-message" className="block text-xs uppercase tracking-wider text-muted mb-1.5 mt-4">Message <span className="normal-case text-muted/70">(optional)</span></label>
            <textarea
              id="counter-message"
              value={counterMessage}
              onChange={(e) => setCounterMessage(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 resize-y"
            />
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={submitCounter}
                disabled={busyId === counterFor.id}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-sm transition-colors disabled:opacity-60"
              >
                {busyId === counterFor.id ? "Sending…" : "Send counter"}
              </button>
              <button
                type="button"
                onClick={() => setCounterFor(null)}
                className="px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
