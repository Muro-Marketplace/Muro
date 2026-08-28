-- 099: give curation_requests a dedicated stripe_subscription_id column.
--
-- D20 completion, authorised by EXECUTION-DECISIONS D57.4.
--
-- A managed curation tier is a Stripe subscription. The webhook had nowhere to
-- store the subscription id, so it jammed it into stripe_payment_intent_id
-- (D20) — a column meant for a payment intent — which would make any refund
-- keyed on it call stripe.refunds.create({ payment_intent: "sub_…" }) and fail.
-- D20 stopped that by writing `paymentIntentId || null`; this adds the proper
-- column so the subscription id is actually recorded, matching the
-- stripe_subscription_id columns on artist_profiles and placements. The D21
-- curation billing reconcilers look the row up by this column.
--
-- Additive and nullable, so it is safe on the existing rows (both one-off,
-- currently 2 rows, neither a subscription).
--
-- Migration numbering: D1's per-doc ranges are retired (D57.2). Numbers are now
-- allocated sequentially above the highest existing one (098) — this is 099. The
-- free gaps (078, 079, 090-097) are deliberately NOT backfilled (D57.3): a
-- migration's filename is its apply order on a fresh database, so a low number
-- written today would run before the objects it depends on.

ALTER TABLE curation_requests
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

COMMENT ON COLUMN curation_requests.stripe_subscription_id IS
  'Stripe subscription id for managed curation tiers; NULL for one-off tiers. Set by the checkout webhook, read by the curation billing reconcilers (D21).';

NOTIFY pgrst, 'reload schema';
