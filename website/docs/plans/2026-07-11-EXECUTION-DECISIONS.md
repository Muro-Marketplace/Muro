# Execution Decisions — authoritative conflict resolution

**Created:** 2026-07-11 · **Status:** binding
**Precedence:** THIS DOC OVERRIDES the nine `implementation/*.md` docs wherever they disagree. Read it before touching any of them.

A coherence review of the nine independently-written plans found conflicts, duplicated ownership, stale content and gaps. Every one is resolved below. Where a doc contradicts this file, **this file wins**.

## ⚡ OPERATING RULES — read these FIRST, every iteration

*Not task guidance. How to run the loop itself. Ignoring these has already cost hours.*

1. **PACING: use `ScheduleWakeup delaySeconds: 60`. Not 1200-1800.**
   Nothing external gates this work. Every task is local: read source, edit, write a test,
   `npm run check`, commit. Measured on this branch: **the work takes 0-1 minutes, the idle
   delay takes 27-30** — about 97% dead time, and 24-48 hours of pure waiting across the
   remaining queue. A long delay is correct only when genuinely blocked on external state
   (a CI run, a deploy, a queue) — and if you use one, say in the report what you are
   waiting for. "Self-pacing" is not a reason. Full reasoning: **D22**.

2. **Rule 1 changes pacing ONLY.** One task per iteration, the regression test verified
   failing *before* the fix, `npm run check` green before commit, evidence pasted, no
   bundling. The instruction is to stop idling, not to hurry.

3. **Read the newest decisions first.** This document is append-only and long. The most
   recent D-number is the most likely to change what you are about to do.

---

## D0. Owner decisions (recorded)

| Decision | Ruling |
|---|---|
| **Wall visualizer** | **KEEP.** Not to be removed. `08` must be read as Option A (keep). All cut-the-visualizer costings in `08 §6.5, §7.1 B/C, §8.3 PR#10, §9` are **void**. |
| Managed curation tiers | **Fix, don't remove.** Widen the CHECK (`04`'s approach). `08 §7.2`'s "remove managed tiers" is **void**. |
| Email templates | Keep the unwired library. `09` owns the inventory; `08 §6.2`'s 49–59 template cull is **void**. |
| Demo accounts | Keep `/demo` and the demo personas. Delete only the *junk* test rows (D7). |

---

## D1. Migration number allocation (BLOCKER B1 — resolved)

Three docs all claimed `074`. Ranges are now **disjoint and exclusive**:

| Doc | Range | Notes |
|---|---|---|
| `02` RLS/DB/storage | **074–079** | incl. `074_rls_gap_closure`, attachment-privacy pair |
| `04` payments | **080–089** | webhook events, cart/shipping, revenue-share bounds |
| `07` unknot | **090–094** | counters, label/vocab consolidation |
| `09` emails | **095–097** | if any schema needed |
| Reserved | 098+ | future |

**Rule:** before writing any migration, `ls supabase/migrations/ | tail -5` and take the next free number **inside your doc's range**. Never reuse a number.

## D2. K10 duplicate-migration renumbering (BLOCKER B2 — resolved)

`02 §8.3` and `07 §10.4` prescribe **contradictory** renumbering of the same four colliding pairs (`037, 044, 045, 054`), and move *different members* of the `037` pair. Running both corrupts `schema_migrations`.

**Ruling: `02 §8.3` is authoritative** (it is dependency-analysed and reuses free slots `002/017/068/069`). **`07 §10.4` is void — delete that section.** `02` also owns the reconciliation script.

## D3. The fifth RLS leak (BLOCKER B3 — resolved)

`02 §1a` claims `enquiries` was narrowed. **Prod contradicts this:** a permissive `SELECT USING (true)` policy (`"Artists can read their enquiries"`) is live and, because policies OR together, it **wins over** the correct owner-scoped one. **Add `enquiries` to the `02 §11` drop block.** All five live leaks must be dropped in `074`: `artist_applications`, `contact_submissions`, `venue_registrations`, `waitlist_signups`, **`enquiries`**.

## D4. Bug 15 — nobody fixed it (BLOCKER B4 — resolved)

Prod: `orders` has **no `amount_cents` column**. `api/admin/stats/route.ts:48` selects it → PostgREST rejects the query → `.data` null → `|| []` → **£0 / 0 orders**. `07 §6.1–6.2`'s "backfill `amount_cents`" is **void** (it would backfill a non-existent column).

**Owner: `04` (new task, Phase 0).** Fix = stop selecting the non-existent column; compute gross from `total` (pounds → pence). Do **not** add the column unless K6 later needs it. Acceptance: `/admin` gross sales ≥ the sum shown on `/artist-portal/orders` (£773.25), orders count > 0.

## D5. Admin predicate (BLOCKER B5 — resolved)

`01 Appendix A` says "no gap" in `admin-auth.ts`; `03 §1.2` removes the `user_metadata` conjunct. **`03` is authoritative; `01 Appendix A` is void on this point.**

Prod facts now settle `03`'s open questions:
- **`admin_users` does NOT exist** → `03 §1.4` Steps 1+2 (create table + backfill) are **mandatory**, not optional.
- Live predicate is therefore `user_metadata.user_type='admin' AND email ∈ ADMIN_EMAILS`.

**Order (must not be reversed):** create+backfill `admin_users` → remove the `user_metadata` conjunct → *then* no metadata stamping is needed and nobody is locked out.

## D6. `08` surface-cull rewrite (BLOCKER B6/B7 — resolved)

`08` is **not executable until rewritten** to Option A (keep visualizer) and reconciled with `09`. Until then, only these **unconditional** items from `08 §7.1` may proceed:
1. Delete legacy `WallVisualiser.tsx` (dead once `WALL_VISUALIZER_V1` is prod-ON) — *this is a K12b unknot fix, not a feature cut*
2. Delete the two orphan DELETE handlers
3. Fix the kill-switch leak at `api/venues/[slug]/profile/route.ts:123`
4. Delete `/dev`, `/profile-designs`, `/feature-requests` (+2 API routes), `/galleries`, `PlacementQRModal.tsx` — all verified zero-inbound-link
5. `/email-preview` → delete **or** gate to admin+non-prod (B4 security finding)

**Precondition:** `07 §13.2` collapses `parseDimensions` **onto** `lib/visualizer/dimensions.ts`, so Keep is required for it. Confirmed compatible.

## D7. Ownership of duplicated work (resolved)

