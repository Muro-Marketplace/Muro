# Remediation plan from the production verification pass

Source: `docs/qa/2026-08-28-mvp-functionality-inventory.md` (column 3 complete,
2026-08-31) and the eight run logs in `docs/qa/production-pass/`. Every item
below cites the inventory row that evidences it.

Three tracks, in this order:

1. **Track A — code fixes.** Everything I can land without a decision from you.
2. **Track B — owner actions.** Config and dashboard work only you can do.
3. **Track C — the second QA pass.** The money and lifecycle flows the first
   pass left untested, and which are now testable on self-created records.

---

## Corrections to the pass itself

Three rows were over-called and have been amended in the inventory:

- **`sampleWorkUrls` is persisted.** `/api/apply` merges it into
  `portfolio_link` as `Sample N: <url>` lines (route lines 87–101). Application
  id 29 stores `"https://x.test\nSample 1: https://a.test"`. My earlier reading
  came from a row whose sample slots were empty. Rows A L504, G L2359.
- **The unsubscribe API's uniform response is deliberate.** It calls
  `auth.admin.getUserById` before upserting and answers identically either way
  as an anti-enumeration measure, documented in the route. Row C L1124.
- Only the unsigned `u` parameter and the missing rate limit remain from that
  flag.

---

# Track A — code fixes

## A1. Security and money (do first)

### A1.1 `/api/apply` returns 500 on a valid application  ·  row A L514
`src/app/api/apply/route.ts:84` writes `primary_medium: d.primaryMedium || null`
into a `NOT NULL` column with no default. The same file already does it
correctly at line 206 (`d.primaryMedium || ""`) for the profile bridge.

**Fix:** `|| ""` at line 84. **Test:** POST with `primaryMedium: ""` returns 200
and the row lands; assert against the live-schema snapshot so the NOT NULL set
can't drift back. Add `portfolio_link` and `artist_statement` to the same test,
since they take the coalesced path today and would fail the same way if changed.

### A1.2 Checkout trusts the client's shipping price  ·  row B L849
`src/app/api/checkout/route.ts:661` passes `shippingPrice: it.shippingPrice ?? null`
from the request body into `calculateOrderShipping`. The helper is correct; its
input is not. Proven: forging `shippingPrice: 0` minted a session at £49.99 with
no shipping line, against £53.49 honest.

**Fix:** resolve the per-size and work-level shipping price from the
`artist_works` rows the route already fetches for item pricing, and ignore the
client field entirely, the way item prices are already handled.
**Test:** a forged `shippingPrice: 0` and a forged `9999` both produce the same
session total as the honest payload.

### A1.3 Unsubscribe accepts an unsigned user id  ·  row C L1123
Proven live on my own account: an unauthenticated GET carrying only a raw UUID
flipped `newsletter_enabled` to false and created the row.

**Fix:** HMAC the link as `u` + category + expiry, verify server-side, keep the
uniform response. Update `EmailShell`'s footer link and the `List-Unsubscribe`
header to carry the signed token (which also fixes the footer link landing on
the failure state, row C L1121). Add a rate limit.

### A1.4 `DELETE /api/customer-addresses/[id]` reports success on a foreign id  ·  row C L1031
Nothing is deleted — verified, the other user's row survived — but it returns
200 where `PATCH` correctly returns 404.
**Fix:** match `PATCH`. **Test:** both verbs 404 for a foreign id.

### A1.5 Login accepts a shorter password than signup  ·  row A L484
`minLength=6` on `/login`, 8 on both signup forms. **Fix:** 8 everywhere.

## A2. Legal and compliance

### A2.1 The cooling-off acknowledgement is never stored  ·  row A L512
`acknowledgedCoolingOff: true` is posted and `artist_applications` has no column
for it. That checkbox exists to be evidenced later.
**Fix:** migration adding `acknowledged_cooling_off boolean`, add it to
`applySchema` and the insert. Number it above the highest applied migration
(prod is at 125) and check `list_migrations` first — prod runs ahead of the repo.

### A2.2 `/terms` has no `#cancellation` anchor  ·  row A L306
The application form's cooling-off checkbox links `/terms#cancellation`; the only
ids on the page are `main-content` and a React-generated `_R_`.
**Fix:** `id="cancellation"` on the Consumer Contracts Regulations section.

### A2.3 The contact reference is never shown  ·  row A L276
`contact_submissions.reference` is generated and stored (`WP-62828CC9` and two
others from this pass) but `/api/contact` returns `{"success":true}` and the
success screen shows nothing.
**Fix:** return the reference and render it on the success screen.

