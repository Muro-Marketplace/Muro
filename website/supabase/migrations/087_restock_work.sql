-- 087: atomic per-work stock restock on refund (D17, 04 §B8).
--
-- The mirror image of decrement_work_stock (085). A full refund returns a piece
-- to sale, so quantity_available must go back up and `available` flip back to
-- true. Done in a single UPDATE so a refund racing a concurrent decrement (or two
-- refunds racing) cannot lose an increment: Postgres serialises the row writes.
--
-- available flips to true whenever the post-restock count is > 0, the inverse of
-- decrement_work_stock (which flips to false at 0). GREATEST(0, p_qty) makes a
-- stray non-positive qty a no-op rather than a silent decrement.
--
-- Returns the new quantity, or NULL when the work id does not exist (the refund
-- caller logs that; a missing work is not fatal to a refund whose money has
-- already moved).
--
-- Migration number: EXECUTION-DECISIONS D1 gives 04 the 080-089 range; 080-086
-- are taken, so this is 087.

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
     SET quantity_available = GREATEST(0, COALESCE(quantity_available, 0)) + GREATEST(0, p_qty),
         available = CASE
           WHEN GREATEST(0, COALESCE(quantity_available, 0)) + GREATEST(0, p_qty) > 0 THEN true
           ELSE available
         END
   WHERE id = p_work_id
   RETURNING quantity_available INTO v_new;
  RETURN v_new;
END;
$$;

-- Same SECURITY DEFINER lockdown as decrement_work_stock (085): Supabase grants
-- EXECUTE to anon + authenticated explicitly (not via PUBLIC), so all three must
-- be revoked or any signed-in or anonymous caller could inflate an artist's stock
-- through this SECURITY DEFINER function. The live ACL after applying must read
-- postgres=X, service_role=X only.
REVOKE ALL ON FUNCTION public.restock_work(TEXT, INTEGER) FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
