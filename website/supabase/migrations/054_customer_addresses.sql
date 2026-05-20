-- 054_customer_addresses.sql
--
-- Address book for customers. /customer-portal/addresses surfaces the
-- list, /checkout's saved-address picker reads the rows when the buyer
-- is signed in. RLS scopes everything to the row's owner so a customer
-- can never read or modify another customer's addresses.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DROP/CREATE POLICY pattern.

CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  line1 text NOT NULL,
  line2 text,
  city text NOT NULL,
  postcode text NOT NULL,
  country text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON customer_addresses (user_id);

-- One default per user. Partial unique index lets multiple non-default
-- rows coexist while guaranteeing at most one is_default=true row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_default_per_user
  ON customer_addresses (user_id) WHERE is_default;

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

-- Permissive owner policy. Service-role key (used by the API) bypasses
-- RLS; the policy guards any direct PostgREST access.
DROP POLICY IF EXISTS customer_addresses_owner ON customer_addresses;
CREATE POLICY customer_addresses_owner ON customer_addresses
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
