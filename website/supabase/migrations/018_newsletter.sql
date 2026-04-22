-- Item 19: mailing list for ongoing "first to see new works" updates.
-- Distinct from waitlist (pre-launch signup) — this survives post-launch
-- and collects email-only subscriptions from any site visitor.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  source TEXT DEFAULT 'website',
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  CONSTRAINT email_lower CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email
  ON newsletter_subscribers(email);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Anon can INSERT only (via the API route which validates the email).
-- Reading + unsubscribing is service-role only.
CREATE POLICY "newsletter_insert_anyone" ON newsletter_subscribers
  FOR INSERT WITH CHECK (true);
