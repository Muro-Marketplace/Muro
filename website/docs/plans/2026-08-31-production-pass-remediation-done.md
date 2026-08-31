# Remediation of both production passes: what was done

Companion to `2026-08-31-production-pass-remediation.md` (the plan, written from
pass 1) and to `../qa/production-pass/SUMMARY.md` (both passes' findings). Branch
`claude/production-pass-fixes-e6271e`.

Column 3 of `../qa/2026-08-28-mvp-functionality-inventory.md` is updated in place
for every row named below, with the verdict changed to FIXED and a sentence
saying what changed. `scripts/qa/inventory-verdict.mjs` is the helper both passes
used and neither committed; it is committed now, and it refuses to overwrite a
filled cell unless the verdict is prefixed `!`.

---

## Read this first: three things that were not true when the plan was written

**1. The branch was cut from the wrong trunk.** It started from a local `main`
that had diverged from `origin/main`: 22 local commits (the launch-pricing
series) against 15 on the trunk (PRs #70 to #81). Production runs the trunk, so
that is the line both passes tested, and several of their findings were already
fixed there. `origin/main` is merged in as the first act of this work. Sixteen
conflicts; the resolutions are in that merge commit's message.

**2. Some findings were already fixed.** Everything below that says "already on
origin/main" was checked in the merged tree and left alone, per AGENTS.md's rule
about not re-doing work. Where the finding was PARTLY fixed the remaining half is
named.

**3. Nothing here is deployed.** The two migrations are applied to production
(they are additive and the code needs them), the code is not. Every fix is
covered by a test that was watched failing first; none has been driven through
the live UI, because production runs a different commit. What still needs a
post-deploy check is listed at the end.

---

## P0, owner action: Supabase Auth still redirects to localhost

Not code, and it is the thing to do first. Written up as section 0a of
`../qa/LAUNCH-MANUAL-CHECKLIST.md` with the dashboard steps and a verification
script.

The one part that WAS code: there was no branded template for the **invite**
email, which is the mail an accepted artist receives and their only way into
the account. `scripts/auth-emails-rendered/` held three templates and the
dashboard needs four. `AccountInvite` is written and rendered, and the other
three are regenerated (they were stale from before an em-dash sweep).

---

## P1, money

| Finding | What changed |
|---|---|
| 1.1 A venue gets nothing when its work sells off the wall | `/api/checkout` stamps the order's `venue_slug` from the validated PLACEMENT on a collect order, so the webhook's existing resolution runs and `placement_id`, the share percent, the venue revenue and the venue transfer all populate. **The question the finding asked is answered:** the share covers any platform sale of a work on the wall, not only QR-attributed ones, matching the rule offer sales already followed. Every "QR sales" label is rewritten to say so. |
| 1.2 The same sale strands the placement | Two routes out. The buyer confirming collection stamps `collected_at` on the placement, because that confirmation IS the moment the piece leaves the wall. And `/api/placements` accepts stage `collected` from `sold`, with the stepper offering it, so a buyer who never confirms cannot strand the venue's record. Earlier stages stay refused from `sold`. |
| 1.3 A collect order is stamped delivered on payment | A collection order is booked `confirmed` with `delivered_at` null and its transfers on the normal hold. **The buyer confirms**, which is the rule the posted path already follows and the reason `delivered` is buyer-only: the parties who get paid must not attest to the delivery that pays them. The confirm control was gated on `shipped`, which a collection order never reaches; it now shows on a collection order awaiting pickup. |
| 1.4 An accepted offer produces an order nobody can fulfil | The offer's Stripe session collects a delivery address, scoped to the artist's own shipping scope, and the webhook reads it back from both the current and the legacy Stripe field shapes. The artist portal no longer renders "SHIP TO: ,": an order with no address gets a panel saying so, quoting the reason already on the row, with a mailto to ask the buyer. |
| 1.5 Cancelling a paid loan leaves the billing state saying the opposite | **Checked first, as the finding asked.** Stripe HAD been told: `cancel_at_period_end: true` is sent, and the row correctly stays `active` until the paid-for period ends. So this is a display and local-state bug, not an unpaid liability. (The test-mode subscription could not be read a second way: the Stripe MCP in this session is pinned to live mode.) Migration 127 records that a cancellation is scheduled; the chip has a third state saying the money has stopped and when cover ends; the dead "Manage it any time from this page" promise is gone; the cancel prompt names the fee; and both parties are told, including the canceller, who got nothing at all. |
| 1.6 Offers never expire | The enforcement already existed (F41). Nothing ever SET a deadline, so `expires_at` was NULL on every row. Seven days by default, a sender-chosen deadline still wins, a counter gets its own fresh week. |
| 1.7 Still open from pass 1 | Item line totals (A4.1), the forged shipping price (A1.2) and `buyer_user_id` (A4.8) were all already fixed on origin/main. Verified in the merged tree, not assumed. |

## P2, refusals the UI never showed

All five, plus the class. `apiErrorMessage()` in `lib/api-client` is the one
place a failure's message is unpacked, and it prefers the specific `issues`
array over the generic headline.

- Past install date: the stepper's only error slots were in the advance and undo
  rows, which the open picker replaces. The picker has its own now and stays open.
- Blog body under 200 characters: the create's `router.replace` fired before the
  review PATCH, so the editor holding the 422 was already leaving. Navigation
  waits for acceptance.
- Revenue share above 50%: says it capped, and the 50 becomes one constant.
- Offer below the 60% floor: the browser was refusing first. `noValidate`, and
  the handler names the exact minimum.
- The wall cap: the disabled control was a `<span aria-disabled>`, so nothing
  announced it as a button or could read its state. A real disabled button now.
  **Row 1860 is NOT fixed and says so:** that page has handled the 402 with the
  amber panel since May and has not changed, so the plain inline line pass 2 saw
  is unexplained and needs re-testing against the deploy.

## P3, data

| Finding | What changed |
|---|---|
| 3.1 The throttle swallows consequential mail | All three lost emails were the FIRST of their template. The category cap stays as the runaway-batch guard; the first send of each distinct template in the window is exempt. |
| 3.2 A rejected blog reason reaches the artist by no route | Migration 128 puts it on the blog, the artist's list renders it, approval clears it. |
| 3.3 Undoing a collection leaves the work unlinked | The inventory hook keyed on pending → active; an undo is completed → active. It runs the same hook now. |
| 3.4 `cancelled_at` / `cancelled_by_user_id` never stamped | Stamped on the transition into cancelled, once. |
| 3.5 The work picker no longer captures a size | The picker exists and works; the sentence above it described a control that does not. Copy fixed, not a regression. |
| 3.6 An unknown referral code is stored as if valid | Validated on submission, and the `artist_referrals` ledger row that has never existed for any referral is written on accept. |
| 3.7 The plan chosen at application time is dropped | Behaviour kept (an intent is not a purchase); the approval email says so. |
| 3.8 Blocked messages leave no moderation trace | A blocked attempt queues with the sender, the reason and an excerpt, marked blocked. Length refusals do not: those are facts about a string. |
| 3.9 The portal switcher never renders | **Decision: one account holding two profiles is not the designed shape and nothing creates it, but it is tolerated rather than denied.** `/api/account/roles` reports profile ownership as well as sibling-account metadata, and both portal guards honour it, failing closed. Whether those two accounts should keep both profiles is data and is left for the owner. |

## P4, copy and display

The revenue-share label, the pixel dimensions in five more call sites, the
collect checkout's postage promise, the refund actor, the offer order's
"Artwork × 1, £0.00", the missing prefills, the "Refunded" filter tab, the stage
tracker vanishing on a refunded order, the missing live-on-wall email, the
in-store panel and photo upload showing in states they mean nothing in, an
install landing before its own scheduled date, the missing decline confirmation,
and the two silent Stripe returns.

Two P4 items are recorded rather than changed, with reasons in the code:

- The decline template's id reads backwards. Not renamed: it is the value in
  `email_events.template` for every send it has made and half of the idempotency
  key, so renaming fragments that history and re-opens the send for anyone
  already declined.
- "No success confirmation after sending an offer" could not be reproduced. The
  modal renders a success state, fires a toast, and auto-closes after 1.8s.

## P5, Track A

Most of it was already on origin/main and was verified there rather than
re-done: the `/api/apply` 500, the signed unsubscribe link, the address DELETE's
404, the `#cancellation` anchor, the contact reference, `og:image`, the
one-decimal money, "Message the artist". The four that were not: the login
password minimum, the trust bar, the lightbox frame, the invisible dispute.

`/api/apply`'s 500 gets a second layer anyway: a class ratchet that scans every
insert against a NOT-NULL snapshot of the live schema. It found one further live
instance nobody had reported, in the branch that returns a cancelled order's
money.

---

## What still needs a person

1. **The P0 above.** Nothing else matters as much.
2. **Track B**, unchanged and still open: `TURNSTILE_SECRET_KEY`,
   `SUPABASE_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`, the "Wallspace sandbox"
   rename, and the adaptive-pricing decision. Pass 2 sharpened the last one:
   every payment surface it touched defaulted to a foreign currency with a 4%
   conversion fee, including a collect order where the buyer was picking the
   piece up in person in London.
3. **Deploy, then re-verify.** Every fix here has a test; none has been driven
   through the live UI. The ones worth driving first are the collect-sale chain
   end to end (rows 727, 871, 872, 992), the offer address, and row 1860.

## Still genuinely untestable, unchanged from pass 2

Partial refunds and the pro-rated reversal, a failed reversal's 502,
concurrent-claim 409s, anything needing a declined card or a Stripe webhook
failure, the 14-day payout cron, the 429 render limit and burst limiter, and
wall creation while the QA venue sits at its 3-wall cap.
