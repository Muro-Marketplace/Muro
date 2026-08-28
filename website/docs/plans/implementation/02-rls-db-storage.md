# 02 — RLS, database integrity and storage privacy (E24–E29 + schema hygiene)

Implementation plan for the CC3 (RLS deny-by-default + committed base schema) and CC4
(private buckets + signed URLs) chunks of `docs/plans/2026-07-11-stress-test-remediation-spec.md`.

Every finding below was re-derived from the files in this repo. Nothing here is quoted from
memory. Where a claim could not be verified from the repo it is labelled **UNCONFIRMED**.

All paths are relative to `website/` unless stated otherwise.

---

## 0. Confirmation summary

| ID | Title | Status | Severity | Primary evidence |
|---|---|---|---|---|
| E24 | `customer_profiles` RLS disabled | **CONFIRMED (latent in prod)** | High | `supabase/migrations/001_analytics_events.sql:84-90` |
| E25 | `message-attachments` bucket public | **CONFIRMED** | Critical | `supabase/migrations/043_message_attachments.sql:8-16`, `src/lib/upload.ts:258-263` |
| E26 | Authenticated can read all venue PII | **CONFIRMED** | High | `supabase/migrations/071_defence_in_depth_venue_pii.sql:25`, `034_rls_core_tables.sql:56-57` |
| E27 | `placement_record_versions` RLS disabled | **CONFIRMED** | High | `supabase/migrations/033_placement_record_versions.sql:6-15` |
| E28 | Non-admin self-publishes blogs | **CONFIRMED** | Medium | `supabase/migrations/061_blogs.sql:49-53` |
| E29 | DB integrity gaps | **CONFIRMED (4 sub-findings)** | High | `004:39/42`, `067:21-22`, `012:23-39`, `src/lib/stripe-connect.ts:35-48` |
| X1 | Duplicate migration numbers 037/044/045/054 | **CONFIRMED** | Medium | file listing, §7 |
| X2 | No committed base schema | **CONFIRMED (partially — see §8)** | High | root `supabase-*.sql` files are outside `supabase/migrations/` |
| X3 | `/apply` anon insert sequencing hazard | **CONFIRMED** | Blocking | `src/app/api/apply/route.ts:109,122`; `supabase-admin-migration.sql:35-37` |

**Counts: 9 confirmed, 0 unconfirmed.** Two findings carry an important qualifier (E24 is
latent because the table was never created in prod; E29 sub-finding (c) sits in migration
`012`, not `070` as the audit title suggested).

Bonus findings surfaced during the sweep and folded into the migration: **B1** any
authenticated user can read every `contact_submissions` / `waitlist_signups` /
`venue_registrations` row; **B2** any authenticated user can read every
`artist_applications` row (name, email, location, portfolio). Both are the same class as
E26 and are fixed in the same migration.

---

## 1. RLS state of every table in `supabase/migrations`

Derived by cross-referencing every `CREATE TABLE` against every `ENABLE ROW LEVEL SECURITY`
statement in `supabase/migrations/*.sql`.

### 1a. Tables created by numbered migrations

| # | Table | Created in | RLS enabled? | Client policies | Note |
|---|---|---|---|---|---|
| 1 | `analytics_events` | `001:2` | Yes (`001:24`) | none | service-role only (known-acceptable) |
| 2 | `featured_artists` | `001:27` | Yes (`001:38`) | none | service-role only |
| 3 | `artist_referrals` | `001:41` | Yes (`001:55`) | none | service-role only |
| 4 | **`customer_profiles`** | `001:84` | **NO** | n/a | **E24** |
| 5 | `terms_acceptances` | `004:7` | Yes (`004:22`) | INSERT true, SELECT own | INSERT `WITH CHECK (true)` |
| 6 | `stripe_transfers` | `004:35` | Yes (`004:52`) | SELECT own | **E29** constraints |
| 7 | `saved_items` | `004:56` | Yes (`004:67`) | SELECT/INSERT/DELETE own | ok |
| 8 | `refund_requests` | `004:77` | Yes (`004:95`) | INSERT/SELECT own (tightened in `012:45-57`) | ok |
| 9 | `artist_collections` | `005:?` | Yes (`005:32`) | owner + public read | ok |
| 10 | `notifications` | `007:?` | Yes (`007:28`) | — | — |
| 11 | `placement_records` | `011:8` | Yes (`011:54`) | party-scoped | ok |
| 12 | `placement_photos` | `011:73` | Yes (`011:83`) | party-scoped | ok |
| 13 | `curation_requests` | `013:8` | Yes (`013:52`) | — | — |
| 14 | `email_events` | `016:?` | Yes (`016:31`) | none | service-role only |
| 15 | `email_preferences` | `016:?` | Yes (`016:52`) | none | service-role only |
| 16 | `email_suppressions` | `016:?` | Yes (`016:64`) | none | service-role only |
| 17 | `newsletter_subscribers` | `018:?` | Yes (`018:17`) | INSERT true | ok |
| 18 | `placement_archives` | `026:41` | Yes (`026:50`) | owner | ok |
| 19 | **`placement_record_versions`** | `033:6` | **NO** | n/a | **E27** |
| 20 | `walls` | `035:57` | Yes (`035:251`) | owner | ok |
| 21 | `wall_layouts` | `035:125` | Yes (`035:261`) | owner | ok |
| 22 | `wall_renders` | `035:166` | Yes (`035:268`) | owner | ok |
| 23 | `visualizer_usage` | `035:197` | Yes (`035:275`) | owner | ok |
| 24 | `visualizer_quota_overrides` | `035:229` | Yes (`035:283`) | none | service-role only |
| 25 | `placement_reviews` | `041:10` | Yes (`041:27`) | none | service-role only |
| 26 | `cart_sessions` | `044_cart_sessions:8` | Yes (`:29`) | none (deliberate, `:31-33`) | ok |
| 27 | `feature_requests` | `044_feature_requests:5` | Yes (`:29`) | none | service-role only |
| 28 | `feature_request_upvotes` | `044_feature_requests:19` | Yes (`:30`) | none | service-role only |
| 29 | `purchase_offers` | `045_purchase_offers:5` | Yes (`:38`) | none | service-role only |
| 30 | `artwork_requests` | `046:?` | Yes (`046:91`) | none | service-role only |
| 31 | `artwork_request_responses` | `046:40` | Yes (`046:92`) | none | service-role only |
| 32 | `commissions` | `046:?` | Yes (`046:93`) | none | service-role only |
| 33 | `customer_addresses` | `054_customer_addresses:10` | Yes (`:31`) | owner (`customer_addresses_owner`) | ok |
| 34 | `moderation_queue` | `058:?` | Yes (`058:39`) | none | service-role only |
| 35 | `order_events` | `059:?` | Yes (`059:49`) | none | service-role only |
| 36 | `disputes` | `060:?` | Yes (`060:36`) | — | — |
| 37 | `reports` | `060:?` | Yes (`060:64`) | — | — |
| 38 | `blogs` | `061:15` | Yes (`061:35`) | select/insert/update/delete own | **E28** on UPDATE |
| 39 | `blog_featured_artworks` | `061:61` | Yes (`061:73`) | inherits blog visibility | ok |
| 40 | `placement_recurring_billings` | `063:14` | Yes (`063:39`) | participants | **E29** no `> 0` check |
| 41 | `admin_audit_log` | `066:?` | Yes (`066:21`) | none | service-role only |

**Two tables out of 41 have RLS disabled: `customer_profiles` and
`placement_record_versions`.** Those are exactly E24 and E27.

### 1b. Tables the migrations depend on but never create (the "no base schema" gap)

These exist only in un-numbered root files that no tooling runs. Their RLS state is
**unverifiable from `supabase/migrations/` alone** — this is finding X2.

| Table | Defined in (root, not a migration) | RLS enabled there | Notable policy |
|---|---|---|---|
| `artist_profiles` | `supabase-migration.sql:5` | Yes (`:94`) | `artist_profiles_select_public` (approved only), from `034:41` |
| `artist_works` | `supabase-migration.sql:40` | Yes (`:95`) | join to approved profile, `034:73` |
| `venue_profiles` | `supabase-migration.sql:57` | Yes (`:96`) | **`USING (true)`** `034:56-57` → **E26** |
| `waitlist_signups` | `supabase-tables-migration.sql:5` | Yes (`:12`) | **`SELECT USING (auth.role()='authenticated')`** → **B1** |
| `contact_submissions` | `supabase-tables-migration.sql:17` | Yes (`:25`) | **`SELECT USING (auth.role()='authenticated')`** → **B1** |
| `enquiries` | `supabase-tables-migration.sql:30` | Yes (`:41`) | narrowed by `supabase-rls-fix.sql:18-22` |
| `orders` | `supabase-tables-migration.sql:46` | Yes (`:57`) | consolidated to `orders_select_party`, `070:115-121` |
| `messages` | `supabase-tables-migration.sql:62` | Yes (`:73`) | `messages_select_party` `012:90`, insert `070:59-61` |
| `placements` | `supabase-tables-migration.sql:79` | Yes (`:92`) | `placements_select_party` `034:97`, insert `070:48-54` |
| `venue_registrations` | `supabase-tables-migration.sql:99` | Yes (`:117`) | **`SELECT USING (auth.role()='authenticated')`** → **B1** |
| `artist_applications` | `supabase-admin-migration.sql:4` | Yes (`:32`) | INSERT true; **SELECT `auth.role()='authenticated'`** → **B2**; UPDATE dropped by `073:22` |
| `conversations` | never defined in-repo | conditional (`034:154-172`) | may not exist |
| `admin_users` | never defined in-repo | conditional (`034:176-181`) | may not exist |
| `reviews` | never defined in-repo | conditional (`034:141-148`) | may not exist |

