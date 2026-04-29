"use client";

/**
 * Inline placement-request form rendered on each Spaces venue card.
 *
 * The artist can pick a work from their own portfolio, propose
 * arrangement terms (revenue share / paid loan / purchase, gated by
 * what the venue's open to), add a personal message, and submit,
 * which posts straight to /api/placements as if the artist had used
 * the existing "request a placement" flow elsewhere. No redirect, no
 * modal, the card expands in place, success state inlines, the
 * artist can immediately request another venue without leaving the
 * page.
 *
 * Constraints:
 * - Only artists with at least one work can submit (we surface a
 *   nudge to add work otherwise).
 * - Only arrangements the venue is open to are selectable.
 * - The pending-application gate at the API layer rejects requests
 *   from un-approved artists; we surface the API's reason inline.
 */

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface ArtistWork {
  id: string;
  title: string;
  image: string;
  dimensions?: string | null;
  medium?: string | null;
}

export type Arrangement = "revenue_share" | "free_loan" | "purchase";

export interface SpacesVenueOption {
  slug: string;
  name: string;
  interestedInRevenueShare: boolean;
  interestedInFreeLoan: boolean;
  interestedInDirectPurchase: boolean;
}

interface Props {
  venue: SpacesVenueOption;
  works: ArtistWork[];
  /** When true, the parent shows a "loading works" skeleton above. */
  worksLoading?: boolean;
  authToken: string | null;
  onCancel: () => void;
  onSuccess: (placementId: string) => void;
}

