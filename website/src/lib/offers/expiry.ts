/**
 * Offer expiry (F41).
 *
 * `purchase_offers.expires_at` has been written since the offer create route
 * accepted an `expiresAt` field, and the row type carries it, but nothing ever
 * read it: the PATCH accepted an offer whose deadline had passed months ago,
 * the checkout would take the money for it, and no surface showed the deadline
 * to either party. The only writer of the "expired" status was the checkout's
 * stock re-validation, which is a different reason entirely.
 *
 * One predicate, used by the PATCH, the checkout and the UI, so the three
 * cannot drift.
 */

/** Terminal / non-open statuses: an expiry deadline is irrelevant once here. */
const OPEN_STATUSES = new Set(["pending", "countered"]);

export interface OfferExpiryFields {
  expires_at?: string | null;
  status?: string | null;
  accepted_at?: string | null;
}

/**
 * Parse an expiry stamp. Returns null when the column is empty (the common
 * case, offers are open-ended unless the sender set a deadline) or when it
 * holds something unparseable, which must never be read as "expired".
 */
export function offerExpiryDate(offer: OfferExpiryFields): Date | null {
  if (!offer.expires_at) return null;
  const d = new Date(offer.expires_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when the offer carries a deadline that has already passed. */
export function isPastExpiry(offer: OfferExpiryFields, now: number = Date.now()): boolean {
  const d = offerExpiryDate(offer);
  return d !== null && d.getTime() <= now;
}

/**
 * True when an offer that is still OPEN has run out of time, so accepting,
 * declining or countering it must be refused.
 */
export function isOfferLapsed(offer: OfferExpiryFields, now: number = Date.now()): boolean {
  const status = offer.status ?? "";
  if (!OPEN_STATUSES.has(status)) return false;
  return isPastExpiry(offer, now);
}

/**
 * True when an offer must not be paid for because it lapsed before anybody
 * accepted it.
 *
 * The deadline governs the window to RESPOND, not the window to pay, so an
 * offer accepted while it was still live stays payable afterwards. What this
 * catches is the row that ran past its deadline and was accepted anyway (the
 * legacy PATCH had no gate, so those rows exist), or that carries no
 * `accepted_at` at all.
 */
export function isOfferUnpayableAfterExpiry(offer: OfferExpiryFields, now: number = Date.now()): boolean {
  const expiry = offerExpiryDate(offer);
  if (expiry === null) return false;
  if (expiry.getTime() > now) return false;
  if (!offer.accepted_at) return true;
  const accepted = new Date(offer.accepted_at);
  if (Number.isNaN(accepted.getTime())) return true;
  return accepted.getTime() > expiry.getTime();
}

/**
 * "3 May 2026" for the deadline line on the offer card. Returns null when there
 * is no deadline, so callers can render nothing rather than an empty label.
 */
export function formatOfferDeadline(offer: OfferExpiryFields): string | null {
  const d = offerExpiryDate(offer);
  if (!d) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
