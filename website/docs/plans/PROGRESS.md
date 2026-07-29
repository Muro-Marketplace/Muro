# Remediation progress log

Working branch: `claude/wallplace-remediation-loop-b4984a` · started 2026-07-29
Order of work: the "Corrected dependency order" at the end of
`2026-07-11-EXECUTION-DECISIONS.md` (binding). One task per iteration.

## Ledger

| # | Task | Owner doc | Status |
|---|---|---|---|
| 0a | CI `continue-on-error` removed, lint blocks | runbook §1.1 | **done** (47cb468) |
| 0b | Advisor in CI: nightly, not a PR gate | runbook §1.1, then D12 r3 | **done** (6615736 then corrected by 72adec9) |
| 0c | `audit:e2e-security` covered in CI | runbook §1.1 | **done** (fa9416e). Real creds ruled in by D13.1, blocked on the human adding secrets |
| 0d | Branch protection requiring `check` + `e2e` | runbook §1.1, D13.3 | **owner only, now UNBLOCKED**: suite is green locally. D13.3 phasing: require `check` now, add `e2e` once it is green on main, never require `advisors` |
| 0e | Go green on main (D14) | D14 | **done** (4f83d3a, f612159, edacda3, e38e698). Full suite exit 0: 0 failed, 13 skipped, 18 passed |
| 1 | `02` prereqs: base schema committed, K10 renumber (D2), reconcile | `02` §8.3 | **K10 renumber done** (800c02b). Reconcile §8.4 **void** (false premise). Base schema (X2/K11) **blocked**: no supabase CLI here |
| 2 | Vehicles + `01` Phase A | `06`, `01` | **Phase A complete** (8d99498, 9427aab, 3a73a80, eb2acd9). Guard at `warn`, flips to `error` as the Phase 2 exit |
| 3 | Route fixes `01 Phase B–D`, `06 A2/B` (E32+E44 chain) | `01`, `06` | **E32 done** (3999102). E44 next, then the rest of Phase B |
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

---

## Iteration 4 — 2026-07-29

### D12 arrived mid-iteration

The owner added **D12** to EXECUTION-DECISIONS while this iteration was running,
answering the iteration-3 escalation, and committed here as **a087e15** (their
words, not mine). Two consequences:

- **It overrules Task 0b.** Ruling 3: "Do NOT gate PRs on `audit:advisors`",
  because it cannot catch this codebase's leak class, fork PRs get no secrets, and
  a per-PR job holding a prod management token widens the blast radius. The
  blocking `advisors` job landed in 6615736 must become non-blocking or nightly.
  **That is the next task.** Ledger row 0b re-marked.
- **Ruling 2 unblocks advisor runs:** use the Supabase MCP `get_advisors` tool
  rather than the npm script, and say which path was used. Ruling 4: the missing
  token is not a blocker, do not re-escalate. Noted, and I won't.

### Task 1 — `02` prereqs

Owner: `implementation/02-rls-db-storage.md` §8 (X1/K10) and §9 (X2/K11), with D2
making §8.3 authoritative over `07 §10.4`.

#### Done: K10 renumber

**Changed:** four files renamed into free slots per §8.3, keeping the member of
each pair that has downstream references:

```
037_welcomed_at          -> 002_welcomed_at
044_cart_sessions        -> 017_cart_sessions
045_artist_charges_cache -> 068_artist_charges_cache
054_customer_addresses   -> 069_customer_addresses
```

Slots 002, 017, 068 and 069 were verified empty first. `git mv` throughout, so
history follows. Ten header lines corrected (the four renamed, plus six stale).

**Test added:** `tests/integration/migration-numbering.test.ts` — no repeated
numeric prefix, filenames on convention, and a header's declared number must match
its filename.

**Verification, both directions.** Before:

```
   × supabase migration numbering > uses every numeric prefix at most once
     → duplicate migration numbers:
   × supabase migration numbering > keeps each header's number in step with its filename
041_placement_reviews.sql declares 038
042_orders_fulfilment_method.sql declares 039
043_message_attachments.sql declares 040
044_feature_requests.sql declares 041
045_purchase_offers.sql declares 042
046_artwork_requests_and_commissions.sql declares 043: expected [ …(6) ] to deeply equal []
```

After, plus a direct check that no prefix repeats and no file was lost:

```
 ✓ tests/integration/migration-numbering.test.ts (4 tests) 8ms
      Tests  4 passed (4)
=== dup prefixes now ===
(empty above = no duplicates)
=== count ===
      73
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  128 passed (128)
      Tests  1167 passed (1167)
```

No SQL was executed against prod for this task. Renaming a file changes nothing in
the database.

**Commit:** 800c02b

#### Not done, and why: §8.4 reconcile is void

**The premise is false.** §8.4 says to insert `('002','welcomed_at')`,
`('017','cart_sessions')` and so on into `supabase_migrations.schema_migrations` so
the CLI skips the renamed files. Prod's ledger is not keyed that way:

```
total_rows | min_version    | max_version
        48 | 20260429222509 | 20260615042101
```

All 48 rows carry **14-digit timestamp** versions, i.e. everything was applied with
the MCP `apply_migration` path, not `supabase db push` of the numbered files.
Inserting a row keyed `'002'` would add a junk key that matches nothing. I did not
run it, and I am not going to without a decision, because the underlying situation
is much worse than the renumbering:

- **The repo's migration files and prod's ledger have completely diverged.** Local
  versions are `NNN`; remote versions are timestamps. `supabase migration list
  --linked` would therefore call **all 73** local files unapplied, and a
  `supabase db push` would try to re-run every one of them against prod. That
  hazard exists independently of K10 and is not described anywhere in the plan.
