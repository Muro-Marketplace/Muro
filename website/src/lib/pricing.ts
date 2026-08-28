//
// The single source of truth for launch pricing (owner decision 2026-08-28).
// Plan prices were previously duplicated across ArtistPricingCards.tsx,
// artist-portal/billing/page.tsx, ApplicationForm.tsx and env-default pence in
// finance/revenue.ts, so a reprice could silently desynchronise the MRR
// dashboard from what Stripe charges. Every consumer imports from here.
//
// What Stripe ACTUALLY charges is defined by the STRIPE_PRICE_* price IDs; the
// activation runbook (Task 12) requires those prices to match these numbers.

export const PLAN_PRICES: Record<
  "core" | "premium" | "pro",
  { monthlyGbp: number; annualGbp: number; monthlyPence: number }
> = {
  core: { monthlyGbp: 9.99, annualGbp: 99.99, monthlyPence: 999 },
  premium: { monthlyGbp: 24.99, annualGbp: 249.99, monthlyPence: 2499 },
  pro: { monthlyGbp: 49.99, annualGbp: 499.99, monthlyPence: 4999 },
};

// Flat fee on every plan (owner decision 2026-08-28). The old inverted ladder
// (15/8/5) made the upgrade a fee hedge nobody at launch volume could justify
// (break-even GMV £2,571/yr for Premium, £10,000/yr for Pro) and paid the
// platform least on its best sellers. Tiers now sell capacity, not discounts.
export const PLATFORM_FEE_PERCENT = 15;

// Portfolio size per plan. Pro is 50, not unlimited; copy must say 50.
export const WORKS_CAP: Record<string, number> = { core: 8, premium: 20, pro: 50 };

// Concurrent ACTIVE placements per plan; null = unlimited. This is the tier
// value metric: walls are the scarce resource. Counted live from placements
// (AGENTS.md data invariant: no cached counter column).
export const ACTIVE_PLACEMENT_CAP: Record<string, number | null> = {
  core: 2,
  premium: 5,
  pro: null,
};

export function activePlacementCapForProfile(
  profile: { subscription_plan?: string | null; subscription_status?: string | null } | null | undefined,
): number | null {
  // Mirrors platform-fee.ts (D40/E52): a plan only counts while the
  // subscription is live, otherwise the Core cap applies.
  const status = (profile?.subscription_status || "").toLowerCase();
  if (status !== "active" && status !== "trialing") return ACTIVE_PLACEMENT_CAP.core;
  const plan = (profile?.subscription_plan || "core").toLowerCase();
  return Object.hasOwn(ACTIVE_PLACEMENT_CAP, plan) ? ACTIVE_PLACEMENT_CAP[plan] : ACTIVE_PLACEMENT_CAP.core;
}

// Paid-loan monthly rent floor. Below this Stripe's fixed fees eat the cut and
// cheap rent teaches venues that art is nearly free (the Artsicle failure).
// Suggested guidance shown in forms: 3 to 5% of the work's value per month.
export const PAID_LOAN_MIN_GBP = 15;

// Suggested venue revenue share. A SUGGESTION ONLY, surfaced as a form default
// and in copy. Owner decision: the share is not capped; the artist chooses.
export const VENUE_SHARE_SUGGESTED_PERCENT = 10;

// Founding cohort: first N approved artists get the long trial and a locked
// price. The flyer's "First 20 artists: 6 months free" is only true if the
// is_founding_artist flag is actually managed against this limit.
export const FOUNDING_ARTIST_LIMIT = 20;
export const FOUNDING_TRIAL_DAYS = 180;
export const STANDARD_TRIAL_DAYS = 30;
