-- 054_artwork_request_response_placement_terms.sql
--
-- Plan G2: artist responding to a venue artwork request can now propose
-- the full placement terms (monthly fee / QR / revenue share) inside the
-- response itself, instead of bouncing the venue out to /placements to
-- re-enter what they just read. On accept, the API auto-creates the
-- placements row from these proposed_* fields.
--
-- Notes:
-- - linked_placement_id already exists on artwork_request_responses
--   (added in 046, TEXT FK to placements.id which is itself TEXT).
-- - response_type CHECK constraint deliberately keeps 'existing_works'
--   so any historical rows still validate; only the FRONTEND drops it.

ALTER TABLE artwork_request_responses
  ADD COLUMN IF NOT EXISTS proposed_monthly_fee_pence INTEGER,
  ADD COLUMN IF NOT EXISTS proposed_qr_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS proposed_revenue_share_percent INTEGER;

NOTIFY pgrst, 'reload schema';
