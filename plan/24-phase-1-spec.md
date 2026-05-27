# Phase 1 spec — schema and infrastructure

Phase 0 (17 cosmetic + UX fixes) is shipped. Phase 1 adds the rails
that Phase 2 will build on top of. Everything additive, reversible,
no behaviour change for existing users.

## Stack

- Next.js 16.2.1 App Router (RSC, Turbopack), TypeScript
- Supabase Postgres + Auth + Storage
- Stripe (subscriptions, Connect payouts)
- Resend (transactional email)
- Vitest unit tests, Playwright e2e tests
- Working dir: `website/`

## Decisions locked

1. No grandfathering. Cancel = off marketplace next cycle.
2. No new Featured tier. Pro is already Featured (see browse sort).
3. Feedback bubble (Phase 2 build, no auth, bottom-left).
4. Paid loan billing: Stripe standard retry, no current-month refund,
   no retroactive refunds.
5. Email copy: standard UK consumer-rights boilerplate, no external
   legal review.
6. Blogs: in sitemap, public, byline links, unlimited featured works.
7. Blog approval SLA: no commitment.
8. Customer support: reuse `/contact`.
9. Demo profile: Maya stays as explicit demo (banner only).
10. Artwork request fulfilment: `offer`/`commission` → order,
    `placement` → placement, `existing_works` → 2-button choice modal.
11. Financials dashboard: read-only v1.
12. Paywall trigger: first protected action (publish, send placement
    request, respond to placement).
13. Featured works in blogs: unlimited.
14. Moderation queue: single admin pool.
15. Phantom slugs: only Finlay and Maya. Single 301 in
    `next.config.ts` (Phase 2).

## What to build in Phase 1

Eight chunks, each its own commit so they can be reverted
independently.

### 1a. `moderation_queue` table

Single generic table keyed by `entity_type` so blogs (I1/I2), feature
requests (K1/A5), feedback (K2/A6) all flow through one admin queue.

```sql
CREATE TABLE moderation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('blog','feature_request','feedback')),
  entity_id uuid NOT NULL,
  submitted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_email text,            -- for anonymous submissions
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','edited')),
  decided_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  reason text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX moderation_queue_status_idx
  ON moderation_queue(status, created_at DESC);
CREATE INDEX moderation_queue_entity_idx
  ON moderation_queue(entity_type, entity_id);
```

RLS: admin role only. Reference `supabase-admin-migration.sql` for
admin role pattern.

### 1b. `order_events` log + backfill

Append-only event log so lifecycle emails (J1/J2) and customer
tracking (K3) share one source of truth.

```sql
CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'order.placed',
    'order.processing',
    'order.out_for_delivery',
    'order.delivered',
    'order.delivery_confirmed',
    'order.cancelled',
    'order.refunded'
  )),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_events_order_id_idx
  ON order_events(order_id, created_at);
```

Backfill from `orders.status`:
- Every order → `order.placed` at `orders.created_at`
- If status is `processing` → also `order.processing`
- If status is `delivered` → also `order.delivered`
- Idempotency key: `backfill:${order_id}:${event_type}`

Don't change reads from `orders.status` yet. Parallel, not
replacement.

### 1c. Resend dispatcher + idempotency

Templates already in `src/emails/templates/`. Add a dispatcher.

`src/lib/email/dispatcher.ts`:

```ts
export async function sendTransactional(opts: {
  to: string,
  template:
    | 'order_placed'
    | 'order_processing'
    | 'order_delivered'
    | 'customer_confirm_delivery',
  data: Record<string, unknown>,
  idempotencyKey: string,
}): Promise<{ sent: boolean, deduped: boolean }>
```

Back it with an `email_sends` table keyed by `idempotency_key`. If key
exists, return `{sent: true, deduped: true}`. Otherwise send via
Resend, insert the row.

No trigger wiring yet. Phase 2 calls this.

### 1d. `disputes` + `reports` tables

For A1 (admin chat scoped to disputes), A2 (dispute panel).

```sql
CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opener_user_id uuid NOT NULL REFERENCES auth.users(id),
  conversation_id text,
  order_id text,
  placement_id text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolved','closed')),
  category text,                    -- 'payment','delivery','conduct','other'
  description text NOT NULL,
  resolution text,
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id),
  reported_user_id uuid REFERENCES auth.users(id),
  reported_entity_type text,
  reported_entity_id text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewed','dismissed','escalated')),
  reviewed_by_user_id uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

RLS: opener/reporter sees own rows. Admin sees all.

### 1e. `blogs` + `blog_featured_artworks`

```sql
CREATE TABLE blogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  body_json jsonb NOT NULL,         -- TipTap / ProseMirror JSON
  body_markdown text,                -- plain fallback for RSS / SEO
  cover_image_url text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','published','rejected','archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX blogs_status_published_idx
  ON blogs(status, published_at DESC);
