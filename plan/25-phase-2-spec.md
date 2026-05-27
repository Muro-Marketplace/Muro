# Phase 2 spec — behaviour and features

Phase 1 (schema + infrastructure) is shipped. Phase 2 builds the
user-facing behaviour on top. Each milestone is its own PR. Run
`npm run typecheck && npm run lint && npm test` after each. Use a
feature flag where the change has user impact.

## Phase 1 wrap-up decisions (locked)

1. **Mixed arrangement type:** keep. Derive server-side from
   `monthly_fee_gbp > 0 && qr_enabled`. No new UI toggle.
2. **Order event vocabulary:** map existing statuses to new event
   types. `confirmed → order.placed`, `processing → order.processing`,
   `shipped → order.out_for_delivery`, `delivered → order.delivered`,
   `cancelled → order.cancelled`. Drop `artist_notified` (internal,
   not a lifecycle event).
3. **Venue subscription columns:** add in chunk 2.0 as a prerequisite.
4. **Email templates:** author purpose-built copy for six lifecycle
   templates (see chunk 2.0). Rename existing misnamed templates if
   they collide.
5. **Moderation payload schema:** TS discriminated union in
   `src/lib/moderation/types.ts`.

## Product owner decisions (carried from Phase 1)

1. No grandfathering. Cancel = off marketplace next cycle.
2. Featured = existing Pro tier (no new SKU).
3. Feedback bubble (bottom-left, no auth, in-launch nudge copy).
4. Paid loan billing: Stripe standard retry, no current-month refund,
   no retroactive refunds.
5. Email copy: standard UK consumer-rights boilerplate.
6. Blogs: in sitemap, public, byline links to artist profile,
   unlimited featured works per post.
7. Blog SLA: no commitment.
8. Customer support route: reuse `/contact`.
9. Demo profile: Maya stays as explicit demo (banner only).
10. Artwork request fulfilment routing:
    - `offer` / `commission` → order
    - `placement` → placement
    - `existing_works` → 2-button choice modal
    - `message` → no fulfilment action
11. Financials dashboard: read-only v1.
12. Paywall trigger: first protected action.
13. Featured works in blogs: unlimited.
14. Moderation queue: single admin pool.
15. Phantom slugs: only `finlay-coles` → `fin-coles`. Single 301 in
    `next.config.ts`.

---

## Milestone order

| # | Milestone | Effort | Risk | Rationale |
|---|---|---|---|---|
| 2.0 | Prerequisites | M | Low | Unblocks everything. Additive only. |
| 2.1 | Quick wins | M | Low | Momentum + small UX fixes. |
| 2.2 | Paid loan transaction logic | XL | High | Highest data-shape risk, ship early so verification has time. |
| 2.3 | Lifecycle emails + customer tracking | L | Med | High user value. |
| 2.4 | Messaging restrictions | M | Med | Touches existing threads, careful gating. |
| 2.5 | Subscription gating | L | High | Affects who can see who. Behind flag. |
| 2.6 | Feedback bubble | M | Low | Public form, simple. |
| 2.7 | Blogs | XL | Med | Big build but well-scoped. |
| 2.8 | Admin tools | L | Low | Internal-only. |
| 2.9 | Venue artwork-request detail | M | Low | Standalone page. |

---

## 2.0 Prerequisites

Five small chunks. All must land before any other milestone starts.

### 2.0a Venue subscription columns

```sql
ALTER TABLE venue_profiles
  ADD COLUMN IF NOT EXISTS subscription_status text
    DEFAULT 'none'
    CHECK (subscription_status IN ('none','trialing','active','past_due','cancelled')),
  ADD COLUMN IF NOT EXISTS subscription_plan text
    CHECK (subscription_plan IS NULL OR subscription_plan IN ('standard','premium')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE INDEX IF NOT EXISTS venue_profiles_subscription_status_idx
  ON venue_profiles(subscription_status);
```

Update `src/lib/subscriptions.ts` `isSubscribed` helper to stop
tolerating missing columns. Update `tier-resolver.ts` comment that
flagged this as `[future]` to reflect it now exists.

No behaviour change. Existing venues all become `subscription_status =
'none'` and that's fine, they're already not paying.

### 2.0b Order event vocabulary mapping helper

`src/lib/orders/event-vocabulary.ts`:

