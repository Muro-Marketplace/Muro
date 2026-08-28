"use client";

/**
 * Inline submission form rendered on each Spaces venue card.
 *
 * Plan G #6d restructured this form around four top-level action
 * paths instead of a single "select a work to place" entry. The four
 * actions are:
 *
 *   1. Request a placement — propose a work for the venue's wall
 *      under a specific arrangement (paid loan / free loan / revenue
 *      share / QR-enabled). This is the original behaviour and keeps
 *      the multi-select work picker.
 *   2. Quote a price       — name a price for one of the artist's
 *      works. Single-work picker + price input. Persists as a
 *      placement row with arrangement_type='purchase'.
 *   3. Suggest a commission — propose creating a NEW piece tailored
 *      to the venue. Price + brief; no work picker. Persists as a
 *      placement row with arrangement_type='purchase' too (the
 *      'commission' enum value isn't in the DB CHECK constraint yet,
 *      see below).
 *   4. Just a message      — open a normal DM thread, no placement
 *      row. POSTs to /api/messages.
 *
 * Constraints:
 * - Only artists with at least one work can submit "placement" or
 *   "quote" requests; the in-form hint nudges them to add a work.
 *   "Commission" and "Just a message" don't need works.
 * - For "placement", only arrangements the venue is open to are
 *   selectable.
 * - The pending-application gate at the API layer rejects placement
 *   requests from un-approved artists; we surface the API's reason
 *   inline.
 *
 * On 'commission' arrangement_type: Plan G #6d's spec allows
 * shipping 'purchase' for both quote and commission as a fallback so
 * we don't have to migrate the DB CHECK constraint in this PR; the
 * commission brief is preserved verbatim in the placement message
 * field, and a follow-up can introduce 'commission' as a first-class
 * arrangement_type later (mirror migration 051's pattern).
 */

import { useEffect, useMemo, useState } from "react";
import { ARRANGEMENT_LABEL } from "@/lib/arrangement-labels";
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

