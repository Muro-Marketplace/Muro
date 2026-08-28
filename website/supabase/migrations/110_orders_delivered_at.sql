-- 110: the 14-day statutory refund window could never open.
--
-- Found by the write-side phantom-column guard
-- (tests/integration/phantom-write-columns.test.ts), which is new and found this
-- on its second pass.
--
-- `orders.delivered_at` exists in NO migration and not in the live table, and
-- three separate pieces of code assume it does:
--
--   1. The Stripe webhook's order insert sets it for collection orders, with the
--      comment "pin delivered_at so refund-window logic still works". The
--      column is in `strippableCols`, so the D6 ladder drops it on every insert
--      and the order saves without it. Silently, by design, because refusing an
--      order that Stripe has already charged for is worse.
--   2. `isRefundEligible` (`lib/order-status-labels.ts`) implements the window:
--      `status === "delivered" && delivered_at` within 14 days. With the column
--      absent the second operand is always undefined, so the function returns
--      FALSE for every delivered order, always.
--   3. `customer-portal` gates the refund-request affordance on that function.
--
-- So the moment an order is marked delivered, the in-product refund path closes
-- permanently. `/returns` cites the **Consumer Contracts Regulations 2013** and
-- promises 14 days from receipt to cancel for any reason. The page also gives an
-- email address, so the statutory right is not wholly unavailable, but the
-- product's own implementation of it has never once worked.
--
-- Additive: one nullable timestamp, no default, no backfill. Existing delivered
-- orders keep NULL, which is the truth — nothing ever recorded when they
-- arrived, and inventing a date would hand someone a refund window measured from
-- a moment we made up.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.delivered_at IS
  'When the buyer received the artwork. Drives the 14-day Consumer Contracts '
  'Regulations 2013 cancellation window in isRefundEligible(). Set on the '
  'delivered transition, and at insert for collection orders, which are handed '
  'over at the point of purchase.';

NOTIFY pgrst, 'reload schema';