---

## 2. E24 — `customer_profiles` has RLS disabled

### 2.1 Confirmed location

`supabase/migrations/001_analytics_events.sql:83-90`:

```sql
-- Customer profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  name text,
  email text,
  created_at timestamptz DEFAULT now()
);
```

Every other table in that file gets an explicit `ALTER TABLE … ENABLE ROW LEVEL SECURITY`
(`001:24`, `001:38`, `001:55`). `customer_profiles` does not, and no later migration adds
one — verified by grepping every `ENABLE ROW LEVEL SECURITY` across `supabase/migrations/`.

### 2.2 Mechanism

Supabase grants `SELECT/INSERT/UPDATE/DELETE` on `public` tables to the `anon` and
`authenticated` roles by default. RLS is the only thing that narrows those grants. With RLS
off, PostgREST serves the table wholesale to anyone holding the anon key, which ships in the
browser bundle.

### 2.3 Exploit

```
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/customer_profiles?select=*" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Returns every customer's `name` + `email`. `PATCH`/`DELETE` on the same path work too, so the
table is writable by any visitor.

### 2.4 Important qualifier — latent, not live

`src/app/api/account/preferences/route.ts:15-22` states the table was never created in
production:

> "the production DB does not currently have a `customer_profiles` table — the
> `001_analytics_events.sql` repo migration that defined it was never applied, and the prod
> bootstrap from `supabase-all-migrations.sql` omits it."

`supabase/migrations/050_notification_prefs.sql:10-17` repeats the same claim and wraps its
customer `ALTER` in an existence check. So today the exposure is **latent**: it detonates the
moment anyone bootstraps a fresh environment from `supabase/migrations/`, or creates the
table to fix the customer notification-preferences 500. Fix it before it becomes live, not
after.

### 2.5 Exact fix

Create the table (converging prod and fresh DBs), add the preference columns migration `050`
skipped, enable RLS, and give it an owner-scoped SELECT only. Writes stay service-role.
See §10, block E24.

### 2.6 Verification

```sql
-- 1. RLS is on.
select relrowsecurity from pg_class
where oid = 'public.customer_profiles'::regclass;   -- expect: t

-- 2. Anon sees nothing.
set local role anon;
select count(*) from public.customer_profiles;      -- expect: 0
reset role;

-- 3. A signed-in user sees only their own row (run as the app, not in SQL editor):
--    GET /rest/v1/customer_profiles?select=* with a user JWT returns <= 1 row.
```

### 2.7 Breakage risk and rollback

**Risk: low.** No code reads `customer_profiles` with the anon client —
`src/app/api/account/preferences/route.ts` and `src/app/api/account/delete/route.ts:100` both
use `getSupabaseAdmin()`, which bypasses RLS. Creating the table is strictly additive and
fixes the customer-preferences 500 as a side effect.

**Rollback:** `alter table public.customer_profiles disable row level security;` (do not ship
this; prefer rolling forward).

---

## 3. E25 — `message-attachments` bucket is public

### 3.1 Confirmed location

`supabase/migrations/043_message_attachments.sql:8-16`:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  true,
  10485760,
  ARRAY['image/png','image/jpeg','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;
```

`src/lib/upload.ts:258-263`:

```ts
  const { data: urlData } = supabase.storage
    .from("message-attachments")
    .getPublicUrl(path);

  return {
    url: urlData.publicUrl,
```

`src/lib/upload.ts:229` fixes the object key shape:

```ts
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName || `attachment.${ext}`}`;
```

`supabase/migrations/065_message_attachments_storage_policies.sql:38-48` adds a public SELECT
policy, then `070_qa44_db_hardening.sql:33` drops it again:

```sql
drop policy if exists "message_attachments_public_read" on storage.objects;
```

### 3.2 Mechanism

Dropping the SELECT policy in `070` blocks **directory listing** through PostgREST, but the
bucket row still has `public = true`. Supabase's storage API serves
`/storage/v1/object/public/<bucket>/<key>` **without evaluating RLS at all** for public
buckets. The `070` comment says as much (`:29` — "Buckets stay public; object URLs keep
working, directory listing is blocked"). So knowing the key is sufficient.

The URL is then persisted verbatim into `messages.attachments[].url`
(`043:5-6` adds the JSONB column; `src/app/api/messages/route.ts:414` writes it;
`src/lib/validations.ts:114` types it as a plain `z.string().url()`), and rendered as a bare
`href`/`src` in `src/components/MessageInbox.tsx:1451-1458`.

### 3.3 Exploit

1. Any party to a conversation (or anyone who obtains the URL by any means — a forwarded
   screenshot, a referrer leak, a shared-device browser history, a proxy log) can read the
   file forever, with no auth, after the conversation ends or the sender deletes the message.
2. The key prefix is the uploader's `auth.uid()`, which is not secret (it is exposed in the
   client bundle for the signed-in user and appears in other object paths). The remaining
   entropy is `Date.now()` + 6 base-36 chars + the original filename — enough to make blind
   brute force impractical, but not a security control, and the timestamp narrows the search
   space substantially for a known upload window.
3. Message soft-delete (`029_messages_pin_and_soft_delete.sql`) hides the row, not the object.
   "Delete" does not delete.

**Severity: critical** — this is live private user data (DMs), not a latent config bug.

### 3.4 The pattern to copy — the contracts bucket

Already implemented, and it is the template:

- `src/lib/upload.ts:24` — `export const CONTRACT_REF_PREFIX = "contract:";`
- `src/lib/upload.ts:33-68` — `uploadContract()` returns `contract:<bucket>/<path>`, never a URL.
- `src/lib/upload.ts:71-82` — `isContractRef()` / `parseContractRef()`.
- `src/app/api/contracts/sign/route.ts` — auth → party check → **cross-check the ref matches
  the stored row** → `createSignedUrl(path, 60 * 10)`.
- Legacy absolute URLs are passed through unchanged (`sign/route.ts`, "Legacy row, the value
  is already a public URL").

The full E25 plan is §11 (CC4), because it is a sequenced refactor, not a one-line migration.

---

## 4. E26 — any authenticated user can read all venue PII

### 4.1 Confirmed location

`supabase/migrations/034_rls_core_tables.sql:55-60`:

```sql
DROP POLICY IF EXISTS "venue_profiles_select_public" ON venue_profiles;
CREATE POLICY "venue_profiles_select_public" ON venue_profiles
  FOR SELECT USING (true);
