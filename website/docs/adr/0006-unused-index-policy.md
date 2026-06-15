# ADR 0006 - Unused-index policy (pre-launch retain, post-launch re-evaluate)

**Status:** Accepted  
**Date:** 2026-06-15

---

## Context

The Supabase performance advisor flags roughly 79 indexes on the production project (`uwkuhygwvasdzwsusiym`) as "unused" (zero recorded scans). Bug 42 from the 44-bug cleanup raised the same point, citing 104 unused indexes. The instinct is to drop them to cut write overhead and storage.

Investigation on 2026-06-15 changed the picture. Querying `pg_stat_user_indexes` directly showed:

- Every flagged index is tiny: 8-16 kB, which means the underlying tables are nearly empty.
- Index statistics were last reset on 2026-03-30, and over that window almost the entire schema shows zero scans.
- There are no duplicate indexes (no two indexes covering the same column set on the same table).

In other words, the project is still pre-launch / very low traffic. On a database that has barely been queried, "zero scans" overwhelmingly means *the query path has not run yet*, not *the index is useless*. The flagged indexes back foreign keys and known filter/sort patterns (status, created_at, owner ids, slugs). Postgres does not auto-index foreign-key columns, so these were added deliberately and will be exercised once real traffic arrives. Dropping them now would trade a negligible saving (the whole set is around 1 MB) for a real risk of slow joins and cascade deletes after launch.

A blanket "drop everything the advisor flags" would therefore be the wrong call here, even though it would make the advisor report look clean.

---

## Decision

1. **Drop only genuinely-redundant indexes**, where redundancy is independent of traffic. Two prefix-redundant indexes qualified, each a strict leading-column prefix of a wider index on the same table, so the wider index already serves every query the narrow one could:
   - `walls.walls_user_idx`, covered by `walls_user_owner_type_idx` (which has 215 live scans).
   - `placement_reviews.idx_placement_reviews_placement`, covered by `idx_placement_reviews_unique`.

   These are dropped in migration `072_drop_redundant_indexes.sql`.

2. **Retain the remaining zero-scan indexes** for now. They are intentional FK / query-pattern indexes whose zero-scan status reflects pre-launch traffic, not uselessness.

3. **Re-evaluate post-launch.** Once the site has carried representative traffic for a meaningful window (suggest at least a few weeks after launch, ideally after deliberately resetting the index stats at launch with `SELECT pg_stat_reset()`), re-run `scripts/audit/unused-indexes.sql`. Any index still at zero scans after real usage is a genuine candidate to drop, by the same branch-validate-then-apply process used here.

4. **Accept the advisor's unused-index lints in the meantime.** They are informational and expected for a pre-launch database. The advisor baseline (`scripts/audit/baseline-advisors.json` / `known-acceptable.json`) records them so the regression check does not treat them as new findings.

---

## Consequences

### Positive

- Two redundant indexes are gone, with zero read-path cost, reducing write amplification on `walls` and `placement_reviews`.
- The foreign-key and query-pattern indexes the app will rely on after launch are preserved, so launch-day performance is not sacrificed for a clean advisor report.
- The re-evaluation query is committed, so the post-launch follow-up is a one-command check rather than a fresh investigation.

### Negative / accepted

- The performance advisor will continue to report the retained indexes as unused until they are exercised by real traffic. This is accepted and documented rather than silenced by dropping them.

### Follow-up owned by the team

- After launch, reset index stats, let representative traffic accumulate, run `scripts/audit/unused-indexes.sql`, and drop anything still genuinely unused.
