-- 071_defence_in_depth_venue_pii.sql
--
-- Defence-in-depth read restriction (ADR 0004).
--
-- venue_profiles has a SELECT policy of USING(true) for the public role, so a
-- holder of the public anon key could query the table directly via PostgREST
-- and read venue contact PII (email, phone, postal address, contact name,
-- postcode), bypassing the redaction the API layer applies for anon callers
-- (see tests/e2e/security-no-leaks.spec.ts, "redacts postcode for anon").
--
-- Restrict the anon role to the non-PII columns. NOTE: a bare
--   REVOKE SELECT (col) ... FROM anon
-- is a silent no-op while anon still holds a TABLE-level SELECT grant (the
-- table grant implicitly covers every column). So we revoke the table-level
-- SELECT and then re-grant column-level SELECT on every column EXCEPT the six
-- contact-PII columns. Using an exclusion keeps the intent obvious and avoids
-- drift if a new non-PII column is added.
--
-- Safe because the app's server routes read venue data via the service-role
-- client (unaffected by column grants); the only anon-client SELECT * helper
-- (getVenueProfileBySlug) was unused and has been repointed to non-PII columns;
-- and the public stats endpoint reads only id (count). The authenticated and
-- service_role roles are intentionally left untouched (see ADR 0004).

revoke select on public.venue_profiles from anon;

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
  execute format('grant select (%s) on public.venue_profiles to anon', safe_cols);
end $$;
