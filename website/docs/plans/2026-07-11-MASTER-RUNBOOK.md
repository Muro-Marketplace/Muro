# Wallplace — Master Implementation Runbook

**Created:** 2026-07-11
**Purpose:** a single, executable plan taking Wallplace from "61 known defects, knotted codebase" to "MVP-ready: every transaction route correct, listing reliable, essential security closed, surface reduced."
**Intended use:** hand this to an implementation session (or work it top-to-bottom yourself). Every task is scoped, has an acceptance test, and leaves the build green.

## ✅ B1 — verified against prod, 2026-07-11

Queried `uwkuhygwvasdzwsusiym` directly. **The worst case is NOT live.**

- **`orders` and `messages` are correctly scoped.** `orders_select_party` (buyer/artist/venue/service-role) and `messages_select_party` + `messages_update_recipient` replaced the dangerous bootstrap policies. No blanket read of orders; no cross-user DM read or edit.
- **`customer_profiles` / `placement_record_versions` don't exist in prod** → E24 and E27 are **latent**, not live.

**Five PII-list leaks ARE live** (any authenticated user reads the whole table): `artist_applications`, `contact_submissions`, `venue_registrations`, `waitlist_signups` (all `SELECT USING auth.role()='authenticated'`), and `enquiries` (a permissive `USING (true)` policy OR'd with the correct one, so it wins). **Severity: high, not critical** — no order, message or financial data exposed. Fix in Phase 1b.

⚠️ **The Supabase advisor does not catch this class** — it skips `SELECT USING(true)` by design and never tests `auth.role()='authenticated'`. Manual `pg_policies` review is required; `audit:advisors` alone is not sufficient evidence of RLS health.

Also confirmed in prod: `terms_acceptances` allows `INSERT WITH CHECK (true)` (confirms E46 ToS forgery), **Leaked Password Protection is disabled**, and ~19 tables have RLS-enabled-no-policy (deny-by-default, safe — but it confirms the whole model rests on app-layer authz, i.e. CC1).

## Re-derivation complete — 2026-07-11

All nine implementation docs are written (~13,000 lines total). The lost E16–E46 detail was successfully re-derived from titles.

**Tally:** ~55 of 61 original findings confirmed with file:line evidence · **2 refuted** (E36 callback redirect — already fixed at `94a174a`; E35 "rate limiting advisory" — all 19 call sites enforce) · **1 reframed** (E16 — gating *is* server-side; it's bypassable via E44, not absent) · **2 of my own live findings corrected** (Bug 4 = masonry layout, not sort; Bug 12 = no client gate, not the flag) · **1 downgraded** (E24 latent) · **3 upgraded** (E32 → critical, E31 → enumerable, E41 → worst data-loss path).

**And ~35 genuinely new findings**, several outranking the originals:

| New | Why it matters |
|---|---|
| **B1** bootstrap RLS: any authenticated user reads `orders`, reads **+writes** `messages` | Anon-key path, no route needed. **Verify in prod first.** |
| **E32+E44 chain** | Steal a listing → redirect payout → victim's art pays the attacker |
| **T10 curation unsellable** | `tier` CHECK excludes both managed tiers; £79.99/mo + £199.99/qtr 500 on insert |
| **N-K1** two notification-preference systems | "Turn off order notifications" does nothing |
| **N-K2** two disagreeing `parseDimensions`, same importer | Shared root cause of Bug 7 **and** Bug 8 |
| **N-K3** six venue-type vocabularies | "Café / Coffee Shop" never matches filter "Cafés" — core matching broken |
| **E41 `saveWorks()`** | One price tweak can damage an artist's **entire** portfolio |
| **`assertNotDemo` zero call sites** | Every demo-mutation protection is imaginary |
| **27 further duplicate pairs** | The knot hides as two sensibly-named files, never `-v2` |

**Two hard dependencies discovered:**
1. **Every lint-based guard in this plan is theatre** until `continue-on-error: true` is removed from `.github/workflows/ci.yml:43`. That is Task 0.
2. **K9 quantified:** 119 routes, 103 hold a service-role client, only **73 identify the caller** — the 30-file gap *is* the IDOR cluster. `authz.ts` is the highest-leverage single change in the plan.

## ⚠️ READ `2026-07-11-EXECUTION-DECISIONS.md` FIRST

A coherence review found the nine implementation docs **not executable as written**: three claimed the same migration number `074`, two prescribed contradictory renumbering of the same files, Bug 15 was covered by nobody, `08` assumed the visualizer could be cut (it cannot), and eight tasks had two or three competing owners.

**All resolved in `2026-07-11-EXECUTION-DECISIONS.md`, which is BINDING and overrides every other doc — including the phase list below — wherever they disagree.** Its "Corrected dependency order" is the execution sequence.

## Document map

| Doc | Contents |
|---|---|
| `2026-07-11-stress-test-findings.md` | The 61 findings (Bug 1–15, E1–E46) + N1/N2 |
| `2026-07-11-stress-test-remediation-spec.md` | Design spec: cross-cutting fixes CC1–CC9, gates G1–G4, unknot K1–K11, cull |
| **`2026-07-11-MASTER-RUNBOOK.md`** ← this | Execution order, CI gates, per-phase task queue |
| `implementation/01-authz-idor.md` | Authz layer + E17–E23, E31–E33, E39 |
| `implementation/02-rls-db-storage.md` | RLS/migrations/storage + E24–E29 |
| `implementation/03-auth-session-admin.md` | Auth/session/admin + E30, E34–E36 |
| `implementation/04-payments-transactions.md` | **T1–T10 transaction routes** + E37, E38, E40, N1, N2 |
| `implementation/05-frontend-saves-listing.md` | Save-flow contract + E41–E43, Bug 7/12/14, listing |
| `implementation/06-validation-massassign.md` | Allowlisted writes + E44–E46, E16 |
| `implementation/07-unknot.md` | K1–K11 + `browse/page.tsx` decomposition |
| `implementation/08-surface-cull.md` | Route inventory, reachability, deletion plan |
| `implementation/09-emails.md` | Email pipeline, consolidation, missing triggers (E1, E4, E5) |

---

## 1. Existing infrastructure — USE IT, don't reinvent

The repo already has strong enforcement scaffolding. Every new guard in this plan must follow these established conventions.

**Scripts** (`package.json`):
```
npm run check          # lint + typecheck + test        ← the fast gate
npm run test           # vitest run (130 test files)
npm run test:e2e       # playwright
npm run audit:advisors # Supabase advisor snapshot + regression check
npm run audit:e2e-security  # tests/e2e/security-no-leaks.spec.ts
npm run depcheck       # dependency-cruiser
npm run audit:full     # check + advisors + e2e-security
npm run schema:snapshot # regenerate the phantom guard's schema-columns.json from the live DB (after a column migration; needs SUPABASE_ACCESS_TOKEN)
```

**Established pattern for enforcing a rule:** a custom ESLint rule, verified by an integration test in `tests/integration/`. Precedents already in the repo:
`eslint-no-inline-admin-check`, `eslint-no-unawaited-critical-sideeffect`, `eslint-no-raw-or-filter`, `eslint-no-redirect-param`, `eslint-no-ad-hoc-cap`, plus the dependency-cruiser rule `no-admin-client-in-client`.
→ **Every new guard in this plan (authz, body-spread, label source, legacy-email import) ships as an ESLint rule + a `tests/integration/eslint-*.test.ts`.** This is not optional; it is how this codebase prevents regressions.

**Existing security e2e:** `tests/e2e/security-no-leaks.spec.ts` already exists — Bug 1 and Bug 5 (public PII leaks) belong in it, not in a new file.

### 1.1 THREE CI GAPS TO FIX FIRST (Task 0)

These make the rest of the plan enforceable. Do them before anything else — half a day total.

| Gap | Evidence | Fix |
|---|---|---|
| **Lint doesn't block CI** | `.github/workflows/ci.yml` runs lint with `continue-on-error: true` ("informational only until the backlog is cleared") | **PR #65 raised `no-raw-arrangement-type` to error — but it blocks nothing while this flag is set.** Clear the React Compiler warning backlog, then flip to blocking. Until then every "lint rule" guard in this plan is theatre. |
| **Advisor checks not in CI** | `audit:advisors` exists but no CI job runs it | Add a job running `npm run audit:advisors` — this is the RLS/security regression gate for §02 |
| ~~**Security e2e not in CI**~~ **CORRECTED 2026-07-29** | Premise was wrong. `playwright.config.ts` sets `testDir: ./tests/e2e` with no `testMatch`/`testIgnore`/`grep`, so `npm run test:e2e` already collects `security-no-leaks.spec.ts` (`npx playwright test --list` shows its 4 tests). `audit:e2e-security` is a convenience for running it alone, not the only path. | Collection is now locked by `tests/integration/ci-gates.test.ts`. **The real problem is different:** 3 of the 4 security tests *fail* in CI for environmental reasons (404 / 500 / `ENOTFOUND placeholder.supabase.co`) because CI has no real Supabase. Adding a second job would only add a second red one. Making the gate meaningful is an owner decision, see PROGRESS.md. |

Also apply the pending workflow change in `docs/ci/2026-06-15-required-checks.md` (blocked previously on a token lacking `workflow` scope) and enable branch protection requiring `check` + `e2e`.

---

## 2. Execution model

**Work unit = one PR.** Each PR: single concern, green `npm run check`, includes its regression test, updates the traceability row.

**Three invariants:**
1. **Every fix ships with a test that fails without it.** No exceptions on security or money.
2. **Deleting beats fixing.** If a surface is on the cull list (§08), delete it instead of fixing its bugs. Check §08 before starting any task.
3. **New implementation ⇒ old one deleted in the same PR.** No `_v2` beside `_v1`. This is the rule that stops the knot re-forming.

**Definition of done (every task):**
- [ ] `npm run check` green
- [ ] Regression test added, fails on the pre-fix commit
- [ ] Security tasks: explicit negative test (unauthorised → 401/403; forged field → ignored/400)
- [ ] DB tasks: migration idempotent + `npm run audit:advisors` clean; if the migration adds, renames or drops a column, run `npm run schema:snapshot` to refresh the phantom guard's snapshot (never add the new real column to `GRANDFATHERED` instead, D61)
- [ ] Money tasks: Stripe test-mode assertion of the exact split, to the penny
- [ ] Traceability row updated in the remediation spec §7

---

## 3. Phase order

Rationale: unblock enforcement → close live exploits → make the enforcement structural → fix the money → protect user data → shrink → unknot → polish. Stripe activation runs in parallel from day 1 because it gates all payouts and cannot be rushed.

### Phase 0 — Enforcement (½ day) — *do first*
Task 0: the three CI gaps in §1.1 + branch protection.
**Exit:** a failing lint rule actually fails CI.

### Phase 1 — Live exploits (P0 security) — *revised after re-derivation*
From `01-authz-idor.md`, `02-rls-db-storage.md`, `06-validation-massassign.md`.

**1a. The theft chain — fix E32 + E44 together, first.** They compose into working artwork theft with payout redirection:
- **E32** `lib/db/artist-works.ts:22-33` — `upsertWork` matches by `id` alone while writing the caller's `artist_id` → rewrites a victim's artwork **and reassigns ownership**. Fix: scope the update by `.eq("id").eq("artist_id", callerProfileId)` (copy `deleteWork` twelve lines below, which is already correct).
- **E44** `api/artist-profile/route.ts:42` — body spread into a service-role update → self-approve moderation, self-grant Pro, extend trial, **and set `stripe_connect_account_id`** (payout destination + KYC bypass). Fix via `writable-fields.ts` (CC2).
- Chained: steal listing → it attributes to attacker → point payout at own Connect account → victim's art sells and pays the attacker.
- **Also makes gating real:** E16 is refuted (gating IS server-side in 6 places) — but it reads `subscription_status`, the very column E44 lets a user write.

**1b. Data exposure**
- **B1** bootstrap RLS (`orders` readable, `messages` read+**write** by any authenticated user) — *verify in prod first, see top of doc*
- **E31** read any conversation — **enumerable**: ids are `dm-<slugA>__<slugB>` from public slugs
- **E39** unauthenticated `/api/checkout/session` PII
- **E17** unauthenticated artwork-request read — ⚠️ the artist-portal page uses plain `fetch`, so the route fix and the page fix **must ship in the same PR**
- **B4** `/email-preview` unauthenticated in prod — gate to admin+non-prod, or delete

**1c. Delete rather than fix**
- **E19** `POST /api/orders:329` — unauthenticated, inserts `status:"confirmed"`, and is **dead code**. Remove the route.

**1d. Vehicles:** ship `src/lib/authz.ts` (CC1) + `writable-fields.ts` (CC2). Note **`assertNotDemo` currently has zero call sites** — wiring it is part of this phase, not a later one.

**Lower than reported:** **E24** (`customer_profiles` RLS) appears **latent** — table likely absent in prod. Fix, but not at P0.

**Sequencing hazard:** `artist_applications` RLS lockdown MUST ship in the same PR as switching `/apply`'s insert to the service-role client, or artist applications break (§02).

**Exit:** every P0 has a passing negative test; advisors clean.

### Phase 2 — Structural enforcement
- Apply `authz.ts` to all remaining service-role routes (E17, E18, E20–E23, E33)
- Land the `no-missing-authz` + `no-body-spread-write` ESLint rules with integration tests
- **K10** renumber duplicate migrations (037, 044, 045, 054) + **K11** commit `000_base_schema.sql`
- **E25** storage privacy (opaque refs + signing endpoint + backfill) — biggest refactor in the security set; sequence last here

**Exit:** a new route that forgets authz fails CI.

### Phase 3 — Gate 1: transactions (the MVP promise)
From `04-payments-transactions.md`, in this order:
1. **T3 offers** — E6 (money taken, artist never paid) + E10 (no stock decrement). *Happening in production today.*
2. **T6 paid loan** — E7 (orphaned/double-billable/uncancellable) + E8 (funds trapped) + E11. Keep the CTA hidden until proven.
3. **T2 multi-artist cart** — E9 (first artist paid everything)
4. **T1 hardening** — Bug 7, Bug 8, Bug 10, E40
5. **T4 placement authz** — E20, E21, E23, E33
6. **T9 collect-from-venue** — N1, N2 — *or cut for MVP (§08)*
7. **T5 + T10 verification** — full purchase→payout→QR cycle; audit the never-tested curation flow
8. Shared primitives: `canReceivePayout()`, per-artist transfer loop, ledger-write-must-throw, retry sweep (E37), fee-mapping fix (E38)

**Exit:** `npm run test:transactions` drives T1–T10 in Stripe test mode and passes.

### Phase 4 — Gate 2: listing integrity
From `05-frontend-saves-listing.md`: `authFetch` throws on non-2xx, the `useSaveAction` hook, then the sweep — E41 (portfolio/profile saves dropping writes) first, then E42, E43, Bug 12, Bug 14.
**Exit:** upload → save → reload → persists; a second artist cannot read or write it; E2E covers it.

### Phase 5 — Cull (§08)
Owner marks Keep/Cut/Defer; cuts land as pure-deletion PRs. A green suite after deletion is itself proof the surface was unused.
**Do this before Phase 6** — no point unknotting code you're about to delete.

### Phase 6 — Unknot (§07)
K1 email consolidation → K2 paid-loan single path → K7 order-email dedupe → K3/K4 labels+status → K5/K6 stats/finance sources → K8 demo personas → decompose `browse/page.tsx`.

### Phase 7 — Emails + remaining security + polish
CC5 (provision, consolidate, wire the gaps), P1/P2 auth hardening (§03), reporting (Bug 13/15), naming (E13–E15), data hygiene (Bug 2/3/6), public PII projections (Bug 1/5).

### Parallel track (owner) — start today
Stripe: rename "Wallspace"→"Wallplace", account activation, **Connect + platform review** (gates all payouts), live webhook/products/prices, Radar, Tax, live keys. Then DNS/Resend, legal, Upstash env, Supabase Pro. See spec §11.

---

## 4. Verification ladder

| Level | Command | Gates |
|---|---|---|
| Local fast | `npm run check` | Every commit |
| Security regression | `npm run audit:advisors` | Every DB PR |
| Leak check | `npm run audit:e2e-security` | Every public-API PR |
| Transactions | `npm run test:transactions` *(to build, Phase 3)* | Every payment PR |
| Full | `npm run audit:full` | Pre-merge to main |
| Exit gate | Re-run the full stress test (guest + 5 roles + code audit passes) | Before public launch |

---

## 5. Progress tracker

| Phase | Status | Exit criterion |
|---|---|---|
| 0 Enforcement | ☐ | Lint blocks CI; advisors + security e2e in CI |
| 1 Live exploits | ☐ | P0 negative tests pass; advisors clean |
| 2 Structural | ☐ | Missing authz fails CI; migrations deterministic |
| 3 Transactions (G1) | ☐ | `test:transactions` green for T1–T10 |
| 4 Listing (G2) | ☐ | Listing E2E green; no false-success controls |
| 5 Cull | ☐ | Deletion PRs merged; suite green |
| 6 Unknot | ☐ | One implementation per concept; guards in place |
| 7 Emails/polish | ☐ | 1 email per party per event, actually delivered |
| Owner/Stripe | ☐ | Connect live; artists can be paid |

---

*Detail lives in `implementation/01`–`08`. This runbook is the order and the gates.*