- Only 48 of 73 files appear at all, and the names do not line up either:
  `070_qa44_db_hardening.sql` is one local file but ten `qa44_*` rows in prod,
  `072`/`073` are recorded without their number prefixes, and
  `071_defence_in_depth_venue_pii` is recorded **twice**.
- **§8.2's stated bug never bit prod.** "Two files claiming version 037 means the
  second insert conflicts" is only true for a fresh `db push` bootstrap. Prod's
  timestamp keys never collided.

The ledger names also confirm where the stale headers came from. Prod recorded
`038_placement_reviews`, `039_orders_fulfilment_method`, `040_message_attachments`,
`041_feature_requests`, `042_purchase_offers` and
`043_artwork_requests_and_commissions` — exactly the six stale header numbers,
each three below its filename. Whoever applied them used the header, not the
filename. Mapping worth keeping:

| File (now) | Applied to prod as |
|---|---|
| `041_placement_reviews.sql` | `038_placement_reviews` |
| `042_orders_fulfilment_method.sql` | `039_orders_fulfilment_method` |
| `043_message_attachments.sql` | `040_message_attachments` |
| `044_feature_requests.sql` | `041_feature_requests` |
| `045_purchase_offers.sql` | `042_purchase_offers` |
| `046_artwork_requests_and_commissions.sql` | `043_artwork_requests_and_commissions` |

**Needs an owner decision** (recorded, not blocking the next tasks): whether to
rewrite prod's ledger to match the numbered files, adopt timestamps locally, or
accept that the numbered files are documentation and prod is managed via MCP. The
third is closest to current reality and costs nothing, but it means never running
`supabase db push` against prod again. Nothing in the queue ahead needs this
resolved, because 074 will be applied via MCP like everything else.

#### Blocked: base schema (X2/K11)

§9.3 wants `000_base_schema.sql` produced by `supabase db dump --linked`. Not
possible here:

```
=== supabase CLI? ===
supabase not found
(no supabase config.toml / link state)
```

No CLI, no link state, and no DB password available to link with. Recorded as
blocked rather than faked from `information_schema`, which would produce a
plausible file that is not a real dump.

### Baseline: the five live RLS leaks, and a correction to D12's gate

Ran D12's canonical assertion via MCP before touching anything, as the pre-074
baseline. **It returns 4 rows, not 5:**

```
artist_applications  | Authenticated users can read applications | (auth.role() = 'authenticated'::text)
waitlist_signups     | Authenticated can read waitlist           | (auth.role() = 'authenticated'::text)
contact_submissions  | Authenticated can read contact            | (auth.role() = 'authenticated'::text)
venue_registrations  | Authenticated can read venue reg          | (auth.role() = 'authenticated'::text)
```

`enquiries` is missing because its leak is a different shape, confirming D3:

```
enquiries | Artists can read their enquiries | SELECT | PERMISSIVE | true
enquiries | Users can read own enquiries     | SELECT | PERMISSIVE | ((sender_email = (auth.jwt() ->> 'email')) OR (auth.role() = 'service_role'))
```

So **D12's assertion, used alone, would report zero rows while `enquiries` is still
world-readable.** Broadening it to include `btrim(qual) = 'true'` catches
`enquiries` but also picks up four *intentionally* public tables
(`artist_profiles`, `artist_works`, `artist_collections`, `venue_profiles`), which
are the public marketplace surface and must stay readable, so an unqualified
"zero rows" gate is unachievable. The assertion that actually works, and the one I
will use as Task 4's acceptance gate:

```sql
select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and cmd = 'SELECT'
  and (qual ilike '%auth.role()%authenticated%' or btrim(qual) = 'true')
  and tablename not in ('artist_profiles','artist_works','artist_collections','venue_profiles');
```

Today it returns exactly the five leaks, and must return zero rows after 074:

```
artist_applications | Authenticated users can read applications | (auth.role() = 'authenticated'::text)
contact_submissions | Authenticated can read contact            | (auth.role() = 'authenticated'::text)
enquiries           | Artists can read their enquiries          | true
venue_registrations | Authenticated can read venue reg          | (auth.role() = 'authenticated'::text)
waitlist_signups    | Authenticated can read waitlist           | (auth.role() = 'authenticated'::text)
```

### Also noted

`docs/plans/2026-05-02-B-checkout-payment-integrity.md` still refers to
`044_cart_sessions.sql` and `045_artist_charges_cache.sql` at their old numbers.
Left alone deliberately: it is a completed May plan and a historical record, and
editing it to match a July rename would falsify what was done at the time.

---

## Iteration 5 — 2026-07-29

### D12 ruling 3 + ruling 5 — advisor off the PR gate

Owner: `2026-07-11-EXECUTION-DECISIONS.md` D12, superseding runbook §1.1 row 2.
This reverses my own iteration-2 decision.

**Changed:**

- `.github/workflows/ci.yml` — `advisors` job removed, replaced by a comment
  pointing at the nightly workflow and the reason.
- `.github/workflows/advisors-nightly.yml` — new. `schedule: 0 3 * * *` plus
  `workflow_dispatch`, same job body, token from the repo secret.
- `website/scripts/audit/snapshot-advisors.ts` — ruling 5: the header claimed
  the token was "already exported in the developer's ~/.zshrc". Now says it must
  be exported manually or supplied by CI, that the script exits 2 without it, and
  that it runs only in the nightly workflow.
- `website/scripts/audit/README.md` — same correction, it described the advisor as
  a general CI check.

**Why nightly rather than `continue-on-error`.** D12 allows either. Nightly
answers all three of the ruling's reasons; `continue-on-error` only answers the
first, since the token would still be present in every PR run (reason c) and fork
PRs would still fail visibly (reason b). The nightly run also has no
`continue-on-error`, deliberately: it gates nothing, so a red nightly is the only
signal that exists.

**Verification, both directions.** Before, 3 of 10 fail:

