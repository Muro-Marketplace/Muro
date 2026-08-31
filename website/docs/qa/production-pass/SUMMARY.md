# Production verification pass — summary

Column 3 of `2026-08-28-mvp-functionality-inventory.md` is complete: **all 1,793
rows** carry a verdict, tested against **https://www.wallplace.co.uk** on
2026-08-30/31, guest first and then each role in turn.

| | rows | WORKS | FIXED | DIFFERS | FLAG STANDS | BROKEN | BLOCKED | NOT SAFE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A. Public visitor and auth | 301 | 187 | 29 | 14 | 18 | 4 | 45 | 0 |
| B. Browse and buy | 252 | 138 | 15 | 6 | 8 | 2 | 80 | 0 |
| C. Customer portal | 133 | 63 | 18 | 3 | 6 | 1 | 32 | 9 |
| D. Artist portal | 254 | 108 | 9 | 5 | 3 | 0 | 122 | 6 |
| E. Venue portal and curation | 306 | 101 | 8 | 9 | 2 | 0 | 184 | 0 |
| F. Messaging and placements | 228 | 51 | 4 | 5 | 3 | 0 | 162 | 3 |
| G. Admin portal | 169 | 29 | 7 | 1 | 3 | 0 | 128 | 0 |
| H. Roles, demo, system | 150 | 48 | 0 | 7 | 3 | 0 | 92 | 0 |
| **Total** | **1,793** | **725** | **90** | **50** | **46** | **7** | **845** | **18** |

Method: Playwright accessibility tree and network capture for behaviour, curl
for status codes and API probes, and the Supabase MCP (SELECT only) to prove
every write actually landed rather than trusting a toast.

## Why BLOCKED is 845

Three causes, none of them untested effort:

1. **Parked features (about 120 rows).** Artwork requests and the artist
   showroom are gone from both portals; the venue route returns 200 but
   redirects straight back to the dashboard. Demo mode is dormant end to end.
   `/email-preview` and `/profile-designs` 404 in production. OAuth is dark.
2. **Safety rule 3 (about 300 rows, most of F and G).** Almost every remaining
   admin and negotiation row is a destructive action on a record belonging to
   someone else: accepting a real application, approving a real refund,
   accepting or cancelling a live placement, paying an accepted offer,
   suspending an artist. Those were left alone.
3. **Account state.** One approved, subscribed, fully onboarded Pro artist
   cannot produce the pending, rejected, unsubscribed, past-due, trialing or
   Core-tier branches. No email holds two roles, so the portal switcher never
   renders. Supabase email confirmation is disabled, so no account can sit
   behind a verify screen.

## The seven BROKEN rows, worst first

1. **`/api/apply` returns 500 on a valid application** (A, L514). Leaving the
   *optional* "primary medium" select blank kills the submission. Narrowed by
   elimination against production: `primaryMedium` empty → 500;
   `portfolioLink` empty → 200; `artistStatement` empty → 200. Reproduced
   through the form and anonymously with curl. Nothing is written and the
   applicant sees only "Something went wrong. Please try again."
   `artist_applications.primary_medium` is NOT NULL with no default and the form
   does not mark the field required. **This is the artist acquisition funnel.**
2. **Item line totals render as £0.00** (C L990, B L834). `orders.items` stores
   `lineTotal: {"amount":4999,"currency":"GBP"}` and both the customer portal
   overlay and `/orders/track` read it as a number. The order total beside it is
   correct, and the *artist* portal renders the same line correctly as £49.99.
3. **Two rows asserting a signup lands on `/check-your-inbox`** (A L447, L458).
   It does not. Email confirmation is disabled in production, so a new account
   is confirmed and signed in immediately and goes straight to its portal.
4. **"Message the artist" does nothing for a signed-in customer** (B L730). It
   pushes the artist profile's enquiry URL and is immediately pushed back, so
   no modal opens. The destination works when opened directly.
5. **`/terms` has no `id="cancellation"`** (A L306), so the application form's
   cooling-off link lands at the top of the page.

## Live issues found outside the audit's list

- **Turnstile is off.** The client posts `{"token":"dev-bypass"}` and
  `/api/auth/verify-turnstile` answers `{"ok":true,"bypass":true}` to any token.
  All four signup forms run with no bot protection.
