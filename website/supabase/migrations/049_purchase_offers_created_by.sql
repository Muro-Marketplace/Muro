-- 049_purchase_offers_created_by.sql
--
-- Adds `created_by_user_id` so we can tell which side of the offer
-- *sent* this row, vs which side received it. Without this, we can't
-- distinguish "venue made an offer" from "artist made a counter" — the
-- buyer_user_id and artist_user_id are the same on both rows. The UI
-- needs the sender so we can show "Awaiting response" + Withdraw to
-- whoever made the offer (instead of the previous logic that gave the
-- artist Accept buttons on their own counters).
--
-- Backfill notes:
--   - Parent offers (no parent_offer_id): sender is always the buyer.
--   - Counters: walking the chain to alternate is painful and we have
--     few in-flight counters in production today, so we backfill them
--     with buyer_user_id and accept that historical rows may render
--     with slightly off labels. New rows will be correct.

ALTER TABLE purchase_offers
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

UPDATE purchase_offers
   SET created_by_user_id = buyer_user_id
 WHERE created_by_user_id IS NULL;

ALTER TABLE purchase_offers
  ALTER COLUMN created_by_user_id SET NOT NULL;
