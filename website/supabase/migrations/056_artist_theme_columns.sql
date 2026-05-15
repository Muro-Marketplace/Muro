-- Premium+ artists can pick a profile-page theme and a QR-label theme.
-- Core artists see the picker but it's display-only, the public
-- profile and printed labels render the defaults until they upgrade.
--
-- Schema: two TEXT slots (theme ids) rather than a separate
-- artist_themes table. The catalogue is small + frozen in code
-- (lib/profile-themes.ts), so the column-as-enum model is enough and
-- it dodges the join overhead.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS profile_theme text,
  ADD COLUMN IF NOT EXISTS label_theme text;

COMMENT ON COLUMN artist_profiles.profile_theme IS
  'Theme id from lib/profile-themes.ts PROFILE_THEMES. NULL = default light theme. Premium+ only.';
COMMENT ON COLUMN artist_profiles.label_theme IS
  'Theme id from lib/profile-themes.ts LABEL_THEMES. NULL = default classic. Premium+ only.';