```

`supabase/migrations/071_defence_in_depth_venue_pii.sql:25`:

```sql
revoke select on public.venue_profiles from anon;
```

and `071:22-23`, stating the gap in as many words:

> "The authenticated and service_role roles are intentionally left untouched (see ADR 0004)."

`docs/adr/0004-defence-in-depth-view.md:28` records the deferral:

> "**`authenticated` role left untouched.** A logged-in user could still read these columns
> directly. … Tightening `authenticated` is a sensible follow-up but carries more breakage
> risk and is deferred."

`070_qa44_db_hardening.sql:108-109` drops `venue_profiles_select` and
`venue_profiles_select_own` but **not** `venue_profiles_select_public`, so `USING (true)`
survives.

### 4.2 Mechanism

Column-level `REVOKE`/`GRANT` is per-role. `071` fixed `anon` only. The row policy is
`USING (true)`, so the `authenticated` role — every signed-in user, including a brand-new
free account — still has a table-level `SELECT` grant covering `email`, `phone`,
`address_line1`, `address_line2`, `postcode` and `contact_name` on **every** venue.

### 4.3 Exploit

Sign up for any account, then from the browser console:

```js
await supabase.from("venue_profiles").select("name, email, phone, address_line1, postcode, contact_name");
```

Returns the full contact book for every venue on the platform — directly monetisable as a
competitor lead list, and a GDPR notifiable event.

### 4.4 Exact fix

Extend the `071` column-grant treatment to `authenticated`, using the same
exclusion-list generator so it stays correct as columns are added. See §10, block E26.

**Pre-flight check that this is safe** (done, evidence below):

- Every server-side read of `venue_profiles` uses the service-role client
  (`getSupabaseAdmin()`), which is not subject to column grants. Verified across
  `src/app/api/placements/**`, `src/app/api/offers/**`, `src/app/api/messages/route.ts`.
- The only anon/authenticated-client read is `getVenueProfileBySlug`
  (`src/lib/db/venue-profiles.ts:33-41`), and it already selects an explicit non-PII column
  list (`VENUE_PUBLIC_COLUMNS`, `:30-31`) precisely because of `071`.
- `src/app/api/stats/public/route.ts:19` selects `id` only (a count).

### 4.5 Verification

```sql
-- Column grants for authenticated must exclude the six PII columns.
select column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name  = 'venue_profiles'
  and grantee     = 'authenticated'
  and privilege_type = 'SELECT'
  and column_name in ('email','phone','address_line1','address_line2','postcode','contact_name');
-- expect: 0 rows

-- And no table-level grant remains (which would implicitly re-cover every column):
select 1 from information_schema.role_table_grants
where table_schema='public' and table_name='venue_profiles'
  and grantee='authenticated' and privilege_type='SELECT';
-- expect: 0 rows
```

Plus an e2e assertion alongside the existing `tests/e2e/security-no-leaks.spec.ts` cases:
a signed-in non-venue user requesting `select=email` on `venue_profiles` gets a 401/403.

### 4.6 Breakage risk and rollback

**Risk: medium.** Higher than E24/E27 because it changes grants on a table the public
marketplace reads. The mitigations are the three pre-flight checks above. The realistic
failure mode is a future `select("*")` added by someone unaware of the grant — mitigate with
a lint rule (§13, task 14) rather than by leaving the hole open.

**Rollback:** `grant select on public.venue_profiles to authenticated;` restores the prior
(insecure) state in one statement. Keep it in the runbook, do not ship it.

---

## 5. E27 — `placement_record_versions` RLS disabled

### 5.1 Confirmed location

`supabase/migrations/033_placement_record_versions.sql:6-18` — the whole file:

```sql
CREATE TABLE IF NOT EXISTS placement_record_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id TEXT NOT NULL,
  version_of_record_id UUID,
  changed_by_user_id UUID NOT NULL,
  changed_by_role TEXT,
  snapshot JSONB NOT NULL,
  changed_fields TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_placement_record_versions_placement_id
  ON placement_record_versions(placement_id, created_at DESC);
```

No `ENABLE ROW LEVEL SECURITY`, in this file or any later one.

### 5.2 Mechanism

Same as E24 — default anon/authenticated grants, no RLS to narrow them. Worse than E24
because `snapshot JSONB` is a **full row copy of `placement_records`** taken on every edit
(`src/app/api/placements/[id]/record/route.ts:195`), i.e. commercial terms: fees, revenue
share splits, insurance values, contract references, dates, both parties' user ids.

Note that the parent `placement_records` table **is** protected (`011:54`), so this is a
side-door around an otherwise correct control.

### 5.3 Exploit

```
curl "$SUPABASE_URL/rest/v1/placement_record_versions?select=snapshot" -H "apikey: $ANON_KEY"
```

Dumps the negotiated commercial terms of every placement on the platform, plus the full edit
history showing who conceded what and when. `DELETE` also works, so the audit trail is
anon-erasable.

### 5.4 Exact fix

Enable RLS; add a party-scoped SELECT via a join to `placements`; no client write policies
(the only writer is `src/app/api/placements/[id]/record/route.ts:195` using the service-role
client). See §10, block E27.

### 5.5 Verification

```sql
select relrowsecurity from pg_class
where oid = 'public.placement_record_versions'::regclass;   -- expect: t

set local role anon;
select count(*) from public.placement_record_versions;      -- expect: 0
reset role;

-- Policy exists and is SELECT-only:
select policyname, cmd from pg_policies
where schemaname='public' and tablename='placement_record_versions';
-- expect exactly one row: placement_record_versions_select_party | SELECT
```

Behavioural check: `GET /api/placements/<id>` still returns the version list
(`src/app/api/placements/[id]/route.ts:112`) — it reads through the admin client, so it is
unaffected.

### 5.6 Breakage risk and rollback

**Risk: very low.** Both call sites use `getSupabaseAdmin()`; there is no client-side read.
**Rollback:** `alter table public.placement_record_versions disable row level security;`

---

## 6. E28 — non-admin can self-publish blogs

### 6.1 Confirmed location

`supabase/migrations/061_blogs.sql:49-53`:

```sql
DO $$ BEGIN
  CREATE POLICY "blogs_update_own" ON blogs
    FOR UPDATE USING (auth.uid() = author_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

Against the file's own stated intent (`061:8`): "Phase 2 owns the editor UI, the public /blog
routes, and the moderation workflow that feeds `moderation_queue` (mig 058)."

And the public read policy that makes it matter, `061:37-41`:

```sql
  CREATE POLICY "blogs_select_published_or_own" ON blogs
    FOR SELECT USING (status = 'published' OR auth.uid() = author_user_id);
```

### 6.2 Mechanism

An `UPDATE` policy with no explicit `WITH CHECK` reuses its `USING` expression as the
`WITH CHECK`. Here that expression only asserts `auth.uid() = author_user_id` — it says
nothing about `status`. So the author can change `status` to anything the column's
`CHECK (status IN ('draft','pending_review','published','rejected','archived'))` permits
(`061:23-24`), including `published`. `blogs_select_published_or_own` then makes the row
world-readable, and `blog_featured_artworks_select` (`061:79-89`) exposes the featured
artworks with it.

`moderation_queue` (mig `058`) is never consulted by the database. Moderation is entirely
advisory at the RLS layer.

### 6.3 Exploit

```js
await supabase.from("blogs")
  .update({ status: "published", published_at: new Date().toISOString(), body_markdown: payload })
  .eq("id", myDraftId);
```

Content of the author's choosing goes live on the public `/blog` route with no admin review:
defamation, spam/SEO, malicious links, or brand-damaging copy under the Wallplace masthead.

**Mitigating factor:** the spec (`§12`, CC9) records `BLOGS_V1` as still off, so the public
route may not be live. That reduces urgency, not correctness — the RLS hole must be closed
before the flag flips, not after.

### 6.4 Exact fix (and the deliberate trade-off)

Replace the policy with one carrying an explicit `WITH CHECK` that forbids the author writing
`published` or `rejected`. Consequence, stated plainly: **once a post is published, its
author can no longer edit it through the client** — any UPDATE would produce a row whose new
`status` is `published`, failing the check. That is the correct default for a moderated
surface, and admin edits go through the service-role client regardless.

If Phase 2 needs authors to edit live posts, use **variant B** in §10 (a `BEFORE UPDATE`
trigger that blocks only the *transition* into `published`/`rejected`, leaving unchanged-status
edits alone). Ship variant A now; swap to B when the editor UI lands.

### 6.5 Verification

```sql
select policyname, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename='blogs' and policyname='blogs_update_own';
-- with_check must contain: status = ANY (ARRAY['draft','pending_review','archived'])
```

Behavioural test (add to the suite):

```ts
// as the author, on their own draft
const { error } = await supabase.from("blogs")
  .update({ status: "published" }).eq("id", draftId);
expect(error).toBeTruthy();               // RLS violation, 42501
// but a normal edit still works
const ok = await supabase.from("blogs")
  .update({ title: "New title" }).eq("id", draftId);
expect(ok.error).toBeNull();
```

### 6.6 Breakage risk and rollback

**Risk: low** while `BLOGS_V1` is off. **Rollback:** re-create the original policy
(the exact text is quoted in §6.1).

---

## 7. E29 — database integrity gaps

Four distinct sub-findings. Note that (c) lives in migration `012`, **not** `070`.

### 7.1 (a) Idempotency NULL hole on `stripe_transfers`

**Confirmed.** `supabase/migrations/004_pre_launch_features.sql:35-47`:

```sql
CREATE TABLE IF NOT EXISTS stripe_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  recipient_user_id UUID,            -- ← nullable
  ...
  amount_cents INTEGER NOT NULL,     -- ← no CHECK
```

`supabase/migrations/067_stripe_transfers_paid_loan_idempotency.sql:21-22`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS stripe_transfers_order_recipient_uniq
  ON stripe_transfers(order_id, recipient_user_id);
```

**Mechanism.** A btree unique index is `NULLS DISTINCT` by default: two rows with the same
`order_id` and `recipient_user_id IS NULL` do **not** collide. The index the migration's
header describes as protection against "a Stripe replay would insert a second pending
transfer and the payout cron would pay the artist twice" (`067:8-9`) is inert for exactly the
rows where the recipient is unknown.

It is compounded by `src/lib/stripe-connect.ts:35-48`, which never destructures `error`:

```ts
  const { data: inserted } = await db
    .from("stripe_transfers")
    .insert({ ... })
    .select("id")
    .maybeSingle();
```

A unique violation is silently swallowed, so neither the DB nor the app surfaces the replay.
(That swallowed error is also E37/CC6; fixing it is listed in §13.)

**Exploit / failure.** Not attacker-driven: a Stripe webhook retry (Stripe retries for up to
three days) with a NULL recipient inserts a second `pending` row, and
`/api/stripe-connect/process-pending` pays it. Real money leaves twice.

**Fix.** Assert no NULLs remain, set the column `NOT NULL`, and rebuild the index
`NULLS NOT DISTINCT` as belt-and-braces. §10, block E29a.

**Verification.**

```sql
-- Must be 0 before applying, and stays 0 after.
select count(*) from public.stripe_transfers where recipient_user_id is null;

select a.attnotnull from pg_attribute a
where a.attrelid='public.stripe_transfers'::regclass and a.attname='recipient_user_id';
-- expect: t

select indnullsnotdistinct from pg_index
where indexrelid = 'public.stripe_transfers_order_recipient_uniq'::regclass;
-- expect: t
```

**Risk.** Medium — `SET NOT NULL` fails loudly if legacy NULL rows exist. That is deliberate:
run the pre-check first (§10 gates it in a `DO` block that raises with a clear message).
**Rollback:** `alter table stripe_transfers alter column recipient_user_id drop not null;`

### 7.2 (b) No `amount > 0` checks

**Confirmed.** Missing on:

| Column | File:line | Current |
|---|---|---|
| `stripe_transfers.amount_cents` | `004:42` | `INTEGER NOT NULL` |
| `placement_recurring_billings.monthly_amount_pence` | `063:21` | `INTEGER NOT NULL` |
| `refund_requests.amount` | `004:86` | `NUMERIC` (nullable) |

The correct pattern already exists three files away —
`045_purchase_offers.sql:13`: `amount_pence INTEGER NOT NULL CHECK (amount_pence > 0)`.

**Mechanism / exploit.** Every amount is computed app-side. `stripe-connect.ts` will happily
persist a `0` or negative `amount_cents` if an upstream calculation underflows (e.g. a
platform fee larger than the gross). Nothing at the DB layer stops it, and
`processPendingTransfers` then attempts a Stripe transfer with a nonsense amount. A negative
`refund_requests.amount` is a refund that bills the customer.

**Fix.** `CHECK` constraints added `NOT VALID` then `VALIDATE`d, so legacy rows do not block
the deploy but new rows are enforced immediately. §10, block E29b.

**Verification.**

```sql
select conname, convalidated from pg_constraint
where conrelid in ('public.stripe_transfers'::regclass,
                   'public.placement_recurring_billings'::regclass,
                   'public.refund_requests'::regclass)
  and contype = 'c' and conname like '%amount%';
-- expect 3 rows, all convalidated = t

-- negative control
insert into public.stripe_transfers(order_id, recipient_type, recipient_user_id,
  stripe_connect_account_id, amount_cents)
values ('t', 'artist', gen_random_uuid(), 'acct_x', -1);   -- expect: 23514 check violation
```

**Risk.** Low-medium. `VALIDATE CONSTRAINT` fails if bad rows exist — that is the intended
signal. §10 emits a `RAISE NOTICE` with the offending count rather than failing silently.
**Rollback:** `alter table … drop constraint …;`

### 7.3 (c) Silently-skipped FK adds

**Confirmed** — in `012`, not `070`. `supabase/migrations/012_security_hardening.sql:23-39`:

```sql
DO $$ BEGIN
  ALTER TABLE orders
    ADD CONSTRAINT fk_orders_artist_user
    FOREIGN KEY (artist_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE refund_requests
    ADD CONSTRAINT fk_refund_requests_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN others THEN NULL;
END $$;
```

**Mechanism.** `WHEN others THEN NULL` swallows *every* error class, most importantly
`foreign_key_violation` (23503) — which is exactly what `ADD CONSTRAINT` raises when existing
rows fail the new constraint. The migration therefore reports success while adding nothing.
Two years of "we have referential integrity on orders" may be false, and nothing in the repo
proves either way — you cannot tell from the file whether the constraints exist.

**Exploit / failure.** `refund_requests.order_id` with no FK means a refund can reference a
non-existent order; `ON DELETE RESTRICT` was supposed to prevent orphaning and may not be
there. `orders.artist_user_id` with no FK means deleting an artist leaves dangling ids rather
than `NULL`, so the account-deletion path (`src/app/api/account/delete/route.ts`) leaves
ghosts.

**Fix.** Re-attempt both adds, but catch **only** `duplicate_object`, and pre-report orphans
so the operator knows what to clean rather than being surprised by a failed deploy. §10,
block E29c. Add `NOT VALID` first / `VALIDATE` second so a large table does not take a long
`ACCESS EXCLUSIVE` lock.

**Verification.**

```sql
select conname, convalidated, confdeltype from pg_constraint
where conname in ('fk_orders_artist_user','fk_refund_requests_order');
-- expect 2 rows; convalidated = t;
-- confdeltype: 'n' (SET NULL) for the first, 'r' (RESTRICT) for the second
```

**Risk. This is the riskiest single block in the migration** — it is the only one that can
fail on real data. Mitigation: the orphan-count query runs first and the block raises a
descriptive exception naming the exact cleanup query. Run the orphan query against prod
before scheduling the deploy.
**Rollback:** `alter table … drop constraint …;`

### 7.4 (d) Always-true policies still live on base-schema tables

**Confirmed** (the E29 spec line "messages: confirm RLS, drop always-inert policies").
From `supabase-tables-migration.sql`:

- `:14` `CREATE POLICY "Authenticated can read waitlist" ON waitlist_signups FOR SELECT USING (auth.role() = 'authenticated');`
- `:27` same shape on `contact_submissions`
- `:119` same shape on `venue_registrations`

and from `supabase-admin-migration.sql:40-42`:

```sql
CREATE POLICY "Authenticated users can read applications"
  ON artist_applications FOR SELECT
  USING (auth.role() = 'authenticated');
```

`073_restrict_artist_applications_update.sql:18-20` confirms this policy is still live:
"The table keeps its public INSERT policies (the application form) and the authenticated
SELECT policy."

**Exploit.** Any signed-in user reads every contact-form submission, every waitlist email,
every venue registration, and every artist application (`name`, `email`, `location`,
`instagram`, `portfolio_link`, `artist_statement`). Same class as E26, different tables.

**Fix.** Drop all four SELECT policies. Every legitimate read is admin-side through
`getSupabaseAdmin()`. §10, block B1/B2 — but see §9 first: the `artist_applications`
**INSERT** policy must NOT be dropped in isolation.

**Verification.**

```sql
select tablename, policyname, cmd, qual from pg_policies
where schemaname='public'
  and tablename in ('waitlist_signups','contact_submissions','venue_registrations','artist_applications')
  and cmd = 'SELECT';
-- expect: 0 rows
```

**Risk: low**, conditional on §9 being honoured.

---

## 8. X1 — duplicate migration numbers

### 8.1 The colliding files

| # | Files | Sort order the CLI sees | Cross-migration deps |
|---|---|---|---|
| 037 | `037_walls_public_profile_toggle.sql`, `037_welcomed_at.sql` | walls, then welcomed_at | walls ← `035`; `welcomed_at` referenced nowhere else |
| 044 | `044_cart_sessions.sql`, `044_feature_requests.sql` | cart_sessions, then feature_requests | `feature_requests` ← referenced by `058`, `070`; `cart_sessions` ← referenced by `070` only |
| 045 | `045_artist_charges_cache.sql`, `045_purchase_offers.sql` | artist_charges_cache, then purchase_offers | `purchase_offers` ← referenced by `046`, `049`, `062`, `070`; `artist_charges_cache` referenced nowhere |
| 054 | `054_artwork_request_response_placement_terms.sql`, `054_customer_addresses.sql` | terms, then addresses | neither referenced later |

Corroborating evidence that these are merge artefacts: `044_feature_requests.sql:1` still
says `-- 041_feature_requests.sql`, `045_purchase_offers.sql:1` says
`-- 042_purchase_offers.sql`, and `043_message_attachments.sql:1` says
`-- 040_message_attachments.sql`. Files have been renumbered by hand before, and the headers
were not updated.

### 8.2 Why it actually matters

Two problems, only one of which is "ordering":

1. **Ordering** is resolved by filename sort, so it is deterministic *for the Supabase CLI*
   — but not for a human running files by number, nor for any tool that keys on the numeric
   prefix. Here the ordering happens to be harmless (verified: each pair is order-independent).
2. **Version-key collision** is the real bug. The Supabase CLI records applied migrations in
   `supabase_migrations.schema_migrations`, keyed on the numeric version. Two files claiming
   version `037` means the second insert conflicts, and depending on CLI version you get
   either a hard error or a silently-skipped migration on a fresh bootstrap.

### 8.3 Proposed renumbering — dependency-safe, uses only free slots

Free slots in the current sequence: **002, 017, 068, 069** (there is no `002`, `017`, `068` or
`069` file). Four free slots, four files to move. Keep the member of each pair that has
downstream references; move the one that does not.

| Move | From | To | Why safe |
|---|---|---|---|
| 1 | `037_welcomed_at.sql` | `002_welcomed_at.sql` | Pure `ADD COLUMN IF NOT EXISTS` on `artist_profiles` + `venue_profiles`, both present from the base schema. Referenced by no other migration. |
| 2 | `044_cart_sessions.sql` | `017_cart_sessions.sql` | Standalone table, no FKs (`044_cart_sessions:8-20`). Must land **before** `070`, which drops `idx_cart_sessions_stripe_session_id` — 017 satisfies that. |
| 3 | `045_artist_charges_cache.sql` | `068_artist_charges_cache.sql` | Two `ADD COLUMN IF NOT EXISTS` on `artist_profiles`. Referenced by no other migration. |
| 4 | `054_customer_addresses.sql` | `069_customer_addresses.sql` | Standalone table, FK to `auth.users` only. Referenced by no other migration. |

`037_walls_public_profile_toggle.sql`, `044_feature_requests.sql`, `045_purchase_offers.sql`
and `054_artwork_request_response_placement_terms.sql` keep their numbers, so every downstream
reference (`046`, `049`, `058`, `062`, `070`, `072`) stays satisfied.

Also fix the stale headers in `043`, `044_feature_requests`, `045_purchase_offers` while
renaming, so the file name and the header agree.

### 8.4 Making the rename a no-op on environments where it already applied

Renaming changes the version key, so a naive `supabase db push` would treat each renamed file
as brand new and re-run it. Two of the four would then fail (`044_cart_sessions` and
`054_customer_addresses` contain `CREATE POLICY` / `CREATE UNIQUE INDEX` that are only
partly guarded). Ship this reconciliation **once per environment, before the first push after
the rename**:

```sql
-- supabase/reconcile/2026-07-renumber.sql
-- Run ONCE against every already-bootstrapped environment (prod + each long-lived
-- preview branch) BEFORE the first `supabase db push` after the renumbering.
--
-- Marks the four new version keys as already applied so the CLI skips them. The
-- OLD keys are left in place: they are still the honest record that "something
-- numbered 037 ran here", and deleting them would make 037/044/045/054 look
-- unapplied.
insert into supabase_migrations.schema_migrations (version, name)
values
  ('002', 'welcomed_at'),
  ('017', 'cart_sessions'),
  ('068', 'artist_charges_cache'),
  ('069', 'customer_addresses')
on conflict (version) do nothing;
```

Confirm afterwards with `supabase migration list --linked` — every local file must show a
matching remote version and the diff must be empty apart from `074`.

### 8.5 Going forward

Adopt the CLI's native timestamp convention (`<YYYYMMDDHHMMSS>_name.sql`) for everything
**after** `074`, and add a CI guard so a collision can never recur:

```bash
# scripts/audit/check-migration-numbers.sh
set -euo pipefail
dupes=$(ls website/supabase/migrations/*.sql \
  | xargs -n1 basename \
  | sed -E 's/^([0-9]+)_.*/\1/' \
  | sort | uniq -d)
