-- 111: three tables that three shipped features write to, and that have never
--      existed. Two of them are safety features.
--
-- Found by extending the phantom-column sweep to phantom TABLES. `.from("x")`
-- where x is not in the live schema, checked against production 2026-08-28.
-- All three routes swallow the resulting error into a `console.warn` and return
-- `{ ok: true }`, so nothing anywhere shows that the write did not happen.
--
--   conversation_reports        `POST /api/messages/report`. A person reporting
--                               harassment is told it was submitted, and the
--                               report exists only as a line in a Vercel log.
--                               The route's own header says it stores the row
--                               "if the table exists" and falls back to a warn
--                               "so a missing migration doesn't break the modal";
--                               the table has never existed, so the fallback IS
--                               the behaviour, and a log line is not a support
--                               queue.
--
--   user_blocks                 `POST /api/messages/block`. A person who blocks
--                               someone is told it worked. Nothing is recorded,
--                               so the blocked account can still message them,
--                               and nothing in the inbox filters on it. The
--                               route's header describes reading this table
--                               back "in a follow-up"; it could never have read
--                               anything.
--
--   placement_record_versions   `PATCH /api/placements/[id]/record`. The
--                               consignment-record audit trail. Its own comment
--                               says the snapshot "is what gives each side
--                               confidence the other isn't editing behind their
--                               back". There has never been a single row.
--
-- Column shapes are taken from the insert call sites verbatim, so the existing
-- code works against them with no change. Service-role only, matching every
-- other table these routes touch: they are written by API routes holding the
-- service key, and read by admin surfaces, so RLS is enabled with no policy and
-- the anon/authenticated grants are revoked. That is the 101 pattern.

-- ── conversation_reports ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The slug of the reported party, which is what the modal sends. Not a FK:
  -- the reported account may be deleted and the report must outlive it.
  other_party       TEXT NOT NULL,
  conversation_id   TEXT,
  reason            TEXT NOT NULL,
  -- Triage state, so this can become a queue without another migration.
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_reports_open_idx
  ON public.conversation_reports(created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS conversation_reports_reporter_idx
  ON public.conversation_reports(reporter_user_id);

-- ── user_blocks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Slug, not user id: the block route receives `otherParty` as a slug and a
  -- blocked party may have no account at all (an anonymous enquiry sender).
  blocked_slug     TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The route upserts with onConflict "blocker_user_id,blocked_slug", so this
  -- pair MUST be the conflict target or every re-block errors.
  PRIMARY KEY (blocker_user_id, blocked_slug)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks(blocked_slug);

-- ── placement_record_versions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.placement_record_versions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- placements.id is TEXT, not uuid.
  placement_id           TEXT NOT NULL,
  -- placement_records.id IS a uuid. Nullable because the route passes
  -- `existing.id || null`.
  version_of_record_id   UUID,
  changed_by_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_role        TEXT NOT NULL CHECK (changed_by_role IN ('artist', 'venue')),
  -- The whole previous row, so a dispute can be settled from the snapshot
  -- rather than from a diff nobody kept the other side of.
  snapshot               JSONB NOT NULL,
  changed_fields         TEXT[] NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS placement_record_versions_placement_idx
  ON public.placement_record_versions(placement_id, created_at DESC);

-- ── Lockdown ─────────────────────────────────────────────────────────
-- RLS on with NO policy: the only writers hold the service key, which bypasses
-- RLS, so this denies everything else by default. The REVOKE matters separately:
-- Supabase grants anon and authenticated explicitly rather than through PUBLIC,
-- so RLS alone would still leave a table-level grant standing.
ALTER TABLE public.conversation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_record_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.conversation_reports FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.user_blocks FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.placement_record_versions FROM anon, authenticated, PUBLIC;

GRANT ALL ON TABLE public.conversation_reports TO service_role;
GRANT ALL ON TABLE public.user_blocks TO service_role;
GRANT ALL ON TABLE public.placement_record_versions TO service_role;

NOTIFY pgrst, 'reload schema';
