# Launch Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the agreed launch pricing into production: flat 15% platform fee on every plan, tiers re-gated on concurrent placements (2/5/unlimited), venue share applied to offer sales, a £15/mo paid-loan floor, one pricing source of truth, and every copy surface brought into line, ending with the Stripe activation runbook.

**Architecture:** All prices and caps move into a new `src/lib/pricing.ts` consumed by fee logic, route gates, UI cards, and the MRR dashboard. Behavioural changes ride the existing rails: the fee map in `platform-fee.ts`, the placement PATCH accept path, the offers checkout metadata pattern, and the `scheduleTransfer` ledger. No new tables, no migrations.

**Tech Stack:** Next.js (nonstandard version, see constraints), TypeScript, Supabase, Stripe, Zod, Vitest.

## Global Constraints

- Work in `website/` inside the worktree `.claude/worktrees/marketplace-pricing-launch-d7a844`. All paths below are relative to `website/` unless prefixed `../`.
- **This is NOT the Next.js you know** (website/AGENTS.md): read the relevant guide in `node_modules/next/dist/docs/` before writing route/component code.
- **Check before implementing** (website/AGENTS.md): before each task, verify the change is not already present; complete only the missing portion.
- **Public copy rules** (website/AGENTS.md): no em dashes, no en dashes, no `&mdash;`/`&ndash;`, no double hyphens as dashes in any user-facing copy. Rewrite with "to", commas, full stops. British English. No emojis.
- **Data invariants** (website/AGENTS.md): derived aggregates live in one exported function; never add a manually refreshed mirror column. The placement cap count is computed live per request.
- Tests are Vitest: run a single file with `npx vitest run <path>`; the full gate is `npm run check` (lint + typecheck + vitest + audits).
- Decisions already made by the owner (do not reopen): flat 15% fee on all plans; venue share stays uncapped and optional (10% is a suggested default in copy only, never enforced); placement caps 2/5/unlimited; Pro works copy says 50 (cap unchanged); paid-loan floor £15/mo; offers pay the venue share when the work hangs on that venue's wall; founding cohort is 20 artists at 180 trial days.
- Keep existing behaviour unless a task changes it: 0% fee during `trial_end` and `free_until` windows stays; annual = 2 months free stays; offers still exclude trial/referral discounts.
- There are zero real paying artists in production, so pricing constants can change without grandfathering code.
- Commit after every task. Do NOT push to the remote without the owner's explicit confirmation.

---

### Task 1: Create `src/lib/pricing.ts`, the single source of truth

**Files:**
- Create: `src/lib/pricing.ts`
- Create: `src/lib/pricing.test.ts`
- Modify: `src/lib/finance/revenue.ts:29-38`

**Interfaces:**
- Produces: `PLAN_PRICES: Record<"core"|"premium"|"pro", { monthlyGbp: number; annualGbp: number; monthlyPence: number }>`, `PLATFORM_FEE_PERCENT = 15`, `WORKS_CAP: Record<string, number>`, `ACTIVE_PLACEMENT_CAP: Record<string, number | null>`, `activePlacementCapForProfile(profile): number | null`, `PAID_LOAN_MIN_GBP = 15`, `VENUE_SHARE_SUGGESTED_PERCENT = 10`, `FOUNDING_ARTIST_LIMIT = 20`, `FOUNDING_TRIAL_DAYS = 180`, `STANDARD_TRIAL_DAYS = 30`. Later tasks import these names exactly.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pricing.test.ts
import { describe, expect, it } from "vitest";
import {
  PLAN_PRICES,
  PLATFORM_FEE_PERCENT,
  WORKS_CAP,
  ACTIVE_PLACEMENT_CAP,
  activePlacementCapForProfile,
  PAID_LOAN_MIN_GBP,
  FOUNDING_ARTIST_LIMIT,
} from "./pricing";

