// Curation tiers, one definition.
//
// Pricing stays server-side so a client cannot submit a lower tier amount.
// Bespoke is a quote-first enquiry with no upfront charge: the admin follows up
// with a tailored quote and a manual Stripe link. The managed tiers are recurring
// subscriptions charged through Stripe.
//
// T10: the curation_requests.tier CHECK permitted only the three one-off tiers
// while the route already accepted the two managed ones, so any managed sign-up
// violated the constraint on insert and 500'd, making £79.99/month and
// £199.99/quarter unsellable. Migration 080 widened the CHECK; the list below and
// that CHECK are held together by curation-tiers.test.ts, because the drift was the
// defect, not the constraint itself.

export type OneOffTier = {
  kind: "one_off";
  label: string;
  priceGbp: number;
  payFirst: boolean;
};

export type ManagedTier = {
  kind: "managed";
  label: string;
  priceGbp: number;
  interval: "month" | "quarter";
  priceEnvVar: string;
};

export type CurationTier = OneOffTier | ManagedTier;

export const CURATION_TIERS = {
  single_wall: { kind: "one_off", label: "Single wall", priceGbp: 49, payFirst: true },
  full_space: { kind: "one_off", label: "Full space", priceGbp: 149, payFirst: true },
  bespoke: { kind: "one_off", label: "Bespoke project", priceGbp: 299, payFirst: false },
  managed_monthly: {
    kind: "managed",
    label: "Managed, monthly rotation",
    priceGbp: 79.99,
    interval: "month",
    priceEnvVar: "STRIPE_PRICE_CURATION_MONTHLY",
  },
  managed_quarterly: {
    kind: "managed",
    label: "Managed, quarterly refresh",
    priceGbp: 199.99,
    interval: "quarter",
    priceEnvVar: "STRIPE_PRICE_CURATION_QUARTERLY",
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
