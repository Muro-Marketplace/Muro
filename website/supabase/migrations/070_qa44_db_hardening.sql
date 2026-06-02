-- 070_qa44_db_hardening.sql
--
-- 44-bug cleanup, database layer. Applied to the live Wallplace project
-- (uwkuhygwvasdzwsusiym) on 2026-06-02 via the Supabase MCP; this file is the
-- version-controlled record so a fresh DB reproduces the same state. Every
-- change was verified against the security + performance advisors.
--
-- Bugs: 28, 29, 30, 31, 32, 33, 34, 36, 38, 39, 40, 41.
-- (35 = documented service-role-only; 37 = dashboard toggle; 42 = deferred.)

-- ── Bug 36: lock function search_path (was role-mutable) ──────────────
alter function public.orders_set_order_number() set search_path = '';
alter function public.blogs_set_updated_at() set search_path = '';
alter function public.placement_recurring_billings_set_updated_at() set search_path = '';
alter function public.walls_set_updated_at() set search_path = '';
alter function public.wall_layouts_set_updated_at() set search_path = '';
alter function public.get_email_preferences(p_user_id uuid) set search_path = public;
alter function public.increment_placement_revenue(p_placement_id text, p_amount numeric) set search_path = public;

-- ── Bug 34: email_recent_sends SECURITY DEFINER -> security_invoker ───
drop view if exists public.email_recent_sends;
create view public.email_recent_sends with (security_invoker = true) as
  select user_id, template, stream, created_at
  from public.email_events
  where created_at > (now() - '72:00:00'::interval)
    and status = any (array['sent'::text, 'queued'::text]);

-- ── Bugs 32, 33: drop broad SELECT (listing) policies on public buckets ─
-- Buckets stay public; object URLs keep working, directory listing is blocked.
drop policy if exists "Public can view artworks" on storage.objects;
drop policy if exists "Public can view avatars" on storage.objects;
drop policy if exists "collections_storage_public_read" on storage.objects;
drop policy if exists "message_attachments_public_read" on storage.objects;

-- ── Bug 28 + 29: orders RLS ──────────────────────────────────────────
-- 28: drop the always-true SELECT that exposed every order to any signed-in user.
drop policy if exists "Users can read their orders" on public.orders;
-- 29: drop the three always-true INSERT policies (orders are created by the
-- service role via the Stripe webhook + /api/orders, which bypasses RLS).
drop policy if exists "Allow anon inserts" on public.orders;
drop policy if exists "Allow authenticated inserts" on public.orders;
drop policy if exists "Service role can insert orders" on public.orders;

-- ── Bug 30: placements INSERT must involve the caller ────────────────
drop policy if exists "Allow authenticated inserts" on public.placements;
drop policy if exists "Authenticated can insert placements" on public.placements;
drop policy if exists placements_insert_party on public.placements;
create policy placements_insert_party on public.placements
  for insert to authenticated
  with check (
    (select auth.uid()) = artist_user_id
    or (select auth.uid()) = venue_user_id
    or (select auth.uid()) = proposed_by_user_id
  );

-- ── Bug 31: messages INSERT must set sender_id to the caller ─────────
drop policy if exists "Authenticated can insert messages" on public.messages;
drop policy if exists messages_insert_self on public.messages;
create policy messages_insert_self on public.messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()));

-- ── Bug 40: covering indexes for unindexed foreign keys ─────────────
create index if not exists artist_applications_reviewed_by_idx on public.artist_applications (reviewed_by);
create index if not exists artist_profiles_reviewed_by_idx on public.artist_profiles (reviewed_by);
create index if not exists artwork_request_responses_linked_offer_id_idx on public.artwork_request_responses (linked_offer_id);
create index if not exists commissions_request_id_idx on public.commissions (request_id);
create index if not exists disputes_resolved_by_user_id_idx on public.disputes (resolved_by_user_id);
create index if not exists enquiries_sender_user_id_idx on public.enquiries (sender_user_id);
create index if not exists feature_request_upvotes_user_id_idx on public.feature_request_upvotes (user_id);
create index if not exists feature_requests_user_id_idx on public.feature_requests (user_id);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists moderation_queue_decided_by_user_id_idx on public.moderation_queue (decided_by_user_id);
create index if not exists moderation_queue_submitted_by_user_id_idx on public.moderation_queue (submitted_by_user_id);
create index if not exists order_events_actor_user_id_idx on public.order_events (actor_user_id);
create index if not exists placement_photos_uploader_user_id_idx on public.placement_photos (uploader_user_id);
create index if not exists placement_records_artwork_id_idx on public.placement_records (artwork_id);
create index if not exists placement_reviews_reviewer_user_id_idx on public.placement_reviews (reviewer_user_id);
create index if not exists placements_artist_user_id_idx on public.placements (artist_user_id);
create index if not exists placements_proposed_by_user_id_idx on public.placements (proposed_by_user_id);
create index if not exists placements_cancelled_by_user_id_idx on public.placements (cancelled_by_user_id);
create index if not exists purchase_offers_parent_offer_id_idx on public.purchase_offers (parent_offer_id);
create index if not exists reports_reviewed_by_user_id_idx on public.reports (reviewed_by_user_id);
create index if not exists reports_reported_user_id_idx on public.reports (reported_user_id);
create index if not exists visualizer_quota_overrides_granted_by_idx on public.visualizer_quota_overrides (granted_by);