| Item | Claimed by | **Owner** |
|---|---|---|
| Delete `POST /api/orders` | 01 t4, 04 §0.3, 06 A9 | **04** |
| `upsertWork` artist_id scoping (E32) | 01 t7, 05 B7 | **01** |
| `artist-works` POST validation | 05 B9, 06 B5 | **06** |
| Artwork-request view predicate | 01 §1.1, 06 B2 | **01** |
| E17/E18 auth | 01 t6, 06 B4 | **01** |
| Delete `src/lib/email.ts` | 07 K1, 09 §B | **09** |
| Order-email dedupe | 07 K7, 09 §C | **09** |
| Legacy-email import guard | 07 §1.6 (dep-cruiser), 09 §2.7 (ESLint) | **09**, as an ESLint rule (repo convention) |
| CI `continue-on-error` flag | runbook T0, 07 Ph0, 09 §4.4 | **runbook Task 0** |

## D8. Gaps — previously uncovered findings, now assigned

These had **no** implementation doc. Specs are here; owner doc noted for the test.

### G-A. Bug 1 — `/api/browse-artists` leaks exact postcode + GPS to anonymous users (**live PII leak**)
Return a public projection only. Strip `postcode` and `coordinates`; if distance filtering is needed, compute server-side and return a coarse band (e.g. rounded to ~1 decimal / a town name). **Owner: new task in `02`'s workstream** (API-side, no migration). Test: add to `tests/e2e/security-no-leaks.spec.ts` — anonymous fetch contains no `postcode` and no `coordinates`.

### G-B. Bug 5 — `/api/venues/demand` paywall bypass (**live**)
Server blanks `name` but still returns `slug` (which spells the name: `the-copper-kettle`) and exact `coordinates` for paywalled rows. For non-subscribers return an opaque id instead of the slug, drop `coordinates` (or coarsen), and keep `type`/`location` only if intended. Also strip venue-name-bearing hrefs from the `/spaces` HTML. **Owner: same workstream.** Test: anonymous fetch yields no name-bearing slug and no exact coords.

### G-C. Bug 10 — "Ships to UK only" unenforced
Validate the delivery country against the work's shipping scope in `api/checkout/route.ts` **before** creating the session, and restrict the country dropdown. **Owner: `04`.** Test: UK-only item + AU address → 400, never reaches Stripe.

### G-D. Data hygiene (Bug 2/3/6)
Prod junk confirmed: artists `avatar, test, test-artist, test-user, sass-test, sam-test, mark-smith, finlay-coles, finlay-coles-2, gil-sassi`; venues `fin-coles, finlay, test-may, the-venue-test`; the `teest` blog post. **Do not hard-delete** — set `review_status='rejected'` / an `is_published=false` flag so they leave public surfaces, and add the gate to `browse-artists`, `venues/demand`, blog list and the admin "listed" count. Keep `maya-chen-demo` + `the-copper-kettle-demo` (the `/demo` personas) but fix `maya-chen-demo`'s `plan=pro/status=none` mismatch. **Owner: `08`** (post-rewrite).

### G-E. Promote N-K1 and N-K3 out of the Phase-7 bucket
- **N-K1** two notification-preference systems → "turn off order notifications" does nothing. **User-facing false promise + consent-record problem. Move to Phase 4.**
- **N-K3** six venue-type vocabularies → "Café / Coffee Shop" never matches filter "Cafés". **Core marketplace matching is broken. Move to Phase 3.**

## D9. Corrections against verified prod (docs are stale)

| Doc | Stale claim | Reality |
|---|---|---|
| `09` CC5 provisioning | "Resend unset, all sends blocked" | **238 emails sent, 0 `skipped_no_api_key`, latest today.** E1 refuted for prod. **Drop provisioning from the critical path.** Keep the fail-loud fix (masks a *future* outage). |
| `09` priorities | — | **New #1: zero `artist_order_*`/`artist_work_sold` emails have ever sent** while 6 customer receipts did. Artist-side trigger is broken in code. |
| `04 §D25` | curation CHECK "UNCONFIRMED" | **Confirmed in prod.** Pull task `7.0` to Phase 0. |
| `02 §7.1` | `SET NOT NULL` risk "Medium" | `stripe_transfers` is **empty (0 rows)** → zero-risk. |
| `03 §3.2` | E34 exploitability UNCONFIRMED | `venue_profiles.user_id` is **NOT NULL** → **latent**; deprioritise. |
| `02 §2.4` | E24 latent | ✅ correct — `customer_profiles` does not exist. Same for `placement_record_versions` (E27). |
| `05 B8` | switch `getWorksByArtistProfileId` to `getSupabaseAdmin()` | **VOID** — removes the RLS backstop on a public-page read while `02` hardens RLS. Do not do it. |
| `01`, `04` | E21 delivery-confirm | Fix is safe, **but** the webhook doesn't populate `buyer_user_id` on the main path, so guest buyers can never confirm delivery. Handle guests (email-token path) or accept and document. |

## D10. Executability fixes required before those docs run

- **`05`** — define labels `L1–L22` in `§9.2` (currently referenced but never defined). Phase E items "add a real `status` column" / "either implement or remove" must be decided, not deferred.
- **`07 §13`** — the 27-pair catalogue is not a plan. Only the six pairs with live defects are in scope now (incl. N-K1, N-K2, N-K3); the rest become a backlog doc.
- **`03`** — its Phase 0 unknowns are answered above (D5); proceed.
- **`08`** — rewrite per D6 before executing anything beyond the unconditional list.

## D11. E6 — real victims, act outside the code fix

`purchase_offers` has **two `paid` rows** (`off_1778` £33, `off_1779` £27, both artist `fin-coles`, May 2026) with **no `orders` row** and **`stripe_transfers` empty platform-wide (0 rows / 12 orders)**. Two customers paid £60; nothing recorded; artist never paid.

**Manual action (not code):** reconcile both against the Stripe dashboard, confirm whether funds were captured, and settle with `fin-coles` out of band. Do this before or alongside the E6 code fix, and record it.

---

## Corrected dependency order (supersedes the runbook's phase list where they differ)