```
   × advisor runs nightly, not as a PR gate (D12 ruling 3) > does not run the advisor in the PR-gating workflow
   × advisor runs nightly, not as a PR gate (D12 ruling 3) > runs the advisor on a schedule instead
     → advisors-nightly.yml is missing: expected '' to match /audit:advisors/
   × advisor runs nightly, not as a PR gate (D12 ruling 3) > passes SUPABASE_ACCESS_TOKEN from repo secrets
      Tests  3 failed | 7 passed (10)
```

After:

```
 ✓ tests/integration/ci-gates.test.ts (10 tests) 2ms
      Tests  10 passed (10)
```

Both workflows parse, with the advisor gone from the PR-gating one:

```
.github/workflows/ci.yml -> jobs: ['check', 'e2e'] | triggers: ['push', 'pull_request']
.github/workflows/advisors-nightly.yml -> jobs: ['advisors'] | triggers: ['schedule', 'workflow_dispatch']
```

Because I edited the assertion after watching it fail, I re-proved it by putting
`- run: npm run audit:advisors` back into ci.yml as executable YAML:

```
51:      - run: npm run audit:advisors
--- must FAIL now ---
   × advisor runs nightly, not as a PR gate (D12 ruling 3) > does not run the advisor in the PR-gating workflow
      Tests  1 failed | 9 passed (10)
--- reverted, must PASS ---
      Tests  10 passed (10)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  128 passed (128)
      Tests  1169 passed (1169)
```

**Commit:** 72adec9

### A mistake worth recording

My first version of the nightly workflow failed its own test. The assertion greps
for `continue-on-error`, and the workflow's explanatory comment contains the
phrase "there is no continue-on-error here". Fixed by stripping whole-line `#`
comments before matching, which is the more correct assertion anyway: prose cannot
silence a step. The same helper now guards the ci.yml comparison, which had been
passing only by luck (my comment happened to say "advisor" rather than
"audit:advisors").

---

## Iteration 6 — 2026-07-29

### Task 0e (D14) — go green on main, slice 1 of several

Owner: `2026-07-11-EXECUTION-DECISIONS.md` D14, method in D14.2.

#### Environment work needed first

- Created `website/.env.local` with the same placeholder values as ci.yml's e2e
  job, so the failures reproduce locally the way they do in CI. Gitignored
  (`.env*`), no real credentials.
- Dev server started via the harness preview (port 3099), not by hand.
- `npx playwright install chromium` **failed** with an opaque
  `Download failure, code=1`. Cause is the known Node/macOS TLS issue on this
  machine; `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem npx playwright install chromium`
  succeeded. Worth remembering: the installed browser was build 1228 while this
  Playwright (1.59.1) wants 1217, so every spec failed with
  "Executable doesn't exist ... chromium_headless_shell-1217" until this was fixed.

With that done, the local run reproduces CI exactly for these two specs:
**7 failed, 9 skipped**, matching CI's 10 (these 7 plus the 3 security).

#### D14.2 step 1 — the complete failing-node set

The spec reporter truncates to 3 nodes per violation, so I dumped the full set
directly. Node counts before any change: /pricing 7, /checkout 4,
/checkout/confirmation 4, /cookies 7 contrast nodes.

**Three findings that change D14's plan:**

1. **The failing nodes are mostly shared chrome, not page content.** The repeat
   offenders are the header Sign Up link, the footer newsletter Subscribe button,
   the floating Feedback button and a shared "Discover Art" CTA. D14.2 says to
   apply the token "only at those nodes ... on /pricing, /checkout,
   /checkout/confirmation, /cookies", but those nodes are global components, so
   the fix necessarily changes every page. Reading it as "only the failing nodes"
   rather than "only those four pages" is the only coherent interpretation.
2. **`/cookies` does NOT fail on contrast alone.** It also fails
   `link-in-text-block` (serious, 4 nodes): the inline `privacy@wallplace.co.uk`
   and `Privacy Policy` links are distinguished from body text by colour only, and
   carry `hover:underline` rather than a persistent underline. **Fixing contrast
   will not make /cookies pass.** D14 describes the /cookies failure as contrast
   only, so this was missed.
3. **One local-only false positive to ignore:** a `32x32` button with
   `aria-label="Open Next.js Dev Tools"` shows as an undersized tap target here.
   It is the dev overlay. CI runs `npm run build && npm run start`, so it does not
   exist there. Not a real failure, must not be "fixed".

#### Token derivation, done by measurement

Computed WCAG 2.1 ratios rather than trusting any asserted hex:

```
                     white on it   on #FFFFFF  on #FAFAF8  on #F7F4F0  on #F9F2EF
  #C17C5A (accent)      3.33          3.33        3.19        3.04        3.01   all fail
  #A8684A (hover)       4.43          4.43        4.24        4.04        4.00   all fail
  #9E664A                4.72          4.72        4.51        4.30        4.26   FAILS on tints
  #9C5F42                5.09          5.09        4.87        4.64        4.60   all pass
  #8A5439                6.16          6.16        5.90        5.66        5.61   all pass
```

D14.1's recommendation of `#9C5F42` holds, and its rejection of `#9E664A` was
right for a reason it did not give: the binding cases are the two tinted
backgrounds `#F7F4F0` and `#F9F2EF` (rendered `bg-accent/5` and `bg-accent/10`),
not `#FAFAF8`. `#9E664A` fails those at 4.30 and 4.26. On the tints `#9C5F42`
gives 4.60, so the real margin is 0.10 rather than D14.1's stated 4.87.

D14.1's extra finding was correct and is handled: every element moved to the new
token had a `hover:bg-accent-hover` partner sitting at 4.43, so a fix touching
only the base colour would have left non-compliant hover states. Added
`--color-accent-text-hover: #8A5439` and paired them.

