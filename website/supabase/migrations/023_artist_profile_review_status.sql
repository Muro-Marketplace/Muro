-- 023_artist_profile_review_status.sql
--
-- Adds a review status column to artist_profiles so that signing up via the
-- /apply/claim flow creates the profile row immediately, but the profile
-- is not surfaced publicly until an admin marks it "approved".
--
-- Statuses:
--   pending  — default when created via claim flow; application under review
--   approved — admin has accepted the application; profile is public
--   rejected — admin rejected; profile stays hidden, no notification on list
--
-- Existing rows default to "approved" so we don't hide established artists.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Any profile that was created before this migration stays approved.
UPDATE artist_profiles
SET review_status = 'approved', approved_at = COALESCE(approved_at, created_at, now())
WHERE review_status IS NULL OR review_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_artist_profiles_review_status
  ON artist_profiles (review_status);

NOTIFY pgrst, 'reload schema';