// Top-level action the artist is taking. Drives which sub-form is
// rendered and which endpoint we POST to on submit.
export type SubmissionAction = "placement" | "quote" | "commission" | "message";

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

  // Top-level action picker. Defaults to "placement" so artists who
  // open the form expecting the prior behaviour get exactly that
  // without an extra click.
  const [action, setAction] = useState<SubmissionAction>("placement");

  // Multi-work selection. A single placement row carries the primary
  // work in workTitle/Image and any extras in extra_works (migration
  // 027). Order matters, first selected becomes the primary so we
  // track an ordered array, not a Set. In "quote" mode this is used
  // single-select, see toggleWork.
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
  // Plan G #6e: lock the form into a 'sent' state after a successful
  // POST so the artist sees a clear confirmation before the parent
  // closes the modal — bare onSuccess() unmounts immediately and felt
  // like the request had vanished into the void.
  const [sent, setSent] = useState(false);
  // QR is implicit on revenue_share (the rev share IS the QR split),
  // off by default on a paid loan (artist may want a pure
  // display-fee deal), and off on direct purchase. Tracked
  // independently so a paid-loan deal can opt-in to a QR split on
  // top of the monthly fee.
  const [qrEnabled, setQrEnabled] = useState<boolean>(true);
  const [qrRevenueShare, setQrRevenueShare] = useState<number>(20);

  // "Quote a price" / "Suggest a commission" state. Both submit as
  // a placement with arrangement_type='purchase'; the price flows
  // into the placement message body so the venue sees a concrete
  // number to evaluate.
  const [proposedPrice, setProposedPrice] = useState<number | "">("");
  const [commissionBrief, setCommissionBrief] = useState("");

  // When the artist switches to "quote" we collapse any previously
  // multi-selected works down to one — a quote is per-work, multi
  // doesn't make sense here.
  useEffect(() => {
    if (action === "quote") {
      setSelectedWorkIds((prev) => (prev.length > 1 ? prev.slice(0, 1) : prev));
    }
  }, [action]);

  const selectedWorks = useMemo(
    () =>
      selectedWorkIds
        .map((id) => works.find((w) => w.id === id))
        .filter((w): w is ArtistWork => !!w),
    [selectedWorkIds, works],
  );
  const primaryWork = selectedWorks[0] || null;

  function toggleWork(id: string) {
    if (action === "quote") {
      // Single-select: a fresh tap replaces the previous selection.
      // Tapping the already-selected thumbnail is a no-op (rather than
      // deselect) because a quote needs exactly one work.
      setSelectedWorkIds((prev) => (prev[0] === id ? prev : [id]));
      return;
    }
    setSelectedWorkIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  // Submit eligibility per action. The send button stays disabled
  // only while we're actually mid-submit OR the action's required
  // fields aren't filled.
  const canSubmit = (() => {
    if (submitting) return false;
    if (action === "placement") return !!primaryWork && !!arrangement;
    if (action === "quote")
      return (
        !!primaryWork && proposedPrice !== "" && Number(proposedPrice) > 0
      );
    if (action === "commission")
      return (
        proposedPrice !== "" &&
        Number(proposedPrice) > 0 &&
        commissionBrief.trim().length > 0
      );
    if (action === "message") return message.trim().length > 0;
    return false;
  })();

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const messageTrim = message.trim();

      if (action === "message") {
        // "Just a message" — no placement row, just a DM. The server
        // resolves the sender from the auth token and ignores any
        // client-supplied senderName/senderType, but the zod schema
        // still requires non-empty values, so we pass placeholders.
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            senderName: "artist",
            senderType: "artist",
            recipientSlug: venue.slug,
            content: messageTrim,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || `Request failed (${res.status})`);
        }
        setSent(true);
        // No placement id for a plain message; pass a synthetic
        // identifier so the parent's per-venue 'sent' tracker still
        // marks this venue as touched.
        const syntheticId = `msg-${Date.now()}`;
        setTimeout(() => onSuccess(syntheticId), 1500);
        return;
      }

      // placement | quote | commission → all create a placement row,
      // with arrangement_type set per action.
      const placementId = crypto.randomUUID();

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
        extraWorks?: Array<{
          title: string;
          image: string | null;
          size: string | null;
        }>;
        revenueSharePercent?: number;
        monthlyFeeGbp?: number;
      };

      let placement: PlacementPayload;

      if (action === "placement") {
        if (!primaryWork) throw new Error("Pick a work first");
        const extras = selectedWorks.slice(1).map((w) => ({
          title: w.title,
          image: w.image,
          size: w.dimensions || null,
        }));
        placement = {
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
        if (primaryWork.dimensions)
          placement.requestedDimensions = primaryWork.dimensions;
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
      } else if (action === "quote") {
        if (!primaryWork) throw new Error("Pick a work first");
        // Encode the proposed price in the message body. The API has
        // no dedicated `proposed_price_gbp` column yet, so we lean
        // on the message field for visibility — the venue sees the
        // exact figure inline in their inbox without needing a
        // separate UI surface to render it.
        const priceLine = `Quote: £${Number(proposedPrice).toLocaleString("en-GB")}`;
        const composed = messageTrim
          ? `${priceLine}\n\n${messageTrim}`
          : priceLine;
        placement = {
          id: placementId,
          venueSlug: venue.slug,
          workTitle: primaryWork.title,
          workImage: primaryWork.image,
          type: "purchase",
          qrEnabled: false,
          message: composed,
        };
        if (primaryWork.dimensions)
          placement.requestedDimensions = primaryWork.dimensions;
      } else {
        // commission — no specific work; brief + price flow into the
        // message body. Persisted as 'purchase' for now (Plan G #6d
        // fallback); when 'commission' graduates to its own arrangement
        // type, this branch flips a single string and the rest of the
        // payload stays the same.
        const priceLine = `Commission proposal, proposed price £${Number(proposedPrice).toLocaleString("en-GB")}`;
        const briefTrim = commissionBrief.trim();
        const composed = [priceLine, briefTrim, messageTrim]
          .filter((s) => s.length > 0)
          .join("\n\n");
        placement = {
          id: placementId,
          venueSlug: venue.slug,
          // No work yet — name the row so the venue's inbox doesn't
          // render a blank thumbnail card. The blank workImage is
          // tolerated by the API (workImage is optionalString).
          workTitle: "Commission proposal",
          workImage: "",
          type: "purchase",
          qrEnabled: false,
          message: composed,
        };
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
      setSent(true);
      // Hold the success block on screen briefly before letting the
      // parent close the modal so the user actually sees it.
      setTimeout(() => onSuccess(placementId), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request");
      setSubmitting(false);
    }
  }

  // Success state — replaces the form with a clear confirmation
  // before the parent closes. Plan G #6e.
  if (sent) {
    return (
      <div className="mt-3 pt-3 border-t border-border text-center py-6">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#15803D"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto mb-3"
          aria-hidden
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p className="text-sm font-medium">
          {action === "message" ? "Message sent" : "Request sent"}
        </p>
        <p className="text-xs text-muted mt-1">
          The venue will see this in their inbox.
        </p>
      </div>
    );
  }

  // Helper for the action-picker labels + hints.
  const actions: Array<{ v: SubmissionAction; label: string; hint: string }> = [
    {
      v: "placement",
      label: "Request a placement",
      hint: "Propose your work for their wall under a specific arrangement.",
    },
    {
      v: "quote",
      label: "Quote a price",
      hint: "Name a price for one of your existing works.",
    },
    {
      v: "commission",
      label: "Suggest a commission",
      hint: "Propose creating something new tailored to their space.",
    },
    {
      v: "message",
      label: "Just a message",
      hint: "Open a thread without a formal proposal.",
    },
  ];

  // For placement / quote the artist needs at least one work in their
  // portfolio; for commission / message they don't. Worth checking so
  // we can swap the "add a work" hint in cleanly per action.
  const needsWork = action === "placement" || action === "quote";
  const noWorks = !worksLoading && works.length === 0;

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">
          Reach out to {venue.name}
        </p>
        <button
          onClick={onCancel}
          className="text-[11px] text-muted hover:text-foreground transition-colors"
          aria-label="Close form"
        >
          ✕
        </button>
      </div>

      {/* Top-level action picker — Plan G #6d. The four cards are the
          new primary entry to the form; each one expands its own
          sub-form below. */}
      <fieldset className="space-y-1.5">
        <legend className="text-[10px] text-muted uppercase tracking-wider mb-1.5">
          What do you want to send?
        </legend>
        {actions.map((a) => {
          const active = action === a.v;
          return (
            <label
              key={a.v}
              className={`flex items-start gap-2.5 p-2.5 border rounded-sm cursor-pointer transition-colors ${
                active
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <input
                type="radio"
                name="submission-action"
                value={a.v}
                checked={active}
                onChange={() => setAction(a.v)}
                className="mt-0.5 accent-accent"
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs font-medium ${
                    active ? "text-accent" : "text-foreground"
                  }`}
                >
                  {a.label}
                </p>
                <p className="text-[11px] text-muted leading-relaxed">
                  {a.hint}
                </p>
              </div>
            </label>
          );
        })}
      </fieldset>

      {/* "Add a work" nudge for placement / quote when the artist's
          portfolio is empty. We render it inline inside the sub-form
          area rather than early-returning the whole form, so they can
          still pick "Just a message" or "Suggest a commission" without
          uploading anything first. */}
      {needsWork && noWorks && (
        <div className="rounded-sm border border-border bg-surface/40 p-3">
          <p className="text-xs text-foreground mb-1">
            Add a work to your portfolio first
          </p>
          <p className="text-[11px] text-muted mb-2 leading-relaxed">
            {action === "quote"
              ? "Quoting a price needs an existing work attached. Upload one and you'll be able to send a quote."
              : "Placement requests need a work attached. Once you've uploaded something, you'll be able to send venues a proper proposal."}
          </p>
          <a
            href="/artist-portal/portfolio"
            className="inline-flex items-center justify-center px-3 py-1.5 text-[11px] font-medium bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
          >
            Add a work
          </a>
        </div>
      )}

      {/* Placement sub-form — original behaviour. Multi-select work
          picker, arrangement picker (gated by venue), terms, message. */}
      {action === "placement" && !noWorks && (
        <>
          {/* Work picker, multi-select. Tap a thumbnail to add or remove
              it; the first selected becomes the primary, the rest go on
              the same placement as `extra_works`. The order chip helps
              the artist see which is the headline. */}
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
                  onClick={() =>
                    setSelectedWorkIds(primaryWork ? [primaryWork.id] : [])
                  }
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
                        // Thumbnails were rendering at the source's
                        // lowest available size, looking blurry.
                        // Bumping the sizes hint forces Next/Image to
                        // fetch a higher-DPI variant; quality 90 lifts
                        // the artwork clarity to match the cards on the
                        // marketplace grid.
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

          {/* Arrangement type. Disabled buttons surface the venue's
              constraints inline rather than hiding options. */}
          {supported.length === 0 ? (
            <p className="text-[11px] text-muted">
              This venue isn&rsquo;t open to placement requests right now. Try
              &ldquo;Quote a price&rdquo; or &ldquo;Just a message&rdquo;
              instead.
            </p>
          ) : (
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
                Proposed arrangement
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "revenue_share", label: ARRANGEMENT_LABEL.revenue_share },
                    { id: "free_loan", label: ARRANGEMENT_LABEL.paid_loan },
                    { id: "purchase", label: ARRANGEMENT_LABEL.purchase },
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
          )}

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
                    setRevenueShare(
                      Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    )
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
              <p className="text-[10px] text-muted/80 mt-1">
                Suggested rent: 3 to 5% of the work&rsquo;s value per month, minimum £15.
              </p>

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
                        Math.max(
                          0,
                          Math.min(100, Number(e.target.value) || 0),
                        ),
                      )
                    }
                    className="w-20 px-2.5 py-1.5 text-sm border border-border rounded-sm bg-background focus:outline-none focus:border-accent"
                  />
                  <span className="text-xs text-muted">
                    to venue, on QR sales
                  </span>
                </div>
              )}
            </div>
          )}
          {arrangement === "purchase" && (
            <p className="text-[11px] text-muted leading-relaxed">
              Direct purchase, the venue buys the work outright. You can
              negotiate the exact figure in messages once they accept.
            </p>
          )}

          {/* Personal message */}
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
                A few sentences works best, venues respond better to a real
                pitch.
              </p>
            )}
          </div>
        </>
      )}

      {/* Quote sub-form — single-work picker + price + optional note. */}
      {action === "quote" && !noWorks && (
        <>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
              Pick the work you&rsquo;re quoting on
            </p>
            {worksLoading ? (
              <p className="text-[11px] text-muted">Loading your works…</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {works.map((w) => {
                  const active = primaryWork?.id === w.id;
                  return (
                    <button
                      key={w.id}
                      onClick={() => toggleWork(w.id)}
                      className={`relative shrink-0 w-16 h-16 rounded-sm overflow-hidden border-2 transition-colors ${
                        active
                          ? "border-accent ring-1 ring-accent/30"
                          : "border-border hover:border-foreground/30"
                      }`}
                      title={active ? `Selected: ${w.title}` : `Pick ${w.title}`}
                      type="button"
                    >
                      <Image
                        src={w.image}
                        alt={w.title}
                        fill
                        sizes="(max-width: 640px) 96px, 128px"
                        quality={90}
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
            {primaryWork && (
              <p className="text-[11px] text-muted mt-1.5">
                <span className="text-foreground/80 font-medium">
                  {primaryWork.title}
                </span>
                {primaryWork.dimensions ? ` · ${primaryWork.dimensions}` : ""}
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
              Your price
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">£</span>
              <input
                type="number"
                min={0}
                step={1}
                value={proposedPrice}
                onChange={(e) =>
                  setProposedPrice(
                    e.target.value === ""
                      ? ""
                      : Math.max(0, Number(e.target.value) || 0),
                  )
                }
                placeholder="e.g. 850"
                className="w-32 px-2.5 py-1.5 text-sm border border-border rounded-sm bg-background focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-muted">incl. VAT</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
              Optional note{" "}
              <span className="text-muted/70 normal-case tracking-normal">
                ({message.trim().length}/500)
              </span>
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 500))}
              placeholder={`Why this price for ${venue.name}…`}
              rows={2}
              className="w-full px-3 py-2 text-xs border border-border rounded-sm bg-background focus:outline-none focus:border-accent resize-none"
            />
          </div>
        </>
      )}

      {/* Commission sub-form — price + brief; no work picker. */}
      {action === "commission" && (
        <>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
              Proposed price
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">£</span>
              <input
                type="number"
                min={0}
                step={1}
                value={proposedPrice}
                onChange={(e) =>
                  setProposedPrice(
                    e.target.value === ""
                      ? ""
                      : Math.max(0, Number(e.target.value) || 0),
                  )
                }
                placeholder="e.g. 1200"
                className="w-32 px-2.5 py-1.5 text-sm border border-border rounded-sm bg-background focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-muted">for the commissioned piece</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
              Commission brief{" "}
              <span className="text-muted/70 normal-case tracking-normal">
                ({commissionBrief.trim().length}/1000)
              </span>
            </p>
            <textarea
              value={commissionBrief}
              onChange={(e) => setCommissionBrief(e.target.value.slice(0, 1000))}
              placeholder={`What you'd make for ${venue.name}: medium, scale, palette, mood, timeline…`}
              rows={4}
              className="w-full px-3 py-2 text-xs border border-border rounded-sm bg-background focus:outline-none focus:border-accent resize-none"
            />
            {commissionBrief.trim().length > 0 &&
              commissionBrief.trim().length < 30 && (
                <p className="text-[10px] text-muted/80 mt-1">
                  A few sentences on what you&rsquo;d make works best, venues
                  need enough to picture it.
                </p>
              )}
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
              Optional note{" "}
              <span className="text-muted/70 normal-case tracking-normal">
                ({message.trim().length}/500)
              </span>
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 500))}
              placeholder="Anything else they should know…"
              rows={2}
              className="w-full px-3 py-2 text-xs border border-border rounded-sm bg-background focus:outline-none focus:border-accent resize-none"
            />
          </div>
        </>
      )}

      {/* Just-a-message sub-form — no proposal, just a thread opener. */}
      {action === "message" && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
            Your message{" "}
            <span className="text-muted/70 normal-case tracking-normal">
              ({message.trim().length}/500)
            </span>
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 500))}
            placeholder={`Hi ${venue.name}, …`}
            rows={4}
            className="w-full px-3 py-2 text-xs border border-border rounded-sm bg-background focus:outline-none focus:border-accent resize-none"
            autoFocus
          />
          <p className="text-[10px] text-muted/80 mt-1">
            This opens a normal DM thread. No placement, no terms, just a
            conversation.
          </p>
        </div>
      )}

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
          {submitting
            ? "Sending…"
            : action === "message"
              ? "Send message"
              : action === "quote"
                ? "Send quote"
                : action === "commission"
                  ? "Send proposal"
                  : "Send request"}
        </button>
      </div>

      {/* Optional handoff to the bigger form in the artist portal,
          handy when the artist wants more options (work-level sizes,
          notes, custom QR settings) than this inline form exposes.
          Only shown for "placement" — the other actions have minimal
          fields so there's nothing to graduate to. */}
      {action === "placement" && (
        <div className="text-center pt-1">
          <Link
            href={`/artist-portal/placements?venue=${encodeURIComponent(venue.slug)}`}
            className="text-[11px] text-muted hover:text-foreground transition-colors"
          >
            Or open in My Placements for the full form &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
