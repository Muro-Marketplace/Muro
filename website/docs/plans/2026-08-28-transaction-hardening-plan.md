# Transaction and email hardening plan, 2026-08-28

Sources: the six expert audits in docs/qa/txn-audit/ (78 findings), the
missing-events hunt (19 net-new gaps, file 7), and the cross-verification
(file 8: 32 of 32 Critical/High claims CONFIRMED, none refuted; line
numbers in the reports may sit up to 15 lines above the code after commit
99b28ee). Everything below is deduplicated across reports; each item
carries its source refs. All money on the platform to date is the owner's
test traffic, so there are no backfills or apologies anywhere in this
plan; every fix is prospective.

Effort key: S under an hour, M half a day, L a day or more.

## WS0. Owner actions (no code, do first)

| # | Action | Why |
|---|---|---|
| 0.1 | In the Stripe dashboard, open the webhook endpoint and enable: invoice.payment_failed, customer.subscription.trial_will_end, charge.dispute.created, charge.dispute.closed, charge.refunded, refund.failed, account.updated, payout.paid, payout.failed, invoice.payment_action_required, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed | The verifier resolved the dunning mystery: the code path shipped in April and was deployed, yet sendEmail was never invoked, which points at the endpoint's enabled-events list. No code fix works if the events never arrive. The new handlers below need the rest of the list too |
| 0.2 | Leaked-password toggle, TURNSTILE_SECRET_KEY, branch protection | Long-standing dashboard items |
| 0.3 | Decide the clean-slate test-data reset before real launch | The books permanently carry test-era drift otherwise |

## WS1. Webhook money-event coverage

| # | Item | Source | Effort |
|---|---|---|---|
| 1.1 | Cart branch catch (route.ts ~1231) rethrows or returns 500 so the claim releases and Stripe retries; same for the paid-loan/curation invoice wrapper catches (~1658-1712), which today can silently lose a month's artist share. The money-in-no-order-forever shape dies here | R1.F1, R8 tension 2 | S |
| 1.2 | charge.dispute.created handler: mark the order disputed, HOLD every leg (pending -> blocked with reason), admin alert email + bell with the evidence deadline, order_event. charge.dispute.closed: won -> release holds; lost -> reverse/cancel legs, mark charged back. This also makes the dispute email's existing "we hold the payout" promise TRUE | R1.F8, R3.2, R4.5, R6.F3, R7 gap 3 | M |
| 1.3 | charge.refunded handler (dashboard-initiated refunds): resolve the order by payment intent, cancel pending legs, reverse paid legs, restock on full refund, mark the order, send the in-app flow's emails, admin alert | R1.F2, R3.5, R6.F3 | M |
| 1.4 | refund.failed handler: un-mark and alert | R1 matrix | S |
| 1.5 | checkout.session.async_payment_succeeded books the deferred order (the settlement gate currently defers completed and nothing books the settled money); async_payment_failed releases the cart with an email | R1 unhandled list | M |
| 1.6 | Cart branch requires metadata kind === cart_checkout | R1.F12 | S |

## WS2. Ledger integrity

| # | Item | Source | Effort |
|---|---|---|---|
| 2.1 | transfer.reversed writes terminal `reversed`, never retryable `failed`; sweep rescue list corrected. Kills the double-pay engine | R3.1 CRITICAL | S |
| 2.2 | Partial refunds: reduce pending legs proportionally instead of confiscating (R3.3); handle mid-retry legs (R3.4) and blocked legs (R3.6); shipping-aware reversal denominator (R3.8) | R3 | L |
| 2.3 | account.updated revives blocked legs when payouts become enabled; payout.paid/failed resolve venues too | R3.7, R3.9 | M |
| 2.4 | executeTransfer takes a DB claim before the Stripe call; retry key decay noted and closed | R6.F13, R3.11 | S |
| 2.5 | Reconciliation sweep also finds orders with MISSING legs (per-leg scheduling failures) and surfaces blocked rows; admin earnings sum filters to real statuses | R1.F10, R3.7, R3.12 | S |
| 2.6 | The 14-day payout hold requires shipping progress: a stale unshipped order alerts instead of paying, and an open refund request pauses the clock | R7 gap 5 | M |
| 2.7 | Multi-artist orders release per artist on delivery, not all legs on one click | R7 notable | M |

## WS3. Cancellation, deletion and lifecycle gaps (hunter criticals)

| # | Item | Source | Effort |
|---|---|---|---|
| 3.1 | Cancelling a PAID order triggers the refund flow (auto-create an approved refund request through the existing engine) or, minimum, tells the buyer exactly how their money returns; today the platform keeps it silently | R7 gap 1 CRITICAL | M |
| 3.2 | Account deletion cancels the person's Stripe subscriptions (SaaS, paid-loan where payer, curation) before the auth user goes; migration retargets migration 063's cascade FK so placement_recurring_billings survives as ledger (SET NULL) | R7 gap 2 CRITICAL, needs migration 122 | M |
| 3.3 | Off-the-wall sale prompts the wind-down: notify artist AND venue with a one-click "placement complete, stop monthly billing"; never bill an empty wall silently | R7 gap 4 | M |
| 3.4 | Verify-and-fix: collection orders reaching `delivered` so the statutory window starts (read 7-missing-events for the exact path; the cited /api/admin/orders escape hatch does not exist) | R7 notable | S |
| 3.5 | Referral fee-free window: granted and expiry emails | R7 notable | S |

