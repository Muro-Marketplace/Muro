# Transaction audit 4: emails

Date: 2026-08-28. Scope: every email Wallplace sends or should send. Method: full read of
`src/lib/email/send.ts`, `src/lib/email/categories.ts`, `src/emails/registry.ts` (137 templates),
every send site in `src/app` and `src/lib`, `vercel.json` crons, the Stripe and Supabase webhooks,
and an inversion pass over the buyer, artist, venue and admin lifecycles. No source code was modified.

Headline: 137 registry templates, 78 with a live sender, 59 dead. The known prior finding
(`subscription_trial_ending` in an opt-in category) is NOT fixed. The paid-loan billing lifecycle
sends nothing at all after setup, including on payment failure, which reproduces the exact incident
class this audit exists for (money state changing with zero warning emails).

## Pipeline drop points

Every path through `sendEmail()` (src/lib/email/send.ts) where a send can be dropped or fail.

| # | Stage (line) | Drop path | Logged? | Observable? | Can it swallow a money email? |
|---|---|---|---|---|---|
| P1 | Idempotency pre-check (79-87) | A row stuck in `queued` (crash between the claim and the provider call, or the post-send status update failing) blocks the key forever. `queued` is treated as duplicate and nothing sweeps stale queued rows. | Original row only | DB query only | Yes. A crashed payout or refund email never sends and never retries. |
| P2 | Atomic claim (199-218) | The upsert's error is discarded (`{ data: claimed }`); any DB failure on the claim (outage, RLS, constraint) returns no row and is reported as `skipped: "duplicate"`, `ok: true`. | NO. Nothing is written or printed | Invisible | Yes. During a Supabase blip every send in flight is silently dropped and reported as a duplicate success. |
| P3 | Atomic claim vs prior rows (199-218) | `ignoreDuplicates: true` means ANY existing row with the key, including `failed`, `render_failed`, `dry_run` and every `skipped_*` status, makes the claim return nothing, so the send is reported `duplicate`. Combined with the pre-check only treating `sent`/`queued` as duplicates, a failed send passes the pre-check, then dies at the claim. There is no retry mechanism anywhere (no cron, no admin resend). | The old failed row remains | DB query only | Yes, badly. A transient Resend outage marks money emails `failed`; a Stripe webhook redelivery, the platform's designed retry path, then gets `duplicate` and the email is lost permanently. |
| P4 | Suppression check (89-107) | Skips non-critical mail to suppressed addresses. Currently INERT: nothing ever writes `email_suppressions` (see deliverability). `maybeSingle()` error is also discarded. | `skipped_suppressed` | email_events only | No (critical categories bypass), but see D2. |
| P5 | Preference check (109-127) | Skips when a prefs row exists with the toggle false, or `vacation_until` in the future. Only runs when the caller passes `userId`; callers that omit it silently bypass consent. Vacation mode blocks placement accept/decline and offer emails (see M-list). | `skipped_opted_out` / `skipped_vacation` | email_events only | Not for `orders_and_payouts`, but yes for money-consequential mail filed under `placements`/`promotions` (M1, M2). |
| P6 | Throttle (129-143) | Per-user cap. Implemented per TEMPLATE (`.eq("template", ...)`) although CategoryRules documents it per category, so the real cap is looser than designed. Counts `queued` rows, including permanently stuck ones. | `skipped_throttled` | email_events only | Not for tx categories (throttle 0). Yes for placements-category money events (10/24h). |
| P7 | Render (145-155) | Render failure returns `ok: false` and logs `render_failed`. No console output, no alert, and per P3 the key is burnt: after the template bug is fixed the same event can never send. | `render_failed` | email_events; health route reports the count but does not fail on it | Yes. A bad prop shape on a payout template permanently kills that payout's email. |
| P8 | Missing API key (173-191) | Production: `console.error` + `ok:false` (09 A.6 layer 2, good). Dev/preview: soft skip. Both log `skipped_no_api_key`, which burns the key (P3): after the key is restored, every email dropped in the window is permanently unreplayable. | `skipped_no_api_key` | Health route fails on this one (the only status it fails on) | Yes for the burnt keys, even after recovery. |
| P9 | EMAIL_DRY_RUN (221-232) | Checked unconditionally, including production. If the env var leaks into prod, every email is skipped with `ok: true` and status `dry_run`. The health route does not watch `dry_run`, so `/api/health/email` stays green through a total outage. | `dry_run` | NOT via health route | Yes, all of them, invisibly. |
| P10 | Provider send (234-280) | Resend error or thrown exception marks the row `failed` and returns `ok:false`. No admin alert, no retry, and P3 makes the failure permanent. The health route reports `failed` counts but its `healthy` verdict ignores them: a day of 100 per cent provider failures still returns 200. | `failed` + error message | Reported but not alarming | Yes. |
| P11 | logEvent (283-305) | All skip logging is best-effort; DB errors are swallowed, so a skip can leave no trace. Its upsert (no ignoreDuplicates) also overwrites a prior `failed` row's error message when a later attempt skips. | n/a | n/a | Trail loss only. |
| P12 | getSupabaseAdmin (71) | Throws when Supabase env is missing, so `sendEmail` breaks its "never throws" contract and callers without try/catch 500. | No | Route error | Environment-broken case only. |