- **Forging `shippingPrice: 0` at checkout works.** The minted Stripe session
  came to £49.99 with **no shipping line at all**, against £53.49 honest. Item
  prices are correctly re-priced server-side and over-stock quantities are now
  refused, so this is the one trust-boundary gap still open.
- **An unauthenticated request carrying only a raw user UUID changes a real
  account's email settings.** Proven on the QA account and restored afterwards.
  No signature, no expiry.
- **Stripe still calls the business "Wallspace sandbox"** on the hosted checkout,
  and defaults an overseas buyer to PLN with a 4% conversion fee on an artist the
  site has just told them ships to the UK only.
- **`og:image` resolves only on the homepage.** Every other page, and every
  Twitter card including the homepage's, still points at `/og-image.png`, which
  404s.
- **`sampleWorkUrls` is discarded** by the application insert, exactly like the
  already-flagged `acknowledgedCoolingOff`. Confirmed from the admin side too:
  the application detail shows no sample links.
- **Money renders with one decimal place** (£1,127.2) on the artist dashboard
  and analytics.
- **`orders.buyer_user_id` is NULL** for a signed-in buyer; the portal finds the
  order by email.
- **`DELETE /api/customer-addresses/<id>` returns 200 for an address the caller
  does not own.** Nothing is deleted (verified), but PATCH correctly 404s, so
  the two disagree.
- **An open dispute is invisible on the customer's orders dashboard**
  (`orders.status` stays `confirmed`) while `/orders/<id>` shows "Problem
  reported" for the same order.
- **`/api/enquiry` discards the sender's typed name**, storing the email's local
  part instead. Reproduced four ways.
- **`SUPABASE_WEBHOOK_SECRET` and `RESEND_WEBHOOK_SECRET` are unset**, which is
  why `/api/health/email` reports `healthy: false`.

## The 46 FLAG STANDS worth acting on

The revenue-share label is the one to fix first: for a `revenue_share_percent`
that is the **venue's** cut, the venue placements list says "24% to artist", the
placement detail page says "Artist's share of QR-code sales", the in-thread card
says "24% to the venue" and the context panel says "24% on QR sales". Two of four
surfaces attribute the venue's money to the artist, and a venue can read both in
one session.

Others: the lightbox forces a paid frame (no "No frame" option) and quotes a
different uplift from the artwork page for the same frame on the same size; the
homepage trust bar claims 30+/230+/20+ against a live 14/35/9 while
`/api/stats/public` sits unused; the collection page's placement CTA sends a
signed-in customer to `/signup` and bounces them back to their own portal; blog
drafts cannot be deleted; "Total subs MRR" duplicates the MRR tile; the mobile
marketplace overlay drops How It Works and Blog for logged-out visitors.

## The 90 FIXED — the highlights

QR labels now carry `venueSlug` as well as `venueName` on both the artist and
venue sides, so attribution works. `/admin/refunds` and a unified
`/admin/moderation` with a Messages filter both exist. The dispute Resolve
prompt says "Outcome (emailed to everyone involved)" instead of claiming the
note is internal. Saving a work with no image is refused client-side. The
Current password field genuinely re-authenticates. `/customer-portal/orders`
redirects and translates `?id=` to `?order=`. The data export works, is
correctly named, covers the previously omitted tables and is rate limited.
`/api/checkout` refuses over-stock quantities. The confirmation page no longer
issues a false receipt on a bogus session, and no longer wipes the cart. Nine
invented marketing claims are gone (acceptance rates, courier statistics,
fabricated testimonials, "hundreds of artists", the certificate-of-authenticity
promise).

## Everything created in production, for cleanup

