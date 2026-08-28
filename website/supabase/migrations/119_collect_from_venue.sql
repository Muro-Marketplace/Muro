-- 119: collect-from-venue, the schema half (owner decision 13 / 04 Phase 8,
--      items 8.1 and 8.4's constraint).
--
-- T9 is the "buy the piece off the venue's wall" flow: the buyer pays online
-- and picks the work up from the venue it is hanging in, instead of having the
-- artist ship it. The CTA for it has existed on the artwork page for months,
-- keyed on `pricing[].inStorePrice` — but nothing tied it to a real placement,
-- so it rendered identically whether the piece was on a venue wall or in the
-- artist's flat, and checkout had no mode to carry the intent.
--
--   placements.placed_size_label   which pricing[] size label is physically at
--                                  the venue. A work on a wall is ONE object at
--                                  ONE size; without this the buyer can order
--                                  the A2 for collection while the A4 hangs.
--                                  NULL means "not recorded", which the
--                                  validators treat as no size restriction —
--                                  every live placement predates the column and
--                                  refusing them all would kill the flow at
--                                  birth.
--   placements.collection_address  the venue's collection point, captured at
--                                  accept time from venue_profiles, and echoed
--                                  onto the order at checkout so the buyer's
--                                  confirmation carries it even if the
--                                  placement later changes.
--
-- orders.collection_address already exists (042) and is written by the
-- collection flow; what the ORDERS side needs is the CHECK widened to admit
-- the new mode. Additive drop-and-add, same as 105/116.

ALTER TABLE public.placements
  ADD COLUMN IF NOT EXISTS placed_size_label TEXT,
  ADD COLUMN IF NOT EXISTS collection_address TEXT;

COMMENT ON COLUMN public.placements.placed_size_label IS
  'Which pricing[] size label is physically hanging at the venue. Drives the '
  'collect-from-venue CTA and checkout validation. NULL = not recorded = no '
  'size restriction.';
COMMENT ON COLUMN public.placements.collection_address IS
  'The venue''s collection point, captured at placement accept from '
  'venue_profiles.';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfilment_method_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfilment_method_check
  CHECK (fulfilment_method IN ('ship', 'collection', 'digital', 'collect_venue'));

NOTIFY pgrst, 'reload schema';