Cross-cutting: `email_events` is the ONLY observability surface. There is no admin UI over it, no
alerting on `failed`, and `/api/health/email` fails only on `skipped_no_api_key` (plus env and DB
reachability). `opened_at`, `clicked_at`, `bounced_at`, `complained_at` columns exist and are never
written.

## Miscategorised templates

Templates whose category makes them suppressible (preference toggle), vacation-blockable or
throttleable when the content is money, billing or account state. Category rules: only `security`,
`legal`, `orders_and_payouts` and `platform_admin` are critical-always-send.

1. `subscription_trial_ending` is `promotions` at the registry (src/emails/templates/payments/SubscriptionTrialEnding.tsx) AND at the live send (src/app/api/webhooks/stripe/route.ts:1484). The prior finding is NOT fixed. Consequences: `promotions_enabled` defaults to FALSE (migration 016), so any user with an `email_preferences` row (created the first time they save preferences or use any unsubscribe link) never receives the warning; vacation mode blocks it; it is throttled 2/720h; and it sends on the `news` stream from `hello@`. The user's next contact after a silent trial end is the charge itself or the dunning email. This is the exact class as the real incident.
2. `offer_received_notification` is `placements` (src/app/api/offers/route.ts:529). A purchase offer is a money event with an expiry; it can be dropped by `placements_enabled = false`, vacation mode, or the 10/24h placements throttle, all logged as ok.
3. `artist_placement_accepted`, `venue_placement_accepted_confirmation` (placements/route.ts:1735, 1759), `artist_placement_declined`, `placement_venue_declined_artist_request` (1822, 1837), `placement_cancelled` (1995): all `placements`. Acceptance forms a commercial arrangement (for paid loans, a monthly liability). The `paid_loan_setup_payment` email itself is correctly `orders_and_payouts`, but the acceptance notice around it can silently drop.
4. `artist_application_submitted` (apply/route.ts:253), `artist_application_approved` (admin/applications/[id]/route.ts:257), `artist_application_rejected` (:90): all `placements`. These are account-state emails gated by a toggle labelled "Placement updates" that has nothing to do with applications.
5. Reverse direction: `customer_waitlist_confirmation` (waitlist/route.ts:55) and `venue_registration_confirmation` (register-venue/route.ts:110) are `security`, so they bypass suppressions and carry no one-click unsubscribe, yet they are triggered by unauthenticated form input. Their idempotency keys (bare email address) self-limit to one send per address ever, which caps the abuse but also silences legitimate repeat attempts.
6. Registry vs send-site drift: the three welcome emails are `recommendations` in the registry but sent as `tips` (src/lib/email/welcome.ts:114, 190, 233), so the preference toggle shown against the template in the library is not the one honoured at send time.

Count: 13 entries covering 15 templates; item 1 is money-critical.

## Template coverage

All 137 registry templates. Category is the registry's. "DEAD" = no live send site anywhere in
src/app, src/lib or scripts (test files, the preview library and the render harness excluded).
Dispatcher sends resolve through `src/lib/email/dispatcher.ts` (key suffixing `:<spec name>`).

