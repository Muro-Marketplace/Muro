-- 122: Wallplace Programmes rent accrual (Task 6).
--
-- Every artist whose work hangs under a Wallplace Programme is owed rent out
-- of the client's fee (curation-tiers.ts: PROGRAMME_PIECE_RENT_TARGET_GBP,
-- about £10/piece/month). Task 5 reconciles a programme's paid invoices
-- against curation_requests.status; nothing anywhere records which artist is
-- owed what. This migration adds the two columns that link a placement to
-- the programme paying for it, and the ledger table that records each
-- accrual as an immutable fact. src/lib/curation/programme-rent.ts is the
-- only writer.
--
-- 1. placements.programme_request_id / programme_rent_gbp
--
--    Both server-owned (src/lib/db/writable-fields.ts,
--    PLACEMENT_SERVER_OWNED): an artist or venue must never be able to link
--    themselves to a programme or set their own rent. Both nullable -- most
--    placements are not under a programme at all, and, as of this task,
--    nothing yet WRITES them either: there is no admin route to link a
--    placement to a programme (see the task report). That is a deliberate
--    gap, not an oversight -- inventing one was out of scope here -- and it
--    means accrueProgrammeRent() legitimately finds zero linked placements
--    for every programme until a follow-up task builds that linking surface.
--    programme_rent_gbp's floor mirrors curation_requests.piece_rent_gbp's
--    own CHECK (migration 121); a NULL sails through it exactly as that
--    migration's header explains (UNKNOWN, not FALSE).
--
-- 2. programme_rent_accruals
--
--    One row per (placement, invoice). amount_pence is
--    round(programme_rent_gbp * 100) * period_months, so a quarterly invoice
--    accrues three months in a single row rather than three separate ones --
--    there is only one Stripe invoice per period to key idempotency off.
--
--    UNIQUE (stripe_invoice_id, placement_id) is the actual double-accrual
--    guard: a Stripe webhook redelivery re-attempts the same insert, the
--    constraint rejects it (23505), and accrueProgrammeRent() treats that as
--    an expected replay, not an error. Nothing here is a running balance --
--    accrued_at records when a row was written, not a total, and Task 7's
--    settlement will stamp settled_transfer_order_id / settled_at onto the
--    existing row rather than maintaining a total anywhere else (AGENTS.md:
--    derived aggregates live in one exported function, never a
--    hand-maintained mirror column -- an accrual row records a fact, which
--    is what this table is for).
--
--    placement_id is TEXT, not UUID. placements.id has been TEXT since the
--    original table (supabase-all-migrations.sql, line 103) -- the same
--    correction migration 111's placement_record_versions already had to
--    make for the same reason.
--
--    artist_user_id is nullable with ON DELETE SET NULL, not NOT NULL /
--    NO ACTION as a literal reading of the task brief would give it.
--    Migration 117 (owner decision 15) rewrote every foreign key from a
--    public table to auth.users to ON DELETE SET NULL, project-wide,
--    specifically so account erasure can never be blocked by a row it did
--    not anticipate -- which is exactly what a NOT NULL / NO ACTION
--    artist_user_id here would do, the day any artist who has ever earned
--    programme rent asks to be erased. The amount, period and invoice stay
--    on the row regardless (anonymise-and-keep, the same treatment 117
--    gives orders retained for tax): the fact of what was earned must
--    outlive the identity of who earned it, if that identity is erased.
--
--    curation_request_id and placement_id keep the plain (NO ACTION)
--    default: neither curation_requests nor placements rows are ever hard-
--    deleted in this codebase (placements is soft-deleted, migration 026;
--    the one curation_requests DELETE, api/curation/route.ts, only ever
--    fires before a Stripe session exists, long before any invoice could
--    accrue rent), so this is inert in practice and simply refuses, rather
--    than silently permits, a future code change that tries to hard-delete
--    either while accrual history references them.
--
--    Service-role only, matching migration 111's pattern exactly (RLS
--    enabled with no policy, explicit REVOKE, GRANT to service_role): the
--    only writer is accrueProgrammeRent() via the service-role admin
--    client, and there is no client-facing read surface in this task.

ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS programme_request_id UUID REFERENCES curation_requests(id),
  ADD COLUMN IF NOT EXISTS programme_rent_gbp NUMERIC CHECK (programme_rent_gbp >= 5);

COMMENT ON COLUMN placements.programme_request_id IS
  'Wallplace Programmes (Task 6): the programme this placement is paid rent under. Server-owned (PLACEMENT_SERVER_OWNED); nullable because most placements are not under a programme, and nothing yet links one (see the Task 6 report).';
COMMENT ON COLUMN placements.programme_rent_gbp IS
  'Wallplace Programmes (Task 6): this placement''s agreed monthly artist rent under its programme. Server-owned. Floor matches curation_requests.piece_rent_gbp (£5); accrueProgrammeRent() only accrues a placement where this is set and > 0.';

CREATE TABLE IF NOT EXISTS programme_rent_accruals (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curation_request_id       UUID NOT NULL REFERENCES curation_requests(id),
  -- placements.id is TEXT, not UUID (see header).
  placement_id              TEXT NOT NULL REFERENCES placements(id),
  -- Nullable, ON DELETE SET NULL: see header (migration 117 / owner decision 15).
  artist_user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_invoice_id         TEXT NOT NULL,
  -- 1 for a monthly invoice, 3 for a quarterly one.
  period_months             INTEGER NOT NULL CHECK (period_months > 0),
  amount_pence              INTEGER NOT NULL CHECK (amount_pence > 0),
  accrued_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Task 7 (quarterly settlement) stamps these onto the existing row.
  -- Nothing in this task writes them.
  settled_transfer_order_id TEXT,
  settled_at                TIMESTAMPTZ,
  -- The double-accrual guard: a redelivered webhook's repeat insert for the
  -- same invoice and placement is rejected here (23505), not re-detected by
  -- application code.
  UNIQUE (stripe_invoice_id, placement_id)
);

CREATE INDEX IF NOT EXISTS idx_programme_rent_accruals_curation_request
  ON programme_rent_accruals(curation_request_id);
CREATE INDEX IF NOT EXISTS idx_programme_rent_accruals_placement
  ON programme_rent_accruals(placement_id);
CREATE INDEX IF NOT EXISTS idx_programme_rent_accruals_artist
  ON programme_rent_accruals(artist_user_id);
-- Task 7 will need "which of this artist's accruals are still unsettled";
-- cheap to add now, on the still-small unsettled slice, mirroring migration
-- 111's conversation_reports_open_idx for the same reason.
CREATE INDEX IF NOT EXISTS idx_programme_rent_accruals_unsettled
  ON programme_rent_accruals(artist_user_id) WHERE settled_at IS NULL;

-- RLS on with NO policy: the only writer holds the service key, which
-- bypasses RLS, so this denies everything else by default. The REVOKE
-- matters separately -- Supabase grants anon and authenticated explicitly
-- rather than through PUBLIC, so RLS alone would still leave a table-level
-- grant standing (migration 112).
ALTER TABLE programme_rent_accruals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE programme_rent_accruals FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE programme_rent_accruals TO service_role;

NOTIFY pgrst, 'reload schema';
