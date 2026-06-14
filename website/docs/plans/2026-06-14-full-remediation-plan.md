# Wallplace Full Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is executed TDD-style: write the failing test, run it and watch it fail, implement the minimal change, run it and watch it pass, commit.

**Goal:** Fix all 39 findings from the 2026-06-08 weekly audit, the 4 deferred 44-bug items, and the 3 `AUDIT.md` residuals, while collapsing each recurring bug-class into one shared helper guarded by an automated rule, so the same bug cannot be reintroduced.

**Architecture:** Six review-sized PRs, criticals first. For each bug-class the fix and the guardrail are the same change: one canonical module + one CI gate (custom ESLint rule or dependency-cruiser edge) + locking tests. DB changes are migration files validated on a Supabase branch then applied to the live project via MCP.

**Tech Stack:** Next.js 16 (App Router), Supabase Postgres + Auth + Storage, Stripe, Vitest, Playwright, ESLint (flat config), dependency-cruiser.

**Spec:** `website/docs/specs/2026-06-14-full-remediation-design.md` (read first).

---

## Session kickoff (paste into the executing session)

> You are executing the Wallplace full-remediation plan. Read `website/docs/specs/2026-06-14-full-remediation-design.md` and `website/docs/plans/2026-06-14-full-remediation-plan.md` first. Work ONE phase per PR, in order (0 to 6). For each phase: create a worktree via `superpowers:using-git-worktrees` (branch `claude/remediation-p<N>-<short>`), execute every task via `superpowers:subagent-driven-development` (one implementer subagent per task, two-stage review), run the per-phase validation gate, open a PR titled `fix(remediation/p<N>): <one-liner>` listing the findings closed, report the URL, and STOP for `/review` before the next phase. Never push to `main`. Never run `supabase db push --linked` without `--branch`. DB migrations: write the file, validate on a Supabase branch, apply to live `uwkuhygwvasdzwsusiym` via MCP, re-run advisors. Supabase is connected via MCP. The human owns Bug 21 (Stripe name), Bug 37 (leaked-password), the contracts-bucket-private toggle, branch protection, and merging.

---

## File structure

**New canonical modules (the single owner per bug-class):**
- `src/lib/db/safe-filter.ts` — `orFilter(terms)` for safe PostgREST `.or()` (Phase 1)
- `src/lib/admin-auth.ts` — extend with `isAdminRequest(req)` boolean gate (Phase 1)
- `src/lib/api/idempotency.ts` — `withIdempotency` + conditional-status-update helper (Phase 2)
- `src/components/ui/Button.tsx` — touch-target-safe button (>=44px) (Phase 5)
- `src/lib/safe-redirect.ts` — already exists; becomes the only redirect resolver (Phase 4)
- `src/lib/outreach-cap.ts` — already exists and is correct; becomes the only cap (Phase 3)

**New enforcement:**
- `eslint-rules/` (local flat-config plugin): `no-raw-or-filter`, `no-inline-admin-check`, `no-ad-hoc-cap`, `no-redirect-param`, `no-unawaited-critical-sideeffect`
- `.dependency-cruiser.cjs` — forbidden-edge rules (service-role isolation, admin-gate import)
- `tests/e2e/tap-targets.spec.ts` + `tests/e2e/a11y.spec.ts` — Playwright runtime audits (Phase 5)

**New docs:**
- `website/docs/qa/2026-06-08-weekly-audit.md` — persisted audit (Phase 0)
- `website/docs/adr/0001-one-admin-gate.md`, `0002-next-canonical-redirect.md`, `0003-outreach-cap-aggregates.md`, `0004-defence-in-depth-view.md` (created in the phase that makes each decision)
- `website/docs/specs/2026-06-14-full-remediation-design.md` § 4 — the canonical-pattern registry (source of truth)

**Migrations:** `website/supabase/migrations/071_defence_in_depth_views.sql` (Phase 1), `072_drop_unused_indexes.sql` (Phase 6).

