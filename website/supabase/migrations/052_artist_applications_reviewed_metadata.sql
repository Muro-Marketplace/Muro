-- 052_artist_applications_reviewed_metadata.sql
--
-- Adds reviewed_at + reviewed_by columns to artist_applications so the admin
-- accept/reject PUT handler at /api/admin/applications/[id] can persist a
-- review timestamp and the reviewing admin's user id. The admin UI already
-- reads `reviewed_at` and renders a "Reviewed [date]" line, but it was
-- always blank because the route never wrote either column.
--
-- Note: this table has `created_at` (used by the admin GET route's order-by)
-- but does not have an `updated_at` column, so the legacy backfill uses
-- created_at as the best-available proxy for non-pending rows. Future
-- reviews will write reviewed_at = now() at the moment of accept/reject.
--
-- Status values used by /api/admin/applications/[id] PUT are 'accepted' and
-- 'rejected' (not 'approved'/'rejected'). The backfill matches that.

ALTER TABLE artist_applications
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

-- Backfill reviewed_at for any application that has already been reviewed
-- (status = accepted or rejected). reviewed_by stays null for legacy rows
-- since we cannot reliably infer the original reviewer's user id.
UPDATE artist_applications
   SET reviewed_at = created_at
 WHERE reviewed_at IS NULL
   AND status IN ('accepted', 'rejected');

NOTIFY pgrst, 'reload schema';
