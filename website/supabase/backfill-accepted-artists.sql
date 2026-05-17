-- One-off backfill: any artist whose application was accepted but whose
-- profile is stuck at review_status='pending' (because the accept
-- endpoint previously didn't set it explicitly, and migration 036
-- flipped the column default from 'approved' to 'pending').
--
-- Symptoms this unblocks:
--   - artist invisible to the public marketplace
--   - venues can't request a placement to them (browse-artists drops
--     pending rows, which is what /venue-portal/placements queries)
--
-- Match by lower(email) so casing drift between auth.users.email and
-- artist_applications.email doesn't cause us to miss anyone.
--
-- Safe to run multiple times.

WITH accepted_emails AS (
  SELECT DISTINCT LOWER(email) AS email
  FROM artist_applications
  WHERE status = 'accepted'
)
UPDATE artist_profiles ap
SET
  review_status = 'approved',
  approved_at = COALESCE(approved_at, NOW())
FROM auth.users u
WHERE ap.user_id = u.id
  AND LOWER(u.email) IN (SELECT email FROM accepted_emails)
  AND ap.review_status = 'pending'
RETURNING ap.user_id, ap.slug, ap.name, ap.review_status, ap.approved_at;
