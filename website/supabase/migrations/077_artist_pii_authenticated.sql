-- 077_artist_pii_authenticated.sql
--
-- Extend 076's artist_profiles PII/Stripe defence to the `authenticated` role
-- (D38 as scoped by the owner, and D44.5). 076 restricted `anon`; ADR 0004 had
-- historically left `authenticated` alone as a smaller risk, but the owner's
-- authorisation covered anon AND authenticated, and a sweep shows it costs
-- nothing here:
--   - no browser-side (`@/lib/supabase`) read selects the four columns:
--     AuthContext reads subscription_status/subscription_plan, the public stats
--     endpoint reads id;
--   - no server-side user-JWT (authenticated-role) client reads artist_profiles
--     at all (api-auth's createClient only calls auth.getUser; nothing else
--     builds a token client that reads this table);
--   - the artist portal loads its own profile via /api/artist-profile
--     (service-role), and getAllDatabaseArtists is now service-role too.
--
-- Same mechanism as 076/071: a bare column REVOKE is a no-op while a table-level
-- grant remains, so revoke the table SELECT then re-grant column SELECT on every
-- column except the four restricted ones. service_role is left untouched.

revoke select on public.artist_profiles from authenticated;

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
  execute format('grant select (%s) on public.artist_profiles to authenticated', safe_cols);
end $$;

notify pgrst, 'reload schema';