if [ -n "$dupes" ]; then
  echo "Duplicate migration version prefixes: $dupes" >&2
  exit 1
fi
```

Wire it into the same required-checks workflow described in `docs/ci/`.

---

## 9. X2 — no committed base schema

### 9.1 What actually exists

There **is** a base schema, but it is not in `supabase/migrations/` and no tooling runs it.
Seven un-numbered files sit at `website/` root (all last touched by commit `715cdae`,
"Add migration for 7 missing tables"):

| File | Defines |
|---|---|
| `supabase-migration.sql` | `artist_profiles`, `artist_works`, `venue_profiles` |
| `supabase-tables-migration.sql` | `waitlist_signups`, `contact_submissions`, `enquiries`, `orders`, `messages`, `placements`, `venue_registrations` |
| `supabase-admin-migration.sql` | `artist_applications` |
| `supabase-all-migrations.sql` | a concatenation of the above (this is what prod was bootstrapped from — see `050:11-13`) |
| `supabase-rls-fix.sql` | policy tightening on `orders`, `enquiries`, `messages` |
| `supabase-subscriptions-migration.sql`, `supabase-coordinates-migration.sql` | small column adds |

`conversations`, `admin_users` and `reviews` are referenced by `034` but defined **nowhere** in
the repo. `034:141-181` guards each behind an `information_schema` existence check, so a fresh
DB silently gets no RLS on tables that may exist in prod.

### 9.2 Consequences

- `supabase/migrations/001` through `073` cannot be applied to an empty database: `001:58`
  is `ALTER TABLE artist_profiles ADD COLUMN …` against a table nothing created.
- Nobody can answer "is RLS on for `orders` in prod?" from the repo. The audit
  had to be conducted against advisor snapshots (`scripts/audit/baseline-advisors.json`)
  rather than source.
- Preview branches and local dev cannot reproduce prod, so RLS regressions cannot be caught
  in CI.

### 9.3 Specified approach for `000_base_schema.sql`

**Generate it from prod, do not hand-write it.**

```bash
# 1. Link to the live project (read-only operation).
supabase link --project-ref uwkuhygwvasdzwsusiym

