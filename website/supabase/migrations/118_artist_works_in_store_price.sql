-- 118: the work-level in-store price finally has somewhere to live
--      (owner decision 14).
--
-- Every other link in this feature's chain has been coded for months:
--
--   * the portfolio editor COLLECTS a work-level in-store price and its
--     enable-toggle honours one on reopen;
--   * `changed-works.ts` diffs it, so an edit marks the work changed;
--   * `artist-profiles-transform.ts` maps `in_store_price` onto the public
--     work shape;
--   * the artwork page's collect-from-venue CTA quotes it for works without
--     per-size pricing.
--
-- The column did not exist. `api/artist-works` stopped forwarding the field
-- (A8) because sending it made `upsertWork`'s per-column ladder fail on every
-- save, and `writable-fields.ts` omitted it for the same reason. Net effect:
-- artists typed a price, the form said saved, and the value went nowhere —
-- decision 14 was that this undecided state showed up in three places.
--
-- The alternative was deleting the UI. Finishing the feature is the smaller
-- change: one nullable column, and the two deliberate omissions (route field,
-- allowlist entry) reinstated. Per-size in-store prices are unaffected; they
-- live inside the `pricing` jsonb and always have.

ALTER TABLE public.artist_works
  ADD COLUMN IF NOT EXISTS in_store_price NUMERIC;

COMMENT ON COLUMN public.artist_works.in_store_price IS
  'Work-level collect-from-venue price in GBP, for works without per-size '
  'pricing. Per-size prices live inside the pricing jsonb.';

NOTIFY pgrst, 'reload schema';
