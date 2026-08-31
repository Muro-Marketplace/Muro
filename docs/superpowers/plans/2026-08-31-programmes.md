# Wallplace Programmes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Supersedes:** `2026-08-31-workplaces-programme.md` (deleted in Task 1). That plan built workplaces as a separate product; this one restructures all of recurring Curated into a single programme ladder, of which workplaces is the top half.

**Goal:** Turn recurring Wallplace Curated into one quoted "programme" product, priced at roughly £25 per piece per month from £79.99 to £400+ per site, where every invoice accrues about £10 per piece per month of rent to the artists whose work is on the wall, settled quarterly.

**Architecture:** One `programme` tier replaces `managed_monthly` and `managed_quarterly` in `curation-tiers.ts`. Every deal is quoted (no fixed Stripe price IDs), billed as a subscription built from dynamic `price_data`, exactly the pattern `placements/[id]/payment/setup/route.ts` already uses. Paid invoices write rent accrual rows; a quarterly cron batches unsettled accruals into one transfer per artist through the existing `scheduleTransfer` ledger. The one-off curation tiers (£49/£149/£299) keep their fee-for-judgement role and gain a credit toward a programme.

**Tech Stack:** Next.js (nonstandard, see constraints), TypeScript, Supabase, Stripe (subscription mode, dynamic price_data, customer balance credits), Zod, Vitest.

## Global Constraints

- Work in `website/` inside the worktree `.claude/worktrees/marketplace-pricing-launch-d7a844`. All paths relative to `website/` unless prefixed `../`.
- **This is NOT the Next.js you know** (website/AGENTS.md): read the relevant guide in `node_modules/next/dist/docs/` before route or component work.
- **Check before implementing**: read the real file before changing it; implement only what is missing.
- **Public copy rules**: no em dashes, no en dashes, no `&mdash;`/`&ndash;`, British English, no emojis, in every user-facing string.
- **Money invariants**: payouts go through `scheduleTransfer`/`recordBlockedLeg` (`src/lib/stripe-connect.ts`) gated by `canReceivePayout` (`src/lib/payouts/capability.ts`, takes `{kind, userId}`); transfer idempotency is the unique `(order_id, recipient_user_id)` key; `scripts/audit/reconcile-money.ts` stays green.
- **Price single-source rule** (enforced by `tests/integration/one-curated-price-source.test.ts`): no literal pound-numbers in `src/lib/curated-tiers.ts`, `src/app/(pages)/curated/CuratedClient.tsx`, `src/app/(pages)/curated/page.tsx`, and the new programme pages. All numbers live in `src/lib/curation-tiers.ts`.
- **Data invariant**: derived aggregates live in one exported function; no manually refreshed mirror columns. Accrual rows record facts (rent earned in a period), which is allowed; a running per-artist balance column is not.
- Migrations: next free number from `ls supabase/migrations | tail`, and per the standing rule production is ahead of every branch, so check the live project's `list_migrations` first if Supabase access is available; otherwise pick the next local number and flag it in the report.

### Owner decisions locked for this plan