## WS4. Subscriptions and paid-loan lifecycle

| # | Item | Source | Effort |
|---|---|---|---|
| 4.1 | hasActiveSubscription counts past_due/incomplete as live; resubscribe path carries cancel_previous. Kills concurrent SaaS subscriptions | R2.1 CRITICAL | S |
| 4.2 | Idempotency key on the subscribe Checkout session; fix the first-time customer create race | R2.5, R2.9 | S |
| 4.3 | Paid-loan dunning: invoice.payment_failed emails the venue (dunning) and bells the artist; repeated failure alerts admin; cancellation notices to both; invoice.payment_action_required surfaces SCA | R2.7, R2.14, R4.2, R6.F2 | M |
| 4.4 | Delisting comms: the artist is emailed when GATING_V1 delists them and when they return | R2.2 CRITICAL | S |
| 4.5 | subscription_trial_ending recategorised orders_and_payouts (always-send); wire subscription_card_expiring to customer.source.expiring | R2.3, R2.4, R4.1 | S |
| 4.6 | Paid-loan artist share: gate on canReceivePayout with a blocked ledger row (never silent skip), pay from invoice amount_paid not the recorded fee | R1.F6, R2.8, R3.10, R3.13 | M |
| 4.7 | Duplicate live-billing hardening; unique index on artist_profiles.stripe_customer_id (migration); subscription state writes reconciled | R2.6, R2.15, R2.17 | M |
| 4.8 | invoice.paid sends the venue their monthly receipt (wire the dead venue_paid_loan_invoice template) | R4.13 | S |
| 4.9 | Curation: idempotency on POST /api/curation, payment-failure comms, amount_paid_gbp only written on payment | R2.10, R2.11, R5.8 | M |

## WS5. Email pipeline hardening

| # | Item | Source | Effort |
|---|---|---|---|
| 5.1 | Claim semantics: failed / render_failed / dry_run rows do NOT permanently block their key (retryable); queued-stuck rows recovered; a DB error on the claim is a 500, never "duplicate" | R4.3 CRITICAL, R4.6, R4.9 | M |
| 5.2 | Resend webhook route: delivery/bounce/complaint events update email_events and WRITE email_suppressions, which is currently read by sendEmail but written by nothing | R4.4, RH17 | M |
| 5.3 | List-Unsubscribe header points at the POST API endpoint, not the GET page | R4.7 | S |
| 5.4 | EMAIL_DRY_RUN refused in production; /api/health/email alerts on failed / render_failed / dry_run counts | R4.8 | S |
| 5.5 | Batch of small correctness: buyer emails carry the buyer's userId not the actor's (R4.10), Date.now idempotency key on counter-offer emails (R4.14), re-occurrence keys (R4.15), throttle per category (R4.16), refund-rejection greeting (R4.17), money-consequential templates moved out of suppressible categories (R4.12) | R4 | M |
| 5.6 | Dead-template decision pass: wire the owed money ones (done via 4.5/4.8), explicitly retire or keep the rest so "dead" is a decision not an accident | R4.11 | S |

## WS6. Bells and crons

| # | Item | Source | Effort |
|---|---|---|---|
| 6.1 | payout_sent bell + ArtistPayoutSent email link to a real destination (billing page anchor or redirect) | R6.F1 | S |
| 6.2 | Missing bells: refund rejection (requester), payout.failed (artist) | R6.F4, R6.F5 | S |
| 6.3 | Bell idempotency: unique key column (migration) + createNotification accepts a key; fix the three known double-bell paths | R6.F6 | M |
| 6.4 | order-delivery-followup gets a time floor and per-order claim | R6.F7 | S |
| 6.5 | Cron observability: all-failed runs return 500 and alert admin | R6.F8 | S |
| 6.6 | Link fixes (orders?id, collection_pending deep link, absolute-URL bells, venue-portal/curation) and window/pagination fixes in nudges and inactive sweeps | R6.F9-F15 | M |

## WS7. Compliance decisions (owner + accountant, not unilateral code)

VAT treatment, platform commission invoicing, and HMRC digital-platform
seller reporting exist nowhere (R7). These need a decision on scope and
professional advice before implementation; parked as a named decision,
not silently dropped.

## WS8. The P2 waves (separate, already scoped)

Waves 1-3 of the P2 plan (2026-08-28) run in parallel or after: list-page
respond buttons (F51 cluster), counter clamp, quantity cap (= WS-item
R1.F4, do once in Wave 1), admin refunds surface (G2/G28), venue prefs
500, dead surfaces, honest-copy sweep. The quantity cap and admin refunds
surface appear in both plans and are done once.

## Execution order

1. WS1.1 + WS2.1 (two small criticals, immediate)
2. WS0.1 (owner: Stripe enabled-events, prerequisite for the new handlers)
3. WS1 rest, WS2 rest
4. WS4.1/4.2 + WS3.1/3.2 (criticals)
5. WS5, then WS4 rest, WS3 rest, WS6
6. WS8 waves, WS7 decision

Rough effort: WS1+WS2 two days, WS3+WS4 two days, WS5+WS6 one and a half,
plus the two days already scoped for the P2 waves. Every item lands with
regression tests and fail-before verification as standard; migrations
(122: billing-ledger FK, customer-id unique index, notification keys) are
written, applied and verified live atomically as usual.
