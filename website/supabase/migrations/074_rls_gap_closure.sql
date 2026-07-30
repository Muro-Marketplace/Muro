-- 074_rls_gap_closure.sql
--
-- Stress-test remediation, CC3. Closes E24, E26, E27, E28, E29a-d and the two
-- adjacent findings (B1, B2) surfaced while confirming them.
--
-- SEQUENCING — the artist_applications INSERT policies are dropped at the bottom
-- of this file. That is only safe because the SAME commit switches
-- src/app/api/apply/route.ts off the anon client and onto getSupabaseAdmin().
-- Without that code change, artist applications break silently (D15.4).
--
-- Idempotent throughout: guarded DO blocks, IF NOT EXISTS, DROP-then-CREATE for
-- policies. Safe to re-run. Every exception handler catches a SPECIFIC condition,
-- never `WHEN others`, which is the E29c bug this file also repairs.
--
-- ── Where this departs from 02 §11, and why ─────────────────────────────────
-- Verified against project uwkuhygwvasdzwsusiym on 2026-07-30 before writing.
--
-- 1. §11 drops FOUR permissive SELECT policies. There are FIVE leaking tables.
--    `enquiries` carries `Artists can read their enquiries` with `USING (true)`
--    granted to `authenticated`, which §11's list misses and D12's assertion
--    could not see. D15.1 corrected this; all five are dropped below. Closing
--    only four would leave enquiries wide open while the gate reported green.
--
-- 2. §11's X3 block drops ONE artist_applications INSERT policy
--    ("Anyone can insert applications"). Prod has TWO: that one, and
--    "Allow public inserts" granted to anon, both `WITH CHECK (true)`. Dropping
--    one leaves the table writable by anyone, so the lockdown would be
--    decorative. Both go.
--
-- 3. §11's E27 block runs unguarded ALTER TABLE on placement_record_versions.
--    That table does NOT exist in prod, so the statement fails 42P01 and takes
--    the whole migration with it. It DOES exist on a database built from this
--    repo's migrations (033_placement_record_versions.sql), which is the usual
--    prod-diverged-from-migrations story. The block is therefore guarded on
--    existence so this file is correct against both.
--
-- 4. No explicit BEGIN/COMMIT. It is applied via the Supabase MCP, which manages
--    the transaction; a nested BEGIN warns and the matching COMMIT would end the
--    outer transaction early, leaving the rest of the file running unwrapped.

-- ════════════════════════════════════════════════════════════════════
-- E24 — customer_profiles: create (prod never had it) + RLS + owner read
-- ════════════════════════════════════════════════════════════════════
-- Mirrors 001_analytics_events.sql:84-90. Prod was bootstrapped from
-- supabase-all-migrations.sql, which omitted the table (see 050:10-17), so this
-- converges prod and fresh databases and incidentally fixes the 500 on
-- /api/account/preferences for customer accounts. Confirmed absent in prod.
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
-- client, which bypasses RLS; no client INSERT/UPDATE/DELETE policy is added on
-- purpose (deny-by-default, matching scripts/audit/known-acceptable.json).
drop policy if exists customer_profiles_select_own on public.customer_profiles;
create policy customer_profiles_select_own on public.customer_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ════════════════════════════════════════════════════════════════════
-- E27 — placement_record_versions: RLS + party-scoped read
-- ════════════════════════════════════════════════════════════════════
-- Created without RLS in 033_placement_record_versions.sql:6. The snapshot JSONB
-- is a full copy of placement_records, i.e. private commercial terms.
--
-- Guarded: absent in prod (see note 3 above), present on a migrations-built
-- database. A no-op where the table does not exist rather than a hard failure.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'placement_record_versions'
  ) then
    raise notice 'E27 skipped: public.placement_record_versions does not exist here.';
    return;
  end if;

  execute 'alter table public.placement_record_versions enable row level security';

  execute 'drop policy if exists placement_record_versions_select_party
             on public.placement_record_versions';
  execute $pol$
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
      )
  $pol$;

  -- Writes: service role only (api/placements/[id]/record/route.ts:195).
  -- No INSERT/UPDATE/DELETE policy on purpose.

  -- Supporting index for the policy's join key.
  execute 'create index if not exists placement_record_versions_placement_idx
             on public.placement_record_versions(placement_id)';
end $$;

