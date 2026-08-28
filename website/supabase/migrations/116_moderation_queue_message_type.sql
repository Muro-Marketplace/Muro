-- 116: flagged messages reach the moderation queue (owner decision 11).
--
-- 09 item 2.2's fix stopped a flagged message silently LOSING its type, terms
-- and attachments (two phantom columns behind a strip-and-retry), and moved the
-- flag into the message row's metadata. What it could not do was put the flag
-- in front of an admin: `moderation_queue` (058) constrains `entity_type` to
-- blog / feature_request / feedback, so a message had nowhere to go and the
-- only trace of a flagged message was a queryable-but-unwatched jsonb field.
--
-- Widening the CHECK is the same additive drop-and-add as 105's: every value
-- that was legal before still is, no existing row can violate the new list, and
-- no rewrite happens.

ALTER TABLE public.moderation_queue
  DROP CONSTRAINT IF EXISTS moderation_queue_entity_type_check;

ALTER TABLE public.moderation_queue
  ADD CONSTRAINT moderation_queue_entity_type_check CHECK (entity_type IN (
    'blog',
    'feature_request',
    'feedback',
    'message'
  ));
