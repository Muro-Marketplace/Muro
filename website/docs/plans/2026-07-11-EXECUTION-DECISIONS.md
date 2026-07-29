# Execution Decisions — authoritative conflict resolution

**Created:** 2026-07-11 · **Status:** binding
**Precedence:** THIS DOC OVERRIDES the nine `implementation/*.md` docs wherever they disagree. Read it before touching any of them.

A coherence review of the nine independently-written plans found conflicts, duplicated ownership, stale content and gaps. Every one is resolved below. Where a doc contradicts this file, **this file wins**.

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
