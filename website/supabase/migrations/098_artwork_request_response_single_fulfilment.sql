-- 098_artwork_request_response_single_fulfilment.sql
--
-- E22, the schema half. POST /api/artwork-requests/[id]/fulfill had no status or
-- idempotency gate, so every replay minted a fresh artifact: a new
-- purchase_offers row at status 'accepted' (independently payable) or a new
-- pending placements row. The ids embed Date.now(), so rapid replays are always
-- distinct and no existing constraint caught them.
--
-- The code-side gate ships in the same commit. This file is the belt and braces
-- the code cannot provide: two concurrent requests can both pass a read-side
-- check, and only a unique index stops both from inserting.
--
-- ── Migration number ────────────────────────────────────────────────────────
-- D1's table allocates 074-079 to `02`, 080-089 to `04`, 090-094 to `07`,
-- 095-097 to `09`, and reserves 098+. It gives `01` NO range, presumably because
-- `01` was assumed to be code-only; E22 needs schema. Taking the first reserved
-- number rather than borrowing another doc's range, which would break D1's
-- disjointness guarantee. Noted in PROGRESS.md as a gap in D1.
--
-- ── Verified against prod before writing ───────────────────────────────────
--   source_response_id            absent from BOTH purchase_offers and placements
--   responses status CHECK        'sent','accepted','declined','countered','withdrawn'
--                                 → no 'fulfilled', so the code's compare-and-set
--                                   update would have failed silently. This is
--                                   why the migration ships FIRST (01 §E22.6).
--   artwork_requests              6 rows, 0 fulfilled
--   artwork_request_responses     3 rows, 1 accepted
--
-- So there are NO existing duplicates to reconcile. 01 §E22.6 expected the
-- duplicate query to be "non-empty in production given the bug has been live";
-- it is empty, because the bug is live but has not been triggered. The unique
-- indexes can therefore be created directly, with no backfill decision.

-- ════════════════════════════════════════════════════════════════════
-- Provenance columns: which response produced this artifact
-- ════════════════════════════════════════════════════════════════════
-- Deliberately nullable and un-backfilled. Existing offers and placements were
-- created by other paths (direct offer, placement request, counter) and genuinely
-- have no source response, so NULL is the correct value rather than a gap. The
-- partial indexes below ignore NULLs, so those rows are unconstrained.
alter table public.purchase_offers
  add column if not exists source_response_id uuid
  references public.artwork_request_responses(id) on delete set null;

alter table public.placements
  add column if not exists source_response_id uuid
  references public.artwork_request_responses(id) on delete set null;

comment on column public.purchase_offers.source_response_id is
  'The artwork_request_responses row this offer was minted from, when it came via the fulfil route. NULL for offers created any other way. Uniquely indexed so one response can never mint two payable offers (E22).';

comment on column public.placements.source_response_id is
  'The artwork_request_responses row this placement was minted from, when it came via the fulfil route. NULL otherwise (E22).';

-- ════════════════════════════════════════════════════════════════════
-- One artifact per response, enforced by the database
-- ════════════════════════════════════════════════════════════════════
-- Partial, so the many legitimately-NULL rows do not collide with each other.
create unique index if not exists uniq_purchase_offers_from_response
  on public.purchase_offers (source_response_id)
  where source_response_id is not null;

create unique index if not exists uniq_placements_from_response
  on public.placements (source_response_id)
  where source_response_id is not null;

-- ════════════════════════════════════════════════════════════════════
-- Widen the response status CHECK to accept 'fulfilled'
-- ════════════════════════════════════════════════════════════════════
-- The code advances the response to 'fulfilled' with a compare-and-set so the
-- 'accepted' gate cannot pass twice. Without this the UPDATE violates the CHECK,
-- and because the route does not await that write into its response, it would
-- fail SILENTLY and leave the whole idempotency scheme inert.
--
-- Strict superset of the existing five values, so no live row can be
-- invalidated. Verified: all 3 response rows are within the old set.
alter table public.artwork_request_responses
  drop constraint if exists artwork_request_responses_status_check;

alter table public.artwork_request_responses
  add constraint artwork_request_responses_status_check
  check (
    status = any (
      array[
        'sent'::text,
        'accepted'::text,
        'declined'::text,
        'countered'::text,
        'withdrawn'::text,
        'fulfilled'::text
      ]
    )
  );

notify pgrst, 'reload schema';
