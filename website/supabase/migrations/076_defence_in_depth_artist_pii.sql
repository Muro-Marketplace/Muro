-- 076_defence_in_depth_artist_pii.sql
--
-- Defence-in-depth read restriction on artist_profiles (D38, supervisor queue
-- row 13; supersedes the ADR 0004 decision that left artist_profiles open).
--
-- artist_profiles has a SELECT policy of USING(true) for the public role, so a
-- holder of the public anon key (it ships in the browser bundle) can query
-- PostgREST directly and read every column, including the buyer/artist financial
-- identifiers stripe_customer_id, stripe_connect_account_id, stripe_subscription_id
-- and the artist's postal postcode. None of these are needed by any anon caller:
--   - the app's server routes read artist_profiles via the service-role client;
--   - the marketplace listing helper (getAllDatabaseArtists) was the last anon
--     `SELECT *` and has been repointed to the service-role client in the same
--     change, exactly as 071 did for venue_profiles;
--   - the only other anon-client reads are AuthContext (subscription_status,
--     subscription_plan by the logged-in user, i.e. the authenticated role) and
--     the public stats endpoint (id count) - none touch the revoked columns.
--
-- Mechanism (same as 071): a bare `REVOKE SELECT (col) ... FROM anon` is a silent
-- no-op while anon still holds a TABLE-level SELECT grant (the table grant covers
-- every column). So revoke the table-level SELECT, then re-grant column-level
-- SELECT on every column EXCEPT the four restricted ones. The exclusion form keeps
-- the intent obvious and auto-covers any new non-PII column.
--
-- lat/lng are deliberately KEPT granted (D38): they are public-by-design map
-- coordinates and revoking them is a separate follow-up, out of this row's scope.
-- authenticated and service_role are left untouched (ADR 0004).

revoke select on public.artist_profiles from anon;

do $$
declare
  safe_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into safe_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'artist_profiles'
    and column_name not in (
      'postcode',
      'stripe_customer_id',
      'stripe_connect_account_id',
      'stripe_subscription_id'
    );
  execute format('grant select (%s) on public.artist_profiles to anon', safe_cols);
end $$;

notify pgrst, 'reload schema';
