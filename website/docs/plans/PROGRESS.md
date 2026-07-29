# Remediation progress log

Working branch: `claude/wallplace-remediation-loop-b4984a` · started 2026-07-29
Order of work: the "Corrected dependency order" at the end of
`2026-07-11-EXECUTION-DECISIONS.md` (binding). One task per iteration.

## Ledger

| # | Task | Owner doc | Status |
|---|---|---|---|
| 0a | CI `continue-on-error` removed, lint blocks | runbook §1.1 | **done** (47cb468) |
| 0b | `audit:advisors` job added to CI | runbook §1.1 | **done** (6615736), needs the repo secret before merge |
| 0c | `audit:e2e-security` covered in CI | runbook §1.1 | **done** (fa9416e), premise was wrong, gate meaningfulness is an open owner decision |
| 0d | Branch protection requiring `check` + `e2e`; apply pending workflow change in `docs/ci/2026-06-15-required-checks.md` | runbook §1.1 | **owner only, and BLOCKED**: `e2e` is red on main (10 failures), so requiring it would block every merge |
| 1 | `02` prereqs: base schema committed, K10 renumber (D2), reconcile | `02` §8.3 | todo, blocks all new migrations |
| 2 | Vehicles: `06 A1–A7` `writable-fields.ts` + `01 Phase A` `authz.ts` | `06`, `01` | todo |
| 3 | Route fixes `01 Phase B–D`, `06 A2/B` (E32+E44 chain) | `01`, `06` | todo |
| 4 | `074` RLS closure, all five leaks + `/apply` service-role switch **same commit** | `02` §11 | todo |
| 5 | G-A / G-B public PII projections (Bug 1, Bug 5) | D8 | todo |
| 6 | `07 §13.2` `parseDimensions` collapse (pulled forward) | `07` | todo |
| 7 | `04` payments Phase 0→9 (D4 Bug 15, G-C Bug 10, curation 7.0 at Phase 0) | `04` | todo |
| 8 | `05` frontend saves + listing (after D10 fixes) | `05` | todo |
| 9 | `03` auth/admin, D5 order: create+backfill `admin_users` **before** dropping the `user_metadata` conjunct | `03` | todo |
| 10 | `09` emails (artist-sale trigger first, provisioning dropped per D9) | `09` | todo |
| 11 | `07` K5a/K5b before `08` PR#2; `09 §4.1` harness before `08` PR#5 | `07`, `09` | todo |
| 12 | `08` rewritten cull last (D6 unconditional list only until rewritten) | `08` | todo |

Owner actions blocking a merge, added as they surface:

- **Add the `SUPABASE_ACCESS_TOKEN` repo secret** (Settings > Secrets and
  variables > Actions), a Supabase personal access token from
  https://supabase.com/dashboard/account/tokens. The `advisors` job added in 0b
  fails on every PR until it exists.

Human-owned, not code (do not attempt): D11 reconciliation of `off_1778` £33 and
`off_1779` £27 against Stripe; all Stripe dashboard work (Connect activation,
products/prices, the "Wallspace" to "Wallplace" rename); the `08` rewrite
decisions beyond the D6 unconditional list.

---

## Iteration 1 — 2026-07-29

### Setup: the plan docs did not exist on this branch

The three docs the loop is told to read every iteration were absent from this
worktree and from every commit in the repo. Found them untracked in a sibling
worktree, `.claude/worktrees/reverent-williamson-febcec` (branch
`claude/wallplace-stress-test-035bd9`, same head commit 356cd37): the four
`2026-07-11-*.md` docs plus `implementation/01`–`09`. Copied them in and
committed as **8c3ba1e**; the originals were left untouched. Also ran `npm ci`,
this worktree had no `node_modules`.

Note for anyone reading the doc map: the runbook's table lists `implementation/01`
through `08`, but there are nine docs. `09-emails.md` exists and is referenced
throughout `EXECUTION-DECISIONS` (D7, D9, dependency-order steps 10 and 11). The
runbook's map is the stale one.

