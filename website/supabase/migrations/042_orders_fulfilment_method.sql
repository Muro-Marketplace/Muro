-- 042_orders_fulfilment_method.sql
-- F1 — buyer chooses ship vs collection (drop-off) at checkout.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfilment_method TEXT
    NOT NULL DEFAULT 'ship'
    CHECK (fulfilment_method IN ('ship','collection','digital')),
  ADD COLUMN IF NOT EXISTS collection_address TEXT,
  ADD COLUMN IF NOT EXISTS collection_notes TEXT;

NOTIFY pgrst, 'reload schema';