**Changed:** `globals.css` (both tokens, with the measured table as a comment),
`Header.tsx`, `NewsletterForm.tsx`, `FeedbackBubble.tsx`,
`checkout/page.tsx`, `checkout/confirmation/page.tsx`.

**Verification against the real gate:**

```
  ✓  1 /checkout/confirmation — no critical or serious axe violations (989ms)
  ✓  3 /checkout — no critical or serious axe violations (993ms)
  ✘  2 /cookies — no critical or serious axe violations (1.1s)
  ✘  4 /pricing — no critical or serious axe violations (1.2s)
  2 failed, 4 skipped, 2 passed
```

Contrast node counts after: /checkout 4→**0**, /checkout/confirmation 4→**0**,
/pricing 7→5, /cookies 7→5. Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  128 passed (128)
      Tests  1169 passed (1169)
```

Visual check on /checkout: the darkened Sign Up and Discover Art still read as the
same warm terracotta family, and the cookie banner Accept keeps the original
`#C17C5A` since axe does not flag it.

**Commit:** 4f83d3a

#### Remaining for Task 0e

1. `/pricing` page nodes: "Get Started" (12px), the "Save 17%" badge (10px), the
   `th` "Premium" header (12px), "Wallplace Core" (14px), and the white-on-accent
   "Most Popular" badge (12px). In `pricing/page.tsx` and `ArtistPricingCards.tsx`.
2. `/cookies` page nodes: the "Required" badge plus four inline links, **and** the
   separate `link-in-text-block` rule, which needs a persistent underline rather
   than `hover:underline`.
3. Tap targets, four components: the pricing Monthly/Annual toggle (85x36,
   144x36), newsletter Subscribe (99x38), Feedback bubble (99x32), cookie banner
   Accept/Decline (80x38, 83x38).
4. D14.3 security skip-loudly guard.

---

## Iteration 7 — 2026-07-29

### Task 0e slice 2 — a11y now fully green on all four pages

Owner: D14.1 / D14.2.

**Changed:** `pricing/page.tsx` (the "Get Started" eyebrow, the comparison-table
`th` headers, the "Wallplace Core" row label), `ArtistPricingCards.tsx` (the
"Most Popular" badge and both "Save 17%" badges), `cookies/page.tsx` (the
"Required" badge and four inline links), `globals.css` (the `a` reset, see below).
SVG icons keep `#C17C5A` per D13.2, they are decoration.

**Verification:**

```
  ✓  3 /checkout/confirmation — no critical or serious axe violations (1.2s)
  ✓  4 /checkout — no critical or serious axe violations (1.2s)
  ✓  2 /cookies — no critical or serious axe violations (1.3s)
  ✓  1 /pricing — no critical or serious axe violations (1.3s)
  4 skipped, 4 passed
```

Contrast node counts across the two slices: /pricing 7→0, /checkout 4→0,
/checkout/confirmation 4→0, /cookies 7→0. Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  128 passed (128)
      Tests  1169 passed (1169)
```

### The root cause of link-in-text-block was a CSS layering bug

Adding `underline` to the /cookies links did **not** fix the rule. Measured the
computed style rather than guessing:

```
{ classes: "text-accent-text underline", color: "rgb(156, 95, 66)",
  textDecorationLine: "none",
  underlineUtilityCount: 5, hoverUnderlineCount: 0 }
```

`a { text-decoration: none }` in `globals.css` was **unlayered**. Unlayered CSS
wins over *every* layered rule regardless of specificity, and Tailwind v4 emits
utilities into `@layer utilities`. So `underline` and `hover:underline` have been
dead everywhere in this codebase, not just here. Moved the reset into
`@layer base`. After:

```
{ link: { classes: "text-accent-text underline", decoration: "underline", color: "rgb(156, 95, 66)" },
  navLinkDecoration: { text: "Wallplace", decoration: "none" } }
```

The utility now wins where it is asked for, and links without it stay undecorated,
so the reset still does its job.

**Visible side effect, flagged deliberately:** every `hover:underline` in the
codebase starts working. That is what those classes were written to do, but it is
a site-wide behaviour change rather than something confined to the four audited
pages. Worth a look during the next visual pass.

### A mistake, caught by re-measuring

There are two "Save 17%" badges. The flagged one is the toggle badge at
`ArtistPricingCards.tsx:102` (`rounded-full`, `tracking-wider`); I first changed
the card badge at `:153` (`rounded-sm`, `tracking-widest`), which axe never
flagged, and the failure survived. Re-running the audit caught it. Kept both
changes: `:153` is the same `#C17C5A` on `bg-accent/10` at 10px, so it fails the
same 4.5:1 bar whenever it renders, axe simply does not reach it in the default
state.

This is the second time this iteration that re-measuring beat assuming. The other
was `text-accent` on line 252 of `pricing/page.tsx`, which I had written off as a
different component before reading the file.

### Remaining for Task 0e

1. Tap targets, four components: pricing Monthly/Annual toggle (85x36, 144x36),
   newsletter Subscribe (99x38), Feedback bubble (99x32), cookie banner
   Accept/Decline (80x38, 83x38).
2. D14.3 security skip-loudly guard.

Still true from iteration 6: the `32x32 aria-label="Open Next.js Dev Tools"`
button is a dev-server artefact, absent from CI's production build. Not a target.

---

## Iteration 8 — 2026-07-29

### Task 0e slice 3 — tap targets, and all 7 product failures are closed

Owner: D13.2 / D14.2 step 5.

**Changed:** every failing control was wide enough and too short, so each gained
`min-h-11` (44px):

```
  ArtistPricingCards  Monthly toggle        85x36
  ArtistPricingCards  Annual toggle        144x36
  NewsletterForm      Subscribe             99x38
  FeedbackBubble      Feedback              99x32
  CookieBanner        Decline               83x38
  CookieBanner        Accept                80x38
```

