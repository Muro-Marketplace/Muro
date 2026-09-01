# Fix everything the two production passes found

Two QA passes ran against **https://www.wallplace.co.uk** (always use `www`, the
apex 307-redirects). Pass 1 walked all 1,793 rows of
`website/docs/qa/2026-08-28-mvp-functionality-inventory.md`. Pass 2 built eight
money and lifecycle chains from records it created itself and drove them end to
end. Your job is to fix what they found.

## Read first

- `website/docs/plans/2026-08-31-production-pass-remediation.md` — **Track A**
  (code fixes) and **Track B** (owner actions) from pass 1. All still open.
- `website/docs/qa/production-pass/SUMMARY.md` — pass 1's findings, then the
  **pass 2 addendum** at the bottom.
- `website/docs/qa/production-pass/PASS2-*.md` — pass 2's evidence, four logs.
- Column 3 of the inventory carries a verdict for every row. Row numbers below
  are line numbers in that file.

Everything below was reproduced on the live site with the write confirmed in
Postgres (project `uwkuhygwvasdzwsusiym`), not inferred from code. Where a
finding is partly unproven, the row says so; keep that honesty.

---

# P0 — owner action, do this before anything else

## 0.1 Supabase Auth Site URL is still `http://localhost:3000`

**Nobody in production can set or reset a password.** Both auth emails carry
`redirect_to=http://localhost:3000`:

- Accepting an artist application creates an `auth.users` row with **no
  password**, `confirmed_at` null, and emails an invite whose only link goes to
  localhost. The artist acquisition funnel dies at the last step.
- "Forgot password" produces the same broken link, so there is no way round it.

Proven by accepting QA application id 29 and reading both emails in the
applicant's inbox on 2026-08-31. `/reset-password` exists and renders correctly
on the live site; nothing ever routes anyone to it.

Both emails also arrive from `noreply@mail.app.supabase.io` with stock Supabase
branding, two seconds before the branded `notifications@tx.wallplace.co.uk`
welcome email. Branded templates already exist, unused, at
`website/scripts/auth-emails-rendered/`.

**Fix (Supabase dashboard, not code):** Auth → URL Configuration → set Site URL
to `https://www.wallplace.co.uk` and add it to the redirect allow-list. Then
Auth → Email Templates → install the three rendered templates.

**Verify:** trigger a password reset for a throwaway address, open the email,
confirm the link lands on `https://www.wallplace.co.uk/reset-password` and that
setting a password then signing in works.

Rows 2364, 534, 1050, 2580.

---

# P1 — money is wrong

## 1.1 A venue gets nothing when its work sells off the wall
Rows 727 and the area E/F placement rows. Log: `PASS2-placement-lifecycle-log.md`.

Sequence proven: venue and artist agree a 20% revenue share, work goes live, a
customer buys it off the wall for £120. The resulting order
`WS-UAKK1KDSC32PDT5R` carries `placement_id: NULL`, `venue_slug: NULL`,
`venue_revenue_share_percent: 0`, `venue_revenue: 0`. No venue transfer row
exists. Meanwhile `venue_collection_pending` emails the venue to say the piece
"has sold and will be collected from you".

Two questions to settle before coding:

1. **Is the share meant to cover off-the-wall sales, or only QR-attributed
   ones?** The placement label says "QR sales". This purchase started from the
   public artwork page, not a QR scan. Decide, then make the product say it.
2. Either way, **the placement link is simply not recorded.** Stamp
   `placement_id` and `venue_slug` on a `collect_venue` order so the sale is
   attributable at all. There is precedent on this branch: commit `af93b24`
   "fix(offers): stamp orders.placement_id on venue-share offer sales".

## 1.2 The same sale strands the placement forever
Same log.

After the sale the placement went to `status: 'sold'` and **every stage control
disappeared for both parties**. The progress bar sits at 5 of 6 with "Collected"
permanently unreachable, and "EARNED SO FAR" reads £0.00. There is no way for
either side to close the loan.

**Fix:** `sold` must keep the collect stage, or the sale must complete the
placement itself. Add a test that a sold placement can still reach a terminal
state.

## 1.3 A collect order is stamped `delivered` on payment
Rows 870–874. Same log.

`WS-UAKK1KDSC32PDT5R` was written `status: delivered` with `delivered_at` set at
the moment of payment, and the £114 artist transfer was created and settled to
`paid` **seven seconds later**, `payout_after` equal to its own creation time. No
hold, no evidence the buyer ever collected the piece.

Compare the posted path, which behaves correctly: transfer `pending` with
`payout_after` 14 days out, released only when the buyer confirms delivery.

