-- 048_artwork_request_response_metadata.sql
--
-- Adds a free-form `metadata` JSONB column on artwork_request_responses
-- so the artist can pin which size variant of each suggested work they
-- mean (e.g. "Storm Front — 16×24″"). Avoids a parallel typed column
-- per nicety-of-the-week.
--
-- Shape today:
--   { "work_size_labels": { "<work_id>": "<size_label>", ... } }

ALTER TABLE artwork_request_responses
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