| Template | Category | Send site or DEAD | Key | Verdict |
|---|---|---|---|---|
| admin_alert | platform_admin | lib/email/admin-alert.ts, 11+ callers (contact, enquiry, apply, register-venue, curation, disputes, refunds/request, stripe webhook, curation/billing, stripe-connect) | caller semantic ids | OK; recipient is `adminEmails()[0]`, fails loud when unset |
| account_email_verification | security | DEAD (Supabase GoTrue sends its own) | - | Auth mail bypasses the pipeline entirely: no email_events, no idempotency, invisible to health checks |
| account_password_reset | security | DEAD (GoTrue via `resetPasswordForEmail`) | - | Same as above |
| account_password_changed | security | DEAD | - | No password-changed notification exists at all (GoTrue does not send one) |
| account_deletion_requested | legal | DEAD | - | Deletion flow sends nothing |
| account_deletion_confirmed | legal | DEAD | - | No GDPR erasure confirmation (account/delete/route.ts sends no mail) |
| account_data_export_ready | legal | DEAD | - | No export feature wired |
| account_suspicious_login | security | webhooks/supabase/route.ts:116 | suspicious:{userId}:{loginTime} | OK |
| account_email_change_verify | security | DEAD (GoTrue) | - | Pipeline-invisible |
| account_two_factor_enabled / _disabled | security | DEAD | - | No 2FA feature |
| account_team_invite / _accepted | security / placements | DEAD | - | No team feature |
| support_request_received | orders_and_payouts | contact/route.ts:90 | support_ack:{reference} | OK; per-recipient flood guard in front |
| artist_welcome_checklist | recommendations | lib/email/welcome.ts:113 (sent as tips) | welcome:{userId} | Category drift; welcomed_at guard |
| venue_welcome_checklist | recommendations | welcome.ts:232 (sent as tips) | welcome:{userId} | Category drift |
| customer_welcome | recommendations | welcome.ts:189 (sent as tips) | welcome:{userId} | Key shared across personas: a second-persona user gets no second welcome |
| artist_profile_completion_nudge, artist_first_artwork_upload_nudge, artist_connect_stripe_nudge, artist_placement_preferences_nudge, artist_onboarding_graduation, artist_onboarding_incomplete_recap | recommendations | cron/onboarding-nudges | onboarding:{template}:{userId} | OK (once ever by design) |
| venue_space_details_nudge, venue_photo_upload_nudge, venue_art_preferences_nudge, venue_first_placement_cta | recommendations | cron/onboarding-nudges | onboarding:{template}:{userId} | OK |
| customer_browse_nudge, customer_follow_artist_nudge | recommendations | DEAD | - | Not wired into the nudge cron |
| venue_new_placement_request | placements | placements/route.ts:557; messages/route.ts:599 | placement_request:{id}:to_venue | OK, cross-surface dedupe |
| artist_new_placement_invitation | placements | placements:585; messages:573 | placement_request:{id}:to_artist | OK |
| artist_placement_request_sent | placements | placements:647 | placement_request:{id}:to_artist | Key shared with the invitation, but the two belong to mutually exclusive flows (artist-initiated vs venue-initiated), so no collision per placement |
| artist_placement_accepted | placements | placements:1735; messages:724 | placement_response:{id}:accepted | Miscat (M3); cross-surface dedupe intended |
| venue_placement_accepted_confirmation | placements | placements:1759 | placement_response:{id}:accepted | Shares the key with the artist variant; branches are if/else on who requested, so exclusive |
| artist_placement_declined | placements | placements:1822; messages:724 | placement_response:{id}:declined | Miscat (M3) |
| placement_venue_declined_artist_request | placements | placements:1837 | placement_response:{id}:declined | Exclusive branch |
| placement_cancelled | placements | placements:1995 | placement_cancelled:{id} | Single send, counterparty only; miscat (M3) |
| placement_counter_offer_received | placements | placements:1168 | placement_counter:{id}:{Date.now()} | NOT idempotent: a retried request double-sends. The codebase's own notifications.ts docstring names this exact pattern as a defect |
| placement_scheduled | placements | placements:1546 | placement_scheduled:{id}:{party.uid} | OK, both parties |
| placement_artwork_installed | placements | placements:1569 | placement_installed:{id}:{party.uid} | OK |
| placement_ended | placements | placements:1593 | placement_ended:{id}:{party.uid} | OK |
| placement_ending_soon | placements | DEAD (cron exists but is deliberately gated off: no end-date column; D60) | - | Documented dead; owner decision pending |
| placement_midway_checkin | digests | DEAD | - | No cron |
| placement_review_request | placements | cron/placement-review-request:59 | placement_review_request:{id}:{userId} | OK |
| placement_consignment_record_created | legal | placements/[id]/record:308 | record_created:{id}:{party.uid} | OK, critical |
| placement_contract_countersigned | legal | record:350 | record_countersigned:{id}:{uid}:{signedAt} | OK |
| message_unread_notification | messages | lib/email/notifications.ts (messages + enquiry routes) | message_unread:{messageId} | OK |
| message_hourly_digest | messages | DEAD | - | No cron |
| review_posted_notification | placements | placements/[id]/review:120 | review_posted:{placementId}:{reviewerId} | OK |
| offer_received_notification | placements | offers/route.ts:528 | offer:{id}:{recipient} | Miscat (M2): money event, suppressible |
| artist_first_qr_scan, artist_qr_scan_milestone | recommendations | DEAD | - | No trigger wired |
| artist_qr_scan_digest | digests | cron/qr-scan-digest:149 | qr_scan_digest:{userId}:{date} | OK |
| artist_weekly_portfolio_digest | digests | cron/weekly-artist-digest:56 | artist_weekly_digest:{userId}:{week} | OK |
| artist_new_venue_match | recommendations | DEAD | - | No matcher wired |
| artist_low_engagement_tips | tips | DEAD | - | - |
| venue_weekly_digest | digests | cron/weekly-venue-digest:53 | venue_weekly_digest:{userId}:{week} | OK |
| venue_new_artist_matches, venue_rotation_reminder, venue_placement_anniversary, venue_managed_curation_pitch | recommendations/digests/promotions | DEAD | - | - |
| venue_registration_confirmation | security | register-venue:109 | venue_registration_confirmation:{email} | Category questionable (M5); key burns on repeat attempt |
| curation_enquiry_received | orders_and_payouts | curation/route.ts:190 | curation_enquiry_received:{row.id} | OK |
| curation_payment_received | orders_and_payouts | stripe webhook:242 | curation_payment_received:{requestId} | OK; initial payment only, renewals get no customer receipt |
| curation_refund_issued | orders_and_payouts | admin/curation/refund:200 | curation_refund_issued:{row.id} | OK |
| venue_collection_pending | orders_and_payouts | stripe webhook:1186 | venue_collection_pending:{orderId} | OK |
| venue_sale_from_placement | orders_and_payouts | lib/orders/confirmations.ts:200 | venue_sale_from_placement:{orderId} | OK |
| customer_order_receipt | orders_and_payouts | DEAD (retired by 09 item 1.3; content moved onto customer_order_placed) | - | Registry-only; the component import in confirmations.ts is dead code |
| artist_work_sold, artist_order_confirmation | orders_and_payouts | DEAD (retired, same) | - | Registry-only |
| customer_shipping_confirmation, customer_delivery_confirmation | orders_and_payouts | DEAD (dispatcher owns these events with Phase 2 templates) | - | Registry-only |
| customer_post_purchase_care | tips | DEAD | - | - |
| customer_purchase_review_request | recommendations | DEAD | - | Purchase review flow never emails |
| customer_refund_confirmation | orders_and_payouts | refunds/process:433 | customer_refund:{refundRequestId} | OK |
| customer_refund_rejected | orders_and_payouts | refunds/process:148 | customer_refund_rejected:{refundRequestId} | OK; recipient may be the artist requester but copy greets the buyer's shipping name |
| artist_refund_notification | orders_and_payouts | refunds/process:459 | artist_refund:{refundRequestId} | OK |
| artist_refund_requested | orders_and_payouts | refunds/request:189 | artist_refund_requested:{id} | OK |
| customer_order_status_update | orders_and_payouts | orders/route.ts:321 (non-lifecycle statuses); dispatcher `order_cancelled` binding | order_status_update:{orderId}:{status} / {orderId}:order.cancelled:order_cancelled | OK |
| order_dispute_opened | orders_and_payouts | disputes/route.ts:122 | dispute_opened:{dispute.id}:{party.role} | OK (internal disputes only, not Stripe chargebacks) |
| order_dispute_resolved | orders_and_payouts | admin/disputes/[id]:101 | dispute_resolved:{id}:{party.role} | OK |
| artist_order_received | orders_and_payouts | dispatcher via recordOrderEvent (checkout confirmations + orders PATCH) | {orderId}:order.placed:artist_order_received | OK |
| customer_order_placed | orders_and_payouts | dispatcher, same | {orderId}:order.placed:order_placed | OK; doubles as the receipt |
| customer_order_processing | orders_and_payouts | dispatcher | {orderId}:order.processing:order_processing | OK |
| customer_order_out_for_delivery | orders_and_payouts | dispatcher (status `shipped`) | {orderId}:order.out_for_delivery:order_out_for_delivery | OK |
| customer_order_delivered | orders_and_payouts | dispatcher | {orderId}:order.delivered:order_delivered | OK |
| customer_confirm_delivery_48h | orders_and_payouts | cron/order-delivery-followup:165 | {orderId}:48h_prompt:customer_confirm_delivery | OK |
| artist_payout_sent | orders_and_payouts | stripe webhook:1831 (payout.paid) | payout_sent:{payout.id} | OK |
| artist_payout_failed | orders_and_payouts | stripe webhook:1775 (payout.failed) | payout_failed:{payout.id} | OK |
| subscription_payment_failed | orders_and_payouts | stripe webhook:1614 | payment_failed:{invoice.id}:{attempt_count} | OK, per-attempt dunning (artist SaaS only) |
| paid_loan_setup_payment | orders_and_payouts | placements:1796; placements/[id]/payment/setup:174 | paid_loan_setup:{id} / paid_loan_setup:{id}:{fee}:{hourBucket} | OK; second key is a deliberate rate-limited resend surface |
| subscription_trial_ending | promotions | stripe webhook:1483 | trial_ending:{subscription.id} | MISCAT, see M1. Key also burns if a trial is extended and re-approaches |
| subscription_upgraded | orders_and_payouts | stripe webhook:1384 | subscription_upgraded:{sub.id}:{plan} | OK |
| subscription_cancelled | orders_and_payouts | stripe webhook:1562 | subscription_cancelled:{sub.id} | OK; isStale guard correctly suppresses upgrade-race deletions |
| subscription_started | orders_and_payouts | stripe webhook:1334 | subscription_started:{sub.id} | OK |
| subscription_renewal_receipt | orders_and_payouts | stripe webhook:1737 (invoice.paid, subscription_cycle) | renewal_receipt:{invoice.id} | OK for artist SaaS; nothing equivalent for paid-loan or curation payers |
| subscription_card_expiring | orders_and_payouts | DEAD | - | No `customer.source.expiring` handler, no cron. The pre-dunning warning does not exist |
| venue_revenue_share_statement | orders_and_payouts | DEAD | - | No statement generator or cron |
| venue_paid_loan_invoice | orders_and_payouts | DEAD | - | Paid-loan payers never receive an invoice or receipt |
| artist_stripe_kyc_needed | orders_and_payouts | stripe webhook:1907 (account.updated) | stripe_kyc:{account.id}:{hash} | OK |
| artist_application_submitted | placements | apply/route.ts:252 | artist_application_submitted:{email} | Miscat (M4); key on bare email burns on re-application |
| artist_application_under_review | placements | DEAD | - | Status exists, no sender |
| artist_application_approved | placements | admin/applications:256 | application_approved:{id} | Miscat (M4); key on application id is fine |
| artist_application_rejected | placements | admin/applications:89 | application_rejected:{id} | Miscat (M4) |
| artist_year_in_review | newsletter | DEAD | - | - |
| artist_tier_cap_hit, artist_premium_upgrade_educational, venue_analytics_upgrade, venue_managed_curation_upgrade | promotions | DEAD | - | No cap-enforcement or upsell triggers |
| customer_abandoned_checkout_1h / _24h | promotions | DEAD | - | No abandonment tracking |
| customer_saved_work_back_in_stock, customer_saved_work_price_drop, customer_new_work_from_followed_artist, customer_saved_works_digest | promotions/recommendations/digests | DEAD | - | - |
| customer_waitlist_confirmation | security | waitlist/route.ts:54 | customer_waitlist_confirmation:{email} | Category questionable (M5); one send per address ever |
| artist_inactive_14d/_30d/_90d | tips | cron/inactive-users | {template}:{userId}:{date}, plus a 14-day recency guard | OK |
| venue_inactive_30d, venue_inactive_90d_white_glove | tips | cron/inactive-users | same | OK |
| customer_inactive_30d/_90d | tips | cron/inactive-users | same | OK |
| user_repermission_campaign | newsletter | DEAD | - | - |
| newsletter_subscribe_confirm | newsletter | newsletter/route.ts:83 | newsletter_confirm:{confirmToken} | OK; per-recipient flood guard |
| newsletter_monthly_gallery, newsletter_artist_spotlight, newsletter_venue_spotlight, newsletter_curators_picks, newsletter_local_art_near_you | newsletter | DEAD | - | No campaign sender exists |
| legal_terms_update, legal_privacy_update | legal | DEAD | - | No mechanism to notify users of ToS/privacy changes |
| artist_tax_document_ready | legal | DEAD | - | No tax document generator |
| operational_platform_incident | legal | DEAD | - | - |
| operational_policy_violation_warning, operational_account_restricted, operational_account_restored | legal | DEAD | - | Moderation flow has no email surface |