The newsletter email input got it too. It is not a tap target under the spec's
selector, but it shares a flex row with Subscribe and would otherwise be 6px
shorter.

**Verified against a production build, deliberately not the dev server.** The dev
server injects a 32x32 "Open Next.js Dev Tools" button that fails the same
assertion and does not exist in CI, so a dev-server run could never go green and
would have been misleading evidence. `npm run build`, then `next start` on port
3098 via a new `wallspace-prod` launch config:

```
  ✓ /checkout/confirmation — no critical or serious axe violations (865ms)
  ✓ /checkout — no critical or serious axe violations (893ms)
  ✓ /cookies — no critical or serious axe violations (960ms)
  ✓ /pricing — no critical or serious axe violations (1.1s)
  ✓ /pricing — all interactive elements >= 44 x 44 px (530ms)
  ✓ /checkout — all interactive elements >= 44 x 44 px (302ms)
  ✓ /cookies — all interactive elements >= 44 x 44 px (326ms)
  9 skipped, 7 passed
```

**Full suite against the same build:**

```
  ✘ security-no-leaks.spec.ts:21  GET /api/venues/demand redacts paywalled fields
  ✘ security-no-leaks.spec.ts:33  GET /api/venues/:slug redacts postcode for anon callers
  ✘ security-no-leaks.spec.ts:41  GET /api/artwork-requests blocks anon, or redacts internal IDs
  3 failed, 10 skipped, 18 passed
```

CI's baseline was `10 failed, 9 skipped, 12 passed`. **All 7 product failures are
fixed**; the 3 that remain are the environmental security tests from D14.3.

```
=== npm run check EXIT = 0 ===
 Test Files  128 passed (128)
      Tests  1169 passed (1169)
```

**Commit:** edacda3

### Notes

- The webServer route did not work: with `CI=true` Playwright builds and serves
  itself, but the config hard-codes a 120s `webServer.timeout` and the build plus
  start exceeds that on this machine (`Error: Timed out waiting 120000ms from
  config.webServer`). Building first and serving through the harness is the
  reliable path, and is why `wallspace-prod` now exists in `.claude/launch.json`.
- Local run shows **10** skipped where CI shows 9. The extra one is the storage
  test, which does `test.skip(!ANON_KEY)` reading the *test process* environment.
  `.env.local` is loaded by Next, not by Playwright, so it skips here and runs (and
  fails on `ENOTFOUND`) in CI. Same underlying story either way.
- Locally `/api/venues/demand` fails too, where in CI it passed. Also
  environmental: the route cannot reach placeholder Supabase.

### Remaining for Task 0e

Only D14.3: the skip-loudly guard on `security-no-leaks.spec.ts`, so those 3 stop
failing for the wrong reason while still refusing to pass silently. After that the
suite is green except where the repo secrets are genuinely missing, which is the
human's step, and Task 0d's phased branch protection becomes possible.

---

## Iteration 9 — 2026-07-29

### Task 0e complete — full Playwright suite exits 0

Owner: D14.3, with the CI half from D13.1.

**Changed:**

1. `tests/e2e/security-no-leaks.spec.ts` — describe-level guard skipping when
   `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is unset or still
   a placeholder, with a reason naming both secrets and reporting what it saw.
2. Same file — requests now use Playwright's `baseURL` via relative paths.
3. `.github/workflows/ci.yml` — the `e2e` job prefers real secrets with a
   placeholder fallback.

**A defect the plan did not mention.** The spec hardcoded
`process.env.E2E_BASE_URL ?? "http://localhost:3000"` and ignored Playwright's
`baseURL` entirely, so it only worked when the server happened to be on port 3000.
That is why these three tests failed *locally* for a different reason than in CI:
in CI they reached a real server and got 404/500, whereas locally they were hitting
nothing at all on 3000. Switched to relative paths and dropped `E2E_BASE_URL` in
favour of `PLAYWRIGHT_BASE_URL`, which the config already reads, so there is one
mechanism rather than two.

**Why the `||` fallback in ci.yml.** A bare `${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}`
expands to `""` when the secret is absent, and `src/env.ts` requires a valid URL,
so the *build* would fail rather than the one spec that needs credentials. With the
fallback, a missing secret or any fork PR keeps the placeholder and the spec skips
loudly. Service-role key stays a placeholder: nothing in the e2e suite needs it and
a real one in CI would be a genuine escalation of blast radius.

**Verification, both directions.** Credentials absent:

```
  4 skipped
  SKIP REASON: no real Supabase credentials, so these assertions cannot detect a leak.
  Set the repo secrets NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
  (fork PRs never receive secrets, so they always land here).
  Saw NEXT_PUBLIC_SUPABASE_URL="(unset)", NEXT_PUBLIC_SUPABASE_ANON_KEY=(unset).
```

Credentials present (probe values, not real ones):

```
  ✓ GET /api/venues/demand redacts paywalled fields (14.4s)
  ✘ GET /api/venues/:slug redacts postcode ... Expected: 200  Received: 404
  ✘ GET /api/artwork-requests ...            Expected: 200  Received: 500
  ✘ Storage bucket message-attachments listing is not anon-accessible
  3 failed, 1 passed
```

Failing there is the honest outcome: the local server is built against a
placeholder project, so there is no data to assert on. What matters is that they
execute rather than skip.

**Full suite against the production build:**

```
=== FULL SUITE EXIT = 0 ===
  13 skipped
  18 passed (18.7s)
```

```
=== npm run check EXIT = 0 ===
 Test Files  128 passed (128)
      Tests  1169 passed (1169)
