# Area H production run log — roles, demo, notifications and system behaviour

Site: https://www.wallplace.co.uk. Date: 2026-08-31.
Roles: all four accounts used across the pass, plus two production endpoints
that report on the system directly.

Most of area H is cross-cutting behaviour already evidenced in areas A–G. Two
things made a large block of it testable that would otherwise have been blind
guessing: the **email ledger** and `/api/health/email`.

---

## The email pipeline, evidenced rather than assumed

`GET /api/health/email` (production, unauthenticated):

```json
{"healthy": false,
 "env": {"RESEND_API_KEY": true, "EMAIL_FROM_TX": true, "EMAIL_FROM_NOTIFY": true,
         "EMAIL_FROM_NEWS": true, "CRON_SECRET": true,
         "SUPABASE_WEBHOOK_SECRET": false, "RESEND_WEBHOOK_SECRET": false},
 "dbReachable": true,
 "last24h": {"sent": 38, "failed": 1, "skipped_no_api_key": 0,
             "render_failed": 0, "dry_run": 0}}
```

`healthy: false` is caused by the two unset webhook secrets, which are two of
the WS0 owner actions PROGRESS already lists as outstanding. Everything else is
configured and the pipeline is genuinely sending.

Querying `email_events` for the window of this pass gives a complete, dated
record of exactly which templates my actions fired — **every one `sent`**:

| Template | n | What triggered it |
|---|---|---|
| `support_request_received` | 3 | the three contact-form submissions |
| `admin_alert` | 13 | contact, enquiries, applications, the dispute |
| `customer_waitlist_confirmation` | 1 | the waitlist signup |
| `newsletter_subscribe_confirm` | 2 | the two newsletter subscribes |
| `customer_welcome` | 1 | the QA customer signup |
| `artist_application_submitted` | 4 | the four QA applications |
| `artist_order_received` | 1 | the £53.49 purchase, to the seller |
| `customer_order_placed` | 1 | the same purchase, to the buyer |
| `message_unread_notification` | 6 | the enquiries and the venue→artist message |
| `order_dispute_opened` | **2** | the dispute — **both parties** |
| `order_dispute_resolved` | **2** | the resolution — **both parties** |
| `artist_blog_published` | 1 | the blog approval |

Twelve distinct templates from one pass, each landing within seconds of its
trigger and each with the right fan-out. The dispute pair is the clearest: two
rows on open and two on resolve, which is the "tell both parties" behaviour the
audit wanted.

**This also corrects a verdict I wrote earlier.** In area G I recorded that no
author notification appeared for the blog approval. The email ledger shows
`artist_blog_published` sent at 22:49:12, seconds after I approved it. The
email fires; only the in-app bell is missing. The area G row has been amended.

## Cron and quota, probed directly

```
GET /api/cron/qr-scan-digest        -> 401   (fails closed without CRON_SECRET)
GET /api/walls/quota  (no auth)     -> 200
    {"tier":"guest","limits":{"daily":0,"monthly":0,"wall_uploads_daily":0,
     "saved_walls":0,"saved_layouts_per_wall":0,"can_publish_showroom":false},
     "daily_resets_at":"2026-08-31T00:00:00.000Z",
     "monthly_resets_at":"2026-09-01T00:00:00.000Z","override_active":false}
```

The guest tier is correctly capped at nothing, the UTC reset boundaries are
right, and the flag is on (the endpoint would 404 otherwise).

One cron is evidenced by its output rather than its trigger: the artist's bell
carries a `qr_scan_digest` row ("3 QR scans yesterday, Top: Vietnamese Village")
linking `/artist-portal/analytics`, so the daily job has run and produced both
the digest and its bell.

## Roles

Confirmed across all four accounts:

| Account | `user_type` | `/api/account/roles` | Lands on |
|---|---|---|---|
| fcoles2598@gmail.com | admin | — | `/admin` |
| finbin1@hotmail.co.uk | artist | `["artist"]` | `/artist-portal` |
| test@testingvenue.com | venue | `["venue"]` | `/venue-portal` |
| fcoles2598+qatestcustomer@ | customer | `["customer"]` | `/customer-portal` |

No email in this pass holds more than one account, so every dual-role row is
honestly blocked — including the portal switcher, which never renders.

Header nav per role is exactly as specified: logged out gets Marketplace / How
It Works / Blog / Spaces; artist and customer get Marketplace / Spaces; venue
gets Marketplace / **Wallplace Curated** / **Blog**.

**Two corrections to the audit's picture:**

- The artist portal dropdown **does** mirror the sidebar. It lists profile,
  portfolio, messages, enquiries, placements, offers, collections, saved,
  orders, labels, posts, blogs, analytics, billing and settings. The parity gap
  the flag describes is not present.
- The customer messaging facade is **gone**, not broken. There is no inbox, no
  fake slug and no envelope — just an explainer that artists reply by email.

The one nav flag that stands is the mobile marketplace tab set: at 390×844 on
`/browse` logged out, How It Works and Blog are missing from the overlay.

## Demo mode

Dormant end to end in production. The `/demo` cards link public profiles,
`/api/demo/login` 405s on GET, the demo user ids are unset so `isDemoUser` is
permanently false, and neither the banner nor any demo guard can fire. Every
demo row is blocked for that single reason.

## Onboarding

The venue checklist is the useful specimen: "3 of 5 complete", with green ticks
on profile, preferences and first enquiry, and empty circles on Browse artist
portfolios and Set up payouts. The artist's is dismissed via localStorage on the
same browser while the venue's is not, which is exactly the per-browser
behaviour described.

The customer portal has no checklist and opens on My Orders, and the QA
customer's signup fired `POST /api/auth/welcome` -> 200 `{"ok":true,"sent":true}`
with exactly one `customer_welcome` in the ledger.

---

## Created during area H

Nothing. Area H was read-only: two unauthenticated endpoint probes and one
SELECT over `email_events`.
