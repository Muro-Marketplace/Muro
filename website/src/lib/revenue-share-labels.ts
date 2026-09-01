/**
 * Which way round the revenue share runs, said once.
 *
 * `placements.revenue_share_percent` and `artwork_requests.qr_revenue_share_percent`
 * are both the VENUE'S share of each QR sale. That is not a convention, it is
 * what the payout code computes:
 *
 *     venueCut = linePence * (revenue_share_percent / 100)      lib/payouts/legs.ts
 *
 * Four surfaces rendered the same number and two of them named the wrong
 * party. The artist portal and the venue portal both read "24% to artist" on
 * a placement where the artist in fact keeps 76%, so the artist was shown
 * their own giveaway as their earnings, backwards. E23 fixed one instance of
 * this on the artwork-requests list; these helpers exist so the fix cannot be
 * one instance at a time.
 *
 * Percentages here are whole numbers as stored, so 24 means 24%.
 */

/** Clamp to a sane percentage, so a bad row cannot render "-3% to the venue". */
function normalise(percent: number | null | undefined): number | null {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
  if (percent < 0 || percent > 100) return null;
  return percent;
}

/** What the venue takes. Null when the share is unset or out of range. */
export function venueSharePercent(percent: number | null | undefined): number | null {
  return normalise(percent);
}

/** What the artist keeps, which is the complement. */
export function artistKeepsPercent(percent: number | null | undefined): number | null {
  const venue = normalise(percent);
  return venue === null ? null : 100 - venue;
}

/**
 * Neutral label naming the party, for a shared surface where the reader may
 * be either side. "24% to the venue".
 */
export function venueShareLabel(percent: number | null | undefined): string {
  const venue = normalise(percent);
  return venue === null ? "Not set" : `${venue}% to the venue`;
}

/**
 * Artist-facing label. An artist reading their own placement wants their
 * number, not the one they give away. "You keep 76%".
 */
export function artistKeepsLabel(percent: number | null | undefined): string {
  const artist = artistKeepsPercent(percent);
  return artist === null ? "Not set" : `You keep ${artist}%`;
}

/**
 * WHAT the share is earned on, said once.
 *
 * Row 727 settled the question pass 2 raised. Every surface called this "QR
 * sales", but a customer who walks into the venue and buys the piece off the
 * wall never scans anything, and an offer on a placed work is not a QR sale
 * either. Both now pay the venue its share, matching the rule the offer path
 * already followed: a work hanging on a venue's wall earns that venue its
 * placement share on a platform sale of the work.
 *
 * So the copy names the wall, not the QR code. The QR code is one way a buyer
 * arrives; it is not what the share is for.
 */
export const VENUE_SHARE_SCOPE = "sales from the wall";

/** Caption under a bare percentage figure, naming whose share it is. */
export const VENUE_SHARE_CAPTION = `Venue's share of ${VENUE_SHARE_SCOPE}`;

/**
 * The full sentence for a terms summary: "24% to the venue on sales from the
 * wall". One string, so the party and the scope cannot drift apart on the four
 * surfaces that quote them.
 */
export function venueShareOnSalesLabel(percent: number | null | undefined): string {
  const venue = normalise(percent);
  return venue === null ? "Not set" : `${venue}% to the venue on ${VENUE_SHARE_SCOPE}`;
}
