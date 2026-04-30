-- 047_artwork_request_invitations_and_qr.sql
--
-- Two follow-ups on the artwork_requests rollout:
--   1. Drop the "public" visibility — venues only want to surface
--      requests to verified artists or to a shortlist they invite.
--      Existing public rows roll up to semi_public so nothing breaks.
--   2. invited_artist_slugs[] supports the private-with-invitations
--      flow: when visibility='private', responses are gated to slugs
--      in this list.
--   3. qr_revenue_share_percent: when the venue's intent includes
--      "QR-enabled display", they specify what split the artist
--      earns on QR sales. Stored separately from price/budget so
--      the artist sees the offer cleanly.

UPDATE artwork_requests SET visibility = 'semi_public' WHERE visibility = 'public';

ALTER TABLE artwork_requests
  DROP CONSTRAINT IF EXISTS artwork_requests_visibility_check;
ALTER TABLE artwork_requests
  ADD CONSTRAINT artwork_requests_visibility_check
  CHECK (visibility IN ('semi_public', 'private'));

ALTER TABLE artwork_requests
  ALTER COLUMN visibility SET DEFAULT 'semi_public';

ALTER TABLE artwork_requests
  ADD COLUMN IF NOT EXISTS invited_artist_slugs TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS qr_revenue_share_percent INTEGER
    CHECK (qr_revenue_share_percent IS NULL OR qr_revenue_share_percent BETWEEN 0 AND 100);

NOTIFY pgrst, 'reload schema';
