"use client";

/**
 * Inline placement-request form rendered on each Spaces venue card.
 *
 * The artist can pick a work from their own portfolio, propose
 * arrangement terms (revenue share / paid loan / purchase, gated by
 * what the venue's open to), add a personal message, and submit —
 * which posts straight to /api/placements as if the artist had used
 * the existing "request a placement" flow elsewhere. No redirect, no
 * modal — the card expands in place, success state inlines, the
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

interface ArtistWork {
  id: string;
  title: string;
  image: string;
  dimensions?: string | null;
  medium?: string | null;
}

export type Arrangement = "revenue_share" | "paid_loan" | "purchase";

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
    if (venue.interestedInFreeLoan) arr.push("paid_loan");
    if (venue.interestedInDirectPurchase) arr.push("purchase");
    return arr;
  }, [venue]);

  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(
    works[0]?.id || null,
  );
  const [arrangement, setArrangement] = useState<Arrangement>(
    supported[0] || "revenue_share",
  );
  const [revenueShare, setRevenueShare] = useState<number>(25);
  const [monthlyFee, setMonthlyFee] = useState<number>(25);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWork = works.find((w) => w.id === selectedWorkId) || null;

  const canSubmit =
    !!selectedWork &&
    !!arrangement &&
    message.trim().length >= 20 &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit || !selectedWork) return;
    setError(null);
    setSubmitting(true);
    try {
      const placementId = crypto.randomUUID();
      const payload = {
        fromVenue: false,
        placements: [
          {
            id: placementId,
            venueSlug: venue.slug,
            workTitle: selectedWork.title,
            workImage: selectedWork.image,
            requestedDimensions: selectedWork.dimensions || null,
            type: arrangement,
            revenueSharePercent:
              arrangement === "revenue_share" ? revenueShare : null,
            monthlyFeeGbp: arrangement === "paid_loan" ? monthlyFee : null,
            qrEnabled: true,
            message: message.trim(),
          },
        ],
      };
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
        // artists — surface the exact human message it returns.
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

  // Venue open to nothing — shouldn't happen given filters, but guard.
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

      {/* Work picker */}
      <div>
        <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
          Work to place
        </p>
        {worksLoading ? (
          <p className="text-[11px] text-muted">Loading your works…</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {works.map((w) => {
              const active = w.id === selectedWorkId;
              return (
                <button
                  key={w.id}
                  onClick={() => setSelectedWorkId(w.id)}
                  className={`relative shrink-0 w-16 h-16 rounded-sm overflow-hidden border-2 transition-colors ${
                    active
                      ? "border-accent ring-1 ring-accent/30"
                      : "border-border hover:border-foreground/30"
                  }`}
                  title={w.title}
                  type="button"
                >
                  <Image
                    src={w.image}
                    alt={w.title}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                  {active && (
                    <span className="absolute inset-0 bg-accent/15 pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>
        )}
        {selectedWork && (
          <p className="text-[11px] text-muted mt-1.5">
            <span className="text-foreground/80 font-medium">
              {selectedWork.title}
            </span>
            {selectedWork.dimensions ? ` · ${selectedWork.dimensions}` : ""}
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
              { id: "paid_loan", label: "Paid Loan" },
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

      {/* Terms — depend on arrangement */}
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
      {arrangement === "paid_loan" && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
            Monthly fee
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
        </div>
      )}
      {arrangement === "purchase" && (
        <p className="text-[11px] text-muted leading-relaxed">
          Direct purchase — the venue buys the work outright. You can negotiate
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
            A few sentences works best — venues respond better to a real pitch.
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
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white text-xs font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          {submitting ? "Sending…" : "Send Request"}
        </button>
      </div>
    </div>
  );
}