- **One price rule:** charge about **£25 per piece per month**; the from-anchor is **£79.99** (3 pieces). Quoting ladder as guidance: 3 pieces £79.99, 6 pieces £150, 10 pieces £250, 16 pieces £400.
- **One artist rule:** **£10 per piece per month** to the artist (floor £5, guidance £8 to £12). The rent pool must never exceed **70%** of the monthly-equivalent quote; that is a mis-quote guard, not a target. The operating target is about 40%.
- **Every programme is quoted.** No pay-first programme checkout. The two unused env vars `STRIPE_PRICE_CURATION_MONTHLY` and `STRIPE_PRICE_CURATION_QUARTERLY` are retired, not configured.
- **Rotation is a price lever:** biannual included; quarterly rotation is an uplift of £30 to £50 per month, set at quote time. There is no monthly rotation option.
- **Rent settles quarterly** regardless of whether the client is billed monthly or quarterly, because Stripe charges roughly £1.60 per connected account per month in which it receives anything, which would otherwise consume about 8% of a small programme's revenue.
- **Programme placements are normal placements** and count toward artist concurrent-placement caps (2/5/unlimited). Deliberate: rent-paying placements are what make the Pro tier's "priority inclusion in Curated shortlists" concretely worth buying.
- **Cafés keep the free baseline.** A programme is an optional paid service above it, exactly what the venue agreement's 90-day clause anticipated. Nothing in this plan changes free QR-loan display.
- **Sale proceeds are unaffected**: a piece sold off a programme wall follows the normal 15% platform fee and artist split. Sold pieces are replaced at the next scheduled rotation, not by an ad-hoc visit.
- **Founding sites**: the first 5 programme clients lock their rate for 24 months, mirroring the founding-artist mechanic. Recorded on the request row, honoured at requote time, never advertised as unlimited.

### Naming decisions (owner granted full authority, 2026-08-31)

- **Wallplace Curated** keeps its name and narrows to what it is: the one-off fee for judgement (£49, £149, £299). A paid shortlist.
- **Wallplace Programmes** is the recurring product. "Programme" is the sector's own term (Artiq and TurningArt both sell art programmes), so it matches what buyers search for and how they speak. It works in a sentence ("we run a Wallplace programme"), covers cafés through to hotels without excluding anyone, and collides with nothing: "Walls" is taken by the visualiser and "Collections" by artwork bundles.
- **One marketing page at `/programmes`**, leading with workplaces because that is where the budget is, covering the whole ladder. **`/workplaces` is a permanent redirect to it**, so the sales-friendly URL works when it is said aloud on a call. Do not build a second page.
- Every user-facing string says "programme" (British spelling), never "program".

### Deliberately out of scope

Multi-site org accounts, rotation scheduling automation, programme analytics dashboards, self-serve programme management, per-programme insurance line items, case-study CMS. Three pilot sales come before any of these.

---

### Task 1: The `programme` tier replaces the managed tiers

**Files:**
- Modify: `src/lib/curation-tiers.ts`, `src/lib/curated-tiers.ts`
- Delete: `docs/superpowers/plans/2026-08-31-workplaces-programme.md`
- Test: `src/lib/curation-tiers.test.ts` (extend or create), `tests/integration/one-curated-price-source.test.ts` (must stay green)