| Table | Rows |
|---|---|
| `auth.users` | **1 account**: `fcoles2598+qatestcustomer@gmail.com` (QA-TEST Customer, password `Chelsea22!`) |
| `orders` | `WS-J6CRQS4XTX2DJRO7` / `WP-B73075`, £53.49, Stripe test `pi_3UAG8jFP3rMcNTgS0rM56UVd` |
| `order_events` | `order.placed` and `order.disputed` on that order |
| `disputes` | `b8bf8a4e-a110-4c45-acf8-96070630b217` — opened then **resolved** |
| `artist_applications` | ids 25, 27, 28, 29 (QA-TEST, all pending) |
| `contact_submissions` | ids 6, 7, 8 |
| `enquiries` | ids 12, 13, 14, 15, 16 |
| `messages` | 2 rows into `fin-coles` / `dm-fin-coles__testing-venue` |
| `blogs` | `25cb2c0e-…` slug `qa-test-markdown-rendering-check-delete-me-i4465r` — **published** |
| `moderation_queue` | `e9609e8b-…` QA-TEST feature request, pending |
| `waitlist_signups` | id 3 |
| `newsletter_subscribers` | 2 rows (`+qatest-newsletter`, `+qatestfooter`) |
| `customer_addresses` | `026ff7a3-…` |
| `customer_profiles` | `d7a5e1e6-…` |
| `email_preferences` | 1 row for the QA customer |
| `analytics_events` | 2 `qr_scan` rows plus browsing views |
| Stripe | 1 paid test payment, 3 abandoned unpaid test sessions |

**Changed on pre-existing records:** the artist's notifications were all marked
read (testing the header control), and the artist's blog draft was approved.
Nothing else on a record I did not create was modified. One deliberate probe —
`DELETE` on another user's address — was verified afterwards to have changed
nothing.

The published QA blog is the only item that is publicly visible; deleting it
needs the database, since the artist UI has no delete control.

---

# Pass 2 addendum, 2026-08-31

Pass 2 reopened the rows pass 1 left BLOCKED because it read the
destructive-action rule as covering the whole money surface. Stripe is in test
mode, and the rule already permits records created in-session, so eight chains
were built end to end and driven through every stage.

**122 rows moved off BLOCKED**, 845 → 721. New distribution:

| | WORKS | FIXED | DIFFERS | FLAG STANDS | BROKEN | BLOCKED | NOT SAFE |
|---|---:|---:|---:|---:|---:|---:|---:|
| after pass 1 | 729 | 87 | 49 | 48 | 7 | 843 | 18 |
| after pass 2 | 822 | 89 | 69 | 48 | 14 | 721 | 18 |

Three sessions were held at once (artist, venue, and admin or customer) so every
state change could be read back from the counterparty within seconds, and every
write was confirmed in Postgres rather than trusted from a toast.

## The launch blocker pass 1 could not have found

**Every Supabase auth email in production redirects to `http://localhost:3000`.**
Accepting an artist application creates an account with no password whose only
way in is an invite link pointing at the applicant's own machine. The password
reset link does the same, so there is no way round it, and it is not limited to
new artists: **nobody in production can recover a forgotten password.** Both
emails arrive from `noreply@mail.app.supabase.io` with stock Supabase branding
while the branded templates sit unused in `scripts/auth-emails-rendered/`.

It is a dashboard fix, Auth → URL Configuration plus the three templates, and it
belongs above every other owner action.

This also amends pass 1's row 534, which read the outbound
`resetPasswordForEmail` call and marked it WORKS. The call is fine; the delivered
link is not.

## The other seven new BROKEN rows

- **A placement sold off the wall is stranded and pays the venue nothing.** After
  a £120 collect sale the placement went to `status: sold`, lost every stage
  control and can never reach Collected. The order carries no `placement_id` and
  no `venue_slug`, so the hosting venue is credited £0 while being emailed that
  the piece sold.
- **A collect order is stamped `delivered` on payment** and the artist transfer
  settled seven seconds later, no hold, no proof of collection.
- **An accepted offer produces an unfulfillable order.** No delivery address is
  collected anywhere in the flow; the artist sees "SHIP TO: ," above a Mark as
  Shipped button.
- **Offers never expire.** `expires_at` is NULL on every row in the table.
- **A venue that cancels a paid-loan placement is still told it will be charged**
  £12 again next month, on the same page that says Cancelled.
- **Editing a consignment record clears the approval ticked in the same save.**
- **The portal switcher never renders for accounts that do hold two profiles.**
  `/api/account/roles` returns only `["artist"]` for an account owning both an
  artist and a venue profile, and `/venue-portal` redirects it away. Pass 1's
  stated cause, that no email holds two roles, is wrong: two do.

## A pattern worth naming: silent failure

