# Wallplace full remediation and regression-proofing — design

**Date:** 2026-06-14
**Status:** Approved (design). Implementation plan to follow in `website/docs/plans/`.
**Author:** drafted with Claude Code; to be executed in a fresh session.

---

## 1. Why this exists

Three stacks of outstanding work remain after the 44-bug cleanup (merged in #55):

1. **Weekly QA audit, 2026-06-08** — 39 findings across 7 severity buckets (8 critical blockers, plus broken functionality, UX/nav, role/permission, mobile, missing journeys, polish). All 8 critical blockers were verified real against current `main`.
2. **Four deferred 44-bug items** — Bug 6 (nav inconsistency), Bug 15 (cart leaks across sessions/roles), Bug 20 (`/browse` filters not synced to URL), Bug 42 (104 unused indexes).
3. **Genuine `AUDIT.md` residuals** — defence-in-depth RLS read restriction, contracts bucket privacy verification, CSP report-only → enforce decision. (Most of the original `AUDIT.md` launch checklist is already done; only these three remain.)

The brief is not only "fix everything". It is "stop the site cropping up with new bugs when I fix things, run smoothly and be efficient." That second half is the design driver.

**The recurrence problem.** Every cluster in the audit is the same mistake copied across files:

| Bug class | Times repeated | Findings |
|---|---|---|
| PostgREST `.or()` filter injection | 3 | 1.1, 1.2, 1.3 |
| Admin authorization, three different ways | 3 | 1.4, 1.5, dashboard |
| Outreach cap, two diverged inline copies | 3 | 1.6, 1.7 (plus the correct shared helper) |
| Redirect param handled ad-hoc | 5 | 3.1 to 3.5 |
| Tap-target / min-width overflow | 8 | 5.1 to 5.8 |
| Fire-and-forget on critical side effects | 2+ | 2.2, 7.3 |

Patches alone leave the *pattern* in place, so the next edit reintroduces the bug. The fix is to collapse each class to one implementation and gate it.

---

## 2. Core idea: collapse the pattern, enforce with a gate

For each bug class, the fix and the guardrail are the same change. Four enforcement layers, defence-in-depth against regressions:

1. **One shared helper per class.** Divergence becomes impossible because there is a single owner.
2. **One automated rule per class.** Reintroducing the raw pattern fails `npm run lint` (custom ESLint rule) or `npm run depcheck` (dependency-cruiser edge), and therefore fails CI.
3. **Tests that lock the behaviour.** Injection neutralised, admin rejects non-admin, cap aggregates across surfaces, redirect survives signup, money mutation is idempotent. Plus a Playwright tap-target and axe audit for what static rules cannot measure.
4. **Required CI checks on `main`.** lint + types + unit + build + Supabase advisors must pass to merge. Branch protection is the one toggle the human flips.

---

## 3. Shared-knowledge and lineage approach

The instinct to "track every dependency and lineage" is correct in spirit (shared knowledge prevents regressions) but wrong in dose. A hand-maintained graph of every file and function relationship rots faster than it can be maintained and ends up misleading. Most lineage already lives in things that cannot silently drift: git history is the change lineage, TypeScript types are the contracts, tests are the executable behaviour.

What this plan invests in instead, the enforced and curated subset:

- **dependency-cruiser rules in CI** for the edges that actually cause bugs. Starter set:
  - client components and browser code must never import `getSupabaseAdmin` / the service-role client.
  - API route handlers must import the canonical admin gate, not re-implement an admin check.
  - nothing outside `src/lib/db/` may call `.from(...).or(...)` with a raw template literal.
- **The canonical-pattern registry** (section 4) kept in-repo next to the code, one row per bug-class. This is the "what's going on" reference: where the one true helper lives and what enforces it.
- **ADRs** (`website/docs/adr/NNNN-title.md`) for the non-obvious decisions (one admin gate, `?next=` canonical, cap aggregates across surfaces, defence-in-depth view design) so a future session does not unknowingly undo them.
- **The existing auto-memory and the spec/plan docs**, updated in the same PR that changes a decision.

Principle: a doc that is not enforced rots; prefer executable knowledge (types, tests, CI rules) and keep prose docs thin and current.

---

## 4. Canonical-pattern registry

The single source of "how we do X". Each row is created or consolidated during the phase noted. Reintroducing a raw pattern fails the listed gate.

| Bug class | Canonical module (one owner) | Automated gate | Locking test | Phase |
|---|---|---|---|---|
| DB `.or()` filters | `src/lib/db/safe-filter.ts` — `orFilter(terms[])` validates/escapes values | ESLint `no-raw-or-filter` | injection input neutralised | 1 |
| Admin authorization | `src/lib/admin-auth.ts` — `requireAdmin(req)` boolean variant (email allowlist AND `user_metadata.user_type==="admin"`) | ESLint `no-inline-admin-check` | 403 non-admin; 403 allowlisted-email-without-metadata | 1 |
| Service-role isolation | `getSupabaseAdmin()` server-only | dependency-cruiser edge ban | n/a (graph rule) | 1 |
| Outreach cap | `src/lib/outreach-cap.ts` — `checkArtistOutreachCap` (already correct) | ESLint `no-ad-hoc-cap` | 2 placements + 1 message on Core (cap 2) blocked | 3 |
| Redirect handling | `src/lib/safe-redirect.ts` + `?next=` canonical | ESLint `no-redirect-param` | redirect preserved through each signup path | 4 |
| Critical side-effects | await, or enqueue via Inngest | ESLint `no-unawaited-critical-sideeffect` (denylist `executeTransfer`, `notify*`) | transfer/email failure surfaced or persisted | 2 |
| Money mutations | `withIdempotency` + conditional `.eq("status","pending")` update + Stripe `Idempotency-Key` | code review + test | concurrent double-process yields one effect | 2 |
| Touch targets / responsive tables | `src/components/ui/Button.tsx` (>=44px) + table-to-card pattern | Playwright tap-target + axe audit (runtime, not lint) | interactive targets >=44px on key pages | 5 |
| API response contracts | shared response types co-located with each route | `tsc` + test | refund-history field name matches | 2 |

Honest gap: tap-target sizing cannot be reliably linted from Tailwind classes, so finding 5.x is enforced by the Playwright audit, not an ESLint rule. Everything else gets a static gate.

---

## 5. Scope

**In:**
- All 39 weekly-audit findings (2026-06-08).
- The four deferred 44-bug items: 6, 15, 20, 42.
- The three genuine `AUDIT.md` residuals: defence-in-depth RLS view, contracts bucket privacy, CSP enforce decision.
- The full guardrail layer: shared helpers, ESLint plugin, dependency-cruiser rules, test backfill, canonical-pattern registry, ADRs, required CI checks.

**Parked (flagged, not silently dropped):** `AUDIT.md` "nice-to-have after launch" — penetration test, admin 2FA, BIMI/verified sender, malware scanning on uploads, visual-regression tests. None of these serves "stop new bugs / run smoothly"; revisit post-launch.

---

## 6. Phases

Six review-sized PRs plus a tiny Phase 0, criticals first. The human runs `/review` on each and merges before the next starts. Every finding is mapped; nothing floats.

### Phase 0 — Foundation (tiny)
- Persist the 2026-06-08 audit to `website/docs/qa/2026-06-08-weekly-audit.md` (the diff baseline it expects).
- Scaffold the local ESLint plugin (`eslint-plugin-wallplace` or inline rules dir) and a dependency-cruiser config, both wired to `npm run lint` but initially warn-only so later phases turn rules to error as the code is cleaned.
- **Acceptance:** `npm run check` green; audit file present; lint harness runs.

### Phase 1 — Authorization and injection criticals (DB)
- Fixes: 1.1, 1.2, 1.3 (`.or()` injection), 1.4, 1.5 (admin gate), 4.1 (artist self-approval), 4.2 (audit-before-return), 4.3 (offers customer gate).
- Guardrails: `safe-filter.ts` + `no-raw-or-filter`; `requireAdmin()` boolean + `no-inline-admin-check`; service-role dependency-cruiser edge.
- DB migration: defence-in-depth read restriction (a `*_public` view + column limits, or tightened SELECT policies) for `venue_profiles`, `artist_profiles`, `artist_works`, `artist_collections`. Validate on a Supabase branch, then apply via MCP.
- **Acceptance:** injection tests pass; every admin route 403s non-admin and allowlisted-email-without-metadata; advisors show no new lints; `npm run check` green.

### Phase 2 — Financial integrity and reliability
- Fixes: 1.8 (refund idempotency), 2.2 (await transfer), 2.3 (framed pricing → 409), 7.3 (await status email), 2.1 / 6.1 (refund-history contract drift), Bug 15 (cart leaks across sessions/roles).
- Guardrails: `withIdempotency`; `no-unawaited-critical-sideeffect`.
- **Acceptance:** concurrent refund-process yields a single Stripe effect; transfer failure is persisted/surfaced; tampered framed price rejected; refund history renders; cart is isolated per user/session (verified in preview); `npm run check` green.

### Phase 3 — Outreach cap consolidation
- Fixes: 1.6 (placements), 1.7 (messages) routed through `checkArtistOutreachCap`; delete the two inline counters.
- Guardrail: `no-ad-hoc-cap`.
- **Acceptance:** cross-surface aggregation test passes; both inline counters gone; `npm run check` green.

### Phase 4 — Redirect funnel, navigation, UX
- Fixes: 3.1 to 3.5 (canonical `?next=` + back-compat `?redirect=` shim; signup role pages forward `next`; signup confirm pages honour inbound `next`), 3.6 (footer duplicate link), 3.7 / 3.8 (modal close affordances), 3.9 (checkout labels), 6.2 (galleries semantic page), 6.3 (confirmation "what next"), 7.1 / 7.4 (copy), Bug 6 (nav: unify or document the four role nav sets as a decision + ADR), Bug 20 (`/browse` URL filter sync).
- Guardrails: `safe-redirect` canonical + `no-redirect-param`.
- **Acceptance:** redirect preserved end-to-end through artist/venue/customer signup (tests); no duplicate footer hrefs; modals closeable by X and Escape; `npm run check` green.

### Phase 5 — Mobile and accessibility
- Fixes: 2.4 (portal sidebar height fights mobile chrome, move to `100dvh`), 5.1 to 5.8 (tap targets, min-width overflow), 7.2 (decorative image a11y).
- Guardrails: shared `Button`/touch-target component (>=44px); table-to-card responsive pattern; Playwright tap-target + axe audit on pricing, checkout, cookies, artist/venue portals.
- **Acceptance:** audit asserts all interactive targets >=44px on the named pages; axe clean; `npm run check` green.

### Phase 6 — Performance and prevention finalisation (DB)
- Fixes: Bug 42 (drop only EXPLAIN-verified zero-scan, non-constraint indexes, validated on a Supabase branch, applied via MCP), contracts bucket privacy verification (confirm bucket is private via MCP; code is already private-ready), CSP report-only → enforce decision (flip only if report logs are clean, else document).
- Guardrails: turn all custom ESLint + dependency-cruiser rules from warn to error; make lint + types + unit + build + advisors required checks; re-baseline the advisor snapshot; optional weekly-audit diff script computing NEW/FIXED/STILL-OPEN.
- **Acceptance:** advisors clean of the targeted lints; rules at error level; `npm run check` green; re-baselined snapshot committed.

"Run smoothly / efficient" is delivered by Phase 2 (no lost money or emails from un-awaited side effects) and Phase 6 (index cleanup, query tidy).

---

## 7. Database handling

Each migration is a file in `website/supabase/migrations/<timestamp>_<name>.sql`, validated on a Supabase **branch** DB first, then applied to the live `Wallplace` project (`uwkuhygwvasdzwsusiym`) via the Supabase MCP. Two migrations total: Phase 1 (RLS defence-in-depth view) and Phase 6 (verified index drops). Re-run advisors after each apply and confirm no new lints.

---

## 8. What the human owns

- Bug 21 — Stripe public business name "Wallspace" → "Wallplace" (Stripe dashboard).
- Bug 37 — leaked-password protection (Supabase dashboard, Auth).
- Contracts bucket set to private (Supabase dashboard, if not already).
- Branch protection on `main` requiring the CI checks (GitHub setting).
- Merging each PR. The executing session never pushes to `main`.

---

## 9. Risks and decisions

- **Bug 15 (cart) and Bug 20 (browse URL)** were deferred previously for runtime risk (purchase-path change; replace-loop risk in a 2700-line client page). They stay in scope, covered by tests and preview verification, but are the two highest-regression-risk items. Cut them back to deferred if appetite is low.
- **CSP enforce** can break Stripe/Supabase embeds. Flip report-only → enforce only after confirming report logs are clean; otherwise leave report-only with a documented reason.
- **Finding 1.5 nuance:** the refund admin check uses `admin_users` table membership, which is a different model rather than strictly weaker than email-only. The real teeth at that endpoint are the inconsistent admin model and finding 4.1 (artist self-approval). Both addressed in Phase 1.
- **Index drops (Bug 42)** are partially irreversible on a busy table. Only drop indexes with confirmed zero scans in `pg_stat_user_indexes` and no constraint backing; log anything skipped.

---

## 10. Handoff: starting the execution session

This spec and the forthcoming plan are committed on branch `claude/great-proskuriakova-817414`. Because pushes to the remote are blocked here, land these docs on `main` (or branch the execution session from this branch) so the executing session can read them.

The execution session should:
1. Read this spec and `website/docs/plans/2026-06-14-full-remediation-plan.md` (the task-by-task plan).
2. Work one phase per PR, in order, via `superpowers:using-git-worktrees` + `superpowers:subagent-driven-development`.
3. Run the validation gate per phase: `cd website && npm run check`, the relevant tests, and (DB phases) advisor checks on a branch DB.
4. Open a PR per phase, report, and stop for `/review` before the next phase.