CREATE INDEX blogs_author_idx
  ON blogs(author_user_id, created_at DESC);

CREATE TABLE blog_featured_artworks (
  blog_id uuid REFERENCES blogs(id) ON DELETE CASCADE,
  artwork_id text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (blog_id, artwork_id)
);
```

RLS:
- Author can read/write own drafts.
- Anyone can read where `status='published'`.
- Admin sees all.

### 1f. `arrangement_type` column on `placements`

Existing code infers arrangement from `monthly_fee_gbp`,
`revenue_share_percent`, `qr_enabled`. That's the root of the
"Sand Dunes shows Direct Purchase for a paid loan" audit bug. Add an
explicit column, backfill, don't flip reads yet.

```sql
ALTER TABLE placements
  ADD COLUMN arrangement_type text
  CHECK (arrangement_type IN ('free_loan','paid_loan','revenue_share','purchase','mixed'));

UPDATE placements SET arrangement_type = CASE
  WHEN COALESCE(monthly_fee_gbp,0) > 0 AND qr_enabled THEN 'mixed'
  WHEN COALESCE(monthly_fee_gbp,0) > 0 THEN 'paid_loan'
  WHEN qr_enabled THEN 'revenue_share'
  WHEN purchase_amount_pence IS NOT NULL THEN 'purchase'
  ELSE 'free_loan'
END;

ALTER TABLE placements ALTER COLUMN arrangement_type SET NOT NULL;
```

Verify column names against the actual `placements` schema before
running. `purchase_amount_pence` may not exist; adjust accordingly.

### 1g. `placement_recurring_billings`

For G3, monthly venue-to-artist billing on paid loans.

```sql
CREATE TABLE placement_recurring_billings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id text NOT NULL,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  payer_user_id uuid NOT NULL REFERENCES auth.users(id),
  payee_user_id uuid NOT NULL REFERENCES auth.users(id),
  monthly_amount_pence integer NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','past_due','paused','cancelled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

No code wiring yet. Phase 2 owns the Stripe subscription setup.

### 1h. `isSubscribed` helper

`src/lib/subscriptions.ts`:

```ts
export async function isSubscribed(userId: string): Promise<{
  active: boolean,
  plan: 'core' | 'premium' | 'pro' | null,
  user_type: 'artist' | 'venue' | 'customer' | null,
}>
```

- Reads `artist_profiles.subscription_status` /
  `artist_profiles.subscription_plan`.
- Reads `venue_profiles.subscription_status` if the column exists
  (per `tier-resolver.ts` comment, this is "future").
- `active` is true when status is `'active'` or `'trialing'`. Anything
  else (`'none'`, `'cancelled'`, `'past_due'`, NULL) returns false.
- Cache per request with React `cache()` on the server.

## Hard constraints

1. Additive only. No `DROP`, no `ALTER ... DROP COLUMN`.
2. Don't flip any existing read paths to use new columns.
3. Migrations idempotent. Use `CREATE TABLE IF NOT EXISTS` etc.
4. Don't change RLS on existing tables.
5. No feature flags. Those land in Phase 2.
6. `npm run typecheck && npm run lint && npm test` clean after each
   chunk.

## Conventions to follow

- `website/AGENTS.md` first. Next.js version is non-standard.
- Public copy: no em dashes, no en dashes, no double-hyphens. Code
  and comments exempt.
- British English in user-facing text.
- "Check first": grep before building. If a table/helper exists,
  use it.
- Vitest tests live alongside the file (`Foo.test.tsx`).

## Deliverables per chunk

- Migration file in `website/supabase/migrations/` (or
  `supabase-*.sql` if that's the existing pattern — check
  `website/supabase/` first).
- Regenerated TS types where relevant.
- For 1c and 1h: the `.ts` modules plus tests.
- One commit per chunk. Body: what was added, what was NOT touched.

## Reporting back

When all 8 done:
1. Typecheck / lint / test status.
2. Any deviations from spec and why.
3. Five-bullet "Phase 2 readiness" list.
4. Anything that needs a decision before Phase 2 starts.