### A2.4 Waitlist and venue-type fields are discarded  ·  rows A L364, A L470
`waitlist_signups` is `id, name, email, user_type, created_at` — no phone, venue
name or location. `venue_registrations` has no column for the "Other" venue-type
description the form asks for.
**Fix:** either add the columns or remove the inputs. Recommend adding, since
both are asked for deliberately. One migration covers both.

### A2.5 Terms acceptance has no verified moment and no re-acceptance  ·  rows H L2630, H L2634
Blocked behind Track B's email-confirmation decision. If confirmation goes on,
re-stamp acceptance from the verified token. Either way, add a
`CURRENT_TERMS_VERSION` constant and a login-time check so the next revision can
prompt.

## A3. Claims and honesty

### A3.1 The homepage trust bar overstates by 2x, 6.5x and 2x  ·  row A L123
It renders 30+/230+/20+ from the static seed. `/api/stats/public` returns
`{"total_artists":14,"total_artworks":35,"total_venues":9}` and has zero callers.
Your own admin dashboard already distinguishes "REGISTERED ARTISTS (DB) 14" from
"LISTED (MARKETPLACE) 41".
**Fix:** wire the trust bar to `/api/stats/public`, or relabel it to the
marketplace-listing basis the admin page uses. Do not ship the current numbers.

### A3.2 Copy that still contradicts itself  ·  rows A L230, A L163, A L253, A L477, D L1228, E L1629, G L2361
`/how-it-works` venue step 03 omits paid loan · `/artists` points two
differently-labelled CTAs at `/spaces` · two stray-space typos
(`/sustainability`, `/signup/venue`) · "Update Availability" opens Placements ·
the venue digest toggle describes the wrong thing · the Accept-application modal
asserts an invite email unconditionally.

## A4. Buyer and seller correctness

### A4.1 Item line totals render £0.00  ·  rows B L834, C L990
`orders.items[].lineTotal` is `{amount: pence, currency}`. The artist page reads
both shapes (`artist-portal/orders/page.tsx:383-385`: `quantity ?? qty`, prefer
`lineTotal.amount`, fall back to `price * qty`). The customer page
(`customer-portal/page.tsx:287-288`) and `orders/track/page.tsx:226-229` read
only the legacy shape, so both fields are undefined and it prints `× ` and £0.00.
**Fix:** extract the artist page's reader into `lib/order-items.ts` and use it in
all three. **Test:** both shapes render correctly in all three surfaces.

### A4.2 Revenue share labelled as the artist's cut  ·  rows F L2135, E L1657
`revenue_share_percent` is the **venue's** cut. Four surfaces, two wrong:
venue placements list "24% to artist" ✗ · placement detail "Artist's share of
QR-code sales" ✗ · in-thread card "24% to the venue" ✓ · context panel
"24% on QR sales" (unattributed).
**Fix:** one shared label helper, used everywhere. Highest-value copy fix on the
list, because it misstates who gets the money.

### A4.3 "Message the artist" is inert for signed-in customers  ·  row B L730
It pushes `/browse/<artist>?enquiry=1&work=<id>` and is immediately pushed back.
The destination works when opened directly.
**Fix:** open the enquiry modal in place, matching the lightbox pill.

### A4.4 The lightbox forces a paid frame  ·  rows B L690, B L721
Same work, same size: the lightbox offers only "Black oak +£80" / "White wooden
+£160" with index 0 preselected; the artwork page offers "No frame" (default),
"+£103", "+£206". Two defects — no unframed option, and a different uplift.
**Fix:** share the artwork page's frame model and its perimeter scaling.

### A4.5 An open dispute is invisible on the customer's orders page  ·  row C L988
`orders.status` stays `confirmed` after `POST /api/disputes`, so no off-pipeline
badge renders, while `/orders/<id>` shows "Problem reported".
**Fix:** surface the open dispute on the dashboard from the `disputes` row.

### A4.6 `og:image` 404s everywhere except the homepage  ·  row A L109
Homepage `og:image` resolves (generated route, 200 PNG). Its `twitter:image`, and
`og:image` on `/browse`, `/pricing`, `/about` and the rest, all point at
`/og-image.png` which 404s.
**Fix:** point every card at the generated route.

### A4.7 Money renders to one decimal place  ·  area D
`£1,127.2` on the artist dashboard, Summary panel and analytics revenue card.

