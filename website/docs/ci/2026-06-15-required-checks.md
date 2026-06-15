# Required CI checks — apply by hand (Phase 6)

The Phase 6 remediation finalises the guardrails as required CI gates. The
change to `.github/workflows/ci.yml` could not be pushed from the automated
session: GitHub refuses workflow-file changes from a token without the
`workflow` OAuth scope. Apply the change below with a `workflow`-scoped token (a
normal local `git push` from a maintainer works), then set branch protection.

## 1. Update `.github/workflows/ci.yml`

Two changes to the `check` job, plus one new `advisors` job.

### a. Make lint blocking and add the dependency-cruiser step

In the `check` job, replace the lint step:

```yaml
      # BEFORE
      - run: npm ci
      # Lint surfaces pre-existing React Compiler warnings — informational
      # only until the backlog is cleared. Flip to blocking once green.
      - name: Lint (informational)
        run: npm run lint
        continue-on-error: true
      - run: npm run typecheck
      - run: npm run test
```

with:

```yaml
      # AFTER
      - run: npm ci
      # Lint is blocking. The custom guardrail rules (no-raw-or-filter,
      # no-inline-admin-check, no-unawaited-critical-sideeffect, no-ad-hoc-cap,
      # no-redirect-param) are at error, so reintroducing a collapsed bug-class
      # fails CI. Pre-existing React Compiler warnings do not block (eslint
      # exits 0 on warnings; only errors fail the run).
      - name: Lint
        run: npm run lint
      # Dependency boundaries (dependency-cruiser): forbids the service-role
      # client reaching client code, etc. At error.
      - name: Dependency boundaries
        run: npm run depcheck
      - run: npm run typecheck
      - run: npm run test
```

Lint is safe to make blocking: `npm run lint` currently exits 0 (0 errors; the
~122 React Compiler warnings do not fail eslint).

### b. Add the advisor-regression job

Append this job (it inherits `defaults.run.working-directory: website`):

```yaml
  # ─── Supabase advisor regression guard. Fails if a NEW security lint
  #     appears versus scripts/audit/baseline-advisors.json (and not in
  #     known-acceptable.json). Skips itself with a warning until the
  #     SUPABASE_ACCESS_TOKEN secret is configured. ───
  advisors:
    name: supabase advisor regression
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: check
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: website/package-lock.json
      - run: npm ci
      - name: Advisor regression check
        run: |
          if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
            echo "::warning::SUPABASE_ACCESS_TOKEN secret not set; skipping the Supabase advisor regression check. Add it in Settings > Secrets and variables > Actions to enable this gate."
            exit 0
          fi
          npm run audit:advisors
```

## 2. Add the `SUPABASE_ACCESS_TOKEN` secret

Create a Supabase personal access token at
https://supabase.com/dashboard/account/tokens and add it under
Settings > Secrets and variables > Actions as `SUPABASE_ACCESS_TOKEN`. Until
then the `advisors` job skips itself (it will not fail the build).

The advisor baseline is already seeded in
`scripts/audit/baseline-advisors.json` (32 current security lints), so once the
secret is set the regression check passes against the accepted state and fails
only on genuinely new security lints.

## 3. Enable branch protection on `main`

Settings > Branches > add a rule for `main` requiring these status checks to
pass before merge:

- `lint + typecheck + unit` (the `check` job, now including depcheck)
- `build + playwright smoke` (the `e2e` job)
- `supabase advisor regression` (the `advisors` job)

That makes the collapsed-bug-class guardrails un-bypassable on `main`.
