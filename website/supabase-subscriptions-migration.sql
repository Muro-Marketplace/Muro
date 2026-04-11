-- Add Stripe subscription fields to artist_profiles
-- Run this in Supabase SQL Editor

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;
