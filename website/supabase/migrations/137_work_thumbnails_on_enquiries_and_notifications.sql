-- 137: give enquiries and notifications a way to show the work they are about.
--
-- Portals named a piece of work in text alone. An artist reading "Enquiry about
-- Harbour Light" had to remember which piece that was, and the answer was
-- usually a picture they had uploaded themselves.
--
-- Most surfaces could already reach the image: orders carry it on the stored
-- item, offers resolve it through purchase_offers.work_ids, placements
-- denormalise work_image onto the row. These two could not. enquiries held
-- work_title as a bare string with no key, and notifications held nothing about
-- the work at all.
--
-- This follows the placements pattern rather than inventing one: keep the
-- foreign key for correctness AND denormalise the image for reads. The image is
-- a display copy, so a later re-upload does not retro-change what an old
-- enquiry looked like, and the list renders without a join.
--
-- Everything here is additive and nullable. No backfill: existing rows have no
-- recoverable work reference (matching enquiries by title would pick the wrong
-- piece whenever an artist has two with the same name, which is worse than
-- showing none), so they keep rendering WorkThumb's placeholder.

-- artist_works.id is TEXT, not UUID (it is a client-generated slug-ish id, and
-- the table's primary key). The referencing column has to match it.
ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS work_id TEXT REFERENCES artist_works(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_image TEXT;

COMMENT ON COLUMN enquiries.work_id IS
  'The work this enquiry is about, when it came from a work page. NULL for a general enquiry and for every row predating migration 137. ON DELETE SET NULL: deleting a work must not delete the enquiry, which is correspondence and may already have been answered.';

COMMENT ON COLUMN enquiries.work_image IS
  'Display copy of the work image at the time of the enquiry. Denormalised like placements.work_image so the list renders without a join, and so a later re-upload does not change what an old enquiry shows.';

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS work_image TEXT;

COMMENT ON COLUMN notifications.work_image IS
  'Display copy of the artwork image for a notification about a specific work. NULL for notifications that are not about one, which is most of them.';

-- The artist enquiries list filters by artist and orders by date; work_id is
-- read per row, never filtered on, so it gets no index of its own. The FK
-- itself needs one though: without it, deleting a work sequential-scans
-- enquiries to find referencing rows.
CREATE INDEX IF NOT EXISTS enquiries_work_id_idx
  ON enquiries (work_id)
  WHERE work_id IS NOT NULL;