---

## Phase 0 — Foundation

### Task 0.1: Persist the weekly audit
**Files:** `website/docs/qa/2026-06-08-weekly-audit.md`
- [x] Already created 2026-06-14 (committed with the spec/plan). Verify it is present and is the diff baseline future audits compute NEW/FIXED/STILL-OPEN against. No action needed beyond confirming.

### Task 0.2: ESLint local-rules scaffold
**Files:** Create `eslint-rules/index.js`, modify `eslint.config.mjs`
- [ ] Create `eslint-rules/index.js` exporting an empty `rules: {}` plugin object.
- [ ] Wire it into `eslint.config.mjs` as a plugin named `wallplace`, rules added per phase, initially `warn`.
- [ ] Run `cd website && npm run lint`. Expected: passes (no rules yet).
- [ ] Commit: `chore(remediation/p0): scaffold local eslint plugin`

### Task 0.3: dependency-cruiser scaffold
**Files:** Create `.dependency-cruiser.cjs`, modify `package.json`
- [ ] `npm i -D dependency-cruiser`.
- [ ] Add script `"depcheck": "depcruise src --config .dependency-cruiser.cjs"`.
- [ ] Config with two `forbidden` rules (severity `warn` initially):
  - `no-admin-client-in-client`: from `^src/(components|app/.*(page|client))` to `^src/lib/supabase-admin` is forbidden.
  - `no-inline-admin-bypass`: documented placeholder, enforced by ESLint not depcruise (leave a comment).
- [ ] Run `cd website && npm run depcheck`. Expected: passes (warn-only).
- [ ] Commit: `chore(remediation/p0): add dependency-cruiser config`

**Phase 0 acceptance:** `cd website && npm run check` green; `npm run lint` and `npm run depcheck` run clean.

---

## Phase 1 — Authorization and injection criticals (DB)

Closes findings 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 4.3. Verified against current code.

### Task 1.1: `orFilter` safe PostgREST helper
**Files:** Create `src/lib/db/safe-filter.ts`, Test `src/lib/db/safe-filter.test.ts`

- [ ] **Write the failing test** (`safe-filter.test.ts`):
```ts
import { describe, it, expect } from "vitest";
import { orFilter } from "./safe-filter";

describe("orFilter", () => {
  it("keeps well-formed terms", () => {
    expect(orFilter(["venue_user_id.eq.abc-123", "venue_name.eq.TateModern"]))
      .toBe("venue_user_id.eq.abc-123,venue_name.eq.TateModern");
  });
  it("keeps normal emails (dots, plus, percent)", () => {
    expect(orFilter(["buyer_email.eq.a.b+x%y@mail.com"]))
      .toBe("buyer_email.eq.a.b+x%y@mail.com");
  });
  it("drops a term whose value contains a comma (injection separator)", () => {
    expect(orFilter(["venue_name.eq.Smith, John & Co."])).toBe("");
  });
  it("drops a term that injects an and()/or() group", () => {
    expect(orFilter(["venue_name.eq.x),or(venue_user_id.neq.0"])).toBe("");
  });
  it("joins only the safe terms", () => {
    expect(orFilter(["venue_user_id.eq.safe-id", "venue_name.eq.bad,inject"]))
      .toBe("venue_user_id.eq.safe-id");
  });
});
```
- [ ] **Run** `cd website && npx vitest run src/lib/db/safe-filter.test.ts`. Expected: FAIL (module missing).
- [ ] **Implement** (`safe-filter.ts`):
```ts
// Single owner for PostgREST .or() filters built from untrusted values.
// PostgREST uses commas as term separators and parens for and()/or() groups,
// so a value containing them can inject extra filter terms. A term is kept
// only if it matches column.operator.value with a value charset that excludes
// commas and parens. Dots, plus, percent, at and hyphen are allowed so normal
// emails, slugs and UUIDs pass.
const SAFE_TERM =
  /^[a-zA-Z_][a-zA-Z0-9_]*\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.[A-Za-z0-9_@%+.\-]+$/;

/** Join only the terms whose value is safe to interpolate into .or(). */
export function orFilter(terms: string[]): string {
  return terms.filter((t) => SAFE_TERM.test(t)).join(",");
}
```
- [ ] **Run** the test. Expected: PASS.
- [ ] **Commit:** `feat(remediation/p1): add orFilter safe PostgREST helper`