### A4.8 `orders.buyer_user_id` is NULL for a signed-in buyer  ·  row B (webhook)
The portal finds the order by email, so nothing is visibly broken, but an email
change orphans it and the hard-delete sweep misses it.
**Fix:** stamp the buyer's user id from the checkout session.

## A5. Smaller standing flags

Mobile marketplace tabs drop How It Works and Blog for logged-out visitors
(A L53, H L2598) · collections "Clear all" always renders (B L622) · the
collection placement CTA bounces a signed-in customer to their own portal
(B L748) · saved-addresses empty-state CTA is `<a href="#">` (C L1041) · no way
to delete a blog draft (D L1313) · analytics placements table renders raw
lower-case statuses (D L1245) · "Total subs MRR" duplicates the MRR tile
(G L2477) · no `interested_in_collections` control (E L1606) · the "largest
tier" assumption is false where tiers are stored out of size order (B L682) ·
`/api/enquiry` overwrites the sender's name with the email local part (B L279).

---

# Track B — owner actions

| Action | Why | Evidence |
|---|---|---|
| Set `TURNSTILE_SECRET_KEY` + site key | All four signup forms have no bot protection; the API answers `{"ok":true,"bypass":true}` to any token | A L557 |
| Set `SUPABASE_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET` | `/api/health/email` reports `healthy:false` for exactly these two | H |
| Stripe: rename "Wallspace sandbox" | It is what buyers see on the hosted checkout | B log |
| Stripe: adaptive-pricing decision | Overseas buyers are quoted PLN with a 4% conversion fee on UK-only artists | B log |
| **Decide: Supabase email confirmation** | Off today. Drives rows A L447, A L458, A L418–420 and the verification copy in ~6 places | A log |
| Decide: hard vs soft account deletion | The two endpoints assert contradictory legal requirements; only the hard path is wired to the UI | C L1066, C L1071 |

---

# Track C — the second QA pass

The first pass left 845 rows BLOCKED. About 300 were money or lifecycle actions
I declined as "other people's records". On review that was too cautious: **Stripe
is in test mode**, and with the artist, venue, admin and QA-customer logins most
of those chains can be built end to end from records created in-session, which
the safety rules explicitly permit.

Testable on self-created records, in dependency order:

1. **Placement lifecycle.** Venue requests → artist counters → venue counters →
   artist accepts → schedule → install → live → collect, with an undo at each
   stage. Unblocks most of E and F.
2. **Paid-loan billing.** Create a paid-loan placement, set up billing as the
   venue with a test card, confirm the chip states, then cancel.
3. **Offer lifecycle.** Venue offers → artist counters → venue accepts → pay
   with a test card. Exercises the 60% floor, the counter chain and
   `/api/offers/[id]/checkout`.
4. **Refund, end to end.** Customer requests a refund on the QA order
   `WS-J6CRQS4XTX2DJRO7` → admin approves → Stripe refund plus pro-rated
   transfer reversal. Entirely self-created. **The single highest-value
   untested path.**
5. **Order lifecycle.** Artist marks processing → shipped with tracking →
   customer confirms delivery → payout release.
6. **Collect-from-venue.** Set an in-store offer on a live placement as the
   artist, then buy it as the customer. Unblocks the whole collect cluster in B,
   which had no live data at all.
7. **Application accept.** Accept one of the four QA-TEST applications; tests
   the invite path, the profile bridge and the `user_metadata` rewrite.
8. **Curation booking**, wall render and quota, blog reject path, consignment
   record and countersign, placement photos, reviews, message moderation.

**Still genuinely off-limits:** approving the two pre-existing refund requests
(£149.99 and £169.90 on other people's orders), accepting or rejecting Leya
Rubin's real application, cancelling the artist's live Pro subscription, and
account deletion. Payout webhooks and the 14-day cron need Stripe or time.

---

# Suggested sequence

1. A1 (security and money) + A4.1 (£0.00) — one branch, all testable now
2. Track B config, in parallel, by you
3. A2 (legal) once the email-confirmation decision lands
4. Track C pass 2, which will find more
5. A3, A4 remainder, A5

## Cleanup

Everything this pass created is listed in `docs/qa/production-pass/SUMMARY.md`.
One item is publicly visible: the QA blog at
`/blog/qa-test-markdown-rendering-check-delete-me-i4465r`. It needs a database
delete, because A5 records that the artist UI has no delete control.
