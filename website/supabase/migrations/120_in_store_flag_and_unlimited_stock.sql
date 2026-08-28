-- 120: two owner findings from live testing (2026-08-28).
--
-- (1) "Available to buy in store" becomes a tick box. The in-store PRICE
--     model (114/118 era) is retired: the owner wants a simple flag, and the
--     collect-from-venue price is the work's normal tier price. in_store_price
--     stays in place, unwritten, so nothing breaks if an old client sends it.
--
-- (2) Unlimited works said "Sold" after one sale. decrement_work_stock treated
--     NULL quantity_available (= unlimited) as 0 via COALESCE, so the first
--     sale wrote quantity 0 and flipped available to false. An unlimited work
--     now stays unlimited: no decrement, no availability flip. restock_work
--     gets the mirror: restocking an unlimited work is a no-op that reports
--     NULL rather than inventing a finite count.

ALTER TABLE artist_works
  ADD COLUMN IF NOT EXISTS available_in_store BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN artist_works.available_in_store IS
  'Owner decision 2026-08-28: tick box replacing the in-store price model. '
  'When true and the work sits on an ACTIVE placement, the artwork page '
  'offers "buy in store" (collect from venue) at the normal tier price. '
  'Cleared automatically when a collect_venue order sells the wall piece.';

CREATE OR REPLACE FUNCTION public.decrement_work_stock(
  p_work_id TEXT,
  p_qty     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  UPDATE artist_works
     SET quantity_available = CASE
           WHEN quantity_available IS NULL THEN NULL  -- unlimited stays unlimited
           ELSE GREATEST(0, quantity_available - p_qty)
         END,
         available = CASE
           WHEN quantity_available IS NULL THEN available
           WHEN GREATEST(0, quantity_available - p_qty) = 0 THEN false
           ELSE available
         END
   WHERE id = p_work_id
   RETURNING quantity_available INTO v_remaining;
  RETURN v_remaining;
END;
$$;

CREATE OR REPLACE FUNCTION public.restock_work(
  p_work_id TEXT,
  p_qty     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new INTEGER;
BEGIN
  UPDATE artist_works
     SET quantity_available = CASE
           WHEN quantity_available IS NULL THEN NULL  -- unlimited: nothing to restock
           ELSE GREATEST(0, quantity_available) + GREATEST(0, p_qty)
         END,
         available = CASE
           WHEN quantity_available IS NULL THEN available
           WHEN GREATEST(0, quantity_available) + GREATEST(0, p_qty) > 0 THEN true
           ELSE available
         END
   WHERE id = p_work_id
   RETURNING quantity_available INTO v_new;
  RETURN v_new;
END;
$$;

-- Same ACL discipline as 085/087: service role only.
REVOKE ALL ON FUNCTION public.decrement_work_stock(TEXT, INTEGER) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.restock_work(TEXT, INTEGER) FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