### Task 1.2: Apply `orFilter` at the three injection sites
**Files:** Modify `src/app/api/refunds/route.ts:57`, `src/app/api/dashboard/route.ts:117`, `src/app/api/analytics/venue/route.ts:60`. Test `src/app/api/analytics/venue/route.test.ts`

- [ ] **Write the failing test** for the analytics route (the one with attacker-controlled input): a venue whose `name` is `x),or(venue_user_id.neq.0` must NOT widen the query; assert the built filter contains only the `venue_user_id.eq` term. (Mock `getSupabaseAdmin` to capture the `.or()` argument.)
- [ ] **Run** it. Expected: FAIL.
- [ ] **Implement** at each site, replacing the interpolated `.or(\`...\`)` with `.or(orFilter([...]))`. Example for `analytics/venue/route.ts:60`:
```ts
import { orFilter } from "@/lib/db/safe-filter";
// ...
.or(orFilter([`venue_user_id.eq.${profile.user_id}`, `venue_name.eq.${profile.name}`]));
```
Apply the same shape to `refunds/route.ts:57` (`requester_user_id` / `requester_email`) and `dashboard/route.ts:117` (`venue_slug` / `buyer_email`).
- [ ] **Run** the test. Expected: PASS. Run `npm run check`.
- [ ] **Commit:** `fix(remediation/p1): sanitise .or() filters at refunds, dashboard, analytics (1.1-1.3)`

### Task 1.3: `no-raw-or-filter` ESLint rule
**Files:** Modify `eslint-rules/index.js`, `eslint.config.mjs`
- [ ] Add a rule that reports any `CallExpression` where the callee property is `or` and the first argument is a `TemplateLiteral` with expressions, unless the file is `src/lib/db/safe-filter.ts`. Message: "Build .or() filters with orFilter() from src/lib/db/safe-filter.ts".
- [ ] Set the rule to `error`. Run `npm run lint`. Expected: PASS (all sites now use `orFilter`).
- [ ] Add a deliberately-bad line in a scratch file, confirm lint errors, remove it.
- [ ] **Commit:** `chore(remediation/p1): enforce no-raw-or-filter`

### Task 1.4: Canonical `isAdminRequest` gate
**Files:** Modify `src/lib/admin-auth.ts`. Test `src/lib/admin-auth.test.ts`
Decision (ADR 0001): the one admin definition is `(email in ADMIN_EMAILS OR row in admin_users) AND user_metadata.user_type==="admin"`. This unifies the env-allowlist and table models while keeping the metadata defence.
- [ ] **Write failing tests:** non-admin token → false; allowlisted email WITHOUT metadata role → false; allowlisted email WITH metadata → true; `admin_users` member WITH metadata → true.
- [ ] **Run.** Expected: FAIL.
- [ ] **Implement** `isAdminRequest(request): Promise<boolean>` reusing the token resolution from `getAdminUser`, adding the `admin_users` lookup as an alternative to the email allowlist, both gated by the metadata check. Refactor `getAdminUser` to share the predicate.
- [ ] **Run.** Expected: PASS. Write `website/docs/adr/0001-one-admin-gate.md`.
- [ ] **Commit:** `feat(remediation/p1): unify admin gate as isAdminRequest (ADR 0001)`