Totals: 137 templates, 78 live, 59 dead.

## Lifecycle moments with no email

The inversion: moments that should email someone and do not. Grouped by who is harmed.

Money and billing:

1. Chargeback received. There is NO `charge.dispute.*` handler in the Stripe webhook (event inventory: checkout.session, subscription, invoice, payout, transfer.reversed, account.updated only). A card dispute with a 7 to 21 day response deadline arrives and nobody (admin, artist, buyer) is emailed; the money is defended by silence.
2. Paid-loan monthly payment failed. `handleInvoicePaymentFailed` (src/lib/placements/paid-loan-billing.ts:336-370) marks `past_due`/`paused` and its own comment says "we mark paused and notify both parties", but the module contains zero email or notification calls. The venue whose card died, the artist whose income stopped and the admin all learn nothing. This is the audited incident class reproduced.
3. Paid-loan receipt/invoice. `handleInvoicePaid` transfers the artist's share but sends no receipt to the paying venue; `venue_paid_loan_invoice` is a dead template. Recurring money leaves a card monthly with no email trail to the payer.
4. Paid-loan subscription cancelled. `handleSubscriptionDeleted` (paid-loan-billing.ts:378) flips a status column only. Neither party is told billing stopped.
5. Paid-loan setup completed. On `checkout.session.completed` (webhook:493-570) the artist gets an in-app bell only; the venue who just committed to a monthly charge gets no confirmation email at all.
6. Managed curation renewal. `handleCurationInvoicePaid` (src/lib/curation/billing.ts:55) alerts the ADMIN on renewal; the venue paying the renewal receives no receipt (curation_payment_received fires on the first payment only).
7. Managed curation cancelled. `handleCurationSubscriptionDeleted` alerts the admin only; the venue gets no cancellation confirmation.
8. Card expiring before renewal. No `customer.source.expiring` handler and no cron; `subscription_card_expiring` is dead. The one email that prevents dunning cannot send.
9. Refund fails after approval. refunds/process emails "Refund on the way" at execution time, but there is no `refund.failed` / `charge.refund.updated` handler: if Stripe later fails the refund asynchronously, the buyer keeps the confirmation and no one is told.
10. Transfer reversed (money clawed back from an artist). webhook:1852 flips `stripe_transfers.status` to failed; no email to artist or admin.
11. Payout retries exhausted: admin is alerted (stripe-connect.ts:288) but the ARTIST whose money is stuck is not told.
12. Venue revenue-share statement: dead template, no generator, no cron.

