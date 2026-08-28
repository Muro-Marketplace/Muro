# 5. Production data reconciliation

Forensic reconciliation of the production database (Supabase project `uwkuhygwvasdzwsusiym`) against the money semantics in the codebase, run 2026-08-28. Read-only: every query was a SELECT. Population: 16 orders, 6 stripe_transfers, 2 refund_requests, 87 placements (28 paid_loan), 1 placement_recurring_billings, 311 email_events, 2 curation_requests, 18 cart_sessions, 10 stripe_webhook_events, 26 order_events.

Code reference for the intended identities: `src/lib/payouts/legs.ts` (`assertLegsReconcile`: venue_revenue + platform_fee + artist legs net = total, where each leg's net includes its shipping; and subtotal + shipping = total), `src/lib/orders/lifecycle.ts` + `src/lib/email/dispatcher.ts` (email idempotency key `{orderId}:order.placed:{template}`), `src/lib/orders/confirmations.ts` (`venue_sale_from_placement:{orderId}`).

## 1. Order arithmetic

**Intent.** For all 16 orders: does `subtotal + shipping_cost = total`, and does `artist_revenue + venue_revenue + platform_fee = total` (the `assertLegsReconcile` identity, since legs net includes shipping)?

**Result.**
- `subtotal + shipping_cost = total`: holds on **16 of 16** orders (after rounding to the penny).
- `artist_revenue + venue_revenue + platform_fee = total`: holds on **15 of 16**. The failure is **WS-P06DDkUs** (2026-05-17, status confirmed, paid, £64.49 total): artist_revenue 0, venue_revenue 0, platform_fee 0, delta **-64.49**. The row has `artist_slug` NULL and `artist_user_id` NULL. Its single item ("Mt. Fitz Roy", £49.99, artistName "Finlay Coles") carries **no `artistSlug` key**, so the legacy webhook could not attribute the sale and zeroed the whole split. The image path identifies the artist as user `08f9481e-2785-4ce9-a184-8042905036d1` (fin-coles). Under the fee convention of that era (15% of subtotal, shipping passthrough) the artist is owed about **£56.99**; the books currently show £0 owed to anyone and the full £64.49 implicitly with the platform.
- Hygiene: several numeric money columns carry JS float noise, e.g. total `169.89999999999998` (WS-q0g0tqwD), shipping_cost `14.499999999999993`, subtotal `99.97999999999999`. Rounds clean at 2 dp but pollutes exact-match SQL and CSV exports.
- Two fee conventions visible in history: the oldest order (WS-q0g0tqwD) charged 15% on total including shipping; every later order charges the fee on subtotal only with shipping passed through. Both self-consistent under the stored identity.

**Verdict.** One genuinely broken order (WS-P06DDkUs); the other fifteen balance exactly.

## 2. Orders vs stripe_transfers

**Intent.** Every order with artist_revenue > 0 should have a stripe_transfers row per recipient; amounts should equal the order's revenue columns; no orphan transfers.

**Result.**
- **Post-ledger (2026-08-28) orders: perfect.** All four (WS-MSUMRGESUYLUWPME, WS-9CSPWT8FNI0RRKSG, WS-NFXKMWTVH8FVKZHD, WS-O4U69TTDNH7JZHPR) have artist rows, and the two QR orders also have venue rows. Every `amount_cents` equals `round(revenue * 100)` exactly (6199, 14949 + 750, 5949 + 250, 3199). Artist rows status `pending`, `payout_after` 2026-09-11 (14-day hold). Venue rows status `blocked`, `last_error` `payout_capability:charges_disabled`. No transfer has executed yet (`stripe_transfer_id` is empty on all six).
- **Pre-ledger backlog: 11 orders, £953.20.** Every order from 2026-04-11 to 2026-05-27 with artist_revenue > 0 has no ledger row: WS-q0g0tqwD £144.42, WS-agEXJ0gn £49.30, WS-iJ7I3ENn £179.95, WS-VkC096yq £18.45, WS-kcsWHfhq £179.95, WS-p97TsPTt £69.44, WS-duumFTnR £97.23, WS-H7RgZntN £127.49, WS-rQDHDmz5 £28.99, WS-91NKBSh7 £28.99, WS-tHkhJLuA £28.99. These 11 plus split-less WS-P06DDkUs are the known "pre-ledger twelve"; **nothing newer than the ledger deploy is missing**.
- **Backfill blocker.** 5 of the 11 (£535.42) also have `artist_user_id` NULL (WS-agEXJ0gn, WS-iJ7I3ENn, WS-kcsWHfhq, WS-duumFTnR, WS-rQDHDmz5); `stripe_transfers.recipient_user_id` cannot be populated without first resolving the slug (fin-coles x4, maya-chen x1).
- Orphan transfers (no matching order): **0**. Amount mismatches: **0**.

**Verdict.** The new ledger reconciles to the penny; the historical £953.20 debt is real, unledgered, and partially blocked on missing user ids.

## 3. Refunds

**Intent.** Approved refunds whose order still shows full revenue; refunds exceeding order totals; stripe_refund_id presence consistent with status.

**Result.** Both refund_requests are `pending`, `full`, with `stripe_refund_id` NULL and `processed_at` NULL, which is internally consistent (no money moved, so unadjusted order revenue is correct). Amounts equal their order totals exactly. No refund exceeds its order. The operational picture is poor: request 2120fe7c-0bd5-4506-b680-5321a729d1cc (WS-q0g0tqwD, £169.90, artist-requested) has been pending since **2026-04-12** (138 days) and 1d9c6343-ebfc-4150-9d7f-d737e956dc4d (WS-H7RgZntN, £149.99, buyer-requested) since **2026-05-14** (106 days); both orders are `delivered`. Combined unresolved exposure £319.89, and the buyer-side one carries consumer-rights risk.

**Verdict.** Books balance; the queue does not move.

## 4. Venue share vs placement rates

**Intent.** For QR-attributed orders, compare the booked `venue_revenue_share_percent` with (a) the placement on `orders.placement_id` and (b) the sold work's own `current_placement_id` rate, which is the canonical rate after today's fix in `legs.ts` (work-level placement wins; the webhook maps a linked active placement's `revenue_share_percent || 0`).

**Result.** 2 QR orders exist, both attributed to `testing-venue`, both booked at **5%** from `p-1775932148651-8uyo` (the artist's oldest active revenue_share placement at that venue, created 2026-04-11). Work-level truth:

| Order | Booked | Work | Work's own placement | Work-level rate | Correct venue cut | Booked venue cut | Venue over-credited |
|---|---|---|---|---|---|---|---|
| WS-9CSPWT8FNI0RRKSG | 5% = £7.50 | fin-coles-1777209991699-1 | p-1781476334870-9uk0 (paid_loan, active) | none (maps to 0%) | £0.00 | £7.50 | £7.50 |
| WS-NFXKMWTVH8FVKZHD | 5% = £2.50 | fin-coles-1777209991699-2 | p-1779022522349-08zv (revenue_share 3%, active) | 3% | £1.50 | £2.50 | £1.00 |

**2 of 2 QR-attributed orders (100%) booked a different rate than the work-level rate.** Historical damage: venue over-credited **£8.50**, artists under-credited **£8.50** (WS-9CSPWT8FNI0RRKSG artist short £7.50: 149.49 booked vs 156.99 correct; WS-NFXKMWTVH8FVKZHD short £1.00: 59.49 vs 60.49). The blocked venue transfers hold **1000 cents where 150 is correct**. Both orders were placed today at 13:46 and 13:49, i.e. by the stale production deploy that predates the fix. Mitigation: nothing has executed; the venue rows are `blocked` and the artist rows `pending` until 2026-09-11, so the rows can be corrected before any money moves.

**Verdict.** The known bug's entire production blast radius is these two orders, £8.50, all still reversible on paper.

## 5. Paid loans vs recurring billing

**Intent.** Placements with `arrangement_type = 'paid_loan'`: which have a `placement_recurring_billings` row; cross-check statuses both ways.

**Result.** 28 paid_loan placements: 14 active, 9 pending, 2 completed, 2 declined, 1 cancelled. Exactly **1 billing row exists**: placement p-1787927775352-gbjb, £5/month, billing status `active`, `stripe_subscription_id` sub_1U9QxMFP3rMcNTgSJJWUol1U matching on both rows, `subscription_status` active, period end 2026-09-28. Created today, the first end-to-end paid-loan billing.

**13 of 14 active paid_loan placements have no billing row, no subscription id, and null subscription_status**: agreed monthly fees of 50, 50, 13, 15, 7, 75, 150, 75, 50, 50, 224, 100 and 50, totalling **£909/month agreed but not being collected**. Most predate the billing feature (April to June); the mechanism to migrate them onto billing does not exist in data.

Cross-checks all clean: active billing rows on non-active placements 0; placements with subscription_status active but no billing row 0; billing rows pointing at missing placements 0.

**Verdict.** The billing wiring works (n=1) and is consistent; the stock of active paid loans is almost entirely unbilled.

## 6. Email coverage in fact

**Intent.** Per order, do email_events rows exist matching the confirmation keys (`{orderId}:order.placed:order_placed`, `{orderId}:order.placed:artist_order_received`, `venue_sale_from_placement:{orderId}`, plus lifecycle updates)? Matched on `idempotency_key LIKE '%{orderId}%'` or `metadata->>'orderId'`, which catches legacy key shapes too. Then subscription_cancelled vs payment_failed coverage.

**Result.**
- **6 of 16 orders generated ZERO emails**: WS-q0g0tqwD, WS-agEXJ0gn, WS-iJ7I3ENn, WS-VkC096yq, WS-kcsWHfhq, WS-p97TsPTt (2026-04-11 to 2026-04-28, £747.69 of purchases). No buyer receipt, no artist notification, nothing.
- May orders got buyer-only legacy templates (customer_order_receipt, plus shipping/delivery confirmations on WS-H7RgZntN). **No artist received any order email before 2026-08-28**; the first artist_order_received rows in production are today's.
- WS-tHkhJLuA (2026-05-27): `customer_order_placed` status **render_failed** ("Cannot read properties of undefined (reading 'map')"); the buyer was covered by the legacy customer_order_receipt sent alongside.
- Today's four orders have full expected coverage: customer_order_placed sent + artist_order_received sent on all four, venue_sale_from_placement sent on both QR orders, customer_order_processing on the one that moved to processing.
- **Subscriptions: 5 subscription_cancelled emails to 4 distinct recipients (2026-05-17 to 2026-08-17). payment_failed emails ever sent: 0. trial_ending: 0.** No user who lost a subscription was ever warned by a payment-failure email first; the owner's experience is the platform-wide behaviour, not an isolated case.

**Verdict.** Coverage is now complete on the current code path; historically it was buyer-only, then nothing, and the payment-failed warning has never fired in the life of the platform.

## 7. Curation requests

**Intent.** paid/in_progress rows vs their Stripe ids; amount_paid_gbp sanity.

**Result.** 2 rows, both tier single_wall, both status **pending_payment** (zero paid or in_progress rows exist). Both hold a checkout session id prefixed `cs_test` (Stripe test mode) and `stripe_payment_intent_id` as an **empty string** rather than NULL (which defeats `IS NOT NULL` checks; my first pass misread it). `paid_at` NULL on both, consistent with never-completed checkouts. `amount_paid_gbp` is **49 on both despite no payment**: `src/app/api/curation/route.ts:142-143` prefils the tier price at creation for pay-first tiers, so the column reads as money received when it is money hoped for. Any report summing amount_paid_gbp overstates curation revenue by £98 today.

**Verdict.** No paid curation money to reconcile; the column semantics and empty-string ids are hygiene defects.

## 8. Orphans and residuals

**Intent.** Unexpired cart_sessions with no order; stripe_webhook_events population; anything else.

**Result.**
- cart_sessions: 18 total, 4 unexpired. **All 4 unexpired sessions match a completed order** (today's four, via order_events metadata stripe_session_id). Unexpired with no order: **0**. 13 of the 14 expired sessions have no order (abandoned checkouts, already expired, no exposure).
- stripe_webhook_events: 10 rows, **all created 2026-08-28 13:29 to 14:40**. Webhook dedup only began populating with the current deploy; every webhook before today was processed without replay protection (historical fact, no observed double-processing in the order data).
- Order attribution residue: 5 orders carry artist_slug but NULL artist_user_id (listed in section 2); 1 order (WS-P06DDkUs) carries neither.
- order_events: 26 rows, keys following `{orderId}:{event_type}` as specified; no duplicates observed.

**Verdict.** No live orphans; the dedup table's emptiness before today is a deploy-timeline artefact to be aware of when reasoning about historical webhook behaviour.

## Findings

| # | Severity | Finding | Evidence | Fix |
|---|---|---|---|---|
| 1 | High | Paid order WS-P06DDkUs (£64.49, 2026-05-17) has no revenue split at all: artist_revenue, venue_revenue and platform_fee all 0, artist_slug and artist_user_id NULL. Artist owed about £56.99 with no book entry. | orders row WS-P06DDkUs; items JSON has artistName "Finlay Coles" but no artistSlug; image path resolves artist user 08f9481e-2785-4ce9-a184-8042905036d1 | Owner backfill: set artist attribution and the era-correct split (fee £7.50 on subtotal, artist £56.99), then a stripe_transfers row so the debt enters the ledger |
| 2 | High | payment_failed email has never been sent to anyone, while 5 subscription_cancelled emails went to 4 users (2026-05-17 to 2026-08-17). Cancellation without warning is platform-wide, not just the owner's account. | email_events: 0 rows with key payment_failed:%; 5 rows subscription_cancelled sent | Deploy current webhook code (handler exists at webhooks/stripe/route.ts:1613); verify Stripe sends invoice.payment_failed to this endpoint; consider goodwill contact for the 4 affected users |
| 3 | High | £953.20 of artist money across the 11 pre-ledger orders (2026-04-11 to 2026-05-27) has no stripe_transfers row; 5 of those orders (£535.42) also lack artist_user_id, blocking mechanical backfill. | Section 2 list; stripe_transfers has no rows before 2026-08-28 | Owner backfill script: resolve user ids from artist_slug (fin-coles x4, maya-chen x1), insert pending transfer rows per order |
| 4 | Medium | Both QR orders (100%) booked the wrong venue rate: 5% from the oldest artist-level placement instead of the work-level 0% (paid_loan) and 3%. Venue over-credited £8.50, artists under-credited £8.50; blocked venue transfers hold £10.00 where £1.50 is correct. | Section 4 table; orders WS-9CSPWT8FNI0RRKSG, WS-NFXKMWTVH8FVKZHD placed 2026-08-28 13:46/13:49 by the stale deploy | Deploy the work-level fix; correct the two orders' venue_revenue/artist_revenue and the venue transfer amounts before any transfer executes (all still pending/blocked) |
| 5 | Medium | 13 of 14 active paid_loan placements have no recurring billing row: £909/month of agreed fees uncollected. Only p-1787927775352-gbjb (£5/month, created today) bills. | Section 5; placement_recurring_billings has 1 row | Owner decision: migrate legacy active paid loans onto billing (payment setup flow exists), or reclassify the dead ones |
| 6 | Medium | Both refund requests pending 138 and 106 days on delivered orders, £319.89 unresolved; the buyer-side one carries statutory-rights risk. | refund_requests 2120fe7c (WS-q0g0tqwD), 1d9c6343 (WS-H7RgZntN) | Owner action in the admin refunds queue: approve or reject; nothing is technically blocked |
| 7 | Low | Historical email blackout: 6 April orders (£747.69) produced zero emails; no artist order email existed before 2026-08-28; WS-tHkhJLuA order_placed render_failed ("Cannot read properties of undefined (reading 'map')"). | Section 6 per-order counts | Historical record only; current path verified complete on today's four orders |
| 8 | Low | curation_requests.amount_paid_gbp is prefilled with the tier price at creation (£98 shown as paid on two never-paid test-mode rows) and stripe_payment_intent_id holds empty string, not NULL. | Section 7; curation/route.ts:142-143 | Rename or null the column until the webhook confirms payment; write NULL not ''; exclude pending_payment rows from any revenue sum |
| 9 | Low | Numeric money columns carry JS float noise (total 169.89999999999998, shipping_cost 14.499999999999993, subtotal 99.97999999999999). | orders rows across April and May | Round to 2 dp before insert on the write paths; optional one-off normalisation with owner sign-off |
| 10 | Low | stripe_webhook_events only populates from 2026-08-28 13:29; all earlier webhooks ran without replay dedup. | 10 rows, all today | None (deploy-timeline artefact); note when auditing pre-today webhook behaviour |

## Clean bill

Reconciliations that balanced exactly:

- `subtotal + shipping_cost = total` on all 16 orders.
- `artist_revenue + venue_revenue + platform_fee = total` on 15 of 16 orders (all but WS-P06DDkUs).
- Post-ledger transfer coverage: every 2026-08-28 order has its full set of stripe_transfers rows, and every `amount_cents` equals the order's revenue column to the penny, artist and venue legs alike.
- Orphan transfers: none. Transfer/order amount mismatches: none.
- Refund arithmetic: no refund exceeds its order total; no approved refund with unadjusted order revenue; stripe_refund_id presence consistent with every status.
- Paid-loan billing cross-links: the one live billing row matches its placement on subscription id, amount (£5 = 500p) and status; zero active billings on inactive placements; zero subscription_status=active placements without a billing row; zero orphan billing rows.
- Cart sessions: zero unexpired sessions without a completed order.
- order_events idempotency keys: all conform to `{orderId}:{event_type}`, no duplicates.
