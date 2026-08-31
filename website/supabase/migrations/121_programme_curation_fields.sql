-- 121: Wallplace Programmes intake fields and quote-first tier CHECK widen (Task 2).
--
-- Two defects verified by review, both on curation_requests:
--
-- 1. The tier CHECK still permits only single_wall / full_space / bespoke /
--    managed_monthly / managed_quarterly (013, widened by 080). Task 1 added a
--    quote-first `programme` tier in code (src/lib/curation-tiers.ts) but no
--    migration taught the DB about it, so `tier: 'programme'` violates
--    curation_requests_tier_check and 500s on insert -- the T10 defect
--    (080) recurring for a new tier. Widen the CHECK to add 'programme'.
--
--    managed_monthly and managed_quarterly stay in the list even though
--    neither is reachable through the API any more (Task 1 dropped both from
--    CURATION_TIERS, so CURATION_TIER_KEYS / the route's zod schema now 400
--    a request naming either). Historical rows still carry those values, and
--    Postgres revalidates every CHECK on a row on any UPDATE, not just the
--    touched columns, so dropping them would break an update to an old
--    managed-tier row (the curation billing reconcilers in
--    src/lib/curation/billing.ts still service those rows). Follows 080's own
--    drop-and-re-add pattern for widening this same constraint.
--
-- 2. A programme brief needs a handful of intake fields the existing schema
--    has nowhere to put: site count, an estimated piece count, rotation
--    cadence and sector at submission time, plus (once an admin turns a
--    brief into a quote, Task 4) the quoted term, amount, billing interval
--    and per-piece artist rent. No new free-text "brief" column is added:
--    style_notes / audience_notes / mood_notes / references_notes (013)
--    already cover open-ended narrative and are reused as-is.
--
-- Also added: founding_site boolean, default false. The owner has decided
-- the first 5 programme clients lock their rate for 24 months; the flag
-- needs somewhere to live even though nothing sets it until admin quoting
-- (Task 4). Defaulting to false (not left NULL) keeps the column
-- well-defined on every row without requiring a value at insert time.
--
-- Safe on existing rows: every new column is nullable (no NOT NULL, no
-- backfill), so single_wall/full_space/bespoke rows are unaffected -- nothing
-- requires or reads these columns for them. A CHECK on a new column is
-- automatically satisfied by every existing row regardless, because Postgres
-- only fails a CHECK when the expression evaluates to FALSE, and any
-- comparison against NULL (what every existing row has, pre-migration, for a
-- brand-new column) evaluates to UNKNOWN, which passes.
--
-- Idempotent-safe in this project's style (080, 099, 100): DROP CONSTRAINT IF
-- EXISTS then ADD CONSTRAINT for the redefined tier CHECK (dropping a CHECK
-- does not touch row data); ADD COLUMN IF NOT EXISTS with each new column's
-- CHECK inline for the additions, so a column that already exists is left
-- untouched rather than erroring on a second run.

ALTER TABLE curation_requests
  DROP CONSTRAINT IF EXISTS curation_requests_tier_check;

ALTER TABLE curation_requests
  ADD CONSTRAINT curation_requests_tier_check
  CHECK (tier IN (
    'single_wall', 'full_space', 'bespoke', 'managed_monthly', 'managed_quarterly', 'programme'
  ));

ALTER TABLE curation_requests
  ADD COLUMN IF NOT EXISTS site_count INTEGER CHECK (site_count > 0),
  ADD COLUMN IF NOT EXISTS pieces_estimate INTEGER CHECK (pieces_estimate > 0),
  ADD COLUMN IF NOT EXISTS rotation_cadence TEXT CHECK (rotation_cadence IN ('quarterly', 'biannual', 'none')),
  ADD COLUMN IF NOT EXISTS sector TEXT,
  ADD COLUMN IF NOT EXISTS term_months INTEGER,
  ADD COLUMN IF NOT EXISTS quoted_amount_gbp NUMERIC CHECK (quoted_amount_gbp > 0),
  ADD COLUMN IF NOT EXISTS billing_interval TEXT CHECK (billing_interval IN ('month', 'quarter')),
  ADD COLUMN IF NOT EXISTS piece_rent_gbp NUMERIC CHECK (piece_rent_gbp >= 5),
  ADD COLUMN IF NOT EXISTS founding_site BOOLEAN DEFAULT false;

COMMENT ON COLUMN curation_requests.site_count IS
  'Programme intake: number of client sites/venues the arrangement covers.';
COMMENT ON COLUMN curation_requests.pieces_estimate IS
  'Programme intake: the venue''s own estimate of pieces needed. Guidance for the admin quote, not a locked total.';
COMMENT ON COLUMN curation_requests.rotation_cadence IS
  'Programme intake: how often the venue wants art rotated. Biannual is included in the base price; quarterly is a quoted uplift (PROGRAMME_QUARTERLY_ROTATION_UPLIFT_GBP).';
COMMENT ON COLUMN curation_requests.sector IS
  'Programme intake: free-text venue sector (e.g. office, hospitality), for admin quoting context.';
COMMENT ON COLUMN curation_requests.term_months IS
  'Programme quoting (Task 4): the minimum-term length the admin quotes, in months.';
COMMENT ON COLUMN curation_requests.quoted_amount_gbp IS
  'Programme quoting (Task 4): the admin-set monthly-equivalent quote amount.';
COMMENT ON COLUMN curation_requests.billing_interval IS
  'Programme quoting (Task 4): the Stripe billing cadence for the quoted subscription.';
COMMENT ON COLUMN curation_requests.piece_rent_gbp IS
  'Programme quoting (Task 4): the admin-set per-piece monthly artist rent. Floor PROGRAMME_PIECE_RENT_MIN_GBP (£5); the rent pool must not exceed PROGRAMME_RENT_SHARE_MAX (70%) of quoted_amount_gbp.';
COMMENT ON COLUMN curation_requests.founding_site IS
  'Whether this programme client is one of the first 5 founding sites with a 24 month rate lock. Not set by this migration or the intake route; Task 4 (admin quoting) sets it.';

NOTIFY pgrst, 'reload schema';
