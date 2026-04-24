# Email system — outstanding work

Library status: **113 templates built · 50 wired · 63 outstanding.**

Every outstanding item is blocked on something that isn't a pure email-library
task — Supabase Auth config, missing product features, editorial content
pipelines, or operational infra. Grouped here so priorities are clear.

---

## 1. Infrastructure (half a day total)

These unblock emails already wired. Do first.

### 1.1 Resend DNS setup (blocking all sends)

- [ ] Move `wallplace.co.uk` DNS off `dns-parking.com` to Cloudflare (or
      Namecheap / wherever you registered). Cloudflare is free and fast.
- [ ] In Resend, add domain `tx.wallplace.co.uk` (region: Dublin)
- [ ] Paste the 3 DNS records Resend gives you
- [ ] Click Verify in Resend — should go green in 5–15 min
- [ ] Add DMARC on root domain:
      `_dmarc` TXT = `v=DMARC1; p=none; rua=mailto:dmarc@wallplace.co.uk; pct=100`
- [ ] Later (as volume grows): add `notify.wallplace.co.uk` and
      `news.wallplace.co.uk` as separate domains in Resend

### 1.2 Environment variables (Vercel production)

- [ ] `RESEND_API_KEY` — from Resend dashboard
- [ ] `EMAIL_FROM_TX=Wallplace <noreply@tx.wallplace.co.uk>`
- [ ] `EMAIL_FROM_NOTIFY=Wallplace <notifications@tx.wallplace.co.uk>`
      (point at `tx.` until `notify.` verified)
- [ ] `EMAIL_FROM_NEWS=Wallplace <hello@tx.wallplace.co.uk>`
      (point at `tx.` until `news.` verified)
- [ ] `EMAIL_REPLY_TO=hello@wallplace.co.uk`
- [ ] `CRON_SECRET` — random 32-char string; Vercel attaches to cron calls

### 1.3 Stripe webhook events

In Stripe dashboard → Webhooks → your endpoint (`…/api/webhooks/stripe`),
enable these events so the wired-up handlers fire:

- [ ] `checkout.session.completed` (already working)
- [ ] `customer.subscription.created`
- [ ] `customer.subscription.updated`
- [ ] `customer.subscription.deleted`
- [ ] `customer.subscription.trial_will_end`
- [ ] `invoice.paid`
- [ ] `invoice.payment_failed`
- [ ] `payout.paid`
- [ ] `payout.failed`
- [ ] `account.updated`
- [ ] `transfer.reversed` (already)

---

## 2. Supabase Auth (6 templates · 1–2 hours)

Auth flows run through Supabase, not your API routes. Two paths depending
on how much control you want.

### 2.1 Path A — use Supabase's hosted emails (simplest, recommended)

Render each template to HTML with `@react-email/render`, paste into the
Supabase dashboard templates.

- [ ] Create `scripts/render-auth-email.ts` (helper provided below)
- [ ] Render `AccountEmailVerification` → paste into Supabase "Confirm
      signup" template
- [ ] Render `AccountPasswordReset` → paste into "Magic Link / Recovery"
- [ ] Render `AccountEmailChangeVerify` → paste into "Change Email"
- [ ] Render `AccountSuspiciousLogin` → Supabase doesn't send this by
      default — skip or wire via the webhook path (2.3)

Helper script:

```ts
// scripts/render-auth-email.ts
import { render } from "@react-email/components";
import { AccountEmailVerification } from "@/emails/templates/account/AccountEmailVerification";

const html = await render(AccountEmailVerification({
  firstName: "{{ .Data.first_name | default: \"there\" }}",
  verificationUrl: "{{ .ConfirmationURL }}",
  expiresIn: "24 hours",
  supportUrl: "https://wallplace.co.uk/support",
}));
process.stdout.write(html);
```

Run with `tsx scripts/render-auth-email.ts > confirm-signup.html` then
paste the file contents into Supabase.

### 2.2 Path B — custom SMTP via Resend (better deliverability)

- [ ] Supabase Dashboard → Project Settings → Auth → SMTP Settings
- [ ] Use Resend as SMTP provider (host `smtp.resend.com`, port 465,
      user `resend`, password = your `RESEND_API_KEY`)
