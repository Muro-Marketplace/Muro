-- 073_restrict_artist_applications_update.sql
--
-- Security fix found during the Phase 6 advisor re-baseline. The
-- artist_applications table had an UPDATE RLS policy named "Service role can
-- update applications" that, despite the name, applied to the `public` role
-- (every client, including anon and authenticated) with USING (true). That let
-- any client UPDATE application rows directly via the Supabase client, e.g.
-- flipping their own application's status to approved (privilege escalation),
-- with no business-logic check.
--
-- Every legitimate write to artist_applications goes through API routes using
-- the service-role client (getSupabaseAdmin), which bypasses RLS entirely, so
-- this policy is not needed for any real flow. A codebase search confirmed no
-- client-side (anon/authenticated) UPDATE of artist_applications exists.
-- Dropping the policy restores the secure default (no client UPDATE access)
-- without affecting the service-role admin-approval flow.
--
-- The table keeps its public INSERT policies (the application form) and the
-- authenticated SELECT policy. Tightening those to fully service-role-only is
-- tracked as a separate follow-up.

DROP POLICY IF EXISTS "Service role can update applications" ON public.artist_applications;

NOTIFY pgrst, 'reload schema';