**Fix:** a collect order should sit in a `ready_for_collection` state and only
become `delivered` when someone confirms the handover. Decide who confirms, the
venue or the buyer, and give them a control.

## 1.4 An accepted offer produces an order nobody can fulfil
Rows 933–939, 2245. Log: `PASS2-offers-and-paid-loan-log.md`.

No delivery address is collected anywhere in the offer flow. Order
`OFR-5A2LJH2CJ7KPVNMO` has `fulfilment_method: 'ship'`, `shipping_cost: 0`, and
`shipping` = every field empty plus
`notes: "Accepted offer off_… . No delivery address collected at checkout."`

The system knows. The artist does not: the portal shows **"SHIP TO: ,"** above a
live "Mark as Shipped" button.

**Fix:** collect an address in the offer checkout, the same way the normal
checkout does. Until then, at minimum surface that note to the artist instead of
an empty address block.

## 1.5 Cancelling a paid loan leaves the billing state saying the opposite
Rows 2179–2187. Same log.

After the venue cancelled placement `p-1788192191293-7xdf`, the page shows
**Cancelled** at the top and, further down, **"Monthly payment active,
£12.00/mo. Next payment on 30 September. Manage it any time from this page."**
`placement_recurring_billings.status` is still `active` and
`placements.subscription_status` is still `active`.

**Unproven and worth checking first:** whether Stripe actually received
`cancel_at_period_end`. Read subscription `sub_1UAXhSFP3rMcNTgSp3qrmrQt` in the
Stripe test dashboard. If it did cancel, this is a display and local-state bug.
If it did not, the venue is still on the hook for £12 a month and this is P0.

Three more, regardless of that answer:

- **No email or bell confirms billing has ended.** The artist got
  `placement_cancelled`; neither party got anything about the money.
- **"Manage it any time from this page" is a dead promise.** There is no manage,
  change-card or cancel-billing control on the placement page in any state.
- **The cancel confirmation never mentions money.** It reads "Cancel this
  placement? The other party will see it as cancelled." on a placement carrying a
  live monthly subscription.

## 1.6 Offers never expire
Row 2244.

`purchase_offers.expires_at` is NULL on every row in the table, including both
offers pass 2 created. The column exists; nothing sets it. An offer made today is
still bindingly open next year.

**Fix:** set an expiry on creation and enforce it on accept and on checkout.

## 1.7 Still open from pass 1
Item line totals render **£0.00** with the quantity missing entirely on the
customer's order overlay and `/orders/track`, while the artist portal renders the
same order correctly (Track A4.1, rows B L834, C L990). Confirmed still live by
pass 2 on order `WS-J6CRQS4XTX2DJRO7`.

Also still open and money-adjacent: **checkout trusts the client's shipping
price** (Track A1.2), and **`orders.buyer_user_id` is NULL for a signed-in
buyer** (Track A4.8), confirmed again on both orders pass 2 created.

---

# P2 — the site refuses things without saying why

Five separate refusals return a correct, well-worded error that the UI never
shows. The user sees a button that does nothing and concludes the site is broken.
Fix these as one job: find the shared submit path and make it render the API's
error.

| Where | What the server says | What the user sees |
|---|---|---|
| Past install date on a placement (row 2167) | `400 {"error":"Install date can't be in the past."}` | nothing, the bad date stays in the box |
| Blog body under 200 chars (row 2442 area) | `422 {"error":"Not ready for review","issues":["Body needs at least 200 characters before submitting."]}` | nothing, status stays "draft" |
| Revenue share above 50% (row 2144) | no request sent, value silently clamped to 50 | nothing |
| Offer below the 60% floor (row 934) | no request sent | nothing |
| Wall creation at the plan cap (rows 1844, 1860) | `402 {"error":"You've used all 3 saved walls on your plan.","reason":"saved_walls_cap","tier":"venue_standard","cap":3}` | one plain inline line, no amber panel, no `/pricing` link |

Two extra notes on that last one: **"+ New Wall" is not disabled at the cap**, so
the venue picks a preset, names the wall and presses Create before being refused.
And on `/artist-portal/blogs/new`, "Submit for review" saves the draft (POST 200)
and *then* fails the review PATCH, so the artist lands on the edit page believing
they submitted.

**The one to copy:** message moderation does this properly. It returns
`400 {"error":"Message contains blocked content"}` and the thread renders exactly
that above the Send button.

---

# P3 — data written wrong or not written at all

## 3.1 The email throttle swallows consequential transactional mail
Only three of production's 388 `email_events` have ever been
`skipped_throttled`. All three happened on 2026-08-31, all to the artist:

