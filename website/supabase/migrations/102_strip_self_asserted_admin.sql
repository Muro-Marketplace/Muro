-- 102: a signup cannot declare itself admin (E35d, 03 §4.3 item 4).
--
-- The four browser signup call sites pass user_metadata straight into an
-- anon-key `signUp`, and GoTrue exposes self-service metadata updates through
-- PUT /auth/v1/user. No Wallplace server sits in either path, so no amount of
-- TypeScript can stop `{ data: { user_type: "admin" } }`. This trigger is the
-- only control that covers it.
--
-- WHAT IT BLOCKS, precisely: a row ACQUIRING user_type='admin' when it did not
-- have it before. That is signup-as-admin and escalation-of-an-existing-account,
-- which are the two reachable attacks.
--
-- WHAT IT DOES NOT TOUCH: a row that already said 'admin' keeps saying it. This
-- matters right now. The live predicate in src/lib/admin-auth.ts still has the
-- `user_metadata.user_type = 'admin'` conjunct (removing it is an owner-gated
-- cutover, 03 §1.4 step 3), and GoTrue writes to auth.users on every sign-in.
-- A trigger that stripped unconditionally would revoke the only production
-- admin the next time they logged in.
--
-- WHY IT DOES NOT CONSULT admin_users, which 03 §4.3 offered as one of the two
-- ways to resolve the conflict with §1.4 step 4:
--
--   1. It would not help today. admin_users is empty until the backfill runs,
--      so the existing admin would be stripped anyway.
--   2. It would couple every write to auth.users to another table. If that
--      table were ever dropped or renamed, the EXISTS would raise and EVERY
--      signup and login on the platform would fail. That is a bad thing to
--      hang authentication on for a defence-in-depth control.
--
-- The doc's own recommendation is the second resolution: drop §1.4 step 4 (the
-- metadata stamp) and let admin nav follow the server's answer instead. That is
-- what has been done. The consequence, stated plainly: a NEW admin granted only
-- an admin_users row will not be auto-routed to /admin after login, because
-- portalPathForRole reads metadata. They keep full API access and can navigate
-- to /admin directly, where AdminGate admits them on the server's answer. 03
-- §1.4 step 4 says explicitly that losing this is "a nav convenience", which is
-- the entire reason it is sequenced last.
--
-- RAISE WARNING rather than silence, so a stamp that gets stripped is visible in
-- the Postgres log instead of looking like it worked.

CREATE OR REPLACE FUNCTION public.strip_self_asserted_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_admin boolean := false;
BEGIN
  IF NEW.raw_user_meta_data ->> 'user_type' IS DISTINCT FROM 'admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    was_admin := (OLD.raw_user_meta_data ->> 'user_type') IS NOT DISTINCT FROM 'admin';
  END IF;

  IF was_admin THEN
    -- Already an admin before this write. Not an escalation, leave it alone.
    RETURN NEW;
  END IF;

  RAISE WARNING '[strip_self_asserted_admin] refused a self-asserted admin role on auth.users %', NEW.id;
  NEW.raw_user_meta_data =
    coalesce(NEW.raw_user_meta_data, '{}'::jsonb) || '{"user_type":"customer"}'::jsonb;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.strip_self_asserted_admin() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS strip_self_asserted_admin ON auth.users;
CREATE TRIGGER strip_self_asserted_admin
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.strip_self_asserted_admin();

COMMENT ON FUNCTION public.strip_self_asserted_admin() IS
  'E35d: stops a browser signup or a self-service GoTrue metadata update from acquiring user_type=admin. Deliberately permits a row that was already admin, so it cannot revoke a live admin while the user_metadata conjunct is still in the predicate.';