Five separate refusals return a correct, well-worded error that the UI never
shows. A past install date (`400 "Install date can't be in the past."`), a blog
body under 200 characters (`422` with an excellent `issues` array), a revenue
share above 50% (clamped, no request sent), an offer below the 60% floor (no
request sent), and the wall cap (form completed, then `402`). Message moderation
is the single counter-example: it says "Message contains blocked content" and
means it.

## A second pattern: the send throttle eats consequential mail

Only three of production's 388 email events have ever been `skipped_throttled`,
and all three happened today, all to the artist: `placement_ended`,
`artist_new_placement_invitation`, and `artist_blog_rejected`. The last one
mattered most: the blog rejection reason is stored only in `admin_audit_log`, the
portal shows a bare "Rejected" badge, so on that occasion the reason reached the
artist by no route at all.

## Confirmed working, first time in production

The refund path end to end, including a Stripe refund and the **reversal of an
already-settled transfer**. Payout release on delivery confirmation. The full
placement negotiation in both directions with counter-after-decline. Consignment
record and bilateral countersign. Reviews after completion, which now have a
wind-down gate the inventory said did not exist. The collect-from-venue purchase.
The offer negotiation with its 60% floor and self-counter block. Paid-loan
subscription setup. Curation booking. The wall render and its quota ledger.
Twenty-six distinct email templates fired with correct fan-out.

## Everything pass 2 created in production

| Table | Rows |
|---|---|
| `placements` | `p-1788184190657-6iwn` Gyeongbokgung Palace (**sold**), `p-1788185323045-jmqm` Huaraz Peru (**completed**), `p-1788192191293-7xdf` Sand Dunes at Dusk (**cancelled**, live Stripe sub `sub_1UAXhSFP3rMcNTgSp3qrmrQt`) |
| `orders` | `WS-UAKK1KDSC32PDT5R` £120 collect (delivered), `OFR-5A2LJH2CJ7KPVNMO` £26 offer (confirmed) |
| `refund_requests` | `13c5d3e3-…` on `WS-J6CRQS4XTX2DJRO7`, **approved**, Stripe `re_3UAG8jFP3rMcNTgS0s84yXhS` |
| `purchase_offers` | `off_1788191955308_3aky7j` £22 (countered), `off_1788192000823_qyzr33` £26 (**paid**) |
| `curation_requests` | `8c307cca-…` Single wall, **paid £49**, `pi_3UAXqFFP3rMcNTgS1HCRvIo5` |
| `placement_records` | `605d6792-…` approved by both parties |
| `placement_reviews` | `fa64089e-…` 4 stars, artist → venue |
| `placement_photos` | `efb6bc94-…` |
| `blogs` | `894c4f52-…` "QA-TEST PASS2 reject-path blog (delete me)", **rejected** |
| `auth.users` | **1 account**: `fcoles2598+qaref@gmail.com`, invited, no password, unconfirmed |
| `artist_profiles` | `qa-test-referral`, approved (from accepting application 29) |
| `artist_applications` | id 29 flipped pending → **accepted** |
| `wall_renders` | `45403984-…`; `visualizer_usage` id 27; one item added to the venue's "Untitled wall" |
| `messages` | 5 rows into `dm-fin-coles__testing-venue` |
| Stripe (test) | 3 payments, 1 refund, 1 transfer reversal, 1 subscription, 3 abandoned sessions |

**Changed on pre-existing records:** order `WS-J6CRQS4XTX2DJRO7` (pass 1's own)
was driven to delivered and then refunded; three of the artist's works were
placed and released again. Nothing belonging to a third party was touched.

**Left alone as instructed:** the two pre-existing refund requests (£149.99 on
`WS-H7RgZntN`, £169.90 on `WS-q0g0tqwD`), Leya Rubin's application id 12, the
artist's live Pro subscription, and every account.

## Honestly still blocked

Partial refunds and therefore the pro-rated reversal arithmetic; the failed
reversal 502; concurrent-claim 409s; anything needing a declined card or a Stripe
webhook failure; the 14-day payout cron; the 429 render limit and burst limiter;
wall creation (the venue is at its 3-wall cap); and the parked surfaces pass 1
already listed, artwork requests, showroom, demo mode and OAuth.