```

**Commit:** e38e698

### Mistake worth recording

My first probe value for "credentials present" was
`not_a_placeholder_value_for_guard_test_only`, which contains the word
"placeholder", so the guard correctly skipped and my check appeared to fail. The
guard was right and the test value was wrong.

### Where Task 0 now stands

| Item | State |
|---|---|
| 0a lint blocks CI | done, 47cb468 |
| 0b advisor nightly, not a PR gate | done, 72adec9 |
| 0c security-e2e collection locked | done, fa9416e |
| 0e main green | done: 0 failed, 13 skipped, 18 passed |
| 0d branch protection | **owner**, now unblocked. D13.3 phasing: require `check` now, add `e2e` once green on main, never require `advisors` |

Two things still need the human, neither blocking the queue:

1. **Repo secrets** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   so the security suite asserts against real data instead of skipping. Until then
   it skips loudly, which is the intended interim state, not a failure.
   `SUPABASE_ACCESS_TOKEN` remains optional per D12 ruling 4 (nightly advisor only).
2. **Branch protection** (0d), which is GitHub settings.

Next in the corrected dependency order: item 2, the vehicles, `06 A1–A7`
`writable-fields.ts` and `01 Phase A` `authz.ts`.

---

## Iteration 10 — 2026-07-29

### Dependency item 2, vehicles part 1 — `writable-fields.ts` (06 A1, A2, A8)

Owner: `implementation/06-validation-massassign.md` §5.1 and §7 Phase A.

**Changed:** new `src/lib/db/writable-fields.ts` with six frozen lists plus
`pickWritable()` and `assertNoServerOwned()`, and `writable-fields.test.ts` with
15 cases.

**A8 is answered, and it changes the spec.** §5.1 flagged three columns as
"applied out of band, confirm against prod before merging". They **do not exist**
in the live project at all:

```
artist_profiles.ships_internationally          absent
artist_profiles.international_shipping_price    absent
artist_works.in_store_price                     absent
```

So they are **omitted from the writable lists**, not migrated in. Allowlisting a
non-existent column is worse than useless: `pickWritable` would pass a client
value into the write and PostgREST would reject the whole statement, so one stray
field would fail the entire save. Nothing needs them, the transform defaults both
shipping fields, and this is exactly why `upsertWork` already carries a
strip-and-retry fallback (`artist-works.ts:35-80`): the `in_store_price` write
fails today and gets dropped per-column, silently.

`free_until` and `signup_order` are also absent from prod but stay on the deny
list, where a missing column costs nothing and fails closed if one is ever added.

**Lists verified against prod, not against the migration files** (prod was
bootstrapped from `supabase-all-migrations.sql`, so the numbered sequence is not
authoritative):

```
== artist_profiles: 35 writable + 32 server-owned vs 65 live columns
   writable columns missing from prod   : none
   live columns classified by neither   : none
== venue_profiles: 28 writable + 12 server-owned vs 40 live columns
   writable columns missing from prod   : none
   live columns classified by neither   : none
== artist_works: 15 writable + 5 server-owned vs 21 live columns
   writable columns missing from prod   : none
   live columns classified by neither   : ['id']
RESULT: every writable column exists in prod
```

`artist_works.id` being unclassified is deliberate per §5.1: it is client-supplied
by design and the row is scoped to the caller's `artist_id` by the route.

The doc's claim about `venue_profiles.preferred_sizes` and
`interested_in_local_artists` checks out: neither exists in prod, so the
strip-and-retry in `upsertVenueProfile` was achieving by accident what the
allowlist now does deliberately.

**Verification, both directions.** Before the module existed:

```
Error: Failed to load url ./writable-fields ... Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

After:

```
 ✓ src/lib/db/writable-fields.test.ts (15 tests) 3ms
      Tests  15 passed (15)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  129 passed (129)
      Tests  1184 passed (1184)
```

**Commit:** 8d99498

Tests cover the A2 list plus three the doc did not ask for: an explicit `null` is
preserved (it is a real value, unlike an absent key), no column appears on both a
writable and a server-owned list, and the lists are frozen so a route cannot push
onto one at runtime.

### Note on scope

The dependency order bundles `06 A1–A7` with `01 Phase A` as one "vehicles" item,
but A1/A2 build the module while A4–A7 convert three route handlers and two db
helpers to use it. Split deliberately: this commit is the vehicle, and nothing
consumes it yet. Next iteration takes `01 Phase A` `authz.ts` (the other vehicle),
then A3–A7 convert the routes, which is dependency item 4's "route fixes" anyway.

---

## Iteration 11 — 2026-07-29

### Dependency item 2, vehicle two — `authz.ts` (01 Phase A task 1)

Owner: `implementation/01-authz-idor.md` §1.1 and §Part 4 Phase A.

**Changed:** new `src/lib/authz.ts` (nine assert helpers plus `AuthzError`,
`handleAuthzError`, `withAuthz`) and `authz.test.ts` with 34 cases.

Built on the existing `api-auth.ts` rather than duplicating authentication:
`getAuthenticatedUser` keeps returning the 401, and these helpers consume the
`Actor` it yields. `.or()` goes through `orFilter()` because `no-raw-or-filter` is
already at error.

**A second phantom column, same class as A8.** §1.1's `assertPlacementParty`
selects `placements.requester_user_id`. It exists in no migration and **not in the
live table**. The real column is `proposed_by_user_id`, which is what
`api/placements/route.ts` writes. I verified all 27 columns the module touches
against prod in one query, and this was the only miss:

```
tbl        | col                | status
placements | requester_user_id  | MISSING
```

Left as written this would have been worse than a phantom allowlist entry:
PostgREST rejects a select naming an unknown column, so **every** placement
authz check would have failed closed. Prod's actual identity columns on
`placements` are `artist_user_id`, `venue_user_id`, `proposed_by_user_id` and
`cancelled_by_user_id`.

**Verification, both directions.** Before:

```
Error: Failed to load url ./authz ... Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

After:

```
 ✓ src/lib/authz.test.ts (34 tests) 6ms
      Tests  34 passed (34)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  130 passed (130)
      Tests  1218 passed (1218)