- `placement_ended` — the artist is never told their placement ended
- `artist_new_placement_invitation` — never told a venue requested a placement
- `artist_blog_rejected` — see 3.2

The throttle appears to be per stream per user. Whatever the window, it is
currently binning first-of-their-kind transactional messages.

**Fix:** exempt transactional streams from the throttle, or make throttled sends
retry rather than drop. Add a test asserting a throttled transactional email is
retried, not silently discarded.

## 3.2 A rejected blog reason reaches the artist by no route at all
Row 2442. Log: `PASS2-chain8-log.md`.

The admin prompt says "Reason (emailed to the author):". The reason is stored
**only** in `admin_audit_log` (`blog.reject`, full text in context); `blogs` has
no rejection-reason column. The artist's portal shows a bare "Rejected" badge with
no explanation. Combine with 3.1 and the reason vanished entirely.

**Fix:** add `blogs.rejection_reason`, store it, and render it on the artist's
blog row.

## 3.3 Undoing a collection leaves the work unlinked
Rows 2168, 2170.

`Undo collected` correctly returns the placement to `active` and clears
`collected_at`, but does **not** restore `placed_at_venue` or
`current_placement_id` on the work. An active placement then points at a work
that no longer knows it is placed.

## 3.4 `cancelled_at` and `cancelled_by_user_id` are never stamped
Cancelling a placement leaves both NULL, so there is no record of who cancelled
or when. Verified on `p-1788192191293-7xdf`.

## 3.5 The work picker no longer captures a size
Rows 2159, 1669.

The Request Placement form says "Click a work to pick the size you'd like."
Clicking only toggles selection: no picker, no modal, no select element. Both
placements pass 2 created stored `work_size: NULL`, where placements created
before this pass carry a populated `work_size` and a
`"Requested sizes:\n• …"` preamble in `message`. **This is a regression.** Either
restore the picker or change the copy.

## 3.6 An unknown referral code is stored as if valid
Row 2366.

Application 29 carried referral code `QATESTREF`. No artist owns that code
(`select count(*) from artist_profiles where referral_code='QATESTREF'` is 0) and
it was written to `referred_by_code` anyway. `artist_referrals` holds **0 rows
across the whole production database**, so no referral has ever been credited.

**Fix:** validate the code on submission, and write the ledger row on accept.

## 3.7 The plan chosen at application time is dropped
Row 2362. The application detail shows "SELECTED PLAN Pro"; the created profile
has `subscription_plan: 'none'`. Pass 1 read this as deliberate and the data
agrees, but nothing in the welcome email tells the accepted artist they still
have to subscribe. Either carry it through or say so in the email.

## 3.8 Blocked messages leave no moderation trace
Row 2020. A blocked message writes nothing to `messages`, and nothing to
`moderation_queue` or `conversation_reports` either. So a user repeatedly trying
to take deals off-platform is invisible to admins, and `/admin/moderation`'s
Messages filter has nothing to show.

## 3.9 The portal switcher never renders, and pass 1's reason was wrong
Rows 2571, 2585.

Pass 1 recorded "no email holds two roles". Two do:
`finbin1@hotmail.co.uk` owns both `artist_profiles` `fin-coles` and
`venue_profiles` `fin-coles`; `fcoles2598@gmail.com` owns `artist_profiles`
`finlay-coles` and `venue_profiles` `finlay`.

`GET /api/account/roles` returns `{"roles":["artist"]}` for the first — it does
not see the venue profile — so no switcher renders. Navigating to `/venue-portal`
redirects straight back to `/artist-portal`, because routing follows
`user_metadata.user_type`. **The second profile is orphaned and unreachable.**

**Decide first:** is one account holding two profiles a supported shape? If yes,
`/api/account/roles` must read both profile tables and the portal guards must
stop keying on `user_metadata` alone. If no, these two accounts are bad data and
should be cleaned up.

---

# P4 — copy and display

## 4.1 The revenue share label contradicts itself on one screen
Track A4.2, rows F L2135, E L1657. Pass 2 confirmed and sharpened it.

`revenue_share_percent` is the **venue's** cut. With the counter dialog open, the
summary tile beside it reads "Artist's share of QR-code sales" while the dialog
reads "Max 50% to the venue", for the same number. The request form ("% to the
venue on sales") and the thread message ("15% to the venue") agree with the
dialog. Only the placement summary and the venue placements list get it backwards.

**Highest-value copy fix on the whole list, because it misstates who gets the
money.** One shared label helper, used everywhere.

## 4.2 A pixel dimension is shown to buyers as the size
Rows 727 and the collect checkout rows.

The off-the-wall purchase carried **"Gyeongbokgung Palace (Off the wall, 2795 ×
4192 px)"** onto the checkout page, the Stripe hosted page, `orders.items[].size`,
and the subject lines of two customer-facing emails (`artist_order_received`,
`venue_collection_pending`). It also appears in the message thread's offer card.