### Task 1.5: Route admin checks through the gate (1.4, 1.5, 4.1, 4.2)
**Files:** Modify `src/app/api/messages/route.ts:70-103`, `src/app/api/refunds/process/route.ts:58-69`, `src/app/api/refunds/route.ts:21-27`, `src/app/api/dashboard/route.ts`
- [ ] **messages dispute (1.4, 4.2):** replace the inline email-allowlist block (lines 75-83) with `if (!(await isAdminRequest(request))) return 403`. Move `recordAdminAction` to BEFORE the message fetch returns; if the audit write throws, return 500.
- [ ] **refunds/process (1.5, 4.1):** replace the `admin_users`-only check (lines 60-69) with `const admin = await isAdminRequest(request)`. Add: `if (!admin && refundReq.requester_type === "artist") return 403` so an artist cannot approve an artist-initiated refund (only admins can).
- [ ] **refunds GET / dashboard:** swap their inline `admin_users` reads for `isAdminRequest`.
- [ ] **Tests:** each route 403s a non-admin; refunds/process 403s an artist approving an artist-initiated request; dispute read records the audit before returning.
- [ ] Run `npm run check`. **Commit:** `fix(remediation/p1): consistent admin gate + artist self-approval block (1.4,1.5,4.1,4.2)`

### Task 1.6: `no-inline-admin-check` ESLint rule
**Files:** Modify `eslint-rules/index.js`
- [ ] Report any read of `process.env.ADMIN_EMAILS`/`ADMIN_EMAIL` or `.from("admin_users")` outside `src/lib/admin-auth.ts`. Message: "Use isAdminRequest() from src/lib/admin-auth.ts".
- [ ] Set to `error`. Run `npm run lint`. Expected: PASS. **Commit:** `chore(remediation/p1): enforce no-inline-admin-check`

### Task 1.7: Offers customer gate (4.3)
**Files:** Modify `src/app/api/offers/route.ts:226-239`
- [ ] **Read the file first.** Add an explicit "is the caller a venue or an artist?" gate BEFORE the `isArtistCountering = !!parentOfferId` branch. A caller with neither a venue nor an artist profile is rejected with a clear `customer_cannot_make_offers` message, regardless of `parentOfferId`.
- [ ] **Test:** a customer caller passing any `parentOfferId` is rejected with the customer-specific error.
- [ ] **Commit:** `fix(remediation/p1): explicit customer gate on offers (4.3)`

### Task 1.8: Service-role dependency-cruiser edge
**Files:** Modify `.dependency-cruiser.cjs`
- [ ] Turn `no-admin-client-in-client` to `error`. Run `npm run depcheck`. If it flags real violations, fix them; otherwise it passes.
- [ ] **Commit:** `chore(remediation/p1): forbid service-role client in client code`

### Task 1.9: Defence-in-depth RLS view migration
**Files:** Create `website/supabase/migrations/071_defence_in_depth_views.sql`
- [ ] **Read** the current SELECT policies on `venue_profiles`, `artist_profiles`, `artist_works`, `artist_collections` via MCP (`select * from pg_policies where tablename in (...)`).
- [ ] Author SQL that either (a) tightens the `USING (true)` SELECT policies to redact PII columns at the DB layer, or (b) introduces `*_public` views with column allow-lists and points anon reads at them. Keep API/service-role access unchanged. Write `website/docs/adr/0004-defence-in-depth-view.md` explaining the choice.
- [ ] **Validate on a branch:** create a Supabase branch via MCP, apply the migration, run `get_advisors` (security + performance), confirm no new lints and the intended restriction holds. Delete the branch.
- [ ] **Apply to live** `uwkuhygwvasdzwsusiym` via MCP `apply_migration`. Re-run advisors. **Commit:** `chore(remediation/p1): defence-in-depth read restriction (ADR 0004)`

**Phase 1 acceptance:** injection + admin tests pass; `no-raw-or-filter` and `no-inline-admin-check` at error; advisors show no new lints; `npm run check` green. Open PR `fix(remediation/p1): authz + injection criticals`.

---

## Phase 2 — Financial integrity and reliability

Closes 1.8, 2.1, 2.2, 2.3, 6.1, 7.3, Bug 15.

