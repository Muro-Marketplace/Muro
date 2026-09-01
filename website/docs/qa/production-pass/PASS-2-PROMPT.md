# Production verification pass 2: the flows pass 1 wrongly left blocked

You are continuing a production QA pass against **https://www.wallplace.co.uk**
(the apex 307-redirects to www; always use www). Pass 1 filled all 1,793 rows of
`website/docs/qa/2026-08-28-mvp-functionality-inventory.md` column 3. Your job is
the roughly 300 rows it marked `BLOCKED` **for the wrong reason**.

## Read first

- `website/docs/qa/production-pass/SUMMARY.md` — what pass 1 found
- `website/docs/qa/production-pass/{A..H}-log.md` — the evidence, per area
- `website/docs/plans/2026-08-31-production-pass-remediation.md` — **Track C**
  is your work list

## Why those rows were blocked, and why that was wrong

Pass 1 read "never take a destructive action on real records" as covering the
whole money and placement surface, and stopped. That was too cautious. Two facts
change it:

1. **Stripe is in test mode.** Every session mints `cs_test_…`. Card
   `4242 4242 4242 4242`, any future expiry, any CVC. No real money moves.
2. **The safety rule already permits self-created records** — "unless the record
   is one you created yourself this session." Pass 1 used that correctly twice
   (it opened and resolved its own dispute, approved its own blog) and then
   failed to extend it to chains it could have built from scratch.

With four logins you can build almost every chain end to end. **A record you
created this session is fair game at every stage of its life.**

## Credentials (password for all: `Chelsea22!`)

- ARTIST `finbin1@hotmail.co.uk` — Fin Coles, Pro, approved, Connect complete
- VENUE `test@testingvenue.com` — Testing Venue, Connect **incomplete**
- ADMIN `fcoles2598@gmail.com`
- CUSTOMER `fcoles2598+qatestcustomer@gmail.com` — created by pass 1

Sign out between roles and prove the session cleared by reloading a portal URL
and confirming the redirect.

## Build these chains, in this order

Each one unblocks a cluster. Create the record yourself, then drive it through
every stage, including the undo and the failure branches.

1. **Placement lifecycle.** Venue requests a placement on a Fin Coles work →
   artist counters → venue counters → artist accepts → schedule (try a past date
   first, it should be refused) → install → live → collect. Undo a stage. Then a
   second placement you decline, and counter after declining. Unblocks most of
   E and F.
2. **Paid-loan billing.** Create a paid-loan placement, set up billing as the
   venue with the test card, confirm the chip states on both sides, then cancel
   and confirm the subscription ends.
3. **Offer lifecycle.** Venue offers on a work → artist counters → venue accepts
   → pay with the test card. Probe the 60% floor and the self-counter block.
4. **Refund, end to end — the highest-value untested path.** As the customer,
   request a refund on order `WS-J6CRQS4XTX2DJRO7` (pass 1 created it) → approve
   it as admin → verify in the database that the Stripe refund and the
   pro-rated transfer reversal both landed, and that the emails fired.
5. **Order lifecycle.** Artist marks that order processing → shipped with a
   tracking number → customer confirms delivery → payout release.
6. **Collect from venue.** As the artist, set an in-store offer on a live
   placement (the migration-121 flow), then buy it as the customer with the
   collect option. Pass 1 found **no live data at all** for this cluster, so the
   whole collect-from-venue branch in area B is unverified.
7. **Application accept.** Accept one of the four QA-TEST applications (ids 25,
   27, 28, 29). Tests the invite path, the profile bridge and the
   `user_metadata` rewrite.
8. **The rest:** curation booking (test mode, so it costs nothing real), wall
   creation and render plus quota decrement, the blog reject path with its
   reason, consignment record and countersign, placement photos, reviews after
   completion, message moderation (send yourself a blocked-pattern message),
   archive/unarchive and bulk actions.

## Still genuinely off-limits

- The two **pre-existing** refund requests: £149.99 on `WS-H7RgZntN` and
  £169.90 on `WS-q0g0tqwD`. Those are other people's orders.
- Leya Rubin's real application (`leahrubin22@gmail.com`).
- Cancelling the artist's live Pro subscription.
- Deleting any account.
- Anything else you did not create, where the action is irreversible.

Payout webhooks and the 14-day cron need Stripe or time; leave them blocked and
say so.

## Method

Same standard as pass 1. A verdict without evidence is a guess.

- Playwright MCP: `browser_snapshot` for structure, `browser_network_requests`
  for status and payload, `browser_console_messages`, `browser_evaluate` for
  computed state. Screenshots only for genuinely visual claims.
- **The site's controls fire on `mousedown`, not `click`.** A synthetic
  `.click()` alone does nothing. Dispatch
  pointerdown → mousedown → mouseup → click.
- **Supabase MCP** (project `uwkuhygwvasdzwsusiym`, `execute_sql`) to prove every
  write landed. Pass 1 caught several "the UI said success" cases this way.
  SELECT only, except where a chain you created needs cleaning up afterwards.
- Check `email_events` after each chain — pass 1 used it to verify twelve
  templates fired with the right fan-out.

## Recording

- Edit column 3 **in place**. Never touch columns 1 or 2. Never reword a row to
  match what you found; the gap is the finding.
- Start each cell with `WORKS` / `BROKEN` / `DIFFERS` / `FIXED` / `FLAG STANDS` /
  `BLOCKED` / `NOT SAFE TO TEST`, then one or two sentences and the evidence.
- Overwrite the existing `BLOCKED` cells you are replacing. There is a helper
  used by pass 1 that fills by line number and refuses to overwrite a non-empty
  cell unless the verdict is prefixed `!` — use that prefix.
- Keep a run log at `website/docs/qa/production-pass/PASS2-<chain>-log.md`.
- Commit after each chain, naming it and the verdict counts.
- **List everything you create.** Pass 1's list is in `SUMMARY.md`; append to it.

## What matters

A row marked `WORKS` that is actually broken is far worse than an honest
`BLOCKED`. Where you are unsure, say so. Never infer a verdict from the code —
this pass exists precisely because column 2 was written from a code read.

And if you find that pass 1 got something wrong, say so plainly and amend the
row. It amended three of its own rows on review; expect to amend more.