1. **Task 0** — CI `continue-on-error` removed (runbook owns it) — *else every lint guard is theatre*
2. **`02` prereqs** — base schema committed, K10 renumber (D2), reconcile — **before any new migration**
3. **Vehicles** — `06 A1–A7` `writable-fields.ts` + `01 Phase A` `authz.ts`
4. **Route fixes** — `01 Phase B–D`, `06 Phase A2/B` (incl. the E32+E44 chain)
5. **`02 §11` `074`** RLS closure (all five leaks) **+ the `/apply` service-role switch in the same PR**
6. **G-A / G-B** public PII projections (Bug 1, Bug 5)
7. **`07 §13.2`** `parseDimensions` collapse — **pulled forward**, it precedes `05`'s shipping work
8. **`04`** payments Phase 0→9 (incl. D4 Bug 15, G-C Bug 10, curation 7.0 at Phase 0)
9. **`05`** frontend saves + listing (after D10 fixes)
10. **`03`** auth/admin (D5 order)
11. **`09`** emails (artist-sale trigger first; provisioning dropped)
12. **`07 K5a/K5b`** before `08 PR#2`; **`09 §4.1`** harness before `08 PR#5`
13. **`08`** rewritten cull last

---

## D12. Advisor / CI-secret ruling (added 2026-07-11, in response to the loop's escalation)