-- ════════════════════════════════════════════════════════════════════
-- E26 — venue PII: extend the 071 column-grant revoke to `authenticated`
-- ════════════════════════════════════════════════════════════════════
-- 071 revoked only from anon and said so at 071:22-23. Verified in prod: anon
-- holds column SELECT on 34 of 40 columns and none of the six PII ones, while
-- `authenticated` holds table-level SELECT plus all 40 including every PII
-- column. Same mechanism, same six columns, now applied to authenticated. A
-- bare column-level REVOKE is a no-op while a table-level SELECT grant stands,
-- so the table grant goes first, then every non-PII column is re-granted by
-- exclusion.
--
-- Safe because: all server reads use the service-role client; the only
-- anon/authenticated-client read is getVenueProfileBySlug
-- (src/lib/db/venue-profiles.ts:33), which already selects an explicit non-PII
-- column list; /api/stats/public reads id only. anon has run this way since 071
-- without incident, which is the precedent.
--
-- D15.2: this does NOT drop venue_profiles_select_public. Table-level read is
-- deliberate; the restriction is per column.
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
-- 061_blogs.sql:49-53 created blogs_update_own with USING only. Postgres reuses
-- USING as WITH CHECK, which constrains authorship but says nothing about
-- `status`, so the author can set status='published' and
-- blogs_select_published_or_own (061:38) makes it world-readable, bypassing
-- moderation_queue (058) entirely. Confirmed in prod: blogs_update_own has a
-- NULL with_check.
--
-- CONSEQUENCE, accepted deliberately: once a post is published its author can no
-- longer UPDATE it through the client, because the new row's status would fail
-- the check. Admin/service-role edits are unaffected. If Phase 2's editor needs
-- authors to edit live posts, swap to variant B (trigger) in 02 §11.1.
drop policy if exists blogs_update_own on public.blogs;
create policy blogs_update_own on public.blogs
  for update to authenticated
  using ((select auth.uid()) = author_user_id)
  with check (
    (select auth.uid()) = author_user_id
    and status in ('draft', 'pending_review', 'archived')
  );

-- Same hole on INSERT: nothing stopped an author creating an already-published row.
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
-- (order_id, recipient_user_id). Btree uniques are NULLS DISTINCT by default, so
-- NULL-recipient rows never collide and the replay guard 067 describes at :8-9
-- does not fire: the payout cron pays twice. Verified in prod: the table holds 0
-- rows, so the NOT NULL below cannot block on legacy data.
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

-- Belt and braces: even if the NOT NULL is ever relaxed, NULLS NOT DISTINCT keeps
-- the dedupe honest. (Postgres 15+, which Supabase is on.)
drop index if exists public.stripe_transfers_order_recipient_uniq;
create unique index stripe_transfers_order_recipient_uniq
  on public.stripe_transfers (order_id, recipient_user_id) nulls not distinct;

-- ════════════════════════════════════════════════════════════════════
-- E29b — amount > 0 checks
-- ════════════════════════════════════════════════════════════════════
-- Pattern already used correctly at 045_purchase_offers.sql:13. Added NOT VALID
-- then VALIDATEd, so legacy rows cannot block the deploy but new rows are
-- enforced from the instant the constraint lands.
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

-- Validate each independently so one dirty table does not block the other two.
-- check_violation is caught and downgraded to a notice; the constraint stays NOT
-- VALID (still enforced for new rows) and the operator gets a named follow-up.
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
-- `WHEN others` swallows foreign_key_violation, so a table with orphans reported
-- success and added nothing. Nobody can tell from the file whether the
-- constraints exist. Re-attempt them catching duplicate_object ONLY, and report
-- orphans loudly instead of hiding them.
--
-- Prod note: fk_orders_artist_user already exists, so that block no-ops on
-- duplicate_object. Kept anyway, because it is the fresh-database path and
-- because 012's swallowing means its presence cannot be assumed anywhere else.
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
-- supabase-tables-migration.sql:14, :27, :119 and supabase-admin-migration.sql:40-42
-- each grant SELECT to every signed-in user with USING (auth.role() =
-- 'authenticated'). That exposes every contact-form submission, waitlist email,
-- venue registration and artist application (name, email, location, portfolio,
-- statement) to any account that can sign up. Every legitimate read is
-- admin-side via getSupabaseAdmin().
drop policy if exists "Authenticated can read waitlist"     on public.waitlist_signups;
drop policy if exists "Authenticated can read contact"      on public.contact_submissions;
drop policy if exists "Authenticated can read venue reg"    on public.venue_registrations;
drop policy if exists "Authenticated users can read applications"
  on public.artist_applications;

-- The fifth leak, which 02 §11 missed and D12's assertion could not match:
-- `USING (true)` to `authenticated` rather than an auth.role() comparison. It is
-- misnamed as well as wrong, since it never scoped to the artist at all.
--
-- `Users can read own enquiries` stays and is the correct replacement: it matches
-- sender_email against the JWT email, with a service_role escape. Verified
-- present in prod before dropping this one, per D15.4.
drop policy if exists "Artists can read their enquiries" on public.enquiries;

-- ════════════════════════════════════════════════════════════════════
-- X3 — artist_applications INSERT lockdown  ⚠ PAIRED CODE CHANGE REQUIRED
-- ════════════════════════════════════════════════════════════════════
-- Only safe alongside the src/app/api/apply/route.ts switch to
-- getSupabaseAdmin(), which ships in this same commit.
--
-- BOTH policies go. Prod has two INSERT policies on this table, each
-- `WITH CHECK (true)`: "Anyone can insert applications" (role public) and
-- "Allow public inserts" (role anon). 02 §11 drops only the first, which would
-- have left the table writable by any anonymous caller and made the lockdown
-- decorative.
drop policy if exists "Anyone can insert applications" on public.artist_applications;
drop policy if exists "Allow public inserts" on public.artist_applications;

notify pgrst, 'reload schema';