```

**Commit:** 9427aab

Tests cover the Phase A list (every `assert*` throws `AuthzError` 404 on
non-match; `assertOwnsArtistProfile` and `assertVenueOwner` throw 403 when the
profile is missing; `handleAuthzError` returns null for a non-AuthzError) plus the
E-numbers each helper closes: E32, E31 including the legacy slug-only path, E33,
E17, and that `withAuthz` rethrows non-AuthzErrors so a real failure is never
masked as a 404.

### NEW live bug found while checking that column: placement accept/decline is unreachable

`src/app/(pages)/placements/[id]/PlacementDetailClient.tsx` declares
`requester_user_id?: string | null` on its own placement interface and gates the
CTAs on it. Since the column does not exist, the API can never populate it, so the
value is always `undefined`:

- **line 822:** `status === "pending" && viewerRole && !!placement.requester_user_id && placement.requester_user_id !== user?.id` — `!!undefined` is false, so **the accept/decline block never renders**.
- **line 851:** `status === "pending" && (placement.requester_user_id === user?.id || !placement.requester_user_id)` — `!undefined` is true, so **the "waiting on them" branch always renders**, for both parties.

So on a pending placement both sides are told they are waiting for the other, and
neither can accept or decline from the detail page. Not in the findings list.
Almost certainly the same root cause family as N3/N4 (PR #63/#64, the paid-loan
CTA that was unreachable). The fix is to read `proposed_by_user_id` instead, and it
belongs with the `01` Phase B–D placement work (dependency item 4), where
`assertPlacementParty` already returns the field. Recorded here so it is not lost.

### Still open in `01` Phase A

Task 2 (`placements/state-machine.ts`, which wants a
`select status, count(*) from placements group by 1` recorded first) and task 3
(the `require-authz-on-mutation` ESLint rule plus `check-public-routes.ts`).
Neither blocks the route conversions, but task 3 is the guard that stops the IDOR
cluster reforming, so it should land before Phase 2 closes.

---

## Iteration 12 — 2026-07-29

### `01` Phase A task 2 — placement state machine (E20)

Owner: `implementation/01-authz-idor.md` §1.2.

**Prod status distribution, recorded before writing the table as §1.2 requires:**

```
status     | rows
active     |   37
pending    |   33
cancelled  |    7
declined   |    5
completed  |    4
```

No `paused` and no `sold` rows, though the code recognises both. Also confirmed:
**`placements.status` has no CHECK constraint** (the only checks on the table are
`arrangement_type`, `proposed_stage` and `subscription_status`), so any text can
be stored. That is why `from` is normalised for case while `to` is not: `to`
should be a canonical server-chosen value, so a mis-cased target is a caller bug
worth surfacing.

**Changed:** new `src/lib/placements/state-machine.ts` + test.

**Two deviations from §1.2, both evidence-driven:**

1. **"Placements have nothing equivalent" is not quite right.**
   `src/lib/placements/status.ts` already exists, describes itself as the "single
   source of truth for placement status + stage presentation", and exports a
   7-value `RawStatus`. It has no transition table, so a state machine is
   genuinely new, but I imported `RawStatus` rather than declaring the doc's
   competing 6-value `PlacementStatus`. A second status vocabulary sitting beside
   a self-declared source of truth is precisely the N-K3 duplicate-vocabulary
   problem this plan exists to remove. A test asserts the two stay identical.
2. **`sold` is missing from §1.2's table.** It is read as terminal by
   `api/placements/route.ts:922` alongside `completed`, and counted as a finished
   placement by `artist-portal/analytics`. Nothing writes it and prod holds none,
   so it is modelled as terminal with **no incoming** transition: a legacy `sold`
   row now reports as terminal rather than "Unknown current status", and no path
   to it is invented on speculation.

**Verification, both directions.** Before: `Failed to load url ./state-machine`.
After:

```
 ✓ src/lib/placements/state-machine.test.ts (9 tests) 2ms
      Tests  9 passed (9)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  131 passed (131)
      Tests  1227 passed (1227)