Account state:

13. Password changed: no notification exists (template dead, GoTrue does not send one). A hijacked account's owner is never warned.
14. Account deletion: no confirmation email before or after erasure (both deletion templates dead; account/delete/route.ts sends nothing).
15. Email verification, password reset, email change: sent by Supabase GoTrue outside the pipeline. They presumably deliver, but with no email_events row, no idempotency, no suppression handling and no visibility in `/api/health/email`. If Supabase SMTP breaks, nothing in this codebase notices.
16. Artist application moved to under review: template exists, dead.
17. Account restricted / restored / policy violation: no moderation email surface (all three templates dead).
18. ToS / privacy update: no sender exists for the legal-notice templates.
19. Tax document ready: no generator.

Placement lifecycle:

20. Placement ending soon: cron deliberately gated off because `placements` has no end-date column (D60); documented, owner decision pending.
21. Trial converting to paid (the first real charge after a silent trial end): covered only if the trial-ending email sends, which for opted-out users it does not (M1). The first-invoice receipt also does not fire (`billing_reason` on a trial conversion invoice is `subscription_cycle`, so the renewal receipt path covers it; verified as OK, listed here for completeness).

Admin visibility:

22. No admin alert for: chargebacks (none exist), paid-loan payment failures, transfer reversals, or email pipeline failures (`failed` sends alert nobody and do not fail the health check).

