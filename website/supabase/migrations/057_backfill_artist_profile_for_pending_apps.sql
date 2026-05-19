-- 057_backfill_artist_profile_for_pending_apps.sql
--
-- Bridges artist_applications to artist_profiles so pending applicants
-- can sign in and start uploading work for admin review BEFORE the admin
-- accepts them. /api/apply now creates both rows in lockstep, this
-- backfill handles the legacy pending/rejected applications already in
-- the DB so an artist who applied yesterday doesn't have to wait for the
-- code change to be deployed AND re-apply.
--
-- For every artist_applications row in status 'pending' or 'rejected'
-- that has no matching artist_profiles row, create one:
--   - look up the auth user by lowercased email
--   - if no auth user, skip (signup never finished; admin accept will
--     handle them via the invite branch the day they get reviewed)
--   - if an auth user exists, insert an artist_profiles row with the
--     application's data and review_status mirroring the application
--     ('pending' or 'rejected'). Slug is derived from the name with a
--     numeric suffix on collision.
--
-- Safe to run multiple times. The NOT EXISTS guard skips applications
-- whose user already has a profile, and the slug suffix loop survives
-- repeated runs by always landing on an unused candidate.
--
-- Status semantics, the two tables disagree on vocabulary:
--   artist_applications.status    : pending / accepted / rejected
--   artist_profiles.review_status : pending / approved / rejected
-- "accepted" application <-> "approved" profile. Pending/rejected are
-- the same word in both.

DO $$
DECLARE
  app_row RECORD;
  user_id_val UUID;
  base_slug TEXT;
  candidate_slug TEXT;
  suffix INT;
BEGIN
  FOR app_row IN
    SELECT a.*
    FROM artist_applications a
    WHERE a.status IN ('pending', 'rejected')
  LOOP
    -- Find the auth user that owns this application's email.
    SELECT u.id INTO user_id_val
    FROM auth.users u
    WHERE LOWER(u.email) = LOWER(app_row.email)
    LIMIT 1;

    IF user_id_val IS NULL THEN
      CONTINUE;
    END IF;

    -- Skip if a profile already exists for this user.
    IF EXISTS (SELECT 1 FROM artist_profiles WHERE user_id = user_id_val) THEN
      CONTINUE;
    END IF;

    -- Slug from name. Lowercase, drop non-alphanumerics, collapse runs.
    base_slug := lower(regexp_replace(coalesce(app_row.name, 'artist'), '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    IF base_slug = '' THEN
      base_slug := 'artist';
    END IF;

    candidate_slug := base_slug;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM artist_profiles WHERE slug = candidate_slug) LOOP
      suffix := suffix + 1;
      candidate_slug := base_slug || '-' || suffix;
    END LOOP;

    INSERT INTO artist_profiles (
      user_id,
      slug,
      name,
      location,
      primary_medium,
      discipline,
      sub_styles,
      short_bio,
      extended_bio,
      instagram,
      website,
      offers_originals,
      offers_prints,
      offers_framed,
      open_to_free_loan,
      open_to_revenue_share,
      open_to_outright_purchase,
      delivery_radius,
      venue_types_suited_for,
      themes,
      style_tags,
      available_sizes,
      review_status
    ) VALUES (
      user_id_val,
      candidate_slug,
      coalesce(app_row.name, 'Artist'),
      coalesce(app_row.location, ''),
      coalesce(app_row.primary_medium, ''),
      app_row.discipline,
      coalesce(app_row.sub_styles, ARRAY[]::text[]),
      coalesce(substring(app_row.artist_statement from 1 for 200), ''),
      coalesce(app_row.artist_statement, ''),
      coalesce(app_row.instagram, ''),
      coalesce(app_row.website, ''),
      coalesce(app_row.offers_originals, false),
      coalesce(app_row.offers_prints, false),
      coalesce(app_row.offers_framed, false),
      coalesce(app_row.open_to_free_loan, false),
      coalesce(app_row.open_to_revenue_share, false),
      coalesce(app_row.open_to_purchase, false),
      coalesce(app_row.delivery_radius, 'Greater London'),
      coalesce(app_row.venue_types, ARRAY[]::text[]),
      coalesce(app_row.themes, ARRAY[]::text[]),
      ARRAY[]::text[],
      ARRAY[]::text[],
      CASE WHEN app_row.status = 'rejected' THEN 'rejected' ELSE 'pending' END
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