```

**Commit:** 3a73a80

### Iteration 11's placement finding, now fully evidenced

I claimed the accept/decline controls never render on the placement detail page.
Confirmed, and the mechanism is worth stating precisely because the intent was
right and only the field name was wrong.
`PlacementDetailClient.tsx:814-821` carries this comment:

> Safety rule: only show when we KNOW the requester and it is someone other than
> the viewer. If requester_user_id is unknown we keep the controls hidden, better
> to ask the user to refresh than risk letting the original sender accept their
> own request.

The fail-closed rule is correct. It just depends on a column that does not exist,
so it fires on **every** pending placement. Lines 831 and 845 (the Accept and
Decline buttons) are inside that hidden block, and this page does not use
`status.ts`'s `nextAction`, which would otherwise have offered an Accept CTA: it
keeps its own local `viewerRole` state fetched from the API. So there is no other
accept path on this page.

`status.ts`'s own `viewerRole()` has the same dependency (`p.requesterUserId`,
line 104), so wherever `nextAction` IS used, every viewer resolves to
`"responder"` and is offered Accept/Counter regardless of who proposed — the
mirror-image failure. Both want `proposed_by_user_id`. Fix belongs with the `01`
Phase B–D placement work, where `assertPlacementParty` already returns that field.

---

## Iteration 13 — 2026-07-29

### `01` Phase A task 3 — `require-authz-on-mutation` + the route allowlist

Owner: `implementation/01-authz-idor.md` §3. **This completes `01` Phase A.**

**Changed:** `eslint-rules/require-authz-on-mutation.js`,
`eslint-rules/public-routes.js`, wiring in `eslint-rules/index.js` and
`eslint.config.mjs`, `scripts/audit/check-public-routes.ts`, and
`audit:allowlist` added to `npm run check`.

**Set to `warn`, not `error`, and the doc contradicts itself here.** §3.3's diff
shows `"error"`; Part 4 task 3 says `"warn"` for now. Measured, `error` today would
fail lint on **50 route files**, because Phase B to D have not converted them.
Since Task 0a made lint blocking, this rule flips to `error` as the **Phase 2 exit
criterion** ("a new route that forgets authz fails CI"), not before. Recorded so
the flip is a deliberate step with a known cost.

**Measured baseline, which is the size of the remaining conversion work:**

```
files missing an authz import : 50
files missing a demo guard    : 55
demo-only (authz already ok)  :  6
```

Lint total is now `257 problems (0 errors, 257 warnings)`, up from 122, all from
this rule. Still exits 0, so CI stays green.

**One addition to the spec.** The rule also matches `export const POST = ...`, not
just function declarations. `src/app/api/stripe-connect/process-pending/route.ts`
uses that form, so the spec's `FunctionDeclaration`-only matcher left a real hole.
§3.5 lists three known limits and not this one; the other three (import-presence
not call-graph, no indirection through `@/lib/db/*`, and the `walls/[id]`
exemption) are reproduced in the rule's doc comment.

**Verification, both directions.**

Rule, before: `Cannot find module '../../eslint-rules/require-authz-on-mutation.js'`.
After: `16 passed`.

Allowlist guard, with two bogus entries injected:

```
FAIL: 8 problem(s) in eslint-rules/public-routes.js:
  - PUBLIC_ROUTES: "src/app/api/deleted-route/route.ts" does not exist. ...
  - PUBLIC_ROUTES: "src/app/api/contact/route.ts_bad" is not a src/app/api/**/route.ts path
  - PUBLIC_ROUTES: "src/app/api/contact/route.ts_bad" needs a reason of at least 20 characters ...
```

Reverted:

```
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

Full gate, now including the new allowlist step:

```
=== npm run check EXIT = 0 ===
 Test Files  132 passed (132)
      Tests  1243 passed (1243)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** eb2acd9

### Two smaller notes

- All 14 allowlisted route files exist, so §3.2's list needed no adjustment. That
  is the first section of any doc so far that matched reality exactly.
- The runbook's "`assertNotDemo` zero call sites" is now stale: `demo-guard.ts`
  exists and has 2 call sites outside itself. The rule's `missingDemoGuard` count
  of 55 is the real measure of that gap.

### Phase A is complete

| Task | State |
|---|---|
| 1 `authz.ts` + tests | done, 9427aab |
| 2 `placements/state-machine.ts` + tests | done, 3a73a80 |
| 3 lint rule + allowlist + stale guard | done, eb2acd9 |

Next in the corrected dependency order: item 4, the route fixes. `01` Phase B is
the highest value (E19 delete, E39 PII strip, E17/E18 auth) and `06` A4 to A7
convert the mass-assignment routes onto `pickWritable`. The E32+E44 chain is the
one the runbook wants first.

---

## Iteration 14 — 2026-07-29

### E32 — `upsertWork` artwork hijack, closed

Owner: `01` (D7 assigns E32 to `01` t7 over `05` B7). First half of the theft
chain the runbook wants closed before anything else.

**The hole was wider than the doc said.** §1.1 cites "lines 22-33". Six queries
were keyed on `id` alone:

```
25  existence check          select("id").eq("id", work.id).single()
30  main update              update(r).eq("id", work.id)
80  per-column fallback      update({[col]: ...}).eq("id", work.id)
98  read-back select         select("*").eq("id", work.id).single()
110 description repair       update({description}).eq("id", work.id)
117 refetch after repair     select("*").eq("id", work.id).single()
```

Fixing only the pair the doc names would have left the strip-and-retry fallback
(80) writing to a victim's row whenever the first write failed, which is a path
that fires routinely because `in_store_price` does not exist in prod. All six are
now scoped, and the shared `scopedUpdate()` helper means a seventh cannot be added
carelessly.

**Changed:** `src/lib/db/artist-works.ts`. A non-owner is refused explicitly
rather than falling through to an insert that would surface as an opaque
primary-key conflict. The refusal reuses `authz.ts`'s wording and carries
`code: "work_not_owned"`.

**Known gap, deliberately left:** `api/artist-works/route.ts:183` maps any error
to a 500 "Failed to save work". The request is denied, but with the wrong status.
Mapping `work_not_owned` to 404 belongs with the Phase B-D route work rather than
here, since it changes an externally visible status code on a route this task does
not otherwise touch.

**Verification, both directions.** Before, 5 of 7 red, with the exploit legible in
the failure output:

```
× refuses to touch a work owned by another artist, and writes nothing
  → an ownership refusal must be reported: expected null to be truthy
× never reassigns artist_id on someone else's row
  → expected 'artist-mine' not to be 'artist-mine'
× scopes every artist_works query by artist_id, including the read-back
  → these queries are keyed on id alone: [{"op":"update","filters":{"id":"my-work"},
     "payload":{...,"artist_id":"artist-mine"}}, ...]
```

After:

```
 ✓ src/lib/db/artist-works.test.ts (7 tests) 3ms
      Tests  7 passed (7)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  133 passed (133)
      Tests  1250 passed (1250)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** 3999102

The tests assert the invariant rather than the line: a fake records every query,
so "no write escapes the artist_id scope" is checked across all paths including
the fallback, which is how the extra four sites were caught in the first place.

### On the runbook's "fix E32 + E44 together"

Taken as "same phase, first, neither deferred" rather than one commit. They live in
different files (`lib/db/artist-works.ts` vs `api/artist-profile/route.ts`), each
is independently testable, and either one alone breaks the chain. E44 is the next
iteration, so both land before the loop moves on.
