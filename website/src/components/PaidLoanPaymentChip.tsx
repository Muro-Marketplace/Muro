"use client";

/**
 * Slim chip surfaced on a paid-loan placement card whenever the
 * monthly Stripe subscription isn't active yet. Two intensities:
 *
 * - "Set up payment" (muted), placement is accepted but billing
 *   hasn't been wired yet. Action chip for venues from the moment
 *   the placement is active so they can find the payment flow.
 *   Artist sees an info-only "Awaiting venue's payment setup" chip.
 *
 * - "Payment past due" (amber, urgent), used to be the only
 *   variant; now reserved for billing failures (past_due, unpaid).
 *
 * - "Live without payment" (amber), the work is on the wall AND
 *   billing still isn't set up. The artist is currently going
 *   unpaid for an installed piece, the most urgent state.
 *
 * Visibility:
 *   Renders when ALL of:
 *     - arrangement is paid loan (free_loan with a positive monthly fee)
 *     - subscriptionStatus is missing or not "active" / "trialing"
 *   (Used to also gate on liveFrom, that gate moved into the visual
 *    intensity instead, so venues can find the CTA pre-install too.)
 */

import Link from "next/link";
import { isPaidLoan as isPaidLoanArrangement } from "@/lib/arrangement-type";

export interface PaidLoanPaymentChipProps {
  placementId: string;
  arrangementType: string | null | undefined;
  monthlyFeeGbp: number | null | undefined;
  liveFrom: string | null | undefined;
  subscriptionStatus: string | null | undefined;
  role: "artist" | "venue";
  /** Compact layout = inline chip; default = full-width banner. */
  compact?: boolean;
  /** ISO date of the next renewal; shown on the active banner when known. */
  currentPeriodEnd?: string | null;
  /**
   * True once Stripe has been asked to end this subscription at the end of the
   * current period (migration 127).
   *
   * Rows 2179-2187: without it, a cancelled placement's banner read "Monthly
   * payment active, £12.00/mo. Next payment on 30 September" underneath a
   * heading saying Cancelled. The row genuinely is still `active` in Stripe
   * until the period ends, so status alone cannot tell the two apart, and
   * `currentPeriodEnd` is the LAST DAY OF COVER here, not a payment date.
   */
  cancelAtPeriodEnd?: boolean | null;
}

const ACTIVE_STATES = new Set(["active", "trialing"]);
const PROBLEM_STATES = new Set(["past_due", "unpaid", "incomplete_expired"]);