## Keys

Money-email idempotency keys, checked for (a) redelivery double-send safety and (b) cross-event collisions.

Safe by construction: `payment_failed:{invoice.id}:{attempt_count}` (one dunning email per Stripe attempt), `renewal_receipt:{invoice.id}`, `payout_sent/failed:{payout.id}`, `subscription_*:{subscription.id}`, `customer_refund*:{refundRequestId}`, `dispute_*:{id}:{role}`, order lifecycle `{orderId}:{event}:{template}` (dispatcher suffix gives each recipient its own row), `venue_sale_from_placement:{orderId}`, `curation_*:{requestId}`, `stripe_kyc:{account.id}:{requirementsHash}`.

Defects:

- K-A `placement_counter:{id}:{Date.now()}` (placements/route.ts:1167) is not an idempotency key; a platform retry or double-submit sends the counter-offer email twice.
- K-B Keys on bare email burn on legitimate re-occurrence: `artist_application_submitted:{email}` and `admin_new_application:{email}` (a rejected artist who re-applies triggers neither the confirmation nor the admin alert), `venue_registration_confirmation:{email}`, `admin_new_venue:{email}`, `customer_waitlist_confirmation:{email}`.
- K-C `welcome:{userId}` is shared across the three persona welcomes; a user who later gains a second persona gets no second welcome.
- K-D `trial_ending:{subscription.id}`: an extended trial that approaches its end a second time is deduped.
- K-E Shared key `placement_response:{id}:accepted|declined` across two routes and two template pairs is deliberate cross-surface dedupe of one logical event; the pairs sit in mutually exclusive branches, so no collision was found. Same for `placement_request:{id}:to_artist` (invitation vs request-sent belong to exclusive flows).
- K-F Systemic (pipeline P3): every one of these keys, including the perfectly designed ones, offers redelivery safety only for SUCCESSFUL sends. Any failed or skipped attempt burns the key, so the "safe to redeliver" property inverts into "no second chance".

## Deliverability

