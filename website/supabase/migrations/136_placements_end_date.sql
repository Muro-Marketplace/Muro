-- 136: placements.end_date, the planned end of a placement.
--
-- Every other date column on placements records a PAST event (accepted_at,
-- installed_at, live_from, collected_at). There was no planned-end concept,
-- so the "ending soon" reminder had nothing to fire on and its cron has been
-- gated off since D60, and the midway check-in template has never been sent.
--
-- Nullable on purpose: an open-ended placement is legitimate and common. A
-- date here is an intention, not an automation. Reaching it sends reminders;
-- it never changes the placement's status, because the work is physically on
-- the wall until a human confirms collection.
ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS end_date DATE;

COMMENT ON COLUMN placements.end_date IS
  'Planned end of the placement, agreed by both parties. Nullable: open-ended placements have none. Drives the ending-soon reminder and the midway check-in. Never auto-ends the placement.';

-- The reminder crons scan for placements whose end_date falls in a window,
-- so the rows without one should never be walked.
CREATE INDEX IF NOT EXISTS placements_end_date_idx
  ON placements (end_date)
  WHERE end_date IS NOT NULL;
