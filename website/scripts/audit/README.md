# Audit scripts

`npm run audit:full` runs three layers of regression guard:

1. **`npm run check`** — lint + typecheck + vitest (already existed).
2. **`npm run audit:advisors`** — fetches Supabase security + performance lints for project `uwkuhygwvasdzwsusiym`, diffs against `baseline-advisors.json`, exits non-zero on any new lint that isn't in `known-acceptable.json`.
3. **`npm run audit:e2e-security`** — Playwright suite at `tests/e2e/security-no-leaks.spec.ts` that hits production-shaped endpoints from an unauthenticated client and asserts paywalled / private fields stay redacted.

## First-time setup

You need a Supabase Personal Access Token to call the advisor API. Create one at https://supabase.com/dashboard/account/tokens, then:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxx
# Seed the baseline from the current state of prod
npx tsx scripts/audit/snapshot-advisors.ts
cp scripts/audit/security-current.json scripts/audit/baseline-advisors.json
git add scripts/audit/baseline-advisors.json
git commit -m "chore(audit): seed real Supabase advisor baseline"
```

After that, `npm run audit:advisors` works locally and in CI (the GitHub Actions workflow reads `SUPABASE_ACCESS_TOKEN` from repo secrets — add the secret in Settings > Secrets and variables > Actions).

## When fixing a bug surfaces in advisors

After applying a migration that should reduce the lint count:

```bash
npm run audit:advisors       # confirms the fixed lint is gone, no new ones added
# re-baseline so future PRs can't reintroduce the fixed lint without it counting as new:
cp scripts/audit/security-current.json scripts/audit/baseline-advisors.json
git add scripts/audit/baseline-advisors.json
git commit -m "chore(audit): re-baseline after <phase> fix"
```

## Files

- `snapshot-advisors.ts` — fetches advisor lints from the Supabase Management API
- `check-regressions.ts` — diffs `security-current.json` vs `baseline-advisors.json` and `known-acceptable.json`
- `check-regressions.test.ts` — vitest coverage for `findNewLints`
- `baseline-advisors.json` — frozen snapshot of accepted lints (re-baseline after each phase fix)
- `known-acceptable.json` — cache_keys we explicitly accept forever (e.g. `rls_enabled_no_policy` on service-role-only tables documented in `docs/security/service-role-only-tables.md`)
- `security-current.json` — gitignored, written by `snapshot-advisors.ts`, consumed by `check-regressions.ts`
- `performance-current.json` — gitignored, same shape, perf lints
