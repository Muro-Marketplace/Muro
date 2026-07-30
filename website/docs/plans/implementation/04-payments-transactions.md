# 04. Payments and Transactions: make every route provably correct

Status: implementation plan, ready to execute.
Scope: the ten transaction routes T1..T10. Nothing else.
Mandate: every buy-now, placement, monthly loan, paid loan, offer and curation
purchase works perfectly. No bugs in the transactional workflows.

Everything below was verified by reading the code in this worktree. Anything I
could not verify from source is marked **UNCONFIRMED** and must be checked
before the corresponding task is closed.

Environment facts that shape the plan:

| Fact | Value | Source |
| --- | --- | --- |
| Stripe SDK | `^22.0.1`, no pinned `apiVersion` | `website/package.json`, `website/src/lib/stripe.ts:3-5` |
| Next | `16.2.1` | `website/package.json` |
| Test runner | Vitest 2, node env, co-located `*.test.ts` | `website/vitest.config.ts` |
| Webhook | one route, 18 `event.type ===` branches, **no event-id dedup table** | `website/src/app/api/webhooks/stripe/route.ts` |
| Payout ledger | `stripe_transfers`, UNIQUE `(order_id, recipient_user_id)` | `website/supabase/migrations/004_pre_launch_features.sql:35`, `067_stripe_transfers_paid_loan_idempotency.sql:21` |
| Latest migration | `073_restrict_artist_applications_update.sql` | `website/supabase/migrations/` |

New migrations in this plan start at **074**.

---

## Verdict summary

| Route | Verdict | Headline |
| --- | --- | --- |
| T1 Buy Now, single artist | **At risk** | Happy path is right; silent artist-payout loss when the profile lookup fails; order-id collision is misread as a duplicate |
| T2 Buy Now, multi-artist cart | **Broken** | Whole artist remainder paid to the first artist; first artist's fee tier applied to everyone (E9) |
| T3 Offer → accept → pay | **Broken** | Collects money, never pays the artist, never decrements stock, sends no email (E6, E10) |
| T4 Placement request → accept → install | **At risk** | No money moves at accept (correct), but billing is never cancelled on `completed`/`sold`, and the revenue share is unbounded and non-deterministic |
| T5 Revenue-share QR sale | **At risk** | `venueSlug` is client-asserted with no binding to the scan; non-`active` placements silently pay the venue £0 |
| T6 Paid loan monthly | **Broken** | Two rival implementations, neither finishes; no webhook branch; subscriptions uncancellable; flag off in prod (E7, E8, E11) |
| T7 Artist subscription | **At risk** | Unknown price id silently downgrades an artist to `core` and triples their fee; early `return` short-circuits every later handler |
| T8 Refunds | **At risk** | Claim/release is genuinely good; partial-reversal maths uses the wrong denominator; no restock; no curation refund path |
| T9 Collect from venue | **Never built** | CTA has no venue linkage at all; cart carries no venue-collection intent (N1, N2) |
| T10 Curation £49 | **Broken** | First audit. Both managed tiers are unsellable: the `tier` CHECK rejects them (D25). Plus an orphan-payment race, a subscription id in the payment-intent column, and managed subs that never reconcile |

---

# (A) Money-flow map, per route

Money always enters on the **platform** Stripe account. Payouts to artists and
venues are **separate transfers** (`stripe.transfers.create`) drawn from the
platform balance, scheduled through `stripe_transfers` and executed by
`processPendingTransfers` (cron) or `executeTransfer` (on delivery). The one
exception is T6, which was scaffolded as a **destination charge**
(`transfer_data` + `application_fee_percent`). That inconsistency is itself a
defect, covered in B6.

Worked amounts below are the numbers the tests in (D) assert to the penny.

### T1: Buy Now, single artist (shipped)

Example: one £180.00 work, artist on Core (15%), no venue placement, UK
shipping £14.50.

| Step | Detail |
| --- | --- |
| Payer | Buyer (guest or logged in), card |
| Stripe object | `checkout.sessions.create({ mode: "payment" })`, `api/checkout/route.ts:360-374`. Shipping is a separate line item, `:326-336` |
| Amount | `amount_total` = 19450 pence |
| Fee | `platformFeePercentForArtist` on the **first** artist slug, `webhooks/stripe/route.ts:202-208`. 15% of subtotal = £27.00 |
| Venue cut | £0 (no placement) |
| Artist net | `subtotal - venueRevenue - platformFee + shippingCost` = 180 − 0 − 27 + 14.50 = **£131.50**, `:267` |
| Transfers | 1 leg, `scheduleTransfer({ recipientType: "artist", amountCents: 13150, immediate: false })`, `:683-690`. `payout_after = now + 14d` |
| DB rows | `cart_sessions` (pre-checkout), `orders` (id `WS-<last8 of session id>`), `order_events` (`order.placed`), `stripe_transfers` × 1, `artist_works.quantity_available` decremented |
| Emails | Buyer `customer_order_receipt`; artist `artist_work_sold` + `artist_order_confirmation`; plus dispatcher `order_placed` / `artist_order_received` via `recordOrderEvent`. Bell: artist `sale` |
| Later | On `PATCH /api/orders` status `delivered`: `executeTransfer` fires early, `orders/route.ts:283-290`; `payout.paid` → `artist_payout_sent` email + bell |

Collection variant (`fulfilmentMethod === "collection"`): status jumps straight
to `delivered`, `delivered_at` is stamped, and both legs are `immediate: true`
so `executeTransfer` runs inline, `webhooks/stripe/route.ts:277-281, 660-691`.

### T2: Buy Now, multi-artist cart

Example: Artist A (Pro, 5%) £300; Artist B (Core, 15%) £120; venue placement at
20% covering both; shipping £14.50 (A's group) + £5.50 (B's group) = £20.00.
Total £440.00.

