-- Unused-index re-evaluation query (Bug 42 / ADR 0006).
--
-- Run this against production AFTER the site has carried representative traffic
-- for a meaningful window. For a clean signal, reset index stats at launch
-- (SELECT pg_stat_reset();) so the scan counts below reflect real post-launch
-- usage rather than pre-launch noise.
--
-- It lists indexes that have had ZERO scans and are NOT a primary key, unique
-- index, or constraint-backing index (those enforce data invariants and must
-- not be dropped). The `stats_reset` column tells you how long the window is,
-- so you can judge whether zero scans is meaningful yet. Anything that is still
-- here after real traffic is a genuine drop candidate; validate the DROP on a
-- Supabase branch first, then apply via migration (see 072 for the pattern).

SELECT
  s.relname            AS table_name,
  s.indexrelname       AS index_name,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()) AS stats_reset
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
  AND s.idx_scan = 0
  AND NOT i.indisprimary
  AND NOT i.indisunique
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conindid = s.indexrelid
  )
ORDER BY pg_relation_size(s.indexrelid) DESC, s.relname;
