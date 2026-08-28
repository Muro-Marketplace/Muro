// Canonical arrangement-type semantics. The single owner for the
// questions "is this a paid loan / free display / revenue share /
// purchase?", so display code never hand-rolls a `=== "free_loan"`
// check and silently mishandles the newer `paid_loan` value (or the
// mixed / free-display nuances). Built on arrangement-labels.ts for the
// human-facing label.
//
// Background: the DB column is overloaded. `free_loan` is a legacy alias
// that means a PAID loan when a positive monthly fee is attached, but a
// genuine FREE display when there is no fee. `paid_loan` is the canonical
// paid value; `mixed` is paid-loan plus revenue-share.

import { labelForArrangement } from "./arrangement-labels";

export type RawArrangementType = string | null | undefined;

/**
 * Paid loan: the venue pays the artist a monthly fee to display the work.
 * True for `paid_loan` and `mixed`, and for the legacy `free_loan` value
 * only when a positive monthly fee is attached.
 */
export function isPaidLoan(type: RawArrangementType, monthlyFeeGbp?: number | null): boolean {
  if (type === "paid_loan" || type === "mixed") return true;
  if (type === "free_loan") return (monthlyFeeGbp ?? 0) > 0;
  return false;
}

/** Free display: a `free_loan` with no positive monthly fee. */
export function isFreeDisplay(type: RawArrangementType, monthlyFeeGbp?: number | null): boolean {
  return type === "free_loan" && (monthlyFeeGbp ?? 0) <= 0;
}

/** Revenue share on QR sales. True for `revenue_share` and `mixed`. */
export function isRevenueShare(type: RawArrangementType): boolean {
  return type === "revenue_share" || type === "mixed";
}

/** Outright purchase: the venue owns the work, no ongoing arrangement. */
export function isPurchase(type: RawArrangementType): boolean {
  return type === "purchase";
}

/**
 * Any loan-like arrangement (the venue displays the work rather than
 * owning it): `paid_loan`, `mixed`, or the legacy `free_loan` (with or
 * without a fee). Use this to decide loan-vs-purchase rendering so a paid
 * loan never falls through to the purchase branch.
 */
export function isLoan(type: RawArrangementType): boolean {
  return type === "paid_loan" || type === "free_loan" || type === "mixed";
}

/** Human-facing label, resolving the legacy `free_loan` alias to "Paid loan". */
// K3: there was an `export const arrangementLabel = labelForArrangement;` here.
// An alias that renames a function to collide with a DIFFERENT function's name
// (placements/status.ts also exported an `arrangementLabel`) is pure hazard:
// which one you got depended on your import line. Import labelForArrangement.