Both escalated claims are **verified correct**:
- `gh` cannot read or write repo secrets here. Active token scopes are `gist, read:org, repo, workflow` — no secrets permission; `gh secret list` returns HTTP 403. **Neither the agent nor a subagent can add or even check this secret. It is a human-only task.**
- `SUPABASE_ACCESS_TOKEN` is genuinely **absent** from `~/.zshrc` (0 occurrences; only `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are exported). **The header comment in `scripts/audit/snapshot-advisors.ts:9-11` is factually wrong** and must be corrected — it claims the token is "already exported in the developer's ~/.zshrc".

### Rulings

**1. The loop's workaround is APPROVED and is now the primary evidence, not a fallback.**
The Supabase advisor **provably does not catch the leaks this project actually has**. A full `get_advisors(security)` run against prod on 2026-07-11 returned `rls_enabled_no_policy` (INFO) and `rls_policy_always_true` (WARN, INSERT-only) items — and **flagged none of the five live `SELECT USING (auth.role() = 'authenticated')` leaks** on `artist_applications`, `contact_submissions`, `venue_registrations`, `waitlist_signups`, `enquiries`. The linter documents that it deliberately excludes permissive SELECT policies.
→ **A clean advisor run is NOT evidence of RLS health. Never report it as such.**

**Canonical blocking assertion for every DB/RLS task** (must return zero rows):
```sql
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and cmd = 'SELECT'
  and qual ilike '%auth.role()%authenticated%';
```

**2. The advisor is still runnable — just not via the npm script.** Use the Supabase MCP `get_advisors` tool (project `uwkuhygwvasdzwsusiym`) directly. Only the CLI path is blocked by the missing token. So report it as "advisor run via MCP", not "could not run", when the MCP is available. State plainly which path was used.

**3. Do NOT gate PRs on `audit:advisors`.** Reasons: (a) it cannot catch this codebase's actual leak class (above), so it would give false assurance; (b) GitHub does not expose repo secrets to fork PRs, so the job would hard-fail on any external contribution; (c) a per-PR job holding a prod management token widens the blast radius for little gain.
→ **Required change:** make the advisor job `continue-on-error: true` **or** move it to a nightly `schedule:` workflow. The **blocking** gate is the `pg_policies` assertion above. If that assertion is wanted in CI it needs its own DB-URL secret — until then run it via MCP pre-merge and paste the output.

**4. `SUPABASE_ACCESS_TOKEN` is therefore NOT a blocker for the loop.** Continue without it. Do not re-escalate. It remains on the human's list only so the nightly/non-blocking advisor job works later.

**5. Fix the stale header** in `scripts/audit/snapshot-advisors.ts:9-11`: state that the token must be exported manually or supplied by CI, and that `npm run audit:advisors` exits 2 when unset. Small task, owner `02`.

---

## D13. Owner rulings on the two Task-0c/0d escalations (2026-07-11)

Both answered by the owner. These are binding; Task 0d is **unblocked**.

### D13.1 — Security e2e gets REAL Supabase credentials in CI

**Ruling: add real creds as repo secrets.** The anon key is already public in the shipped browser bundle, so this exposes nothing new, and it is the only option that gives a genuine **per-PR** leak gate — which matters because Bug 1 and Bug 5 are *live* PII leaks that this suite is meant to catch.

Implementation:
- Human adds repo secrets: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (real values). *(Also `SUPABASE_ACCESS_TOKEN` per D12, but that one is non-blocking.)*
- The `e2e` job takes them from `secrets.*`, replacing the `placeholder.supabase.co` values for the security spec.
- **Fork-PR caveat:** GitHub does not expose secrets to fork PRs. The security spec must therefore **skip loudly** (explicit skip message naming the missing secret) when the URL is absent or still `placeholder`, and **fail** when creds are present but a leak is found. A silent pass on missing config is the exact failure mode we are removing — never do that.
- Until the secrets exist the job stays red on that spec; that is expected and acceptable.

### D13.2 — Brand accent: darken for small text only, keep the brand

**Ruling: keep `#c17c5a` for large text, buttons and decoration; introduce a darker token used only where small text sits on the accent, or the accent is small text on a warm background.** WCAG 2.1 permits 3:1 for large text (≥24px, or ≥18.66px bold), so the brand colour stays legitimate in its dominant uses.

Implementation:
- Add a distinct token (e.g. `--accent-text` / `accent-ink`) alongside the existing accent. **Do not** globally redefine `#c17c5a`.
- **Derive the value empirically — do not trust a hex I or anyone else asserts.** Darken until the axe contrast checks pass, then record the measured ratio in the commit message. Required: ≥4.5:1 for white-on-accent and for accent-on-warm-background at small sizes.
- Apply only at the failing sites: `/pricing`, `/checkout`, `/checkout/confirmation`, `/cookies`.
- The 3 tap-target failures are uncontroversial sizing fixes (≥44×44px) — fix them in the same phase, no design decision needed.
- Evidence required: the 7 previously-failing a11y/tap-target tests pass, and a visual check that the brand still reads correctly.

### D13.3 — Task 0d (branch protection) is now unblocked, with a phased gate

- **Now:** require `check` (lint + typecheck + unit). It is green and blocking today.
- **After D13.1 + D13.2 land and `e2e` is green:** add `e2e` to required checks.
- Do **not** require `advisors` (per D12 it is non-blocking/nightly).

---

## D14. Task 0e — GO GREEN ON MAIN (owner request, 2026-07-11)

**Goal:** `main` CI green. Currently `10 failed, 9 skipped, 12 passed` (run 27908014082) — `check` passes, `e2e` fails. Breakdown: 4 a11y contrast + 3 tap-target + 3 security-environmental.

### D14.1 — Contrast: measured values (do NOT re-derive by eye)

Computed from the tokens in `src/app/globals.css` (WCAG 2.1 relative-luminance formula):

| Pair | Ratio | 4.5:1? |
|---|---|---|
| white on `--color-accent` `#C17C5A` | **3.33** | ✗ |
| `#C17C5A` on `--color-background` `#FAFAF8` | **3.19** | ✗ |
| `#C17C5A` on `--color-surface` `#FFFFFF` | **3.33** | ✗ |
| white on `--color-accent-hover` `#A8684A` | **4.43** | ✗ |
| `#A8684A` on `#FAFAF8` | **4.24** | ✗ |

**⚠️ New finding not in the loop's report: `--color-accent-hover` (`#A8684A`) ALSO fails**, at 4.43/4.24 — just under the bar. Any fix that only addresses `--color-accent` leaves hover states non-compliant. Fix both.

**Candidates (measured, hue-preserving darkening):**

| Hex | white-on | on `#FAFAF8` | Note |
|---|---|---|---|
| `#9E664A` | 4.72 | **4.51** | bare minimum — 0.01 of margin on background, too fragile |
| **`#9C5F42`** | **5.09** | **4.87** | **recommended** — comfortable margin, sits naturally beside the existing hover shade |
| `#8F5638` | 5.91 | 5.65 | safest, visibly darker |

**Ruling:** add `--color-accent-text: #9C5F42` (new token). Do **not** redefine `--color-accent`. Per D13.2, `#C17C5A` stays for large text (≥24px, or ≥18.66px bold), icons, borders and decoration, where the 3:1 large-text allowance applies and it already clears it.

### D14.2 — Method (evidence-driven, not guesswork)

1. **Run axe first and capture the exact failing nodes** — do not assume which elements fail. `npx playwright test tests/e2e/a11y.spec.ts` and read the node HTML in the failure output.
2. Apply `--color-accent-text` **only at those nodes** (small text on accent, and small accent text on light backgrounds), on `/pricing`, `/checkout`, `/checkout/confirmation`, `/cookies`.
3. Add a hover partner for it if any darkened element has a hover state.
4. Re-run axe until 0 critical/serious. **Record the measured ratios in the commit message.**
5. Tap-targets: pad the 3 failing controls to ≥44×44px (`min-h-11 min-w-11` or equivalent). Purely mechanical, no design decision.
6. Visual check that the brand still reads correctly on those four pages.

### D14.3 — The 3 security failures are NOT a code fix

They are environmental: CI runs against `https://placeholder.supabase.co`, producing `ENOTFOUND` / `404` / `500` — not real leaks. Resolved by D13.1 (real creds as repo secrets) **plus** the skip-loudly guard for fork PRs. **Blocked on the human adding the secrets.** Until then, implement the skip-loudly guard so these 3 stop failing for the wrong reason while still refusing to pass silently.

### D14.4 — Definition of green

- `npm run check` exit 0 (already true)
- `npx playwright test` → 0 failed, with the security spec either passing (secrets present) or explicitly skipped with a named reason (fork/no secrets)
- Then Task 0d: require `check` + `e2e` in branch protection

**Landing on main needs a PR and the owner's approval — do not push or merge autonomously.**

---

## D15. `074` is DECOUPLED from the base-schema dump (owner-approved, 2026-07-11)

**Ruling: Task 4 (`074` RLS closure) is UNBLOCKED. Do it next.** It no longer waits on Task 1's base-schema dump.

**Rationale.** D2 bundled two unrelated things. The genuine prerequisite was **K10 deterministic migration ordering — already done** (`800c02b`). The base-schema dump is *auditability bookkeeping*: valuable, but not a technical dependency for dropping bad policies. Leaving four live PII leaks open behind a documentation task was my sequencing error in D2, not a real constraint. `074` is applied via MCP `apply_migration`, which needs no CLI.

**Base schema (X2/K11) → demoted to a later, non-blocking task.** When picked up, either install the CLI for a true `supabase db dump`, or generate an introspection-derived file **explicitly labelled as such** (never present introspection output as a real dump — the loop's original refusal to fake it was correct).

### D15.1 — ⚠️ D12's canonical assertion is INCOMPLETE. Corrected here.

Verified against prod. D12's assertion returns **4 rows** — but there are **5 leaking tables**. It misses `enquiries`, whose permissive policy uses `USING (true)` rather than `auth.role()='authenticated'`:

| Table | Policy | `qual` | D12 catches it? |
|---|---|---|---|
| `artist_applications` | `Authenticated users can read applications` | `auth.role() = 'authenticated'` | ✅ |
| `contact_submissions` | `Authenticated can read contact` | `auth.role() = 'authenticated'` | ✅ |
| `venue_registrations` | `Authenticated can read venue reg` | `auth.role() = 'authenticated'` | ✅ |
| `waitlist_signups` | `Authenticated can read waitlist` | `auth.role() = 'authenticated'` | ✅ |
| **`enquiries`** | **`Artists can read their enquiries`** | **`true`** (to `authenticated`) | ❌ **MISSED** |

**If you close only the 4 the assertion catches, `enquiries` still leaks and the gate reports green.** Drop all five.

### D15.2 — 🚨 DO NOT drop every `USING (true)` SELECT policy

Four other tables also carry `USING (true)` SELECT policies and these are **intentional** — they are the public marketplace. Dropping them breaks the entire public site:

- `artist_profiles` (`artist_profiles_select`)
- `artist_works` (`artist_works_select`)
- `artist_collections` (`Anyone can read collections`)
- `venue_profiles` (`venue_profiles_select_public`) — table-level read is deliberate; venue PII is restricted by **column** grants (migration `071`). Verify those column grants still hold; do **not** drop the policy.

**Never write a blanket "drop all permissive SELECT policies" migration.**

### D15.3 — Replacement assertion (use this instead of D12's)

Denylist-based, so it cannot false-positive on the intentionally public tables:

```sql
-- Tables that must NEVER be readable by anon or any authenticated user at large.
-- Must return 0 rows.
select tablename, policyname, cmd, roles::text, qual
from pg_policies
where schemaname = 'public'
  and cmd = 'SELECT'
  and tablename in ('artist_applications','contact_submissions','venue_registrations',
                    'waitlist_signups','enquiries','orders','messages',
                    'customer_profiles','placement_record_versions','stripe_transfers')
  and (qual ilike '%auth.role()%authenticated%' or btrim(qual) = 'true');
```

Run it **before** (expect 5 rows) and **after** (expect 0). Paste both as evidence. Extend the table list as new private tables appear.

### D15.4 — Unchanged safety constraints

- **The `/apply` service-role switch MUST ship in the same commit** as the `artist_applications` lockdown. `api/apply/route.ts` inserts via the anon client; lock the table first and artist applications break silently. This ordering trap is NOT relaxed by this decision.
- Each dropped policy needs a scoped replacement where the table still needs legitimate reads (e.g. admin-only, or owner-scoped), not just a bare drop — check each route that reads these tables first.
- `enquiries` already has a correct owner-scoped policy (`Users can read own enquiries`, matching `sender_email` to the JWT email, plus service-role). Dropping the permissive one should leave that intact — verify, don't assume.

---

## D16. Supervisor check #1 (2026-07-11) — two loop findings resolved

Loop state: 57 commits, mid-iteration on **T3 offers (E6/E10)** — the highest-value money fix. Not stalled; the longer gap is task size. Migrations `080`/`081` correctly inside `04`'s D1 range. D15 received.

### D16.1 — `orders.shipping->>'country'` format split: **normalise on read, do NOT backfill**

The loop found 12 orders storing country in two formats (`GB` ×6, `United Kingdom` ×6) and escalated a backfill, correctly, as a write to real order rows.

**Ruling: no backfill. Do not mutate historical order records.** Instead:
1. **Write ISO-3166 alpha-2 going forward** — normalise at the write boundary in checkout before the order row is created.
2. **Normalise on read** — a single `normaliseCountry()` helper used by every reader (reports, filters, admin, shipping logic) that maps known aliases (`United Kingdom`→`GB`, etc.) and passes through anything already ISO.
3. Add a unit test covering both stored formats resolving to `GB`.

Rationale: it fixes the reporting defect completely without touching order history, needs no escalation, and is resilient if a third format ever appears. Mutating settled order records to fix a reporting bug is the wrong trade — the risk is real and the benefit is zero once readers are tolerant.

**Owner: `04` T1 hardening.** Not a blocker for T3.

### D16.2 — Client-supplied `internationalShippingPrice` is a live money vulnerability once enabled

The loop found `api/checkout` passing the **client-supplied** `item.internationalShippingPrice` into `calculateOrderShipping` without DB re-validation, while other cart prices *are* re-validated. A crafted cart sets its own international shipping cost.

Currently latent only because `ships_internationally` is false for all 14 artists. **The moment one artist opts in, this becomes exploitable** — and the natural trigger for opting in is the shipping work in `04` itself, so it could go live in the same workstream that introduces the exposure.

**Ruling: fix it as part of `04` T1, before any artist can enable international shipping.** Re-read `international_shipping_price` from the DB alongside the other price re-validation; never trust the cart's figure. Add it to the E40 price-drift test.

Track as **E47** in the findings doc — it is a new finding, not a restatement.

### D16.3 — No plan change needed elsewhere

`074` remains next after T3 per D15. Nothing else in the queue is stale.

---

## D17. Supervisor check #2 (2026-07-11) — the `free_until` overcharge, verified and ruled

**T3/E6+E10 landed (`b2c27ed`)** — accepted offers now write a complete order and pay the artist. The biggest money bug is closed. 59 commits.

### D17.1 — The overcharge is REAL, and it is a bug fix, NOT an owner decision

Verified against prod, not taken from the ledger:

- `artist_profiles` has **67 columns and `free_until` is not one of them.** The real column is **`trial_end`** (and `is_founding_artist` exists separately).
- **Mechanism — identical to Bug 15.** `webhooks/stripe/route.ts:302` runs `.select("user_id, subscription_plan, free_until")`. PostgREST rejects the whole select on the unknown column → `ap` is `null` → `platformFeePercentForArtist(null)` returns `DEFAULT_PLAN_FEE_PERCENT` = **15**. The query that would reveal the artist's plan *always fails*, so every artist is billed at the core rate.
- **Evidence from `orders`: all 12 rows show `platform_fee_percent = 15`.** Ten belong to `fin-coles`, who is `premium/active` and should be charged **8%**.

Recorded fees for `fin-coles` total **£127.18**; at 8% they would total **£67.83** — a **~£59.35** discrepancy.

**Two honest caveats:**
1. `fin-coles` is `premium` *today*; the orders span April–May and the upgrade date is unknown. The correct figure depends on when the plan started. **Do not quote £59.35 as settled.**
2. `stripe_transfers` is **empty**, so these fees may have been *recorded* without cash ever moving. Whether the artist was actually short-paid is part of the D11 Stripe reconciliation — **add this to that human task**, alongside `off_1778`/`off_1779`.

**Ruling — do this now, it needs no owner input:** remove `free_until` from every `.select()` (`webhooks/stripe/route.ts:302`, `placements/[id]/payment/setup/route.ts:47`). That alone restores correct per-plan fees. `platformFeePercentForArtist` already behaves correctly when the field is absent.

**For the free-window concept: use `trial_end`, which exists.** Map the zero-fee window to `trial_end` in the future. Do not invent a new column.

### D17.2 — The one genuine owner question (small)

The referral path (`webhooks/stripe/route.ts:879-898`) *writes* to `free_until`, extending a referrer's free window by 30 days. `trial_end` is Stripe-managed, so writing app-side referral credit into it is questionable. **Owner decides:** drop referral credit, add a dedicated `referral_free_until` column, or accept writing to `trial_end`. **This does not block D17.1** — the read-path fix stands regardless.

### D17.3 — Kill the phantom-column CLASS (three instances now)

`orders.amount_cents` (Bug 15), the shipping-scope column (migration `081`), and now `free_until`. Same failure every time: a `.select()` names a column that does not exist, PostgREST rejects the entire query, the `|| []` / `null` fallback yields a **plausible but wrong** value, and nothing errors. This class is expensive precisely because it fails silently and looks like a data problem.

**Mandate a structural guard — and note this replaces the expensive half of K11:**
1. Generate `website/supabase/schema-columns.json` from prod (`information_schema.columns`, table → column list). Committed, regenerable, human-readable.
2. Add a test that scans every `.from("X").select("...")` in `src/` and fails on any column absent from the snapshot.
3. Run the sweep once now and fix every hit.

This delivers K11's actual value (a committed, auditable schema record) far more cheaply than `supabase db dump`, and unlike the dump it *actively prevents* the bug. **X2/K11's pg_dump requirement is downgraded to optional.** Owner: `02`, but pull it forward — every payment task depends on selects being correct.

Reference (prod, verified): `artist_profiles` 67 cols · `orders` 27 · `placements` 36 · `purchase_offers` 21 · `venue_profiles` 40 · `artist_works` 21 · `stripe_transfers` 11 · `curation_requests` 24.

---

## D18. CORRECTION to D17.1 — `free_until` has FIVE select sites, not two, with three distinct live consequences

**D17.1 named two sites. That was wrong and incomplete.** Verified by grep against the current tree. Fixing only the two named would leave two live bugs and a third partially open. Read this before starting task 7a.

### The five `.select()` sites

| # | Site | Consequence if left |
|---|---|---|
| 1 | `api/webhooks/stripe/route.ts:359` | Sale platform fee = 15% for every artist *(known, D17.1)* |
| 2 | `api/placements/[id]/payment/setup/route.ts:47` | Paid-loan `application_fee_percent` wrong *(known, D17.1)* |
| 3 | **`lib/placements/paid-loan-billing.ts:417`** | **NEW — recurring paid-loan payouts** |
| 4 | **`lib/visualizer/tier-resolver.ts:95`** | **NEW — every artist downgraded to the free tier** |
| 5 | `api/webhooks/stripe/route.ts:819` | Referral write path — the D17.2 owner question |

### The two newly-found consequences, traced

**Site 3 — paid-loan payouts are also over-charged.** `paid-loan-billing.ts:417` selects `free_until` → `artistProfile` is undefined → `platformFeePercentForArtist(null)` → **15%** → `artistShareCents` computed at `1 - 0.15` regardless of plan. Same overcharge as the sale path, applied to **recurring** loan revenue. D17.1 missed this because it is in `lib/`, not a route.

**Site 4 — paying artists silently lose their visualizer tier.** `tier-resolver.ts:95` `readArtistTier` selects `free_until` → PostgREST error → the `if (error)` branch logs a warning and **returns `null`** → falls through to `readVenueTier` → `null` → the resolver returns **`"customer"`**. So **every artist, on every plan, is resolved to the free customer tier** and gets customer-level visualizer quota/limits. This is the mirror image of the fee bug: there Wallplace over-charges, here it under-delivers a paid feature. A Pro artist paying £49.99/month is silently on the free tier.

*(Note site 4 does at least log `[visualizer] artist_profiles lookup failed:` — grep production logs for that string to confirm how long it has been firing.)*

### Ruling

**Fix all five in ONE commit.** They share a single root cause; splitting them invites a partial fix that reports success while two consequences remain live. Sites 1–4: drop `free_until` from the select (and map the free-window to **`trial_end`**, which exists). Site 5 stays until D17.2 is answered, but must be explicitly *deferred with a comment*, not silently left.

**Regression test:** assert no `.select()` string in `src/` contains `free_until`, plus a unit test that `platformFeePercentForArtist` returns 8 for a premium artist and 5 for pro. Add a `tier-resolver` test asserting a premium artist resolves to a premium tier, not `customer`.

### Why this matters beyond `free_until`

I found sites 3 and 4 with a two-second grep that D17 did not run — I reasoned from the two sites the loop had reported instead of enumerating them. **This is precisely the failure mode D17.3's schema-column guard exists to eliminate**: a lint over every `.select()` would have listed all five automatically and could not have missed two. **Raise 7b (the guard) to run immediately after 7a**, not later in `02`. The manual sweep it mandates must cover the whole of `src/`, not just the sites already known.

---

## D19. The phantom-column class is bigger than believed — and it has killed two cron jobs

Loop idle 22 min (a normal long wakeup; D18 unconsumed). No plan conflict to resolve, so this cycle went to ground truth: **the Postgres error log, which nobody had checked.** It is the fastest phantom-column detector available and it changes the picture.

### D19.1 — Live errors in the last 24h (prod, `get_logs(postgres)`)

```
ERROR  column "free_until" does not exist                    ← D17/D18, pending
ERROR  column "amount_cents" does not exist                  ← Bug 15, fixed
ERROR  column placements.end_date does not exist             ← NEW
ERROR  column artist_profiles.artist_statement does not exist ← NEW
ERROR  column analytics_events.venue_slug does not exist     ← NEW (×9 in one burst)
```

**At least five distinct phantom columns are failing in production right now**, not the three D17.3 assumed.

### D19.2 — 🔴 TWO CRON JOBS HAVE NEVER WORKED

**`cron/placement-ending-soon/route.ts:30`** selects `end_date`. `placements` has no such column (36 columns; the nearest are `collected_at`, `cancelled_at`). The source comment admits the guess: *"map from whichever DB column holds it. Common options: `end_date`, `ends_at`, `collected_at`."* Someone guessed, guessed wrong, and nothing ever surfaced it. **The entire "your placement is ending soon" email has never sent.**

**`cron/onboarding-nudges/route.ts:51`** selects `artist_statement, profile_photo` from `artist_profiles`. **Neither exists** (the real columns are `short_bio`/`extended_bio` and `profile_image`). The whole artist query fails → **every artist onboarding nudge is dead.**

**The proof is in `email_events`, and it is unusually clean.** That one cron has two branches. The *venue* branch (`:217`) selects only real columns and works: `venue_photo_upload_nudge:4`, `venue_space_details_nudge:4`, `venue_art_preferences_nudge:3`, `venue_first_placement_cta:2` all delivered. The *artist* branch names two phantom columns and has delivered **zero** — no profile-completion, first-artwork, connect-Stripe or placement-preferences nudge has ever been sent. Same cron, same schedule, same mailer; the only difference is column validity. `placement_ending_soon` is likewise absent from all 238 sends.

**This means the email audit's "66 wired" is overstated.** A trigger whose query always fails is not wired — it is dead code that reports success. Re-derive the wired count by cross-checking each trigger's select against the schema, not by the presence of a `sendEmail` call.

### D19.3 — `analytics_events.venue_slug` (×9 in one burst)

`analytics_events` has `venue_user_id` and `venue_name` — **not** `venue_slug`. The table holds **4,889 rows**. So venue-side analytics is querying a column that cannot exist while nearly five thousand events sit unread; a venue viewing analytics sees nothing. My grep did not locate the source site (it is not a literal `venue_slug` string near "analytics"), so **the sweep must find it** — this is exactly why a lint beats grepping.

### D19.4 — Rulings

1. **Raise 7b (schema-column guard) to run IMMEDIATELY after 7a.** It is no longer a tidy-up; it is the only thing that finds this class reliably. Two of five instances were invisible to code review and to me.
2. **The sweep must cover `src/app/api/cron/**` explicitly.** Cron failures are invisible — no user complains, nothing 500s in a user's face. All 8 crons need every select validated.
3. **Add the Postgres error log as a standing discovery source.** Run `get_logs(postgres)` and grep `does not exist` at the start of any DB-touching task. It found in one call what code review missed across a nine-document audit.
4. **Fix the two dead crons as part of 7b**, not later: map `end_date` → the correct placement lifecycle column (decide between `collected_at` and a new explicit column — flag if genuinely ambiguous), and `artist_statement`/`profile_photo` → `extended_bio`/`profile_image`.
5. **Correct the email findings**: `09-emails.md`'s wired/unwired tally is unreliable until every trigger's select is schema-validated.

**No owner input needed for any of this.**

---

## D20. Supervisor check #4 — 7a verified good; the referral promise is live and undeliverable

**7a landed correctly (`6e0705e`).** Verified by grep, not by the ledger: sites 1–4 all now key on `trial_end` (`paid-loan-billing.ts:417`, `payment/setup:47`, `webhooks:359`, and `tier-resolver` dropped the column entirely). The only real `free_until` select left is site 5, the referral path, which D18 deferred. **The fix is complete and correct.** Credit where due: the loop also caught that its own Probe C "passed on the first attempt, which was a hole in the guard, not a pass" — that is the right instinct.

**One D18 requirement missed (minor):** site 5 was left *silently*. D18 required it be "explicitly deferred with a comment, not silently left". Add a one-line comment at `webhooks/stripe/route.ts:819` pointing at D17.2/D20 so the next reader does not think it was overlooked.

### D20.1 — 🔴 New finding (E48): the referral reward is advertised and cannot be delivered

`artist-portal/billing/page.tsx:390` shows every artist with a referral code:

> **"Refer another artist and get 30 days free when they upgrade to a paid plan."**

The credit path that would honour it (`webhooks/stripe/route.ts:817-831`) `.select("id, free_until")` and then `.update({ free_until: ... })` on a column that **does not exist**. PostgREST rejects the select, `referrer` is null, the `if (referrer)` block never executes, and no credit is ever applied. Even if it ran, the update would fail too. **The reward has never been paid and, as written, never can be.**

**Blast radius — verified in prod, and it is small:**
- 7 artists have a referral code displayed to them
- **0** artists have ever used one (`referred_by_code` is null on all 14)
- **0** referrals ever credited (`referral_credited_at` null on all 14)

**So nobody is owed restitution.** This is a promise that has not yet been tested, not a debt. But it fails the first time anyone uses it, and it fails *silently* — the referrer simply never gets their month and nothing errors.

### D20.2 — Owner decision, reframed (supersedes D17.2)

D17.2 asked "do you want a free-window concept". That was the wrong question. The right one:

**You are advertising a 30-day reward in the product. Deliver it or stop advertising it.**

- **(a) Deliver it** — add a real `referral_free_until` column (do **not** write app-side credit into `trial_end`, which Stripe manages), and have `platformFeePercentForArtist` honour whichever of `trial_end` / `referral_free_until` is later. Correct, ~one migration plus the webhook branch.
- **(b) Remove the promise** — delete the block at `billing/page.tsx:383-407` and the dead webhook branch. One commit, honest immediately.

**Not urgent** (zero claims), **but it must be resolved before any referral marketing or launch push** — the first successful referral is the one that breaks. Recommend (b) now and (a) later if referrals become a growth lever, since shipping a promise you can't keep is worse than not offering it.

**Log as E48 in the findings doc.** No code change until the owner picks.

---

## D21. 7b's narrow guard is a DENYLIST — it cannot see the D19 columns. Full form is required.

Loop idle 25 min (normal long wakeup). D19/D20 unconsumed. This cycle went to verifying the 7b guard rather than inventing work.

### D21.1 — Credit where due

`tests/integration/phantom-columns.test.ts` is well built, and two of its design choices are better than what D17.3 asked for:
- **Exemptions match the exact column list, not the file.** The loop's own comment records why: a file-level exemption *silently un-guarded the fee select in the same file*, so reverting the D17.1 fix left the suite green. It found that **by probing the guard instead of trusting it** — the right instinct, and the same one that should be applied everywhere in this plan.
- **`KNOWN_UNFIXED` is kept separate from `EXEMPT`** "so nobody reads a bug as a decision", with a ratchet that may shrink but never grow.

It also found two phantom columns nobody had reported: **`artist_works.in_store_price`** and **`placements.requester_user_id`** (the latter woven through ~20 sites in `placements/route.ts`, costing one guaranteed-rejected query per request).

### D21.2 — But it is a denylist, and that is the wrong shape

`PHANTOM` is a hardcoded map of **four** known-bad columns. It flags only what someone already discovered. It therefore **does not contain, and cannot detect**, the four columns D19 confirmed failing in production:

| Column | Consequence | In `PHANTOM`? |
|---|---|---|
| `placements.end_date` | `placement-ending-soon` cron dead | ❌ |
| `artist_profiles.artist_statement` | `onboarding-nudges` artist branch dead | ❌ |
| `artist_profiles.profile_photo` | same select, same cron | ❌ |
| `analytics_events.venue_slug` | venue analytics reads nothing (4,889 rows) | ❌ |

**So the suite is green today while two cron jobs are dead and venue analytics is broken.** A denylist can only ever ratify what you already knew — which is precisely how five phantom columns accumulated unnoticed in the first place.

⚠️ **Ledger wording risk:** row 7b reads "narrow form done". That can be read as the class being handled. It is not. Amend it to "narrow form done — denylist only, does NOT detect unknown phantoms; full form outstanding".

### D21.3 — Ruling: build the full allowlist form now

The obstacle that justified going narrow is gone. The guard's own note says the naive version "cried wolf on `stripe_transfers.amount_cents`, which is a real column" — a table-awareness problem, and the parser is **already table-aware** (it captures `.from("x")` with its `.select(...)`). So an allowlist is now safe.

1. Generate `website/supabase/schema-columns.json` from prod via the Supabase MCP:
```sql
select table_name, json_agg(column_name order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public'
group by table_name order by table_name;
```
2. Invert the check: for each `.from(t).select(cols)`, **fail on any column not present in `schema-columns.json[t]`**. Keep `EXEMPT`, `KNOWN_UNFIXED` and the ratchet exactly as they are — they are the good parts.
3. Handle the known parser edges explicitly rather than exempting broadly: `*`, embedded joins (`venue:venue_profiles(name)`), aliases (`x:y`), and computed aggregates.
4. **Expect the four D19 columns to fail immediately.** That is the acceptance test for the guard: if switching to the allowlist does not surface them, the guard is still wrong. Fix the two dead crons (D19.2) and the analytics select (D19.3) as part of this.
5. Regenerate `schema-columns.json` whenever a migration lands; note it in the migration checklist.

No owner input needed.

---

## D22. ⏱️ PACING DIRECTIVE — cut the inter-iteration delay to the 60s floor (owner instruction)

**Owner instruction, 2026-07-11: the gaps between iterations are far too long. Shorten them.**

### The measurement

Actual gaps between consecutive commits on this branch:

```
a02c38e -> dd8f72e :  1 min     <- work
dd8f72e -> b2c27ed : 29 min     <- IDLE
b2c27ed -> ffa617c :  1 min     <- work
ffa617c -> 979141f : 29 min     <- IDLE
979141f -> 451cf53 :  0 min     <- work
451cf53 -> 660620a :  0 min     <- work
660620a -> 6e0705e : 27 min     <- IDLE
6e0705e -> ef7d848 :  0 min     <- work
ef7d848 -> 5ccf266 : 30 min     <- IDLE
5ccf266 -> 6fe6fb9 :  0 min     <- work
```

**The work takes 0–1 minutes. The waiting takes 27–30.** Roughly 97% of elapsed time is an idle `ScheduleWakeup` delay doing nothing.

At ~29 minutes of dead time per task, with roughly 50–100 tasks left in the dependency order, that is **24–48 hours of pure waiting**. At the 60-second floor it is **under two hours**. Same work, same care, same evidence standard.

### Ruling

**Use `delaySeconds: 60` (the tool's minimum) between iterations. Default to it. Do not pick 1200–1800.**

The 1200–1800s guidance in the `ScheduleWakeup` tool description is for loops **waiting on external state** — a CI run, a deploy, a queue — where waking early just burns a turn on unchanged state. **This loop is not that.** Every task here is local: read source, edit, write a test, run `npm run check`, commit. Nothing external gates the next task, so there is nothing for a long delay to wait for. A long fallback heartbeat is correct only when a Monitor is armed and is the primary wake signal; no Monitor is armed here.

**The only legitimate reason to pick a longer delay** is a genuine external dependency — and if you do, say explicitly in the report what you are waiting for and why. "Self-pacing" is not a reason.

This changes pacing only. **It does not relax any standard:** one task per iteration, the regression test must be verified failing before the fix, `npm run check` green before commit, evidence pasted, no bundling. Do not trade rigour for speed — the instruction is to stop idling, not to hurry.

---

## D23. D1 migration ranges were incomplete — allocating the missing five

**My error in D1.** I assigned ranges to `02`, `04`, `07` and `09` only, on the assumption the other docs were code-only. That was wrong: `01` needed a migration for E22 and correctly fell back to the "Reserved 098+" band (`098_artwork_request_response_single_fulfilment.sql`). `03` will certainly need one — D5 requires **creating and backfilling `admin_users`**, which does not exist in prod.

**Full allocation (supersedes the D1 table):**

| Doc | Range | Used so far |
|---|---|---|
| `02` RLS/DB/storage | 074–079 | `074` |
| `04` payments | 080–089 | `080`, `081` |
| `07` unknot | 090–094 | — |
| `09` emails | 095–097 | — |
| **`01` authz** | **098–099** | `098` ✅ (already correct) |
| **`03` auth/admin** | **100–104** | — (`admin_users` create + backfill lands here) |
| **`05` frontend** | **105–107** | — |
| **`06` validation** | **108–109** | — |
| **`08` cull** | **110–112** | — |
| Reserved | 113+ | — |

`098` stays where it is. No renumbering — it is inside `01`'s range as now defined, and moving an applied migration would be strictly worse than a one-line doc fix.

**Rule unchanged:** before writing a migration, `ls website/supabase/migrations/ | tail -5` and take the next free number **inside your doc's range**. If your doc has no range, it now does — do not improvise into Reserved.

No owner input needed.

---

## D24. Two standing rules the loop earned the hard way — apply them to 7b BEFORE writing it

Not new work. Two lessons the loop paid for three times over this session, promoted to rules because **the next guard in the queue (7b's allowlist form) will hit both**.

### D24.1 — An assertion over source must read *executable* source

Any test that greps the codebase must **strip comments (and ideally string literals) before scanning**. This has now bitten twice:
- Iteration 2, the CI-gates test, needed it for YAML.
- Item 14, the authz-error gate: once block-scoped, it **flagged its own explanatory comments**, because those comments contain the literal `` `} catch {` ``.

**This lands directly on 7b.** The full allowlist guard parses `.from("x").select("...")` out of source. Un-stripped, it will match selects inside comments, doc blocks and the very `PHANTOM`/`KNOWN_UNFIXED` tables that document phantom columns by name — producing false positives that make the guard look broken and invite someone to weaken it. **Strip comments first. Prefer block-scoped brace-walking over a fixed character window** (item 14's original 400-char window silently stopped matching once the comments grew).

### D24.2 — A guard that passes on the first probe is suspect until proven otherwise

**Three times this session, a probe passing immediately meant the guard was wrong, not that the code was right:**
1. The `EXEMPT` file-level match silently un-guarded the fee select in the same file — reverting D17.1 left the suite green.
2. Item 14's Probe B passed because the window was too short *and* it searched the whole file rather than the catch block.
3. Probe C on the phantom-column guard, recorded earlier as "a hole in the guard, not a pass".

**Rule: when you add a guard, revert the thing it protects and confirm it fails.** If it does not fail, the guard is wrong — fix the guard before trusting it. A green suite is evidence only when you have seen it go red for the right reason.

Both rules are already the loop's practice. They are written down so they survive into `05`, `07`, `08` and `09`, where several more source-reading assertions are planned.

### D24.3 — Credit, and one thing to carry forward

Item 14 is a good example of the payoff: the stricter gate immediately found **a real miss of its own** (a fourth `placements` catch that bound and logged the error but still flattened `AuthzError` to a blanket 400), and surfaced a pre-existing hidden failure — `db.from(...).select(...).or is not a function`, an incomplete test fixture that had been masked behind a 400 for the whole session. Tests still passed because they asserted a refusal and got one, for the wrong reason.

**Carry forward:** a test asserting "it refused" is weaker than one asserting "it refused *with this status, for this reason*". Where cheap, assert the reason.

No owner input needed.