- [ ] Templates still edited in Supabase, but sent from your verified domain

### 2.3 Path C — webhook interception (most control)

Supabase emits `user.created`, `user.updated`, `email.changed`, etc.
webhooks. Hook those up to a new route `/api/webhooks/supabase` that
calls `sendEmail()` directly. More moving parts; skip unless you need
full control.

### 2.4 Welcome checklists (after verification)

- [ ] Add a `welcomed_at` column to `artist_profiles` / `venue_profiles`
- [ ] On the first API call after email verification, check + set it and
      call `sendEmail()` with the appropriate welcome template
- [ ] Easier: hook into Supabase `email_verified` event via 2.3

---

## 3. Features to build first (~35 templates)

Templates are ready, triggers don't exist. Prioritised by user impact.

### 3.1 High impact — build these next

**Shipping flow** (4 templates)
- [ ] Artist-side "Mark as shipped" button on `/artist-portal/orders/[id]`
      → stores tracking number, carrier, status
- [ ] POST `/api/orders/[id]/ship` handler that sets status + sends
      `customer_shipping_confirmation`
- [ ] Stripe-aware "delivered" webhook / carrier polling → sends
      `customer_delivery_confirmation`
- [ ] Cron job `+3d after delivery` → `customer_post_purchase_care`
- [ ] Cron job `+14d after delivery` → `customer_purchase_review_request`

**Saved works tracking** (3 templates)
- [ ] `saved_works` table (user_id, work_id, saved_at) — likely already
      exists under `saved_items`
- [ ] Trigger on `artist_works.available` flip from false → true →
      `customer_saved_work_back_in_stock` to everyone who saved it
- [ ] Trigger on `artist_works.price` decrease → `customer_saved_work_price_drop`
- [ ] Weekly cron `customer_saved_works_digest` (already templated; just
      needs the trigger route)

**Follow system** (2 templates)
- [ ] `follows` table (user_id, artist_id, followed_at)
- [ ] Follow/unfollow buttons on artist profile pages
- [ ] Trigger on new `artist_works` insert → `customer_new_work_from_followed_artist`
      to all followers
- [ ] Day-7 onboarding nudge `customer_follow_artist_nudge` (cron — easy
      to add once table exists)

### 3.2 Medium impact

**Abandoned checkout tracking** (2 templates)
- [ ] `checkout_sessions` table storing in-progress cart states
- [ ] Stripe `checkout.session.expired` webhook → mark abandoned
- [ ] 1h-delayed send (Inngest or delayed Vercel Cron) →
      `customer_abandoned_checkout_1h`
- [ ] 24h-delayed send → `customer_abandoned_checkout_24h` with artist note

**QR scan events** (2 templates)
- [ ] QR scan endpoint already logs to `analytics_events` — add a
      post-insert check: first scan per (work_id) → `artist_first_qr_scan`
- [ ] Milestone check on insert: crossed 10/50/100/500/1000 → `artist_qr_scan_milestone`

**Tier cap tracking** (2 templates)
- [ ] Check on artwork upload / placement creation: did this push the
      artist over their plan's cap? If yes, send `artist_tier_cap_hit`