| Step | Correct behaviour | What ships today |
| --- | --- | --- |
| Venue cut | 20% of £420 = **£84.00** | £84.00 (per-line, already correct, `:247-253`) |
| Platform fee | A: £300×5% = £15.00; B: £120×15% = £18.00; total **£33.00** | £420 × 5% = **£21.00** (A's tier applied to B) |
| Artist A net | 300 − 60 − 15 + 14.50 = **£239.50** | £419.00 (the whole pooled remainder) |
| Artist B net | 120 − 24 − 18 + 5.50 = **£83.50** | **£0.00** |
| Transfers | 3 legs: venue £84.00, A £239.50, B £83.50 | 2 legs: venue £84.00, A £419.00 |

Ledger invariant the tests enforce: `venue + Σartists + platformFee ==
amount_total`, exactly, in pence.

### T3: Offer → accept → pay

Example: venue offers £2,400.00 on a work, artist accepts, artist on Core (15%).

| Step | Detail |
| --- | --- |
| Payer | Buyer on the offer (always a venue today; `purchase_offers.buyer_type IN ('customer','venue')`) |
| Stripe object | `checkout.sessions.create({ mode: "payment" })`, one collapsed line, `offers/[id]/checkout/route.ts:52-83`. **No** `transfer_data`, **no** `application_fee_data` |
| Fee | Should be 15% = £360.00. **Today: 100% retained** |
| Artist net | Should be **£2,040.00**. **Today: £0.00** |
| Transfers | Should be 1 artist leg. **Today: none. No `stripe_transfers` row exists** |
| DB rows | `purchase_offers.status = 'paid'`, `orders` row id `OFR-<last8>`, `webhooks/stripe/route.ts:122-156`. **No** stock decrement, **no** `order_events`, **no** revenue columns |
| Emails | **None.** The handler returns at `:158` before any email code |

### T4: Placement request → accept → install (free / revenue share)

| Step | Detail |
| --- | --- |
| Payer | Nobody. No money moves at accept for `free_loan` / revenue-share |
| Stripe object | None (unless `arrangement_type` is `paid_loan` / `mixed`, which routes to T6) |
| DB rows | `placements` insert `status='pending'`, `api/placements/route.ts:481-485`; PATCH to `active` at `:1245`; stage stepper `accepted → scheduled → installed → live → collected`; `artist_works.placed_at_venue` + `current_placement_id` stamped at `:1340`, cleared at `:1398, :1413` |
| Money effect | Sets `placements.revenue_share_percent`, which is the rate T5 later reads |
| Emails | `notifyPlacementRequest`, `notifyPlacementResponse` (`lib/email.ts:172, 212`) |
| On delivery of a later sale | `increment_placement_revenue` RPC attributes the venue cut back to the placement, `api/orders/route.ts:298-303` |

### T5: Revenue-share QR sale

Attribution chain (verified end to end):

`GET /api/qr/[slug]` (`:95-104`) redirects with `?ref=qr&venue=<slug>&venueName=<name>`
→ `ArtistProfileClient.tsx:317-332` calls `saveQrContext(...)`
→ `lib/qr-context.ts` localStorage key `wallplace:qr-context`, 24h TTL
→ `checkout/page.tsx:407-408` reads it into the POST body
→ `api/checkout/route.ts:43-44` → `cart_sessions.venue_slug` + Stripe metadata
→ `webhooks/stripe/route.ts:186-187` reads it back
→ `:220-231` looks up `placements` where `artist_slug IN (...) AND venue_slug = ? AND status = 'active'`
→ `:247-253` per-line venue cut
→ `:652-668` venue transfer, gated on `stripe_connect_account_id AND stripe_connect_onboarding_complete`
→ `checkout/confirmation/page.tsx:85` clears the context.

Money split is the same shape as T1/T2, with `venueRevenue > 0`. Emails:
`notifyVenueOrderFromPlacement` plus a venue `sale` bell, `:628-643`.

### T6: Paid loan monthly

There are **two** independent implementations and they do not know about each
other.

Path 1, `lib/placements/paid-loan-billing.ts` (flag-gated `PAID_LOAN_V2`):
`stripe.subscriptions.create` directly on the venue's customer, no
`transfer_data`; the artist is paid by a **separate transfer** scheduled in
`handleInvoicePaid` (`:450-457`) with `order_id = "placement:<id>:<invoiceId>"`.
Writes `placement_recurring_billings`.

Path 2, `api/placements/[id]/payment/setup/route.ts`: a Checkout session in
subscription mode with `application_fee_percent` + `transfer_data.destination`,
i.e. a **destination charge**. Writes nothing.

Intended money flow, £120.00/month, artist on Premium (8%):

| Step | Detail |
| --- | --- |
| Payer | Venue, card on file |
| Stripe object | One recurring subscription per placement |
| Fee | 8% = £9.60/month to the platform |
| Artist net | **£110.40/month** |
| Transfers | Path 1: one `stripe_transfers` leg per paid invoice, `payout_after = now + 14d`. Path 2: Stripe splits automatically at charge time |
| DB rows | `placement_recurring_billings` (subscription id, period bounds, status) **and** `placements.stripe_subscription_id` (currently written by nothing) |
| Emails | None today for the paid-loan lifecycle |

### T7: Artist subscription (platform SaaS)

| Step | Detail |
| --- | --- |
| Payer | Artist |
| Stripe object | `checkout.sessions.create({ mode: "subscription", customer })`, `api/subscribe/route.ts:83-95`. Trial 180d (founding) / 30d (new) / 0 (returning), `:79` |
| Fee | n/a, this is platform revenue. It *sets* the sale fee tier via `artist_profiles.subscription_plan` → `PLAN_FEE_PERCENT` (core 15 / premium 8 / pro 5) |
| Transfers | None |
| DB rows | `artist_profiles.{stripe_subscription_id, subscription_status, subscription_plan, subscription_period_end, trial_end}`, `webhooks/stripe/route.ts:716-725`; referral credit extends the referrer's `free_until` by 30d, `:783-816` |
| Emails | `subscription_upgraded`, `subscription_trial_ending`, `subscription_cancelled`, `subscription_payment_failed`, `subscription_renewal_receipt` |

### T8: Refunds

| Step | Detail |
| --- | --- |
| Trigger | `POST /api/refunds/request` (Bearer or signed order token) → `POST /api/refunds/process` (artist or admin) |
| Claim | `claimPending` flips `pending → processing` atomically, `lib/api/idempotency.ts:31-48`. This is correct and should be the model elsewhere |
| Order 1 | Reverse or cancel every `stripe_transfers` leg **first**; abort 502 if any reversal fails, `refunds/process/route.ts:170-213`. Correct ordering |
| Order 2 | `stripe.refunds.create({ payment_intent })` with `idempotencyKey: refund:<id>:refund`, `:226-229` |
| DB rows | `refund_requests.status='approved'` + `stripe_refund_id`; `orders.status = refunded | partially_refunded` + `status_history`; `order_events` (full refunds only) |
| Emails | Buyer `customer_refund_confirmation` + bell; artist `artist_refund_notification` + bell |

### T9: Collect from venue

**Not implemented.** What exists:

- `browse/[slug]/[workSlug]/ArtworkPageClient.tsx:595-637` renders a
  `Collect from venue, £X` CTA driven purely by `pricing[i].inStorePrice`.
- `work.placed_at_venue` is a **denormalised display string** rendered as a chip
  at `:222-230` and used nowhere else.
- The cart line added at `:613-627` carries **no** fulfilment field and **no**
  venue field. The intent survives only as the English substring `"(Collect, …)"`
  inside `title`, plus `shippingPrice: 0`.
- `checkout/page.tsx:73` hard-defaults to `"ship"`; the only collection mode is
  `"Collect from artist"` (`:606`), gated on `artist_profiles.offers_pickup`,
  and `:205-208` silently forces `"ship"` back when that flag is off.
- `orders.collection_address TEXT` already exists
  (`migrations/042_orders_fulfilment_method.sql:8`) and is written by nothing
  and read by nothing.

Money flow when built: identical to T1 collection variant (immediate payout, no
shipping line), plus a venue handover record.

### T10: Curation (£49 and friends), first audit

| Tier | Price | Stripe | Terminal status |
| --- | --- | --- | --- |
| `single_wall` | £49 | `mode: "payment"`, ad-hoc `price_data` | `paid` |
| `full_space` | £149 | `mode: "payment"` | `paid` |
| `bespoke` | £299 | none, quote first | `awaiting_quote` |
| `managed_monthly` | £79.99 | `mode: "subscription"`, `STRIPE_PRICE_CURATION_MONTHLY` | `in_progress`, **unreachable, see D25** |
| `managed_quarterly` | £199.99 | `mode: "subscription"`, `STRIPE_PRICE_CURATION_QUARTERLY` | `in_progress`, **unreachable, see D25** |

Server prices (`api/curation/route.ts:14-20`) match the marketing tier table
(`lib/curated-tiers.ts:46, 104, 164, 219, 269`). Good.

| Step | Detail |
| --- | --- |
| Payer | Venue contact (anonymous submission allowed, `:76-83`) |
| Fee / split | **100% platform revenue.** No Connect, no transfer, no ledger row. This is correct by design: Wallplace performs the service |
| DB rows | `curation_requests` insert `status='pending_payment'` (`:115`) then webhook flips to `paid` / `in_progress` (`:79-89`) |
| Emails | `notifyAdminCurationRequest` at submit time; `notifyCurationCustomerPaid` after payment (`:102-108`); `notifyCurationCustomerEnquiry` for bespoke |
| VAT | None anywhere in the codebase. No `automatic_tax`, no `tax_behavior`. Order emails render a VAT row (`emails/_components/OrderSummary.tsx:74`) that is never populated. **UNCONFIRMED** whether Wallplace is VAT-registered; out of scope for this plan but must be raised |

---

# (B) Per-route defects and exact fixes

Defect ids: `E*` are pre-confirmed by the owner. `N*` are new features.
`D*` are new defects found during this pass.

## B0: Cross-cutting (hits T1, T2, T3, T10)

### D1. No webhook event dedup, and `checkout.session.completed` is trusted without checking `payment_status`

`webhooks/stripe/route.ts` has no `event.id` table. Idempotency is
per-branch and ad hoc: the cart branch dedupes on `stripe_payment_intent_id`
(`:329-339`), the offer branch and the curation branch dedupe on nothing but a
status read.

Separately, **no branch checks `session.payment_status`**. The only
`payment_status` read in the whole repo is
`api/checkout/session/route.ts:25`, for display. `checkout.session.completed`
fires for delayed-notification methods before funds settle.

Fix, at the top of the handler after `constructEvent`:

```ts
// Global replay guard. Every branch below writes money-shaped rows;
// a Stripe redelivery must be a no-op, not a second order.
const { error: seenErr } = await db
  .from("stripe_webhook_events")
  .insert({ event_id: event.id, event_type: event.type });
if (seenErr) {
  if ((seenErr as { code?: string }).code === "23505") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  // A real DB failure must 500 so Stripe retries rather than us
  // silently processing an event we could not record.
  console.error("[webhook] dedup insert failed", seenErr);
  return NextResponse.json({ error: "Dedup unavailable" }, { status: 500 });
}
```

and a shared guard used by all three `checkout.session.completed` branches:

```ts
/** Only `paid` sessions move money. `unpaid` and `no_payment_required`
 *  must not create orders. Stripe re-fires the event as
 *  `checkout.session.async_payment_succeeded` when funds land. */
function isSettled(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid";
}
```

Migration `074_stripe_webhook_events.sql`:

```sql
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id   TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- Service role only; no policies.
CREATE INDEX IF NOT EXISTS stripe_webhook_events_created_idx
  ON stripe_webhook_events(created_at);
NOTIFY pgrst, 'reload schema';
```

Also add the settled-later branches, which today fall on the floor:

```ts
if (
  event.type === "checkout.session.async_payment_succeeded" ||
  event.type === "checkout.session.completed"
) { /* shared handler */ }

if (event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired") {
  // Release any inventory hold, mark the offer / curation row back to
  // its pre-payment status.
}
```

### D2. `POST /api/orders` is unauthenticated order forgery

`api/orders/route.ts:329-357`. No `getAuthenticatedUser`, no admin check, no
Stripe cross-check. Anyone can `POST { id, items, shipping, subtotal, total,
buyerEmail }` and insert a `confirmed` order.

Two consequences. First, forged orders. Second, and worse, **order-id
squatting**: pre-inserting `WS-<8 chars>` makes the genuine webhook hit `23505`
at `webhooks/stripe/route.ts:352-355`, which returns `{ received: true,
duplicate: true }`. Stripe stops retrying, the real order is never written, and
the buyer's money is taken with no record.

Fix: delete the route. Nothing in the app calls it. Verified: the nine callers
of `/api/orders` are all `GET` (`artist-portal/orders/page.tsx:68`,
`artist-portal/analytics/page.tsx:94`, `customer-portal/page.tsx:87`,
`venue-portal/orders/page.tsx:59`, `venue-portal/enquiries/page.tsx:41`, plus
three test doubles) or `PATCH` (`artist-portal/orders/page.tsx:84`). If a
manual-entry path is wanted later it must be admin-gated and must not accept a
caller-supplied `id`.

```ts
// api/orders/route.ts, remove the POST export entirely.
// Orders are created only by the Stripe webhook (service role).
```

### D3. Order id derived from 8 characters of the session id

`WS-${session.id.slice(-8)}` (`:185`) and `OFR-${session.id.slice(-8)}`
(`:122`). Even with D2 fixed, a genuine collision is silently misreported as a
duplicate. The `23505` branch must verify it is the *same* payment before
declaring victory.

Fix at `:349-355`:

```ts
if ((error as { code?: string }).code === "23505") {
  // Same payment intent => genuine redelivery. Different payment
  // intent => an id collision; we must NOT drop this order.
  const { data: clash } = await db
    .from("orders")
    .select("id, stripe_payment_intent_id")
    .eq("id", orderId)
    .maybeSingle();
  if (clash && clash.stripe_payment_intent_id === paymentIntentId) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  console.error("[webhook] order id collision", { orderId, paymentIntentId });
  return NextResponse.json({ error: "Order id collision" }, { status: 500 });
}
```

and widen the id to the full session suffix so a collision is
cryptographically implausible:

```ts
// cs_live_a1B2c3..., the part after the last underscore is 24+ chars
// of Stripe-generated entropy. Take 16.
const sessionEntropy = session.id.split("_").pop() || session.id;
const orderId = `WS-${sessionEntropy.slice(-16).toUpperCase()}`;
```

**UNCONFIRMED**: whether any existing UI or email hardcodes an 11-character
`WS-xxxxxxxx` shape. Grep `WS-` before landing; `orders.id` is `TEXT` so the
column tolerates it.

## B1: T1 Buy Now, single artist

### D4. `.single()` on the artist profile silently zeroes the payout

`webhooks/stripe/route.ts:202-208`:

```ts
if (firstArtistSlug) {
  const { data: ap } = await db.from("artist_profiles").select("user_id, subscription_plan, free_until").eq("slug", firstArtistSlug).single();
  if (ap) {
    artistUserId = ap.user_id;
    platformFeePct = platformFeePercentForArtist(ap);
  }
}
```

The `error` is discarded. `.single()` errors on 0 rows **and on more than 1
row**. When it errors, `ap` is null, so: `artistUserId` stays `null`, which
makes `:675` (`if (artistUserId && artistRevenue > 0)`) false, so **no artist
transfer is ever scheduled**; the artist receives no email and no bell; and the
fee silently defaults to 15% (`:195`). The order still saves and the buyer is
still charged. Money in, nobody paid, no ledger row, no alert.

Fix:

```ts
if (firstArtistSlug) {
  const { data: ap, error: apErr } = await db
    .from("artist_profiles")
    .select("user_id, subscription_plan, free_until")
    .eq("slug", firstArtistSlug)
    .maybeSingle();
  if (apErr) {
    // Non-negotiable: we will not book an order we cannot attribute.
    // 500 makes Stripe retry; the alternative is a silent unpaid artist.
    console.error("[webhook] artist profile lookup failed", { firstArtistSlug, apErr });
    return NextResponse.json({ error: "Artist lookup failed" }, { status: 500 });
  }
  if (!ap) {
    console.error("[webhook] no artist_profiles row for slug", firstArtistSlug);
    return NextResponse.json({ error: "Unknown artist" }, { status: 500 });
  }
  artistUserId = ap.user_id;
  platformFeePct = platformFeePercentForArtist(ap);
}
```

### D5. Stock decrement is read-then-write and best-effort

`:443-464` reads `quantity_available`, computes `next = max(0, current - qty)`,
writes it back, all inside a `try` that swallows. Two concurrent orders both
read 1 and both write 0, so two buyers get the same single piece. The `catch`
at `:462` means a total failure is a `console.warn`.

Fix: an atomic RPC, and treat failure as fatal for the order.

Migration `075_decrement_work_stock.sql`:

```sql
CREATE OR REPLACE FUNCTION public.decrement_work_stock(
  p_work_id TEXT,
  p_qty     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  UPDATE artist_works
     SET quantity_available = GREATEST(0, COALESCE(quantity_available, 0) - p_qty),
         available = CASE
           WHEN GREATEST(0, COALESCE(quantity_available, 0) - p_qty) = 0 THEN false
           ELSE available
         END
   WHERE id = p_work_id
   RETURNING quantity_available INTO v_remaining;
  RETURN v_remaining;   -- NULL when the work id does not exist
END;
$$;
NOTIFY pgrst, 'reload schema';
```

Call site replacing `:443-464`:

```ts
for (const item of cartItems as CartItem[]) {
  const workId = item.workId || item.id;
  const qty = Number(item.qty ?? item.quantity ?? 1);
  if (!workId || !Number.isFinite(qty) || qty <= 0) continue;
  const { error: stockErr } = await db.rpc("decrement_work_stock", {
    p_work_id: workId,
    p_qty: qty,
  });
  if (stockErr) {
    // Double-sell is worse than a Stripe retry. Fail loudly.
    console.error("[webhook] stock decrement failed", { workId, qty, stockErr });
    return NextResponse.json({ error: "Stock update failed" }, { status: 500 });
  }
}
```

Note this makes the branch order matter: the order row is already inserted, so
the retry path relies on D1's event dedup plus the D3 payment-intent check to
stay idempotent. Both are prerequisites.

### D6. The strip-and-retry insert loop can drop the money columns

`:341-407` retries the insert with columns removed whenever the error message
mentions them. The `optionalCols` list includes `venue_revenue`,
`artist_revenue`, `platform_fee` and `stripe_payment_intent_id`. If the schema
drifts, the order saves with the split silently missing, and the code then
proceeds to schedule transfers from in-memory values that were never persisted.
Reconciliation becomes impossible.

Fix: split the list. Attribution columns may be stripped; **money columns and
`stripe_payment_intent_id` may not.**

```ts
const strippableCols = [
  "source", "artist_slug", "artist_user_id", "venue_slug",
  "placement_id", "fulfilment_method", "collection_notes",
  "delivered_at", "status_history",
];
// Never stripped. If the DB does not know these, we have a schema
// emergency and must not book the order.
const REQUIRED_MONEY_COLS = [
  "venue_revenue_share_percent", "venue_revenue", "artist_revenue",
  "platform_fee_percent", "platform_fee", "stripe_payment_intent_id",
] as const;
```

and before the loop:

```ts
if (REQUIRED_MONEY_COLS.some((c) => new RegExp(`\\b${c}\\b`).test(String(error.message).toLowerCase()))) {
  console.error("[webhook] schema is missing a money column, refusing to book", error);
  return NextResponse.json({ error: "Schema drift on money columns" }, { status: 500 });
}
```

## B2: T2 Buy Now, multi-artist cart (E9)

### E9. Pooled remainder to the first artist, and one fee tier for everyone

Three lines are wrong:

- `:202-208` resolves the fee tier from `firstArtistSlug` only.
- `:266-267` computes one `platformFee` and one pooled `artistRevenue`.
- `:675-695` schedules exactly one artist transfer, to `artistUserId`.

Fix: compute per-artist legs. See C2 for `buildArtistLegs`. The webhook
becomes:

```ts
// Replace :202-208, :266-267 and :675-695.
const legs = await buildArtistLegs(db, {
  cartItems,
  placementByArtistSlug,
  artistShippingBySlug,   // from calculateOrderShipping, see below
});

// Blended figures still persisted on the order for display / reporting.
const platformFee = round2(legs.reduce((s, l) => s + l.platformFeeGbp, 0));
const artistRevenue = round2(legs.reduce((s, l) => s + l.netGbp, 0));
const platformFeePct = subtotal > 0 ? round2((platformFee / subtotal) * 100) : 0;
```

and, after the order row is committed:

```ts
for (const leg of legs) {
  const cap = await canReceivePayout(db, { kind: "artist", userId: leg.artistUserId });
  if (!cap.ok) {
    // Money stays on the platform balance and the leg is recorded as
    // blocked so ops can see exactly what is owed and to whom.
    await recordBlockedLeg(db, { orderId, leg, reason: cap.reason });
    continue;
  }
  await scheduleTransfer({
    orderId,
    recipientType: "artist",
    recipientUserId: leg.artistUserId,
    connectAccountId: cap.accountId!,
    amountCents: Math.round(leg.netGbp * 100),
    immediate: isCollection,
  });
}
```

The existing UNIQUE `(order_id, recipient_user_id)` index means the loop is
naturally idempotent and, crucially, **legs must be aggregated per artist, not
per cart line**. Two lines from the same artist produce one leg.

Shipping allocation: `calculateOrderShipping` already returns
`artistGroups[].shipping` (`lib/shipping-checkout.ts:105-113`). That per-artist
figure must be carried into `cart_sessions` so the webhook can attribute
shipping to the right artist instead of pooling it. Add to
`saveCartSession` (`api/checkout/route.ts:379-388`):

```ts
artistShippingPence: Object.fromEntries(
  artistGroups.map((g) => [g.artistSlug, Math.round(g.shipping * 100)]),
),
```

Migration `076_cart_sessions_artist_shipping.sql`:

```sql
ALTER TABLE cart_sessions
  ADD COLUMN IF NOT EXISTS artist_shipping_pence JSONB NOT NULL DEFAULT '{}'::jsonb;
NOTIFY pgrst, 'reload schema';
```

Penny reconciliation: after building the legs, assert and correct.

```ts
const totalPence = Math.round(total * 100);
const sumPence = Math.round(venueRevenue * 100)
  + legs.reduce((s, l) => s + Math.round(l.netGbp * 100), 0)
  + Math.round(platformFee * 100);
if (sumPence !== totalPence) {
  // Rounding drift lands on the platform fee, never on a recipient.
  platformFee = round2((totalPence - (sumPence - Math.round(platformFee * 100))) / 100);
}
```

## B3: T3 Offer → accept → pay (E6, E10)

### E6. Money collected, artist never paid, no ledger row

`offers/[id]/checkout/route.ts:52-83` creates a plain platform charge. The
webhook branch (`:117-160`) flips `purchase_offers.status` and inserts a bare
`orders` row with **no** `artist_revenue`, `platform_fee`, `venue_revenue` or
`placement_id`, then `return`s at `:158`, before the payout code at `:646-695`.

Fix, part 1: compute and persist the split at order-insert time.

```ts
// api/offers/[id]/checkout/route.ts, carry everything the webhook needs.
const { data: artistProfile, error: apErr } = await db
  .from("artist_profiles")
  .select("user_id, slug, subscription_plan, free_until, stripe_connect_account_id")
  .eq("user_id", offer.artist_user_id)
  .maybeSingle();
if (apErr || !artistProfile) {
  return NextResponse.json({ error: "Artist profile unavailable" }, { status: 500 });
}

// Pre-flight: refuse to take the money if we cannot pay it out.
const cap = await canReceivePayout(db, { kind: "artist", userId: offer.artist_user_id });
if (!cap.ok) {
  return NextResponse.json(
    { error: "This artist isn't set up to receive payouts yet. Try again shortly.", reason: cap.reason },
    { status: 422 },
  );
}

const feePct = platformFeePercentForArtist(artistProfile);
const platformFeePence = Math.round(offer.amount_pence * (feePct / 100));
const artistNetPence = offer.amount_pence - platformFeePence;
```

added to `metadata`:

```ts
metadata: {
  ...existing,
  offer_platform_fee_pence: String(platformFeePence),
  offer_artist_net_pence: String(artistNetPence),
  offer_platform_fee_percent: String(feePct),
},
```

Fix, part 2: the webhook branch writes a complete order and schedules the
transfer. Replace `:136-158`:

```ts
const feePence = Number(session.metadata.offer_platform_fee_pence || 0);
const netPence = Number(session.metadata.offer_artist_net_pence || 0);
const totalGbp = (session.amount_total || 0) / 100;

const { error: insErr } = await db.from("orders").insert({
  id: paidOrderId,
  stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
  buyer_email: session.customer_email || null,
  items: [{
    offer_id: offerId,
    work_ids: (session.metadata.offer_work_ids || "").split(",").filter(Boolean),
    collection_id: session.metadata.offer_collection_id || null,
  }],
  subtotal: totalGbp,
  shipping_cost: 0,
  total: totalGbp,
  status: "confirmed",
  status_history: [{ status: "confirmed", timestamp: new Date().toISOString() }],
  source: "purchase_offer",
  artist_slug: session.metadata.offer_artist_slug || null,
  artist_user_id: session.metadata.offer_artist_user_id || null,
  venue_revenue: 0,
  venue_revenue_share_percent: 0,
  platform_fee: feePence / 100,
  platform_fee_percent: Number(session.metadata.offer_platform_fee_percent || 0),
  artist_revenue: netPence / 100,
  fulfilment_method: "ship",
  created_at: new Date().toISOString(),
});
if (insErr && (insErr as { code?: string }).code !== "23505") {
  console.error("[offer order insert]", insErr);
  return NextResponse.json({ error: "DB save failed" }, { status: 500 });
}

// E10: decrement stock for every work on the offer.
for (const workId of (session.metadata.offer_work_ids || "").split(",").filter(Boolean)) {
  const { error: stockErr } = await db.rpc("decrement_work_stock", { p_work_id: workId, p_qty: 1 });
  if (stockErr) {
    console.error("[offer] stock decrement failed", { workId, stockErr });
    return NextResponse.json({ error: "Stock update failed" }, { status: 500 });
  }
}

// E6: pay the artist.
const artistUserId = session.metadata.offer_artist_user_id;
if (artistUserId && netPence > 0) {
  const cap = await canReceivePayout(db, { kind: "artist", userId: artistUserId });
  if (cap.ok) {
    await scheduleTransfer({
      orderId: paidOrderId,
      recipientType: "artist",
      recipientUserId: artistUserId,
      connectAccountId: cap.accountId!,
      amountCents: netPence,
      immediate: false,
    });
  } else {
    await recordBlockedLeg(db, {
      orderId: paidOrderId,
      leg: { artistUserId, netGbp: netPence / 100 },
      reason: cap.reason,
    });
  }
}
```

Fix, part 3: emails. The offer branch sends nothing. Reuse the same three
sends as T1 (`customer_order_receipt`, `artist_work_sold`,
`artist_order_confirmation`) plus `recordOrderEvent({ newStatus: "confirmed" })`.
Extract the block at `:414-626` into `sendOrderConfirmations(db, orderRow, ctx)`
in a new `src/lib/orders/confirmations.ts` and call it from both branches. This
also removes the duplication that let the offer branch diverge in the first
place.

### D7. The accepted offer is never invalidated when the work sells elsewhere

`purchase_offers` has no link to stock. An offer accepted on Monday can be paid
on Friday after the work sold through T1 on Wednesday. Fix: re-validate at
checkout-session creation.

```ts
// api/offers/[id]/checkout/route.ts, before creating the session.
if (offer.work_ids.length > 0) {
  const { data: works } = await db
    .from("artist_works")
    .select("id, title, available, quantity_available")
    .in("id", offer.work_ids);
  const gone = (works || []).filter(
    (w) => w.available === false || (typeof w.quantity_available === "number" && w.quantity_available <= 0),
  );
  if (gone.length > 0 || (works || []).length !== offer.work_ids.length) {
    await db.from("purchase_offers").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", offer.id);
    return NextResponse.json(
      { error: "One or more works on this offer have sold. The offer has been closed.", code: "work_sold" },
      { status: 409 },
    );
  }
}
```

## B4: T4 Placement accept / install

### D8. Billing survives `completed` and `sold`

`cancelPaidLoanBilling` is called only from the `active → cancelled` branch,
`api/placements/route.ts:1330`. Setting `stage: "collected"` sets
`status: "completed"` at `:1256`, and `sold` is a valid status too. Both leave
the Stripe subscription live, so the venue keeps paying for a piece that is off
the wall.

Fix at `:1293-1294`:

```ts
const goingCancelled =
  existing.status === "active" &&
  (status === "cancelled" || status === "completed" || status === "sold");
```

### D9. `revenue_share_percent` is unbounded and non-deterministic

`placements.revenue_share_percent NUMERIC` has no CHECK
(`website/supabase-all-migrations.sql:109`), and
`021_drop_placements_unique_active.sql` removed the unique index on
`(artist_slug, venue_slug) WHERE status='active'`. So (a) a counter-offer can
set 150% and the artist's net goes negative, and (b) the webhook's
`placementByArtistSlug` map (`webhooks/stripe/route.ts:226-231`) keeps whichever
duplicate row Postgres returns last.

Fix, migration `077_placement_revenue_share_bounds.sql`:

```sql
-- Clamp any bad historical data first so the constraint can be added.
UPDATE placements SET revenue_share_percent = 100 WHERE revenue_share_percent > 100;
UPDATE placements SET revenue_share_percent = 0   WHERE revenue_share_percent < 0;

ALTER TABLE placements
  ADD CONSTRAINT placements_revenue_share_bounds
  CHECK (revenue_share_percent IS NULL OR (revenue_share_percent >= 0 AND revenue_share_percent <= 100));

-- Restore determinism: at most one active placement per artist+venue+work.
CREATE UNIQUE INDEX IF NOT EXISTS placements_active_uniq
  ON placements(artist_slug, venue_slug, COALESCE(work_title, ''))
  WHERE status = 'active';
NOTIFY pgrst, 'reload schema';
```

**UNCONFIRMED**: whether `work_title` is the right third key, given migration
`027_placement_multi_works.sql` introduced multi-work placements. Verify the
live shape before applying; if a placement can carry several works, key on
`placements.id` in the webhook instead and make the webhook query
`.order("created_at", { ascending: false }).limit(1)` per artist so the choice
is at least deterministic.

Meanwhile, make the webhook deterministic regardless (`:221-225`):

```ts
const { data: rows } = await db.from("placements")
  .select("id, artist_slug, revenue_share_percent, created_at")
  .in("artist_slug", uniqueLineSlugs)
  .eq("venue_slug", venueSlug)
  .eq("status", "active")
  .order("created_at", { ascending: true });   // first-wins, stable across replays
```

and change the map fill at `:226-231` to skip a slug already present.

## B5: T5 Revenue-share QR sale

### D10. `venueSlug` is client-asserted; revenue can be diverted from artist to venue

`api/checkout/route.ts:44` takes `venueSlug` straight from the request body,
capped at 100 chars (`lib/validations.ts:240-241`) and otherwise unvalidated.
A bogus slug is harmless (no placement matches, cut is 0). A **real** slug for a
venue where the artist genuinely holds an active placement is not: it moves
`venueRevenue` out of `artistRevenue` (`:267`) on a sale that never came from
that venue. Any buyer, or any venue operator with a browser console, can do it.

Fix: bind the claim to a server-issued token instead of a raw slug.

`GET /api/qr/[slug]` (`:95-104`) already resolves the venue server-side. Have it
mint a short-lived signed token and put that in the redirect:

```ts
// api/qr/[slug]/route.ts, reuse the HMAC helper pattern from
// src/lib/order-tracking-token.ts.
import { signQrAttribution } from "@/lib/qr-attribution-token";

const attribution = venueSlug
  ? await signQrAttribution({ venueSlug, artistSlug, ttlHours: 24 })
  : null;
// ...
if (attribution) redirectParams.set("va", attribution);
```

New `src/lib/qr-attribution-token.ts`, mirroring `order-tracking-token.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = () => {
  const s = process.env.ORDER_TOKEN_SECRET;
  if (!s) throw new Error("ORDER_TOKEN_SECRET not configured");
  return s;
};

export interface QrAttribution { venueSlug: string; artistSlug: string; exp: number }

export async function signQrAttribution(input: {
  venueSlug: string; artistSlug: string; ttlHours: number;
}): Promise<string> {
  const payload: QrAttribution = {
    venueSlug: input.venueSlug,
    artistSlug: input.artistSlug,
    exp: Math.floor(Date.now() / 1000) + input.ttlHours * 3600,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SECRET()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export async function verifyQrAttribution(token: string): Promise<QrAttribution> {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("malformed");
  const expected = createHmac("sha256", SECRET()).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("bad signature");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as QrAttribution;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
  return payload;
}
```

`api/checkout/route.ts` then verifies rather than trusts:

```ts
// Replace the bare `parsed.data.venueSlug` read at :44.
let venueSlug = "";
if (parsed.data.venueAttributionToken) {
  try {
    const claim = await verifyQrAttribution(parsed.data.venueAttributionToken);
    const cartSlugs = new Set(items.map((i) => (i.artistSlug || "").toLowerCase()));
    // The token names the artist whose QR was scanned. Only honour it
    // when that artist is actually in the cart.
    if (cartSlugs.has(claim.artistSlug.toLowerCase())) venueSlug = claim.venueSlug;
  } catch (err) {
    console.warn("[checkout] rejected venue attribution token", err);
  }
}
```

`lib/qr-context.ts` stores the token alongside the slug; `checkout/page.tsx:408`
sends `venueAttributionToken` instead of `venueSlug`. Keep accepting the bare
`venueSlug` for one release behind a `QR_TOKEN_ATTRIBUTION` flag so live QR
codes printed before the change keep working, then remove it.

### D11. Non-`active` placements silently pay the venue nothing

`:225` filters `status = 'active'`. A placement in `pending`, `paused` or
`completed` yields `pct = 0` at `:249` with no log line. The venue's dashboard
shows a sale and no revenue, and nobody can tell why.

Fix: log the miss explicitly so it is observable, and surface it on the order.

```ts
for (const slug of uniqueLineSlugs) {
  if (!placementByArtistSlug.has(slug)) {
    console.warn("[webhook] QR sale with no active placement", {
      orderId, venueSlug, artistSlug: slug,
    });
  }
}
```

## B6: T6 Paid loan monthly (E7, E8, E11)

This route has the most defects and they compound. Decide the model first.

**Decision: keep Path 1 (separate transfer) and delete Path 2 (destination
charge).** Rationale: every other payout in the system is a separate transfer
through `stripe_transfers`; a destination charge bypasses the ledger entirely,
so refunds, reversals, the payout dashboard (`api/orders/route.ts:267, 310`) and
`admin/financials` (`:137-139`) would all be blind to paid-loan money. One
ledger, one model.

### E7a. No webhook branch handles `metadata.kind === "paid_loan_monthly"`

Nothing consumes the session created by
`api/placements/[id]/payment/setup/route.ts`. Consequently
`placements.stripe_subscription_id` is written by nothing (confirmed: the
column exists at `migrations/025_placements_stripe_subscription.sql:8` and is
only ever read, at `payment/setup/route.ts:30, 41-43`), the dedup guard at
`:41` is permanently false, and the subscription is invisible to
`cancelPaidLoanBilling`, which reads `placement_recurring_billings`.

The branch is written in full in **C5**.

### E7b. No Stripe idempotency key on session creation

`payment/setup/route.ts:96`. Two clicks, two live subscriptions, two monthly
charges.

Fix:

```ts
const session = await stripe.checkout.sessions.create(sessionParams, {
  // One in-flight setup session per placement per hour. A retry
  // returns the same session instead of minting a second subscription.
  idempotencyKey: `paid_loan_setup:${placement.id}:${Math.floor(Date.now() / 3_600_000)}`,
});
```

Plus a real dedup guard that works, replacing `:41-43`:

```ts
const { data: billing } = await db
  .from("placement_recurring_billings")
  .select("id, stripe_subscription_id, status")
  .eq("placement_id", id)
  .maybeSingle();
if (billing?.stripe_subscription_id && billing.status !== "cancelled") {
  return NextResponse.json(
    { error: "Monthly payment already set up for this placement" },
    { status: 409 },
  );
}
```

### E8. Only the account id is checked, not `charges_enabled` / `payouts_enabled`

`payment/setup/route.ts:86-89` sets `transfer_data.destination` whenever
`artistProfile?.stripe_connect_account_id` is a non-empty string. That column
defaults to `''` (`migrations/004_pre_launch_features.sql:31`), so the check is
"non-empty string", not "can be paid". Stripe rejects a destination charge to a
non-`charges_enabled` account, which surfaces as the generic 500 at `:99-103`.
Meanwhile `PaymentClient.tsx:61-69` tells the venue:

> We'll still take the first month's payment and release it once they finish onboarding.

There is no mechanism that does that release. Nothing tracks the obligation.

Fix, with Path 2 deleted this becomes: gate the whole setup on
`canReceivePayout`, and change the copy to match reality.

```ts
const cap = await canReceivePayout(db, { kind: "artist", userId: placement.artist_user_id });
if (!cap.ok) {
  return NextResponse.json(
    {
      error: `${artistProfile?.name || "This artist"} hasn't finished their payout setup, so we can't start billing yet. We've let them know.`,
      code: "artist_payout_unavailable",
      reason: cap.reason,
    },
    { status: 422 },
  );
}
```

and in `PaymentClient.tsx`, replace the `!artistReady` block at `:61-69`:

```tsx
{!artistReady && (
  <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-sm">
    <p className="text-xs font-medium text-amber-900 mb-1">Waiting on the artist</p>
    <p className="text-xs text-amber-900/80">
      {artistName} hasn&rsquo;t finished their payout setup yet, so we can&rsquo;t start
      billing. We&rsquo;ve nudged them. You&rsquo;ll get an email the moment it&rsquo;s ready.
    </p>
  </div>
)}
```

with the button disabled when `!artistReady`.

### E7c. `cancelPaidLoanBilling` reads a table Path 2 never populates

`lib/placements/paid-loan-billing.ts:324-352` reads
`placement_recurring_billings`. With C5's branch landed, both paths write that
table, so cancellation works. Add the `placements.stripe_subscription_id`
mirror write in C5 too so the column stops lying.

Also fix the upsert conflict target, `:292-309`. `onConflict:
"stripe_subscription_id"` targets a **nullable** UNIQUE column
(`migrations/063_placement_recurring_billings.sql:17`), and NULLs do not
conflict in Postgres. Add a proper key.

Migration `078_placement_recurring_billings_placement_uniq.sql`:

```sql
-- One live billing row per placement. Cancelled rows are archived by
-- status, not deleted, so partial-unique on the live states.
CREATE UNIQUE INDEX IF NOT EXISTS placement_recurring_billings_placement_live_uniq
  ON placement_recurring_billings(placement_id)
  WHERE status <> 'cancelled';

