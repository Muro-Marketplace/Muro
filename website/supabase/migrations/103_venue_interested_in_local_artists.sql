-- 103: the "interested in local artists" checkbox finally has somewhere to go
-- (row 23a, supervisor D66, E42-b).
--
-- `venue-portal/profile` ships this control. It is bound to state and hydrated
-- on load, so it looks like it works. It does not:
--
--   * the save drops it, because `interested_in_local_artists` exists in no
--     migration and not in the live table, and the writable-fields allowlist
--     correctly refuses a column that is not there;
--   * the read lies. `venue-profiles-transform.ts` hardcodes
--     `interestedInLocalArtists: true`, so every venue is told they said yes,
--     including the ones who unticked it.
--
-- So a venue could untick the box, save, reload, and see it ticked again, with
-- no error anywhere. `preferred_styles` and `preferred_themes` exist alongside
-- it, which is what makes this an incomplete migration rather than a design
-- decision.
--
-- Nullable, with no default: NULL means "this venue has never answered", which
-- is honestly different from "answered no". 9 of 9 live venue rows are in that
-- state and defaulting them to true or false would be inventing an answer.

ALTER TABLE venue_profiles
  ADD COLUMN IF NOT EXISTS interested_in_local_artists BOOLEAN;

COMMENT ON COLUMN venue_profiles.interested_in_local_artists IS
  'Venue prefers artists local to them. NULL = never answered, which is not the same as false.';

NOTIFY pgrst, 'reload schema';