-- ── Bug 41: drop redundant duplicate indexes ────────────────────────
drop index if exists public.idx_ae_event_type;
drop index if exists public.idx_ae_venue_name;
drop index if exists public.idx_ae_artist_slug;
drop index if exists public.idx_artist_profiles_user_id;
drop index if exists public.idx_artist_profiles_slug;
drop index if exists public.idx_referral_code;
drop index if exists public.idx_cart_sessions_stripe_session_id;
drop index if exists public.idx_newsletter_subscribers_email;
drop index if exists public.idx_placement_records_placement_id;
drop index if exists public.idx_venue_profiles_slug;
drop index if exists public.idx_venue_profiles_user_id;

-- ── Bug 39: consolidate multiple permissive policies (behaviour-preserving) ─
drop policy if exists "Artists can manage own collections" on public.artist_collections;
drop policy if exists collections_public_read on public.artist_collections;
drop policy if exists artist_profiles_select_own on public.artist_profiles;
drop policy if exists artist_profiles_select_public on public.artist_profiles;
drop policy if exists artist_works_select_public on public.artist_works;
drop policy if exists artist_works_select_own on public.artist_works;
drop policy if exists "Owner can read placements" on public.placements;
drop policy if exists venue_profiles_select on public.venue_profiles;
drop policy if exists venue_profiles_select_own on public.venue_profiles;
drop policy if exists orders_select_buyer on public.orders;
drop policy if exists orders_select_artist on public.orders;
drop policy if exists orders_select_venue on public.orders;
drop policy if exists "Users can read own orders" on public.orders;
drop policy if exists orders_select_party on public.orders;
create policy orders_select_party on public.orders for select to public using (
  ((select auth.uid()) = buyer_user_id)
  or ((select auth.uid()) = artist_user_id)
  or ((placement_id is not null) and (exists (select 1 from placements p where p.id = orders.placement_id and p.venue_user_id = (select auth.uid()))))
  or (buyer_email = ((select auth.jwt()) ->> 'email'::text))
  or ((select auth.role()) = 'service_role'::text)
);

-- ── Bug 38: wrap auth.* calls in policies so they evaluate once per query ─
-- (initplan). Behaviour-preserving; applied to all policies that still had an
-- unwrapped auth.uid(). Re-runnable: only unwrapped policies are touched.
do $$
declare r record; new_qual text; new_check text;
begin
  for r in
    select policyname, tablename, qual, with_check
    from pg_policies
    where schemaname='public'
    and (
      (coalesce(qual,'') like '%auth.uid()%' and coalesce(qual,'') not like '%( SELECT auth.uid()%' and coalesce(qual,'') not like '%(select auth.uid()%')
      or (coalesce(with_check,'') like '%auth.uid()%' and coalesce(with_check,'') not like '%( SELECT auth.uid()%' and coalesce(with_check,'') not like '%(select auth.uid()%')
    )
  loop
    new_qual := replace(replace(replace(r.qual,'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())'),'auth.jwt()','(select auth.jwt())');
    new_check := replace(replace(replace(r.with_check,'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())'),'auth.jwt()','(select auth.jwt())');
    execute format('ALTER POLICY %I ON public.%I%s%s',
      r.policyname, r.tablename,
      case when r.qual is not null then ' USING ('||new_qual||')' else '' end,
      case when r.with_check is not null then ' WITH CHECK ('||new_check||')' else '' end
    );
  end loop;
end $$;

-- Bug 35 (RLS-enabled-no-policy on 18 service-role-only tables): intentionally
-- left without client policies. Those tables are read/written only via API
-- routes using the service role (which bypasses RLS); adding client policies
-- would open direct-write paths that skip API business logic. Deny-all to
-- clients is the correct secure state. See scripts/audit/known-acceptable.json.
--
-- Bug 42 (104 unused indexes): deferred — needs EXPLAIN verification per index
-- before dropping; index-only-scan stats can be incomplete on prod.
-- Bug 37 (leaked-password protection): Supabase dashboard toggle, no SQL.