```ts
export const ORDER_STATUS_TO_EVENT: Record<string, OrderEventType | null> = {
  confirmed: 'order.placed',
  processing: 'order.processing',
  shipped: 'order.out_for_delivery',
  delivered: 'order.delivered',
  cancelled: 'order.cancelled',
  artist_notified: null,        // internal only, no event
};
```

Add a unit test that locks the mapping. Phase 2.3 (emails) reads
from this.

### 2.0c Email templates

Author six templates in `src/emails/templates/orders/`:

- `ArtistOrderReceived.tsx` — artist notification, new order placed
- `CustomerOrderPlaced.tsx` — customer confirmation
- `CustomerOrderProcessing.tsx` — artist has started preparing
- `CustomerOrderOutForDelivery.tsx` — out for delivery / dispatched
- `CustomerOrderDelivered.tsx` — marked delivered, please confirm
- `CustomerConfirmDelivery48h.tsx` — 48h follow-up prompt

Match the existing `@react-email/components` template structure.
Standard UK consumer-rights footer (14-day return window, contact
details, GDPR note). Source contact / address from
`src/lib/email/constants.ts` if it exists, else add it.

Rename any existing template whose name conflicts. Old name kept as
an alias export for one minor version (so any in-flight references
keep compiling), then dropped in Phase 3.

### 2.0d Moderation payload types

`src/lib/moderation/types.ts`:

```ts
export type ModerationPayload =
  | {
      type: 'blog';
      blog_id: string;
      title: string;
      excerpt: string;        // first 200 chars of body, plain text
    }
  | {
      type: 'feature_request';
      title: string;
      description: string;
      contact_email?: string;
      user_agent?: string;
    }
  | {
      type: 'feedback';
      message: string;
      rating?: 1 | 2 | 3 | 4 | 5;
      contact_email?: string;
      source_url?: string;    // page the visitor was on
      user_agent?: string;
    };

export function parsePayload(
  entityType: 'blog' | 'feature_request' | 'feedback',
  payload: unknown,
): ModerationPayload | null;
```

`parsePayload` validates shape, returns null on mismatch. Used at
both write boundary (when inserting into `moderation_queue`) and read
boundary (admin queue view).

### 2.0e Arrangement-type derivation helper

`src/lib/placements/arrangement.ts`:

```ts
export function deriveArrangementType(input: {
  monthly_fee_gbp: number | null;
  qr_enabled: boolean;
  revenue_share_percent: number | null;
  purchase_amount_pence?: number | null;
}): 'free_loan' | 'paid_loan' | 'revenue_share' | 'purchase' | 'mixed';
```

Same logic as the Phase 1 backfill `CASE` expression. Phase 2.2 uses
this on the placement create/counter write paths so new placements
get an explicit `arrangement_type` at the source.

### Acceptance for 2.0

- `venue_profiles` has the 4 new columns, defaults applied
- `isSubscribed` reads venue columns without try/catch
- `ORDER_STATUS_TO_EVENT` is tested
- Six email templates compile and render in `/email-preview`
- `parsePayload` has tests covering each entity type + invalid input
- `deriveArrangementType` has a test that mirrors the Phase 1
  backfill cases
- Typecheck / lint / test all clean

---

## 2.1 Quick wins

Small UX fixes that don't need new infrastructure. Ship together as
one PR.

| Item | Description |
|---|---|
| P6 | Optimistic-update fix: newly-created placement row uses the same field formatting as the server response (currently shows "Revenue Share" with capital S until re-fetch). |
| P7 | "Your turn" placement table rows: add a Respond → link in the Request column linking to `/placements/<id>`. Mirror dashboard action-item pattern. |
| P1 | Demo profile interaction guard: when a `?demo=1` flag is on the artist profile, replace Message + Buy Now CTAs with a "Demo profile — explore live artists" banner. Wire it via `artists.isDemo` (add column if missing). Maya Chen flagged as `isDemo = true`. |
| B5 polish | Verify Pro-tier "Featured" sort works end to end. Add a "Featured" chip on Premium too if absent. Add a `?featured=1` URL filter on `/browse`. |
| Phantom slug | One-line `redirects` entry in `next.config.ts`: `/browse/finlay-coles` → `/browse/fin-coles` (301). |
| D1 | Filter the artist `/artist-portal/artwork-requests` view to only requests where the artist has responded or submitted a draft. Add an "All open requests" toggle to opt back into the full feed. |
| A5 | Admin moderation panel route for feature requests (reads `moderation_queue` where `entity_type = 'feature_request'`). |
| A6 | Same for feedback (`entity_type = 'feedback'`). |