ALTER TABLE placement_recurring_billings
  ADD CONSTRAINT placement_recurring_billings_placement_fk
  FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE;
NOTIFY pgrst, 'reload schema';
```

**UNCONFIRMED**: whether `placements.id` is `TEXT PRIMARY KEY`. Verify before
adding the FK; the migration must be split if not.

### E7d. No `setup_intent.succeeded` branch, so billing never starts after a card is added

`paid-loan-billing.ts:178-183` documents that the UI "re-invokes the flow after
`setup_intent.succeeded` lands on the webhook". No such branch exists (verified:
zero matches for `setup_intent` in the webhook). And the client cannot re-invoke
by PATCH either, because `goingActive` requires `existing.status === "pending"`
(`api/placements/route.ts:1292`) and the placement is already `active` by then.

Net effect: a paid-loan placement whose venue had no card on file goes live and
never bills. Branch written in **C5**.

### E11. `PAID_LOAN_V2` is off in prod, so `invoice.payment_failed` is a no-op

`lib/feature-flags.ts:68-77`, `prodDefault: false`. Every helper in
`paid-loan-billing.ts` short-circuits at `:188, :328, :365, :471, :509`. With
the flag off, a failed venue card does nothing: no `past_due`, no `paused`, no
notification, and the placement keeps displaying.

Fix: this plan's exit criterion is flipping `prodDefault` to `true`. Until then
the flag must not gate the **webhook reconcilers**, only the
subscription-creation path. Split the flag check:

```ts
// paid-loan-billing.ts, creation stays gated, reconciliation does not.
export async function handleInvoicePaid(invoice, client?) {
  // No flag check. If a subscription exists in Stripe we must reconcile
  // it, regardless of whether we would create a new one today.
  const subscriptionId = readSubscriptionIdFromInvoice(invoice);
  ...
}
```

Apply the same removal in `handleInvoicePaymentFailed` (`:471`) and
`handleSubscriptionDeleted` (`:509`). Keep the check in
`startPaidLoanBilling` (`:188`) and `cancelPaidLoanBilling` (`:328`), actually
remove it from `cancelPaidLoanBilling` too, since refusing to cancel an existing
subscription because a flag is off is exactly the uncancellable-subscription
failure mode.

### E11b. `subscription_period_end` can be stamped 1970-01-01

`webhooks/stripe/route.ts:722`:

```ts
subscription_period_end: new Date((subscription.items.data[0]?.current_period_end ?? 0) * 1000).toISOString(),
```

`?? 0` becomes the Unix epoch. The billing page then shows a subscription that
expired 56 years ago. Same bug at `:766`.

Fix:

```ts
const periodEndUnix = subscription.items.data[0]?.current_period_end ?? null;
// ...
subscription_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
```

and at `:766`:

```ts
billingDate: periodEndUnix
  ? new Date(periodEndUnix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  : "your next billing date",
```

## B7: T7 Artist subscription

### D12. An unknown price id silently downgrades the artist to `core`

`webhooks/stripe/route.ts:711-714`:

```ts
let plan = "core";
if (priceId === process.env.STRIPE_PRICE_PREMIUM || ...) plan = "premium";
else if (priceId === process.env.STRIPE_PRICE_PRO || ...) plan = "pro";
else if (priceId === process.env.STRIPE_PRICE_CORE || ...) plan = "core";
```

If `STRIPE_PRICE_PRO` is unset or mistyped in the deployed env, every Pro
artist's profile is written as `core`. `platformFeePercentForArtist` then
charges them **15% instead of 5%** on every subsequent sale. Silent, ongoing
overcharge, and the artist has no way to see it.

Fix: never guess.

```ts
const PRICE_TO_PLAN: Record<string, "core" | "premium" | "pro"> = Object.fromEntries(
  ([
    [process.env.STRIPE_PRICE_CORE, "core"],
    [process.env.STRIPE_PRICE_CORE_ANNUAL, "core"],
    [process.env.STRIPE_PRICE_PREMIUM, "premium"],
    [process.env.STRIPE_PRICE_PREMIUM_ANNUAL, "premium"],
    [process.env.STRIPE_PRICE_PRO, "pro"],
    [process.env.STRIPE_PRICE_PRO_ANNUAL, "pro"],
  ] as const).filter(([id]) => !!id) as Array<[string, "core" | "premium" | "pro"]>,
);

const plan = PRICE_TO_PLAN[priceId];
if (!plan) {
  // Could be curation, could be a misconfigured env. Either way we must
  // not stamp a plan we did not recognise onto an artist profile.
  console.error("[webhook] unrecognised subscription price id", { priceId, subscriptionId: subscription.id });
  return NextResponse.json({ received: true, ignored: "unknown_price" });
}
```

Add a startup assertion in `src/env.ts` (there is already an `env.test.ts`) that
all six price envs are set in production.

### D13. The `customer.subscription.deleted` stale guard returns early and skips everything after it

`webhooks/stripe/route.ts:897-904`:

```ts
const isStale = profile && profile.stripe_subscription_id && profile.stripe_subscription_id !== subscription.id;
if (isStale) {
  return NextResponse.json({ received: true });
}
```

That `return` exits the **whole handler**, so the paid-loan
`handleSubscriptionDeletedPaidLoan` at `:1020-1027` never runs for that event.
An artist upgrading their plan can therefore leave a paid-loan billing row stuck
`active` after Stripe cancelled the subscription.

Fix: `return` only from the SaaS block. Restructure the branch into a
`handleSaasSubscriptionDeleted(...)` helper called with `await`, and drop the
early `return` in favour of a local `if (!isStale) { ... }`.

```ts
if (event.type === "customer.subscription.deleted") {
  await handleSaasSubscriptionDeleted(db, subscription);   // no early return
  try { await handleSubscriptionDeletedPaidLoan(subscription); }
  catch (err) { console.error("[stripe webhook] paid-loan subscription.deleted:", err); }
}
```

Consolidate the two `customer.subscription.deleted` blocks (`:870` and `:1020`)
and the two `invoice.payment_failed` blocks (`:945` and `:1012`) and the two
`invoice.paid` blocks (`:1004` and `:1030`) into one branch each while doing it.
Duplicated `event.type` checks in a 1,252-line handler are how D13 happened.

### D14. Referral credit is read-modify-write, not atomic

`:783-816`. Reads `referral_credited_at`, checks it is null, reads the
referrer's `free_until`, adds 30 days, writes both. Two concurrent deliveries of
the same event both see null and both credit. With D1's event dedup this is much
less likely, but the fix is cheap.

Fix: make the credit stamp the guard, via a conditional update that returns
rows only for the winner.

```ts
const { data: claimed } = await db
  .from("artist_profiles")
  .update({ referral_credited_at: new Date().toISOString() })
  .eq("id", referred.id)
  .is("referral_credited_at", null)          // only the first caller matches
  .select("id")
  .maybeSingle();
if (!claimed) return;                         // someone else already credited

// Atomic increment on the referrer, so two different referrals landing
// at once both count.
const { error: creditErr } = await db.rpc("extend_free_until", {
  p_profile_id: referrer.id,
  p_days: 30,
});
if (creditErr) {
  // Roll the claim back so the credit is not lost.
  await db.from("artist_profiles").update({ referral_credited_at: null }).eq("id", referred.id);
  console.error("[webhook] referral credit failed", creditErr);
}
```

Migration `079_extend_free_until.sql`:

```sql
CREATE OR REPLACE FUNCTION public.extend_free_until(p_profile_id TEXT, p_days INTEGER)
RETURNS TIMESTAMPTZ
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE artist_profiles
     SET free_until = GREATEST(COALESCE(free_until, now()), now()) + (p_days || ' days')::interval
   WHERE id = p_profile_id
   RETURNING free_until;
$$;
NOTIFY pgrst, 'reload schema';
```

**UNCONFIRMED**: `artist_profiles.id` type. Adjust the signature to `UUID` if
that is what the schema uses.

### D15. The subscription handler is not scoped by `metadata.kind`

`:704` matches every `customer.subscription.created|updated` on the account,
including paid-loan and managed-curation subscriptions, and writes
`artist_profiles` by `stripe_customer_id`. Today that is a near-miss rather than
a hit, because both other flows create fresh customers via `customer_email`
rather than reusing an artist's customer id. It is one refactor away from
being a live bug.

Fix, first line of the branch:

```ts
const kind = subscription.metadata?.kind || subscription.metadata?.source || "";
if (kind === "paid_loan_monthly" || kind === "wallplace_paid_loan_billing" || kind === "curation_request") {
  // Not a platform SaaS subscription; the dedicated handlers own it.
} else {
  // ... existing artist_profiles logic
}
```

## B8: T8 Refunds

The claim/release pattern (`lib/api/idempotency.ts`) and the
reverse-transfers-before-refunding ordering are both correct. Keep them. Three
defects.

### D16. Partial reversal uses the wrong denominator

`refunds/process/route.ts:181-184`:

```ts
const reverseAmount = isFullRefund
  ? transfer.amount_cents
  : Math.round(transfer.amount_cents * (refundAmountCents / Math.round(order.total * 100)));
```

`order.total` includes shipping, which was **never split**: the artist keeps
100% of it (`webhooks/stripe/route.ts:267` adds `shippingCost` to
`artistRevenue`). Refunding only the artwork value therefore claws back a
pro-rata slice of the shipping the artist already paid a courier. Conversely,
refunding shipping only claws back part of the artwork proceeds.

Fix: reverse against the recipient's own share of the **refundable base**.

```ts
// Shipping is not shared revenue: the artist keeps it and pays the
// courier from it. Reverse against subtotal, and handle a
// shipping-inclusive refund by reversing the shipping separately.
const subtotalPence = Math.round(Number(order.subtotal) * 100);
const shippingPence = Math.round(Number(order.shipping_cost ?? 0) * 100);
const artworkRefundPence = Math.min(refundAmountCents, subtotalPence);
const shippingRefundPence = Math.max(0, refundAmountCents - subtotalPence);

const reverseAmount = isFullRefund
  ? transfer.amount_cents
  : (() => {
      const base = subtotalPence > 0
        ? Math.round(transfer.amount_cents * (artworkRefundPence / subtotalPence))
        : 0;
      // Only the artist leg carries shipping.
      const ship = transfer.recipient_type === "artist" ? shippingRefundPence : 0;
      return Math.min(transfer.amount_cents, base + ship);
    })();
```

Guard: `refundAmountCents` must never exceed `order.total * 100`; already
enforced at request time (`refunds/request/route.ts:116-118`) but re-assert at
process time, since the order total can be re-read between the two calls.

### D17. Refunds never restock

Nothing in `refunds/process/route.ts` touches `artist_works`. A refunded piece
stays marked sold forever.

Fix, after the order status update at `:248-258`, for full refunds only:

```ts
if (isFullRefund) {
  const items = Array.isArray(order.items) ? order.items : [];
  for (const item of items as Array<{ workId?: string; id?: string; quantity?: number; qty?: number }>) {
    const workId = item.workId || item.id;
    const qty = Number(item.quantity ?? item.qty ?? 1);
    if (!workId || !Number.isFinite(qty) || qty <= 0) continue;
    const { error: restockErr } = await db.rpc("restock_work", { p_work_id: workId, p_qty: qty });
    if (restockErr) console.error("[refunds/process] restock failed", { workId, restockErr });
  }
}
```

`restock_work` mirrors `decrement_work_stock` in migration 075, adding rather
than subtracting and flipping `available` back to `true` when the count rises
above zero. Restock failure is logged, not fatal: the money has already moved
and blocking on inventory would strand the refund.

### D18. Curation has no refund path at all

`curation_requests.stripe_payment_intent_id` holds a **subscription id** for
managed tiers (`webhooks/stripe/route.ts:84`:
`stripe_payment_intent_id: paymentIntentId || subscriptionId`). Any refund
tooling keyed on that column would call
`stripe.refunds.create({ payment_intent: "sub_..." })` and fail. Fix in B10.

## B9: T9 Collect from venue (N1, N2)

Nothing here is a bug fix; it is a feature that was half-designed and needs
building. The data model comes first.

### N1. Couple the collect option to the placement, per size

Today `pricing[i].inStorePrice` (`data/artists.ts:5-25`) drives the CTA and
`work.placed_at_venue` is a display string with no size dimension. The CTA
renders identically whether the piece is on a venue wall or in the artist's
flat.

Fix, three parts.

**(a) Gate the CTA on an actual live placement.** `ArtworkPageClient.tsx:595`:

```tsx
// Before: {work.available && selectedInStorePrice != null && (() => {
// After:
{work.available
  && selectedInStorePrice != null
  && work.currentPlacement?.status === "active"
  && (() => {
```

`work.currentPlacement` is a new field on the transformed work, sourced from
`artist_works.current_placement_id` (which already exists,
`migrations/038_placement_inventory_attribution.sql:11`) joined to `placements`.
Add it in `lib/db/artist-profiles-transform.ts` alongside the existing
`placed_at_venue` passthrough at `:180`:

```ts
currentPlacement: w.current_placement_id
  ? {
      id: w.current_placement_id,
      venueSlug: w.placement_venue_slug ?? null,
      venueName: w.placed_at_venue ?? null,
      status: w.placement_status ?? null,
      collectionAddress: w.placement_collection_address ?? null,
    }
  : null,
```

**(b) Make the size the thing that is collectable.** `inStorePrice` is already
per-size on `pricing[]`. Keep it, and label the CTA with the venue name so the
buyer knows where they are going:

```tsx
{isPerSize
  ? `Collect from ${work.currentPlacement!.venueName}, £${selectedInStorePrice}`
  : `Buy Original, £${selectedInStorePrice}`}
```

**(c) Only the placed size is collectable.** A work on a venue wall is one
physical object at one size. Add `placements.placed_size_label TEXT` and gate:

```tsx
&& selectedPricing?.label === work.currentPlacement!.placedSizeLabel
```

Migration `080_placement_placed_size.sql`:

```sql
ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS placed_size_label TEXT,
  ADD COLUMN IF NOT EXISTS collection_address TEXT;
COMMENT ON COLUMN placements.placed_size_label IS
  'Which pricing[] size label is physically hanging at the venue. Drives the collect-from-venue CTA.';
NOTIFY pgrst, 'reload schema';
```

`collection_address` on `placements` is the venue's collection point, set at
accept time from `venue_profiles`.

### N2. Carry the venue-collection intent through the cart to the order

Today the cart line (`ArtworkPageClient.tsx:613-627`) carries no fulfilment
field, and `checkout/page.tsx:73` hard-defaults to `"ship"`.

**(a) Widen the cart line schema.** `lib/validations.ts:176-200`:

```ts
const checkoutItemSchema = z.object({
  // ...existing fields...
  /** Per-line fulfilment. Absent means "follow the order-level choice". */
  lineFulfilment: z.enum(["ship", "collect_venue"]).optional(),
  /** Set only when lineFulfilment === "collect_venue". Server re-validates. */
  collectVenueSlug: optionalString(100),
  collectPlacementId: optionalString(200),
});
```

**(b) Add the third order-level mode.** Same file, `:250-299`:

```ts
const venueCollectionCheckoutSchema = z.object({
  fulfilmentMethod: z.literal("collect_venue"),
  items: z.array(checkoutItemSchema).min(1).max(50),
  shipping: collectionShippingSchema,   // name, email, phone only
  ...checkoutMetaShape,
});

export const checkoutSchema = z.preprocess(
  (input) => { /* unchanged "ship" default */ },
  z.discriminatedUnion("fulfilmentMethod", [
    shipCheckoutSchema,
    collectionCheckoutSchema,
    venueCollectionCheckoutSchema,
  ]).superRefine(/* unchanged postcode rule, ship only */),
);
```

**(c) Preselect the mode from the cart.** `checkout/page.tsx:73`:

```tsx
// A cart where every line is a venue-collect line opens in
// collect_venue mode. Mixed carts stay on "ship" and the collect lines
// are rejected server-side with a "split your cart" message.
const allVenueCollect = items.length > 0 && items.every((i) => i.lineFulfilment === "collect_venue");
const [fulfilmentMethod, setFulfilmentMethod] = useState<"ship" | "collection" | "collect_venue">(
  allVenueCollect ? "collect_venue" : "ship",
);
```

and add the third tile beside the two at `:576-609`, showing the venue name and
address, with copy along the lines of "Collect from {venueName}, {address}. Show
your order number at the bar."

**(d) Server re-validation in `api/checkout/route.ts`.** Never trust the
client's `collectVenueSlug`:

```ts
if (fulfilmentMethod === "collect_venue") {
  const placementIds = items.map((i) => i.collectPlacementId).filter(Boolean) as string[];
  if (placementIds.length !== items.length) {
    return NextResponse.json({ error: "Every item must name its collection placement." }, { status: 400 });
  }
  const { data: places } = await getSupabaseAdmin()
    .from("placements")
    .select("id, venue_slug, artist_slug, status, collection_address, placed_size_label")
    .in("id", placementIds)
    .eq("status", "active");
  const byId = new Map((places || []).map((p) => [p.id, p]));
  for (const line of items) {
    const p = byId.get(line.collectPlacementId!);
    if (!p || p.venue_slug !== line.collectVenueSlug || p.artist_slug !== line.artistSlug) {
      return NextResponse.json(
        { error: `"${line.title}" is no longer available for collection.`, code: "collection_unavailable" },
        { status: 409 },
      );
    }
    if (p.placed_size_label && p.placed_size_label !== line.size) {
      return NextResponse.json(
        { error: `Only the ${p.placed_size_label} of "${line.title}" is at the venue.`, code: "collection_size_mismatch" },
        { status: 409 },
      );
    }
  }
  // One venue per collect order.
  const venues = new Set(items.map((i) => i.collectVenueSlug));
  if (venues.size > 1) {
    return NextResponse.json(
      { error: "Collection orders can only cover one venue at a time." },
      { status: 400 },
    );
  }
}
```

**(e) Order + money.** In the webhook, treat `collect_venue` exactly like
`collection` for the payout timing (immediate, no shipping) and additionally:

```ts
const isVenueCollection = fulfilmentMethod === "collect_venue";
const isCollection = fulfilmentMethod === "collection" || isVenueCollection;
// ...
collection_address: isVenueCollection ? (savedShipping as { collectionAddress?: string })?.collectionAddress || null : null,
```

`orders.collection_address` already exists
(`migrations/042_orders_fulfilment_method.sql:8`) and is used by nothing, so no
migration is needed for it. The CHECK constraint on `fulfilment_method` does
need widening.

Migration `081_orders_fulfilment_collect_venue.sql`:

```sql
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfilment_method_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_fulfilment_method_check
  CHECK (fulfilment_method IN ('ship','collection','digital','collect_venue'));
NOTIFY pgrst, 'reload schema';
```

**(f) Venue notification.** A venue-collect sale must tell the venue someone is
coming. New email `VenueCollectionPending` plus a `collection_pending` bell,
fired from the webhook alongside the existing venue revenue-share notification
at `:628-643`.

## B10: T10 Curation (first audit)

### D25. The two managed tiers cannot be booked at all. The `tier` CHECK rejects them

> **RESOLVED (tier) — verified live 2026-07-30.** Migration `080_curation_managed_tiers.sql`
> already widened the `tier` CHECK; the live constraint permits all five tiers
> (`single_wall, full_space, bespoke, managed_monthly, managed_quarterly`), so the
> managed tiers are bookable. The regression guard the doc asks for already exists
> as `src/lib/curation-tiers.test.ts` (asserts the migration's tier CHECK equals
> `CURATION_TIER_KEYS`). The `23514` check-violation logging in `api/curation/route.ts`
> was added on top. **The doc's migration `083` is redundant for the tier part.**
> The `status` CHECK still lacks `past_due` / `paused` (verified live), which D21's
> handlers need — that widen is deferred to D21. Note 04's migration range (080-089)
> is now fully used, so D21's status migration needs a number resolution.

This is the most serious finding of the curation audit, and it is not subtle.

`supabase/migrations/013_curation_requests.sql:19`:

```sql
tier TEXT NOT NULL CHECK (tier IN ('single_wall', 'full_space', 'bespoke')),
```

No later migration widens it (verified: `013` is the only migration that touches
`curation_requests`; `060_disputes_and_reports.sql:9` merely references it in a
comment). But `api/curation/route.ts:28` accepts
`managed_monthly` and `managed_quarterly` and writes them straight into that
column at `:105`. The insert is rejected by the constraint, the route falls into
`:121-124`, and the venue sees:

> Could not create request

with an HTTP 500. **£79.99/month and £199.99/quarter are unsellable, and have
been since the managed tiers shipped.** The marketing pages
(`lib/curated-tiers.ts:219, 269`) advertise both with live CTAs.

The same migration's `status` CHECK (`:36-37`) allows
`pending_payment, awaiting_quote, paid, in_progress, shortlist_sent, completed,
cancelled, refunded`. It does **not** allow `past_due` or `paused`, which D21's
handlers need. So migration `083` is confirmed necessary, not speculative.

Fix, migration `083_curation_requests_tiers_and_statuses.sql`:

```sql
ALTER TABLE curation_requests DROP CONSTRAINT IF EXISTS curation_requests_tier_check;
ALTER TABLE curation_requests
  ADD CONSTRAINT curation_requests_tier_check
  CHECK (tier IN ('single_wall','full_space','bespoke','managed_monthly','managed_quarterly'));

ALTER TABLE curation_requests DROP CONSTRAINT IF EXISTS curation_requests_status_check;
ALTER TABLE curation_requests
  ADD CONSTRAINT curation_requests_status_check
  CHECK (status IN (
    'pending_payment','awaiting_quote','paid','in_progress','shortlist_sent',
    'completed','cancelled','refunded','past_due','paused'
  ));

NOTIFY pgrst, 'reload schema';
```

**UNCONFIRMED**: the live database may have drifted from the migration files,
since several were applied by hand through the Supabase MCP (see the header of
`070_qa44_db_hardening.sql`). Before landing, run against production:

```sql
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.curation_requests'::regclass;
```

If the live constraint already lists the managed tiers, D25 is a
migration-file-only drift and the fix is to reconcile the file. If it does not,
this is a live revenue outage and Phase 7 should be pulled forward ahead of
Phase 6.

Add a regression guard so a tier can never again exist in code but not in the
schema. In `api/curation/route.ts`, after the insert:

```ts
if (insertError) {
  // 23514 = check_violation. A tier the schema does not know about is a
  // deploy error, not a user error, and must page rather than 500 quietly.
  if ((insertError as { code?: string }).code === "23514") {
    console.error("[curation] tier/status rejected by CHECK constraint", { tier: d.tier, insertError });
  }
  console.error("curation insert error:", insertError);
  return NextResponse.json({ error: "Could not create request" }, { status: 500 });
}
```

and a unit test asserting `Object.keys(TIERS)` is a subset of the constraint's
allowed values, read from a checked-in copy of the schema.

### D19. Orphan payment: the error path deletes a row whose Stripe session is live

`api/curation/route.ts:196-233`. The `try` wraps both
`stripe.checkout.sessions.create` **and** the subsequent
`curation_requests.update({ stripe_checkout_session_id })`. If the session is
created but the update throws (transient Postgres error), the `catch` at `:229`
runs `db.from("curation_requests").delete().eq("id", row.id)`. The Stripe
session is still live in the customer's browser. They pay. The webhook looks up
the row at `:71-75`, finds nothing, and returns `{ received: true }` at `:112`.

Money taken. No record. No email. No refund trail. Same shape in the managed
branch at `:188-192`.

Fix: never delete a row once a Stripe session exists for it; mark it instead,
and only delete when session creation itself failed.

```ts
let session: Stripe.Checkout.Session;
try {
  session = await stripe.checkout.sessions.create({ /* ... */ });
} catch (err) {
  // No session exists, so nothing can be paid. Safe to remove the row.
  console.error("curation stripe session error:", err);
  await db.from("curation_requests").delete().eq("id", row.id);
  return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
}

// A session now exists and can be paid at any moment. From here on the
// row must survive, whatever else fails.
const { error: linkErr } = await db
  .from("curation_requests")
  .update({ stripe_checkout_session_id: session.id })
  .eq("id", row.id);
if (linkErr) {
  console.error("curation session link failed, row retained", { requestId: row.id, sessionId: session.id, linkErr });
}
return NextResponse.json({ mode: "checkout", url: session.url, id: row.id });
```

### D20. A subscription id is stored in the payment-intent column

`webhooks/stripe/route.ts:84`:

```ts
stripe_payment_intent_id: paymentIntentId || subscriptionId,
```

Type-confused column. It breaks any refund path (D18) and makes the admin view
lie about what kind of object it is.

Fix, migration `082_curation_requests_subscription.sql`:

```sql
ALTER TABLE curation_requests
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_invoice_paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS curation_requests_subscription_idx
  ON curation_requests(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Backfill: anything in the payment-intent column starting `sub_` is a
-- subscription that was written to the wrong column.
UPDATE curation_requests
   SET stripe_subscription_id = stripe_payment_intent_id,
       stripe_payment_intent_id = NULL
 WHERE stripe_payment_intent_id LIKE 'sub\_%';

NOTIFY pgrst, 'reload schema';
```

and the webhook:

```ts
.update({
  status: newStatus,
  ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
  ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
  amount_paid_gbp: amountPaid,
  paid_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})
```

### D21. Managed curation subscriptions never reconcile

Three missing branches:

1. **`invoice.paid` for a curation subscription.** The block at `:1030` looks up
   `artist_profiles` by customer id, finds nothing, and does nothing. So a
   monthly renewal produces no receipt, no `last_invoice_paid_at`, no admin
   signal.
2. **`customer.subscription.deleted` for a curation subscription.** The block at
   `:870` touches only `artist_profiles`. A cancelled managed-curation
   subscription leaves `curation_requests.status = 'in_progress'` forever, and
   the curator keeps doing the work unpaid.
3. **`invoice.payment_failed`.** Same story: no `past_due`, no dunning.

Fix: a `src/lib/curation/billing.ts` module mirroring
`paid-loan-billing.ts`, with three handlers wired into the consolidated webhook
branches:

```ts
// src/lib/curation/billing.ts
import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function findBySubscription(db: ReturnType<typeof getSupabaseAdmin>, subId: string) {
  const { data } = await db
    .from("curation_requests")
    .select("id, status, contact_email, contact_name, venue_name, tier")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  return data;
}

export async function handleCurationInvoicePaid(invoice: Stripe.Invoice): Promise<boolean> {
  const subId = readSubscriptionIdFromInvoice(invoice);   // shared helper, extracted from paid-loan-billing.ts
  if (!subId) return false;
  const db = getSupabaseAdmin();
  const row = await findBySubscription(db, subId);
  if (!row) return false;
  await db.from("curation_requests").update({
    status: "in_progress",
    last_invoice_paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (invoice.billing_reason === "subscription_cycle" && row.contact_email) {
    await sendEmail({
      idempotencyKey: `curation_renewal:${invoice.id}`,
      template: "curation_renewal_receipt",
      category: "orders_and_payouts",
      to: row.contact_email,
      subject: "Your Wallplace curation has renewed",
      react: CurationRenewalReceipt({ /* ... */ }),
      metadata: { curationRequestId: row.id, invoiceId: invoice.id },
    });
  }
  return true;
}

export async function handleCurationSubscriptionDeleted(sub: Stripe.Subscription): Promise<boolean> {
  const db = getSupabaseAdmin();
  const row = await findBySubscription(db, sub.id);
  if (!row) return false;
  await db.from("curation_requests").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  await notifyAdminCurationCancelled({ requestId: row.id, venueName: row.venue_name, tier: row.tier });
  return true;
}

export async function handleCurationInvoiceFailed(invoice: Stripe.Invoice): Promise<boolean> {
  const subId = readSubscriptionIdFromInvoice(invoice);
  if (!subId) return false;
  const db = getSupabaseAdmin();
  const row = await findBySubscription(db, subId);
  if (!row) return false;
  const finalAttempt = invoice.next_payment_attempt === null;
  await db.from("curation_requests").update({
    status: finalAttempt ? "paused" : "past_due",
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  return true;
}
```

Migration `083_curation_requests_tiers_and_statuses.sql` (written out under D25)
widens the status CHECK to include `past_due` and `paused`. `cancelled` is
already allowed.

### D22. The declared billing interval is decorative

`api/curation/route.ts:18-19` declares `interval: "month"` and
`interval: "quarter"`, and the field is never read. The real cadence comes from
the Stripe price behind `STRIPE_PRICE_CURATION_MONTHLY` /
`STRIPE_PRICE_CURATION_QUARTERLY`, which nothing validates. If the quarterly
price is configured as monthly, the venue is billed £199.99 every month while
the site promises every quarter.

Fix: verify at session-creation time.

```ts
const price = await stripe.prices.retrieve(priceId);
const expected = tier.interval === "quarter"
  ? { interval: "month" as const, interval_count: 3 }
  : { interval: "month" as const, interval_count: 1 };
if (
  price.recurring?.interval !== expected.interval ||
  (price.recurring?.interval_count ?? 1) !== expected.interval_count ||
  price.unit_amount !== Math.round(tier.priceGbp * 100) ||
  price.currency !== "gbp"
) {
  console.error("curation price mismatch", { priceId, price: price.unit_amount, recurring: price.recurring, expected, tier });
  await db.from("curation_requests").delete().eq("id", row.id);
  return NextResponse.json(
    { error: "Managed curation is temporarily unavailable. Please try a one-off tier." },
    { status: 503 },
  );
}
```

Cache the retrieve for 5 minutes in module scope so this does not add a Stripe
round trip to every submission.

### D23. Nobody is told the money landed

`notifyAdminCurationRequest` fires at submit (`:127-136`), before payment. There
is no admin notification when the payment actually settles, so the curator
cannot distinguish a paid £49 brief from an abandoned checkout without opening
Stripe.

Fix: add an admin send in the webhook branch next to
`notifyCurationCustomerPaid` at `:102-108`:

```ts
await notifyAdminCurationPaid({
  requestId: requestId,
  tier: tierLabels[existing.tier] || existing.tier,
  amountGbp: amountPaid,
  venueName: existing.venue_name,
  contactName: existing.contact_name,
  contactEmail: existing.contact_email,
  isSubscription,
}).catch((err) => { if (err) console.error("notifyAdminCurationPaid error:", err); });
```

### D24. The success page asserts payment that was never verified

`(pages)/curated/success/page.tsx` is a static component reading "Payment
received." with no `session_id` lookup at all, even though the success URL
carries one (`api/curation/route.ts:219`).

Fix: make it a server component that retrieves the session and branches on
`payment_status`, matching the `checkout/confirmation` pattern. A `processing`
state must say so rather than claiming receipt.

---

# (C) Shared primitives to build

Five modules. Everything in (B) depends on them, so they land first.

## C1: `canReceivePayout()`

New file `src/lib/payouts/capability.ts`. Supersedes
`lib/stripe-connect-status.ts` (which checks only `charges_enabled`, for
artists only, and returns a bare boolean with no reason).

```ts
// src/lib/payouts/capability.ts
//
// One answer to "can we send this person money right now, and if not,
// why not". Used by every route that is about to take money on someone
// else's behalf, and by every path that is about to schedule a transfer.
//
// charges_enabled is NOT sufficient. A Connect account can accept
// charges while payouts are disabled (mid-KYC, failed verification,
// restricted for review). Transfers to such an account succeed and then
// sit in an unpayable balance. We gate on payouts_enabled.

import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

const CACHE_TTL_MS = 60_000;

export type PayoutBlockReason =
  | "no_account"
  | "charges_disabled"
  | "payouts_disabled"
  | "requirements_due"
  | "stripe_unavailable";

export interface PayoutCapability {
  ok: boolean;
  accountId: string | null;
  reason: PayoutBlockReason | null;
  /** Populated when reason === "requirements_due". */
  currentlyDue?: string[];
}

export interface PayoutTarget {
  kind: "artist" | "venue";
  /** Either identifier works; userId is preferred. */
  userId?: string;
  slug?: string;
}

const TABLE = { artist: "artist_profiles", venue: "venue_profiles" } as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = Pick<SupabaseClient<any, any, any>, "from">;

export async function canReceivePayout(
  db: AnyClient,
  target: PayoutTarget,
): Promise<PayoutCapability> {
  const table = TABLE[target.kind];
  let q = db
    .from(table)
    .select(
      "stripe_connect_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_charges_checked_at",
    );
  q = target.userId ? q.eq("user_id", target.userId) : q.eq("slug", target.slug ?? "");

  const { data: profile, error } = await q.maybeSingle();
  if (error) {
    console.error("[payouts] profile lookup failed", { target, error });
    return { ok: false, accountId: null, reason: "stripe_unavailable" };
  }
  const accountId = profile?.stripe_connect_account_id || null;
  // The column defaults to '' (mig 004), so a falsy check is required;
  // `!= null` would pass an empty string straight through to Stripe.
  if (!accountId) return { ok: false, accountId: null, reason: "no_account" };

  const checkedAt = profile?.stripe_charges_checked_at
    ? new Date(profile.stripe_charges_checked_at).getTime()
    : 0;
  const fresh =
    profile?.stripe_charges_enabled !== null &&
    profile?.stripe_payouts_enabled !== null &&
    Date.now() - checkedAt < CACHE_TTL_MS;

  if (fresh) return decide(accountId, !!profile!.stripe_charges_enabled, !!profile!.stripe_payouts_enabled, []);

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const charges = account.charges_enabled ?? false;
    const payouts = account.payouts_enabled ?? false;
    const due = account.requirements?.currently_due ?? [];
    await db
      .from(table)
      .update({
        stripe_charges_enabled: charges,
        stripe_payouts_enabled: payouts,
        stripe_charges_checked_at: new Date().toISOString(),
      })
      .eq(target.userId ? "user_id" : "slug", target.userId ?? target.slug ?? "");
    return decide(accountId, charges, payouts, due);
  } catch (err) {
    console.error("[payouts] stripe accounts.retrieve failed", { accountId, err });
    // Fail closed. Never take money we might not be able to forward.
    return { ok: false, accountId, reason: "stripe_unavailable" };
  }
}

function decide(
  accountId: string,
  charges: boolean,
  payouts: boolean,
  currentlyDue: string[],
): PayoutCapability {
  if (!charges) return { ok: false, accountId, reason: "charges_disabled", currentlyDue };
  if (!payouts) return { ok: false, accountId, reason: "payouts_disabled", currentlyDue };
  return { ok: true, accountId, reason: null };
}

/** Buyer-facing copy for a block. Never leaks Stripe internals. */
export function payoutBlockMessage(name: string, reason: PayoutBlockReason): string {
  switch (reason) {
    case "no_account":
    case "charges_disabled":
    case "requirements_due":
      return `${name} hasn't finished setting up payouts yet, so we can't take this order.`;
    case "payouts_disabled":
      return `${name}'s payout account is on hold with Stripe. We've let them know.`;
    case "stripe_unavailable":
      return "We couldn't verify the payout account just now. Please try again in a minute.";
  }
}
```

Migration `084_payouts_enabled_columns.sql`:

```sql
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN;
ALTER TABLE venue_profiles
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled  BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled  BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_charges_checked_at TIMESTAMPTZ;
NOTIFY pgrst, 'reload schema';
```

And keep the cache warm from the webhook. `account.updated` (`:1193-1206`)
currently writes only `stripe_connect_onboarding_complete`:

```ts
const patch = {
  stripe_connect_onboarding_complete: account.charges_enabled && account.details_submitted,
  stripe_charges_enabled: account.charges_enabled ?? false,
  stripe_payouts_enabled: account.payouts_enabled ?? false,
  stripe_charges_checked_at: new Date().toISOString(),
};
await db.from("venue_profiles").update(patch).eq("stripe_connect_account_id", account.id);
await db.from("artist_profiles").update(patch).eq("stripe_connect_account_id", account.id);
```

Then replace `canArtistAcceptOrders` in `api/checkout/route.ts:282` with
`canReceivePayout(db, { kind: "artist", slug })`, and delete
`lib/stripe-connect-status.ts` once its test is ported.

## C2: Per-artist transfer legs

New file `src/lib/payouts/legs.ts`.

```ts
// src/lib/payouts/legs.ts
//
// Turns a cart into one payout leg per artist, with the platform fee
// computed at each artist's own plan rate and shipping attributed to
// the artist who will actually post the parcel.
//
// Invariant, asserted by the caller: venue + Σlegs + platformFee ==
// amount_total, exactly, in pence. Rounding drift lands on the platform
// fee, never on a recipient.

import type { SupabaseClient } from "@supabase/supabase-js";
import { platformFeePercentForArtist, DEFAULT_PLAN_FEE_PERCENT } from "@/lib/platform-fee";

export interface CartLine {
  artistSlug?: string;
  price?: number;
  qty?: number;
  quantity?: number;
}

export interface ArtistLeg {
  artistSlug: string;
  artistUserId: string;
  /** Artwork value for this artist, before any deduction. */
  grossGbp: number;
  /** Venue revenue share taken from this artist's lines. */
  venueCutGbp: number;
  platformFeePercent: number;
  platformFeeGbp: number;
  /** Shipping attributed to this artist's group. Not fee-bearing. */
  shippingGbp: number;
  /** gross - venueCut - platformFee + shipping. What we transfer. */
  netGbp: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function buildArtistLegs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Pick<SupabaseClient<any, any, any>, "from">,
  input: {
    cartItems: CartLine[];
    /** artistSlug -> { id, revenue_share_percent }, from the placements lookup. */
    placementByArtistSlug: Map<string, { id: string; revenue_share_percent: number }>;
    /** artistSlug -> shipping pence, persisted on cart_sessions. */
    artistShippingPence: Record<string, number>;
  },
): Promise<ArtistLeg[]> {
  // 1. Aggregate artwork value per artist. Two lines from the same
  //    artist must become ONE leg: stripe_transfers is UNIQUE on
  //    (order_id, recipient_user_id).
  const grossBySlug = new Map<string, number>();
  for (const item of input.cartItems) {
    const slug = (item.artistSlug || "").toLowerCase();
    if (!slug) continue;
    const line = (item.price || 0) * Number(item.qty ?? item.quantity ?? 1);
    grossBySlug.set(slug, (grossBySlug.get(slug) ?? 0) + line);
  }
  const slugs = [...grossBySlug.keys()];
  if (slugs.length === 0) return [];

  // 2. One round trip for every artist's plan + user id.
  const { data: profiles, error } = await db
    .from("artist_profiles")
    .select("user_id, slug, subscription_plan, free_until")
    .in("slug", slugs);
  if (error) throw new Error(`buildArtistLegs: profile lookup failed: ${error.message}`);

  const bySlug = new Map(
    (profiles || []).map((p: { slug: string }) => [p.slug.toLowerCase(), p]),
  );

  // Every artist in the cart must resolve. A missing profile means we
  // cannot pay someone, which must abort the whole webhook rather than
  // silently pooling their money into another artist's leg.
  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    throw new Error(`buildArtistLegs: no artist_profiles rows for ${missing.join(", ")}`);
  }

  const legs: ArtistLeg[] = [];
  for (const slug of slugs) {
    const profile = bySlug.get(slug)! as {
      user_id: string; slug: string; subscription_plan: string | null; free_until: string | null;
    };
    const gross = round2(grossBySlug.get(slug) ?? 0);
    const venuePct = input.placementByArtistSlug.get(slug)?.revenue_share_percent ?? 0;
    const venueCut = round2(gross * (venuePct / 100));
    const feePct = platformFeePercentForArtist(profile) ?? DEFAULT_PLAN_FEE_PERCENT;
    const fee = round2(gross * (feePct / 100));
    const shipping = round2((input.artistShippingPence[slug] ?? 0) / 100);
    legs.push({
      artistSlug: slug,
      artistUserId: profile.user_id,
      grossGbp: gross,
      venueCutGbp: venueCut,
      platformFeePercent: feePct,
      platformFeeGbp: fee,
      shippingGbp: shipping,
      netGbp: round2(gross - venueCut - fee + shipping),
    });
  }
  return legs;
}

/** Throws unless the split reconciles exactly. Call before writing anything. */
export function assertLegsReconcile(args: {
  totalPence: number;
  venuePence: number;
  platformFeePence: number;
  legs: ArtistLeg[];
}): void {
  const legsPence = args.legs.reduce((s, l) => s + Math.round(l.netGbp * 100), 0);
  const sum = args.venuePence + args.platformFeePence + legsPence;
  if (sum !== args.totalPence) {
    throw new Error(
      `payout split does not reconcile: legs=${legsPence} venue=${args.venuePence} ` +
      `fee=${args.platformFeePence} sum=${sum} total=${args.totalPence}`,
    );
  }
}
```

## C3: Ledger write must throw

`src/lib/stripe-connect.ts:35-48` currently discards the insert error:

```ts
const { data: inserted } = await db
  .from("stripe_transfers")
  .insert({ ... })
  .select("id")
  .maybeSingle();
```

If that insert fails (missing column, RLS, connection blip), the function
returns normally and the caller believes the payout is scheduled. Nobody is ever
paid and there is no trace. This is E37's silent-vanish.

Replacement:

```ts
export interface ScheduleTransferParams {
  orderId: string;
  recipientType: "venue" | "artist";
  recipientUserId: string;
  connectAccountId: string;
  amountCents: number;
  immediate?: boolean;
}

export async function scheduleTransfer(params: ScheduleTransferParams): Promise<string> {
  const db = getSupabaseAdmin();

  if (!params.connectAccountId) {
    throw new Error(`scheduleTransfer: empty connectAccountId for order ${params.orderId}`);
  }
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error(`scheduleTransfer: bad amountCents ${params.amountCents} for order ${params.orderId}`);
  }

  const holdMs = params.immediate ? 0 : 14 * 24 * 60 * 60 * 1000;
  const payoutAfter = new Date(Date.now() + holdMs).toISOString();

  const { data: inserted, error } = await db
    .from("stripe_transfers")
    .insert({
      order_id: params.orderId,
      recipient_type: params.recipientType,
      recipient_user_id: params.recipientUserId,
      stripe_transfer_id: "",
      stripe_connect_account_id: params.connectAccountId,
      amount_cents: params.amountCents,
      status: "pending",
      payout_after: payoutAfter,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // UNIQUE (order_id, recipient_user_id), a replay. Return the
    // existing row's id so the caller's flow is unchanged.
    if ((error as { code?: string }).code === "23505") {
      const { data: existing } = await db
        .from("stripe_transfers")
        .select("id")
        .eq("order_id", params.orderId)
        .eq("recipient_user_id", params.recipientUserId)
        .maybeSingle();
      if (existing?.id) return existing.id;
    }
    // Anything else is a lost payout. The caller MUST NOT swallow this.
    throw new Error(
      `scheduleTransfer: ledger insert failed for order=${params.orderId} ` +
      `recipient=${params.recipientUserId}: ${error.message}`,
    );
  }
  if (!inserted?.id) {
    throw new Error(`scheduleTransfer: ledger insert returned no row for order ${params.orderId}`);
  }

  if (params.immediate) {
    try {
      await executeTransfer(inserted.id);
    } catch (err) {
      // The ledger row exists and stays pending; the sweep will retry.
      // Not fatal, unlike a missing row.
      console.error("[stripe-connect] immediate transfer execution failed:", err);
    }
  }
  return inserted.id;
}
```

Every call site must stop swallowing. In the webhook, `:669-671` and `:692-694`
currently `console.error` and continue. Replace with:

```ts
} catch (transferErr) {
  console.error("[webhook] payout scheduling failed", { orderId, transferErr });
  // The order is booked and the buyer charged. Returning 500 makes
  // Stripe retry; the D1 event dedup + D3 payment-intent check make the
  // retry a no-op for everything already written, and the UNIQUE index
  // makes the transfer insert idempotent. So a retry is safe and is the
  // only way an unpaid leg gets a second chance.
  return NextResponse.json({ error: "Payout scheduling failed" }, { status: 500 });
}
```

This ordering (order row first, then legs, then a 500 on failure) is only safe
once D1 and D3 are in. Sequence the tasks accordingly.

`recordBlockedLeg`, referenced in B2 and B3, is a small helper in the same file:

```ts
/** A payout we owe but cannot yet send. Written to the ledger as
 *  'blocked' so it appears in reconciliation instead of vanishing. */
export async function recordBlockedLeg(
  db: ReturnType<typeof getSupabaseAdmin>,
  args: { orderId: string; leg: { artistUserId: string; netGbp: number }; reason: string },
): Promise<void> {
  const { error } = await db.from("stripe_transfers").insert({
    order_id: args.orderId,
    recipient_type: "artist",
    recipient_user_id: args.leg.artistUserId,
    stripe_transfer_id: "",
    stripe_connect_account_id: "",
    amount_cents: Math.round(args.leg.netGbp * 100),
    status: "blocked",
    last_error: `payout_capability:${args.reason}`,
    payout_after: null,
  });
  if (error && (error as { code?: string }).code !== "23505") {
    throw new Error(`recordBlockedLeg failed: ${error.message}`);
  }
}
```

## C4: Retry sweep with `retry_count`

Today `processPendingTransfers` (`lib/stripe-connect.ts:101-146`) selects only
`status='pending'` and writes a terminal `'failed'` on any throw (`:138-141`).
A Stripe rate-limit or a 30-second network blip permanently kills the payout.
Nothing ever looks at `failed` rows again.

Migration `085_stripe_transfers_retry.sql`:

```sql
ALTER TABLE stripe_transfers
  ADD COLUMN IF NOT EXISTS retry_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error      TEXT,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- The status column has always been bare TEXT with no CHECK (mig 004).
-- Lock the vocabulary now that ops tooling depends on it.
UPDATE stripe_transfers
   SET status = 'pending'
 WHERE status NOT IN ('pending','paid','failed','cancelled','reversed','blocked');

ALTER TABLE stripe_transfers
  ADD CONSTRAINT stripe_transfers_status_check
  CHECK (status IN ('pending','paid','failed','cancelled','reversed','blocked'));

-- Sweep index: retryable work, cheapest first.
CREATE INDEX IF NOT EXISTS stripe_transfers_retryable_idx
  ON stripe_transfers(next_attempt_at)
  WHERE status IN ('pending','failed');

NOTIFY pgrst, 'reload schema';
```

New sweep:

```ts
const MAX_RETRIES = 6;
/** Exponential backoff in minutes: 1, 4, 15, 60, 240, 960 (16h). */
const BACKOFF_MINUTES = [1, 4, 15, 60, 240, 960];

export interface SweepResult {
  processed: number;
  retried: number;
  exhausted: number;
  errors: string[];
}

export async function processPendingTransfers(): Promise<SweepResult> {
  const db = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // Both 'pending' (never attempted, hold expired) and 'failed'
  // (attempted, transient error, backoff elapsed) are eligible.
  // `failed` is no longer terminal.
  const { data: due, error: selErr } = await db
    .from("stripe_transfers")
    .select("*")
    .in("status", ["pending", "failed"])
    .lt("retry_count", MAX_RETRIES)
    .lte("payout_after", nowIso)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("payout_after", { ascending: true })
    .limit(200);

  if (selErr) throw new Error(`transfer sweep select failed: ${selErr.message}`);
  if (!due || due.length === 0) return { processed: 0, retried: 0, exhausted: 0, errors: [] };

  const result: SweepResult = { processed: 0, retried: 0, exhausted: 0, errors: [] };

  for (const record of due) {
    try {
      const { data: order } = await db
        .from("orders")
        .select("status")
        .eq("id", record.order_id)
        .maybeSingle();
      // Placement payouts use a synthetic order_id ("placement:...") with
      // no orders row; a missing order is only a cancellation signal for
      // real order ids.
      if (order?.status === "cancelled" || order?.status === "refunded") {
        await db.from("stripe_transfers")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", record.id);
        continue;
      }

      await executeTransfer(record.id);
      result.processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextCount = (record.retry_count ?? 0) + 1;
      const exhausted = nextCount >= MAX_RETRIES;
      const backoff = BACKOFF_MINUTES[Math.min(nextCount - 1, BACKOFF_MINUTES.length - 1)];

      await db.from("stripe_transfers").update({
        // 'failed' is now a RETRYABLE state. Exhausted rows are the only
        // ones an operator has to look at.
        status: "failed",
        retry_count: nextCount,
        last_error: msg.slice(0, 500),
        next_attempt_at: new Date(Date.now() + backoff * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", record.id);

      result.errors.push(`Transfer ${record.id} (attempt ${nextCount}): ${msg}`);
      if (exhausted) {
        result.exhausted++;
        await alertExhaustedPayout(db, record, msg);   // admin email + bell
      } else {
        result.retried++;
      }
    }
  }
  return result;
}
```

`executeTransfer` must also accept `failed` rows, since it currently filters
`.eq("status", "pending")` at `:74`:

```ts
const { data: pending } = await db
  .from("stripe_transfers")
  .select("*")
  .eq("id", transferId)
  .in("status", ["pending", "failed"])
  .single();
```

Stripe idempotency already protects the retry: the key is
`transfer:${transferId}` (`:86`), stable across attempts, so a retry after a
timeout returns the original transfer rather than creating a second one. Keep
it exactly as is; that line is load-bearing.

## C5: The missing paid-loan webhook branches

Insert both into the consolidated webhook, before the generic art-purchase
branch.

```ts
// ─── Paid-loan monthly: subscription checkout completed ───
// Owns the session created by
// api/placements/[id]/payment/setup/route.ts. Without this branch the
// subscription is invisible to us: placements.stripe_subscription_id
// stays null, the dedup guard never fires, and
// cancelPaidLoanBilling can never find it (E7).
if (
  (event.type === "checkout.session.completed" ||
   event.type === "checkout.session.async_payment_succeeded") &&
  (event.data.object as Stripe.Checkout.Session).metadata?.kind === "paid_loan_monthly"
) {
  const session = event.data.object as Stripe.Checkout.Session;
  const placementId = session.metadata?.placement_id;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (!placementId || !subscriptionId) {
    console.error("[webhook] paid_loan_monthly session missing ids", { sessionId: session.id });
    return NextResponse.json({ error: "Malformed paid-loan session" }, { status: 400 });
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items?.data?.[0];
  const cpStart = item?.current_period_start ?? null;
  const cpEnd = item?.current_period_end ?? null;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const { data: placement, error: plErr } = await db
    .from("placements")
    .select("id, venue_user_id, artist_user_id, monthly_fee_gbp")
    .eq("id", placementId)
    .maybeSingle();
  if (plErr || !placement) {
    console.error("[webhook] paid_loan_monthly unknown placement", { placementId, plErr });
    return NextResponse.json({ error: "Unknown placement" }, { status: 500 });
  }

  // One ledger. Both the setup-route path and startPaidLoanBilling now
  // land in placement_recurring_billings, so cancellation, invoice
  // reconciliation and the portal all read one table.
  const { error: billErr } = await db
    .from("placement_recurring_billings")
    .upsert(
      {
        placement_id: placementId,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerId,
        payer_user_id: placement.venue_user_id,
        payee_user_id: placement.artist_user_id,
        monthly_amount_pence: Math.round(Number(placement.monthly_fee_gbp) * 100),
        status: "active",
        current_period_start: cpStart ? new Date(cpStart * 1000).toISOString() : null,
        current_period_end: cpEnd ? new Date(cpEnd * 1000).toISOString() : null,
      },
      { onConflict: "stripe_subscription_id" },
    );
  if (billErr) {
    console.error("[webhook] placement_recurring_billings upsert failed", billErr);
    return NextResponse.json({ error: "Billing record write failed" }, { status: 500 });
  }

  // Mirror onto placements so the dedup guard in the setup route
  // (payment/setup/route.ts:41) finally works, and the venue portal can
  // read the state without a join.
  const { error: mirrorErr } = await db
    .from("placements")
    .update({
      stripe_subscription_id: subscriptionId,
      subscription_status: "active",
      subscription_current_period_end: cpEnd ? new Date(cpEnd * 1000).toISOString() : null,
    })
    .eq("id", placementId);
  if (mirrorErr) console.error("[webhook] placement subscription mirror failed", mirrorErr);

  await createNotification({
    userId: placement.artist_user_id,
    kind: "paid_loan_started",
    title: `Monthly loan payments started, £${Number(placement.monthly_fee_gbp).toFixed(2)}/mo`,
    body: "The venue's card is set up. Your first payout follows the first paid invoice.",
    link: "/artist-portal/placements",
  }).catch(() => {});

  return NextResponse.json({ received: true });
}

// ─── Setup Intent succeeded: the venue just attached a card ───
// paid-loan-billing.ts:178-183 documents that the flow is re-invoked
// here. There was no such branch, so a paid-loan placement whose venue
// had no card on file went active and never billed (E7d).
if (event.type === "setup_intent.succeeded") {
  const si = event.data.object as Stripe.SetupIntent;
  const placementId = si.metadata?.placement_id;
  const venueUserId = si.metadata?.venue_user_id;
  if (si.metadata?.source !== "wallplace_paid_loan_billing" || !placementId || !venueUserId) {
    return NextResponse.json({ received: true, ignored: "not_paid_loan" });
  }

  // Make the new card the customer's default so the subscription can
  // charge it off-session.
  const customerId = typeof si.customer === "string" ? si.customer : si.customer?.id;
  const pmId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  if (customerId && pmId) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pmId },
    });
  }

  const { data: placement } = await db
    .from("placements")
    .select("id, venue_user_id, artist_user_id, arrangement_type, monthly_fee_gbp")
    .eq("id", placementId)
    .maybeSingle();
  if (!placement) {
    console.error("[webhook] setup_intent for unknown placement", { placementId });
    return NextResponse.json({ received: true, ignored: "unknown_placement" });
  }

  const result = await startPaidLoanBilling({
    placementId,
    venueUserId: placement.venue_user_id,
    artistUserId: placement.artist_user_id,
    arrangementType: placement.arrangement_type,
    monthlyFeePence: Math.round(Number(placement.monthly_fee_gbp) * 100),
  });

  if (result.status !== "started" && result.status !== "already_started") {
    // The card is attached but billing still did not start. This is a
    // silent revenue hole; make it loud.
    console.error("[webhook] setup_intent succeeded but billing did not start", {
      placementId, status: result.status,
    });
    await notifyAdminBillingStalled({ placementId, status: result.status });
  }

  return NextResponse.json({ received: true, billing: result.status });
}
```

Migration `086_placements_subscription_columns.sql` is not needed: the columns
exist already (`025_placements_stripe_subscription.sql:8-11`). Verify the exact
names (`stripe_subscription_id`, `subscription_status`,
`subscription_current_period_end`) against that file before landing; the
subagent read confirms all three exist and none are written today.

---

# (D) The `test:transactions` suite

Goal: a single command that proves all ten routes move the right money to the
right people, exactly once, and fail cleanly when they cannot.

```jsonc
// package.json
"test:transactions": "vitest run --config vitest.transactions.config.ts",
"test:transactions:watch": "vitest --config vitest.transactions.config.ts"
```

```ts
// vitest.transactions.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(base, defineConfig({
  test: {
    include: ["tests/transactions/**/*.test.ts"],
    // Money tests never share state.
    poolOptions: { threads: { singleThread: true } },
    setupFiles: ["tests/transactions/_setup.ts"],
  },
}));
```

Add to `"check"`: `npm run lint && npm run typecheck && npm run test && npm run test:transactions`.

## D.1: Harness

Three pieces, all new, under `tests/transactions/_harness/`.

**`db.ts`, a recording fake Supabase.** The existing webhook test already
hand-rolls a `fromMock` chain (`src/app/api/webhooks/stripe/route.test.ts:1-90`).
Promote that into a reusable in-memory store so assertions read as table
queries, not as call-order archaeology.

```ts
// tests/transactions/_harness/db.ts
export interface FakeDb {
  seed(table: string, rows: Record<string, unknown>[]): void;
  rows(table: string): Record<string, unknown>[];
  /** Force the next operation on `table` to fail with this Postgres code. */
  failNext(table: string, op: "insert" | "update" | "select", code: string, message?: string): void;
  client: unknown;   // shape-compatible with getSupabaseAdmin()
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
}
export function makeDb(): FakeDb { /* ... */ }
```

It must honour UNIQUE `(order_id, recipient_user_id)` on `stripe_transfers` and
the `orders.id` primary key, returning code `23505`, because three of the
idempotency assertions depend on that behaviour.

**`stripe.ts`, a recording fake Stripe.** Records every call with its
idempotency key so tests can assert "one subscription, not two".

```ts
export interface FakeStripe {
  calls: Array<{ method: string; args: unknown[]; idempotencyKey?: string }>;
  transfers: Array<{ amount: number; destination: string; transfer_group: string }>;
  refunds: Array<{ payment_intent: string; amount?: number }>;
  /** Queue an error for the next call to `method`. */
  failNext(method: string, err: Error): void;
  client: unknown;
}
```

**`events.ts`, Stripe event fixtures.** Typed builders so every test drives a
realistic payload, including the SDK-22 shapes
(`invoice.parent.subscription_details.subscription`,
`subscription.items.data[0].current_period_end`) that
`paid-loan-billing.ts:75-95` already has to tolerate.

```ts
export function checkoutSessionCompleted(over: Partial<Stripe.Checkout.Session> & {
  metadata?: Record<string, string>;
}): Stripe.Event;
export function invoicePaid(over: { subscriptionId: string; amountPaid: number; billingReason?: string }): Stripe.Event;
export function invoicePaymentFailed(over: { subscriptionId: string; nextAttempt: number | null }): Stripe.Event;
export function subscriptionDeleted(over: { id: string; customer: string }): Stripe.Event;
export function setupIntentSucceeded(over: { placementId: string; venueUserId: string; customer: string; paymentMethod: string }): Stripe.Event;
export function accountUpdated(over: { id: string; chargesEnabled: boolean; payoutsEnabled: boolean; currentlyDue?: string[] }): Stripe.Event;
export function payoutPaid(over: { account: string; amount: number }): Stripe.Event;
export function transferReversed(over: { transferId: string }): Stripe.Event;
```

**Shared assertion helper** (used by every route file):

```ts
// tests/transactions/_harness/assert-money.ts
export function assertSplitsToThePenny(db: FakeDb, orderId: string): void {
  const order = db.rows("orders").find((o) => o.id === orderId)!;
  const legs = db.rows("stripe_transfers").filter((t) => t.order_id === orderId && t.status !== "cancelled");
  const totalPence = Math.round(Number(order.total) * 100);
  const feePence = Math.round(Number(order.platform_fee) * 100);
  const legsPence = legs.reduce((s, l) => s + Number(l.amount_cents), 0);
  expect(legsPence + feePence).toBe(totalPence);
}
```

## D.2: Per-route test files and assertions

### `tests/transactions/t1-buy-now-single.test.ts`

Drive: `checkout.session.completed`, `mode: "payment"`, `payment_status: "paid"`,
`amount_total: 19450`, cart of one £180 work by `maya-chen` (Core), shipping
£14.50, no venue.

| # | Assertion |
| --- | --- |
| 1 | Exactly one `orders` row; `subtotal` 180, `shipping_cost` 14.5, `total` 194.5 |
| 2 | `platform_fee` 27.00, `platform_fee_percent` 15, `venue_revenue` 0, `artist_revenue` 131.50 |
| 3 | Exactly one `stripe_transfers` row, `amount_cents` 13150, `recipient_type` `"artist"`, `status` `"pending"`, `payout_after` within 14d ± 1min |
| 4 | `assertSplitsToThePenny` |
| 5 | `decrement_work_stock` RPC called once with `{ p_work_id, p_qty: 1 }` |
| 6 | Emails: `customer_order_receipt`, `artist_work_sold`, `artist_order_confirmation`, each exactly once, with distinct `idempotencyKey`s |
| 7 | **Redelivery**: replay the identical event. Zero new rows in `orders` and `stripe_transfers`, zero new `sendEmail` calls, response `{ duplicate: true }` |
| 8 | **Redelivery with a different event id but same payment intent**: still zero new rows (the D3 payment-intent check) |
| 9 | **Precondition failure**: `canReceivePayout` returns `payouts_disabled`. One `stripe_transfers` row with `status: "blocked"` and `last_error` containing `payouts_disabled`; zero `stripe.transfers.create` calls; order still booked |
| 10 | **Artist profile lookup fails**: `db.failNext("artist_profiles", "select", "PGRST116")`. Response is 500, zero `orders` rows. Regression test for D4 |
| 11 | **`payment_status: "unpaid"`**: zero `orders` rows, response 200 `{ ignored: "unpaid" }` |
| 12 | **Collection variant**: `fulfilmentMethod: "collection"` → order `status: "delivered"`, `delivered_at` set, transfer `payout_after <= now`, `stripe.transfers.create` called once inline |

### `tests/transactions/t2-buy-now-multi.test.ts`

Drive: cart with A (`pro-artist`, Pro/5%) £300 and B (`core-artist`, Core/15%)
£120; active placement at both, 20%; shipping A £14.50, B £5.50;
`amount_total: 44000`.

| # | Assertion |
| --- | --- |
| 1 | Exactly **three** `stripe_transfers` rows |
| 2 | venue leg `amount_cents` 8400 |
| 3 | A's leg 23950 (£239.50), B's leg 8350 (£83.50) |
| 4 | `orders.platform_fee` 33.00 (not 21.00). Regression test for E9 |
| 5 | `assertSplitsToThePenny`: 8400 + 23950 + 8350 + 3300 = 44000 |
| 6 | **Same artist twice**: cart of two lines both by A. Exactly **one** leg for A, amount = the sum. Proves the aggregation, and that the UNIQUE index is not being relied on to hide a bug |
| 7 | **Rounding**: three artists at £33.33 each with a 15% fee. Legs + fee sum exactly to `amount_total`; drift is on the fee |
| 8 | **One artist blocked**: A payable, B `payouts_disabled`. A's leg `pending`, B's leg `blocked`, venue leg `pending`, order still booked |
| 9 | **Unknown artist slug in the cart**: `buildArtistLegs` throws, response 500, zero `orders` rows |
| 10 | **Redelivery**: three legs, not six |

### `tests/transactions/t3-offer.test.ts`

Drive: accepted offer, `amount_pence: 240000`, artist on Core.

| # | Assertion |
| --- | --- |
| 1 | `POST /api/offers/[id]/checkout` on a `pending` offer → 409, no Stripe call |
| 2 | Non-buyer caller → 403, no Stripe call |
| 3 | Artist not payable → 422, **no Stripe session created**. Money is never taken for an unpayable artist |
| 4 | Work already sold → 409 `code: "work_sold"`, offer flipped to `expired` (D7) |
| 5 | Happy path: session metadata carries `offer_platform_fee_pence: "36000"` and `offer_artist_net_pence: "204000"` |
| 6 | Webhook: `purchase_offers.status = "paid"`, `paid_order_id` set |
| 7 | `orders` row has `platform_fee` 360.00, `artist_revenue` 2040.00, `venue_revenue` 0. Regression for E6 |
| 8 | Exactly one `stripe_transfers` row, 204000 pence, `recipient_type: "artist"` |
| 9 | `decrement_work_stock` called once per work id on the offer. Regression for E10 |
| 10 | Emails: buyer receipt + both artist emails, same three as T1 |
| 11 | `assertSplitsToThePenny` |
| 12 | **Redelivery**: one order, one leg, one set of emails |

### `tests/transactions/t4-placement.test.ts`

| # | Assertion |
| --- | --- |
| 1 | `PATCH pending → active` on a `free_loan` placement: zero Stripe calls, zero `stripe_transfers`, zero `placement_recurring_billings` |
| 2 | Revenue-share placement: `revenue_share_percent` persisted, `placed_at_venue` + `current_placement_id` stamped on the work |
| 3 | `revenue_share_percent: 150` rejected by the CHECK (D9) |
| 4 | `active → completed` calls `cancelPaidLoanBilling` (D8) |
| 5 | `active → sold` calls `cancelPaidLoanBilling` (D8) |
| 6 | `active → cancelled` calls it too (existing behaviour, do not regress) |
| 7 | Stage `collected` clears `placed_at_venue` and `current_placement_id` |
| 8 | Two active placements for the same artist+venue: insert rejected by `placements_active_uniq` |

### `tests/transactions/t5-qr-sale.test.ts`

| # | Assertion |
| --- | --- |
| 1 | `GET /api/qr/[slug]?vs=copper-kettle` redirects with a `va` token; `verifyQrAttribution` round-trips the venue and artist slugs |
| 2 | A token for artist X does not attribute when the cart contains only artist Y: `orders.venue_slug` is null, venue leg absent |
| 3 | A tampered token (last char flipped) is rejected; checkout still succeeds with `venue_slug: null` |
| 4 | An expired token (exp in the past) is rejected |
| 5 | Valid token + active placement at 20% on a £250 work: venue leg 5000 pence, artist leg computed net |
| 6 | Placement `status: "pending"`: venue cut 0, a `console.warn` is emitted (D11), artist keeps the full net |
| 7 | Venue Connect not `payouts_enabled`: venue leg `blocked`, artist leg `pending` |
| 8 | Collection-fulfilment QR sale: both legs `immediate`, `stripe.transfers.create` called twice inline |
| 9 | **Regression for the raw-slug bypass**: a request body carrying `venueSlug: "copper-kettle"` with **no** token produces `venue_slug: null` once the flag is on |

### `tests/transactions/t6-paid-loan.test.ts`

| # | Assertion |
| --- | --- |
| 1 | Setup route on a placement with an existing live billing row → 409, zero Stripe calls (E7b) |
| 2 | Setup route with an unpayable artist → 422, zero Stripe calls (E8) |
| 3 | Two rapid setup calls in the same hour use the **same** `idempotencyKey`; the fake Stripe returns one session (E7b) |
| 4 | `checkout.session.completed` with `kind: "paid_loan_monthly"`: one `placement_recurring_billings` row, `status: "active"`, correct `payer_user_id` / `payee_user_id`, `monthly_amount_pence` 12000 (C5) |
| 5 | Same event: `placements.stripe_subscription_id` written (E7a regression) |
| 6 | `invoice.paid` £120, artist on Premium: one `stripe_transfers` row, 11040 pence, `order_id` `placement:<id>:<invoiceId>` |
| 7 | Replay the same `invoice.paid`: still one row (the pre-insert check at `paid-loan-billing.ts:438-446` plus the UNIQUE index) |
| 8 | `invoice.payment_failed` with `next_payment_attempt: 12345` → `past_due`; with `null` → `paused`. **With `PAID_LOAN_V2` off** these must still run (E11 regression) |
| 9 | `customer.subscription.deleted` → `cancelled` |
| 10 | `setup_intent.succeeded` with `source: "wallplace_paid_loan_billing"`: `stripe.customers.update` sets the default PM, then `startPaidLoanBilling` is invoked and a subscription is created (E7d regression) |
| 11 | `cancelPaidLoanBilling` on a placement whose subscription came from the **setup route** (not `startPaidLoanBilling`) finds the row and calls `subscriptions.update({ cancel_at_period_end: true })`. This is the E7 headline: it must pass |
| 12 | `period_end` absent on the subscription item → `current_period_end` is `null`, never `1970-01-01` (E11b) |

### `tests/transactions/t7-subscription.test.ts`

| # | Assertion |
| --- | --- |
| 1 | `customer.subscription.created` with `STRIPE_PRICE_PRO` → `subscription_plan: "pro"`; `platformFeePercentForArtist` then returns 5 |
| 2 | Unrecognised price id → **no** profile write, response `{ ignored: "unknown_price" }`. Regression for D12 |
| 3 | `current_period_end` missing → `subscription_period_end: null` (E11b) |
| 4 | Plan change core → premium sends exactly one `subscription_upgraded` |
| 5 | Same event replayed: zero additional emails (idempotency key includes the plan) |
| 6 | Referral: two concurrent `subscription.created` for the same referred artist credit the referrer **once**; `extend_free_until` RPC called once (D14) |
| 7 | `free_until` in the future → fee 0 |
| 8 | Stale `customer.subscription.deleted` (upgrade race): profile untouched **and** `handleSubscriptionDeletedPaidLoan` still invoked. Regression for D13 |
| 9 | A subscription carrying `metadata.kind: "paid_loan_monthly"` does **not** touch `artist_profiles` (D15) |
| 10 | `invoice.paid` with `billing_reason: "subscription_cycle"` → one `subscription_renewal_receipt`; with `"subscription_create"` → none |

### `tests/transactions/t8-refunds.test.ts`

| # | Assertion |
| --- | --- |
| 1 | Full refund on a £194.50 order with one paid transfer of 13150: `createReversal` called with 13150, then `refunds.create` with no `amount` |
| 2 | Reversal fails → 502, `refunds.create` **never called**, claim released to `pending` |
| 3 | Partial £90 refund on subtotal £180 / shipping £14.50 with an artist leg of 13150: reversal amount = round(13150 × 90/180) = 6575. Not the old 13150 × 90/194.50 = 6086. Regression for D16 |
| 4 | Partial refund exceeding `order.total` → 400 |
| 5 | Two concurrent approvals: the second gets 409 and makes zero Stripe calls (`claimPending`) |
| 6 | Artist self-approving an artist-initiated refund → 403 |
| 7 | Pending transfers are set `cancelled`, not reversed; `createReversal` not called for them |
| 8 | Full refund calls `restock_work` once per item (D17) |
| 9 | Partial refund does **not** restock |
| 10 | Refund on a multi-artist order reverses **every** leg; a partial reverses each pro rata and the sum never exceeds the refund |
| 11 | Refund of an offer order (T3): the artist leg is reversed. Fails today because no leg exists; passes after E6 |

### `tests/transactions/t9-collect-venue.test.ts`

| # | Assertion |
| --- | --- |
| 1 | The CTA renders only when `currentPlacement.status === "active"` **and** the selected size matches `placedSizeLabel` (N1). Component test with React Testing Library |
| 2 | The cart line carries `lineFulfilment: "collect_venue"`, `collectVenueSlug`, `collectPlacementId` (N2) |
| 3 | Checkout preselects `collect_venue` when every line is a collect line; stays `ship` for a mixed cart |
| 4 | `POST /api/checkout` with a `collectPlacementId` whose placement is not `active` → 409 `collection_unavailable` |
| 5 | Placement belongs to a different venue than claimed → 409 |
| 6 | Size mismatch → 409 `collection_size_mismatch` |
| 7 | Two different venues in one collect cart → 400 |
| 8 | Happy path: no shipping line item on the Stripe session; order `fulfilment_method: "collect_venue"`, `collection_address` populated, `status: "delivered"`, both legs `immediate` |
| 9 | Venue gets a `collection_pending` bell and email |

### `tests/transactions/t10-curation.test.ts`

| # | Assertion |
| --- | --- |
| 0 | **Every key of `TIERS` in `api/curation/route.ts` is present in the `curation_requests_tier_check` constraint**, read from the checked-in schema. Regression for D25. This test must exist before any new tier is added again |
| 1 | `single_wall` creates a `mode: "payment"` session with `unit_amount: 4900`; `curation_requests.status: "pending_payment"` |
| 2 | Client-supplied price is ignored: posting `{ tier: "single_wall", priceGbp: 1 }` still charges 4900 |
| 3 | `bespoke` creates **no** Stripe session, status `awaiting_quote`, enquiry email sent |
| 4 | Managed tier with the env price unset → 503 and the row is deleted (no orphan) |
| 5 | Managed tier where the Stripe price interval does not match the tier → 503, row deleted (D22) |
| 6 | **Session created, DB link update fails**: the row is **retained**, the response still returns the URL, and a later `checkout.session.completed` finds the row and marks it paid. Regression for D19 |
| 7 | Webhook one-off: status `paid`, `stripe_payment_intent_id` set, `stripe_subscription_id` **null** |
| 8 | Webhook managed: status `in_progress`, `stripe_subscription_id` set, `stripe_payment_intent_id` **null**. Regression for D20 |
| 9 | Customer `notifyCurationCustomerPaid` sent once; admin `notifyAdminCurationPaid` sent once (D23) |
| 10 | Replay: no second status write, no second email |
| 11 | `invoice.paid` on a curation subscription → `last_invoice_paid_at` set, renewal receipt sent on `subscription_cycle` only (D21) |
| 12 | `customer.subscription.deleted` on a curation subscription → status `cancelled`, `cancelled_at` set, admin notified (D21) |
| 13 | `invoice.payment_failed`, final attempt → `paused` (D21) |
| 14 | A curation subscription event does **not** write `artist_profiles` (D15) |
| 15 | `payment_status: "unpaid"` → no status flip, no emails |

### `tests/transactions/primitives.test.ts`

Covers C1..C4 directly.

| # | Assertion |
| --- | --- |
| 1 | `canReceivePayout`: empty-string account id → `no_account` (the mig-004 `DEFAULT ''` trap) |
| 2 | `charges_enabled: true, payouts_enabled: false` → `payouts_disabled`. This is E38's core case |
| 3 | Stripe `accounts.retrieve` throws → `stripe_unavailable`, `ok: false`. Fails closed |
| 4 | Fresh cache (< 60s) skips the Stripe call entirely |
| 5 | `account.updated` writes both booleans on both tables |
| 6 | `scheduleTransfer` with a DB error **throws** and does not return. Regression for E37 |
| 7 | `scheduleTransfer` on a 23505 returns the existing row id and does not throw |
| 8 | `scheduleTransfer` with `amountCents: 0` throws |
| 9 | Sweep: a `failed` row with `retry_count: 2` and an elapsed `next_attempt_at` **is** picked up |
| 10 | Sweep: a `failed` row with `retry_count: 6` is **not** picked up and is counted as exhausted |
| 11 | Sweep: backoff sequence 1, 4, 15, 60, 240, 960 minutes |
| 12 | Sweep: an exhausted row triggers the admin alert exactly once |
| 13 | Sweep: a transient failure then a success leaves `status: "paid"` and `retry_count: 1` |
| 14 | `executeTransfer` passes `idempotencyKey: transfer:<id>` on every attempt, including retries |
| 15 | `buildArtistLegs` + `assertLegsReconcile` on 500 randomised carts (fast-check or a seeded loop): the invariant never breaks |

## D.3: What "clean failure" means

Every route's failure tests assert the same three properties:

1. **No partial money movement.** If a precondition fails, either nothing was
   charged, or a charge happened and a ledger row exists recording exactly what
   is owed and to whom. Never a charge with no record.
2. **The correct HTTP code.** 409 for a state conflict, 422 for an unmet
   business precondition, 502 for a downstream Stripe failure, 500 only for our
   own bugs. Stripe webhook failures return 500 so Stripe retries; a deliberate
   ignore returns 200 with an `ignored` field.
3. **Retry safety.** Every failure path is replayed once more in the test and
   must converge on the same end state.

---

# (E) Ordered task checklist

Sequencing matters: the primitives and the idempotency floor must land before
anything that returns 500 to force a Stripe retry, otherwise a retry duplicates
work.

### Phase 0: Floor (nothing else is safe without these)

- [ ] **0.1** Migration `074_stripe_webhook_events.sql`; add the global event
      dedup guard at the top of the webhook (D1).
- [ ] **0.2** Add `isSettled()` and gate all three `checkout.session.completed`
      branches on `payment_status === "paid"`; add
      `checkout.session.async_payment_succeeded` / `_failed` / `expired`
      branches (D1).
- [ ] **0.3** Delete `POST /api/orders` (D2). Grep for callers first.
- [ ] **0.4** Widen the order id and fix the 23505 collision check (D3).
- [ ] **0.5** Consolidate the duplicated `event.type` branches: one
      `customer.subscription.deleted`, one `invoice.paid`, one
      `invoice.payment_failed`, one `checkout.session.completed` router. Remove
      the early `return` at `:903` (D13).
- [ ] **0.6** `tests/transactions/_harness/**` + `vitest.transactions.config.ts`
      + the `test:transactions` script; wire into `npm run check`.

### Phase 1: Shared primitives

- [ ] **1.1** Migration `084_payouts_enabled_columns.sql`; build
      `src/lib/payouts/capability.ts` (C1); update the `account.updated` branch
      to keep the cache warm.
- [ ] **1.2** Replace `canArtistAcceptOrders` at `api/checkout/route.ts:282`;
      port `stripe-connect-status.test.ts`; delete the old module.
- [ ] **1.3** `scheduleTransfer` must throw (C3); add `recordBlockedLeg`; update
      every call site to stop swallowing.
- [ ] **1.4** Migration `085_stripe_transfers_retry.sql`; rewrite
      `processPendingTransfers` with `retry_count` and backoff; widen
      `executeTransfer` to accept `failed` (C4); add the exhausted-payout admin
      alert.
- [ ] **1.5** Migration `075_decrement_work_stock.sql` (+ `restock_work`);
      replace the read-modify-write decrement (D5).
- [ ] **1.6** `tests/transactions/primitives.test.ts` green.

### Phase 2: T1 and T2 (the highest-volume routes)

- [ ] **2.1** Fix the `.single()` artist lookup (D4).
- [ ] **2.2** Split `strippableCols` from `REQUIRED_MONEY_COLS` (D6).
- [ ] **2.3** Migration `076_cart_sessions_artist_shipping.sql`; persist
      per-artist shipping from `calculateOrderShipping`.
- [ ] **2.4** Build `src/lib/payouts/legs.ts` (C2).
- [ ] **2.5** Replace the single-fee / pooled-remainder / single-transfer code
      in the webhook with the leg loop (E9).
- [ ] **2.6** `t1-buy-now-single.test.ts` and `t2-buy-now-multi.test.ts` green.

### Phase 3: T3 offers (highest financial risk)

- [ ] **3.1** Extract `sendOrderConfirmations` from the cart branch into
      `src/lib/orders/confirmations.ts`; re-point the cart branch at it.
- [ ] **3.2** Compute the split in `offers/[id]/checkout/route.ts`; add the
      `canReceivePayout` pre-flight and the stock re-validation (E6, D7).
- [ ] **3.3** Rewrite the offer webhook branch: full order row, stock
      decrement, artist transfer, confirmations (E6, E10).
- [ ] **3.4** `t3-offer.test.ts` green.

### Phase 4: T6 paid loan

- [ ] **4.1** Delete the destination-charge path from
      `payment/setup/route.ts` (`transfer_data`, `application_fee_percent`);
      keep the subscription session, add the idempotency key and the real dedup
      guard (E7b).
- [ ] **4.2** Gate the setup route on `canReceivePayout`; rewrite the
      `PaymentClient.tsx` warning copy and disable the button (E8).
- [ ] **4.3** Add the `paid_loan_monthly` checkout branch and the
      `setup_intent.succeeded` branch (C5, E7a, E7d).
- [ ] **4.4** Migration `078_placement_recurring_billings_placement_uniq.sql`;
      fix the upsert conflict target (E7c).
- [ ] **4.5** Remove the `PAID_LOAN_V2` check from `handleInvoicePaid`,
      `handleInvoicePaymentFailed`, `handleSubscriptionDeleted` and
      `cancelPaidLoanBilling`; keep it on `startPaidLoanBilling` (E11).
- [ ] **4.6** Fix the epoch period-end stamps at `:722` and `:766` (E11b).
- [ ] **4.7** `t6-paid-loan.test.ts` green, run twice: flag on and flag off.
- [ ] **4.8** Flip `PAID_LOAN_V2.prodDefault` to `true`.

### Phase 5: T7 subscriptions and T8 refunds

- [ ] **5.1** `PRICE_TO_PLAN` map; refuse unknown price ids; add the env
      assertion to `src/env.ts` (D12).
- [ ] **5.2** Scope the subscription handler by `metadata.kind` (D15).
- [ ] **5.3** Migration `079_extend_free_until.sql`; make the referral credit
      atomic (D14).
- [ ] **5.4** Fix the partial-reversal denominator (D16).
- [ ] **5.5** Restock on full refund (D17).
- [ ] **5.6** `t7-subscription.test.ts` and `t8-refunds.test.ts` green.

### Phase 6: T4, T5 placements and QR

- [ ] **6.1** Widen `goingCancelled` to `completed` and `sold` (D8).
- [ ] **6.2** Migration `077_placement_revenue_share_bounds.sql`; make the
      webhook placement lookup deterministic (D9).
- [ ] **6.3** `src/lib/qr-attribution-token.ts`; mint in `/api/qr/[slug]`, carry
      in `qr-context`, verify in `/api/checkout`, behind
      `QR_TOKEN_ATTRIBUTION` (D10).
- [ ] **6.4** Log the no-active-placement case (D11).
- [ ] **6.5** `t4-placement.test.ts` and `t5-qr-sale.test.ts` green.
- [ ] **6.6** After one release with both paths live, remove the raw-`venueSlug`
      fallback and the flag.

### Phase 7: T10 curation

**Pull 7.0 forward to Phase 0 if the production constraint check confirms the
managed tiers are genuinely rejected. That is a live revenue outage on two
advertised products, not a latent bug.**

- [ ] **7.0** Run the `pg_constraint` query in D25 against production. If the
      managed tiers are rejected, apply
      `083_curation_requests_tiers_and_statuses.sql` immediately and add the
      code-vs-schema tier test (D25).
- [ ] **7.1** Restructure the error path so a row with a live session is never
      deleted (D19).
- [ ] **7.2** Migration `082_curation_requests_subscription.sql`; split the id
      columns (D20).
- [ ] **7.3** `src/lib/curation/billing.ts` with the three handlers; wire into
      the consolidated webhook branches (D21).
- [ ] **7.4** Validate the Stripe price against the tier at session creation
      (D22).
- [ ] **7.5** `notifyAdminCurationPaid` + `notifyAdminCurationCancelled`;
      `CurationRenewalReceipt` template (D23).
- [ ] **7.6** Make `/curated/success` verify the session (D24).
- [ ] **7.7** `t10-curation.test.ts` green.

### Phase 8: T9 collect from venue (new feature)

- [ ] **8.1** Migration `080_placement_placed_size.sql`; capture
      `placed_size_label` and `collection_address` at placement accept.
- [ ] **8.2** Surface `currentPlacement` on the transformed work; gate the CTA
      on an active placement and a matching size (N1).
- [ ] **8.3** Widen `checkoutItemSchema` and add the `collect_venue` branch to
      `checkoutSchema` (N2).
- [ ] **8.4** Migration `081_orders_fulfilment_collect_venue.sql`; server-side
      re-validation in `/api/checkout`; third tile on the checkout page.
- [ ] **8.5** Webhook: treat `collect_venue` as immediate-payout, populate
      `orders.collection_address`.
- [ ] **8.6** `VenueCollectionPending` email + bell.
- [ ] **8.7** `t9-collect-venue.test.ts` green.

### Phase 9: Close out

- [ ] **9.1** Full `npm run check` plus `npm run test:transactions`.
- [ ] **9.2** Stripe CLI replay against a preview deployment: drive every event
      in the fixture set at a live test-mode endpoint and diff the resulting DB
      state against the unit-test expectations.
- [ ] **9.3** Reconciliation report: a script that sums
      `orders.total` against `stripe_transfers` + `orders.platform_fee` for a
      date range and fails on any penny of drift. Run it in CI nightly.
- [ ] **9.4** Resolve every **UNCONFIRMED** marker in this document.

---

## Open questions requiring a decision before Phase 4 and Phase 7

1. **VAT.** Nothing in the codebase computes or collects it, yet order emails
   render a VAT row (`emails/_components/OrderSummary.tsx:74`) and the placement
   request form shows "incl. VAT" (`components/SpacesPlacementRequestForm.tsx:852`).
   If Wallplace is VAT-registered this is a compliance problem across all ten
   routes and needs its own plan.
2. **Stripe API version.** `src/lib/stripe.ts:3-5` pins no `apiVersion`, so the
   account default applies. A dashboard-side version bump would silently change
   the invoice and subscription shapes that `paid-loan-billing.ts:75-95` reads.
   Pin it explicitly.
3. **Shipping is not fee-bearing.** `webhooks/stripe/route.ts:265-267` gives the
   artist 100% of shipping. That is a deliberate choice and D16 depends on it
   staying true. Confirm before changing the fee model.
4. **Blocked payouts.** When `canReceivePayout` fails after a charge, money sits
   on the platform balance with a `blocked` ledger row. Who chases it, on what
   cadence, and is there an auto-release when `account.updated` later reports
   `payouts_enabled: true`? Recommended: an `account.updated` hook that sweeps
   `blocked` legs for that account back to `pending`.