- From/reply-to (src/lib/email/streams.ts): tx `noreply@wallplace.co.uk`, notify `notifications@`, news `hello@`, reply-to `hello@` on all three, env-overridable. Boot assertion (src/instrumentation.ts) hard-fails production when RESEND_API_KEY or the from addresses are missing. Sound.
- List-Unsubscribe (send.ts:242-247): mailto + URL on every email, `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on non-critical. BROKEN: the header URL is `/account/email/unsubscribe` (the page), which as an App Router page serves GET only; the POST-capable RFC 8058 handler lives at `/api/account/email/unsubscribe` and is referenced only by the page's confirm button. A one-click POST from Gmail/Yahoo therefore returns 405. The header advertises compliance the endpoint cannot honour, and users whose unsubscribe fails escalate to spam reports.
- The visible-link flow is correct: the page requires a click (C24 fixed link-prefetch auto-unsubscribes) and the button posts to the API route. The API route's own GET also applies the unsubscribe, but nothing links to it directly, so scanner risk is latent, not live.
- `u=` injection (send.ts:157-171): the userId woven into unsubscribe links is `input.userId`, which for dispatcher order emails is the ACTOR (the artist or admin who changed the status: orders/route.ts:274 passes `auth.user.id`, lifecycle.ts forwards it). A buyer's order email therefore carries the artist's user id in its unsubscribe URL and header; a working one-click would flip the artist's preferences from the buyer's inbox.
- `mailto:unsubscribe@wallplace.co.uk`: no code or configuration processes this mailbox; if it is unmonitored, mailto unsubscribes (the only one-click mechanism that currently "works", since the POST 405s) go nowhere.
- Suppressions: NOTHING writes `email_suppressions`. There is no Resend webhook route (`src/app/api/webhooks/` contains stripe and supabase only), and `bounced_at`/`complained_at` on email_events are never written. Meaning: hard bounces are re-attempted on every future send to that address forever; complaints never suppress anyone; the suppression gate in send.ts is dead code in practice; "sent" means accepted by Resend's API, and the platform has no idea whether anything was delivered. Sender reputation decays with no signal until Gmail starts junking transactional mail, at which point money emails quietly stop arriving with `email_events` still reading `sent`.

## Findings

| # | Severity | Finding | Evidence | Fix |
|---|---|---|---|---|
| 1 | Critical | `subscription_trial_ending` still sends as `promotions`: opt-in default false, preference- and vacation-suppressible, throttled 2/720h, news stream. Users with a preferences row get no trial-ending warning; their next contact is the charge or the dunning email. The known prior finding is unfixed. | src/app/api/webhooks/stripe/route.ts:1484; src/emails/templates/payments/SubscriptionTrialEnding.tsx (category promotions); supabase/migrations/016 (`promotions_enabled DEFAULT false`) | Recategorise to `orders_and_payouts` at both the send site and the registry entry. It is a billing-state notice, not marketing. |
| 2 | Critical | The paid-loan billing lifecycle emails nobody after setup: no venue receipt on invoice.paid, no dunning on invoice.payment_failed (the code comment claims "notify both parties"; the module contains zero notify calls), no cancellation notice, no setup-complete confirmation to the payer. A venue's dead card silently pauses billing, exactly the incident class under audit. | src/lib/placements/paid-loan-billing.ts:224-430 (zero sendEmail/sendAdminAlert/createNotification); dead `venue_paid_loan_invoice` template | Wire `venue_paid_loan_invoice` on invoice.paid, a paid-loan variant of `subscription_payment_failed` on payment_failed (both parties + admin alert on final attempt), and cancellation notices on subscription.deleted. All `orders_and_payouts`. |
| 3 | Critical | Failed sends are permanently unrecoverable: any prior email_events row (failed, render_failed, dry_run, skipped_*) makes the claim upsert return nothing and the retry is misreported as `duplicate` (ok:true). No retry cron or admin resend exists, so a transient Resend outage permanently drops money emails even when Stripe redelivers the triggering event. | src/lib/email/send.ts:79-87 (pre-check passes non-sent/queued rows) vs 199-218 (`ignoreDuplicates: true` blocks on ANY row); no retry mechanism in src/app/api/cron or admin | On claim conflict, re-read the row: proceed (re-claim) when its status is `failed`/`render_failed`, return duplicate only for `sent`/`queued`/`dry_run`/deliberate skips. Add a retry sweep or admin resend for `failed` rows. |
| 4 | High | Nothing ever writes `email_suppressions` and no Resend webhook exists; bounce/complaint columns are never populated. The suppression gate is inert, hard-bounced addresses are retried forever, complaints never suppress, and delivery failure is invisible (`sent` = API-accepted only). | Grep: only reader is send.ts:92; src/app/api/webhooks/ contains stripe + supabase only; email_events.bounced_at/complained_at written nowhere | Add a Resend webhook route (bounce, complaint, delivery events), write email_suppressions on hard bounce/complaint, stamp bounced_at/complained_at, and surface bounce counts in /api/health/email. |
| 5 | High | No `charge.dispute.*` handler: chargebacks arrive with no email to admin or artist and no record, despite response deadlines that forfeit the money by default. transfer.reversed is similarly silent. | Event-type inventory of src/app/api/webhooks/stripe/route.ts (no dispute events); :1852-1862 (transfer.reversed, DB update only) | Handle charge.dispute.created/closed: sendAdminAlert keyed on dispute id, notify the artist, record against the order. Alert admin on transfer.reversed. |
| 6 | High | A DB error on the idempotency claim is swallowed and reported as `skipped: "duplicate"` (ok:true) with nothing logged: any Supabase blip silently drops in-flight money emails while reporting success. | src/lib/email/send.ts:199-218 (`{ data: claimed }`, error discarded; `if (!claimed) return duplicate`) | Destructure and check `error`; on claim error return `ok:false` with the message and console.error so it reaches monitoring. |
| 7 | High | RFC 8058 one-click unsubscribe is broken: the List-Unsubscribe URL targets the GET-only page path, so mail-client POSTs get 405. The POST-capable handler at /api/account/email/unsubscribe is never referenced in headers. Failed unsubscribes convert to spam complaints, which (finding 4) are never recorded. | send.ts:245 (`/account/email/unsubscribe?...` in header) vs src/app/api/account/email/unsubscribe/route.ts (the actual POST handler); page.tsx serves GET only | Point the header URL at `/api/account/email/unsubscribe?u=...&c=...`. |
| 8 | Medium | EMAIL_DRY_RUN is honoured in production, and the health route neither watches `dry_run` nor fails on `failed`/`render_failed` counts. A leaked env var or a day of provider failures both leave /api/health/email returning 200 healthy. | send.ts:226-232 (no production guard); src/app/api/health/email/route.ts (healthy = env + dbReachable + skipped_no_api_key only) | Refuse EMAIL_DRY_RUN when `isProductionRuntime()` (or alarm loudly); include dry_run in WATCHED_STATUSES and fail health when failed+render_failed+dry_run exceed zero over 24h. |
| 9 | Medium | Rows stuck in `queued` (crash between claim and provider call, or a failed post-send status update) block their idempotency key forever; nothing sweeps them. | send.ts:84 treats queued as duplicate; no sweeper in cron routes | Sweep queued rows older than ~15 minutes to `failed` (then finding 3's retry path applies). |
| 10 | Medium | Dispatcher order emails carry the wrong user: orders PATCH passes the ACTOR's id (artist/admin) as userId, so buyer-facing emails embed the artist's `u=` in unsubscribe links and headers, and email_events.user_id attributes buyer mail to the artist. | src/app/api/orders/route.ts:274 (`actorUserId: auth.user?.id`); src/lib/orders/lifecycle.ts:128 (`userId: input.actorUserId`); send.ts:164-171, 245 | Pass the RECIPIENT's user id per trigger (buyer id for customer templates, artist id for artist_order_received), or omit userId when the recipient has no account. |
| 11 | Medium | 59 of 137 templates are dead, including money and legal ones: subscription_card_expiring, venue_paid_loan_invoice, venue_revenue_share_statement, artist_tax_document_ready, account deletion pair, operational_account_restricted/restored, legal_terms/privacy_update. Auth-critical mail (verify, reset, email change) flows through Supabase GoTrue outside the pipeline with zero logging, and no password-changed notification exists anywhere. | Coverage table above; grep of canonical ids across src/app, src/lib, scripts | Triage the 59: wire the money/legal ones (card expiring, paid-loan invoice, deletion confirmation, password changed via a GoTrue hook or custom SMTP), delete the ones that will never send, and document GoTrue as an unmonitored dependency. |
| 12 | Medium | Money-consequential events are preference-suppressible: purchase offers (offer_received_notification), placement accept/decline/cancel, and artist application outcomes all sit in `placements`, so an opt-out, vacation mode or the 10/24h throttle silently drops them (logged as ok:true skips). | offers/route.ts:529; placements/route.ts:1735-1996; admin/applications/[id]/route.ts:90, 257 | Move offers and application outcomes to a critical category; consider a new `agreements` critical category for placement accept/decline, or at minimum exempt them from vacation mode and throttling. |
| 13 | Medium | Curation and paid-loan payers get no recurring receipts and no cancellation notices (admin is alerted instead of the customer). UK distance-selling receipt expectations are met for orders but not for these recurring charges. | src/lib/curation/billing.ts:55-140 (admin alerts only); finding 2 for paid loans | Send curation renewal receipts and cancellation confirmations to `contact_email`, keyed on invoice/subscription id. |
| 14 | Low | placement_counter_offer_received is keyed on Date.now(), so a retried request double-sends; the codebase's own notifications.ts docstring documents this exact anti-pattern. | placements/route.ts:1167 | Key on the counter-offer row id (or placementId + offered terms hash). |
| 15 | Low | Bare-email idempotency keys burn on legitimate re-occurrence: a rejected artist who re-applies triggers neither confirmation nor admin alert; repeat venue registration and waitlist joins are silent. | apply/route.ts:235, 251; register-venue:94, 108; waitlist:53 | Include the application/submission row id in the key. |
| 16 | Low | Throttle is enforced per template while CATEGORY_RULES documents per category, so the intended category caps are looser in practice; and the welcome trio is sent as `tips` while registered as `recommendations`, so the preference toggle shown against the template is not the one honoured. | send.ts:130-138 (`.eq("template", ...)`); categories.ts:26-28; welcome.ts:114, 190, 233 | Align the throttle query with the documented semantics (or fix the docs), and make dispatch use the registry category everywhere a category is passed by hand. |
| 17 | Low | Refund rejection email greets the buyer's shipping name and says "Refund decision for order X" even when the requester (and recipient) is the artist; sent without userId so the footer link carries no user. | refunds/process/route.ts:141-160 | Branch the copy on requester role and pass the requester's user id. |
