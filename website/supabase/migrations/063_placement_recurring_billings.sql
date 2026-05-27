-- 063_placement_recurring_billings.sql
--
-- Phase 1 chunk 1g. Rail for G3 (monthly venue-to-artist recurring
-- billing on paid loans). Phase 2 owns the Stripe subscription
-- creation, webhook plumbing, and the venue-side billing UI.
--
-- Additive only. No code writes here yet.
--
-- placement_id is TEXT to match placements.id (see baseline schema).
-- stripe_subscription_id is UNIQUE because Stripe guarantees per-
-- subscription uniqueness and we want the upsert path to dedupe on
-- it cleanly when the webhook fires.

CREATE TABLE IF NOT EXISTS placement_recurring_billings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  payer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_amount_pence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','past_due','paused','cancelled')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS placement_recurring_billings_placement_idx
  ON placement_recurring_billings(placement_id);
CREATE INDEX IF NOT EXISTS placement_recurring_billings_payer_idx
  ON placement_recurring_billings(payer_user_id);
CREATE INDEX IF NOT EXISTS placement_recurring_billings_payee_idx
  ON placement_recurring_billings(payee_user_id);
CREATE INDEX IF NOT EXISTS placement_recurring_billings_status_idx
  ON placement_recurring_billings(status);

ALTER TABLE placement_recurring_billings ENABLE ROW LEVEL SECURITY;

-- Payer and payee see their own subscription rows. Stripe webhooks and
-- billing admin paths use the service-role client.
DO $$ BEGIN
  CREATE POLICY "placement_recurring_billings_select_participants"
    ON placement_recurring_billings
    FOR SELECT USING (
      auth.uid() = payer_user_id OR auth.uid() = payee_user_id
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