### Task 0a — lint blocks CI

Owner: `2026-07-11-MASTER-RUNBOOK.md` §1.1, first row. D7 assigns the flag to
"runbook Task 0" over the competing claims in `07` Ph0 and `09` §4.4.

**Changed:** `.github/workflows/ci.yml` — dropped `continue-on-error: true` from
the lint step, renamed the step from "Lint (informational)" to "Lint", and
replaced the now-false comment.

**Test added:** `website/tests/integration/ci-lint-blocking.test.ts`. It parses
the step that runs `npm run lint` out of the workflow YAML and asserts the step
carries no `continue-on-error`. Follows the repo convention of a guard plus an
integration test in `tests/integration/`.

**Verification, both directions.**

Before the fix (test isolates exactly the right three lines):

```
AssertionError: expected '      - name: Lint (informational)\n …' not to match /continue-on-error/
+ Received:
"      - name: Lint (informational)
        run: npm run lint
        continue-on-error: true"
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

After the fix:

```
 ✓ tests/integration/ci-lint-blocking.test.ts (2 tests) 1ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

Full gate, `cd website && npm run check`:

```
=== npm run check EXIT = 0 ===
 Test Files  127 passed (127)
      Tests  1157 passed (1157)
```

Not run: `audit:advisors` (no DB change this iteration) and the Stripe drive (no
payment change).

**Commit:** 47cb468

### What the plan got wrong

1. **The runbook's precondition was unnecessary.** §1.1 says to "clear the React
   Compiler warning backlog, then flip to blocking", implying the flag could not
   come off yet. Measured: `npm run lint` exits **0** with 122 problems, all
   warnings, 0 errors. eslint only exits non-zero on errors, so the flag could
   have come off at any point and the backlog is a separate cleanup. Flipping it
   now is what makes `no-raw-arrangement-type` (raised to error by PR #65) able to
   fail a build for the first time.
2. **Deliberately not done:** adding `--max-warnings 0`. That would fail CI on the
   122-warning backlog immediately. Lint blocks on errors only, which is what
   Task 0 asks for.
3. **Task 0 is three gaps, not one.** The loop prompt frames Task 0 as the flag
   alone; the runbook's §1.1 table also wants an `audit:advisors` CI job and
   `audit:e2e-security` coverage. Tracked above as 0b and 0c, next in line. 0d
   (branch protection, the pending required-checks workflow change) needs GitHub
   settings access and a token with `workflow` scope, so it stays with the owner.

---

## Iteration 2 — 2026-07-29

### Task 0b — advisor regression gate in CI

Owner: `2026-07-11-MASTER-RUNBOOK.md` §1.1, row 2 ("Advisor checks not in CI").

**Changed:** `.github/workflows/ci.yml` — new `advisors` job (`needs: check`,
10-minute timeout) running `npm run audit:advisors` with
`SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}`. The workflow-level
`defaults.run.working-directory: website` applies, which the script needs since it
resolves `scripts/audit` from `process.cwd()`.

**Test added:** renamed `tests/integration/ci-lint-blocking.test.ts` to
`ci-gates.test.ts` (one file owning the CI workflow invariants rather than one per
gate, `git mv` so history follows) and added three assertions: a step runs
`npm run audit:advisors`, that step carries no `continue-on-error`, and its job
passes the token from repo secrets.

**Verification, both directions.**

Before the fix, the three new assertions fail while the two lint ones still pass:

```
 FAIL  tests/integration/ci-gates.test.ts > CI advisor gate > passes SUPABASE_ACCESS_TOKEN from repo secrets to the advisor job
Error: no step in ci.yml runs `npm run audit:advisors`
 Test Files  1 failed (1)
      Tests  3 failed | 2 passed (5)
```

After:

```
 ✓ tests/integration/ci-gates.test.ts (5 tests) 2ms
      Tests  5 passed (5)
```

Cross-checked with a real YAML parser rather than trusting the regex helpers:

```
jobs: ['check', 'advisors', 'e2e']
advisors.needs: check
advisors.env: {'SUPABASE_ACCESS_TOKEN': '${{ secrets.SUPABASE_ACCESS_TOKEN }}'}
advisors steps run: ['npm ci', 'npm run audit:advisors']
lint step: [{'name': 'Lint', 'run': 'npm run lint'}]
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  127 passed (127)
      Tests  1160 passed (1160)
```

**Commit:** 6615736

### What the plan got wrong, and one thing it could not know

1. **`snapshot-advisors.ts` lies about its own setup.** Its header says
   `SUPABASE_ACCESS_TOKEN` is "already exported in the developer's ~/.zshrc for
   this project". It is not:

   ```
   SUPABASE_ACCESS_TOKEN NOT SET
   ...
   > tsx scripts/audit/snapshot-advisors.ts && tsx scripts/audit/check-regressions.ts
   SUPABASE_ACCESS_TOKEN not set
   AUDIT EXIT = 2
   ```

   So `npm run audit:advisors` cannot run in this environment at all, which
   matters for the DB tasks ahead: the loop's per-iteration procedure asks for an
   advisor run on every DB/RLS task, and that will exit 2 until the token is
   available. The direct `pg_policies` assertion (which the procedure rightly
   calls the real evidence) still works over the Supabase MCP.
2. **The gate reads prod, not the PR.** Worth stating because it is not obvious
   from the runbook's one-line "add a job": the advisor API reports the state of
   project `uwkuhygwvasdzwsusiym`, so this job cannot pre-validate a migration
   that has not been applied yet, and unrelated PRs go red if prod drifts. It
   matches the plan's actual workflow (apply to live via MCP during the task,
   then open the PR), so PR placement is right, but it is a drift detector rather
   than a per-PR check.
