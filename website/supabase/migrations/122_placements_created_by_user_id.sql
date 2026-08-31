-- 122: give placements an immutable "who created this row" column, so the
--      artist outreach cap stops counting a column that moves underneath it.
--
-- The cap (src/lib/outreach-cap.ts) counted `proposed_by_user_id`. That column
-- was added by migration 024 for bilateral milestone confirmation, and four
-- code paths write it:
--
--   1. the placement insert stamps the requester,
--   2. a counter-offer flips it to whoever countered,
--   3. advancing a stage nulls it out,
--   4. loading the placements list backfills it from the first request message.
--
-- So an artist who countered a venue's same-day request silently spent an
-- outreach unit (the helper's own header says counter-offers are free), and an
-- artist whose request reached a milestone the same day got a unit back for
-- nothing. The count was correct only when nothing else happened that day.
--
-- `created_by_user_id` is written once, at insert, by every path that creates a
-- placement, and never again. A trigger enforces that: an UPDATE that tries to
-- change it silently keeps the original value rather than raising, so unrelated
-- updates to the row (terms, stages, status) can never fail on account of it.
--
-- Backfill uses `proposed_by_user_id`, the best available signal for existing
-- rows. Rows where it is NULL stay NULL; they are all older than the cap's
-- 7-day window, so they cannot affect an enforcement decision.

ALTER TABLE public.placements
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.placements
  SET created_by_user_id = proposed_by_user_id
  WHERE created_by_user_id IS NULL
    AND proposed_by_user_id IS NOT NULL;

-- The cap filters on (created_by_user_id, created_at) on every outreach
-- attempt, which is the only read of this column that runs hot.
CREATE INDEX IF NOT EXISTS placements_created_by_user_id_created_at_idx
  ON public.placements (created_by_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.placements_freeze_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Once set, the value is fixed. Restoring silently (rather than raising)
  -- keeps this invisible to every unrelated UPDATE on the row.
  IF OLD.created_by_user_id IS NOT NULL
     AND NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    NEW.created_by_user_id := OLD.created_by_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS placements_freeze_created_by_trg ON public.placements;
CREATE TRIGGER placements_freeze_created_by_trg
  BEFORE UPDATE ON public.placements
  FOR EACH ROW
  EXECUTE FUNCTION public.placements_freeze_created_by();

COMMENT ON COLUMN public.placements.created_by_user_id IS
  'The user who created this placement row, stamped once at insert and frozen '
  'by placements_freeze_created_by_trg. This is the artist outreach cap''s '
  'counting column. Do not confuse with proposed_by_user_id, which tracks the '
  'current negotiation / milestone proposer and changes over the row''s life.';

NOTIFY pgrst, 'reload schema';