**Fix:** use the placed size label, or the physical dimensions. Never the image's
pixel dimensions.

## 4.3 Collect checkout tells the buyer their order will be posted
Under a selected "Collect from the venue" option, the checkout page reads "Your
order will be fulfilled directly by the artist. They'll pack and ship your
artwork within 5 to 7 working days." The confirmation page gets it right.

## 4.4 The refund success copy names the wrong actor
Row 1002. "Refund request submitted. The artist will review your request." The
request lands in the admin queue at `/admin/refunds` and an admin approves it.

## 4.5 Smaller ones
- Offer orders render as **"Artwork × 1, £0.00"** with no title in the artist
  portal, because `orders.items` for an offer is `{offer_id, work_ids,
  collection_id}` with no title or price. The email resolves the title fine, so
  the data is available (rows 933–939).
- Stripe shows the offer buyer only "Wallplace offer · off_…" and "Accepted offer
  for 1 work".
- A signed-in buyer's **email is not prefilled** at checkout, though their name
  is. The curation brief form prefills **nothing**, though the venue profile
  holds the name, email and location (row 1924).
- **"Refunded" fits none of the customer's order filter tabs** (All, Active,
  Delivered, Cancelled), and the stage tracker vanishes entirely on a refunded
  order, so the buyer loses the delivery history for the order they are disputing.
- **No email on "live on wall"**, though every other placement stage emails both
  parties.
- The decline email template is named `placement_venue_declined_artist_request`
  but fires when the **artist** declines the **venue**. Subject line is correct.
- **Photos and the in-store offer panel show in the wrong states**: photos can be
  uploaded to a pending placement under the heading "Photos in venue", and "Can
  buyers purchase this piece off the wall?" is still offered on a collected
  placement.
- **Installed can precede the scheduled date** with no complaint, producing
  "Scheduled 2 Sept / Installed 31 Aug" in the progress bar.
- **Decline has no confirmation step**, unlike undo, which does.
- **`?payment=setup-complete` renders no confirmation** after a card is set up.
- **Editing a consignment record clears the approval ticked in the same save**
  (row 2197), and the banner then reads "Approvals were cleared, both parties need
  to tick the record again" directly above "Artist has approved this record."
- No success confirmation after sending an offer; the modal just closes.

---

# P5 — everything pass 1 found, still open

Track A of `2026-08-31-production-pass-remediation.md` is unstarted. Work it in
its own order. Its P0 is **`/api/apply` returning 500 when the optional "primary
medium" select is left blank**, which kills the artist acquisition funnel at the
first step just as P0 above kills it at the last.

Track B's owner actions are also unstarted: `TURNSTILE_SECRET_KEY` (all four
signup forms currently have no bot protection), `SUPABASE_WEBHOOK_SECRET` and
`RESEND_WEBHOOK_SECRET`, renaming "Wallspace sandbox" in Stripe, and the adaptive
pricing decision.

On that last one, pass 2 has more evidence than pass 1 did. **Every payment
surface** defaults to a foreign currency with a 4% conversion fee: the collect
checkout opened at **CA$234.54**, the offer checkout at **PLN 136.69**, the
paid-loan subscription at **PLN 63.04 per month**. Selecting GB as the billing
country did not change it. Stripe is following the browser locale, so a real
overseas buyer sees this. On the collect order the buyer was collecting the piece
**in person in London**.

---

# How to work

- Write a test for each fix before the fix, and make the test fail first.
- After each fix, re-verify against production the way the passes did: drive the
  UI, then confirm in Postgres with the Supabase MCP (`uwkuhygwvasdzwsusiym`).
  A toast is not evidence.
- Update column 3 of the inventory for every row you fix: change the verdict to
  `FIXED` and say what changed. Use the helper convention, prefix `!` to
  overwrite a non-empty cell.
- Commit per fix or per tight group, naming the rows.
- **The site's controls fire on `mousedown`, not `click`**, and these panels
  re-render 1 to 3 seconds after a request settles. If you drive the UI, dispatch
  pointerdown → mousedown → mouseup → click, and wait before asserting.

# Still genuinely untestable

Leave these blocked and say so: partial refunds and the pro-rated transfer
reversal, a failed reversal's 502, concurrent-claim 409s, anything needing a
declined card or a Stripe webhook failure, the 14-day payout cron, the 429 render
limit and burst limiter, and wall creation while the QA venue sits at its 3-wall
cap.