### Acceptance for 2.1

- All seven items shipped, each with at least one screenshot or test
- Optimistic update test for P6
- Demo banner appears on `/browse/maya-chen` and Buy Now / Message
  are non-functional with explanation
- `/browse?featured=1` shows only Pro + Premium artists
- 301 verified by curling `/browse/finlay-coles`
- A5/A6 admin pages render with mod queue rows

---

## 2.2 Paid loan transaction logic (G-series)

Highest-risk milestone. Two parts: read-flip (G1, G2) and write-flow
(G3). Ship behind a feature flag `PAID_LOAN_V2`.

### G1: Placement page label respects `arrangement_type`

Files: `src/app/(pages)/placements/[id]/PlacementDetailClient.tsx`,
`src/components/PlacementContextPanel.tsx`.

Current behaviour reads `monthly_fee_gbp` / `qr_enabled` /
`revenue_share_percent` and shows the wrong header. Switch to reading
`placement.arrangement_type` directly. Map:

| arrangement_type | Header label | Owner text |
|---|---|---|
| `purchase` | PURCHASE | "Venue owns the work" |
| `paid_loan` | PAID LOAN | "On loan from artist" |
| `free_loan` | DISPLAY | "On loan from artist" |
| `revenue_share` | REVENUE SHARE | "On loan from artist" |
| `mixed` | PAID LOAN + REV SHARE | "On loan from artist" |

### G2: Venue owns the work only when `purchase`

The "Venue owns the work" copy + ownership flag must be false on every
non-purchase arrangement. Audit all read sites (analytics, payouts,
returns flow).

### G3: Monthly paid-loan billing (the XL bit)

Add a Stripe subscription per paid-loan placement. On placement
acceptance with `arrangement_type IN ('paid_loan', 'mixed')`:

