"use client";

// The buy-off-the-wall offer for one placed piece (owner decision 2026-08-28).
//
// Online sells a configurable product; in store sells THIS object, in one
// size, in whatever frame it hangs in. So the offer lives on the placement,
// and the artist sets it here (prompted automatically at live-on-wall, and
// editable any time). One prefilled price and a frame-included tick; the
// prefill is the placed size's tier price plus the work's default frame
// uplift when the artist says the piece is framed. The venue sees the offer
// read-only; buyers see it as the "Buy off the wall" option on the artwork
// page, alongside the normal delivery options.

import { useEffect, useState } from "react";
import { authFetch, mutate, ApiError } from "@/lib/api-client";

interface OfferPlacement {
  id: string;
  status: string;
  work_title?: string | null;
  work_size?: string | null;
  placed_size_label?: string | null;
  venue?: string | null;
  in_store_price?: number | null;
  in_store_frame_included?: boolean | null;
}

export default function InStoreOfferCard({
  placement,
  viewerRole,
  promptOpen,
  onOpenPrompt,
  onClosePrompt,
  onSaved,
}: {
  placement: OfferPlacement;
  viewerRole: "artist" | "venue";
  promptOpen: boolean;
  onOpenPrompt: () => void;
  onClosePrompt: () => void;
  onSaved: () => void;
}) {
  const hasOffer = placement.in_store_price != null;

  const [price, setPrice] = useState<string>("");
  const [isFramed, setIsFramed] = useState(false);
  const [frameIncluded, setFrameIncluded] = useState(false);
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [frameUplift, setFrameUplift] = useState<number>(0);
  const [priceTouched, setPriceTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill: the placed size's tier price plus the default frame uplift when
  // framed. Best effort from the artist's own portfolio; an untraceable work
  // just leaves the field blank for the artist to fill.
  useEffect(() => {
    if (!promptOpen || viewerRole !== "artist") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/artist-works");
        const data = await res.json().catch(() => ({}));
        const works = (data.works || []) as Array<{
          title?: string;
          pricing?: Array<{ label?: string; price?: number }>;
          frame_options?: Array<{ priceUplift?: number }>;
          frameOptions?: Array<{ priceUplift?: number }>;
        }>;
        const work = works.find((w) => w.title === placement.work_title);
        if (!work || cancelled) return;
        const sizeLabel = placement.placed_size_label || placement.work_size || "";
        const tier =
          work.pricing?.find((t) => (t.label || "").toLowerCase() === sizeLabel.toLowerCase()) ||
          work.pricing?.[0];
        const uplift =
          work.frame_options?.[0]?.priceUplift ?? work.frameOptions?.[0]?.priceUplift ?? 0;
        if (typeof tier?.price === "number" && tier.price > 0) setBasePrice(tier.price);
        if (typeof uplift === "number" && uplift > 0) setFrameUplift(uplift);
      } catch {
        /* prefill only; the artist can always type the number */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [promptOpen, viewerRole, placement.work_title, placement.placed_size_label, placement.work_size]);

  // Recompute the prefill when the framed tick changes, unless the artist
  // has typed their own number, which then always wins.
  useEffect(() => {
    if (!promptOpen || priceTouched || basePrice == null) return;
    const derived = isFramed ? basePrice + frameUplift : basePrice;
    setPrice(derived.toFixed(2));
  }, [promptOpen, priceTouched, basePrice, frameUplift, isFramed]);

  // Opening the editor on an existing offer starts from its saved values.
  useEffect(() => {
    if (!promptOpen) return;
    if (placement.in_store_price != null) {
      setPrice(placement.in_store_price.toFixed(2));
      setPriceTouched(true);
      setFrameIncluded(placement.in_store_frame_included === true);
      setIsFramed(placement.in_store_frame_included === true);
    } else {
      setPriceTouched(false);
      setPrice("");
    }
    setError(null);
  }, [promptOpen, placement.in_store_price, placement.in_store_frame_included]);

  async function save(turnOff: boolean) {
    setBusy(true);
    setError(null);
    try {
      const body = turnOff
        ? { id: placement.id, inStorePrice: null }
        : {
            id: placement.id,
            inStorePrice: Number(price),
            inStoreFrameIncluded: frameIncluded,
          };
      if (!turnOff && (!Number.isFinite(Number(price)) || Number(price) <= 0)) {
        setError("Enter the price a buyer would pay for this piece.");
        setBusy(false);
        return;
      }
      await mutate("/api/placements", { method: "PATCH", body: JSON.stringify(body) });
      onClosePrompt();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Production pass 2, P4: "'Can buyers purchase this piece off the wall?' is
  // still offered on a collected placement." Only the collapsed prompt was
  // gated on `active`; the saved-offer row and its Edit button were not, so a
  // placement whose work had come off the wall still offered to sell it from
  // there, and the venue still read "Buyers can purchase this piece off the
  // wall". Nothing about an off-the-wall sale means anything once the piece is
  // no longer on the wall.
  //
  // `sold` is covered by the same gate and needs no separate branch: the
  // webhook clears the offer on the sale that caused it.
  if (placement.status !== "active") return null;

  // ── Venue view: read-only confirmation of what buyers will be offered ──
  if (viewerRole === "venue") {
    if (!hasOffer) return null;
    return (
      <div className="mb-6 bg-surface border border-border rounded-sm p-4">
        <p className="text-sm font-medium text-foreground">
          Buyers can purchase this piece off the wall for £{placement.in_store_price!.toFixed(2)}
          {placement.in_store_frame_included ? ", frame included" : ""}
        </p>
        <p className="text-xs text-muted mt-0.5">
          Set by the artist. A buyer who scans the QR code sees this as a purchase option.
        </p>
      </div>
    );
  }

  // ── Artist view ──
  if (!promptOpen) {
    if (hasOffer) {
      return (
        <div className="mb-6 bg-surface border border-border rounded-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Off-the-wall sale: £{placement.in_store_price!.toFixed(2)}
              {placement.in_store_frame_included ? ", frame included" : ""}
            </p>
            <p className="text-xs text-muted mt-0.5">Buyers at {placement.venue || "the venue"} can buy this piece directly.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenPrompt}
              className="px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-background rounded-sm transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => save(true)}
              className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-sm transition-colors disabled:opacity-60"
            >
              Turn off
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mb-6 bg-surface border border-border rounded-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Sell this piece off the wall?</p>
          <p className="text-xs text-muted mt-0.5">
            Let buyers who see it at {placement.venue || "the venue"} purchase it on the spot.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPrompt}
          className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors shrink-0"
        >
          Set it up
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 bg-surface border border-accent/30 rounded-sm p-4">
      <p className="text-sm font-medium text-foreground mb-1">Can buyers purchase this piece off the wall?</p>
      <p className="text-xs text-muted mb-3">
        One price for this exact piece{placement.placed_size_label ? ` (${placement.placed_size_label})` : ""}. Buyers
        can still order a delivered copy at your normal prices.
      </p>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted uppercase tracking-wider">Price</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted">£</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setPriceTouched(true);
              }}
              className="w-28 bg-background border border-border rounded-sm px-2 py-2 text-sm focus:outline-none focus:border-accent/60"
            />
          </div>
        </label>
        <label className="flex items-center gap-2 cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={isFramed}
            onChange={(e) => {
              setIsFramed(e.target.checked);
              if (e.target.checked) setFrameIncluded(true);
            }}
            className="w-3.5 h-3.5 rounded-sm border border-border accent-accent"
          />
          <span className="text-xs text-muted">It hangs framed</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={frameIncluded}
            onChange={(e) => setFrameIncluded(e.target.checked)}
            className="w-3.5 h-3.5 rounded-sm border border-border accent-accent"
          />
          <span className="text-xs text-muted">Frame included in the sale</span>
        </label>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => save(false)}
          className="px-4 py-2 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save offer"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClosePrompt}
          className="px-4 py-2 text-xs font-medium text-muted hover:text-foreground transition-colors"
        >
          Not for sale in store
        </button>
      </div>
    </div>
  );
}
