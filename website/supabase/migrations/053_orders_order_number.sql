-- 053_orders_order_number.sql
-- Add a human-friendly short id for orders (rendered as "WP-XXXXXX").
-- The full UUID stays the primary key; order_number is for display only.
-- Used by:
--   /artist-portal/orders, /customer-portal, /orders/track,
--   admin/orders, order-confirmation emails.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number text UNIQUE;

CREATE OR REPLACE FUNCTION orders_set_order_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'WP-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_order_number ON orders;
CREATE TRIGGER orders_set_order_number BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_set_order_number();

-- Backfill existing rows. We use a slice of the row's UUID as the seed
-- so backfilled values are deterministic per row (rerunning the migration
-- is idempotent for any row that already has an order_number).
UPDATE orders
   SET order_number = 'WP-' || upper(substring(replace(id::text, '-', '') from 1 for 6))
 WHERE order_number IS NULL;

NOTIFY pgrst, 'reload schema';
