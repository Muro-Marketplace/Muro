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

export interface PaidLoanPaymentChipProps {
  placementId: string;
  arrangementType: string | null | undefined;
  monthlyFeeGbp: number | null | undefined;
  liveFrom: string | null | undefined;
  subscriptionStatus: string | null | undefined;
  role: "artist" | "venue";
  /** Compact layout = inline chip; default = full-width banner. */
  compact?: boolean;
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
}: PaidLoanPaymentChipProps) {
  const isPaidLoan =
    arrangementType === "free_loan" || (monthlyFeeGbp ?? 0) > 0;
  const isLive = !!liveFrom;
  const status = (subscriptionStatus || "").toLowerCase();
  const isHealthy = ACTIVE_STATES.has(status);
  const isProblem = PROBLEM_STATES.has(status);

  if (!isPaidLoan || isHealthy) return null;

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
    // Artist
    if (isProblem) {
      return "We've nudged the venue. Stripe will retry the charge automatically.";
    }
    return isLive
      ? "The artwork is on the wall but the venue hasn't started billing yet, we've nudged them."
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