3. **The baseline is real, so the gate is meaningful:** 32 lints, names include
   `rls_enabled_no_policy`, `rls_policy_always_true`,
   `auth_leaked_password_protection`, plus a documented `known-acceptable.json`
   ignore list for the service-role-only tables.

---

## Iteration 3 — 2026-07-29

### Task 0c — security e2e in CI

Owner: `2026-07-11-MASTER-RUNBOOK.md` §1.1, row 3.

**The runbook's premise was wrong.** Row 3 says "`audit:e2e-security` exists but
CI only runs `test:e2e`", implying the security spec never runs in CI. It does.
`playwright.config.ts` sets `testDir: "./tests/e2e"` with no `testMatch`,
`testIgnore`, `grep` or `grepInvert`, so `npm run test:e2e` collects every spec in
that directory. Evidence:

```
  [chromium] › security-no-leaks.spec.ts:21:7 › ... › GET /api/venues/demand redacts paywalled fields
  [chromium] › security-no-leaks.spec.ts:33:7 › ... › GET /api/venues/:slug redacts postcode for anon callers
  [chromium] › security-no-leaks.spec.ts:41:7 › ... › GET /api/artwork-requests blocks anon, or redacts internal IDs
  [chromium] › security-no-leaks.spec.ts:57:7 › ... › Storage bucket message-attachments listing is not anon-accessible
Total: 31 tests in 5 files
```

So the runbook's own alternative ("or add the job explicitly") would have added a
second runner for a spec that already runs. Did not do it. Corrected the runbook
row instead.

**Changed:** `2026-07-11-MASTER-RUNBOOK.md` §1.1 row 3 rewritten with the
correction. `tests/integration/ci-gates.test.ts` gained a "CI security-e2e gate"
block: the CI step running the suite exists, the spec is still on disk under
`testDir`, and nothing (config-level or per-project) narrows collection.

