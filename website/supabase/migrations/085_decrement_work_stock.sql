-- 085: atomic per-work stock decrement (D5, 04 §B1).
--
-- The webhook decremented stock read-then-write: SELECT quantity_available,
-- compute max(0, current - qty), UPDATE. Two concurrent orders for the last piece
-- both read 1 and both write 0, so both buyers get it. This function does the
-- decrement in a single UPDATE, so Postgres serialises the two: the first takes
-- 1 -> 0, the second 0 -> 0, and only one order can have taken real stock.
--
-- available flips to false when the count reaches 0, matching the read-then-write
-- behaviour it replaces. GREATEST(0, ...) keeps the count from going negative,
-- which checkout reads as "sold" (isWorkSold), so a negative would make a work
-- permanently unbuyable.
--
-- Returns the remaining quantity, or NULL when the work id does not exist (the
-- caller logs that; a missing work is not fatal to an order that already has the
-- money).
--
-- The plan names this 075_decrement_work_stock.sql, inside 02's range (074-079).
-- EXECUTION-DECISIONS D1 gives 04 080-089; 080-084 are taken, so it is 085.

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
     SET quantity_available = GREATEST(0, COALESCE(quantity_available, 0) - p_qty),
         available = CASE
           WHEN GREATEST(0, COALESCE(quantity_available, 0) - p_qty) = 0 THEN false
           ELSE available
         END
   WHERE id = p_work_id
   RETURNING quantity_available INTO v_remaining;
  RETURN v_remaining;
END;
$$;

-- Service role calls this from the webhook. Supabase grants EXECUTE to anon and
-- authenticated explicitly (not via PUBLIC), so all three must be revoked or any
-- signed-in or anonymous caller could zero out an artist's stock through this
-- SECURITY DEFINER function. Verified against the live ACL after applying:
-- postgres=X, service_role=X only.
REVOKE ALL ON FUNCTION public.decrement_work_stock(TEXT, INTEGER) FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
