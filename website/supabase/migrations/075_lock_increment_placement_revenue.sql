-- 075_lock_increment_placement_revenue.sql
--
-- E50 / D37: increment_placement_revenue is PUBLIC-executable. It is
-- SECURITY INVOKER, so RLS on `placements` still applies, but the placements
-- policy "Users can update own placements" (auth.uid() = artist_user_id) lets any
-- authenticated artist call this against their OWN placement with any p_amount,
-- inflating placements.revenue and delivery_count arbitrarily. Those figures are
-- venue-facing and feed analytics, so they are forgeable by the party they
-- flatter. anon cannot (no auth.uid()), but authenticated artists can.
--
-- Fix: mirror decrement_work_stock (085) / restock_work (087) — EXECUTE for the
-- service role only. A bare `REVOKE ... FROM PUBLIC` is NOT enough: Supabase
-- grants EXECUTE to anon and authenticated EXPLICITLY, so those survive a
-- PUBLIC-only revoke. Revoke all three, then (idempotently) grant service_role.
--
-- The only caller is api/orders/route.ts, which runs on the service-role client
-- (getSupabaseAdmin), so this is invisible to the app. The function body and its
-- SECURITY INVOKER setting are left unchanged (D37: change grants only).
--
-- Migration number: EXECUTION-DECISIONS D1 gives 02 the 074-079 range; D44.6
-- reserved 075 for this while 076/077 took the artist_profiles PII revoke.

revoke execute on function public.increment_placement_revenue(text, numeric) from public, anon, authenticated;
grant  execute on function public.increment_placement_revenue(text, numeric) to service_role;

notify pgrst, 'reload schema';