### Task 2.1: `withIdempotency` + conditional-status update (1.8)
**Files:** Create `src/lib/api/idempotency.ts`, Test `src/lib/api/idempotency.test.ts`, Modify `src/app/api/refunds/process/route.ts`
- [ ] **Test:** two concurrent `process` calls for the same pending refund result in exactly one status transition and one Stripe call (mock Stripe, assert single invocation).
- [ ] **Implement:** a `claimPending(db, table, id)` helper that does `update ... set status='processing' where id=? and status='pending' returning *` and returns null if zero rows (already claimed). In `refunds/process`, claim before any Stripe call; bail with 409 if null. Pass `idempotencyKey: \`refund:${refundRequestId}:${action}\`` to every Stripe refund/reversal call.
- [ ] **Run.** Expected: PASS. **Commit:** `fix(remediation/p2): idempotent refund processing (1.8)`

### Task 2.2: Await critical side-effects (2.2, 7.3)
**Files:** Modify `src/app/api/orders/route.ts:245,261`
- [ ] **Read the file.** Change `executeTransfer(t.id).catch(...)` (line 261) to `await` it; on failure, persist a retry marker (e.g. `transfer_status='pending_retry'`) and include a failure count in the JSON. Change `notifyBuyerStatusUpdate(...).catch(...)` (line 245) to `await`, or enqueue via the existing Inngest path.
- [ ] **Test:** a rejected `executeTransfer` does not 200 silently; the response reports the failure and the retry marker is written.
- [ ] **Commit:** `fix(remediation/p2): await transfer + status email, persist transfer retry (2.2,7.3)`

### Task 2.3: `no-unawaited-critical-sideeffect` ESLint rule
**Files:** Modify `eslint-rules/index.js`
- [ ] Report `CallExpression` to a denylisted callee (`executeTransfer`, names matching `^notify`) when the result is not awaited and is directly `.catch()`-chained at statement level inside `src/app/api/**`. Message: "await or enqueue critical side-effects".
- [ ] Set to `error`. Run `npm run lint`. Expected: PASS. **Commit:** `chore(remediation/p2): enforce no-unawaited-critical-sideeffect`

### Task 2.4: Framed pricing rejects client price (2.3)
**Files:** Modify `src/app/api/checkout/route.ts:220-239`
- [ ] **Read the file.** When a `"base + frame"` size label cannot resolve canonical base pricing from the DB, return `409 { error: "size_label_unresolvable" }` instead of `console.warn` + client price.
- [ ] **Test:** a cart with an unresolvable framed label is rejected 409; a resolvable one still succeeds.
- [ ] **Commit:** `fix(remediation/p2): reject unresolvable framed pricing (2.3)`

### Task 2.5: Refund-history contract (2.1, 6.1)
**Files:** Modify `src/app/(pages)/customer-portal/page.tsx:103`
- [ ] Change `data.requests` to `data.refundRequests` to match the API. Add a shared response type co-located with `src/app/api/refunds/route.ts` and import it in the page so the field name is type-checked.
- [ ] **Test:** the customer portal renders the refund-pending badge when the API returns `refundRequests`.
- [ ] **Commit:** `fix(remediation/p2): refund history field contract (2.1,6.1)`

### Task 2.6: Cart isolation across sessions/roles (Bug 15)
**Files:** Read the cart implementation (`src/context/` cart provider / `src/lib/cart-sessions*`) first.
- [ ] Key the cart on the authenticated user id (or a per-session key for guests) and clear/swap it on auth change. **This is the highest-risk task; cover with tests and verify in preview** (sign in as A, add item, sign out, sign in as B, confirm empty).
- [ ] **Test + preview verification.** **Commit:** `fix(remediation/p2): scope cart per user/session (Bug 15)`

**Phase 2 acceptance:** idempotency, transfer-failure, framed-price, refund-history, cart-isolation tests pass; rule at error; `npm run check` green; cart verified in preview. Open PR.

---

## Phase 3 — Outreach cap consolidation

