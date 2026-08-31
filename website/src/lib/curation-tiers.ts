// Curation tiers, one definition.
//
// Pricing stays server-side so a client cannot submit a lower tier amount.
// Bespoke and Programmes are quote-first: no upfront charge, an admin follows
// up with a tailored quote. Bespoke's quote is a manual Stripe link; a
// Programme's quote becomes a Stripe subscription built from dynamic
// price_data (there is no fixed price to configure).
//
// T10: the curation_requests.tier CHECK permitted only the three one-off tiers
// while the route already accepted the two managed ones, so any managed sign-up
// violated the constraint on insert and 500'd, making £79.99/month and
// £199.99/quarter unsellable for months. Migration 080 widened the CHECK; the
// list below and that CHECK are held together by curation-tiers.test.ts, because
// the drift was the defect, not the constraint itself.
//
// Wallplace Programmes plan (2026-08-31): managed_monthly and
// managed_quarterly above never sold a single unit, because their Stripe price
// IDs (STRIPE_PRICE_CURATION_MONTHLY / _QUARTERLY) were never configured, so
// the route's managed branch always 503'd. They are retired here, not
// replaced in kind, by one quoted `programme` tier: every deal is quoted by an
// admin, so there is no fixed price ID to configure or forget. Task 2 deleted
// src/app/api/curation/route.ts's managed-tier branch, which was the only
// remaining importer of the ManagedTier type, and removed the type here too.
// The two retired tier VALUES live on regardless, as data: historical rows
// still carry tier = 'managed_monthly' / 'managed_quarterly', the widened DB
// CHECK (migration 121) still permits them for those rows, and the billing
// reconcilers (src/lib/curation/billing.ts) still service them by string.
//
// Owner decisions locked with this change:
//  - One price rule: about £25 per piece per month; the from-anchor is
//    £79.99 (3 pieces). PROGRAMME_LADDER is quoting guidance for the admin,
//    not a fixed self-serve menu.
//  - One artist rule: about £10 per piece per month to the artist (floor £5,
//    guidance £8 to £12). The rent pool must never exceed 70% of the
//    monthly-equivalent quote (PROGRAMME_RENT_SHARE_MAX), a mis-quote guard,
//    not a target. The operating target is about 40%.
//  - Quoted only: no pay-first programme checkout, ever.
//  - Rotation is a price lever: biannual rotation is included; quarterly
//    rotation is an uplift set at quote time
//    (PROGRAMME_QUARTERLY_ROTATION_UPLIFT_GBP), guided at £30 to £50 a month.
//  - Rent settles quarterly regardless of the client's own billing cadence,
//    because Stripe's per-connected-account fee would otherwise eat a
//    meaningful share of a small programme's monthly revenue.

export type OneOffTier = {
  kind: "one_off";
  label: string;
  priceGbp: number;
  payFirst: boolean;
};

export type QuotedSubscriptionTier = {
  kind: "quoted_subscription";
  label: string;
  priceGbp: number;
  payFirst: boolean;
  /** Minimum commitment before the arrangement rolls, in months. */
  termMonths: number;
  /** How long an admin has to turn a submitted brief into a quote. */
  responseDays: number;
};

export type CurationTier = OneOffTier | QuotedSubscriptionTier;

export const CURATION_TIERS = {
  single_wall: { kind: "one_off", label: "Single wall", priceGbp: 49, payFirst: true },
  full_space: { kind: "one_off", label: "Full space", priceGbp: 149, payFirst: true },
  bespoke: { kind: "one_off", label: "Bespoke project", priceGbp: 299, payFirst: false },
  programme: {
    kind: "quoted_subscription",
    label: "Programmes",
    priceGbp: 79.99,
    payFirst: false,
    termMonths: 12,
    responseDays: 2,
  },
} as const satisfies Record<string, CurationTier>;

export type CurationTierKey = keyof typeof CURATION_TIERS;

/**
 * Tier keys in declaration order. The route's request schema derives from this, so
 * adding a tier cannot leave the validator behind. Adding one still needs a
 * migration widening the CHECK, which the test enforces.
 */
export const CURATION_TIER_KEYS = Object.keys(CURATION_TIERS) as [
  CurationTierKey,
  ...CurationTierKey[],
];

/**
 * Quoting guidance for a Wallplace Programme: roughly £25 per piece per
 * month, from a £79.99 (3 piece) anchor. An admin quotes every deal
 * individually; this ladder is the guidance they quote against, not a fixed
 * self-serve price list, so a quote need not land exactly on a rung.
 */
export const PROGRAMME_LADDER: ReadonlyArray<{ pieces: number; monthlyGbp: number }> = [
  { pieces: 3, monthlyGbp: 79.99 },
  { pieces: 6, monthlyGbp: 150 },
  { pieces: 10, monthlyGbp: 250 },
  { pieces: 16, monthlyGbp: 400 },
];

/** Floor rent per piece per month. A quote below this is a mis-quote, not a discount. */
export const PROGRAMME_PIECE_RENT_MIN_GBP = 5;

/** Guidance rent per piece per month; keeps the artist share near 40% at every rung. */
export const PROGRAMME_PIECE_RENT_TARGET_GBP = 10;

/**
 * The rent pool must never exceed this share of the monthly-equivalent quote.
 * A mis-quote guard (Task 4 blocks a quote that breaches it), not a target:
 * the operating target is about 40%.
 */
export const PROGRAMME_RENT_SHARE_MAX = 0.7;

/** Guidance uplift for quarterly (vs biannual) rotation, set at quote time. */
export const PROGRAMME_QUARTERLY_ROTATION_UPLIFT_GBP = 40;

/**
 * Formats a tier's priceGbp for display: whole pounds render bare ("£49"),
 * fractional pounds render to two decimal places ("£79.99").
 *
 * Task 9: this is the only place a Curated price is turned into a string.
 * curated-tiers.ts (the marketing copy: priceLabel, cta, FAQ prose) builds
 * every price string from this plus CURATION_TIERS instead of holding its
 * own literal £ figures, so a reprice here cannot leave a stale figure in
 * the marketing copy.
 */
export function gbp(n: number): string {
  return `£${Number.isInteger(n) ? n : n.toFixed(2)}`;
}