- [ ] 3-day delayed follow-up cron → `artist_premium_upgrade_educational`
      (only if they didn't upgrade in the meantime)

**Matching engine output** (3 templates)
- [ ] Nightly cron that runs the matcher and finds strong new matches
- [ ] Emails weekly (not daily) → `artist_new_venue_match`, `venue_new_artist_matches`
- [ ] `venue_managed_curation_pitch` after 3 quiet weeks for a venue
      — cron sweep

### 3.3 Lower impact

**Team invites** (2 templates)
- [ ] Venue "Invite a teammate" flow
- [ ] POST `/api/account/team-invite` → creates invite token, sends
      `account_team_invite`
- [ ] Accept flow on sign-up → sends `account_team_invite_accepted` back
      to inviter

**Account ops** (4 templates)
- [ ] Two-factor enable/disable flow → `account_two_factor_enabled`/`_disabled`
      on both actions
- [ ] Data export flow (GDPR compliance) → `account_data_export_ready`
      after async job completes
- [ ] Account deletion flow → `account_deletion_requested` at scheduling,
      `account_deletion_confirmed` after execution

**Review endpoint** (1 template)
- [ ] POST `/api/placements/[id]/review` — creates `reviews` row
- [ ] Sends `review_posted_notification` to the other party

---

## 4. Editorial workflow (~8 templates)

These need a content pipeline, not code. Someone (probably you) picks the
subjects, writes the copy, and either triggers a manual send or a
scheduled broadcast.

- [ ] Decide on monthly cadence for `newsletter_monthly_gallery`
- [ ] Build a small "newsletter studio" page in `/admin` that lets you
      pick featured works + artists + venues, write the intro, and hit send
- [ ] Send goes to all `email_preferences.newsletter_enabled = true` users
- [ ] Same pattern for `newsletter_artist_spotlight`, `newsletter_venue_spotlight`,
      `newsletter_curators_picks`, `newsletter_local_art_near_you`
- [ ] `artist_year_in_review` → annual cron on Jan 1 per artist, computes
      stats from `orders` / `placements` / `analytics_events`
- [ ] `artist_low_engagement_tips` → weekly cron finding works with
      profile_views > 50 but scans < 3 (i.e. people look, don't engage)

---

## 5. Admin-action emails (~5 templates)

Fire when admin manually acts on a user. Need admin UI first.

- [ ] `operational_policy_violation_warning` — admin button on
      `/admin/users/[id]` to flag a policy issue with free-text reason
- [ ] `operational_account_restricted` — admin restrict button
- [ ] `operational_account_restored` — admin unrestrict button
- [ ] `operational_platform_incident` — admin-triggered broadcast to all
      affected users (tied to a downtime event or service issue)
- [ ] `legal_terms_update` + `legal_privacy_update` — broadcast when you
      publish a new version. Triggered manually from `/admin`

---

## 6. Delayed / batched (needs Inngest or QStash)

These work today as immediate sends; upgrading to delayed/batched makes
them much better but requires a scheduler.

- [ ] **`message_unread_notification`** — currently sends immediately. With
      Inngest, queue with 10min delay and cancel if the message is read
      in-app first. Best single upgrade for inbox quality.
- [ ] **`message_hourly_digest`** — batch unread messages for users with
      >2 new in the hour, instead of one email per message. Needs Inngest's
      `debounce` feature or a Redis dedupe.
- [ ] Abandoned checkout 1h / 24h — see §3.2.

Install:
```bash
npm install inngest
```

Add route `/api/inngest` and register functions per the
[Inngest Next.js quick start](https://www.inngest.com/docs/sdk/serve).

---

## 7. Secondary upsells (~4 templates)

Only worth building after you have data on who engages with the basics.

- [ ] `venue_analytics_upgrade` — trigger after a venue's 3rd placement
- [ ] `venue_managed_curation_upgrade` — trigger after a venue hits 6+
      months with 0 self-initiated placements
- [ ] `venue_rotation_reminder` — cron sweep finding placements running
      >90 days
- [ ] `venue_placement_anniversary` — 1-year mark on active placements

---

## 8. Recommended order

If I were you:

1. **Today — §1 infrastructure.** Half a day. Unblocks everything already wired.
2. **Week 1 — §2 Supabase Auth.** Makes signup / verify feel premium on day one.
3. **Week 2 — §3.1 shipping flow + saved works.** Highest conversion lift.
4. **Week 3 — §3.1 follow system.** Turns one-off customers into returning users.
5. **Week 4 — §6 Inngest.** Quality-of-life upgrade for messages.
6. **Month 2 — §4 editorial cadence.** Branding moment; don't rush it.
7. **Month 3+ — §3.2, §3.3, §5, §7 as priorities shift.**

---

## Tracking template

Duplicate this block per template as you wire each one:

```
### template_id
- [ ] Trigger identified (where in code)
- [ ] sendEmail call added with correct idempotencyKey shape
- [ ] Live-test: send-to-real-inbox from dev
- [ ] Verified in email_events table
- [ ] Deployed to production
- [ ] 48h monitoring — bounce / complaint rate checked
```