describe("pricing source of truth", () => {
  it("carries the launch plan prices", () => {
    expect(PLAN_PRICES.core).toEqual({ monthlyGbp: 9.99, annualGbp: 99.99, monthlyPence: 999 });
    expect(PLAN_PRICES.premium).toEqual({ monthlyGbp: 24.99, annualGbp: 249.99, monthlyPence: 2499 });
    expect(PLAN_PRICES.pro).toEqual({ monthlyGbp: 49.99, annualGbp: 499.99, monthlyPence: 4999 });
  });

  it("charges a flat 15% platform fee", () => {
    expect(PLATFORM_FEE_PERCENT).toBe(15);
  });

  it("caps works at 8/20/50", () => {
    expect(WORKS_CAP).toEqual({ core: 8, premium: 20, pro: 50 });
  });

  it("caps concurrent placements at 2/5/unlimited", () => {
    expect(ACTIVE_PLACEMENT_CAP).toEqual({ core: 2, premium: 5, pro: null });
  });

  it("resolves the placement cap from a live subscription only", () => {
    expect(activePlacementCapForProfile({ subscription_plan: "pro", subscription_status: "active" })).toBeNull();
    expect(activePlacementCapForProfile({ subscription_plan: "premium", subscription_status: "trialing" })).toBe(5);
    // A cancelled Pro falls back to the Core cap, mirroring platform-fee.ts D40/E52.
    expect(activePlacementCapForProfile({ subscription_plan: "pro", subscription_status: "canceled" })).toBe(2);
    expect(activePlacementCapForProfile(null)).toBe(2);
    expect(activePlacementCapForProfile({ subscription_plan: "unknown", subscription_status: "active" })).toBe(2);
  });

  it("floors paid loans at £15 and caps founding artists at 20", () => {
    expect(PAID_LOAN_MIN_GBP).toBe(15);
    expect(FOUNDING_ARTIST_LIMIT).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pricing.test.ts`
Expected: FAIL, cannot resolve `./pricing`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/pricing.ts
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
  return plan in ACTIVE_PLACEMENT_CAP ? ACTIVE_PLACEMENT_CAP[plan] : ACTIVE_PLACEMENT_CAP.core;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pricing.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Point the MRR dashboard defaults at the same constants**

In `src/lib/finance/revenue.ts`, replace the `planPricesPence` body (lines 29-38) so the env vars still win but the fallbacks come from pricing.ts:

```ts
import { PLAN_PRICES } from "@/lib/pricing";

/** List prices, pence. Env-driven so the dashboard cannot drift from pricing. */
export function planPricesPence(): Record<string, number> {
  return {
    // Bug 17 history: hardcoded fallbacks here once inflated MRR threefold.
    // The fallbacks now come from the pricing source of truth (Task 1) so a
    // reprice cannot desynchronise the dashboard.
    core: Number(process.env.PRICE_CORE_PENCE ?? PLAN_PRICES.core.monthlyPence),
    premium: Number(process.env.PRICE_PREMIUM_PENCE ?? PLAN_PRICES.premium.monthlyPence),
    pro: Number(process.env.PRICE_PRO_PENCE ?? PLAN_PRICES.pro.monthlyPence),
  };
}
```

Keep the existing import block otherwise intact (add the new import at the top with the others).

- [ ] **Step 6: Verify nothing broke and commit**

Run: `npx vitest run src/lib/pricing.test.ts src/lib/finance && npx tsc --noEmit`
Expected: PASS, no type errors.

```bash
git add src/lib/pricing.ts src/lib/pricing.test.ts src/lib/finance/revenue.ts
git commit -m "feat(pricing): single source of truth for plan prices, fee, caps"
```

---

### Task 2: Flatten the platform fee to 15% on every plan

**Files:**
- Modify: `src/lib/platform-fee.ts:21-27`
- Modify: `src/lib/platform-fee.test.ts` (update expectations)
- Modify (expectation updates only, where they assert 8 or 5): `src/lib/payouts/legs.test.ts`, `src/lib/placements/paid-loan-billing.test.ts`, `src/app/api/offers/[id]/checkout/route.test.ts`, `tests/integration/stripe-webhook.test.ts`

**Interfaces:**
- Consumes: `PLATFORM_FEE_PERCENT` from Task 1.
- Produces: `PLAN_FEE_PERCENT` (all values 15) and `platformFeePercentForArtist()` unchanged in signature. Every existing caller keeps working; only returned values change for premium/pro.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/platform-fee.test.ts` (keep every existing test that asserts the 0% trial/referral windows and the cancelled-artist default; delete or update only assertions expecting 8 or 5):

```ts
it("charges the flat 15% on every live plan (owner decision 2026-08-28)", () => {
  for (const plan of ["core", "premium", "pro"]) {
    expect(
      platformFeePercentForArtist({ subscription_plan: plan, subscription_status: "active" }),
    ).toBe(15);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/platform-fee.test.ts`
Expected: FAIL, premium returns 8 and pro returns 5.

- [ ] **Step 3: Flatten the map**

In `src/lib/platform-fee.ts` replace lines 21-27 with:

```ts
import { PLATFORM_FEE_PERCENT } from "@/lib/pricing";

// Flat 15% on every plan (owner decision 2026-08-28). The inverted ladder
// (core 15 / premium 8 / pro 5) was removed before launch: at realistic
// volumes no artist could justify the upgrade as a fee hedge, and it paid the
// platform least on its best sellers. Tiers differentiate on capacity now
// (works caps, concurrent placement caps, Curated priority), not fee.
// The keys stay so callers and tests can keep addressing plans by name.
export const PLAN_FEE_PERCENT: Record<string, number> = {
  core: PLATFORM_FEE_PERCENT,
  premium: PLATFORM_FEE_PERCENT,
  pro: PLATFORM_FEE_PERCENT,
};

export const DEFAULT_PLAN_FEE_PERCENT = PLATFORM_FEE_PERCENT;
```

Do not touch `platformFeePercentForArtist` (the trial/`free_until` 0% windows and the D40/E52 status gate stay exactly as they are).

- [ ] **Step 4: Run the fee tests**

Run: `npx vitest run src/lib/platform-fee.test.ts`
Expected: PASS.

- [ ] **Step 5: Sweep dependent test fixtures**

Run: `grep -rn "toBe(8)\|toBe(5)\|feePercent.*[^1]8\|premium.*8%\|pro.*5%" src/lib/payouts/legs.test.ts src/lib/placements/paid-loan-billing.test.ts "src/app/api/offers/[id]/checkout/route.test.ts" tests/integration/stripe-webhook.test.ts`

For each hit that encodes the old ladder, update the expected fee to 15 and recompute the expected split in that fixture (fee = round(gross × 0.15); artist net = gross − venue cut − fee + shipping). Do not change fixtures that test the 0% trial/referral windows.

- [ ] **Step 6: Run the affected suites**

Run: `npx vitest run src/lib/payouts src/lib/placements "src/app/api/offers" tests/integration/stripe-webhook.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/platform-fee.ts src/lib/platform-fee.test.ts src/lib/payouts/legs.test.ts src/lib/placements/paid-loan-billing.test.ts "src/app/api/offers/[id]/checkout/route.test.ts" tests/integration/stripe-webhook.test.ts
git commit -m "feat(pricing): flat 15% platform fee on all plans"
```

---

### Task 3: Enforce concurrent placement caps on the accept path

**Files:**
- Modify: `src/app/api/placements/route.ts` (PATCH handler; insert after the pending-review gate that ends at line 890)
- Test: extend the colocated or integration test that covers placement PATCH accepts. If none exists for this gate, create `src/app/api/placements/placement-cap.test.ts` testing `activePlacementCapForProfile` wiring via the route's exported helpers, plus a unit test of the cap decision function below.

**Interfaces:**
- Consumes: `activePlacementCapForProfile` from Task 1.
- Produces: a 402 JSON error `{ error: "placement_limit_reached", ... }` on the pending to active transition when the placement's artist is at cap. Also exports `placementCapDecision` for unit testing.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/placements/placement-cap.test.ts
import { describe, expect, it } from "vitest";
import { placementCapDecision } from "./placement-cap";

describe("placementCapDecision", () => {
  it("blocks an accept when the artist is at their plan cap", () => {
    const d = placementCapDecision({
      profile: { subscription_plan: "core", subscription_status: "active" },
      activeCount: 2,
    });
    expect(d.allowed).toBe(false);
    expect(d.cap).toBe(2);
  });

  it("allows under the cap and always for Pro", () => {
    expect(
      placementCapDecision({
        profile: { subscription_plan: "core", subscription_status: "active" },
        activeCount: 1,
      }).allowed,
    ).toBe(true);
    expect(
      placementCapDecision({
        profile: { subscription_plan: "pro", subscription_status: "active" },
        activeCount: 40,
      }).allowed,
    ).toBe(true);
  });

  it("treats a dead subscription as Core", () => {
    const d = placementCapDecision({
      profile: { subscription_plan: "pro", subscription_status: "canceled" },
      activeCount: 2,
    });
    expect(d.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/placements/placement-cap.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the decision helper**

```ts
// src/app/api/placements/placement-cap.ts
import { activePlacementCapForProfile } from "@/lib/pricing";

export function placementCapDecision(args: {
  profile: { subscription_plan?: string | null; subscription_status?: string | null } | null;
  activeCount: number;
}): { allowed: boolean; cap: number | null } {
  const cap = activePlacementCapForProfile(args.profile);
  if (cap === null) return { allowed: true, cap };
  return { allowed: args.activeCount < cap, cap };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/placements/placement-cap.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the gate into the PATCH handler**

In `src/app/api/placements/route.ts`, directly after the pending-review block that ends at line 890 (`}` of the `review_status === "pending"` gate) and before the F39 approval logic at line 892, insert:

```ts
    // Tier capacity (launch pricing, owner decision 2026-08-28): a placement
    // going live occupies one of the artist's concurrent-placement slots
    // (Core 2, Premium 5, Pro unlimited). Enforced on the pending -> active
    // transition regardless of which party clicks accept, because the wall
    // time is the artist's either way. The count is computed live from
    // placements; no cached counter column (AGENTS.md data invariant).
    if (status === "active" && existing.status === "pending" && existing.artist_user_id) {
      const { data: capProfile } = await db
        .from("artist_profiles")
        .select("subscription_plan, subscription_status")
        .eq("user_id", existing.artist_user_id)
        .maybeSingle();
      const { count: activeCount } = await db
        .from("placements")
        .select("id", { count: "exact", head: true })
        .eq("artist_user_id", existing.artist_user_id)
        .eq("status", "active");
      const decision = placementCapDecision({
        profile: capProfile ?? null,
        activeCount: activeCount ?? 0,
      });
      if (!decision.allowed) {
        const isOwnCap = existing.artist_user_id === auth.user!.id;
        return NextResponse.json(
          isOwnCap
            ? {
                error: "placement_limit_reached",
                message: `Your plan includes ${decision.cap} active placements at a time. Upgrade to take on more walls.`,
                upgrade_url: "/artist-portal/billing",
              }
            : {
                error: "placement_limit_reached",
                message: "This artist is at their plan's active placement limit right now. They can free a slot or upgrade, then you can accept.",
              },
          { status: 402 },
        );
      }
    }
```

Add the import at the top of the file with the other local imports:

```ts
import { placementCapDecision } from "./placement-cap";
```

- [ ] **Step 6: Surface the cap in the artist portal placements UI**

In the placements client component (`src/app/(pages)/placements/[id]/PlacementDetailClient.tsx` and/or the accept button's error handling), handle the `placement_limit_reached` error code the same way the existing `subscription_required` 402 is handled (toast plus link to `/artist-portal/billing`). Grep first: `grep -rn "subscription_required" src/app src/components` and mirror that pattern for the new code.

- [ ] **Step 7: Typecheck, run suites, commit**

Run: `npx tsc --noEmit && npx vitest run src/app/api/placements`
Expected: PASS.

```bash
git add src/app/api/placements/placement-cap.ts src/app/api/placements/placement-cap.test.ts src/app/api/placements/route.ts "src/app/(pages)/placements/[id]/PlacementDetailClient.tsx"
git commit -m "feat(pricing): concurrent placement caps per plan (2/5/unlimited)"
```

---

### Task 4: £15 paid-loan floor

**Files:**
- Modify: `src/lib/validations.ts:146` and `:257` (both `monthlyFeeGbp` fields)
- Modify: `src/app/api/placements/[id]/payment/setup/route.ts` (defence in depth before session creation, near line 116 where `monthlyFeePence` is computed)
- Modify: `src/components/SpacesPlacementRequestForm.tsx` (guidance copy near the monthly fee input; find with `grep -n "monthlyFee" src/components/SpacesPlacementRequestForm.tsx`)
- Test: `src/lib/validations.test.ts`

**Interfaces:**
- Consumes: `PAID_LOAN_MIN_GBP` from Task 1.
- Produces: `monthlyFeeGbp` accepts 0 (not a paid loan) or 15 to 100000; values 0.01 to 14.99 are rejected.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/validations.test.ts`:

```ts
import { placementSchema, placementUpdateSchema } from "./validations";

describe("paid-loan monthly fee floor", () => {
  const base = {
    id: "pl-1",
    workTitle: "Test work",
    venueSlug: "test-venue",
    type: "paid_loan" as const,
  };

  it("accepts zero (not a paid loan) and £15 and up", () => {
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 0 }).success).toBe(true);
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 15 }).success).toBe(true);
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 250 }).success).toBe(true);
  });

  it("rejects a rent between £0.01 and £14.99", () => {
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 5 }).success).toBe(false);
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 14.99 }).success).toBe(false);
  });

  it("applies the same floor to counter offers", () => {
    const counter = { id: "pl-1", counter: { monthlyFeeGbp: 10 } };
    expect(placementUpdateSchema.safeParse(counter).success).toBe(false);
    expect(
      placementUpdateSchema.safeParse({ id: "pl-1", counter: { monthlyFeeGbp: 20 } }).success,
    ).toBe(true);
  });
});
```

(Adjust `base` to satisfy `placementSchema`'s required fields if the parse fails for unrelated reasons; the schema at `validations.ts:132-157` requires `id`, `workTitle`, `venueSlug`, `type`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/validations.test.ts`
Expected: FAIL, £5 and £10 currently pass.

- [ ] **Step 3: Implement the floor**

In `src/lib/validations.ts`, add near the top with the other helpers:

```ts
import { PAID_LOAN_MIN_GBP } from "@/lib/pricing";

// Paid-loan rent floor (owner decision 2026-08-28): 0 means "no monthly fee,
// not a paid loan"; any actual rent must be at least £15/mo. Below that,
// Stripe's fixed fees eat the platform cut and cheap rent trains venues that
// art costs nothing (the Artsicle failure mode).
const monthlyFeeGbp = z
  .number()
  .min(0)
  .max(100000)
  .refine((v) => v === 0 || v >= PAID_LOAN_MIN_GBP, {
    message: `Monthly loan fees start at £${PAID_LOAN_MIN_GBP}. Set 0 for a free loan.`,
  });
```

Then replace both occurrences:
- Line 146: `monthlyFeeGbp: z.number().min(0).max(100000).optional(),` becomes `monthlyFeeGbp: monthlyFeeGbp.optional(),`
- Line 257 (inside `counter`): same replacement.

- [ ] **Step 4: Defence in depth at billing setup**

In `src/app/api/placements/[id]/payment/setup/route.ts`, immediately before `const monthlyFeePence = Math.round(placement.monthly_fee_gbp * 100);` (line 117), insert:

```ts
  // Floor guard (owner decision 2026-08-28). The Zod schemas enforce this on
  // new placements and counters; this catches legacy rows created before the
  // floor existed so we never start a subscription the fee maths cannot carry.
  if (placement.monthly_fee_gbp < PAID_LOAN_MIN_GBP) {
    return NextResponse.json(
      {
        error: `Monthly loan fees start at £${PAID_LOAN_MIN_GBP}. Ask the artist to update the placement terms.`,
        reason: "monthly_fee_below_floor",
      },
      { status: 422 },
    );
  }
```

Add `import { PAID_LOAN_MIN_GBP } from "@/lib/pricing";` to the imports.

- [ ] **Step 5: Guidance copy in the request form**

In `src/components/SpacesPlacementRequestForm.tsx`, under the monthly fee input, add helper text (public copy rules apply, no dashes):

```
Suggested rent: 3 to 5% of the work's value per month, minimum £15.
```

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run src/lib/validations.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/lib/validations.ts src/lib/validations.test.ts "src/app/api/placements/[id]/payment/setup/route.ts" src/components/SpacesPlacementRequestForm.tsx
git commit -m "feat(pricing): £15/mo paid-loan floor with form guidance"
```

---

### Task 5: Venue share on offer sales (work-on-wall rule)

**Files:**
- Modify: `src/app/api/offers/[id]/checkout/route.ts:148-200`
- Modify: `src/app/api/webhooks/stripe/route.ts:283-322` (order insert) and after the artist transfer block ending at line 420
- Test: `src/app/api/offers/[id]/checkout/route.test.ts`, `tests/integration/stripe-webhook.test.ts`

**Interfaces:**
- Consumes: `scheduleTransfer`, `recordBlockedLeg` from `@/lib/stripe-connect` (already imported in the webhook); `canReceivePayout` from `@/lib/payouts/capability`.
- Produces: session metadata keys `offer_venue_slug`, `offer_venue_user_id`, `offer_venue_cut_pence`, `offer_venue_share_percent`; order columns `venue_slug`, `venue_revenue`, `venue_revenue_share_percent` populated on offer orders; a venue `stripe_transfers` row.

The rule, for the implementer: a work physically hanging on a venue's wall earns that venue its placement share on any platform sale of that work, offers included. The share resolves from the works' own `artist_works.current_placement_id` (the same source the cart path uses after the 2026-08-28 fix in `legs.ts:112-121`). It applies only when every work on the offer resolves to one single active placement; a mixed-venue or unplaced offer pays no share, exactly as today. Fee stays computed on the gross; both fee and venue cut come off the artist's side, so `total = artist_revenue + venue_revenue + platform_fee` holds and `scripts/audit/reconcile-money.ts` stays green.

- [ ] **Step 1: Write the failing tests**

In `src/app/api/offers/[id]/checkout/route.test.ts`, following that file's existing mocking pattern for the Supabase and Stripe clients, add:

```ts
it("carries the venue share in metadata when every offered work hangs on one active placement", async () => {
  // Arrange the mocked DB: two works, both with current_placement_id "plc-1";
  // placements row { id: "plc-1", venue_slug: "copper-kettle", venue_user_id: "venue-user-1",
  // revenue_share_percent: 10, status: "active" }. Offer amount_pence: 30000.
  // Act: POST the route. Assert on the stripe.checkout.sessions.create call:
  const session = mockStripeCreate.mock.calls[0][0];
  expect(session.metadata.offer_venue_slug).toBe("copper-kettle");
  expect(session.metadata.offer_venue_cut_pence).toBe("3000"); // 10% of 30000
  expect(session.metadata.offer_platform_fee_pence).toBe("4500"); // 15% of 30000
  expect(session.metadata.offer_artist_net_pence).toBe("22500"); // 30000 - 4500 - 3000
});

it("pays no venue share when works span two placements or none", async () => {
  // Arrange: works with current_placement_id "plc-1" and "plc-2" (different venues).
  const session = mockStripeCreate.mock.calls[0][0];
  expect(session.metadata.offer_venue_cut_pence).toBe("0");
  expect(session.metadata.offer_venue_slug).toBe("");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/api/offers/[id]/checkout/route.test.ts"`
Expected: FAIL, the metadata keys do not exist.

- [ ] **Step 3: Implement resolution in the checkout route**

In `src/app/api/offers/[id]/checkout/route.ts`, after the `canReceivePayout` guard (line 146) and before the fee computation (line 150), insert:

```ts
  // Venue share on offers (owner decision 2026-08-28): a work hanging on a
  // venue's wall earns that venue its placement share on ANY platform sale of
  // the work, offers included. Resolved from the works' own placements
  // (current_placement_id), the same source of truth the cart path uses.
  // Applied only when every offered work sits on ONE active placement; a
  // mixed-venue or unplaced offer pays no share, matching prior behaviour.
  let venueShare: { venueSlug: string; venueUserId: string; percent: number } | null = null;
  if (workIds.length > 0) {
    const { data: shareWorks } = await db
      .from("artist_works")
      .select("id, current_placement_id")
      .in("id", workIds);
    const worksRows = (shareWorks || []) as Array<{ current_placement_id: string | null }>;
    const placementIds = [
      ...new Set(worksRows.map((w) => w.current_placement_id).filter((v): v is string => !!v)),
    ];
    const allPlaced = worksRows.length === workIds.length && worksRows.every((w) => w.current_placement_id);
    if (allPlaced && placementIds.length === 1) {
      const { data: pl } = await db
        .from("placements")
        .select("id, venue_slug, venue_user_id, revenue_share_percent, status")
        .eq("id", placementIds[0])
        .eq("status", "active")
        .maybeSingle<{ venue_slug: string | null; venue_user_id: string | null; revenue_share_percent: number | null }>();
      const percent = Math.max(0, Number(pl?.revenue_share_percent || 0));
      if (pl?.venue_slug && pl.venue_user_id && percent > 0) {
        venueShare = { venueSlug: pl.venue_slug, venueUserId: pl.venue_user_id, percent };
      }
    }
  }
```

Replace the split computation (lines 150-152) with:

```ts
  const feePercent = platformFeePercentForArtist(artistProfile);
  const platformFeePence = Math.round(offer.amount_pence * (feePercent / 100));
  const venueCutPence = venueShare
    ? Math.round(offer.amount_pence * (venueShare.percent / 100))
    : 0;
  const artistNetPence = offer.amount_pence - platformFeePence - venueCutPence;
```

Add to the session `metadata` object (after `offer_platform_fee_percent`):

```ts
      offer_venue_slug: venueShare?.venueSlug || "",
      offer_venue_user_id: venueShare?.venueUserId || "",
      offer_venue_cut_pence: String(venueCutPence),
      offer_venue_share_percent: String(venueShare?.percent || 0),
```

- [ ] **Step 4: Write the order and pay the venue in the webhook**

In `src/app/api/webhooks/stripe/route.ts`, in the purchase-offer branch:

(a) After line 274 (`const artistUserId = ...`), add:

```ts
        const offerVenueSlug = session.metadata.offer_venue_slug || null;
        const offerVenueUserId = session.metadata.offer_venue_user_id || null;
        const offerVenueCutPence = Number(session.metadata.offer_venue_cut_pence || 0);
        const offerVenueSharePct = Number(session.metadata.offer_venue_share_percent || 0);
```

(b) In the `db.from("orders").insert({...})` at lines 283-322, replace

```ts
          venue_revenue: 0,
          venue_revenue_share_percent: 0,
```

with

```ts
          venue_slug: offerVenueSlug,
          venue_revenue: offerVenueCutPence / 100,
          venue_revenue_share_percent: offerVenueSharePct,
```

(c) After the artist transfer block (the `}` at line 420), add:

```ts
        // Venue leg (owner decision 2026-08-28): the placement share applies to
        // offer sales of works hanging on that venue's wall. Same gate and
        // fallback semantics as the artist leg above: capability check first,
        // blocked-leg ledger row when the venue cannot be paid yet.
        if (offerVenueUserId && offerVenueCutPence > 0) {
          try {
            const { data: venueProfile } = await db
              .from("venue_profiles")
              .select("slug")
              .eq("user_id", offerVenueUserId)
              .maybeSingle();
            const vcap = venueProfile?.slug
              ? await canReceivePayout(db, { kind: "venue", slug: venueProfile.slug })
              : { ok: false as const, reason: "no_venue_profile", accountId: undefined };
            if (vcap.ok && vcap.accountId) {
              await scheduleTransfer({
                orderId: paidOrderId,
                recipientType: "venue",
                recipientUserId: offerVenueUserId,
                connectAccountId: vcap.accountId,
                amountCents: offerVenueCutPence,
                immediate: false,
              });
            } else {
              await recordBlockedLeg(db, {
                orderId: paidOrderId,
                recipientType: "venue",
                recipientUserId: offerVenueUserId,
                amountCents: offerVenueCutPence,
                reason: vcap.reason ?? "unknown",
              });
            }
          } catch (venueTransferErr) {
            console.error("[offer] venue transfer error:", venueTransferErr);
          }
        }
```

Before writing this, check the exact `canReceivePayout` venue call shape in `src/lib/payouts/capability.ts` (it gates on `venue_profiles.stripe_payouts_enabled`, migration 088). If it accepts `{ kind: "venue", userId }` directly, use that and drop the slug lookup.

- [ ] **Step 5: Extend the webhook integration test**

In `tests/integration/stripe-webhook.test.ts`, following its existing purchase-offer fixture pattern, add a case with the new metadata keys set and assert: the inserted order carries `venue_revenue: 30` and `venue_revenue_share_percent: 10` for a £300 offer at 10%, and a venue transfer of 3000 cents is scheduled (or a blocked leg recorded when the venue capability mock says not ready).

- [ ] **Step 6: Run all affected suites**

Run: `npx vitest run "src/app/api/offers" tests/integration/stripe-webhook.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/offers/[id]/checkout/route.ts" "src/app/api/offers/[id]/checkout/route.test.ts" src/app/api/webhooks/stripe/route.ts tests/integration/stripe-webhook.test.ts
git commit -m "feat(pricing): venue share applies to offer sales of placed works"
```

---

### Task 6: Re-gate the tier cards and application form on capacity

**Files:**
- Modify: `src/components/ArtistPricingCards.tsx:17-65` and `:158`
- Modify: `src/components/ApplicationForm.tsx:80-103`
- Modify: `src/app/(pages)/artist-portal/billing/page.tsx:21-26`

**Interfaces:**
- Consumes: `PLAN_PRICES`, `PLATFORM_FEE_PERCENT`, `WORKS_CAP`, `ACTIVE_PLACEMENT_CAP` from Task 1.

- [ ] **Step 1: Rewrite the PLANS array in `ArtistPricingCards.tsx`**

Replace lines 17-65 with (prices imported, fee line identical on all three, features led by capacity):

```tsx
import { PLAN_PRICES, PLATFORM_FEE_PERCENT, WORKS_CAP, ACTIVE_PLACEMENT_CAP } from "@/lib/pricing";

const FEE_LINE = `${PLATFORM_FEE_PERCENT}% platform fee on sales`;

const PLANS: Plan[] = [
  {
    key: "core",
    name: "Core",
    priceMonthly: PLAN_PRICES.core.monthlyGbp,
    priceAnnual: PLAN_PRICES.core.annualGbp,
    fee: FEE_LINE,
    features: [
      `Up to ${ACTIVE_PLACEMENT_CAP.core} active venue placements at a time`,
      `Up to ${WORKS_CAP.core} works in your portfolio`,
      "Standard artist profile",
      "Message venues directly",
      "Visibility to venues browsing the platform",
      "Basic analytics dashboard",
    ],
  },
  {
    key: "premium",
    name: "Premium",
    priceMonthly: PLAN_PRICES.premium.monthlyGbp,
    priceAnnual: PLAN_PRICES.premium.annualGbp,
    fee: FEE_LINE,
    highlighted: true,
    badge: "Most Popular",
    features: [
      `Up to ${ACTIVE_PLACEMENT_CAP.premium} active venue placements at a time`,
      `Up to ${WORKS_CAP.premium} works in your portfolio`,
      "Featured artist profile and badge",
      "Priority visibility in venue recommendations",
      "Full analytics, views, enquiries, conversion",
      "Priority response from the Wallplace team",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    priceMonthly: PLAN_PRICES.pro.monthlyGbp,
    priceAnnual: PLAN_PRICES.pro.annualGbp,
    fee: FEE_LINE,
    features: [
      "Unlimited active venue placements",
      `Up to ${WORKS_CAP.pro} works in your portfolio`,
      "Priority inclusion in Wallplace Curated shortlists",
      "Premium profile with enhanced presentation",
      "Full analytics with venue breakdown and export",
      "Dedicated account support",
    ],
  },
];
```

- [ ] **Step 2: Update `ApplicationForm.tsx` plan options (lines 80-103)**

```tsx
const planOptions = [
  {
    id: "core",
    name: "Core",
    price: "£9.99",
    fee: "15% platform fee",
    description: "2 active placements, up to 8 works, standard profile, basic analytics.",
  },
  {
    id: "premium",
    name: "Premium",
    price: "£24.99",
    fee: "15% platform fee",
    description: "5 active placements, up to 20 works, featured profile, full analytics.",
    popular: true as const,
  },
  {
    id: "pro",
    name: "Pro",
    price: "£49.99",
    fee: "15% platform fee",
    description: "Unlimited placements, up to 50 works, Curated priority, dedicated support.",
  },
];
```

- [ ] **Step 3: Update the billing page constants (lines 21-26)**

```tsx
const PLAN_DETAILS: Record<string, { name: string; priceMonthly: number; priceAnnual: number; fee: string }> = {
  core: { name: "Core", priceMonthly: 9.99, priceAnnual: 99.99, fee: "15%" },
  premium: { name: "Premium", priceMonthly: 24.99, priceAnnual: 249.99, fee: "15%" },
  pro: { name: "Pro", priceMonthly: 49.99, priceAnnual: 499.99, fee: "15%" },
  none: { name: "No plan", priceMonthly: 0, priceAnnual: 0, fee: "—" },
};
```

(If the file can import client-safe constants, prefer `PLAN_PRICES.core.monthlyGbp` etc. from `@/lib/pricing`; keep the literal fallback only if the import creates a server/client boundary problem.)

- [ ] **Step 4: Visual check**

Run: `npm run dev`, open `/pricing` and `/apply`. All three cards show the same fee line, capacity leads the feature lists, no "Unlimited works" remains anywhere.

- [ ] **Step 5: Commit**

```bash
git add src/components/ArtistPricingCards.tsx src/components/ApplicationForm.tsx "src/app/(pages)/artist-portal/billing/page.tsx"
git commit -m "feat(pricing): tier cards sell capacity, flat 15% fee, honest Pro works cap"
```

---

### Task 7: Copy sweep, every remaining "5 to 15%" surface

**Files:**
- Modify: `src/app/(pages)/pricing/page.tsx:44-49`, `:70-100`, `:283-300`
- Modify: `src/app/(pages)/faqs/page.tsx:19-30` and `:175-190`
- Modify: `src/app/(pages)/artist-agreement/page.tsx:43-47` and `:140-146`
- Modify: `src/app/page.tsx:296`

Public copy rules apply to every string in this task: no em or en dashes, British English.

- [ ] **Step 1: Pricing page comparison row (lines 44-49)**

```tsx
  {
    feature: "Platform fee on sales",
    core: "15%",
    premium: "15%",
    pro: "15%",
  },
```

Add a comparison row directly above it:

```tsx
  {
    feature: "Active placements at a time",
    core: "2",
    premium: "5",
    pro: "Unlimited",
  },
```

- [ ] **Step 2: Pricing page FAQ "What is a platform fee?" (lines 72-75)**

```tsx
  {
    question: "What is a platform fee?",
    answer:
      "The platform fee is the percentage Wallplace takes when a sale is made through the platform, whether that's a venue purchasing work outright, or a customer buying directly from a venue display. It is a flat 15% on every plan, separate from your membership cost. You keep the rest, minus any revenue share you have agreed with the venue hosting your work.",
  },
```

- [ ] **Step 3: Pricing page "The Pro case" block (lines 283-300)**

Replace the heading, both paragraphs and keep the button:

```tsx
              <h3 className="text-2xl mb-4">
                The Pro case: more walls, more often
              </h3>
              <p className="text-muted leading-relaxed mb-4">
                Every plan pays the same 15% fee on sales. What Pro buys is
                capacity and distribution: unlimited active placements at a
                time, up to 50 works, and priority inclusion when venues pay
                for a Wallplace Curated shortlist. Every extra wall is extra
                scans, enquiries and sale chances.
              </p>
              <p className="text-muted leading-relaxed mb-6">
                For artists producing enough work to hang in several venues at
                once, Pro is the commercially obvious choice.
              </p>
```

- [ ] **Step 4: Pricing page "Are there any other fees?" (lines 97-100)**

Append one sentence to the answer string, before the final full stop is fine as its own sentence:

```
All prices and fees are exclusive of VAT. If Wallplace becomes VAT registered, VAT will be added at the prevailing rate.
```

- [ ] **Step 5: FAQs "How does Wallplace make money?" (lines 19-30)**

Replace the first paragraph:

```tsx
        <p>
          Wallplace earns through artist membership plans (from £9.99/month),
          a flat 15% platform fee on artwork sales, and optional paid services
          for venues such as Wallplace Curated. When a piece sells, the artist
          keeps the majority. Displaying art is always free for venues.
        </p>
```

- [ ] **Step 6: FAQs venue-cost answer (lines 175-190)**

Replace the sentence "Venues never pay a platform fee, Wallplace's revenue comes from sales commissions and optional artist tools, not from charges to venues." with:

```
Venues never pay a platform fee and never pay to display. Wallplace earns from artist memberships, a fee on sales, and optional services venues can choose, such as Wallplace Curated.
```

- [ ] **Step 7: Artist agreement plan list and worked example**

At `artist-agreement/page.tsx:43-45` replace the three bullets:

```tsx
                    <li><strong className="text-foreground">Core:</strong> &pound;9.99/month, 15% platform fee on sales, up to 2 active placements</li>
                    <li><strong className="text-foreground">Premium:</strong> &pound;24.99/month, 15% platform fee on sales, up to 5 active placements</li>
                    <li><strong className="text-foreground">Pro:</strong> &pound;49.99/month, 15% platform fee on sales, unlimited active placements</li>
```

In §2 after the billing paragraph (line 48), add:

```tsx
                  <p>All prices and fees are exclusive of VAT. If Wallplace becomes VAT registered, VAT will be added at the prevailing rate.</p>
```

At `:144-145` (§9), the current example contradicts the code: `legs.ts:194` computes the venue share on the gross sale price, not on the post-fee amount. Replace both sentences:

```tsx
                  <p>Revenue Share payments are processed via Stripe Connect. The venue&rsquo;s share is calculated on the sale price of the artwork; the platform fee is calculated on the same sale price. Both are deducted from your proceeds.</p>
                  <p><strong className="text-foreground">Example:</strong> &pound;500 sale, 15% platform fee, 10% venue share. Platform fee = &pound;75. Venue share = &pound;50. You receive &pound;375.</p>
```

- [ ] **Step 8: Homepage bullet (page.tsx:296)**

Replace `"5 to 15% platform fee. No gallery taking 50%."` with:

```
"Flat 15% platform fee. No gallery taking 50%."
```

- [ ] **Step 9: Sweep for stragglers**

Run: `grep -rn "5 to 15\|5–15\|5-15%\|8% platform\|5% platform" src/ ../flyer-venues.html`
Expected: zero hits in user-facing copy after this task (the flyer is Task 8).

- [ ] **Step 10: Commit**

```bash
git add "src/app/(pages)/pricing/page.tsx" "src/app/(pages)/faqs/page.tsx" "src/app/(pages)/artist-agreement/page.tsx" src/app/page.tsx
git commit -m "copy(pricing): flat 15% everywhere, capacity tiers, VAT reservation, corrected venue share example"
```

---

### Task 8: Flyer corrections and founding cohort guard

**Files:**
- Modify: `../flyer-venues.html:583-584`
- Modify: the admin surface that writes `is_founding_artist` (find it: `grep -rn "is_founding_artist" src/ --include="*.ts" --include="*.tsx"`; expected in an admin artists route)

- [ ] **Step 1: Fix the flyer pricing card (lines 583-584)**

The flyer advertises a 3% fee floor that has never existed in code, uses an `&mdash;`, and promises 6 months free to everyone when only `is_founding_artist` accounts get 180 days. Replace:

```html
        <p class="pricing-card-headline">First 20 artists: 6 months free</p>
        <p class="pricing-card-desc">Plans from &pound;9.99/month. Flat 15% platform fee on sales.</p>
```

(The headline stays only because Task 8 Step 2 makes it true.)

- [ ] **Step 2: Enforce the founding limit where the flag is set**

In the admin route that writes `is_founding_artist` (located via the grep above), before setting the flag to true, add:

```ts
import { FOUNDING_ARTIST_LIMIT } from "@/lib/pricing";

const { count: foundingCount } = await db
  .from("artist_profiles")
  .select("id", { count: "exact", head: true })
  .eq("is_founding_artist", true);
if ((foundingCount ?? 0) >= FOUNDING_ARTIST_LIMIT) {
  return NextResponse.json(
    { error: `The founding cohort is full (${FOUNDING_ARTIST_LIMIT} artists).` },
    { status: 409 },
  );
}
```

If the grep shows the flag is only ever set by hand in SQL (no admin write path), instead add the guard as a partial unique safeguard note in `docs/` and create the admin toggle in the existing admin artists route following that file's own update pattern.

- [ ] **Step 3: Also route the subscribe trial days through pricing.ts**

In `src/app/api/subscribe/route.ts:85` replace:

```ts
    const trialDays = hadPreviousSub ? 0 : profile.is_founding_artist ? 180 : 30;
```

with:

```ts
    const trialDays = hadPreviousSub ? 0 : profile.is_founding_artist ? FOUNDING_TRIAL_DAYS : STANDARD_TRIAL_DAYS;
```

and add `import { FOUNDING_TRIAL_DAYS, STANDARD_TRIAL_DAYS } from "@/lib/pricing";`.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run src/app/api`
Expected: PASS.

```bash
git add ../flyer-venues.html src/app/api/subscribe/route.ts src/app/api/admin
git commit -m "fix(pricing): flyer matches real fees and trials, founding cohort capped at 20"
```

---

### Task 9: Curated tier files, one source of truth

**Files:**
- Modify: `src/lib/curated-tiers.ts` (marketing copy) and `src/lib/curation-tiers.ts` (billing truth)
- Test: `tests/integration/one-curated-price-source.test.ts` (create)

Prices do not change in this task. The problem is duplication: `curation-tiers.ts` holds the billing prices (`priceGbp`), `curated-tiers.ts` holds display strings (`priceLabel: "£49"`, `cta: "Book for £49"`). A future reprice edits one and silently not the other.

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/one-curated-price-source.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Every literal pound amount in the marketing tier file must appear as a
// priceGbp in the billing tier file, so the two cannot drift apart.
describe("curated pricing has one source of truth", () => {
  it("marketing labels derive from billing prices", () => {
    const marketing = readFileSync(join(process.cwd(), "src/lib/curated-tiers.ts"), "utf8");
    expect(marketing).toContain('from "./curation-tiers"');
    expect(marketing).not.toMatch(/£\d+(\.\d{2})?/);
    expect(marketing).not.toMatch(/&pound;\d/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/one-curated-price-source.test.ts`
Expected: FAIL, the marketing file contains literal prices.

- [ ] **Step 3: Refactor `curated-tiers.ts` to derive labels**

In `src/lib/curated-tiers.ts`, import the billing tiers and build every price string from `priceGbp`:

```ts
import { CURATION_TIERS } from "./curation-tiers";

const gbp = (n: number) => `£${Number.isInteger(n) ? n : n.toFixed(2)}`;
// then e.g.:
// priceLabel: gbp(CURATION_TIERS.single_wall.priceGbp)
// cta: `Book for ${gbp(CURATION_TIERS.single_wall.priceGbp)}`
// bespoke keeps its "From" prefix: `From ${gbp(CURATION_TIERS.bespoke.priceGbp)}`
// managed monthly: `${gbp(CURATION_TIERS.managed_monthly.priceGbp)} / month`
```

Match the exact export names in `curation-tiers.ts` when writing this (open the file first; the tier keys are `single_wall`, `full_space`, `bespoke`, `managed_monthly`, `managed_quarterly` per `src/lib/curation-tiers.ts:32-50`).

- [ ] **Step 4: Run the test and the curated page**

Run: `npx vitest run tests/integration/one-curated-price-source.test.ts && npx tsc --noEmit`
Expected: PASS. Then `npm run dev`, open `/curated`, confirm the tier cards render the same prices as before (£49, £149, From £299, £79.99 / month, £199.99 / quarter).

- [ ] **Step 5: Commit**

```bash
git add src/lib/curated-tiers.ts tests/integration/one-curated-price-source.test.ts
git commit -m "refactor(pricing): curated marketing labels derive from billing tiers"
```

---

### Task 10: VAT wording on Curated and venue surfaces

**Files:**
- Modify: `src/app/(pages)/curated/page.tsx` (footer or FAQ area; find the existing FAQ block with `grep -n "refund" "src/app/(pages)/curated/page.tsx"`)
- Modify: `src/app/(pages)/venue-agreement/page.tsx` (fees section, near the lines quoted below)

Artist-side VAT wording landed in Task 7. This closes the venue-paying surfaces. Public copy rules apply.

- [ ] **Step 1: Curated page**

Near the Curated FAQ or price cards, add one sentence in the same typographic style as the surrounding copy:

```
Prices are exclusive of VAT. If Wallplace becomes VAT registered, VAT will be added at the prevailing rate.
```

- [ ] **Step 2: Venue agreement**

The venue agreement at `venue-agreement/page.tsx:41-43` promises free display and 90 days' notice; do not touch those promises. In the section describing optional paid services (or, if none exists, directly after the paragraph at line 43), add:

```
Optional paid services, such as Wallplace Curated, are priced exclusive of VAT. If Wallplace becomes VAT registered, VAT will be added at the prevailing rate.
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/curated/page.tsx" "src/app/(pages)/venue-agreement/page.tsx"
git commit -m "copy(pricing): VAT-exclusive wording on curated and venue agreement"
```

---

### Task 11: Full gate, money reconciliation, and visual pass

**Files:** none new.

- [ ] **Step 1: Run the complete gate**

Run: `npm run check`
Expected: lint, typecheck, all vitest suites, route allowlist, depcheck and email audits PASS. Fix anything the sweep in Tasks 2 to 10 missed (the likeliest failures: fee fixtures still asserting 8 or 5, and copy tests like `one-label-source`).

- [ ] **Step 2: Run the money reconciliation script against the dev database**

Run: `source ~/.zshrc 2>/dev/null; npm run audit:reconcile`
Expected: exit 0 (clean) or exit 2 (misconfigured env, acceptable locally); NOT exit 1 (drift).

- [ ] **Step 3: Visual pass in the browser**

Run the dev server and check, in order: `/pricing` (flat 15 everywhere, placements row, Pro case rewritten), `/apply` (plan descriptions), `/artist-portal/billing` (fee 15% on all plans), `/faqs` (both rewritten answers), `/artist-agreement` (§2 and §9), `/curated` (prices unchanged, VAT line), homepage bullet.

- [ ] **Step 4: Commit any stragglers**

```bash
git add -A
git commit -m "chore(pricing): full-gate fixes for the launch pricing change"
```

---

### Task 12: Stripe activation runbook (owner-operated, no code)

This is the checklist that makes any of the above sellable. It is dashboard work for the owner, tracked here so the plan ends at "can take a pound", not "code merged". Reference: `docs/launch/EXTERNAL_SETUP.md` (currently 0 of 7 Stripe items done).

- [ ] Create the six subscription prices in the Stripe dashboard, amounts exactly matching `src/lib/pricing.ts`: Core £9.99/mo and £99.99/yr, Premium £24.99/mo and £249.99/yr, Pro £49.99/mo and £499.99/yr. Set `STRIPE_PRICE_CORE`, `STRIPE_PRICE_CORE_ANNUAL`, `STRIPE_PRICE_PREMIUM`, `STRIPE_PRICE_PREMIUM_ANNUAL`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PRO_ANNUAL` in Vercel env. The webhook refuses to stamp plans for unknown price IDs (`webhooks/stripe/route.ts:1246-1259`), so this is load-bearing.
- [ ] Create the two Curated subscription prices (£79.99 monthly, £199.99 quarterly) and set `STRIPE_PRICE_CURATION_MONTHLY`, `STRIPE_PRICE_CURATION_QUARTERLY`. The managed tiers 503 without them (`api/curation/route.ts:210-213`).
- [ ] Optionally set `PRICE_CORE_PENCE=999`, `PRICE_PREMIUM_PENCE=2499`, `PRICE_PRO_PENCE=4999` (the dashboard now defaults correctly from pricing.ts either way).
- [ ] Swap test keys for live keys (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) and create the live webhook endpoint with the events listed in `EXTERNAL_SETUP.md`; set `STRIPE_WEBHOOK_SECRET`.
- [ ] In TEST mode first, run one full end-to-end pound through each rail: artist subscription (check `subscription_plan` stamps), cart sale with a QR venue attribution (check order splits and `stripe_transfers` rows), an offer on a placed work (check the venue leg from Task 5), a paid-loan setup and first invoice, a Curated single-wall payment, and a refund (check the transfer reversal).
- [ ] Repeat one live-mode smoke test of the artist subscription and a £1-scale sale, then refund it.
- [ ] Only after all boxes tick: distribute the corrected flyer.

---

## Deliberately out of scope (decided, not forgotten)

- No change to venue revenue share bounds: the owner decided the share stays uncapped (DB CHECK 0 to 100 stands, Zod stays `min(0).max(100)`). 10% appears only as suggested copy.
- No Core price rise to £14.99: that is Phase 2, gated on the placement SLA metric, not part of launch.
- No rent-to-buy credit, no venue subscriptions, no print fulfilment: later phases.
- The unpriced logistics promises in copy (returns on cancellation at `/pricing:94`, collection within 30 days in the venue agreement) are a business decision still open with the owner; not code.

## Self-review notes

- Spec coverage: fee flattening (T2), capacity tiers (T1, T3, T6, T7), paid-loan floor (T4), offers venue share (T5), single pricing source (T1, T9), founding cohort and flyer (T8), VAT wording (T7, T10), Stripe activation (T12). The strategy's "fix FAQ venue contradiction" lands in T7 Step 6; "Pro unlimited vs 50" lands in T6.
- Type consistency: `activePlacementCapForProfile` and `placementCapDecision` names match between T1 and T3; `PLAN_PRICES` shape matches T1's test and T6's usage; metadata keys match between T5's checkout and webhook steps.
- Placeholder scan: T5 Step 1 describes mock arrangement in prose because the existing test file's mocking harness must be reused; the assertions are concrete. T8 Step 2 carries an explicit fallback if no admin write path exists. Everything else is literal code.
