-- ============================================
-- Migration 137: Collection size tiers
--
-- A collection was a fixed set of works at one bundle_price, with one size
-- pinned per work in work_sizes (migration 006). An artist selling a print
-- series in three sizes had to publish three near-identical collections.
--
-- size_tiers holds the optional sizes the collection is sold in:
--   [{ label, price, description?, workSizes: [{ workId, sizeLabel }] }]
--
-- An empty array is the untiered collection, which is every row that exists
-- today. Their behaviour does not change.
--
-- Tier prices are typed by the artist, never derived from the works' own
-- prices, so a work being repriced cannot silently move a bundle price.
-- ============================================

ALTER TABLE artist_collections
  ADD COLUMN IF NOT EXISTS size_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- bundle_price mirrors the cheapest tier on a tiered collection.
--
-- Two things depend on it and neither should have to learn about tiers:
-- the checkout availability guard refuses a collection whose bundle_price is
-- absent or non-positive, and CollectionCard, the browse feed and the saved
-- lists all read it for display.
--
-- Per the derived-column invariant in AGENTS.md this is written by a trigger,
-- not by the API alone. The API writing it would be correct in practice, since
-- the only thing that changes tiers is the same request that would rewrite the
-- price, but a trigger also covers the seed script, a direct SQL fix and any
-- future writer, and it cannot drift by construction.
--
-- bundle_price stays the artist's own number on an untiered collection: with no
-- tiers there is nothing to derive it from, so the trigger leaves it alone.
CREATE OR REPLACE FUNCTION artist_collections_sync_bundle_price()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cheapest NUMERIC;
BEGIN
  IF NEW.size_tiers IS NULL OR jsonb_typeof(NEW.size_tiers) <> 'array'
     OR jsonb_array_length(NEW.size_tiers) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT MIN((tier ->> 'price')::NUMERIC)
    INTO cheapest
    FROM jsonb_array_elements(NEW.size_tiers) AS tier
   WHERE jsonb_typeof(tier -> 'price') = 'number';

  IF cheapest IS NOT NULL THEN
    NEW.bundle_price := cheapest;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artist_collections_sync_bundle_price ON artist_collections;
CREATE TRIGGER artist_collections_sync_bundle_price
  BEFORE INSERT OR UPDATE ON artist_collections
  FOR EACH ROW EXECUTE FUNCTION artist_collections_sync_bundle_price();

NOTIFY pgrst, 'reload schema';