Closes 1.6, 1.7.

### Task 3.1: Route placements + messages through the unified cap
**Files:** Modify `src/app/api/placements/route.ts:404-439`, `src/app/api/messages/route.ts:369-414`. Test `src/lib/outreach-cap.test.ts` (extend)
- [ ] **Write failing test:** an artist on Core (cap 2) who already has 2 placements today is blocked from a first-contact message, and vice versa (cross-surface aggregation). Use the real `checkArtistOutreachCap`.
- [ ] **Run.** Expected: FAIL (current inline counters silo per surface).
- [ ] **Implement:** delete the inline counting block in `placements/route.ts` (404-439) and call `checkArtistOutreachCap(db, auth.user!.id, parsed.data.length)`, returning its `result` as JSON 429 when `ok===false`. Same in `messages/route.ts` (369-414), preserving the `cidLocal` reply-exemption (replies inside an existing thread don't count, which the helper already models by counting distinct new conversation ids).
- [ ] **Run.** Expected: PASS. **Commit:** `fix(remediation/p3): unify outreach cap across surfaces (1.6,1.7)`

### Task 3.2: `no-ad-hoc-cap` ESLint rule + ADR
**Files:** Modify `eslint-rules/index.js`, Create `website/docs/adr/0003-outreach-cap-aggregates.md`
- [ ] Report inline daily-count queries (a `.from("placements"|"messages")` followed by a `.gte("created_at", ...)` count) outside `src/lib/outreach-cap.ts`. Message: "Use checkArtistOutreachCap()".
- [ ] Set to `error`. Run `npm run lint`. Expected: PASS. Write ADR 0003. **Commit:** `chore(remediation/p3): enforce no-ad-hoc-cap (ADR 0003)`

**Phase 3 acceptance:** aggregation test passes; both inline counters gone; rule at error; `npm run check` green. Open PR.

---

## Phase 4 — Redirect funnel, navigation, UX

Closes 3.1-3.9, 6.2, 6.3, 7.1, 7.4, Bug 6, Bug 20.

### Task 4.1: Canonical `?next=` redirect (3.1-3.5)
**Files:** Modify `src/app/(pages)/login/page.tsx:48`, `browse/[slug]/[workSlug]/ArtworkPageClient.tsx:665`, `signup/page.tsx:24,41,56`, `signup/customer/page.tsx`, `signup/artist/page.tsx`, `signup/venue/page.tsx`. Test `tests/e2e/redirect-preservation.spec.ts`
- [ ] **Read each file first.** Make `?next=` the only consumed param; add a one-line back-compat shim in `login/page.tsx` that also reads `?redirect=`. Change the ArtworkPageClient push from `?redirect=` to `?next=`. In `signup/page.tsx` forward the inbound `next` onto each role href. In each signup confirm page replace the hardcoded `next` with `safeRedirect(searchParams.get("next"), <default>)`.
- [ ] **Playwright test:** logged-out Buy on an artwork → login → lands back on the artwork; checkout → customer signup → lands on checkout, not `/browse`.
- [ ] **Commit:** `fix(remediation/p4): canonical ?next= redirect through signup (3.1-3.5)`

### Task 4.2: `no-redirect-param` ESLint rule + ADR
**Files:** Modify `eslint-rules/index.js`, Create `website/docs/adr/0002-next-canonical-redirect.md`
- [ ] Report string literals containing `?redirect=` and object properties `next:` with a hardcoded string literal in `src/app/(pages)/signup/**`. Message: "Use ?next= and safeRedirect()".
- [ ] Set to `error`. Run `npm run lint`. Expected: PASS. Write ADR 0002. **Commit:** `chore(remediation/p4): enforce no-redirect-param (ADR 0002)`

### Task 4.3: Nav/UX fixes (3.6-3.9, 6.2, 6.3, 7.1, 7.4)
Each is a discrete task; read the file, make the change, add a focused test or preview check, commit.
- [ ] **3.6** `src/components/Footer.tsx:12` — repoint "Browse Venues" to `/venues` (or drop). Assert no duplicate hrefs in a unit test.
- [ ] **3.7** `src/components/PayoutExplainerModal.tsx` — add an X button + Escape handler wired to dismiss.
- [ ] **3.8** `src/components/offers/MakeOfferModal.tsx` — render the close affordance in the success state too.
- [ ] **3.9** `src/app/(pages)/checkout/page.tsx:514-532` — add `label`/`htmlFor`/`id` to `renderInput`; verify with axe in Phase 5.
- [ ] **6.2** `src/app/(pages)/galleries/page.tsx` — render a real 200 page listing galleries with a canonical link, or remove from sitemap.
- [ ] **6.3** `src/app/(pages)/checkout/confirmation/page.tsx` — add a related-artists/recently-viewed strip.
- [ ] **7.1** `checkout/page.tsx:809-811` — clearer disabled copy ("Processing payment, do not refresh").
- [ ] **7.4** unify "Continue browsing" wording across `checkout/page.tsx:493` and `confirmation/page.tsx`.
- [ ] One commit per fix: `fix(remediation/p4): <finding> <one-liner>`

### Task 4.4: Nav decision (Bug 6) + browse URL sync (Bug 20)
- [ ] **Bug 6:** decide unify-vs-document the four role nav sets; if documenting, write `website/docs/adr/0005-role-nav-sets.md` and close. If unifying, implement the shared nav config.
- [ ] **Bug 20:** **read `src/app/(pages)/browse` client page first.** Sync the `filters` state to the URL via `router.replace` in an effect guarded against replace-loops (only replace when the serialised filters actually change). Add a test that a filter change updates the URL and a URL load hydrates filters.
- [ ] **Commit:** `fix(remediation/p4): nav decision + browse URL filter sync (Bug 6, Bug 20)`

**Phase 4 acceptance:** redirect Playwright test green; no duplicate footer hrefs; modals closeable; `no-redirect-param` at error; `npm run check` green. Open PR.

---

## Phase 5 — Mobile and accessibility

Closes 2.4, 5.1-5.8, 7.2.

### Task 5.1: Touch-target-safe Button + tap-target audit
**Files:** Create `src/components/ui/Button.tsx`, `tests/e2e/tap-targets.spec.ts`
- [ ] Create a `Button` whose default size renders >=44px min height/width (`min-h-11`), with variants matching existing usage.
- [ ] **Playwright audit:** on `/pricing`, `/checkout`, `/cookies`, artist + venue portals, assert every `button`/`a[role=button]` rendered box is >=44px in both dimensions. This is the runtime gate for tap targets (lint cannot measure Tailwind sizes).
- [ ] **Commit:** `feat(remediation/p5): touch-target Button + tap-target Playwright audit`

### Task 5.2: Apply mobile fixes (2.4, 5.1-5.8)
Exact class changes from the audit; read each file to confirm context, then apply:
- [ ] **2.4** `ArtistPortalLayout.tsx:188`, `VenuePortalLayout.tsx:186` — `h-[calc(100vh-3.5rem)]` → `h-[100dvh]`, `top-0 lg:top-16`, inner `nav` `overflow-y-auto`.
- [ ] **5.1** `pricing/page.tsx:170` — `min-w-[560px]` → `sm:min-w-[560px]` (or stacked cards < sm).
- [ ] **5.2** `cookies/page.tsx:119` — table → card on `< sm`.
- [ ] **5.3** `artist-portal/portfolio/page.tsx:2470,2501,2547,2564` — `w-[90px]` → `w-16 sm:w-[90px]`.
- [ ] **5.4** `artist-portal/analytics/page.tsx:540,680` — `min-w-[400px]` → `min-w-[300px] sm:min-w-[400px]`.
- [ ] **5.5** `artist-portal/placements/page.tsx:1841,1848,1856` — `min-w-[140px]` → `min-w-[100px] sm:min-w-[140px]`.
- [ ] **5.6** `curated/CuratedClient.tsx:311,317` — `w-full sm:w-auto sm:min-w-[220px]`, stack < sm.
- [ ] **5.7** `MessageInbox.tsx:1362,1372` — `px-3 py-1.5 text-xs` → `px-4 py-2.5 text-sm`.
- [ ] **5.8** `DatePicker.tsx:128` — `w-8 h-8` → `w-11 h-11`.
- [ ] Run the tap-target audit; it should now pass on the named pages. One commit per finding.

### Task 5.3: axe a11y audit + decorative image (7.2)
**Files:** Create `tests/e2e/a11y.spec.ts`, Modify `checkout/confirmation/page.tsx:21`
- [ ] Add `@axe-core/playwright`; assert no critical violations on `/pricing`, `/checkout`, `/checkout/confirmation`, `/cookies`.
- [ ] **7.2** add `aria-hidden="true"` to the decorative hero.
- [ ] **Commit:** `feat(remediation/p5): axe a11y audit + decorative image fix (7.2)`

**Phase 5 acceptance:** tap-target audit asserts >=44px; axe clean on named pages; `npm run check` green. Open PR.

---

## Phase 6 — Performance and prevention finalisation (DB)

Closes Bug 42, contracts-bucket verification, CSP decision; finalises guardrails.

### Task 6.1: Verified unused-index drop (Bug 42)
**Files:** Create `website/supabase/migrations/072_drop_unused_indexes.sql`
- [ ] Via MCP, query `pg_stat_user_indexes` for `idx_scan = 0` indexes; exclude any backing a PK/unique constraint. List candidates; **log anything skipped**.
- [ ] Author the `DROP INDEX` migration for confirmed-zero-scan, non-constraint indexes only.
- [ ] **Validate on a Supabase branch** (apply, re-run performance advisor, confirm the unused-index lints drop and nothing breaks). Delete branch. **Apply to live via MCP.** Re-run advisors.
- [ ] **Commit:** `chore(remediation/p6): drop verified unused indexes (Bug 42)`

### Task 6.2: Contracts bucket + CSP
- [ ] **Contracts bucket:** via MCP confirm the `contracts` bucket is private (storage config). If public, flag to the human (dashboard toggle) and record in the PR. The code already returns opaque refs + signed URLs.
- [ ] **CSP:** inspect report-only logs if available. If clean, flip `Content-Security-Policy-Report-Only` → `Content-Security-Policy` in `next.config.ts`; else leave report-only and document why in the PR.
- [ ] **Commit:** `chore(remediation/p6): contracts bucket + CSP decision`

### Task 6.3: Promote rules to required CI
**Files:** Modify `.github/workflows/*.yml`, `eslint.config.mjs`, `.dependency-cruiser.cjs`
- [ ] Ensure all custom ESLint + dependency-cruiser rules are at `error`. Add `lint`, `depcheck`, `vitest`, `tsc`, `build` as CI jobs (extend the existing audit workflow).
- [ ] Re-baseline the advisor snapshot (`scripts/audit/snapshot-advisors.ts`) and commit the updated baseline.
- [ ] Optional: a `scripts/audit/weekly-diff.ts` computing NEW/FIXED/STILL-OPEN against `docs/qa/2026-06-08-weekly-audit.md`.
- [ ] **Commit:** `chore(remediation/p6): required CI checks + re-baseline advisors`
- [ ] **Note for the human:** enable branch protection on `main` requiring these checks.

**Phase 6 acceptance:** advisors clean of targeted lints; all rules at error; CI checks present; `npm run check` green. Open final PR.

---

## Cross-cutting rules
- Never push to `main`; never `supabase db push --linked` without `--branch`; never change Stripe/Supabase dashboard settings (human-owned).
- One phase per PR; `/review` between phases; do not start the next phase before the current merges.
- Every commit carries the `Co-Authored-By: Claude` trailer.