export default function SpacesPlacementRequestForm({
  venue,
  works,
  worksLoading,
  authToken,
  onCancel,
  onSuccess,
}: Props) {
  const supported: Arrangement[] = useMemo(() => {
    const arr: Arrangement[] = [];
    if (venue.interestedInRevenueShare) arr.push("revenue_share");
    if (venue.interestedInFreeLoan) arr.push("free_loan");
    if (venue.interestedInDirectPurchase) arr.push("purchase");
    return arr;
  }, [venue]);

  // Multi-work selection. A single placement row carries the primary
  // work in workTitle/Image and any extras in extra_works (migration
  // 027). Order matters, first selected becomes the primary so we
  // track an ordered array, not a Set.
  const [selectedWorkIds, setSelectedWorkIds] = useState<string[]>(
    works[0]?.id ? [works[0].id] : [],
  );
  const [arrangement, setArrangement] = useState<Arrangement>(
    supported[0] || "revenue_share",
  );
  const [revenueShare, setRevenueShare] = useState<number>(25);
  const [monthlyFee, setMonthlyFee] = useState<number>(25);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // QR is implicit on revenue_share (the rev share IS the QR split),
  // off by default on a paid loan (artist may want a pure
  // display-fee deal), and off on direct purchase. Tracked
  // independently so a paid-loan deal can opt-in to a QR split on
  // top of the monthly fee.
  const [qrEnabled, setQrEnabled] = useState<boolean>(true);
  const [qrRevenueShare, setQrRevenueShare] = useState<number>(20);

  const selectedWorks = useMemo(
    () =>
      selectedWorkIds
        .map((id) => works.find((w) => w.id === id))
        .filter((w): w is ArtistWork => !!w),
    [selectedWorkIds, works],
  );
  const primaryWork = selectedWorks[0] || null;

  function toggleWork(id: string) {
    setSelectedWorkIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  // Submit is allowed once the artist has picked a work and an
  // arrangement type. The message field is a soft nudge, venues
  // respond better to a real pitch, but we don't gate the submit
  // on it, otherwise the button looks broken when the artist is
  // ready to send. The send button stays disabled only while
  // we're actually mid-submit.
  const canSubmit = !!primaryWork && !!arrangement && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !primaryWork) return;
    setError(null);
    setSubmitting(true);
    try {
      const placementId = crypto.randomUUID();
      const extras = selectedWorks.slice(1).map((w) => ({
        title: w.title,
        image: w.image,
        size: w.dimensions || null,
      }));
      // Build the placement payload. The API's zod schema uses
      // `.optional()` (not `.nullable()`) for revenueSharePercent /
      // monthlyFeeGbp / requestedDimensions / extraWorks, passing
      // null fails validation with the unhelpful "Invalid placement
      // data" error. Use `undefined` (= field omitted) for fields
      // that don't apply to the chosen arrangement.
      type PlacementPayload = {
        id: string;
        venueSlug: string;
        workTitle: string;
        workImage: string;
        type: Arrangement;
        qrEnabled: boolean;
        message?: string;
        requestedDimensions?: string;
        extraWorks?: typeof extras;
        revenueSharePercent?: number;
        monthlyFeeGbp?: number;
      };
      const messageTrim = message.trim();
      const placement: PlacementPayload = {
        id: placementId,
        venueSlug: venue.slug,
        workTitle: primaryWork.title,
        workImage: primaryWork.image,
        type: arrangement,
        // QR is implicit on revenue_share, opt-in on free_loan, off
        // on direct purchase.
        qrEnabled:
          arrangement === "revenue_share"
            ? true
            : arrangement === "free_loan"
              ? qrEnabled
              : false,
      };
      if (messageTrim.length > 0) placement.message = messageTrim;
      if (primaryWork.dimensions) placement.requestedDimensions = primaryWork.dimensions;
      if (extras.length > 0) placement.extraWorks = extras;
      if (arrangement === "revenue_share") {
        placement.revenueSharePercent = revenueShare;
      } else if (arrangement === "free_loan") {
        placement.monthlyFeeGbp = monthlyFee;
        // Optional rev share split on QR sales for paid loans.
        if (qrEnabled && qrRevenueShare > 0) {
          placement.revenueSharePercent = qrRevenueShare;
        }
      }
      const payload = { fromVenue: false, placements: [placement] };
      const res = await fetch("/api/placements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          reason?: string;
        };
        // The API uses `reason: "application_pending"` for un-approved
        // artists, surface the exact human message it returns.
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      onSuccess(placementId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request");
      setSubmitting(false);
    }
  }

  // No works → nudge to add one before requesting a placement.
  if (!worksLoading && works.length === 0) {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs text-foreground mb-1">
          Add a work to your portfolio first
        </p>
        <p className="text-[11px] text-muted mb-3">
          Placement requests need a work attached. Once you&rsquo;ve uploaded
          something, you&rsquo;ll be able to send venues a proper proposal.
        </p>
        <div className="flex items-center gap-2">
          <a
            href="/artist-portal/portfolio"
            className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-medium bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
          >
            Add a work
          </a>
          <button
            onClick={onCancel}
            className="text-xs text-muted hover:text-foreground transition-colors px-2 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Venue open to nothing, shouldn't happen given filters, but guard.
  if (supported.length === 0) {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[11px] text-muted">
          This venue isn&rsquo;t open to placement requests right now.
        </p>
        <button
          onClick={onCancel}
          className="mt-2 text-xs text-muted hover:text-foreground transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">
          Request a placement at {venue.name}
        </p>
        <button
          onClick={onCancel}
          className="text-[11px] text-muted hover:text-foreground transition-colors"
          aria-label="Close placement request form"
        >
          ✕
        </button>
      </div>

      {/* Work picker, multi-select. Tap a thumbnail to add or remove
          it; the first selected becomes the primary, the rest go on
          the same placement as `extra_works`. The order chip helps the
          artist see which is the headline. */}
      <div>
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <p className="text-[10px] text-muted uppercase tracking-wider">
            Work{selectedWorks.length === 1 ? "" : "s"} to place{" "}
            <span className="text-muted/70 normal-case tracking-normal">
              ({selectedWorks.length} selected)
            </span>
          </p>
          {selectedWorks.length > 1 && (
            <button
              type="button"
              onClick={() => setSelectedWorkIds(primaryWork ? [primaryWork.id] : [])}
              className="text-[10px] text-muted hover:text-foreground transition-colors"
            >
              Clear extras
            </button>
          )}
        </div>
        {worksLoading ? (
          <p className="text-[11px] text-muted">Loading your works…</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {works.map((w) => {
              const order = selectedWorkIds.indexOf(w.id);
              const active = order >= 0;
              return (
                <button
                  key={w.id}
                  onClick={() => toggleWork(w.id)}
                  className={`relative shrink-0 w-16 h-16 rounded-sm overflow-hidden border-2 transition-colors ${
                    active
                      ? "border-accent ring-1 ring-accent/30"
                      : "border-border hover:border-foreground/30"
                  }`}
                  title={
                    active
                      ? `${order === 0 ? "Primary work" : `Extra work #${order}`}, ${w.title}`
                      : `Add ${w.title}`
                  }
                  type="button"
                >
                  <Image
                    src={w.image}
                    alt={w.title}
                    fill
                    // Thumbnails were rendering at the source's lowest
                    // available size, looking blurry. Bumping the sizes
                    // hint forces Next/Image to fetch a higher-DPI
                    // variant; quality 90 lifts the artwork clarity to
                    // match the cards on the marketplace grid.
                    sizes="(max-width: 640px) 96px, 128px"
                    quality={90}
                    className="object-cover"
                  />
                  {active && (
                    <>
                      <span className="absolute inset-0 bg-accent/15 pointer-events-none" />
                      <span className="absolute top-0.5 left-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[9px] font-bold leading-none pointer-events-none">
                        {order === 0 ? "1" : order + 1}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {primaryWork && (
          <p className="text-[11px] text-muted mt-1.5">
            <span className="text-foreground/80 font-medium">
              {primaryWork.title}
            </span>
            {primaryWork.dimensions ? ` · ${primaryWork.dimensions}` : ""}
            {selectedWorks.length > 1 && (
              <span className="text-muted/70">
                {" "}
                + {selectedWorks.length - 1} more
              </span>
            )}
          </p>
        )}
      </div>

      {/* Arrangement type */}
      <div>
        <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
          Proposed arrangement
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: "revenue_share", label: "Revenue Share" },
              { id: "free_loan", label: "Paid Loan" },
              { id: "purchase", label: "Direct Purchase" },
            ] as const
          ).map((opt) => {
            const enabled = supported.includes(opt.id);
            const active = arrangement === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => enabled && setArrangement(opt.id)}
                disabled={!enabled}
                type="button"
                className={`px-2.5 py-2 text-[11px] rounded-sm border transition-colors ${
                  !enabled
                    ? "border-border text-muted/40 cursor-not-allowed"
                    : active
                      ? "border-accent bg-accent/5 text-accent font-medium"
                      : "border-border text-foreground hover:border-foreground/30"
                }`}
                title={
                  enabled
                    ? opt.label
                    : `${venue.name} isn't open to ${opt.label.toLowerCase()}`
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Terms, depend on arrangement */}
      {arrangement === "revenue_share" && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
            Revenue share to venue
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={revenueShare}
              onChange={(e) =>
                setRevenueShare(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
              }
              className="w-20 px-2.5 py-1.5 text-sm border border-border rounded-sm bg-background focus:outline-none focus:border-accent"
            />
            <span className="text-xs text-muted">% of QR sales</span>
          </div>
        </div>
      )}
      {arrangement === "free_loan" && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
            Monthly fee from venue
          </p>
          <p className="text-[11px] text-muted/80 mb-2 leading-relaxed">
            The venue pays you this amount each month for displaying the
            work, billed automatically by Stripe once they set up payment.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">£</span>
            <input
              type="number"
              min={0}
              step={1}
              value={monthlyFee}
              onChange={(e) =>
                setMonthlyFee(Math.max(0, Number(e.target.value) || 0))
              }
              className="w-24 px-2.5 py-1.5 text-sm border border-border rounded-sm bg-background focus:outline-none focus:border-accent"
            />
            <span className="text-xs text-muted">per month</span>
          </div>

          {/* Optional QR-driven rev share on top of the monthly fee.
              The split goes the OTHER way from the monthly fee, money
              flows artist → venue when a QR scan converts to a sale.
              Off by default; paid loans are usually pure display
              deals. */}
          <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={qrEnabled}
              onChange={(e) => setQrEnabled(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span className="text-[11px] text-muted leading-relaxed">
              <span className="text-foreground font-medium">
                Optional: also offer the venue a QR-driven revenue share
              </span>
              <span className="block text-muted/80 mt-0.5">
                On top of the monthly fee they pay you, you can give the
                venue a % of any sales generated by QR scans on this work.
                Money flows from you to the venue when a QR scan converts.
              </span>
            </span>
          </label>
          {qrEnabled && (
            <div className="mt-2 ml-6 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={qrRevenueShare}
                onChange={(e) =>
                  setQrRevenueShare(
                    Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  )
                }
                className="w-20 px-2.5 py-1.5 text-sm border border-border rounded-sm bg-background focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-muted">to venue, on QR sales</span>
            </div>
          )}
        </div>
      )}
      {arrangement === "purchase" && (
        <p className="text-[11px] text-muted leading-relaxed">
          Direct purchase, the venue buys the work outright. You can negotiate
          the exact figure in messages once they accept.
        </p>
      )}

      {/* Message */}
      <div>
        <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
          Personal message{" "}
          <span className="text-muted/70 normal-case tracking-normal">
            ({message.trim().length}/500)
          </span>
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 500))}
          placeholder={`Hi, I think this piece would suit ${venue.name}'s space because…`}
          rows={3}
          className="w-full px-3 py-2 text-xs border border-border rounded-sm bg-background focus:outline-none focus:border-accent resize-none"
        />
        {message.trim().length > 0 && message.trim().length < 20 && (
          <p className="text-[10px] text-muted/80 mt-1">
            A few sentences works best, venues respond better to a real pitch.
          </p>
        )}
      </div>

      {/* Error / submit */}
      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-sm px-2.5 py-1.5">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          onClick={onCancel}
          disabled={submitting}
          type="button"
          className="text-xs text-muted hover:text-foreground transition-colors px-1 py-2 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white text-xs font-semibold rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting && (
            <svg
              className="animate-spin"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            >
              <path d="M21 12a9 9 0 1 1-6.2-8.55" />
            </svg>
          )}
          {submitting ? "Sending…" : "Send request"}
        </button>
      </div>

      {/* Optional handoff to the bigger form in the artist portal,
          handy when the artist wants more options (work-level sizes,
          notes, custom QR settings) than this inline form exposes. */}
      <div className="text-center pt-1">
        <Link
          href={`/artist-portal/placements?venue=${encodeURIComponent(venue.slug)}`}
          className="text-[11px] text-muted hover:text-foreground transition-colors"
        >
          Or open in My Placements for the full form &rarr;
        </Link>
      </div>
    </div>
  );
}