**Interfaces:**
- Produces: `CURATION_TIERS.programme` with `{ priceGbp: 79.99, payFirst: false, kind: "quoted_subscription", termMonths: 12, responseDays: 2 }` (adapt field names to the file's real `CurationTier` shape; extend the type with optional `kind`/`termMonths` rather than forking it). Also exports:
  - `PROGRAMME_LADDER: ReadonlyArray<{ pieces: number; monthlyGbp: number }>` = `[{3, 79.99}, {6, 150}, {10, 250}, {16, 400}]`
  - `PROGRAMME_PIECE_RENT_MIN_GBP = 5`, `PROGRAMME_PIECE_RENT_TARGET_GBP = 10`, `PROGRAMME_RENT_SHARE_MAX = 0.7`
  - `PROGRAMME_QUARTERLY_ROTATION_UPLIFT_GBP = 40`
- Removes: `CURATION_TIERS.managed_monthly`, `CURATION_TIERS.managed_quarterly` and their marketing cards.

- [ ] **Step 1: Read both tier files fully**, plus every consumer of the two managed tiers (`grep -rn "managed_monthly\|managed_quarterly" src/ tests/`). List them; they are updated across Tasks 1, 2 and 5.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/curation-tiers.test.ts
import {
  CURATION_TIERS,
  PROGRAMME_LADDER,
  PROGRAMME_PIECE_RENT_MIN_GBP,
  PROGRAMME_PIECE_RENT_TARGET_GBP,
  PROGRAMME_RENT_SHARE_MAX,
} from "./curation-tiers";

describe("programme tier", () => {
  it("is quote-first, from £79.99, on a 12 month term", () => {
    expect(CURATION_TIERS.programme.priceGbp).toBe(79.99);
    expect(CURATION_TIERS.programme.payFirst).toBe(false);
    expect(CURATION_TIERS.programme.termMonths).toBe(12);
  });

  it("retires the fixed-price managed tiers", () => {
    expect("managed_monthly" in CURATION_TIERS).toBe(false);
    expect("managed_quarterly" in CURATION_TIERS).toBe(false);
  });

  it("prices the ladder at about £25 per piece per month", () => {
    expect(PROGRAMME_LADDER).toHaveLength(4);
    for (const rung of PROGRAMME_LADDER) {
      const perPiece = rung.monthlyGbp / rung.pieces;
      expect(perPiece).toBeGreaterThanOrEqual(24);
      expect(perPiece).toBeLessThanOrEqual(27);
    }
  });

  it("keeps the artist rent guardrails", () => {
    expect(PROGRAMME_PIECE_RENT_MIN_GBP).toBe(5);
    expect(PROGRAMME_PIECE_RENT_TARGET_GBP).toBe(10);
    expect(PROGRAMME_RENT_SHARE_MAX).toBe(0.7);
  });

  it("keeps the artist share near 40% at every rung when rent is on target", () => {
    for (const rung of PROGRAMME_LADDER) {
      const share = (rung.pieces * PROGRAMME_PIECE_RENT_TARGET_GBP) / rung.monthlyGbp;
      expect(share).toBeGreaterThan(0.35);
      expect(share).toBeLessThan(PROGRAMME_RENT_SHARE_MAX);
    }
  });
});
```

- [ ] **Step 3: Run it, see it fail**, then implement. Add the tier and constants with a comment block recording the owner decisions above (one price rule, one artist rule, quoted only, rotation as a lever, quarterly settlement). Delete the two managed tiers.

- [ ] **Step 4: Marketing card.** In `src/lib/curated-tiers.ts`, replace the two managed cards with one Programmes card, every number derived through the existing `gbp()` import. Copy (no dashes, British English): title `Programmes`, price line `` `From ${gbp(CURATION_TIERS.programme.priceGbp)} per site per month` ``, cta `Request a programme quote`, description: "Original art from local artists on your walls all year, rotated, installed and labelled, with rent paid to every artist on the wall. Quoted per site on a twelve month term. For offices, hotels, restaurants and any space that wants its walls handled." Follow the array's existing item shape exactly; FAQ answers derive prices via `gbp()` too.

- [ ] **Step 5: Delete the superseded plan** `docs/superpowers/plans/2026-08-31-workplaces-programme.md`.

- [ ] **Step 6:** `npx vitest run src/lib/curation-tiers.test.ts tests/integration/one-curated-price-source.test.ts && npx tsc --noEmit`, then commit `feat(programmes): one quoted programme tier replaces the managed tiers`.

---

### Task 2: Intake fields and API

**Files:**
- Create: `supabase/migrations/<next>_programme_curation_fields.sql`
- Modify: `src/app/api/curation/route.ts` and wherever its Zod schema lives (read the route first)
- Test: the curation route's existing test file

**Interfaces:**
- Produces on `curation_requests` (all nullable, so existing rows are unaffected): `site_count integer CHECK (site_count > 0)`, `pieces_estimate integer CHECK (pieces_estimate > 0)`, `rotation_cadence text CHECK (rotation_cadence IN ('quarterly','biannual','none'))`, `sector text`, `term_months integer`, `quoted_amount_gbp numeric CHECK (quoted_amount_gbp > 0)`, `billing_interval text CHECK (billing_interval IN ('month','quarter'))`, `piece_rent_gbp numeric CHECK (piece_rent_gbp >= 5)`.

- [ ] **Step 1:** Read migrations 013 and 100 and the current route usage; confirm which columns already exist (there is already a brief/notes free-text column: reuse it, do not add another). Write the migration for only the missing columns, header-commented with this plan's name.

- [ ] **Step 2: Failing route tests:** (a) `{ tier: "programme", siteCount: 1, piecesEstimate: 8, rotationCadence: "biannual", sector: "office" }` creates an `awaiting_quote` row, creates no Stripe session, and sends the existing quote-request email; (b) `piecesEstimate: 0` is 400; (c) `rotationCadence: "monthly"` is 400; (d) a request naming a retired tier (`managed_monthly`) is 400 rather than 500.

- [ ] **Step 3: Implement.** Route `programme` down the same quote-first branch `bespoke` uses. Zod: `siteCount: z.number().int().positive().max(50)`, `piecesEstimate: z.number().int().positive().max(60)`, `rotationCadence: z.enum(["quarterly","biannual","none"])`, `sector: z.string().max(80).optional()`. Delete the managed-tier 503 branch and its env-var reads; that path no longer exists.

- [ ] **Step 4:** Green, `npx tsc --noEmit`, commit `feat(programmes): quote-first intake with site, sector and rotation fields`.

---

### Task 3: Demand surfaces

**Files:**
- Create: `src/app/(pages)/programmes/page.tsx` (+ a client component only if interactivity demands it; mirror how `/curated` splits)
- Create: a permanent redirect `/workplaces` to `/programmes` (use the project's existing redirect mechanism; check `next.config.ts` for how other redirects are declared and follow it, else a route file that redirects)
- Modify: nav and footer (grep where `/curated` and `/venues` links live), `src/app/(pages)/curated/CuratedClient.tsx` (Programmes card), the public artwork page that QR scans land on (one feeder line)
- Test: extend `tests/integration/one-curated-price-source.test.ts` to cover the new page files; if `tests/integration/redirect-targets.test.ts` exists, add the `/workplaces` redirect to it

The page leads with the sharp end of the ladder, where the budget is (offices, hotels, restaurants), then shows the full ladder so a café or restaurant sees itself too.

**Page content contract** (copy rules apply; every number derived from `CURATION_TIERS.programme` and `PROGRAMME_LADDER` via `gbp()`):
- Hero: what it is, the from-price, one CTA into the Task 2 intake.
- What is included: curation, original pieces from local artists, installation coordination, labels and QR cards, rotation through the year, and rent paid to every artist on the wall.
- Size guide rendered from `PROGRAMME_LADDER` (pieces to monthly price).
- Why it is different: agencies rent stock and pay nobody local; this pays a named artist every month, and staff can buy the work off the wall.
- Proof: the venue network as a live portfolio, with a link to browse.
- The standard VAT sentence: `Prices are exclusive of VAT. If Wallplace becomes VAT registered, VAT will be added at the prevailing rate.`
- FAQ: term (twelve months, then rolling), billing (monthly or quarterly), rotation (twice a year included, quarterly available), what happens when a piece sells (replaced at the next rotation, normal artist split applies), can staff buy (yes, via the QR card).

- [ ] **Step 1:** Add the new file paths to the no-literal-prices guard, run, RED.
- [ ] **Step 2:** Build the page (read `src/app/(pages)/venues/page.tsx` first for the segment-page pattern), the `/workplaces` redirect, the Curated card wiring, nav entry, and the artwork-page feeder line: `Want art like this in your workplace?` linking to `/programmes`.
- [ ] **Step 3:** GREEN on the guard, `npx tsc --noEmit`, and a dev-server render check of `/programmes`, `/workplaces` (redirects), `/curated` and one artwork page.
- [ ] **Step 4:** Commit `feat(programmes): programmes page, curated card and QR feeder`.

---

### Task 4: Admin quoting and quoted subscription checkout

**Files:**
- Modify: `src/app/api/admin/curation/` (add a quote route or extend the existing update route, following that folder's `withAdmin` + audit conventions; the founding-cohort PATCH in `src/app/api/admin/artists/route.ts` is the closest recent example)
- Modify/create: the requester-facing checkout path for quoted tiers
- Test: colocated route tests for both

**Interfaces:**
- Admin writes `{ quotedAmountGbp, billingInterval, piecesEstimate, pieceRentGbp, rotationCadence }` onto an `awaiting_quote` programme row, then the requester gets a checkout link by email.
- Checkout creates a Stripe **subscription** session from dynamic `price_data`: `unit_amount = Math.round(quotedAmountGbp * 100)`, `recurring = { interval: "month", interval_count: billingInterval === "quarter" ? 3 : 1 }` (Stripe expresses quarterly as month x 3), metadata `{ curation_request_id, tier: "programme" }`.

**Validation the admin route must enforce** (each with its own test):
- quote is at least `CURATION_TIERS.programme.priceGbp`
- `pieceRentGbp >= PROGRAMME_PIECE_RENT_MIN_GBP`
- monthly-equivalent rent pool (`piecesEstimate * pieceRentGbp`) is at most `PROGRAMME_RENT_SHARE_MAX` x monthly-equivalent quote (for a quarterly interval, monthly-equivalent quote is `quotedAmountGbp / 3`)
- row is `awaiting_quote` and its tier is `programme`, else 409
- checkout on an unquoted row is 409

Copy the session shape and idempotency window from `src/app/api/placements/[id]/payment/setup/route.ts`. The fixed-price integrity check in the curation route (Stripe price must equal tier price x 100) must not run for quoted tiers: branch on the tier's `kind`.

- [ ] **Step 1:** Failing tests for each validation rule above plus a happy-path assertion that `line_items[0].price_data.unit_amount` equals the quote in pence, `interval_count` is 3 for quarterly, and the request id is in metadata.
- [ ] **Step 2:** Implement both routes.
- [ ] **Step 3:** GREEN, `npx tsc --noEmit`, commit `feat(programmes): admin quoting and quoted subscription checkout`.

---

### Task 5: Programme lifecycle on the existing reconcilers

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`, `src/lib/curation/billing.ts`
- Modify: `docs/launch/EXTERNAL_SETUP.md` (retire the two curation price-ID items)
- Test: `src/app/api/webhooks/stripe/route.test.ts`

Managed Curated already reconciles `invoice.paid` to `in_progress` plus `last_invoice_paid_at`, `payment_failed` to `past_due`/`paused`, and `subscription.deleted` to `cancelled` with an admin alert. Programmes ride the same reconcilers, resolved by **metadata** rather than the env price-ID lookup, which no longer exists.

- [ ] **Step 1:** Read `src/lib/curation/billing.ts` and the webhook's curation branches; find exactly where price ID maps to tier.
- [ ] **Step 2: Failing tests:** first `invoice.paid` for a programme session moves the row to `in_progress` and stamps `last_invoice_paid_at`; `payment_failed` marks `past_due`; `subscription.deleted` marks `cancelled` and alerts; a webhook redelivery of the same invoice is a no-op.
- [ ] **Step 3:** Replace the price-ID lookup with metadata resolution (`tier: "programme"` plus `curation_request_id`), keeping every existing status transition and idempotency guard intact. Remove the now-dead env-var reads and delete the two items from the setup checklist.
- [ ] **Step 4:** GREEN, typecheck, commit `feat(programmes): lifecycle rides the curation billing reconcilers`.

---

### Task 6: Rent accrual on paid invoices

**Files:**
- Create: `supabase/migrations/<next>_programme_rent_accruals.sql`
- Create: `src/lib/curation/programme-rent.ts`
- Modify: the webhook's programme `invoice.paid` branch
- Test: `src/lib/curation/programme-rent.test.ts`, webhook test extension

**Schema:**
- `placements.programme_request_id uuid REFERENCES curation_requests(id)` (nullable) and `placements.programme_rent_gbp numeric CHECK (programme_rent_gbp >= 5)` (nullable). Both are **server-owned**: add them to the server-owned field list the same way `is_founding_artist` is protected in `src/lib/db/writable-fields.ts`.
- `programme_rent_accruals`: `id uuid pk`, `curation_request_id uuid not null`, `placement_id uuid not null`, `artist_user_id uuid not null`, `stripe_invoice_id text not null`, `period_months integer not null check (period_months > 0)`, `amount_pence integer not null check (amount_pence > 0)`, `accrued_at timestamptz default now()`, `settled_transfer_order_id text` (nullable), `settled_at timestamptz` (nullable), plus `UNIQUE (stripe_invoice_id, placement_id)` so a webhook redelivery cannot double-accrue.

**Interface:**
- `accrueProgrammeRent(db, { curationRequestId, invoiceId, periodMonths, quotedAmountPence }): Promise<{ accrued: number; skipped: number; blockedReason?: string }>`

**Behaviour:** find active placements with `programme_request_id = curationRequestId` and `programme_rent_gbp > 0`; for each, insert an accrual of `round(programme_rent_gbp * 100) * periodMonths` (a quarterly invoice accrues three months). Before inserting anything, check the pool guard: if the sum of monthly rents exceeds `PROGRAMME_RENT_SHARE_MAX` x monthly-equivalent quote, insert nothing, alert admin, and return `blockedReason`. No transfers happen here.

- [ ] **Step 1:** Failing unit tests: two placements at £10 and £8 on a monthly £150 programme accrue 1000p and 800p; the same invoice replayed accrues nothing more (unique constraint); a quarterly invoice accrues 3x; an over-70% pool accrues nothing and alerts; zero linked placements returns `{accrued: 0}` cleanly.
- [ ] **Step 2:** Migration, module, and the webhook wiring (call it from the programme `invoice.paid` branch, after the status reconcile, inside its own try/catch so an accrual failure never breaks billing).
- [ ] **Step 3:** GREEN, typecheck, commit `feat(programmes): rent accrues to placed artists on every paid invoice`.

---

### Task 7: Quarterly rent settlement

**Files:**
- Create: `src/app/api/cron/programme-rent-settlement/route.ts`
- Modify: `vercel.json` (register the cron), `src/lib/curation/programme-rent.ts` (add the settlement function), `src/lib/finance/reconcile.ts` if the synthetic prefix needs handling
- Test: `src/lib/curation/programme-rent.test.ts` (settlement cases), `src/lib/finance/reconcile.test.ts` if touched

**Interface:**
- `settleProgrammeRent(db, { asOf }): Promise<{ artistsPaid: number; blocked: number; totalPence: number }>`

**Behaviour:** select unsettled accruals (`settled_at is null`), group by `artist_user_id`, sum. For each artist: `canReceivePayout(db, { kind: "artist", userId })`; if capable, `scheduleTransfer` with `orderId = \`programme-settlement:${quarterKey}:${artistUserId}\`` (quarterKey like `2026Q3`, derived from `asOf`, never from `Date.now()` inside the module: pass it in), `immediate: false`; on success stamp `settled_transfer_order_id` and `settled_at` on that artist's rows. If not capable, `recordBlockedLeg` and leave the rows unsettled so the next run retries. Per-artist try/catch: one artist's failure never stops the others.

- [ ] **Step 1: Read `src/lib/placements/paid-loan-billing.ts`** (closest sibling, uses the `placement:` synthetic prefix) **and `src/lib/finance/reconcile.ts`.** Establish how `placement:`-prefixed transfers avoid flagging drift, since they have no `orders` row. Extend the same treatment to the `programme-settlement:` prefix. **If paid-loan transfers are not in fact exempted and would drift, stop and report NEEDS_CONTEXT**: that means the reconcile contract needs an owner decision, not a workaround.
- [ ] **Step 2: Failing tests:** two artists with accruals across two invoices each get one transfer per artist for the correct sum; a rerun with everything settled schedules nothing; an artist failing capability gets a blocked leg and stays unsettled while the other artist is paid; a thrown transfer for one artist does not prevent the other's; the synthetic order id is stable for the quarter so a rerun is idempotent.
- [ ] **Step 3:** Implement the module function, the cron route (following an existing route in `src/app/api/cron/` for its auth/secret pattern), and the `vercel.json` entry: quarterly is not expressible in Vercel cron, so run it **monthly on the 1st at 09:00 UTC** and have the function settle only accruals older than the current quarter boundary, or settle everything unsettled if the owner prefers simplicity. Pick one, implement it, and state which in the report.
- [ ] **Step 4:** Extend reconcile tests so `programme-settlement:` transfers do not flag drift.
- [ ] **Step 5:** GREEN across curation, cron and finance suites, typecheck, commit `feat(programmes): quarterly rent settlement cron`.

---

### Task 8: One-off curation fee credits toward a programme

**Files:**
- Modify: the admin quote route (Task 4), `src/lib/curation/programme-rent.ts` is untouched here
- Modify: `src/app/(pages)/curated/CuratedClient.tsx` FAQ copy
- Test: admin quote route tests

Lowest value of the set, so it is last and is safe to defer. It closes the funnel leak where someone pays £49 for a shortlist and reverts to a free customer.

**Behaviour:** when quoting a programme, if the same requester (match on email, or on `curation_requests.user_id` when present) has a **paid** one-off curation request created within the last 60 days whose fee has not already been credited, apply that amount as a Stripe **customer balance credit** on the programme's customer, so the first invoice draws it down automatically. Record the crediting on the source row (add `credited_to_request_id uuid` in the Task 2 migration if you can foresee it; otherwise a small follow-up migration here).

- [ ] **Step 1:** Failing tests: a £49 paid request 10 days old credits 4900 to the customer balance and marks the source row credited; a request 90 days old credits nothing; an already-credited row credits nothing; two eligible rows credit only the most recent.
- [ ] **Step 2:** Implement with `stripe.customers.createBalanceTransaction` (negative amount is a credit; verify the sign against the Stripe docs before writing the test's expectation).
- [ ] **Step 3:** Add the FAQ line to the Curated page: `If you start a programme within 60 days, your curation fee comes off your first invoice.`
- [ ] **Step 4:** GREEN, typecheck, commit `feat(programmes): curation fees credit toward a programme`.

---

### Task 9: Programme revenue is visible in the finance surface

**Files:**
- Modify: `src/lib/finance/revenue.ts`, the admin financials page that consumes it (grep for `planPricesPence` and the MRR consumer)
- Test: `src/lib/finance/revenue.test.ts` (create if absent; note the pricing initiative left `planPricesPence` untested)

Today MRR is computed from artist subscriptions only, so programme revenue would be invisible in the one place the business is measured. The entire strategic bet is that programme revenue outgrows subscription revenue, and you cannot see that happen without this.

**Interface:**
- `programmeMrrPence(db): Promise<number>` computing the monthly-equivalent sum of active programme subscriptions (`curation_requests` where tier is `programme` and status is `in_progress` or `paid`), dividing quarterly-billed rows by 3.
- The existing MRR function gains a sibling so the admin surface can show **artist MRR, programme MRR and total** as three figures, never one blended number that hides the mix.

- [ ] **Step 1:** Read `src/lib/finance/revenue.ts` and its admin consumer. Write failing tests: two monthly programmes at £150 and £250 plus one quarterly at £600 sum to 55000 pence monthly-equivalent (15000 + 25000 + 20000); cancelled and `awaiting_quote` rows are excluded; no programmes returns 0.
- [ ] **Step 2:** Implement, keeping the artist MRR function untouched (per the data invariant, one exported function per aggregate, no mirror columns).
- [ ] **Step 3:** Surface all three figures on the admin financials page, following its existing card style.
- [ ] **Step 4:** GREEN, typecheck, commit `feat(programmes): programme MRR alongside artist MRR in the finance surface`.

---

### Task 10: The artist-facing story

**Files:**
- Modify: `src/app/(pages)/pricing/page.tsx` (artist pricing), `src/components/ArtistPricingCards.tsx` (Pro's Curated-priority line), the artist portal dashboard or placements page (where a programme placement's rent should be visible), `src/app/(pages)/faqs/page.tsx`
- Test: whichever suites cover those surfaces; the no-literal-prices guard does not apply to these files, but derive from `PROGRAMME_PIECE_RENT_TARGET_GBP` anyway rather than hardcoding

Nobody currently learns the fact that makes artists want this. A piece at the target rent earns £120 a year, which is exactly the price of a Core membership.

**Copy contract** (British English, no dashes, derive the numbers):
- Artist pricing page gains a short section: programme placements pay rent, roughly £10 per piece per month, so one programme piece covers a Core membership for the year. State plainly that programme placements are not guaranteed and depend on venue demand, because the pricing page already promises no guaranteed placement and this must not contradict it.
- Pro's feature line sharpens from "Priority inclusion in Wallplace Curated shortlists" to name the consequence: priority for programme placements, which pay monthly rent.
- Artist portal: where a placement is part of a programme, show its monthly rent and that it settles quarterly. Read how placements already render arrangement terms and follow it.
- FAQ: one question on how programme rent works and when it is paid.

- [ ] **Step 1:** Write the copy changes, deriving figures from the Task 1 constants.
- [ ] **Step 2:** Verify no contradiction with the existing "placement is not guaranteed" and payout-timing FAQ answers; adjust wording rather than the existing promises if they collide.
- [ ] **Step 3:** `npx tsc --noEmit`, run affected suites, dev-server check of `/pricing` and the artist portal, commit `feat(programmes): tell artists that programme placements pay rent`.

---

### Task 11: Full gate, render pass, and the sales runbook

- [ ] **Step 1:** `npm run check` (generous timeout). Fix stragglers in the spirit of this plan. Commit if anything changed.
- [ ] **Step 2:** Dev-server pass: `/workplaces`, `/curated` (Programmes card, prices derived, no managed tiers anywhere), one artwork page (feeder line), and the admin curation list showing a programme request end to end against seed data if seeds allow.
- [ ] **Step 3:** Confirm `grep -rn "managed_monthly\|managed_quarterly\|STRIPE_PRICE_CURATION" src/ docs/ vercel.json` returns nothing but historical comments.
- [ ] **Step 4 (no code, for the owner):** a one-page PDF of the offer; ten warm targets from your own network and your café landlords' contacts; pilot at the £150 rung for the first three sites, quoted normally afterwards. Programmes need **no new Stripe configuration** beyond the live keys already on the runbook, because quoted sessions build their own prices. Close three pilots before building anything not in this plan.

## Self-review notes

- Coverage: the ladder and its guardrails (T1), intake (T2), demand (T3), quoting and billing (T4), lifecycle (T5), accrual (T6), settlement (T7), funnel repair (T8), verification and sales (T9).
- The riskiest integration is T7's reconcile interaction; its Step 1 gates on discovering the existing `placement:` exemption rather than assuming it, with an explicit NEEDS_CONTEXT escape.
- T6 and T7 are split deliberately: accrual is a fact recorded at invoice time, settlement is a batched payment, and separating them is what makes quarterly settlement possible without holding money in a mirror column.
- Name consistency: `CURATION_TIERS.programme`, `PROGRAMME_LADDER`, `PROGRAMME_PIECE_RENT_MIN_GBP`, `PROGRAMME_PIECE_RENT_TARGET_GBP`, `PROGRAMME_RENT_SHARE_MAX`, `accrueProgrammeRent`, `settleProgrammeRent` are used identically wherever referenced.
- No task weakens the placement cap gates or the venue free-display promises shipped in the pricing initiative.