1. Create Stripe customer for venue if absent
2. Attach venue payment method (collect via Stripe Setup Intent if
   they haven't paid before; reuse if they have)
3. Create subscription billing `monthly_amount_pence` monthly
4. Insert into `placement_recurring_billings` (table from Phase 1g)
5. Pro-rate first month from acceptance date to next 1st of month

Webhook handlers in `src/app/api/webhooks/stripe/route.ts`:

- `invoice.paid` → bump `current_period_start` / `current_period_end`,
  trigger artist payout via Connect (gross venue fee minus platform
  cut)
- `invoice.payment_failed` → mark `past_due`, email both parties,
  Stripe handles retry (3 attempts over 14 days)
- After 14 days unrecoverable → mark `paused`, notify both parties,
  pause placement display

On placement cancel:
- Cancel Stripe subscription
- No refund for current month (locked decision)
- Past months stay paid out

On venue card decline mid-cycle:
- Stripe standard retry (already happens)
- We only react when Stripe gives up (`invoice.payment_failed` ×
  final attempt)

### Acceptance for 2.2

- `PAID_LOAN_V2` flag gates new code paths
- With flag off: zero behaviour change
- With flag on, paid_loan placement: header reads correctly, billing
  starts on accept, monthly charges fire (use Stripe CLI to test)
- Idempotency: webhook retry on same `invoice.paid` doesn't
  double-charge or double-pay-out
- Unit tests for `deriveArrangementType` switch logic on
  PlacementDetailClient
- Integration test for the webhook idempotency

---

## 2.3 Lifecycle emails + customer tracking

### J1: Order lifecycle emails (dispatcher-driven)

Wire `src/lib/orders/event-vocabulary.ts` into `order_events`
insertion. Every time `orders.status` mutates, also insert into
`order_events` and trigger the matching email via the Phase 1c
dispatcher.

Trigger matrix:

| Event | Recipient(s) | Template |
|---|---|---|
| `order.placed` | Artist + Customer | `ArtistOrderReceived` + `CustomerOrderPlaced` |
| `order.processing` | Customer | `CustomerOrderProcessing` |
| `order.out_for_delivery` | Customer | `CustomerOrderOutForDelivery` |
| `order.delivered` | Customer | `CustomerOrderDelivered` |
| `order.cancelled` | Artist + Customer | (inline copy or new template) |

Idempotency: dispatcher dedupes on `idempotency_key = ${event_id}`.

### J2: Customer 48h delivery confirmation

Scheduled job (Vercel Cron or Supabase Edge cron):

```ts
// Every hour, find order_events of type 'order.delivered'
// older than 48h, where no 'order.delivery_confirmed' event exists,
// and no '48h prompt' has been sent yet.
// Send CustomerConfirmDelivery48h, insert a tracking event so we
// don't repeat.
```

After 7 days with no customer response, auto-mark
`order.delivery_confirmed` and stop bothering them.

### K3: Customer order tracking page

`/orders/[id]` (already exists in pages list — extend, don't replace):

- Reads from `order_events` (latest event wins per type)
- Renders a vertical stepper: Placed → Processing → Out for delivery
  → Delivered → Confirmed
- "Confirm delivery" CTA when status is delivered + within the 7-day
  auto-confirm window
- "Report a problem" link routing to `/contact?order=<id>`

### E4: Message attachment uploads

Find and fix the broken attachment upload in `MessageInbox.tsx`.
Likely Supabase storage bucket / signed URL issue. Add a Playwright
test that uploads a small fixture image.

### Acceptance for 2.3

- All five email templates dispatch correctly with the right
  recipient + idempotency
- Cron job tested in staging (use a 48s window for testing, then flip
  to 48h)
- `/orders/[id]` renders the stepper from `order_events`
- Message attachment upload works end to end

---

## 2.4 Messaging restrictions

### E1: Block artist-to-artist new messages

Server check in `src/app/api/messages/route.ts` (POST handler):

```ts
if (sender.user_type === 'artist' && recipient.user_type === 'artist') {
  return NextResponse.json({ error: 'Artist-to-artist messaging is not supported.' }, { status: 403 });
}
```

Existing threads remain readable. Only the SEND action is blocked.
Distinguish "send" from "view" so users with both artist + venue
accounts can still write from their venue context.

UI: in `MessageInbox.tsx`, when composing to an artist as another
artist, hide the compose form with explanation.

### E2: "Message the Artist" CTA scoped to venues

In `MessageArtistButton.tsx`:
- If viewer is logged-out → "Sign in to message"
- If viewer is venue → "Message artist" (existing behaviour)
- If viewer is customer → "Contact Wallplace" link to
  `/contact?artist=<slug>` instead
- If viewer is another artist → hide entirely (per E1)

### E3: Artist-to-artist orders fix

Investigate. When artist A orders from artist B, the order doesn't
appear on artist A's orders page. Two paths to check:
- Order list query filters out orders where buyer is also an artist
  (probably the bug)
- Buyer-side query reads from `venue_purchases` instead of `orders`

Fix the filter / query. Add a test fixture: order from one artist to
another, assert it appears in both `/artist-portal/orders` (as
purchase) and the seller's `/artist-portal/orders` (as sale).

### Acceptance for 2.4

- Artist → artist POST `/api/messages` returns 403
- Existing artist↔artist threads still load (read-only)
- `MessageArtistButton` shows correct CTA for each viewer type
- Artist-to-artist orders appear on both sides

---

## 2.5 Subscription gating (B-series + C-series)

Highest-impact behaviour change. Ship behind flag `GATING_V1`.

### B1: Paywall on Open requests tab

In artist portal Open requests view (Phase 2.1 D1 already filtered
the default view, this is the paywall over the toggle to see all):

When `isSubscribed(user).active === false`, the "All open requests"
toggle shows a paywall card instead of the list. Same upgrade prompt
as B2/B3.

### B2: Paywall before publishing artwork

On `POST /api/artworks` (or wherever publish lives): check
`isSubscribed`. If not active, return 402 with
`{ reason: 'subscription_required', upgrade_url: '/artist-portal/billing' }`.

Client surfaces upgrade modal.

### B3: Profile-first onboarding

Approved artist with no subscription can:
- Create profile
- Add works as drafts
- Browse the marketplace

Cannot:
- Publish a work
- Send a placement request
- Respond to a placement request
- Reply to a placement request from a venue

All three of these surfaces show the same `<UpgradePrompt />` modal.
First protected action triggers it. (Decision 12, locked.)

### B4: Hide non-subscribed artists from /browse

In `src/lib/db/merged-data.ts` (or wherever the browse query lives):
filter the artist list to only include artists where:
- `subscription_status === 'active'` OR
- `is_seed_artist === true` (seed/demo artists from `src/data/artists.ts`)

The seed-artist check covers Maya + the 40 other catalog artists.
Real users who cancel disappear next cycle.

### C1: Hide profiles from non-subscribed viewers

If the VIEWER is logged in but doesn't have an active artist OR venue
OR customer subscription, the artist profile pages and `/browse` show
the same gated view as logged-out users (i.e. they don't see
non-subscribed artists either, because nobody does).

Wait — re-reading the original spec: this is actually viewer-side.
But the user clarified that "non-subscribed viewer = anyone without
an active subscription, logged in or out". And the marketplace shows
subscribed-or-seed artists regardless of viewer state.

So C1 is effectively a no-op given B4. Skip C1 unless it surfaces a
distinct use case during build. Document as such.

### C2: Prevent works auto-publishing

In the artwork create/update flow, default `is_published = false`
until the artist explicitly publishes AND `isSubscribed.active`.
Works added by non-subscribed artists stay private to the artist
until they upgrade + publish.

### Acceptance for 2.5

- `GATING_V1` off → no behaviour change
- `GATING_V1` on:
  - Non-subscribed artist cannot publish, send placement, respond to
    placement (all hit upgrade prompt)
  - Cancelled artist disappears from `/browse` within one cycle
  - Seed artists remain visible
  - Subscribed artist sees full functionality
- Tests cover each gated action

---

## 2.6 Feedback bubble

Replaces the previously planned K1, K2 pages.

### Bubble UI

`src/components/FeedbackBubble.tsx`:
- Fixed bottom-left, 12px from edges (clear of cookie banner)
- Closed state: small circular button with an icon and "Feedback" label
- Open state: 360px wide panel, two tabs (Feature request /
  Feedback), close button
- Friendly nudge copy at top of panel:
  > Wallplace is in early launch. Help shape it.

### Tabs

Feature request:
- Title (required, 80 chars max)
- Description (required, 1000 chars max)
- Optional email field

Feedback:
- Message (required, 1000 chars max)
- Optional 1-5 star rating
- Optional email field

### Submit

POST to `/api/moderation` with `entity_type` + payload (per Phase 1
`moderation_queue` shape, validated via `parsePayload`).

On success: toast "Thanks, we'll have a look." Panel closes.
On rate-limit / spam reject: toast "Try again in a minute."

### Mount points

- All public pages (`(pages)/layout.tsx` mount)
- All portal pages
- NOT on legal pages (`/terms`, `/privacy`, etc.) where the bubble
  would feel out of place

### Acceptance

- Bubble appears on all listed pages
- Submission writes to `moderation_queue`
- Admin sees the rows in the existing A5/A6 panel
- Spam protection: rate-limit 5 submissions per IP per hour

---

## 2.7 Blogs

XL build, split into three sub-PRs.

### 2.7a Blog editor (I1)

Author surface at `/artist-portal/blogs/new` and
`/artist-portal/blogs/[id]/edit`.

- TipTap-based rich text editor (or whatever's already in use; check
  existing `body_json` references)
- Inline image upload to Supabase Storage (`blog-images` bucket)
- Embedded link button (turns selection into link, validates URL)
- "Featured artworks" picker: dropdown of artist's own published
  works, drag-to-reorder, unlimited count
- Save as draft + Submit for review
- Featured artwork card in the rendered post = compact image + title
  + price + Buy Now (reuses existing `/api/checkout` flow)

### 2.7b Publish gate (I2)

Submit for review:
- Sets `blogs.status = 'pending_review'`
- Inserts a `moderation_queue` row with `entity_type = 'blog'` and
  payload `{ blog_id, title, excerpt }`
- Email author "Submitted, we'll review and let you know"

When admin approves (A4):
- `blogs.status = 'published'`, `published_at = now()`
- Email author "Approved and live"

When admin rejects:
- `blogs.status = 'rejected'` + admin's reason
- Email author with the reason

### 2.7c Admin approval workflow (A4)

`/admin/blogs`:
- Lists `moderation_queue` rows where `entity_type = 'blog'`,
  `status = 'pending'`, sorted by `created_at` ASC
- Each row links to a preview view (renders the blog as a customer
  would see it)
- Admin actions: Approve, Reject (with reason), Edit (opens the
  editor view as admin, saves back to blogs.body_json)
- Updates `moderation_queue.status` + `decided_by_user_id` +
  `decided_at` + writes `reason` if rejected/edited

### Public surface

- `/blog` index lists `status = 'published'` blogs, newest first
- `/blog/[slug]` renders one blog
- Author byline links to `/browse/<artist-slug>` (locked decision 6)
- Featured artwork cards inline, purchasable
- Add blog URLs to `/sitemap.ts`
- robots metadata: publicly indexable

### Acceptance

- Artist can draft, submit, see in pending queue
- Admin can approve / reject / edit, all paths tested
- Approved blog renders publicly, featured artworks buyable
- Sitemap includes published blogs
- Idempotency on the moderation workflow (rejecting then approving
  later works cleanly)

---

## 2.8 Admin tools

### A1: Admin chat access scoped to disputes

In `src/app/api/messages/route.ts` GET path: if requester is admin,
require `?dispute_id=<id>` and validate the dispute references the
conversation. Without the param, admin sees the same view as a
regular user (zero rows for conversations they're not in).

Audit log: every admin message read writes a row in `audit_log` with
`{ admin_user_id, dispute_id, conversation_id, timestamp }`. Add the
table if it doesn't exist:

```sql
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### A2: Dispute management panel

`/admin/disputes`:
- List from Phase 1 `disputes` + `reports` tables
- Filter: status, category, age
- Detail view: full conversation thread (read-only) via A1 scope
- Actions: mark resolved, add resolution note, close, escalate
- Each action writes to `admin_audit_log`

### A3: Financials dashboard

`/admin/financials` — read-only v1.

Tiles:
- Active subscriptions (count by tier, MRR)
- Failed payments (count this month + last)
- Renewals coming up in next 7 days
- Total revenue (this month + YoY)
- Top 10 venues by spend
- Top 10 artists by earnings

All queries against existing tables + Phase 1 additions. Read-only:
no action buttons. v2 can add refund / cancel buttons.

### Acceptance

- Admin chat without dispute_id returns 403 / empty
- All admin reads write to audit_log
- Dispute panel walks an end-to-end dispute resolution
- Financials dashboard tiles render with correct numbers

---

## 2.9 Venue artwork-request detail (D3)

Single page change. `/venue-portal/artwork-requests/[id]` already
exists from Phase 0 (D2 verified artist name display works).

Add:
- "Mark fulfilled" workflow on accepted artist response
- Behaviour by `response_type`:
  - `offer` / `commission` → create order automatically, navigate to
    new order page
  - `placement` → create placement automatically (use response's
    proposed terms), navigate to placement detail
  - `existing_works` → open a 2-button modal: "Place this work" or
    "Buy this work"; route accordingly
  - `message` → no fulfilment, just close the request

Server endpoint: `POST /api/artwork-requests/[id]/fulfill` with body
`{ response_id, action: 'placement' | 'order' }` (action only needed
for existing_works case).

### Acceptance

- Each response_type routes correctly
- existing_works modal works
- Created order / placement carries over the agreed terms
  (proposed_offer_amount_pence → order, proposed_monthly_fee_pence +
  proposed_revenue_share_percent + proposed_qr_enabled → placement)
- Request status flips to `fulfilled`

---

## Per-milestone shipping rhythm

For each milestone:

1. New branch `claude/phase-2-<milestone-id>` from main
2. Implement, commit per logical chunk (don't squash before merge)
3. `npm run typecheck && npm run lint && npm test` clean
4. PR with the milestone's acceptance criteria as the checklist
5. Self-review the PR diff
6. Merge to main via squash
7. Report back: what shipped, what's next, any decisions surfaced

## Feature flags

Add to `src/lib/feature-flags.ts`:

```ts
PAID_LOAN_V2     // gates milestone 2.2
GATING_V1        // gates milestone 2.5
BLOGS_V1         // gates milestone 2.7
```

Default OFF in prod until each milestone's verification passes. Flip
ON once smoke-tested.

## Hard constraints

1. Additive schema changes only. No DROP, no destructive ALTER.
2. Every behaviour-change milestone behind a feature flag.
3. Don't change public copy without British English + dash rules.
4. `npm run typecheck && npm run lint && npm test` clean before any
   PR.
5. New code has tests. New API endpoints have request/response
   shape tests.
6. No skipping AGENTS.md (Next.js version is non-standard, check
   `node_modules/next/dist/docs/` first).

## Reporting back

After each milestone:

1. What shipped (checklist from acceptance criteria)
2. Test / lint / typecheck status
3. Any deviations from this spec and why
4. Any new decisions surfaced for the product owner
5. Recommendation on whether to flip the feature flag now or wait