# 2. Dump schema only — no data, no ownership/ACL noise.
supabase db dump --linked --schema public -f /tmp/base_raw.sql

# 3. Also capture storage bucket rows and storage.objects policies, which
#    `--schema public` misses and which E25 depends on.
supabase db dump --linked --schema storage -f /tmp/base_storage_raw.sql
```

**Then make it idempotent and skippable** by a mechanical transform, in this order:

1. `CREATE TABLE ` → `CREATE TABLE IF NOT EXISTS `
2. `CREATE INDEX ` / `CREATE UNIQUE INDEX ` → add `IF NOT EXISTS`
3. `CREATE POLICY "x" ON y` → prefix with `DROP POLICY IF EXISTS "x" ON y;`
4. `ALTER TABLE … ADD CONSTRAINT …` → wrap in
   `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
   (**catch `duplicate_object` only** — never `others`; that is exactly the E29c bug)
5. `CREATE TYPE` → `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
6. Delete every `ALTER … OWNER TO`, `GRANT`/`REVOKE` on `postgres`/`supabase_admin`, and
   every `SET` preamble line — Supabase manages those.
7. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` is already idempotent; leave it.
8. Prepend a header stating the source project, the dump date, and that the file is
   reference-plus-bootstrap, not a change record.

**Skippability on already-bootstrapped environments.** Because every statement is now
individually idempotent, re-running is harmless. Belt and braces, register the version as
applied in the same reconciliation pass as §8.4:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('000', 'base_schema')
on conflict (version) do nothing;
```

**Verify the file is genuinely idempotent** before committing:

```bash
supabase db reset                              # fresh local DB, applies 000 then 001..074
psql "$LOCAL_DB" -f supabase/migrations/000_base_schema.sql   # second run must be clean
supabase db diff --linked --schema public      # must report no drift vs prod
```

**Definition of done:** `supabase db reset` on an empty database succeeds end to end, and
`supabase db diff --linked` is empty. That is the first time the repo can prove its own RLS
posture — and it is a **prerequisite** for trusting any of the verification queries in §2–§7.

**Then delete the root `supabase-*.sql` files** in the same PR (they become a trap once a real
base schema exists), and add `website/*.sql` to a CI check that rejects new stray SQL outside
`supabase/`.

---

## 10. X3 — the `/apply` sequencing hazard (read before writing 074)

### 10.1 Confirmed location

`src/app/api/apply/route.ts:2` imports the **anon** client:

```ts
import { supabase } from "@/lib/supabase";
```

`src/app/api/apply/route.ts:109`:

```ts
    let { error } = await supabase.from("artist_applications").insert(fullRow);
```

and again on the legacy-column retry path, `:122`:

```ts
        const retry = await supabase.from("artist_applications").insert(safeRow);
```

The only reason this works is `supabase-admin-migration.sql:34-37`:

```sql
-- Anyone can submit an application (no auth required)
CREATE POLICY "Anyone can insert applications"
  ON artist_applications FOR INSERT
  WITH CHECK (true);
```

### 10.2 The hazard

Migration `074` drops the over-broad `artist_applications` **SELECT** policy (§7.4/B2). It
must **not** also drop the INSERT policy unless `/apply` has been switched to the service-role
client in the same release. Dropping the INSERT policy alone means every artist application
fails with a 42501 RLS violation, surfacing to the applicant as "Something went wrong. Please
try again." (`apply/route.ts:135-137`) — a silent funnel outage at the top of artist
acquisition.

### 10.3 The paired change (ship together, one PR)

**Code, first in the diff** — `src/app/api/apply/route.ts`:

```ts
-import { supabase } from "@/lib/supabase";
 import { getSupabaseAdmin } from "@/lib/supabase-admin";
```

```ts
+    const dbAnon = getSupabaseAdmin();   // named for the diff; see note below
-    let { error } = await supabase.from("artist_applications").insert(fullRow);
+    let { error } = await getSupabaseAdmin().from("artist_applications").insert(fullRow);
```

and the same substitution at `:122`. The route already calls `getSupabaseAdmin()` at `:151`
for the `artist_profiles` bridge, so hoist one `const db = getSupabaseAdmin();` above the
`try` at `:31` and use it in all three places. `getAuthenticatedUser` at `:28` is unchanged —
the route stays open to unauthenticated submitters by design (`:24-27`).

Retained protections once RLS no longer gates the write: `checkRateLimit(request, 5, 60000)`
at `:15`, `applySchema.safeParse` at `:33`, and the `23505` duplicate-email branch at `:128`.
That is adequate; the anon INSERT policy was never the abuse control.

**Migration, second in the diff** (§11, block X3):

```sql
drop policy if exists "Anyone can insert applications" on public.artist_applications;
```

**Test to add** (`src/app/api/apply/route.test.ts`): assert the module calls
`getSupabaseAdmin` and never the anon client for the insert. Without it, a future refactor
silently reintroduces the dependency.

### 10.4 Other routes on the same anon-insert pattern

Not in scope for `074`, but the identical shape exists and will bite the next time someone
tightens one of these tables. Record it, do not fix it here:

- `src/app/api/waitlist/route.ts:24` → `waitlist_signups`
- `src/app/api/contact/route.ts:20` → `contact_submissions`
- `src/app/api/register-venue/route.ts:27` → `venue_registrations`
- `src/app/api/enquiry/route.ts:21` → `enquiries`

`074` drops only the **SELECT** policies on the first three, so they are unaffected. Flag as a
follow-up (§13, task 15).

---

## 11. The complete `074_rls_gap_closure.sql`

Write to `website/supabase/migrations/074_rls_gap_closure.sql`.

```sql
-- 074_rls_gap_closure.sql
--
-- Stress-test remediation, CC3. Closes E24, E26, E27, E28, E29 and the two
-- adjacent findings (B1, B2) surfaced while confirming them.
--
-- SEQUENCING — read docs/plans/implementation/02-rls-db-storage.md §10 first.
-- The `artist_applications` INSERT policy is dropped at the bottom of this
-- file. That is only safe because the SAME release switches
-- src/app/api/apply/route.ts:109 and :122 from the anon client to
-- getSupabaseAdmin(). If that code change is not in this deploy, delete the
-- X3 block below or artist applications break.
--
-- Idempotent throughout: guarded DO blocks, IF NOT EXISTS, DROP-then-CREATE
-- for policies. Safe to re-run. Every exception handler catches a SPECIFIC
-- condition — never `WHEN others` (that is the E29c bug this file also fixes).

begin;

-- ════════════════════════════════════════════════════════════════════
-- E24 — customer_profiles: create (prod never had it) + RLS + owner read
-- ════════════════════════════════════════════════════════════════════
-- Mirrors 001_analytics_events.sql:84-90. Prod was bootstrapped from
-- supabase-all-migrations.sql, which omitted the table (see 050:10-17), so
-- this converges prod and fresh DBs and incidentally fixes the 500 on
-- /api/account/preferences for customer accounts.
create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text,
  email text,
  created_at timestamptz default now()
);

-- Columns migration 050 skipped because the table did not exist.
alter table public.customer_profiles
  add column if not exists email_digest_enabled boolean default true,
  add column if not exists message_notifications_enabled boolean default true,
  add column if not exists order_notifications_enabled boolean default true;

create index if not exists customer_profiles_user_id_idx
  on public.customer_profiles(user_id);

alter table public.customer_profiles enable row level security;

-- Read-own only. Every write goes through /api/account/* on the service-role
-- client, which bypasses RLS; no client INSERT/UPDATE/DELETE policy is added
-- on purpose (deny-by-default, matching the 18 tables in
-- scripts/audit/known-acceptable.json).
drop policy if exists customer_profiles_select_own on public.customer_profiles;
create policy customer_profiles_select_own on public.customer_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ════════════════════════════════════════════════════════════════════
-- E27 — placement_record_versions: RLS + party-scoped read
-- ════════════════════════════════════════════════════════════════════
-- Created without RLS in 033_placement_record_versions.sql:6. snapshot JSONB
-- is a full copy of placement_records, i.e. private commercial terms.
alter table public.placement_record_versions enable row level security;

drop policy if exists placement_record_versions_select_party
  on public.placement_record_versions;
create policy placement_record_versions_select_party
  on public.placement_record_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.placements p
      where p.id = placement_record_versions.placement_id
        and ((select auth.uid()) = p.artist_user_id
          or (select auth.uid()) = p.venue_user_id)
    )
  );

-- Writes: service role only (src/app/api/placements/[id]/record/route.ts:195).
-- No INSERT/UPDATE/DELETE policy on purpose.

-- Supporting index for the policy's join key.
create index if not exists placement_record_versions_placement_idx
  on public.placement_record_versions(placement_id);

-- ════════════════════════════════════════════════════════════════════
-- E26 — venue PII: extend the 071 column-grant revoke to `authenticated`
-- ════════════════════════════════════════════════════════════════════
-- 071 revoked only from anon and said so at 071:22-23. Same mechanism,
-- same six columns, applied to authenticated. A bare column-level REVOKE is a
-- no-op while a table-level SELECT grant stands, so revoke the table grant
-- first, then re-grant every non-PII column by exclusion.
--
-- Safe because: all server reads use the service-role client; the only
-- anon/authenticated-client read is getVenueProfileBySlug
-- (src/lib/db/venue-profiles.ts:33), which already selects an explicit
-- non-PII column list; /api/stats/public reads id only.
revoke select on public.venue_profiles from authenticated;

do $$
declare
  safe_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into safe_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'venue_profiles'
    and column_name not in (
      'email', 'phone', 'address_line1', 'address_line2', 'postcode', 'contact_name'
    );
  execute format('grant select (%s) on public.venue_profiles to authenticated', safe_cols);
end $$;

-- ════════════════════════════════════════════════════════════════════
-- E28 — blogs: author cannot self-publish (variant A, deny-by-default)
-- ════════════════════════════════════════════════════════════════════
-- 061_blogs.sql:49-53 created blogs_update_own with USING only. Postgres then
-- reuses USING as WITH CHECK, which constrains authorship but says nothing
-- about `status` — so the author can set status='published' and
-- blogs_select_published_or_own (061:38) makes it world-readable, bypassing
-- moderation_queue (mig 058) entirely.
--
-- CONSEQUENCE, accepted deliberately: once a post is published, its author can
-- no longer UPDATE it through the client (the new row's status would fail the
-- check). Admin/service-role edits are unaffected. If Phase 2's editor needs
-- authors to edit live posts, swap to variant B (trigger) documented in
-- docs/plans/implementation/02-rls-db-storage.md §6.4.
drop policy if exists blogs_update_own on public.blogs;
create policy blogs_update_own on public.blogs
  for update to authenticated
  using ((select auth.uid()) = author_user_id)
  with check (
    (select auth.uid()) = author_user_id
    and status in ('draft', 'pending_review', 'archived')
  );

-- Same hole on INSERT: nothing stopped an author creating a row that is
-- already published.
drop policy if exists blogs_insert_own on public.blogs;
create policy blogs_insert_own on public.blogs
  for insert to authenticated
  with check (
    (select auth.uid()) = author_user_id
    and status in ('draft', 'pending_review')
  );

-- ════════════════════════════════════════════════════════════════════
-- E29a — stripe_transfers idempotency NULL hole
-- ════════════════════════════════════════════════════════════════════
-- 004:39 made recipient_user_id nullable; 067:21 built a UNIQUE index on
-- (order_id, recipient_user_id). Btree uniques are NULLS DISTINCT by default,
-- so NULL-recipient rows never collide and the replay guard 067 describes at
-- :8-9 does not fire — the payout cron pays twice.
do $$
declare
  bad_count bigint;
begin
  select count(*) into bad_count
  from public.stripe_transfers where recipient_user_id is null;

  if bad_count > 0 then
    raise exception using
      errcode = 'raise_exception',
      message = format(
        'E29a blocked: %s stripe_transfers rows have a NULL recipient_user_id.', bad_count),
      hint = 'Inspect: select id, order_id, recipient_type, amount_cents, status, created_at '
             'from public.stripe_transfers where recipient_user_id is null order by created_at; '
             'Backfill from the linked order/placement, or mark them status=''void'', then re-run.';
  end if;

  alter table public.stripe_transfers
    alter column recipient_user_id set not null;
end $$;

-- Belt and braces: even if the NOT NULL is ever relaxed, NULLS NOT DISTINCT
-- keeps the dedupe honest. (Postgres 15+, which Supabase is on.)
drop index if exists public.stripe_transfers_order_recipient_uniq;
create unique index stripe_transfers_order_recipient_uniq
  on public.stripe_transfers (order_id, recipient_user_id) nulls not distinct;

-- ════════════════════════════════════════════════════════════════════
-- E29b — amount > 0 checks
-- ════════════════════════════════════════════════════════════════════
-- Pattern already used correctly at 045_purchase_offers.sql:13
-- (amount_pence INTEGER NOT NULL CHECK (amount_pence > 0)).
-- Added NOT VALID then VALIDATEd, so legacy rows do not block the deploy but
-- new rows are enforced from the instant the constraint lands.
do $$
declare
  n bigint;
begin
  select count(*) into n from public.stripe_transfers where amount_cents <= 0;
  if n > 0 then
    raise notice 'E29b: % existing stripe_transfers rows have amount_cents <= 0; '
                 'constraint will be added NOT VALID and left unvalidated. '
                 'Clean them, then run: alter table public.stripe_transfers '
                 'validate constraint stripe_transfers_amount_positive;', n;
  end if;
end $$;

do $$ begin
  alter table public.stripe_transfers
    add constraint stripe_transfers_amount_positive
    check (amount_cents > 0) not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.placement_recurring_billings
    add constraint placement_recurring_billings_amount_positive
    check (monthly_amount_pence > 0) not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.refund_requests
    add constraint refund_requests_amount_positive
    check (amount is null or amount > 0) not valid;
exception when duplicate_object then null;
end $$;

-- Validate each one independently so a single dirty table does not block the
-- other two. check_violation is caught and downgraded to a notice; the
-- constraint stays NOT VALID (still enforced for new rows) and the operator
-- gets a named follow-up.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('stripe_transfers', 'stripe_transfers_amount_positive'),
      ('placement_recurring_billings', 'placement_recurring_billings_amount_positive'),
      ('refund_requests', 'refund_requests_amount_positive')
    ) as t(tbl, con)
  loop
    begin
      execute format('alter table public.%I validate constraint %I', r.tbl, r.con);
    exception when check_violation then
      raise notice 'E29b: could not validate %.% — pre-existing bad rows. '
                   'Constraint remains NOT VALID (new rows still enforced).', r.tbl, r.con;
    end;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- E29c — re-attempt the FK adds that 012 silently swallowed
-- ════════════════════════════════════════════════════════════════════
-- 012_security_hardening.sql:23-39 wrapped both ADD CONSTRAINTs in
-- `EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;`.
-- `WHEN others` swallows foreign_key_violation, so a table with orphans
-- reported success and added nothing. Nobody can tell from the file whether
-- the constraints exist. Re-attempt them, catching duplicate_object ONLY,
-- and report orphans loudly instead of hiding them.
do $$
declare
  orphans bigint;
begin
  select count(*) into orphans
  from public.orders o
  where o.artist_user_id is not null
    and not exists (select 1 from auth.users u where u.id = o.artist_user_id);
  if orphans > 0 then
    raise notice 'E29c: % orders rows reference a missing auth.users id. '
                 'FK added NOT VALID; clean then validate.', orphans;
  end if;
end $$;

do $$ begin
  alter table public.orders
    add constraint fk_orders_artist_user
    foreign key (artist_user_id) references auth.users(id) on delete set null
    not valid;
exception when duplicate_object then null;
end $$;

do $$
declare
  orphans bigint;
begin
  select count(*) into orphans
  from public.refund_requests r
  where not exists (select 1 from public.orders o where o.id = r.order_id);
  if orphans > 0 then
    raise notice 'E29c: % refund_requests rows reference a missing order. '
                 'FK added NOT VALID; clean then validate.', orphans;
  end if;
end $$;

do $$ begin
  alter table public.refund_requests
    add constraint fk_refund_requests_order
    foreign key (order_id) references public.orders(id) on delete restrict
    not valid;
exception when duplicate_object then null;
end $$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('orders', 'fk_orders_artist_user'),
      ('refund_requests', 'fk_refund_requests_order')
    ) as t(tbl, con)
  loop
    begin
      execute format('alter table public.%I validate constraint %I', r.tbl, r.con);
    exception when foreign_key_violation then
      raise notice 'E29c: could not validate %.% — orphan rows remain. '
                   'Constraint stays NOT VALID (new rows still enforced).', r.tbl, r.con;
    end;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- E29d / B1 / B2 — drop the always-true "authenticated can read" policies
-- ════════════════════════════════════════════════════════════════════
-- supabase-tables-migration.sql:14, :27, :119 and
-- supabase-admin-migration.sql:40-42 each grant SELECT to every signed-in
-- user with USING (auth.role() = 'authenticated'). That exposes every
-- contact-form submission, waitlist email, venue registration, and artist
-- application (name, email, location, portfolio, statement) to any account.
-- Every legitimate read is admin-side via getSupabaseAdmin().
drop policy if exists "Authenticated can read waitlist"     on public.waitlist_signups;
drop policy if exists "Authenticated can read contact"      on public.contact_submissions;
drop policy if exists "Authenticated can read venue reg"    on public.venue_registrations;
drop policy if exists "Authenticated users can read applications"
  on public.artist_applications;

-- ════════════════════════════════════════════════════════════════════
-- X3 — artist_applications INSERT lockdown  ⚠ PAIRED CODE CHANGE REQUIRED
-- ════════════════════════════════════════════════════════════════════
-- Only safe alongside the src/app/api/apply/route.ts switch to
-- getSupabaseAdmin() (lines 109 and 122). See §10 of the plan. If that change
-- is not in this deploy, DELETE THIS BLOCK.
drop policy if exists "Anyone can insert applications" on public.artist_applications;

commit;

notify pgrst, 'reload schema';
```

### 11.1 Variant B for E28 (only if Phase 2 needs published-post editing)

Replaces the `with check (… status in (…))` clause above with a transition guard, so an author
can keep editing a published post but cannot move a post *into* `published`/`rejected`:

```sql
create or replace function public.blogs_guard_status_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;                                  -- admin routes bypass
  end if;
  if new.status is distinct from old.status
     and new.status in ('published', 'rejected') then
    raise exception 'Only an admin can publish or reject a blog post'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists blogs_guard_status on public.blogs;
create trigger blogs_guard_status before update on public.blogs
  for each row execute function public.blogs_guard_status_transition();
```

Ship variant A now (fewer moving parts, deny-by-default). Swap when the editor lands.

---

## 12. CC4 — full storage-privacy plan for E25

The ordering below exists so that **nothing 404s at any point**. The bucket flip is the very
last step and is preceded by a period where both old public URLs and new opaque refs resolve.

### 12.1 Target design (mirrors the contracts pattern exactly)

| Concern | Contracts (existing) | Message attachments (to build) |
|---|---|---|
| Stored value | `contract:<bucket>/<path>` (`upload.ts:24`) | `attachment:message-attachments/<path>` |
| Detector | `isContractRef()` (`upload.ts:71`) | `isAttachmentRef()` |
| Parser | `parseContractRef()` (`upload.ts:76`) | `parseAttachmentRef()` |
| Signing route | `POST /api/contracts/sign` | `POST /api/messages/attachments/sign` |
| Authorisation | placement party check | conversation-participant check |
| Ref/row cross-check | ref must equal `placement_records.contract_attachment_url` | ref must appear in that message's `attachments[]` |
| TTL | 600 s | 600 s |
| Legacy values | absolute URL passed through | absolute URL passed through |

### 12.2 Ordered steps

**Step 1 — signing endpoint (deploy alone; changes nothing user-visible).**

New file `src/app/api/messages/attachments/sign/route.ts`. Contract:

- Input `{ messageId: string, ref: string }`.
- `getAuthenticatedUser(request)` → 401 on failure.
- Load the message with the admin client; **participant check**: caller must be
  `sender_id` or `recipient_user_id` (the columns `messages_select_party` already keys on,
  `012:90-93`).
- **Cross-check the ref belongs to that message**: it must appear in `messages.attachments[]`.
  Without this, a participant in conversation A can sign an attachment from conversation B —
  the exact class of bug `contracts/sign/route.ts` guards against ("so a party to one
  placement can't sign the contract of a DIFFERENT placement").
- If `ref` is an absolute `http(s)` URL → return it unchanged with `{ legacy: true }`
  (identical to `contracts/sign/route.ts`).
- Otherwise `parseAttachmentRef` → `db.storage.from(bucket).createSignedUrl(path, 60 * 10)`.
- Rate-limit it (`checkRateLimit`) — it is an authenticated oracle over storage keys.

**Step 2 — reader tolerates both shapes (deploy alone; still nothing changes).**

- `src/lib/validations.ts:114` — relax `url: z.string().url().max(2000)` to accept either an
  absolute URL or an `attachment:` ref. Keep `.max(2000)`.
- `src/components/MessageInbox.tsx:1448-1464` — replace the two bare `href={a.url}` /
  `src={a.url}` bindings with a resolved value: if `isAttachmentRef(a.url)`, call the signing
  endpoint and swap in the signed URL (a small `useAttachmentUrl(messageId, ref)` hook with a
  short in-memory cache keyed on the ref, refetching on TTL expiry); otherwise use `a.url`
  directly. Show a spinner/placeholder while signing, and a "couldn't load" state on 403.

**Step 3 — writer emits refs (deploy alone; new uploads become private-ready).**

`src/lib/upload.ts:258-269` — replace the `getPublicUrl` call with a ref:

```ts
-  const { data: urlData } = supabase.storage
-    .from("message-attachments")
-    .getPublicUrl(path);
-
   return {
-    url: urlData.publicUrl,
+    url: `${ATTACHMENT_REF_PREFIX}message-attachments/${path}`,
     filename: file.name,
```

with `export const ATTACHMENT_REF_PREFIX = "attachment:";` beside `CONTRACT_REF_PREFIX`
(`upload.ts:24`). Bucket is still public at this point, so if anything in Step 2 is wrong the
old rows keep rendering and only new uploads are affected — a small blast radius.

**Soak Step 3 for at least one full release cycle.** Confirm from logs that the signing route
is being hit and returning 200s, and that no attachment render errors are reported.

**Step 4 — backfill existing rows (data migration, reversible).**

`messages.attachments` is JSONB (`043:5-6`), so rewrite in place. Store the original value in
a sidecar column first so the operation is reversible:

```sql
-- 076_backfill_attachment_refs.sql
alter table public.messages
  add column if not exists attachments_legacy_backup jsonb;

update public.messages
set attachments_legacy_backup = attachments
where attachments_legacy_backup is null
  and jsonb_array_length(coalesce(attachments, '[]'::jsonb)) > 0;

-- Rewrite every public URL of the form
--   https://<ref>.supabase.co/storage/v1/object/public/message-attachments/<key>
-- into  attachment:message-attachments/<key>
update public.messages m
set attachments = rewritten.arr
from (
  select
    m2.id,
    jsonb_agg(
      case
        when a->>'url' like '%/storage/v1/object/public/message-attachments/%'
        then jsonb_set(a, '{url}', to_jsonb(
               'attachment:message-attachments/' ||
               split_part(a->>'url', '/storage/v1/object/public/message-attachments/', 2)))
        else a
      end
      order by ord
    ) as arr
  from public.messages m2,
       lateral jsonb_array_elements(m2.attachments) with ordinality as t(a, ord)
  where jsonb_array_length(coalesce(m2.attachments, '[]'::jsonb)) > 0
  group by m2.id
) as rewritten
where m.id = rewritten.id
  and m.attachments is distinct from rewritten.arr;
```

Rollback for Step 4 is a single statement:
`update public.messages set attachments = attachments_legacy_backup where attachments_legacy_backup is not null;`

Verify before proceeding:

```sql
-- Must be 0: no public message-attachment URLs left anywhere.
select count(*) from public.messages m,
  lateral jsonb_array_elements(coalesce(m.attachments,'[]'::jsonb)) a
where a->>'url' like '%/object/public/message-attachments/%';
```

**Step 5 — flip the bucket private (the irreversible-feeling one; it is not).**

```sql
-- 077_message_attachments_private.sql
update storage.buckets set public = false where id = 'message-attachments';

-- Upload + delete policies from 065 stay as they are (065:14-36) — they gate
-- writes to the caller's own `${auth.uid()}/` prefix and are still correct.
-- Reads now go exclusively through createSignedUrl on the service-role client,
-- so no SELECT policy is added. 070:33 already dropped the public read policy.
```

Rollback: `update storage.buckets set public = true where id = 'message-attachments';`
(instant; combine with the Step 4 rollback if needed).

**Step 6 — verify closure.**

```sql
select id, public from storage.buckets where id = 'message-attachments';
-- expect: public = f
```

```bash
# A known object key must now 404/400 on the public path…
curl -si "$SUPABASE_URL/storage/v1/object/public/message-attachments/$KNOWN_KEY" | head -1
# …and 200 only via a signed URL obtained by a conversation participant.
```

Add an e2e case beside `tests/e2e/security-no-leaks.spec.ts`: user A uploads an attachment in
a conversation with B; user C (authenticated, not a participant) calls the signing endpoint
with A's ref and gets 403; the raw public URL 404s.

### 12.3 Audit the other buckets while you are in here

`005_artist_collections.sql:46` creates a `collections` bucket; `avatars` and `artworks` are
referenced by `uploadImage` (`src/lib/upload.ts:91`) but are **not** created by any migration
in the repo (dashboard-created — **UNCONFIRMED** from source). Those hold artwork and avatar
images that are public by design, so leaving them public is defensible. The one to check
manually is `contracts`: `uploadContract` (`upload.ts:47-51`) *assumes* it is private and says
so at `upload.ts:28-31`, but no migration creates it, so nothing in the repo proves it. Confirm
in the Supabase dashboard — this is already on the launch checklist
(`docs/plans/2026-07-11-stress-test-remediation-spec.md` §11.2, "verify the contracts bucket
is private"). If it is public, the entire contracts design collapses to security-by-obscurity.

---

## 13. Ordered task checklist

Numbered in execution order. Tasks 1–3 are prerequisites: without the base schema you cannot
prove any of the later verification queries pass.

**Prerequisites**

1. Generate `supabase/migrations/000_base_schema.sql` from prod per §9.3 (`supabase db dump`
   → mechanical idempotency transform → header). Verify with `supabase db reset` on an empty
   DB, then a second manual run of the file, then `supabase db diff --linked` (must be empty).
2. Rename the four colliding migrations per §8.3 (`037_welcomed_at`→`002`,
   `044_cart_sessions`→`017`, `045_artist_charges_cache`→`068`,
   `054_customer_addresses`→`069`); fix the three stale headers in `043`,
   `044_feature_requests`, `045_purchase_offers`.
3. Run `supabase/reconcile/2026-07-renumber.sql` (§8.4, plus the `'000'` row from §9.3) once
   against prod and each long-lived preview branch, **before** the first push after the
   rename. Confirm with `supabase migration list --linked`.

**Paired code + migration (one PR, one deploy)**

4. Switch `src/app/api/apply/route.ts:109` and `:122` from the anon `supabase` client to
   `getSupabaseAdmin()`; hoist one `const db = getSupabaseAdmin();` above the `try` at `:31`
   and reuse it at `:151`. Add a route test asserting the anon client is never used.
5. Run the E29a/E29b/E29c pre-checks against prod **before** scheduling the deploy: the
   NULL-`recipient_user_id` count, the three `amount <= 0` counts, and the two orphan counts
   from §11. Clean anything they find.
6. Write `supabase/migrations/074_rls_gap_closure.sql` exactly as §11. Apply to a preview
   branch first; run the Supabase security + performance advisors and diff against
   `scripts/audit/baseline-advisors.json` via `scripts/audit/check-regressions.ts`.
7. Deploy 4 + 6 together. Verify E24 (§2.6), E26 (§4.5), E27 (§5.5), E28 (§6.5), E29a–d
   (§7.1–7.4). Smoke-test `/apply` end to end in production immediately after.
8. Remove the four now-obsolete `known-acceptable.json` justifications if any of the tables
   gained a policy, and add `customer_profiles` / `placement_record_versions` if they end up
   policy-free in some environment.

**CC4 storage privacy (E25) — one step per deploy, do not batch**

9. Deploy the signing endpoint `src/app/api/messages/attachments/sign/route.ts` (§12.2 step 1).
10. Deploy the reader changes: `validations.ts` relaxation + `MessageInbox.tsx` resolver hook
    (§12.2 step 2).
11. Deploy the writer change: `upload.ts` emits `attachment:` refs (§12.2 step 3). **Soak one
    release cycle** and confirm signing-route 200s in logs.
12. Apply `076_backfill_attachment_refs.sql` (§12.2 step 4). Verify the "0 public URLs
    remaining" query.
13. Apply `077_message_attachments_private.sql` (§12.2 step 5). Verify per §12.2 step 6, add
    the e2e non-participant 403 case, and confirm the `contracts` bucket is private (§12.3).

**Guardrails, so none of this comes back**

14. Add the duplicate-prefix CI guard (§8.5) and a lint rule forbidding
    `.from("venue_profiles").select("*")` on the anon/authenticated client.
15. Follow-up ticket (not this PR): audit the four remaining anon-client API writes listed in
    §10.4 (`waitlist`, `contact`, `register-venue`, `enquiry`) and move them to service-role
    before anyone tightens those tables' INSERT policies.
16. Follow-up ticket (CC6, cross-referenced here because E29a depends on it):
    `src/lib/stripe-connect.ts:35-48` discards the insert `error`. Destructure and throw, so
    a unique-violation replay is visible rather than silent.
17. Delete the root `website/supabase-*.sql` files once `000_base_schema.sql` is committed,
    and add a CI check rejecting new `.sql` files outside `supabase/`.
