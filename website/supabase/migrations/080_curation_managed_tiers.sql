-- 080_curation_managed_tiers.sql
--
-- T10: the managed curation tiers were unsellable.
--
-- curation_requests.tier carried a CHECK permitting only the three one-off tiers
-- (single_wall, full_space, bespoke), while api/curation/route.ts has accepted
-- managed_monthly and managed_quarterly for some time and inserts the submitted
-- value directly. Any managed sign-up therefore violated the constraint and the
-- route returned a 500, so £79.99/month and £199.99/quarter could never be sold.
--
-- EXECUTION-DECISIONS D0 rules "fix, don't remove": widen the CHECK. 08 §7.2's
-- "remove managed tiers" is void.
--
-- Safe on live data: verified before applying that curation_requests holds 2 rows,
-- both single_wall, so the widened constraint validates without touching them. The
-- new set is a strict superset of the old one, so no existing row can be
-- invalidated by this change.
--
-- Idempotent: drops the constraint by name if present, then re-adds it. Dropping a
-- CHECK constraint does not touch row data.

alter table public.curation_requests
  drop constraint if exists curation_requests_tier_check;

alter table public.curation_requests
  add constraint curation_requests_tier_check
  check (
    tier = any (
      array[
        'single_wall'::text,
        'full_space'::text,
        'bespoke'::text,
        'managed_monthly'::text,
        'managed_quarterly'::text
      ]
    )
  );