**Verification.** These assertions pass immediately, since there was no gap to
fix, so a plain green run would prove nothing. Demonstrated teeth by mutating the
config, adding `testIgnore: ["**/security-no-leaks.spec.ts"]`:

```
   × CI security-e2e gate > does not narrow Playwright collection in a way that could drop the spec
     → testIgnore could exclude the spec: expected [ '**/security-no-leaks.spec.ts' ] to be undefined
      Tests  1 failed | 7 passed (8)
```

Reverted, clean (`git diff --stat playwright.config.ts` empty), and green again:

```
 ✓ tests/integration/ci-gates.test.ts (8 tests) 2ms
      Tests  8 passed (8)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  127 passed (127)
      Tests  1163 passed (1163)
```

**Commit:** fa9416e

### The bigger finding: CI has been red on main for over a month

Nothing in the plan mentions this, and it changes the Phase 0 exit criterion.
Every run in `gh run list` is a failure, including the pushes to `main` for PRs
63, 64 and 65. `check` passes; **`e2e` fails**. Run 27908014082 (main, 2026-06-21):
`10 failed, 9 skipped, 12 passed`. The distinct failures:

```
a11y              :63   /pricing — no critical or serious axe violations
a11y              :68   /checkout — no critical or serious axe violations
a11y              :73   /checkout/confirmation — no critical or serious axe violations
a11y              :78   /cookies — no critical or serious axe violations
security-no-leaks :33   GET /api/venues/:slug redacts postcode for anon callers
security-no-leaks :41   GET /api/artwork-requests blocks anon, or redacts internal IDs
security-no-leaks :57   Storage bucket message-attachments listing is not anon-accessible
tap-targets       :69   /pricing — all interactive elements >= 44 x 44 px
tap-targets       :74   /checkout — all interactive elements >= 44 x 44 px
tap-targets       :81   /cookies — all interactive elements >= 44 x 44 px
```

Two separate causes:

1. **7 real product failures (a11y + tap targets)** that Phase 5 was supposed to
   close. PR 61 (`claude/remediation-p5-mobile-a11y`) merged, yet `/pricing`,
   `/checkout`, `/checkout/confirmation` and `/cookies` still fail. The a11y ones
   are colour contrast on the brand accent `#c17c5a`: white on accent is 3.33:1 and
   accent on the warm backgrounds is 3.01 to 3.04:1, against a 4.5:1 requirement.
   Fixing that properly means changing the accent colour or its usage, which is a
   brand decision, not a mechanical fix.
2. **3 environmental security failures.** CI runs with
   `NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co`, so:

   ```
   :33  Expected: 200   Received: 404      (the-copper-kettle-demo does not exist without a DB)
   :41  Expected: 200   Received: 500      (route cannot reach Supabase)
   :57  Error: apiRequestContext.post: getaddrinfo ENOTFOUND placeholder.supabase.co
   ```

   These are **not leaks**. The suite's own header says to run it with
   `E2E_BASE_URL=https://www.wallplace.co.uk`. In CI it asserts against an app with
   no data, so it can neither pass honestly nor detect a real leak.

**Consequences for the plan:**

- **0d is blocked, not merely owner-owned.** Branch protection requiring `e2e`
  would block every merge while these 10 failures stand.
- **Phase 0's exit criterion ("a failing lint rule actually fails CI") is met**,
  but the runbook's implicit assumption that CI is otherwise green is false.
- The security gate is currently theatre in CI for the opposite reason to the one
  Task 0 anticipated: it runs, but against an empty app.

**Open owner decision (asked 2026-07-29, iteration 3):** how the security suite
should get a meaningful CI verdict. The options, none of which I should pick
unilaterally because each changes what CI touches externally: give CI the real
Supabase URL and anon key as secrets (points per-PR CI at prod data); run the
suite against the deployed site post-deploy or on a schedule instead of per PR;
make it skip loudly when Supabase is a placeholder (honest, but no CI coverage);
or seed a dedicated test Supabase project.
