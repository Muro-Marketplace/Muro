-- 109: the referral programme has never recorded a single referral.
--
-- Found by sweeping for the strip-and-retry class after row 22 and 09 item 2.2
-- each turned one up. This is the third, and the most consequential, because the
-- fallback did not merely hide a failure: it quietly deleted a field on every
-- application ever submitted.
--
-- THE CHAIN, end to end:
--
--   1. `api/apply/route.ts` writes `referred_by_code` into `artist_applications`.
--      That column DOES NOT EXIST. It never has. Migration 019 added it to
--      `artist_profiles` only.
--   2. So PostgREST rejects the insert, and the route's strip-and-retry drops
--      `referred_by_code` and inserts again. The application saves. The referral
--      code is gone.
--   3. `api/admin/applications/[id]` reads `app.referred_by_code` on approval and
--      copies it onto the new `artist_profiles` row. It is always undefined.
--   4. The Stripe webhook credits a referrer 30 days of `free_until` when a
--      referred artist first pays, keyed on `artist_profiles.referred_by_code`.
--      It is always null, so it has never fired.
--
-- Measured against production: 13 applications, 7 artists holding a referral code
-- to share, and **0 profiles recording who referred them**. The whole programme
-- is dead, and the retry loop is why nobody noticed. Without it every application
-- would have failed loudly on day one.
--
-- The retry also means EVERY application does two inserts, referred or not:
-- `referred_by_code: null` still names the column, so the first attempt always
-- fails.
--
-- Additive: one nullable TEXT column, no default, no backfill. The 13 existing
-- applications keep NULL, which is the truth — their codes were destroyed on
-- submission and cannot be recovered from anything the database kept.

ALTER TABLE public.artist_applications
  ADD COLUMN IF NOT EXISTS referred_by_code TEXT;

-- Mirrors the partial index 019 put on artist_profiles: an admin reviewing
-- applications wants to find the referred ones, and almost none will be.
CREATE INDEX IF NOT EXISTS idx_artist_applications_referred_by_code
  ON public.artist_applications(referred_by_code) WHERE referred_by_code IS NOT NULL;

NOTIFY pgrst, 'reload schema';
