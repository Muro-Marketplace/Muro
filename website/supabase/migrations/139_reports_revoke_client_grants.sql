-- 139_reports_revoke_client_grants.sql
--
-- NOT YET APPLIED TO PRODUCTION. Owner decision required (see below).
--
-- `reports` (migration 060) still carries Supabase's stock default grants:
-- anon and authenticated both hold DELETE, INSERT, SELECT and UPDATE at the
-- table level. Verified against the live project on 2026-09-06.
--
-- Nothing is exploitable today. RLS is on and the table's only policy is
-- `reports_select_own` (SELECT where auth.uid() = reporter_user_id), so an
-- INSERT, UPDATE or DELETE from a client is denied for want of a policy, and
-- neither role holds TRUNCATE (which is the privilege RLS does not filter, and
-- the reason migrations 112 and 113 swept the rest of the schema).
--
-- What makes it worth closing now: as of this change the table has its first
-- writer, `POST /api/reports`, so it holds live abuse reports naming a reporter
-- and a reported user. A standing table-level grant on a table like that is one
-- future permissive policy away from being a write path around the route's
-- validation, its self-report refusal, its rate limit and its admin alert.
-- ADR 0004's defence-in-depth argument applies exactly.
--
-- This is the same three-line treatment migration 112 gave the rest of the
-- schema, applied to the one table it did not reach. `service_role` is
-- untouched: it is the app's real data path and is not subject to RLS.

REVOKE ALL ON TABLE public.reports FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.reports TO service_role;

-- The select-own policy stays and now has no table grant behind it, which is
-- deliberate: nothing in the app reads a user's own reports back, and if that
-- surface is ever built it should read through a route like everything else.

NOTIFY pgrst, 'reload schema';
