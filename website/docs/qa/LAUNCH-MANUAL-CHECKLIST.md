# Launch checklist: the things only a person can do

Consolidated 2026-08-31 from two QA passes. Everything here is outside what
code can fix from a session: dashboard settings, secrets, legal decisions, and
records needing a judgement call.

Status column: **verified** means checked against production or the live
database on 2026-08-31; **reported** means it came from a QA pass and has not
been independently re-checked.

---

## 0. Deployment status: everything is merged

A handover note said "production is still running the pre-audit build. None of
the fourteen fixes reach users until it ships." **That was true when written and
is no longer true.** Both bodies of work are now in main and deployed:

- the transaction-hardening plan, the P2/P3 wave, and the QA criticals, highs
  and mediums (PRs #71, #73, #74, #76, #77, #78, #79, #80)
- the production verification pass and its fourteen fixes, merged as **PR #81**
  at 16:25 on 2026-08-31

Verified by diffing that branch against main: nothing of its content is
missing. Note the branch still reports "24 commits ahead" because #81 was a
squash merge, which is expected and not a sign of unmerged work.

The practical consequence for this list: **`ORDER_TOKEN_SECRET` now does
something the moment you set it**, rather than waiting on an unmerged branch.

---

## 1. Delete public test content (5 minutes, live site) — verified

Four junk posts are public on /blog under a real artist's name. The artist UI
has no delete control, so this needs SQL:

```sql
delete from blogs where slug like 'qa-test-%';
```

Verified present on 2026-08-31:

| slug | status |
|---|---|
| `qa-test-blog-2026-08-30-delete-me-ngj7rw` | published |
| `qa-test-markdown-rendering-check-delete-me-i4465r` | published |
| `qa-test-pass2-reject-path-blog-delete-me-6bm1z5` | rejected |

`teest-791hwe` (27 May, published) is also junk but does **not** match the
`qa-test-%` pattern, so delete it separately if you want it gone.

---

## 2. Environment variables (Vercel → Settings → Environment Variables)

| Variable | Why | Status |
|---|---|---|
| `RESEND_WEBHOOK_SECRET` | Bounces and complaints are not recorded without it | **verified missing** — `/api/health/email` reports `healthy: false` |
| `SUPABASE_WEBHOOK_SECRET` | Email health | reported missing |
| `ORDER_TOKEN_SECRET` | 32+ chars. Activates unsubscribe-link signing. Optional in `env.ts`, so the protection stands down rather than breaking links when unset | reported — the code is merged (PR #81), so setting this takes effect immediately |
| `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Bot protection is entirely off | reported |

Also create the **Resend webhook** itself, pointing at
`https://www.wallplace.co.uk/api/webhooks/resend`, before setting its secret.

---

## 3. Stripe — the largest item, and it is now two jobs

### 3a. Test mode (what production uses today)

Open the existing endpoint and enable these. Handlers exist for every one and
sit inert until the events arrive:

```
invoice.payment_failed              invoice.payment_action_required
customer.subscription.trial_will_end customer.source.expiring
charge.dispute.created              charge.dispute.closed
charge.refunded                     refund.failed
account.updated                     payout.paid
payout.failed                       transfer.reversed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
```

### 3b. Live mode has NO webhook endpoint at all — verified 2026-08-31

Checked directly against the live account (`acct_1TKnAGFKpqBQjvlK`):
`GET /v1/webhook_endpoints` returns an empty list. Not "missing some events" —
**nothing is configured**. The moment you switch to live keys, every payment,
dispute, refund, payout and subscription event goes nowhere.

Before launch, create it:

- URL `https://www.wallplace.co.uk/api/webhooks/stripe` — the `www` matters,
  because the apex 307-redirects and redirects break webhook POSTs
- the full list from 3a, plus `checkout.session.completed`, `invoice.paid`,
  and `customer.subscription.created` / `.updated` / `.deleted`
- copy its signing secret into `STRIPE_WEBHOOK_SECRET` in Vercel

The Stripe MCP connector cannot do any of this: its key is read-only for
webhook endpoints (`PostWebhookEndpoints` → permission denied) and it cannot
reach test mode at all.

### 3c. Two dashboard settings — reported

- Checkout shows **"Wallspace sandbox"** to buyers. Rename it.
- **Adaptive pricing** defaults overseas buyers to PLN with a 4% conversion
  fee. Turn it off or make it deliberate.

---

## 4. Supabase dashboard

- Enable **leaked-password protection** (dashboard only; the MCP has no
  auth-config tool). Confirmed still disabled by the security advisor.
- **Email confirmation on or off** — no longer blocking anything, since sign-up
  routing now reads whether a session came back and is correct either way.
  Preference only.

---

## 5. Optional SQL backfill (safe, no rush) — reported

15 orders were placed by people with real accounts but have no
`buyer_user_id`. New orders record it; the old ones need:

```sql
update orders o
set buyer_user_id = u.id
from auth.users u
where o.buyer_user_id is null
  and lower(o.buyer_email) = lower(u.email);
```

Nothing reads the column yet, so this is inert until something does.

---

## 6. Records needing a judgement call — verified 2026-08-31

| Record | Problem |
|---|---|
| Order `WP-WSP06D` | £64.49 taken, `artist_slug` NULL. On no artist's queue, nobody told to post it. The code path is fixed; this row still needs assigning. |
| `WS-q0g0tqwD` | Full refund request **pending since 12 April** (four and a half months) |
| `WS-H7RgZntN` | Full refund request pending since 14 May |
| 3 accepted offers | Accepted but never paid, oldest from April |
| 2 works | Duplicate **active** revenue-share placements at the same venue, at conflicting rates, with nothing deciding which governs a sale |

A clean-slate test-data reset clears all of these at once if they are all
test-era.

---

## 7. Decisions only you can make

### Seed data
20 of 29 venues and 27 of 41 artists on the public marketplace do not exist.
Only **9 real venues and 14 real artists** are in the database. A real artist
can spend a metered approach on a business that is not there, and the £9.99/mo
plan is sold on venue names that are invented. Binning this also removes the 7
works whose closed price ranges were misleading.

### Venue identity: paywalled or public?
The site answers both ways. `/venues/[slug]` refuses to name a venue, the
artwork page prints it in plain text, and `/api/venues/demand` ships the slug.
You are charging £9.99/month for that name. Pick one — the inconsistency is the
actual problem. (The slug half was an explicit decision on 2026-08-28, which is
why it was not reversed unilaterally.)

### Membership cancellation — reported, wants a lawyer
The application form makes consumer applicants tick "I acknowledge my 14-day
right to cancel". The terms have no membership cancellation clause at all, and
the Artist Agreement says the opposite: 30 days' written notice. The only
cooling-off text on the site is about buyers returning artwork, which is a
different right held by a different person. The anchors and the stored
acknowledgement exist; the contradiction was deliberately not papered over.

### VAT, commission invoicing, HMRC platform reporting
None of it exists. HMRC's digital-platform rules need seller identifiers you
are not collecting, so it cannot be satisfied retroactively at the deadline.
Needs your accountant.

### Clean-slate reset
17 test orders are in the books permanently otherwise.

---

## 8. One test nobody has run

No complete purchase has been driven on production since the fixes landed.
Stripe is in test mode, so it is cheap. This is the single highest-value
verification left.