export default function PaidLoanPaymentChip({
  placementId,
  arrangementType,
  monthlyFeeGbp,
  liveFrom,
  subscriptionStatus,
  role,
  compact = false,
  currentPeriodEnd,
  cancelAtPeriodEnd = false,
}: PaidLoanPaymentChipProps) {
  const isPaidLoan =
    isPaidLoanArrangement(arrangementType, monthlyFeeGbp) || (monthlyFeeGbp ?? 0) > 0;
  const isLive = !!liveFrom;
  const status = (subscriptionStatus || "").toLowerCase();
  const isHealthy = ACTIVE_STATES.has(status);
  const isProblem = PROBLEM_STATES.has(status);

  if (!isPaidLoan) return null;

  // Owner decision 2026-08-28: when billing IS running, say so loudly instead
  // of rendering nothing. A paid loan whose money side is invisible reads as
  // "not set up" to both parties.
  // Rows 2179-2187. Winding down is not the same as running, and it is not the
  // same as stopped either: cover continues to the end of the period the venue
  // has already paid for, and then the money stops. Said plainly, because the
  // alternative was telling a venue who had just cancelled that they would be
  // charged again next month.
  if (isHealthy && cancelAtPeriodEnd) {
    const endsOn = currentPeriodEnd
      ? new Date(currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
      : null;
    if (compact) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface text-muted border border-border">
          Monthly payment ending
        </span>
      );
    }
    return (
      <div className="mb-6 bg-surface border border-border rounded-sm p-4">
        <p className="text-sm font-medium text-foreground">
          Monthly payment has been cancelled
        </p>
        <p className="text-xs text-muted mt-0.5">
          {role === "venue"
            ? endsOn
              ? `You won't be charged again. The month you have paid for runs to ${endsOn}.`
              : "You won't be charged again. The month you have already paid for runs to the end of its period."
            : endsOn
              ? `The venue has ended the monthly payment. Your last payment covers up to ${endsOn}.`
              : "The venue has ended the monthly payment. Your last payment covers the period already paid for."}
        </p>
      </div>
    );
  }

  if (isHealthy) {
    if (compact) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
          Monthly payment active
        </span>
      );
    }
    const renewal = currentPeriodEnd
      ? new Date(currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
      : null;
    return (
      <div className="mb-6 bg-green-50 border border-green-200 rounded-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-green-800">
            Monthly payment active{typeof monthlyFeeGbp === "number" && monthlyFeeGbp > 0 ? `, £${monthlyFeeGbp.toFixed(2)}/mo` : ""}
          </p>
          <p className="text-xs text-green-700 mt-0.5">
            {/* Rows 2179-2187: "Manage it any time from this page" was a dead
                promise. There is no manage, change-card or cancel-billing
                control on the placement page in any state. What IS true is that
                ending the placement ends the payment, so say that instead of
                pointing at a control that does not exist. */}
            {role === "venue"
              ? renewal
                ? `Next payment on ${renewal}. Ending this placement ends the payment.`
                : "Payments are running. Ending this placement ends the payment."
              : renewal
                ? `The venue's payment is set up. Next payment on ${renewal}.`
                : "The venue's payment is set up and running."}
          </p>
        </div>
      </div>
    );
  }

  // Visual intensity:
  //   warn   , past-due / unpaid (real billing failure) OR live on
  //             wall without payment (artist going unpaid for an
  //             installed piece, needs urgent attention)
  //   muted  , accepted but not yet live; venue has time to set
  //             billing up before install
  const variant: "warn" | "muted" = isProblem || isLive ? "warn" : "muted";

  const headline = (() => {
    if (role === "venue") {
      if (isProblem) {
        return status === "past_due"
          ? "Monthly payment is past due"
          : "Monthly payment needs attention";
      }
      return isLive
        ? "Work is live, set up monthly billing now"
        : "Set up monthly billing for this placement";
    }
    // Artist
    if (isProblem) {
      return status === "past_due"
        ? "Venue's monthly payment is past due"
        : "Venue's monthly payment needs attention";
    }
    return isLive
      ? "Work is live, venue hasn't paid yet"
      : "Awaiting venue's monthly payment setup";
  })();

  const sub = (() => {
    if (role === "venue") {
      if (isProblem) {
        return "Stripe will retry, but please check the card on file.";
      }
      const fee = monthlyFeeGbp ? ` (£${monthlyFeeGbp}/mo)` : "";
      return isLive
        ? `Pay the artist their monthly fee${fee}, they're already displaying the work.`
        : `Get billing set up before the work is installed${fee}.`;
    }
    // Artist. F33: nothing automatically nudges the venue in either state,
    // so don't claim it. The dunning case does have Stripe's retries
    // behind it; the live-without-payment case has no automation at all,
    // the honest advice is to chase the venue directly.
    if (isProblem) {
      return "Stripe will retry the charge automatically. If it keeps failing, message the venue.";
    }
    return isLive
      ? "The artwork is on the wall but the venue hasn't started billing yet. A message to the venue is the quickest way to chase it."
      : "The venue hasn't set up the monthly card yet. They can do this from their placements list.";
  })();

  const cta =
    role === "venue" ? (
      <Link
        href={`/placements/${encodeURIComponent(placementId)}/payment`}
        className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-sm text-[11px] font-semibold transition-colors ${
          variant === "warn"
            ? "bg-amber-600 text-white hover:bg-amber-700"
            : "bg-foreground text-white hover:bg-foreground/90"
        }`}
      >
        Set up payment
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>
    ) : null;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
          variant === "warn"
            ? "bg-amber-50 text-amber-800 border border-amber-200"
            : "bg-stone-100 text-stone-700 border border-stone-200"
        }`}
        title={`${headline}, ${sub}`}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        {role === "venue" ? "Payment due" : "Awaiting payment"}
      </span>
    );
  }

  return (
    <div
      role="status"
      className={`mt-2 flex items-start gap-3 px-3 py-2.5 rounded-sm border ${
        variant === "warn"
          ? "bg-amber-50/60 border-amber-200"
          : "bg-stone-50 border-stone-200"
      }`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 mt-0.5 ${variant === "warn" ? "text-amber-700" : "text-stone-500"}`}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${variant === "warn" ? "text-amber-900" : "text-foreground"}`}>
          {headline}
        </p>
        <p className="text-[11px] text-muted leading-relaxed mt-0.5">{sub}</p>
      </div>
      {cta}
    </div>
  );
}
