-- 044_cart_sessions.sql
--
-- In-flight cart records, keyed by Stripe Checkout Session id. Replaces
-- the 500-char metadata storage that was truncating large carts. The
-- webhook reads cart from here, not from session.metadata. Sessions are
-- TTL'd to 14 days (Stripe sessions expire at 24h, so 14d is generous).

CREATE TABLE IF NOT EXISTS cart_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id text UNIQUE NOT NULL,
  cart jsonb NOT NULL,
  shipping jsonb NOT NULL,
  source text,
  venue_slug text,
  artist_slugs text[],
  expected_subtotal_pence integer,
  expected_shipping_pence integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days'
);

CREATE INDEX IF NOT EXISTS idx_cart_sessions_stripe_session_id
  ON cart_sessions(stripe_session_id);
-- Full index (not partial); a `WHERE expires_at < now() + …` predicate
-- can't be used because now() is volatile, not IMMUTABLE.
CREATE INDEX IF NOT EXISTS idx_cart_sessions_expires_at
  ON cart_sessions(expires_at);

ALTER TABLE cart_sessions ENABLE ROW LEVEL SECURITY;

-- No client-side RLS policy — only the server-side admin client should
-- ever read or write this table. Confirmation page reads via the
-- /api/checkout/session endpoint which uses the admin client.
