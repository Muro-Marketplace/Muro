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
| 3 | Route fixes `01 Phase B–D`, `06 A2/B` | `01`, `06` | `06` **A+A2 done, B1 done** (a4142c2), **B2 void / B3+B4 done** (f657719), **B5 done** (e53630d), **B6 done** (1a79952). `06` **COMPLETE**: Phases A + B (A5/A7: 083a966), and **Phase C verified done** (C1 static `CLIENT_ENV`, C2 `prodDefault: true`, C3 `no-spread-into-db-write`, C4 the FLAGS↔CLIENT_ENV test, C5 the suite) — the checklist was simply unticked. V3/V4 need a running server and a human. `01`: **Phase B complete** (E32, E44, E45, E19, E39, E17/E18). **Phase C complete**: E32, E31, E33 (1bed512). **Phase C + D complete**: E32, E31, E33 (1bed512), E20+E23b (8f47841), E21 (92e3dfe), E22 (fae5945, migration 098). **Phase E item 13 DONE** (37987e1 + 71b137f): every mutating route guarded or exempt-with-reason, ratchet at 0, demo-guard lint warnings 58 → 0. **`01` COMPLETE** (items 13-16: 37987e1, 71b137f, 99e8c83, 0fd8a4d, 6c8e1d1). Item 15's flip and item 16's restore are both owner decisions, both held by guards. Next: `06` Phase B |
| 4 | `074` RLS closure, all five leaks + `/apply` service-role switch **same commit** | `02` §11 | **done** (5ccf266). Assertion 5 rows → 0, proven behaviourally too. §11 had three errors: four-of-five policies, one-of-two INSERT policies, an unguarded ALTER on a table prod lacks |
| 5 | G-A / G-B public PII projections (Bug 1, Bug 5) | D8 | **G-A done** (3a13aab). **G-B coords done** (ceb4d45); the slug/opaque-id half needs an owner decision |
| 6 | `07 §13.2` `parseDimensions` collapse (pulled forward) | `07` | **behaviour pinned** (04c023c); the collapse itself needs an owner decision on implausible dimensions |
| 7 | `04` payments Phase 0→9 | `04` | **33 of 61 checklist items now ticked, verified against the code on 2026-08-28** (verification method and the three verified-NOT-done items are recorded above the checklist in the doc itself). Phase 0 done bar 0.5/0.6; Phases 1, 2, 3, 6 and 7 essentially complete. **Phase 0 done**: Bug 15 (ee7e888), curation T10 (509d3c4). **G-C / Bug 10 done** (a02c38e, migration 081: the scope column did not exist). **T3 E6+E10 done** (b2c27ed; no order row existed at all, `orders.shipping` is NOT NULL). **T3 emails done** (`sendOrderConfirmations` extracted, inline copy deleted). **D7 done** (95d7d93). **T2 / E9 done** (7dffb33, migration 082). **T6 COMPLETE** (E7a-E7d, E8, E11, E11b). **B0 COMPLETE**: D2 (E19/E46f, 740b79a), D1 (13aed91, migration 084, event-dedup half; payment_status gate deferred to owner), D3 (c066a38). **T1 (D4/D5/D6), T4 (D8/D9) and T5 (D10/D11) are all DONE** and the checklist was simply unticked. **Remaining and real: 0.5** (three `customer.subscription.deleted` branches where the plan wants one), **5.3/D14** (the referral credit is still read-modify-write, no `extend_free_until` migration), **5.4/5.5** (refund denominator + restock, both refunds so owner-gated), **Phase 8 / T9** (a new checkout mode, surfaced as owner decision 13 not started), and the `tests/transactions/**` harness (0.6, and every `*.test.ts` that depends on it). **Newly added: 9.3** the reconciliation report, and **open question 2** the Stripe API version pin. |
| 7a | `free_until` overcharge: every sale billed 15% | D17.1 | **done** (6e0705e). Four sites, not the two D17 named. No fee changes today, no artist has a future `trial_end` |
| 7b | Schema-column guard | **D17.3**, owner `02`, pulled forward | **DONE**. Narrow form (6e0705e), then **full form** (7f556eb): `schema-columns.json` snapshots all 53 tables / 750 columns; the scan surfaced 12 phantom selects, parked in a shrinking `GRANDFATHERED` ratchet and queued as **row 19** |
| 7c | `placements/route.ts` phantom `requester_user_id` | N3 follow-up, found by 7b's guard | **DONE** (96fc84b): the real column is `proposed_by_user_id`; the whole-query rejection is gone (route.ts:806) |
| 19 | The 12 phantom selects 7b surfaced (D59 = rule 7), one fix per iteration, each shrinks the ratchet | 7b guard, docs `01`/`04`/`08`/misc | **#1 order-tracking** (66dc55a), **#2 placement-ending-soon cron gated off** (2d52b98, owner (b)/(c) per D60), **#3 onboarding-nudges** (bb1a695), **#4 walls/my-works** (7f8f6d8), **#5 orders/[id]/events** (1b8a270), **#6 paid-loan-billing email** (648fb10), **#7 offers title→name** (81c3dbe, x2 selects), **#8 placements/[id] image→profile_image** (5191471, aliased), **#9 sitemap updated_at→created_at** (6db8f07). Ratchet 12 → 1. **CLOSED**: all 10 live phantom selects resolved (#1-#9 fixed; the 10th, `free_until` at webhooks/stripe, is the parked ratchet floor per D14/D17.2, owner-gated). Cannot shrink below 1 without an owner decision on free_until |
| 20 | Schema-snapshot regeneration script for the phantom guard (supervisor D61) | 7b guard, runbook | **DONE** (08495ae): `scripts/schema-snapshot.ts` + `.lib.ts`, `npm run schema:snapshot`, guard header + MASTER-RUNBOOK reference it, 8-test lib guard incl a byte-for-byte round-trip of the committed snapshot |
| 20b | D62 follow-up: regenerator needs `SUPABASE_ACCESS_TOKEN` (absent here → exits 2); record the dependency, point the exit-2 error at the remedy, investigate a service-role path | supervisor D62 | **DONE** (2131d2a): dependency recorded in guard header + runner; `MISSING_TOKEN_MESSAGE` points at the remedy (tested); service-role path investigated — none clean, token stands. **D62.5 owner escalation OPEN**: add `SUPABASE_ACCESS_TOKEN` locally (keeps the phantom guard maintainable across migrations) |
| 21 | Close the artwork post-limit TOCTOU at `artist-works/route.ts` with an atomic check-and-insert (supervisor D64) | D64 | **DONE.** Migration `104_claim_artist_work_slot.sql` written, applied and verified live (ACL `postgres=X, service_role=X` only, matching 085/087; behaviour proved in a rolled-back transaction: cap holds, an edit never consumes a slot even at limit 0). The route calls the RPC instead of counting for itself, and releases the claimed placeholder if the save afterwards fails. 7 tests, fail-before verified (6 of 7 fail on the read-then-check) |
| 22 | Delete the 5 strip-and-retry paths in `placements/route.ts` (supervisor D65) — same silent-data-loss class as E42-c, invisible to the phantom guard (write path) | D65 | **DONE** (9af466a). SEVEN sites, not the five listed. Every candidate column verified present in `tests/integration/schema-columns.json`, so no fallback could do what it claimed; each could only turn a real failure into a false success. Two new route tests drive an unrelated failure (permission denied) and assert a 500 with exactly ONE write attempt. Fail-before verified. Sites ~:104/:519/:754/:1021/:1294 strip columns that ALL exist in prod; delete the dance + surface the error, ONE site per iteration, confirming the trigger breadth (any-error vs pattern-matched — `:519` reads narrow, others broader) FIRST, with a test that an unrelated failure now surfaces instead of a false success. Not owner-gated |
| 23 | E42-b, reassigned from the owner to the loop (supervisor D66) — two halves: `interested_in_local_artists` (build) + `preferred_sizes` (drop) | D66 | **(a) AND (b) DONE.** (a) migration `103_venue_interested_in_local_artists.sql` written, applied and verified live (nullable boolean, no default: NULL means never answered, which 9 of 9 live venues are). Allowlist entry added, the save now sends it, and the transform reads the real column instead of hardcoding `true`. The venue-profile test assertion that pinned the column as absent is FLIPPED, as its own comment said it should be. (b) `preferred_sizes`: the only live reference was a stale comment in `writable-fields.ts` that lumped it in with `interested_in_local_artists`; corrected so the two cases read apart (vestigial vs shipped-control-awaiting-a-column), and the venue-profile route test now says which assertion flips when 23(a) lands. The strip-and-retry it referred to was already removed by E42-c. (a) `interested_in_local_artists` needs a new column, so it is blocked on the same unauthorised Supabase MCP as row 21. NOT owner-gated (D66 overrides the earlier block). (a) `interested_in_local_artists`: a shipped checkbox bound to state + hydrated (`venue-portal/profile/page.tsx` :212/:249/:616) whose value is discarded — add one nullable boolean column (migration above the highest on disk, applied to prod + verified) and the `writable-fields.ts` allowlist entry, so the tick persists and reads back. (b) `preferred_sizes`: vestigial (only a comment at `writable-fields.ts:170`, no UI/reader/data) — delete the dead refs. `preferred_styles` already exists in prod, so this was an incomplete migration, not a design decision |
| 8 | `05` frontend saves + listing (after D10 fixes) | `05` | **§1.1 done** (`mutate` primitive, 80a7c41), **§1.2 done** (`useSaveAction` hook, 093a08c), **E41-a done** (add/edit awaits the write, c9a4925), **E41-b done** (deletes await the DELETE, bd2df65), **E41-d done** (frame payload keeps pricesBySize, 181906c), **E41-e done** (bulk editor preserves per-size shipping/in-store, a595ae5), **E41-f done** (deleted the dead localStorage artwork editor, 6a25cc6). **E41-c done** (POST only changed works via `changed-works.ts` diff, 642a3f5; residual server-side TOCTOU reassigned to **row 21** per D64, not owner-gated). **E41-g = void** (already correct; mirror removed in E41-f). **E42-a done** (venue profile input `value` split from display fallback, 6b67966), **E42-c done** (venue-profiles DAO stops stripping images/display_*, 9d8835c), **E42-d done** (venue fields clearable via `|| null`, f7e81d9), **E42-e done** (venue unsaved-changes guard now uses the shared `useUnsavedWarning` hook, 33a15f2). **E42-b un-blocked → row 23** (supervisor D66: no longer owner-gated; build `interested_in_local_artists` as a nullable boolean, drop dead `preferred_sizes` refs; runs after `05` with rows 21/22). Every E42 item under this doc is now done. **E43-a done** (placement `updateStatus` in BOTH portals now routes through one shared `updatePlacementStatus` helper: res.ok check, snapshot-rollback, cross-portal event on success only, e462197). **E43-b done** (withdraw offer `OffersList.tsx`: `act()` now returns `Promise<boolean>`, the withdraw toast is gated on it, 37b4ea9). **E43-c done** (artwork-request `setStatus` now checks res.ok + surfaces the error via the file's `setError` idiom, 4339efd). Remaining (**order per D67, OWNER-APPROVED 2026-07-31**): (1) **DONE — `no-authfetch-mutation` rule + grandfathered ratchet landed at `warn`, floor 94 across 44 files (468e3f1).** The rule's 94-site list IS the real E43 surface (vs 11 hand-enumerated — D67 vindicated). (2) IN PROGRESS — work the union, batching **by FILE not by call site** (supervisor D70.3: 44 files vs 94 sites; sites in a file share a shape/import/test). **E43-e done** (MessageInbox report/delete/block trio → shared `submitFlagAction` helper, floor 94→91, 7381399). **MessageInbox.tsx COMPLETE** (remaining 9 mutating `authFetch` → `mutate`, floor 91→82, e4ff19f; file now 0-flagged, 2 read GETs kept). **E43-d done** (`artist-portal/portfolio/page.tsx` shipping-settings save → `mutate` + success/error toasts, floor 82→81, e70ca39). **E43-g done** (saved-item `handleRemove` in BOTH `artist-portal/saved` + `customer-portal/saved` → `mutate`, remove-on-confirmed-delete + rollback/error-toast, floor 81→79, 516ec5f). **E43-h done** (`browse/[slug]/ArtistProfileClient.tsx` public enquiry: primary `/api/messages` → `mutate`, confirmation only on success, `/api/enquiry` best-effort, floor 79→78, 3d51a9b). **E43-i done** (`components/Header.tsx` 3 fire-and-forget mark-read `authFetch`→`mutate`, floor 78→75, 335de6c; no bespoke test — render-heavy + no user-visible outcome, covered by the ratchet + mutate contract). NEXT per D70.3: E43-j done (`VenuePortalLayout.tsx` self-heal → `mutate` + retry banner, floor 75→74, ec57636); bug-12 part 1 done (`BlogEditor.tsx` 3 saves → `mutate`, floor 74→71, b2c3769); `PlacementDetailClient.tsx` done (6 handlers → `mutate`, event-on-success-only for handleRespond, floor 71→65, 239ea48); `PlacementContextPanel.tsx` done (6 handlers → `mutate`, undo event success-only + a real catch added on all 6, floor 65→59, 13bc052); `artist-portal/billing/page.tsx` done (4 Stripe-session-redirect POSTs → `mutate`, transport-only, floor 59→55, 953e121); `artist-portal/orders/page.tsx` PARTIAL (order-STATUS PATCH → `mutate`, floor 55→54, 4ab254a; the 3 refund-path sites processRefund/issueProactiveRefund SURFACED as OWNER-GATED — they execute Stripe refunds, held per the money boundary); the other ~30 files + the 3 owner-gated refund sites, LOWERING `LITERAL_FLOOR` by each file's count in the same commit. **D70.2: 94 is a MIGRATION surface, not 94 bugs** (the rule has no res.ok exemption); the live-bug subset is the unchecked ones. Hand items E43-d/e/g/h/i/j + bug-12 are all IN the 94; **E43-f is OUT** (dead View buttons, no authFetch — own fix). (3) Flip the rule to `error` when the floor hits zero. (4) bug-12's flag-gate/notFound half is separate from its authFetch sites |
| 9 | `03` auth/admin, D5 order: create+backfill `admin_users` **before** dropping the `user_metadata` conjunct | `03` | **COMPLETE bar the owner-gated cutover.** E34, E36b, E36c, E36d, E35d, E30a, E30b all done. `admin_users` created (migration 101, applied+verified) and the backfill script shipped; migration 102 stops a signup declaring itself admin. ADR 0008 supersedes 0001. **Owner-gated: run `npm run admin:backfill`, then remove the `user_metadata` conjunct (D5 order).** |
| 10 | `09` emails (artist-sale trigger first, provisioning dropped per D9) | `09` | **Phase 0 + Phase 1 done** (earlier). **Item 3.2 DONE**: `POST /api/auth/resend-verification` (enumeration-safe, tighter rate limit), `emailRedirectTo` on the two `signUp()` outliers, and the login page surfaces the resend when Supabase says "Email not confirmed". **Phase 2 (= 07 K1) DONE**: `lib/email.ts` deleted, 19 exports gone, 8 admin notifiers collapsed into `sendAdminAlert`, 6 new templates written (their absence was why the legacy path survived), one live duplicate send to buyers deleted, `no-legacy-email` test + `one-email-entrypoint` dependency-cruiser rule + `depcheck` in the gate. **`09` IS NOW COMPLETE bar four owner/time-gated items.** Item 1.5, Phases 3 and 4 all done; the three Group 2 items recorded as done that were not (2.2, 2.8, 2.9) are done, and 2.8 found a live fire-and-forget send. 31 of 35 checklist items ticked. **Open: 0.5 (DNS/Resend/Vercel), 3.1 (Supabase dashboard), 4.7 (DMARC staging), 4.8 (time-based + gated on the `08` rewrite).** |
| 11 | `07` K5a/K5b before `08` PR#2; `09 §4.1` harness before `08` PR#5 | `07`, `09` | **K1, K2, K2e, K3 (now INCLUDING the §3.2 JSX sweep), K4, K5, K6, K7 DONE. K8 PARTIAL** (code half done, the slug rename + Stripe Connect package escalated). `09 §4.1` harness DONE and `email:render` is in `check`. **K10a and K10d DONE** (renumber; and the `002_run_me.sql` ghost answered — it WAS applied, and three of its indexes are load-bearing in prod while the repo drops them, closed by migration 108 + `migration-index-drops.test.ts`). **K10b/K10c/K11 BLOCKED, honestly**: they need the Supabase CLI, Docker and `pg_dump`, and this environment has none of the three. K9 tracked elsewhere. |
| 12 | `08` rewritten cull last (D6 unconditional list only until rewritten) | `08` | **D6 item 3 DONE** (wall kill-switch leak closed, 6 tests, fail-before verified). Items 1/2/4 verified and SURFACED not cut: two are clean (`PlacementQRModal`, `/profile-designs`), two are NOT (`/galleries` shares a name with a live data module; `/feature-requests` has a live admin twin). §7's three owner decisions restated in the entry. **Still blocked on the `08` rewrite per D6** |

Owner decisions the loop is waiting on (none block the remaining queue):

- **G-B part 2, the venue slug.** Is a venue's name paywalled enough to give up the
  /spaces click-through, or is the click-through worth the name leak? Detail in
  iteration 23. Options: accept the leak; invest in opaque ids plus route
  resolution; or drop the click-through for unentitled viewers.
- **B4 admin conjunct.** D6 says "admin+non-prod"; iteration 21 shipped non-prod
  only. Say if you want the admin check too.
- **Migration ledger divergence.** Iteration 4: rewrite prod's ledger, adopt
  timestamps locally, or accept the numbered files as documentation.
- **N-K2 implausible dimensions.** What should checkout do when a work's
  `dimensions` is pixel data (18 of 26 distinct values in prod)? Refuse to quote,
  clamp to a maximum, or fall back to a default size? Shipping currently prices a
  242 × 363cm parcel from "2420 × 3632 px". Detail in iteration 24.
- **`orders.shipping->>'country'` holds two formats.** 6 rows say `GB`, 6 say
  `United Kingdom`, all 12 of the live orders. Normalising means writing to real
  order rows, which the loop's rules escalate rather than do. Say the word and it
  becomes a one-line UPDATE plus a guard; leave it and any ISO-keyed report keeps
  seeing half the orders. Detail in G-C / Bug 10.

- **Referral credit's target column** (D17.2, the only owner question left from the
  `free_until` finding). The referral path writes a 30-day free-window extension to
  `free_until`, which does not exist. `trial_end` does, but it is Stripe-managed, so
  writing app-side referral credit into it is questionable. Drop referral credit, add
  a dedicated `referral_free_until`, or accept writing to `trial_end`? The read-path
  fix (D17.1) proceeds regardless and does not wait on this.

- **The `warn` → `error` flip for `require-authz-on-mutation`** (item 15). 43 routes
  authorise inline (`.eq("user_id", auth.user!.id)`) rather than via `@/lib/authz`,
  so flipping now reddens CI over convention, not security. Migrate them to
  `assert*` helpers, or allowlist each with "self-scopes on user_id" as the stated
  control? A ratchet holds the count at 43 meanwhile, so the gap cannot widen.

- **Where terms acceptance should be recorded** (E46b, `06` B1). A pre-signup
  assertion about an email address is forgeable by construction, so the doc's
  split-route with an HMAC token cannot fix it. Either record acceptance after email
  confirmation from the token (loses the tick-the-box timestamp, and an unconfirmed
  signup leaves no row), or add a verified/self-asserted distinction so the 51
  existing anonymous rows stop implying more than they can prove. The authenticated
  path, validation and rate limit are already fixed either way.

- **The in-store-price feature is UI-only** (E46a / A8). `artist-portal/portfolio`
  collects per-size in-store prices and `in_store_price` exists in no migration and
  not in the live table, so every value an artist has typed there was silently
  dropped. Add the column and finish it, or remove the UI. Eighth phantom column of
  the session, and the only one with a user interface.

Owner actions blocking a merge, added as they surface:

- **Add the `SUPABASE_ACCESS_TOKEN` repo secret** (Settings > Secrets and
  variables > Actions), a Supabase personal access token from
  https://supabase.com/dashboard/account/tokens. The `advisors` job added in 0b
  fails on every PR until it exists.
- **Provide a real Stripe `sk_test` key and `STRIPE_WEBHOOK_SECRET`.** The local
  values are placeholders (`sk_test_PLAC…`, and api.stripe.com returns 401) and the
  Stripe CLI is not installed, so no payment task in this plan can satisfy the
  runbook's "drive the Stripe test-mode event" step. Every payment fix so far is
  verified by driving the handler's real code path with a synthetic event instead,
  which is stated as such each time rather than presented as a Stripe drive.

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

---

## Iteration 15 — 2026-07-29

### E44 — artist-profile mass-assignment, closed. The theft chain is broken at both ends.

Owner: `06` A4.

`const updatePayload: Record<string, unknown> = { ...body }` at
`api/artist-profile/route.ts:41` handed the client the entire `artist_profiles`
row through a service-role write. The body now goes through
`pickWritable(body, ARTIST_PROFILE_WRITABLE)`.

**Changed:** `src/app/api/artist-profile/route.ts`.

Preserved and re-verified: UK postcode validation and upper-casing, the negative
shipping-price guard, the Premium-tier theme strip, and the 401. `lat`/`lng` are
deliberately off the allowlist so a client cannot set them, while the route still
writes them from the geocoder, which is the only legitimate source.

Also removed `international_shipping_price` from the shipping-price loop: absent
from the live table, therefore absent from the allowlist, therefore unreachable, so
the loop entry was dead code. And corrected a comment that claimed "the body-side
allow-anything stays", which stopped being true with this change.

**Verification, both directions.** Before:

```
× drops every server-owned field from the body
  → review_status reached the DB payload: expected { …(17) } to not have property "review_status"
× ignores an unknown field rather than passing it through
  → expected { name: 'Maya', not_a_column: 'boom' } to not have property "not_a_column"
 Tests  2 failed | 7 passed (9)
```

The 7 already-passing tests are the behaviours the change had to preserve, which is
why they were written first. After:

```
 ✓ src/app/api/artist-profile/route.test.ts (9 tests) 11ms
      Tests  9 passed (9)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  134 passed (134)
      Tests  1259 passed (1259)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** 1780a5b

### A5 deferred, with a reason

`06` A5 adds `assertNoServerOwned` inside `upsertArtistProfile`. It needs an
exemption path before it can land, because two callers legitimately write
server-owned columns:

- the PUT route writes `lat`/`lng` after geocoding (server-derived, not client input)
- the POST claim flow writes `review_status: "pending"` (server-chosen)

A5 as written would throw on both. The doc half-notices this ("keep the insert
branch's explicit review_status handling") without saying how the assert tolerates
it. Options are an `allow` parameter on `assertNoServerOwned`, or a separate
`applyServerOwned()` path for derived columns. That is a design decision for A5's
own iteration, not something to improvise inside a security fix. E44 is fully
closed without it: the assert is defence in depth for a future careless caller,
not the control that stops the attack.

### Chain status

| Finding | Where | State |
|---|---|---|
| E32 steal the listing | `lib/db/artist-works.ts` | closed, 3999102 |
| E44 redirect the payout | `api/artist-profile/route.ts` | closed, 1780a5b |

Both halves are now regression-tested. Either fix alone breaks the chain; both are
in place.

---

## Iteration 16 — 2026-07-29

### E45 — venue-profile mass-assignment, closed (06 A6 + A7's pin)

`PUT` (route.ts:24) and the general-update branch of `PATCH` (route.ts:58) passed
the raw body to `upsertVenueProfile`, which spreads it into a service-role update.
Both now go through `pickWritable(body, VENUE_PROFILE_WRITABLE)`.

**Changed:** `src/app/api/venue-profile/route.ts`, `src/lib/db/venue-profiles.ts`.

**A7's pin, and what the doc got slightly wrong.** A7 says to "pin `user_id: userId`
on the update branch". The update was *already* scoped by `.eq("user_id", userId)` in
the WHERE, so the doc reads as if the scoping were missing. It is not; the real
exposure is different and worse: a body-supplied `user_id` lands in **SET** while the
WHERE still matches the caller, so the row is reassigned to another account. Pinning
`user_id: userId` into the SET closes that, on the retry path as well.

`ensureVenueProfile` is untouched per A6. It legitimately writes `user_id` and `slug`
during self-heal, and the PATCH branch that calls it returns before the allowlist.
Two tests assert that branch never reaches `upsertVenueProfile`, covering both the
`ensureProfile` flag and the legacy `adoptIfOrphan` alias.

**The typecheck earned its place.** First attempt failed:

```
=== npm run check EXIT = 2 ===
src/app/api/venue-profile/route.ts(32,7): error TS2345: Argument of type
'Partial<Record<"type" | "name" | ... , unknown>>' is not assignable to parameter
of type 'Partial<Omit<DbVenueProfile, "user_id" | "id">>'.
```

That is a true statement about the code, not a nuisance: `pickWritable` guarantees
the **keys**, and the values are still unvalidated JSON. Resolved with an explicit
cast that says so and names `06` A3's zod schema as the thing that will remove it.
This is the reason the doc pairs A3 with A4/A6, which was not obvious until the
compiler said it.

**Verification, both directions.** Before:

```
× PUT drops every server-owned field from the body
  → id reached the DB payload: expected { …(13) } to not have property "id"
× PUT drops columns that exist in no schema
  → expected { name: 'Kettle', …(2) } to not have property "preferred_sizes"
× PATCH drops every server-owned field on the general-update branch
  → id reached the DB payload
 Tests  3 failed | 5 passed (8)
```

After:

```
 ✓ src/app/api/venue-profile/route.test.ts (8 tests) 5ms
      Tests  8 passed (8)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  135 passed (135)
      Tests  1267 passed (1267)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** 39a2758

### assertNoServerOwned (A5 and A7's second half) — now with hard evidence

Both remain deferred, and the reason is no longer speculative. Three legitimate
callers write server-owned columns today:

| Caller | Writes | Why it is legitimate |
|---|---|---|
| `api/artist-profile` PUT | `lat`, `lng` | derived server-side from the postcode by the geocoder |
| `api/artist-profile` POST | `review_status: "pending"` | server-chosen initial state for the claim flow |
| `api/venue-profile` POST:181 | `slug` | the venue picks its handle at creation |

`assertNoServerOwned` as specified throws on all three. It needs an exemption
mechanism first, an `allow` parameter or a separate `applyServerOwned()` path, and
that is a design decision deserving its own iteration rather than being improvised
inside a security fix. Neither E44 nor E45 depends on it: the allowlist at the route
is the control, the assert is defence in depth against a future careless caller.

### Follow-up noted, not done: the strip-and-retry dance

`upsertVenueProfile` still strips `preferred_sizes`, `interested_in_local_artists`,
`images` and the four `display_*` columns on retry, as "columns that may not exist in
older schemas". Verified in iteration 10: the first two exist in **no** schema, and
the other five all exist in prod. With the allowlist in place every key that can
arrive is known to exist, so the whole dance is dead weight against prod. §5.1 says
as much ("once the allowlist lands, the whole strip-and-retry dance can be deleted").
Left alone this iteration because deleting it changes error-path behaviour, which
does not belong bundled into a security fix.

---

## Iteration 17 — 2026-07-29

### E19 / E46f — unauthenticated `POST /api/orders`, deleted

Owner: `04` per D7 (it was claimed by `01` t4, `04` §0.3 and `06` A9; D7 resolves
to `04`). Runbook Phase 1c: "delete rather than fix".

The handler had **no authentication of any kind** and inserted directly into
`orders` with `status: "confirmed"` plus a client-supplied `total`, `subtotal`,
`items` and `buyerEmail`. Anyone could forge a paid order.

**Verified dead before deleting**, rather than taking the doc's word. Every
`"/api/orders"` reference in `src/app`, with the method each uses:

```
artist-portal/orders/page.tsx:68     GET
artist-portal/orders/page.tsx:84     PATCH
artist-portal/analytics/page.tsx:94  GET
customer-portal/page.tsx:87          GET
venue-portal/orders/page.tsx:59      GET
venue-portal/enquiries/page.tsx:41   GET
```

No caller used POST, and the only POST reference anywhere in `src` or `tests` is
to `/api/orders/track`, a different route. **The doc's claim held exactly**, which
is worth recording given how many others in this doc set have not.

**Changed:** 31 lines removed from `src/app/api/orders/route.ts`. Two tests
appended to the existing `route.test.ts`.

**Verification, both directions.** Before:

```
× POST /api/orders (E19, deleted) > exports no POST handler
  → POST was re-added to /api/orders: expected true to be false
```

After:

```
 ✓ src/app/api/orders/route.test.ts (11 tests) 9ms
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  135 passed (135)
      Tests  1269 passed (1269)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** 740b79a

The second test (GET and PATCH still exported) exists because a deletion is the
one change where the regression risk is taking a live handler with it.

### The lint guard is already earning its keep

After the deletion the route still reports two warnings:

```
missingAuthz     -> src/app/api/orders/route.ts exports PATCH and uses the service-role client...
missingDemoGuard -> src/app/api/orders/route.ts exports PATCH and mutates, but does not import @/lib/demo-guard
```

Correct and expected: `PATCH` is one of the 50 handlers Phase B to D still has to
convert, and E21 covers this route specifically. Recorded because it demonstrates
the rule pointing at real remaining work rather than at noise.

---

## Iteration 18 — 2026-07-29

### E39 — unauthenticated checkout-session PII disclosure, closed

Owner: `01` Phase B task 5.

`GET /api/checkout/session` authenticates nothing; it checks only that a session id
was supplied. It answered with `customerEmail`, the raw Stripe `metadata`, the
`cart`, and the full delivery address (name, both address lines, city, postcode,
country). The response is now id, payment status, total, and line-item names and
amounts.

**Changed:** `src/app/api/checkout/session/route.ts` and
`src/app/(pages)/checkout/confirmation/page.tsx`, together, as Phase B task 5
requires.

**Route and page had to ship together.** The confirmation page was the sole
consumer (`page.tsx:94`) and rendered both the delivery-address block
(`page.tsx:203-211`) and "You'll receive updates at <email>" (`page.tsx:226`) from
the stripped fields. Shipping the route alone would have left a page reading
`order.shipping.fullName` off an object that no longer has it.

**A real cost, which the doc anticipated** ("update the success page to match"):
the buyer no longer sees their delivery address or email on the confirmation page.
They have both in the confirmation email. Restoring it for a signed-in owner is
possible later, but needs owner matching, and per E21 the webhook does not populate
`buyer_user_id` on the main path, so guest checkout, the common case here, could
not benefit yet. Recorded in the route's comment so the next reader knows why it is
absent rather than assuming an oversight.

**Two things removed rather than left dangling:** `loadCartSession` (cart and
shipping were the only things it fed the response, so the import and the extra
round trip are gone) and, on the page, the now-dead `labelForCountry` import and
`SavedShipping` interface.

**Verification, both directions.** Before:

```
× does not return the customer's email     → to not have property "customerEmail"
× does not return the delivery address     → to not have property "shipping"
× does not return the raw cart or metadata → to not have property "cart"
× does not need the cart session row       → expected "spy" to not be called, called 1 times
 Tests  4 failed | 3 passed (7)
```

After:

```
 ✓ src/app/api/checkout/session/route.test.ts (7 tests) 6ms
```

The PII assertions check the serialised body, not just property absence, so a field
reappearing under a different name still fails.

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  136 passed (136)
      Tests  1276 passed (1276)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

Because this removes a render block from a customer-facing page, rebuilt and re-ran
the browser suite against the production build:

```
 ✓ /checkout/confirmation — no critical or serious axe violations (1.0s)
 ✓ /checkout, ✓ /cookies, ✓ /pricing
 ✓ 8 smoke tests
 4 skipped, 12 passed
```

**Commit:** 19f9098

### Phase B status

| Task | Finding | State |
|---|---|---|
| 4 | E19 delete POST /api/orders | done, 740b79a |
| 5 | E39 checkout-session PII | done, 19f9098 |
| 6 | E17 + E18 artwork-request reads | next; route and page must ship together, the artist-portal page uses plain `fetch` |

---

## Iteration 19 — 2026-07-30

### E17 + E18 — artwork-request reads gated. `01` Phase B is complete.

Owner: `01` Phase B task 6.

Both GETs were completely unauthenticated. `[id]/route.ts` returned the whole
request row (description, both budget columns, location, `invited_artist_slugs`,
`venue_user_id`) **plus every response**, so anyone could read a private brief and
every rival artist's terms before submitting their own. `[id]/responses/route.ts`
returned the same bids on its own. `PATCH` and `POST` in the same files were
properly gated, so the reads were the entire hole.

**Changed:** both routes now require auth and go through
`assertCanViewArtworkRequest` (the helper from 9427aab), plus
`artist-portal/artwork-requests/[id]/page.tsx`.

Response fan-out is gated on the returned role: the owning venue sees every
response, an artist sees only their own. Verified against prod that
`artwork_request_responses.artist_user_id` exists before filtering on it (the doc
was right this time).

**Also removed:** the detail route's unscoped re-read of `artwork_requests`. The
gate has already fetched and authorised that row, so re-selecting it by `id` alone
was redundant *and* exactly the fetch-then-trust pattern `authz.ts` exists to
remove.

**Route and page shipped together, and the doc's warning was accurate.**
`page.tsx:86` used a plain `fetch` while the same file already imported `authFetch`
and used it on line 164. Adding auth to the route without that one-word change
would have 401'd the artist detail page. Confirmed no plain `fetch` to these
endpoints remains anywhere in `src/app`.

**Verification, both directions.** Before, with the vulnerability legible as a test
result:

```
× returns 401 to an anonymous caller and never reaches the gate
  → expected 200 to be 401
× returns the gate's 404 for an artist who may not view the brief
  → expected 200 to be 404
× shows a browsing artist only their own response, never a rival's (E18)
  → expected undefined to be 'artist-1'
× passes the caller and the id to the gate
  → expected "spy" to be called once, but got 0 times
 5 failed
```

After:

```
 ✓ src/app/api/artwork-requests/[id]/route.test.ts (6 tests) 5ms
      Tests  6 passed (6)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  137 passed (137)
      Tests  1282 passed (1282)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

`assertCanViewArtworkRequest` itself is mocked in the route test: its visibility
logic already has its own coverage in `authz.test.ts`, so the route test checks
that the gate is called, its denial is honoured, and the response set is fanned out
by role. That is the seam worth testing here.

**Commit:** dcb91f0

### The lint guard is measuring the work now

```
files missing an authz import : 48  (was 50 at iteration 13)
files missing a demo guard    : 55  (was 55)
```

Both artwork-request routes now clear `missingAuthz` and report only
`missingDemoGuard`. Note E44 and E45's routes are still counted in the 48: they
import `writable-fields`, not `authz`, which is correct, they needed an allowlist
rather than an ownership gate. The 48 is therefore an over-count of real remaining
authz work, and the rule's own §3.5 limits already say it is an import-presence
check rather than proof.

### `01` Phase B status: complete

| Task | Finding | State |
|---|---|---|
| 4 | E19 delete `POST /api/orders` | done, 740b79a |
| 5 | E39 checkout-session PII | done, 19f9098 |
| 6 | E17 + E18 artwork-request reads | done, dcb91f0 |

Phase 1a/1b security items closed so far: E32, E44, E45, E19, E39, E17, E18.
Still open in Phase 1b: E31 (conversation reads, `assertConversationParticipant`
is ready and unused), B4 (`/email-preview` unauthenticated in prod), and the
`074` RLS closure with the `/apply` service-role switch, which D2 says needs the
`02` prereqs first.

---

## Iteration 20 — 2026-07-30

### E31 — conversation reads gated

Owner: `01`, Phase 1b.

`GET /api/messages/[conversationId]` required a login and then checked **nothing**:
it read every message for whatever id was supplied. Ids are
`dm-${slugA}__${slugB}` built from two public profile slugs, so they are
enumerable. Any signed-in user could walk slug pairs and read anyone's DMs. All
three handlers now call `assertConversationParticipant`, 404 on denial.

**Changed:** `src/app/api/messages/[conversationId]/route.ts`,
`src/components/MessageInbox.tsx`.

**Two more holes in the same file, neither in the finding:**

1. **PATCH trusted the request body.** It read `readerSlug` from the body and
   marked read on `recipient_slug = <that value>`, so a caller could mark another
   user's messages as read. Now uses the caller's own slugs from the gate, via
   `.in()` since a user may hold both an artist and a venue slug. `MessageInbox.tsx`
   stops sending the field rather than leaving a payload the server ignores.
2. **DELETE had its own participation check** — look up the caller's slug, read one
   message row, compare `sender_name`/`recipient_slug` in application code. A second
   implementation of the same rule, in the weaker fetch-then-compare shape, and it
   knew only the legacy slug columns. The shared gate also handles the modern
   `sender_id` / `recipient_user_id` rows, so replacing it widened correctness as
   well as removing the duplicate.

**Verification, both directions.** Before, 7 of 9 red, with both extra holes
legible as results:

```
× GET returns 404 for a conversation the caller is not in → expected 200 to be 404
× GET checks participation against the id it was given    → expected "spy" to be called once, got 0
× PATCH marks read against the caller's own slug          → expected 'somebody-else' to deeply equal [ 'maya-chen' ]
× DELETE refuses a conversation the caller is not in      → expected 400 to be 404
× DELETE uses the shared gate rather than its own check   → expected true to be false
```

After:

```
 ✓ src/app/api/messages/[conversationId]/route.test.ts (9 tests) 5ms
      Tests  9 passed (9)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  138 passed (138)
      Tests  1291 passed (1291)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** c0d5f9b

The denial tests assert that no read, update or delete was issued after the gate
refused, not merely that the status was 404. A handler that checks late but still
returns 404 would pass a status-only test.

One note on the mid-test adjustment: after seeing the first failure I changed the
PATCH assertion from `.eq` to `.in` semantics (a user can hold two slugs), then
**re-ran against the still-unfixed route** to confirm it was red for the right
reason (`expected 'somebody-else' to deeply equal [ 'maya-chen' ]`) before touching
the handler.

### Phase 1b remaining

| Finding | State |
|---|---|
| E31 conversation reads | done, c0d5f9b |
| B1 bootstrap RLS on orders/messages | refuted for prod by the runbook's own B1 check: `orders_select_party` and `messages_select_party` are live |
| B4 `/email-preview` unauthenticated in prod | open, and on D6's unconditional list, so "delete or gate to admin+non-prod" |
| E39, E17, E18, E19 | done in iterations 17 to 19 |
| `074` RLS closure + `/apply` service-role switch | blocked behind the `02` prereqs (D2), which are themselves blocked on the base-schema dump |

---

## Iteration 21 — 2026-07-30

### B4 — `/email-preview` gated out of production

Owner: D6 item 5, one of the unconditional items that may proceed before `08` is
rewritten.

The previewer renders every template in the registry and was reachable
unauthenticated on the live site, handing out the whole transactional-email surface
to anyone who guessed the path. The page's own header comment admitted it: *"Not
gated behind auth, add a check here or in middleware if you want to restrict it in
production."*

**Gated, not deleted.** D6 allows either. The templates are Keep per D0, this is how
anyone reviews them, and two smoke tests cover it, so deleting would have taken the
tool and the coverage with it.

**Changed:** new `access.ts` (the gate), `page.tsx` becomes a server component that
gates then renders, the listing UI moved to `EmailPreviewIndex.tsx` via `git mv`,
and `[id]/page.tsx` gates before the template lookup.

**The gate is an allowlist and fails closed.** Available only where the environment
is positively identifiable as non-production: a localhost origin, or `VERCEL_ENV` of
preview/development. Everything else 404s, including an unset or unparseable site
URL. The direction matters: `src/env.ts` defaults `NEXT_PUBLIC_SITE_URL` to
`https://wallplace.co.uk`, so treating "unset" as non-production would fail open on
a misconfiguration.

The index had to be split because it was `"use client"` and a client component
cannot read the environment. `page.tsx` is now a thin server gate.

**One deviation from D6, flagged rather than buried.** D6 says "admin+non-prod";
this implements non-prod only, with no admin conjunct. The previewer renders from
`entry.mock` fixtures and never touches real user data, so in a non-prod environment
an admin check protects nothing while breaking both smoke tests and the local dev
loop. The finding is specifically "unauthenticated **in prod**", which is closed.
Owner can ask for the admin conjunct if they want it anyway.

**Verification, both directions.** Gate helper, before: `Failed to load url ./access`.
After:

```
 ✓ src/app/email-preview/access.test.ts (7 tests) 1ms
 ✓ src/app/email-preview/page.test.tsx (4 tests) 4ms
```

The wiring test's own teeth, proved by deleting the gate line from `page.tsx`:

```
× /email-preview index page (B4) > 404s on the live site
  → expected [Function] to throw an error
 Tests  1 failed | 3 passed (4)
```

restored, back to 4 passed. Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  139 passed (139)
      Tests  1298 passed (1298)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

Rebuilt and re-ran the smoke suite against the production build, to prove the dev
path still works:

```
 ✓ /email-preview lists the template library (1.0s)
 ✓ /email-preview/customer_order_receipt renders the template (977ms)
 8 passed
```

**Commit:** efc93a4

### Phase 1b is now closed apart from the DB work

| Finding | State |
|---|---|
| E32, E44, E45 | closed (theft chain, both ends, plus the venue equivalent) |
| E19 | deleted |
| E39 | closed |
| E17, E18 | closed |
| E31 | closed |
| B4 | closed |
| B1 | refuted for prod by the runbook's own verification |
| `074` RLS closure + `/apply` switch | **blocked**: D2 puts the `02` prereqs first, and those need the base-schema dump, which needs the Supabase CLI (see iteration 4) |

Next unblocked work, in dependency order: G-A / G-B, the public PII projections for
Bug 1 (`/api/browse-artists` leaking exact postcode and GPS to anonymous callers)
and Bug 5 (`/api/venues/demand` paywall bypass via the name-bearing slug and exact
coordinates). Both are API-side with no migration, which is why D8 assigns them to
`02`'s workstream rather than to a migration.

---

## Iteration 22 — 2026-07-30

### G-A / Bug 1 — the anonymous artist feed no longer publishes home addresses

Owner: D8 G-A, assigned to `02`'s workstream (API-side, no migration).

`/api/browse-artists` is unauthenticated and returned each artist straight from the
transform, `postcode` and the `coordinates` geocoded from it included. For a solo
artist working from home that is their home address, available to anyone who curls
the endpoint.

**Changed:** new `src/lib/db/public-artist.ts` (`toPublicArtist`), applied in
`src/app/api/browse-artists/route.ts`, plus the anonymous assertion in
`tests/e2e/security-no-leaks.spec.ts`.

**Deviation from D8, with the arithmetic.** D8 says strip both, and "if distance
filtering is needed ... a coarse band (e.g. rounded to ~1 decimal)". Distance
filtering **is** needed: `browse/page.tsx` filters and sorts on
`artist.coordinates` client-side in four places (lines 887-892, 950-951, 1135-1136,
1795). But:

```
DISTANCE_OPTIONS smallest radius : 5 miles  (~8 km)
1 decimal place                  : ~11 km quantisation on latitude
2 decimal places                 : ~1.1 km, worst-case error ~0.55 km
```

At 1dp the rounding error exceeds the tightest filter, so local search would have
silently stopped meaning anything. Using **2dp**, with `PUBLIC_COORD_DECIMALS` as a
named constant carrying the reasoning and a test asserting the worst-case error
stays under 1km. Postcode is removed outright, since nothing client-side reads it.

**Projected at the route, not in the transform.** `artist-profiles-transform.ts`
also serves an artist their own profile, where the postcode is theirs to see and the
editor needs it. Checked the alternatives first: `getAllArtists()` has exactly two
callers, this route and `api/admin/stats`, and the latter only reads `.length`.

**Verification, both directions.** Before: `Failed to load url ./public-artist`.
After:

```
 ✓ src/lib/db/public-artist.test.ts (7 tests) 3ms
 ✓ src/app/api/browse-artists/route.test.ts (5 tests) 8ms
```

Route test's teeth, proved by dropping `.map(toPublicArtist)`:

```
× publishes no postcode                → to not have property "postcode"
× publishes coarsened coordinates      → expected { lat: 51.418123, lng: -0.366789 }
                                          to deeply equal { lat: 51.42, lng: -0.37 }
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  142 passed (142)
      Tests  1314 passed (1314)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

The e2e assertion asserts "no postcode, no coordinate finer than 2dp" rather than
D8's "no coordinates", to match what the projection actually guarantees. Confirmed
it skips with the rest of that suite when credentials are absent and executes when
they are present.

**Commit:** 3a13aab

### The typecheck found a real API flaw again

Constraining the generic to `{ postcode?: string; coordinates?: Coordinates }`
makes it a *weak type* (all properties optional), so TypeScript rejected
`toPublicArtist({ slug, name })` with "no properties in common" — and an artist
carrying no location data is a legitimate input. Constraint is now `object` with the
shape asserted inside. That is the third time in this run that `npm run check`
caught something worth fixing rather than something to appease.

---

## Iteration 23 — 2026-07-30

### G-B / Bug 5 part 1 — paywalled venue coordinates coarsened

Owner: D8 G-B.

`redactDemandVenue` blanked name, description, image, images and the display fields
but left the **exact coordinates** on the row, so a paywalled venue's precise
location was still published to anonymous callers. DB venues carry
`coordinates: null`, but the static venues in `src/data/venues.ts` carry 4dp fixes
(~11m), e.g. `{ lat: 51.4732, lng: -0.0693 }`.

**Changed:** new `src/lib/geo-precision.ts`, `venue-visibility.ts`,
`public-artist.ts` (now delegates), and the e2e venues/demand assertion.

Coarsened rather than dropped, because `/spaces` sorts by distance client-side
(`spaces/page.tsx:234-235`). Extracted the precision rule into one shared module so
the artist feed and the venue tracker cannot drift apart, rather than copying the
constant.

**Verification, both directions.** Before:

```
× coarsens the coordinates for an unentitled viewer
  → expected { lat: 51.4732, lng: -0.0693 } to deeply equal { lat: 51.47, lng: -0.07 }
 Tests  1 failed | 13 passed (14)
```

After:

```
 ✓ src/lib/db/public-artist.test.ts (7 tests)
 ✓ src/lib/venue-visibility.test.ts (14 tests)
 ✓ src/app/api/browse-artists/route.test.ts (5 tests)
      Tests  26 passed (26)
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  142 passed (142)
      Tests  1319 passed (1319)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** ceb4d45

### G-B part 2 — the slug. Real finding, but the fix is an owner decision

D8 also says to "return an opaque id instead of the slug" for non-subscribers, and
to strip venue-name-bearing hrefs from the `/spaces` HTML.

**The finding is real.** I checked whether the name is actually secret, because if
it were already public the slug would leak nothing. It is not public:

- `venues/[slug]/page.tsx` keeps its SSR metadata deliberately generic: *"Venue
  identity is paywalled ... server-rendered metadata can't vary per viewer, so the
  SSR title/description stay generic and don't leak the venue name."*
- `VenueProfileBody` fetches the gated `/api/venues/[slug]/profile` and renders
  either the full profile **or a locked teaser** (`!state.data.locked`).

So a slug that spells the name (`the-copper-kettle`) does bypass that gate, in the
JSON and in the card's `href`.

**But the slug is load-bearing.** `/spaces` links every card through to
`/venues/<slug>` for everyone except other venues (`canClickThroughCard = userType
!== "venue"`), with a comment stating the intent: *"Logged-out and unsubscribed
visitors land on the read-only public profile."* Replacing the slug with an opaque
id therefore needs:

1. an opaque id that `/venues/[id]` can resolve,
2. an id for the **static** venues too, which have no DB uuid,
3. a change to public URL structure.

That trades a paywall leak against a conversion funnel, and changes URLs. Not a
call to make silently inside a security fix, so it is recorded above as an owner
decision. Options: accept the leak as the price of the click-through; invest in
opaque ids plus resolution; or stop emitting the link for unentitled viewers, which
closes the leak but removes the funnel.

Part 1 stands on its own: the coordinate leak is closed either way.

---

## Iteration 24 — 2026-07-30

### N-K2 — both `parseDimensions` implementations pinned. The collapse itself needs a decision.

Owner: `07 §13.2`, pulled forward by the dependency order.

**I did not do the collapse.** §13.2 says to collapse onto
`lib/visualizer/dimensions.ts`. Measuring first showed that doing so changes
shipping prices for most of the real data, and that the choice it forces is a
product decision, not a refactor. What shipped instead is the safety net that makes
the collapse deliberate and reviewable when it happens.

**There are three modules in this family, not two.** The doc describes a pair:

```
lib/shipping-calculator.ts    parseDimensions            → shipping price
lib/visualizer/dimensions.ts  parseDimensions            → wall preview
lib/dimensions.ts             displayPhysicalDimensions  → what buyers see
```

**Measured on every distinct `artist_works.dimensions` value in prod** (26 of them)
plus the formats each docstring advertises. **They disagree on 17 of 27 inputs**, on
real data rather than exotica:

```
input                  shipping     visualizer
750 × 562 px           56×75        750×562
2326 × 1551 px         155×233      232.6×155.1
812 × 812 px           81×81        812×812
612 × 459 px           46×61        612×459
3 x 20x30 cm           20×30        3×20
A4                     21×30        21×29.7
12 inch by 16 inch     30×41        30.48×40.64
```

**Neither parser is uniformly better**, which is why "collapse onto the visualizer
one" cannot be applied literally:

- **shipping alone** handles the multi-piece form (`"3 x 20x30 cm"`) that its own
  docstring advertises, and its `> 300 ⇒ millimetres` heuristic accidentally keeps
  pixel data in a plausible range.
- **shipping alone** sorts the pair descending, so it **silently swaps
  orientation**: landscape `2326 × 1551` comes back portrait. That is a defect in
  its own right and probably part of Bug 8.
- **the visualizer alone** uses true ISO paper sizes and preserves orientation, but
  takes the **first** numeric pair, so it reads `"3 x 20x30 cm"` as 3×20.

A correct single parser needs ISO sizes **and** preserved orientation **and**
parenthesised hints **and** multi-piece **and** a plausibility rule. Four of those
five exist, in two different files.

**The decision that blocks it.** 18 of the 26 prod values are pixel dimensions.
`lib/dimensions.ts` already rejects those for display (`MAX_REASONABLE_CM = 200`,
`PIXEL_HINT`) and its comments name the shipping parser as what it is defending
against:

> *"1000 is pixel data even without the "px" marker. parseDimensions happily
> reinterprets such pairs as millimetres (any value > 300 ...) ... 'print' for a
> 5141 × 3427 px image. Stop that here."*

Shipping has **no equivalent guard**, so it still prices a 242 × 363cm parcel from
`"2420 × 3632 px"`. That asymmetry is the live defect behind Bug 7 / Bug 8. Closing
it means deciding what checkout does with an implausible size: refuse to quote,
clamp to a maximum, or fall back to a default. That changes checkout behaviour for a
large share of works and touches money, so it is escalated, not guessed.

**What shipped:** `src/lib/dimension-parsers.characterisation.test.ts`, 35 tests
pinning today's behaviour per input, the disagreement count, the orientation swap,
the multi-piece gap, the ISO difference, and the display guard's asymmetry with
shipping.

```
 ✓ src/lib/dimension-parsers.characterisation.test.ts (35 tests) 4ms
```

Proved the pin has teeth by changing shipping's A4 entry from `21×30` to `21×29.7`:

```
× A4: shipping reads 21×30, visualizer reads 21×29.7
  → shipping changed for "A4": expected '21×29.7' to be '21×30'
× 8×10" (A4): ...
× only the visualizer uses true ISO paper sizes
```

restored, back to 35 passing. Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  143 passed (143)
      Tests  1354 passed (1354)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** 04c023c

When the collapse lands, the disagreement count in that file should go to 0 and the
file should be deleted along with the losing parser. It is scaffolding, not a
permanent fixture, and it says so at the top.

---

## Iteration 25 — 2026-07-30

### Bug 15 / D4 — `/admin` gross sales was £0 against £1174.87 of real orders

Owner: `04` Phase 0, assigned by D4 (which voided `07 §6.1-6.2`'s "backfill
amount_cents", since that would backfill a column that does not exist).

`/admin` reported **"£0" and "0 orders"** while prod held 12 paid orders. The orders
query selected `amount_cents`, which exists in no migration and not in the live
table, so PostgREST rejected the whole statement, `.data` came back null, `|| []`
turned it into an empty array, and both headline figures read zero.

**Why it looked like a display bug:** the pounds-to-pence fallback directly beneath
the select was already correct, and its comment even said *"never populated
amount_cents, so the headline read £0"*. Someone had diagnosed the symptom and
fixed the arithmetic, but the query above it still named the phantom column, so the
fallback was unreachable. **Fifth phantom column this run.**

**Changed:** `src/app/api/admin/stats/route.ts`. Removed the column from both
selects, the row types, and `sumPaid`, where the `amount_cents != null` branch could
no longer be reached. Per D4, the column is not added.

**Measured against prod, before and after**, using the route's own exclusion
semantics (`status not in refunded/cancelled/failed/void`):

```
amount_cents_exists |  0
counted_orders      | 12
gross_pounds        | 1174.87
gross_pence         | 117487
```

D4's acceptance was "gross ≥ £773.25, count > 0". Actual is £1174.87 across 12
orders. £773.25 was the artist-portal subtotal, so a lower bound rather than the
full figure, which is why the real number is higher.

**Verification, both directions.** The fake db **refuses a select naming a column
the table does not have**, exactly as PostgREST does; without that the test cannot
see this class of bug at all. Before:

```
× does not select a column the orders table does not have
  → orders select names a phantom column: "total, amount_cents, status, created_at"
× reports the real gross instead of £0   → expected +0 to be 117487
× reports a non-zero order count         → expected +0 to be 12
× still excludes refunded and cancelled  → expected +0 to be 117487
× converts pounds to pence               → expected 0 to be greater than 10000
 5 failed
```

After:

```
 ✓ src/app/api/admin/stats/route.test.ts (6 tests) 4ms
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  144 passed (144)
      Tests  1360 passed (1360)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** ee7e888

### Checked the neighbours rather than assuming

Every other `amount_cents` reference in `src` is on **`stripe_transfers`**, which
genuinely has the column. Confirmed it is the only table that does:

```
table_name       | column_name
stripe_transfers | amount_cents
```

So `api/admin/financials` and `api/refunds/process` are correct and untouched. Worth
recording because "grep for the phantom column and delete every hit" would have
broken both.

### Running tally of phantom columns

Five now, all found by checking prod rather than trusting a doc or the surrounding
code:

| Column | Where | Iteration |
|---|---|---|
| `artist_profiles.ships_internationally` | `06` §5.1 allowlist | 10 |
| `artist_profiles.international_shipping_price` | `06` §5.1 allowlist | 10 |
| `artist_works.in_store_price` | `06` §5.1 allowlist | 10 |
| `placements.requester_user_id` | `01` §1.1 authz select, **and live UI code** | 11, 12 |
| `orders.amount_cents` | `api/admin/stats` select | 25 |

Two of the five were breaking production behaviour, not just sitting in a plan: the
placement accept/decline controls never render, and admin gross sales read £0.

---

## Iteration 26 — 2026-07-30

### T10 — the managed curation tiers were unsellable. First migration of the run.

Owner: `04` task 7.0, pulled into Phase 0 by D9.

`curation_requests.tier` permitted only the three one-off tiers while
`api/curation/route.ts` already accepted `managed_monthly` and `managed_quarterly`
and inserts the submitted value directly. Every managed sign-up violated the
constraint and returned a 500, so **£79.99/month and £199.99/quarter could not be
sold at all**.

**Changed:** new `supabase/migrations/080_curation_managed_tiers.sql`, new
`src/lib/curation-tiers.ts`, and `api/curation/route.ts` now imports from it.

**Migration number:** 080, the first free number inside `04`'s D1 range (080-089).
Verified 080-082 were unused before taking it, and the numbering guard from
iteration 4 still passes.

**Checked the data before widening:** 2 rows, both `single_wall`. The new set is a
strict superset of the old, so no existing row could be invalidated.

**Applied to prod and verified in place:**

```
CHECK ((tier = ANY (ARRAY['single_wall'::text, 'full_space'::text, 'bespoke'::text,
                          'managed_monthly'::text, 'managed_quarterly'::text])))
rows_intact 2 | single_wall_intact 2
```

D9 was right that the CHECK was confirmed in prod (`04 §D25` had it as
"UNCONFIRMED"), so pulling 7.0 forward was correct.

**The real defect was the drift, not the constraint.** The route restated the five
tier keys in a zod enum next to a `TIERS` table holding the same keys, and the DB
held a third copy. So the fix removes the duplication: the tier table moves to
`src/lib/curation-tiers.ts` as one definition, and the enum derives from
`CURATION_TIER_KEYS`. A tier added to the table can no longer be rejected by the
validator.

**Verification, both directions.** Before: `Failed to load url ./curation-tiers`.
After:

```
 ✓ tests/integration/migration-numbering.test.ts (4 tests) 10ms
 ✓ src/lib/curation-tiers.test.ts (5 tests) 10ms
```

One of those five parses the tier CHECK out of the migration files and asserts it
matches the code's tier list exactly, so adding a tier without a migration fails CI
rather than 500ing in production.

**DB verification ladder.** Advisor run **via the Supabase MCP, not the npm script**
(D12 ruling 2, the token is absent): no new lints, the list is the known baseline of
18 `rls_enabled_no_policy` INFO, 13 INSERT-only `rls_policy_always_true` WARN, and
the leaked-password WARN. The `pg_policies` assertion still returns exactly the five
known leaks and nothing new, confirming this change did not touch RLS:

```
artist_applications | Authenticated users can read applications | (auth.role() = 'authenticated')
contact_submissions | Authenticated can read contact            | (auth.role() = 'authenticated')
enquiries           | Artists can read their enquiries          | true
venue_registrations | Authenticated can read venue reg          | (auth.role() = 'authenticated')
waitlist_signups    | Authenticated can read waitlist           | (auth.role() = 'authenticated')
```

Full gate:

```
=== npm run check EXIT = 0 ===
 Test Files  145 passed (145)
      Tests  1365 passed (1365)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** 509d3c4

`04` Phase 0 is now complete: Bug 15 (ee7e888) and T10 (509d3c4). Next is G-C / Bug 10
("ships to UK only" unenforced), then T3 offers, which is where E6 lives — the
finding behind the two unpaid offers. Note E6's *code* fix is in scope; the £60
reconciliation against Stripe stays a human task per D11.

---

## G-C / Bug 10 — delivery country vs the artist's shipping scope (owner: `04`)

**The finding as written.** "Validate the delivery country against the work's
shipping scope in `api/checkout/route.ts` before creating the session, and restrict
the country dropdown. Test: UK-only item + AU address → 400, never reaches Stripe."

**What the plan got wrong.** There was no shipping scope to validate against. This
is the sixth phantom column of the same family as D9's list, and the biggest:

- `artist_profiles.ships_internationally` and `international_shipping_price` exist
  in no migration and were not in the live table. Confirmed by
  `information_schema.columns`: the only shipping-ish column on the table was
  `default_shipping_price`.
- `artist-profiles-transform.ts:147` reads `profile.ships_internationally || false`,
  so `shipsInternationally` was `false` for all 14 live artists, which is why
  **every** artwork page rendered "Ships to UK only"
  (`ArtworkPageClient.tsx:476`), not just the UK-only ones.
- The artist portal's "Ships internationally" toggle
  (`artist-portal/portfolio/page.tsx:1895`) PUT both names, and E44's
  `writable-fields.ts` had deliberately left them off the allowlist, because
  allowlisting a phantom column makes PostgREST reject the whole UPDATE and turns
  one stray field into a total save failure. Correct at the time, and the cost was
  that the toggle was decorative: no artist could ever record that they ship abroad.

So the site made a promise it could not vary ("UK only", everywhere) and enforced
nothing. `api/checkout:269` checked `isSupportedCountry(shipping.country)`, which is
the platform's ~40-country list, not the artist's scope.

Fixing this as code alone would have meant hard-coding "everyone is UK only",
permanently blocking international sales with no route to re-enable them. That is a
larger externally-visible change than the plan intended, so the column came first
and the enforcement reads it.

**What changed.**

- `supabase/migrations/081_artist_international_shipping.sql` (04's range, 080 taken
  by T10) adds `ships_internationally boolean not null default false` and
  `international_shipping_price numeric`, typed to mirror `offers_pickup` and
  `default_shipping_price` beside them. Applied to prod and verified.
- `src/lib/shipping-scope.ts` (new) `findUkOnlyArtists(slugs)`. Reads the scope from
  the database, never from the request: the cart is localStorage-backed, so a client
  that could assert its own scope could assert its way past the check. Fails closed
  on a missing profile row, a null flag, a read error, or a blank slug.
- `src/app/api/checkout/route.ts` refuses a non-UK destination with
  `400 shipping_scope` before the Stripe session is minted. Collection is exempt: a
  buyer collecting in person may live abroad, and their country is not a delivery
  destination.
- `src/app/(pages)/checkout/page.tsx` restricts the country dropdown to the UK
  unless **every** artist in the cart ships abroad, the same all-or-nothing rule as
  pickup, and snaps a stale non-GB country back to GB when a cart edit removes the
  artist who made it reachable. It reuses the existing `/api/browse-artists` fetch
  that already resolves `offersPickup`, so no new route and no new cart field: the
  dropdown and the enforcement read the same source and cannot disagree. Nine
  add-to-cart call sites would otherwise all have needed the flag threaded through.
- `src/lib/db/writable-fields.ts` allowlists both columns, so the artist portal's
  toggle finally persists. The NOTE explaining why they were excluded is replaced,
  not left to become a lie.
- `src/app/api/artist-profile/route.ts` extends the negative-price guard to
  `international_shipping_price`, which now reaches `updatePayload` again. Without
  this an artist could save a negative international price, which is exactly the
  discount-dressed-as-shipping bug the guard exists to stop.

**Deleted, not left beside the new behaviour.** The route test
`"accepts US (international) and creates a Stripe session"` asserted the bug: a
supported country is not a country the artist ships to. Replaced with
`"accepts US when the artist has opted in to international delivery"`. The
allowlist guard `"excludes the three columns that do not exist in prod"` now names
only `in_store_price`, which is still phantom, and a second test asserts the other
two ARE allowlisted and says why the old reason expired.

**Tests added.** 6 route tests (`src/app/api/checkout/route.test.ts`), 9 resolver
tests (`src/lib/shipping-scope.test.ts`), 2 profile-route tests. The plan's named
acceptance test is
`"refuses a UK-only item shipped to AU with 400 and never reaches Stripe"`.

**Verification, both directions.** With the guard disabled (`if (false && …)`),
exactly the three refusal tests fail and the three permissive ones still pass, which
proves they test the guard and not a blanket 400:

```
 × refuses a UK-only item shipped to AU with 400 and never reaches Stripe
 × names the artist and the destination in the refusal
 × refuses a mixed cart where only one artist ships abroad
 Tests  3 failed | 31 passed (34)
```

Restored:

```
 Test Files  146 passed (146)
      Tests  1383 passed (1383)
✖ 252 problems (0 errors, 252 warnings)
```

**DB verification ladder.** `npm run audit:advisors` cannot run locally
(`SUPABASE_ACCESS_TOKEN not set`, the D12 ruling 2 reason it lives in the nightly
workflow). Advisor via the Supabase MCP instead: no new lints, and nothing on
`artist_profiles`. The `pg_policies` assertion returns the same five known leaks and
nothing new, confirming 081 touched no policy:

```
artist_applications | Authenticated users can read applications | (auth.role() = 'authenticated')
contact_submissions | Authenticated can read contact            | (auth.role() = 'authenticated')
enquiries           | Artists can read their enquiries          | true
venue_registrations | Authenticated can read venue reg          | (auth.role() = 'authenticated')
waitlist_signups    | Authenticated can read waitlist           | (auth.role() = 'authenticated')
```

**Prod facts established.** Worth recording because two of them contradict the docs:

- `artist_profiles`: 14 rows, all slugs lower-case, `ships_internationally` false for
  all 14 after the migration, so nothing visible changed for any buyer today.
- `orders`: 12 rows, every one UK, but stored in **two different formats** in the
  same column: 6 as `GB` and 6 as the free-text `United Kingdom`. No international
  order has ever been placed, so enforcing UK-only removes no working revenue path.
  The mixed format is a separate defect, logged below.

**Commit:** a02c38e

**New finding, not fixed here (would be bundling).** `api/checkout` passes the
**client-supplied** `item.internationalShippingPrice` into `calculateOrderShipping`.
Cart lines are re-validated against the DB for price, but this figure is not, so a
crafted cart can set its own international shipping cost. Pre-existing and unchanged
by this commit, but it stops being dead code the moment an artist opts in. Belongs
with `04` T1 hardening.

**Second new finding.** `orders.shipping->>'country'` holds both `GB` and
`United Kingdom` (6 each). Any report or filter keyed on the ISO code silently sees
half the orders. A backfill is a data write to real order rows, so per the loop's
rules it is escalated rather than done: see the owner-decisions section.

---

## T3 / E6 + E10 — offer paid, artist never paid, stock never moved (owner: `04` §B3)

**What the plan got wrong, twice, fatally.** The doc's own fix would not have
fixed this, and one half of it would have broken the flow outright.

1. **Its `orders` insert omits `shipping`.** `orders.shipping` is `NOT NULL` with no
   default. Verified against prod with a probe that cannot commit (an unconditional
   `raise` at the end of a `DO` block, so the insert rolls back either way):

   ```
   PROBE RESULT >> INSERT FAILED: 23502 / null value in column "shipping"
                   of relation "orders" violates not-null constraint
   ```

   Applied verbatim, the doc's replacement insert fails exactly as the old one did.
2. **Its part-1 select names `free_until`**, which exists in no migration and not in
   the live table. PostgREST rejects the whole statement, so `artistProfile` comes
   back null and the doc's own guard returns `500 Artist profile unavailable` for
   **every** offer checkout. A probe applying that select fails 7 of the 9 new route
   tests.

**What was actually happening in prod.** Worse than "a bare order row". There was
**no order row**. The branch flipped `purchase_offers` to `paid` *first*, then
attempted the insert, and swallowed the result with
`.then(() => {}, (err) => console.warn(...))`. So:

```
off_1778801604152_05slql  paid  £33.00  paid_order_id OFR-W45tsGG1  → 0 orders rows
off_1779401107177_33azhw  paid  £27.00  paid_order_id OFR-xifC3QjR  → 0 orders rows
```

These are D11's two offers. Money captured in Stripe, offer marked paid, order row
absent, `paid_order_id` dangling, no payout, no `stripe_transfers` row, no stock
movement, no email. Nothing in the code path would ever have surfaced it: the only
signal was a `console.warn` in a serverless log.

**What changed.**

- `src/app/api/offers/[id]/checkout/route.ts`: resolves the artist profile
  (`slug, subscription_plan` only, never `free_until`), refuses with **422** before
  creating the session if `canArtistAcceptOrders` says the artist cannot be paid,
  and computes the split in integer pence with the net as the remainder of a single
  rounding, so fee + net is exactly the amount charged. Fee, net, percent and
  `offer_buyer_email` now travel on the session metadata.
- `src/app/api/webhooks/stripe/route.ts` purchase-offer branch: **order first, offer
  second**. A real insert error logs loudly and returns 500 so Stripe retries,
  rather than creating the dangling paid state above; `23505` counts as
  already-done. The insert supplies `shipping` in the same nine-field shape the cart
  path writes (blank address, `notes` recording that the offer flow collects none),
  a guaranteed-non-null `buyer_email`, the three money columns and zeroed venue
  columns. Then E10's per-work `quantity_available` decrement (last one also comes
  off sale), then `scheduleTransfer` for the net, which is what finally writes the
  missing ledger row.

**Deliberately not in this commit.** The doc's part 3 (emails) requires extracting
`sendOrderConfirmations` out of the cart branch's ~200-line block and calling it
from both. That is a refactor of a second code path, so it is its own task rather
than a bundle. The offer branch still sends no email.

**Tests added.** 12 in `src/app/api/webhooks/stripe/route.test.ts`, 9 in
`src/app/api/offers/[id]/checkout/route.test.ts` (new). The webhook fake **enforces
the real NOT NULL set** on `orders`; without that it cannot see this bug at all,
because a permissive insert stub passes whether or not `shipping` is supplied. The
route fake likewise rejects a select naming a column the live table lacks.

**Verification, both directions.** Removing just the `shipping` key from the insert
collapses 11 of the 12 webhook tests, which is the prod failure reproduced:

```
 × writes an order row at all, which is the live E6 defect
 × supplies shipping, the NOT NULL column that made every offer payment fail
 × persists the split, and fee plus net is exactly the amount charged
 × E10: decrements stock for each work on the offer
 × E6: schedules the artist transfer for the net, not the gross
 × marks the offer paid only after the order row lands
 Tests  11 failed | 4 passed (15)
```

Restored:

```
 Test Files  147 passed (147)
      Tests  1404 passed (1404)
✖ 252 problems (0 errors, 252 warnings)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Blocker: the Stripe test-mode drive could not be run.** The runbook requires a
payment task to "drive the Stripe test-mode event and assert DB rows + the split to
the penny". Not possible in this environment, and I am not claiming otherwise:

```
STRIPE_SECRET_KEY = sk_test_PLAC…        (placeholder)
curl https://api.stripe.com/v1/balance → HTTP 401
STRIPE_WEBHOOK_SECRET                    unset
stripe CLI                               not installed
```

The substitute is the 12 webhook tests, which drive the handler's real code path
with a synthetic `checkout.session.completed` and assert the order row, the offer
transition, the stock updates, the transfer amount and the split to the penny. A
genuine test-mode drive needs a real `sk_test` key, so it stays owner-blocked
alongside the `SUPABASE_ACCESS_TOKEN` secret.

**Commit:** b2c27ed

---

### New finding, bigger than the task that surfaced it: `free_until` is phantom and it is overcharging artists

`artist_profiles.free_until` exists in **no migration and not in the live table**,
the seventh phantom column found so far. `platformFeePercentForArtist` reads it, and
four live call sites name it in a `select`, which makes PostgREST reject the whole
statement and hand back `null`:

| Site | Effect of the null |
|---|---|
| `webhooks/stripe/route.ts:203` (**cart sale split**) | `ap` is null, so `platformFeePercentForArtist(null)` returns `DEFAULT_PLAN_FEE_PERCENT` = **15%** for every sale |
| `api/placements/[id]/payment/setup/route.ts:47` | same, so paid-loan `application_fee_percent` is always 15% |
| `webhooks/stripe/route.ts:793-804` (referral credit) | select nulls, then it UPDATEs `free_until`, so referral credit silently never applies |
| `lib/platform-fee.ts:31` | the 0% founding/trial branch is unreachable dead code |

This is not latent. Prod has a `pro` artist (should be 5%) and a `premium` artist
(should be 8%):

```
plan     artists        fee_pct  orders  gross
none           9             15      11  £1110.38
core           3              0       1  £64.49
pro            1
premium        1
```

Eleven of the twelve orders were charged 15%. Non-core artists are being
overcharged on the main revenue path right now.

Not fixed here, because it is not this task and the fix has a decision in it: either
add `free_until` as a real column (it is referenced as a founding/trial concept, and
the referral path wants to write to it) or delete the concept and every reference.
That is a product call, not a mechanical one. Recorded as its own queue item below;
the offer path I wrote today already computes the correct per-plan rate because it
selects `subscription_plan` alone.

---

## T3 / E6 part 3 — the offer branch sent nothing (owner: `04` §B3)

**The finding.** An accepted offer, once paid, sent no email to anyone. The buyer got
no receipt (CCR 2013 requires one) and the artist was never told they had sold a
piece. The three sends lived inline in the cart branch, so the offer branch, written
later, never inherited them. That is exactly the drift the doc predicted, and the
reason it prescribes extraction rather than a second copy.

**What changed.**

- `src/lib/orders/confirmations.ts` (new) holds `sendOrderConfirmations`: the
  lifecycle event, the buyer receipt, the artist's two emails and the in-app
  notifications for artist and venue. One copy.
- The cart branch's inline block is **deleted**, along with the six imports the
  extraction orphaned (`CustomerOrderReceipt`, `ArtistWorkSold`,
  `ArtistOrderConfirmation`, `signOrderToken`, `recordOrderEvent`,
  `notifyArtistNewOrder`/`notifyVenueOrderFromPlacement`). Confirmed by grep that
  exactly one copy of each idempotency key remains in the tree.
- The offer branch calls the same module with **one aggregate line**. An offer is a
  single agreed price, so splitting it per work would invent figures that do not sum
  back to the amount charged. The work title comes off the existing stock-decrement
  query, so naming the piece costs no extra round-trip.
- A failed send in the offer branch is caught: the money is taken and the order row
  exists, so a provider outage must not become a Stripe retry that re-runs the
  payout path.

**What deliberately stayed with the caller.** Resolving cart lines into display items
needs the cart row and the slug map, and the write-back of those items must not
happen on an offer, where `orders.items` carries the `offer_id` linkage.

**Tests.** 6 characterisation tests written **before** the extraction, because
nothing pinned these sends and a refactor of the highest-consequence path in the app
was otherwise unverifiable. They passed unchanged afterwards, which is the evidence
the move preserved behaviour. 11 new tests cover the offer sends, including that the
receipt's line total, subtotal and total all agree.

**A real bug found in my own test file.** An unconsumed `mockRejectedValueOnce`
stayed queued and fired inside whichever test called `sendEmail` next. It surfaced as
a phantom cart failure during the before/after probe, and would have been an
intermittent failure later. `beforeEach` now resets rather than clears.

**Verification, both directions.** With the offer call disabled, exactly the 7 offer
send tests fail and every cart pin stays green:

```
 × sends the buyer a receipt and the artist both emails, which it never did before
 × keys the offer sends on the payment intent, like the cart path
 × raises the in-app sale notification for the artist
 × bills the receipt as one aggregate line that sums to what was charged
 × names the piece on the receipt when the offer covers one work
 Tests  7 failed | 23 passed (30)
```

Restored:

```
 Test Files  147 passed (147)
      Tests  1419 passed (1419)
✖ 252 problems (0 errors, 252 warnings)   ← same warning baseline as before
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

Stripe test-mode drive still not possible (placeholder key), same blocker as b2c27ed.

**Commit:** 451cf53

---

## Supervisor D16 / D17 received (committed separately as 979141f)

The supervisor added D16 and D17 to EXECUTION-DECISIONS mid-iteration. Committed on
its own so authorship stays clear. I verified D17.1's prod claims rather than taking
them from the doc:

```
artist_profiles: 67 columns
trial_end            timestamp with time zone   ← exists
is_founding_artist   boolean                    ← exists
free_until                                      ← absent, as D17 says
```

**Two rulings change this ledger:**

1. **D17.1 reclassifies the `free_until` overcharge from an owner decision to a
   mandated fix.** I had queued it for the owner; that was wrong per the ruling, and
   the entry above is superseded. The fix needs no owner input: drop `free_until`
   from both `.select()` calls, and map the free-window concept onto `trial_end`,
   which exists. The supervisor also found the specific victim I had not attributed:
   ten of the twelve orders belong to `fin-coles`, who is `premium` and should pay
   8%, not 15%. Their two honest caveats stand, the plan start date is unknown and
   `stripe_transfers` is empty, so the ~£59 figure is not settled and the cash
   question joins the D11 reconciliation. **This is the next task.**
2. **D17.3 pulls a schema-column guard forward**, ahead of the remaining payment
   tasks, and downgrades X2/K11's `pg_dump` to optional. That unblocks what was
   recorded here as blocked on the absent Supabase CLI: a committed
   `schema-columns.json` generated from `information_schema.columns` delivers K11's
   auditable schema record without the dump, and a test scanning every
   `.from(...).select(...)` turns the phantom-column class into a CI failure instead
   of a silent wrong answer. Seven instances found so far by hand, which is the
   argument for the guard.

Also logged for `04` T1: **D16.1** normalise country on read, no backfill of order
history; **D16.2 / E47** re-read `international_shipping_price` from the DB instead
of trusting the cart, before any artist can enable international shipping.

---

## D17.1 — the fee overcharge, and a guard for the whole phantom-column class

**D17.1's site list was incomplete.** It named two selects; there are four, and the
two it missed both matter:

| Site | Consequence of the rejected select |
|---|---|
| `webhooks/stripe/route.ts:359` | cart sale fee: 15% for every artist (named by D17) |
| `placements/[id]/payment/setup/route.ts:47` | paid-loan setup fee: 15% (named by D17) |
| **`lib/placements/paid-loan-billing.ts:417`** | **paid-loan monthly payout: 15%. A second overcharge, on recurring money** |
| **`lib/visualizer/tier-resolver.ts:95`** | **resolver returns null, silently downgrading every artist's visualizer tier** |

The tier resolver selected `free_until` and never read it, so removing it there is a
pure deletion. Hand-enumeration missing two of four sites is the argument for D17.3.

**What changed.** `platform-fee.ts` keys the zero-fee window on `trial_end`, the real
column. All four selects name `trial_end` (or drop the field). Verified against prod
before doing it: `trial_end` and `is_founding_artist` exist, `free_until` does not,
and **no artist has a `trial_end` in the future**, so no fee changes today. This
restores per-plan rates and nothing else.

Founding artists are deliberately **not** given a zero fee, though the old docstring
implied they should be. `is_founding_artist` is a separate column, prod has one such
artist (`maya-chen-demo`, pro), and switching it on would change what an artist is
charged. That is a product call, not a mechanical one.

The referral path is untouched by design: D17.2 is an open owner question, and half
migrating it would turn a silent no-op into a failing update.

**Why the existing unit test never caught this.** `platform-fee.test.ts` pinned the
`free_until` window and passed the entire time, because it exercises the pure
function and never touches the schema. The function was always correct; every
caller's query was rejected before reaching it. A green unit test sat on top of a
live overcharge for months. The window tests are renamed to `trial_end`, not
duplicated, plus one that asserts a premium/`trial_end: null` profile (fin-coles'
actual shape) gets 8%.

**New: `tests/integration/phantom-columns.test.ts`**, the narrow form of D17.3. It
scans every `.from(...).select(...)` pair and fails on a column proven absent from
that specific table.

**Four probes, because an unprobed guard is just a comment:**

```
A  reintroduce orders.amount_cents      → FAILS: "app/api/admin/stats/route.ts:56
                                          selects orders.amount_cents (Bug 15)"
B  fix a recorded site, keep the entry  → FAILS: "...is stale, delete it"
C  revert this commit's fee fix         → FAILS: "route.ts:359 selects
                                          artist_profiles.free_until (D17.1)"
D  the tree as it stands                → PASSES (5 tests)
```

**Probe C passed on the first attempt, which was a hole in the guard**, not a pass.
The referral-path exemption was file-level, so it un-guarded the fee select in the
same file, the exact line D17.1 exists to protect. Exemptions now match the exact
column list, so an exemption cannot shelter a different query. This is the reason to
probe a guard rather than trust it.

**Two things the guard found on its own:**

1. **A false positive in my own first cut.** It matched column names without tables
   and flagged `stripe_transfers.amount_cents`, which is a real column: only
   `orders.amount_cents` was ever phantom. Checked prod instead of "fixing" working
   code. The guard is now table-aware, because one that cries wolf trains people to
   add exemptions.
2. **`placements/route.ts` still integrates the phantom `requester_user_id`** in
   roughly twenty places: reads, an insert, an update, a role-flip, a strip-candidate
   list and a backfill. The real column is `proposed_by_user_id`, which `lib/authz.ts`
   already uses, so this is an N3 follow-up rather than a new finding. Not a live
   outage, because the route retries without the column, at the cost of one
   guaranteed-rejected query per request. Untangling it is its own task.

To avoid either hiding that or starting an unplanned twenty-site refactor, the guard
keeps **two separate lists**: `EXEMPT` (parked by an explicit decision, currently
just D17.2) and `KNOWN_UNFIXED` (real bugs, queued, each naming its finding). The
second has a **ratchet on its size**, so newly introduced debt fails the build while
existing debt stays visible and countable. Fixing an entry means lowering the number
in the same commit.

```
 Test Files  148 passed (148)
      Tests  1425 passed (1425)
✖ 252 problems (0 errors, 252 warnings)
PASS: 12 public route(s) and 14 demo-exempt route(s) all resolve, with reasons.
```

**Commit:** 6e0705e

---

## Task 4 / `074` — RLS gap closure + the `/apply` switch (owner: `02` §11, unblocked by D15)

**What was actually exposed.** Not theoretical. Counted in prod as the service role,
against what `authenticated` could read before this migration:

```
artist_applications   13 rows   name, email, location, portfolio, artist statement
enquiries             11 rows
venue_registrations    6 rows
contact_submissions    5 rows
waitlist_signups       2 rows
```

37 real people's details, readable by anyone who could create an account.

**Three errors in `02` §11's migration, all caught by verifying prod first.**

1. **It drops four permissive SELECT policies; there are five.** `enquiries` carries
   `USING (true)` granted to `authenticated`, which §11 missed and D12's assertion
   could not match. Closing four would have left enquiries wide open **with the gate
   reporting green**, which is exactly the failure mode D15.1 was written to prevent.
2. **Its X3 block drops one `artist_applications` INSERT policy; prod has two.**
   `Anyone can insert applications` (role public) and `Allow public inserts` (role
   anon), both `WITH CHECK (true)`. Dropping one leaves the table writable by any
   anonymous caller, making the lockdown decorative.
3. **Its E27 block runs an unguarded `ALTER TABLE placement_record_versions`.** That
   table does not exist in prod, so the statement fails `42P01` and takes the whole
   migration with it. It does exist on a database built from this repo's migrations
   (`033`), so the block is guarded on existence rather than deleted, keeping the
   file correct against both.

**Evidence, D15.3's assertion, before and after:**

```
before: 5 rows
  artist_applications  | Authenticated users can read applications | auth.role() = 'authenticated'
  contact_submissions  | Authenticated can read contact            | auth.role() = 'authenticated'
  enquiries            | Artists can read their enquiries          | true
  venue_registrations  | Authenticated can read venue reg          | auth.role() = 'authenticated'
  waitlist_signups     | Authenticated can read waitlist           | auth.role() = 'authenticated'

after:  0 rows
```

**And behaviourally**, because a policy list is not proof that reads are blocked. A
role-switched read inside a DO block that aborts, so it cannot commit:

```
RLS PROOF >> as authenticated: artist_applications=0 waitlist_signups=0 enquiries=0
             | as anon: artist_applications=0
```

Checked that those zeros are not vacuous: the same tables hold 13, 2 and 11 rows to
the service role.

**D15.2 respected.** The four intentionally-public SELECT policies
(`artist_profiles_select`, `artist_works_select`, `Anyone can read collections`,
`venue_profiles_select_public`) are untouched. Venue PII is restricted per column:

```
authenticated, venue_profiles: table SELECT grants = 0
                               PII columns SELECTable = none
                               non-PII columns SELECTable = 34
```

Which is precisely the shape `anon` has had since `071`, and that precedent is why
the change is safe for the public site.

**Other blocks verified after applying:** `stripe_transfers.recipient_user_id` is
NOT NULL and its dedupe index is `NULLS NOT DISTINCT` (0 rows, so nothing to
backfill); `customer_profiles` exists with RLS and an owner-scoped read;
`artist_applications` has zero policies.

**The paired code change** (`/api/apply` onto `getSupabaseAdmin`) is in the same
commit, per D15.4. Without it, `074` breaks every public artist application
silently: the insert fails RLS and the applicant still sees success.

`/api/apply` is added to `PUBLIC_ROUTES` with its alternative controls named
(`applySchema`, `checkRateLimit`, a `pending` status the applicant cannot set past,
and an insert of nothing but the submitted form). The authz lint rule from Phase A
flagged the new service-role usage correctly, which is the guard doing its job.

**Tests:** `tests/integration/rls-gap-closure.test.ts`, 17 assertions. They pin the
two traps rather than the RLS state, which is what a repo test can actually hold.
Probed both:

```
revert /api/apply to the anon client   → 2 tests fail
drop only four policies (the §11 bug)  → the enquiries test fails
```

The existing `/api/apply` test mocked the anon client. Its mock moved to the admin
client and the dead one was **deleted**, so a route that quietly reverts fails
instead of passing on a stale mock.

```
 Test Files  149 passed (149)
      Tests  1442 passed (1442)
✖ 250 problems (0 errors, 250 warnings)
PASS: 13 public route(s) and 15 demo-exempt route(s) all resolve, with reasons.
```

**Advisor (MCP, token still absent locally).** Strict improvement: the two
`artist_applications` INSERT `rls_policy_always_true` WARNs are resolved (13 → 11),
and one new INFO appears for `artist_applications` having RLS with no policies,
which is the intended deny-all rather than a regression.

**Commit:** 5ccf266

---

## E33 — any authenticated user could accept or decline any placement (owner: `01` Phase C item 9)

**The hole.** `POST /api/messages` with `messageType: "placement_response"` took
`placementId` and `status` verbatim from client-supplied `metadata` and wrote them
with the service-role client, so RLS never intervened. No party check, no state
check, no requester check, no link to the conversation. `notifyPlacementResponse`
then emailed the artist to say their venue had accepted, from a venue that did
nothing. Placement ids appear in notification links. **Prod has 33 pending
placements**, so this was live, and sweeping ids would have killed or force-accepted
every negotiation on the platform.

**What changed.** `assertPlacementParty` re-reads the row filtered to
`artist_user_id` or `venue_user_id` = the caller, so a non-party gets
`placement_not_found`. `canPlacementTransition` refuses an illegal move with 422.
The update compare-and-sets on `status = 'pending'` and returns 409 if it matched
nothing. The redundant second SELECT for the notification is **deleted**, since the
row `assertPlacementParty` already fetched carries what the email needs. The POST's
bare `catch` now runs `handleAuthzError` first, per `01` §1.3: it previously answered
400, which would have made the new 404/403 look like a malformed body.

**Deliberate deviation from the doc, with evidence.** `01` §E33 says to gate on
`canRespond()`. Two problems:

1. **It would not work at all.** `assertPlacementParty` returns
   `proposed_by_user_id` (the real column); `canRespond` reads
   `requester_user_id` (phantom, exists in no migration and not in the live table).
   Composed as the doc writes it, the field is `undefined`, `canRespond` falls to its
   refuse-ambiguous branch, and **every legitimate responder gets a 403**. The doc
   composes two helpers that disagree about a column name.
2. **Even mapped to the real column it refuses almost everyone.** Prod:

   ```
   placements: 86 rows | with proposed_by_user_id: 2 | pending: 33
   ```

   `canRespond` treats an unknown proposer as a refusal, so 84 of 86 rows, pending
   ones included, would stop accepting responses. Closing a hole is worth a lot;
   disabling the feature for 98% of live placements is a different change, and not
   one the plan anticipated.

So the boundary here is the **party check**, which fully kills the exploit, plus a
narrower self-answer refusal applied **only when the proposer is known**. That
closes the doc's stated "requester can accept their own request" to the extent the
data supports, and breaks nobody. Widening it needs the effective-requester fallback
that `01` Phase D item 10 owns (already present at
`api/placements/[id]/route.ts:78`); copying that fallback here would make a third
copy of a rule the plan itself argues should have one definition.

This is the `requester_user_id` debt (ledger 7c) surfacing exactly where the guard
had to be built. Recorded there; not expanded here.

**Also note** `canRespond`'s third parameter `viewerRole` is unused (it is one of the
252 lint warnings). The doc's fix passes `placement.role` into it, which would have
done nothing.

**Tests.** 8 new in `src/app/api/messages/route.test.ts`. They assert on **whether
the write reached `placements`**, not only on status codes, because the route does a
lot after this branch and the fixture is not a full schema. The security property
holds regardless of what the route answers.

Also fixed the fixture itself: `getSupabaseAdmin` was mocked with only `from`, so
any test reaching the notification path threw on `db.auth.admin.getUserById` and the
outer catch reported 400. A working guard would have looked like a malformed body.

**Verification, both directions.** Restoring the unguarded write fails 6 of 8,
including the one that matters:

```
 × never writes when the caller is not a party to the placement
 × refuses the known proposer answering their own request
 × compare-and-sets on pending so two concurrent responses cannot both land
 × returns 409 when the row was already answered by the time we wrote
 × rejects an illegal transition instead of forcing it
 × surfaces the authz status rather than the bare catch's 400
      Tests  6 failed | 7 passed (13)
```

Restored:

```
 Test Files  149 passed (149)
      Tests  1450 passed (1450)
✖ 250 problems (0 errors, 250 warnings)
```

**Commit:** 1bed512

---

## E20 + E23b — force-activation and the burned-inventory path (owner: `01` Phase D item 10)

**E20.** A rejected party could force their own deal live. `existing.status` was
consulted only for two same-state no-ops, so `declined → active`,
`cancelled → active` and `completed → active` fell through to an unconditional
`updates.status = status`. The requester guard that should have caught it sat inside
an `existing.status === "pending"` branch, so it never ran for exactly the rows the
exploit used. Prod holds **5 declined and 7 cancelled** placements.

The state flip is not the worst of it. Every downstream hook keys on
`pending → active`, so a forced row went active with **no Stripe subscription, no
inventory decrement and no `accepted_at`**: live in both portals, invisible to
billing, advertising an artist's work as hanging at a venue that refused it.

**E23b.** The inventory restore keyed on `stage === "collected"` instead of the
resulting status, so a direct `{status:"completed"}` write skipped it:
`quantity_available` never restored, `available` left false where the decrement had
hit zero, `placed_at_venue` still pointing at a finished placement. Any party could
burn an artist's stock with a legitimate-looking request, repeatable across a
portfolio.

**What changed.** `canPlacementTransition` gates every caller-supplied status write
(422 on an illegal move); the requester guard is no longer pending-scoped;
`becameCollected` keys on the effective resulting status; `placementUpdateSchema`
drops `"completed"` so `stage:"collected"` is the only route there.

**Scoping verified, not assumed.** The gate reads the `status` **body** field, so the
stage path (`stage:"collected"` → completed) and the undo path
(`unsetStage:"collected"` → active) still work: they write `updates.status` directly
and are server-chosen rather than caller-asserted. This mattered, because `completed`
has no outgoing transition, so gating the undo would have broken it. There is a test
for the undo specifically.

**Prod checked before enforcing**, per `01` §E20.6. Every live row is inside
`PLACEMENT_STATUSES`, so no legitimate flow starts 422-ing:

```
active 37 | pending 33 | cancelled 7 | declined 5 | completed 4
```

**Tests.** New `src/app/api/placements/route.test.ts`, 12 cases. The state-machine
unit tests the doc also asks for already exist from Phase A and already cover
`declined → active` denial, so they were not rewritten.

**Verification, both directions:**

```
disable the transition gate        → 4 fail, incl. "refuses to force a declined
                                     placement live, and writes nothing"
restore "completed" to the schema  → the direct-write test fails
```

Restored:

```
 Test Files  150 passed (150)
      Tests  1462 passed (1462)
✖ 250 problems (0 errors, 250 warnings)
```

**Found while writing the tests: half the requester guard is dead.**
`const requesterId = existing.requester_user_id || null` reads the phantom column,
so `isRequester` is always false from that source. What actually works is the
**message-trail fallback** beneath it, which resolves the current requester from the
latest counter sender or the original `placement_request` sender. My first draft of
the test set `proposed_by_user_id` and the guard did not fire, which is how this
surfaced. The tests now drive the trail, because that is the path that runs in prod.

So E20(b)'s widening is correct but its column-based half stays inert until ledger
7c lands. The message trail covers the real cases today. More evidence for 7c.

**A fixture note worth keeping.** Three "still works" tests initially failed with a
generic 400, which looks identical to "my new gate broke the happy path". It was
`db.from(...).delete` missing from the fake, confirmed by temporarily logging the
thrown error rather than by guessing. Worth doing every time a positive-path test
fails against an incomplete fixture.

**Commit:** 8f47841

---

## E21 — the seller could release their own escrow on day zero (owner: `01` Phase D item 11)

**The hole.** `PATCH /api/orders` authorised exactly one role, the artist. The buyer,
the only party who knows whether the parcel arrived, could set no status at all.
`canTransition` blocks `confirmed → delivered`, but `shipped → delivered` is a legal
edge and shipping is self-attested by the same artist, so three requests back to
back walked `confirmed → processing → shipped → delivered` and every pending
`stripe_transfers` row executed immediately. The 14-day hold is the only chargeback
buffer in the payout design, and it was bypassable by the party being paid.

**What changed.** `assertOrderParty` resolves both parties. `SELLER_STATUSES` covers
dispatch; `delivered` and `disputed` are buyer-only. The role gate and
`canTransition` stay independent and both must pass. The bare catch runs
`handleAuthzError`, so a third party gets `404 order_not_found` rather than a
flattened 400.

**A prod fact the fix depends on, checked before relying on it.** `assertOrderParty`
matches the buyer on `buyer_user_id` **or** `buyer_email` against the caller's own
email. That second arm is load-bearing:

```
status      orders  with_buyer_user_id  with_buyer_email
confirmed        6                   0                 6
processing       3                   0                 3
delivered        3                   0                 3
```

**Zero of 12 live orders have `buyer_user_id`**, because guest checkout is allowed. A
user-id-only buyer match would have made the buyer role unreachable and stranded
every order in `shipped` with no way to confirm. This is the same shape of trap as
E33's `canRespond`, caught the same way: by querying prod before trusting the helper.

**UX in the same commit**, per `01` §E21.6, because the API change alone strands
orders:

- the artist portal's `shipped → delivered` action is **deleted**, not disabled. The
  API 403s it now, so the button would only produce an error the artist cannot act
  on.
- the customer portal gains **"Confirm delivery"** on a shipped order, with the
  consequence in the copy ("Confirming releases payment to the artist").

An unconfirmed order still pays out on the 14-day cron, the intended default, and
`/api/admin/orders` stays the support override. **No live order is in `shipped`
today**, so the new control has nothing to act on until the next dispatch: it is
correct but currently unexercised in prod.

**Two pre-existing tests were updated, not left green on stale assumptions.**
`"rejects confirmed → delivered with 422"` now asserts **403**: a seller is refused
the status outright, before the state machine is consulted, which is the stronger
answer and reached first. The 422 path still exists for a caller whose role permits
the status, and the new suite covers it via the buyer. The payout side-effect tests
now act as the buyer, because `delivered` is what releases the transfers they test.

**Verification, both directions.** Putting `delivered` back in `SELLER_STATUSES`:

```
 × rejects confirmed → delivered, now at the role gate before the state machine
 × refuses the seller marking their own order delivered, and pays nobody
      Tests  2 failed | 15 passed (17)
```

Restored:

```
 Test Files  150 passed (150)
      Tests  1468 passed (1468)
✖ 249 problems (0 errors, 249 warnings)
```

**Method note, third time this has paid off.** Three fixture branches lacked
`.maybeSingle()`, which `assertOrderParty` uses for the caller's
`artist_profiles.slug`. Every one surfaced as a generic 400 that is
indistinguishable from "my new gate broke the happy path". Logging the thrown error
found each in seconds; guessing would have risked "fixing" working code or
weakening a real assertion.

**Commit:** 92e3dfe

---

## E22 — the fulfil route minted a fresh payable artifact per replay (owner: `01` Phase D item 12)

**The hole.** No idempotency gate of any kind. `req.status` was selected and never
tested; `resp.status` stayed `"accepted"` after a successful fulfil so the only gate
passed again; and `linked_placement_id` / `linked_offer_id` were read as **routing
hints**, never as "already done" markers.

Every replay minted a new artifact. `action:"order"` inserts another
`purchase_offers` row at status `"accepted"`, i.e. **independently payable**, so N
replays give the venue N identical payable offers. `action:"placement"` gives the
artist N placement requests for one agreement, and the earlier placement ids are
orphaned when `linked_placement_id` is overwritten. The ids embed `Date.now()`, so
replays never collide and no constraint caught them. **A double-click on a flaky
connection is enough** — this needs no attacker.

The sibling route `responses/[responseId]` already has exactly this gate
(`if (resp.status !== "sent") return 409`). The fulfil route was the same shape with
the gate missing.

**Migration first, code second**, per `01` §E22.6, and the reason is real. Verified
in prod before writing:

```
artwork_request_responses_status_check:
  'sent','accepted','declined','countered','withdrawn'   ← no 'fulfilled'
```

The code's compare-and-set writes `status: "fulfilled"`. Against the old CHECK that
UPDATE violates the constraint, and because the route does not await it into the
response it would have **failed silently**, leaving the entire idempotency scheme
inert while looking fixed.

**What shipped.** `098` adds `source_response_id` to `purchase_offers` and
`placements` with **partial** unique indexes, so two *concurrent* requests that both
pass the read-side gate still cannot both insert. It also widens the status CHECK.
The route refuses a replay `409 already_fulfilled` on any of three markers, stamps
`source_response_id` on both artifact types, and consumes the response with a
compare-and-set on `"accepted"`. A failed consume is logged loudly rather than
swallowed, because that is exactly the replay window this finding is about.

**A gap in D1.** Its table allocates `074-079` to `02`, `080-089` to `04`,
`090-094` to `07`, `095-097` to `09`, and reserves `098+`. It gives **`01` no
range**, presumably because `01` was assumed to be code-only, but E22 needs schema. I
took the first reserved number (`098`) rather than borrowing another doc's range,
which would break D1's disjointness guarantee. Worth adding an `01` row to D1 if any
further `01` migration appears.

**Where the doc's expectation was wrong.** §E22.6 says to run the duplicate query and
"expect it to be non-empty in production given the bug has been live". It is empty:

```
artwork_requests 6 | responses 3 | accepted 1 | fulfilled 0
```

The bug is live but has never been triggered, so the unique indexes were created
directly with no backfill decision to make.

**Verified after applying:**

```
purchase_offers.source_response_id   present
placements.source_response_id        present
unique indexes                       2 of 2
status CHECK accepts 'fulfilled'     yes
```

**Tests.** New `route.test.ts`, 12 cases. Probed both halves:

```
remove the idempotency gate  → 4 fail
remove the consume step      → 1 fails ("compare-and-set on accepted")
```

Full gate:

```
 Test Files  151 passed (151)
      Tests  1480 passed (1480)
✖ 249 problems (0 errors, 249 warnings)
PASS: 13 public route(s) and 15 demo-exempt route(s) all resolve, with reasons.
```

**One test-authoring note worth keeping.** My first `RESPONSE_ID` constant was not a
valid RFC 4122 v4 UUID (the variant nibble was `4`, must be `8/9/a/b`), and zod 4's
`.uuid()` enforces both version and variant, so all 12 cases returned 400
"Validation failed". It looked like the route was broken. Prod ids come from
`gen_random_uuid()` and always satisfy it, so there is no production issue here, only
a lazily-typed test constant. Worth knowing that zod 4 is stricter than zod 3 was.

**Commit:** fae5945

---

## E23a pass 1 of 2 — the demo guard had zero call sites (owner: `01` Phase E item 13)

**The finding, and why it survived.** `src/lib/demo-guard.ts` was fully implemented
and fully unwired. Zero call sites, while **two doc comments** asserted it was
enforced at the API layer:

```
api/demo/login/route.ts:23  "The `assertNotDemo` helper in @/lib/demo-guard is what actually…"
data/demo.ts:17             "Mutations get blocked at the API layer via a `assertNotDemo`…"
```

Anyone verifying "is demo write-protected?" by grepping found two confident
statements that it was. A written control with no enforcement point is worse than no
control, because it gets counted as mitigation.

Anyone clicking "Try the demo" gets a real Supabase session for the demo artist or
venue, so every mutating route was open to them. The one that actually escapes the
platform is messaging: **a demo session could send messages to real venues**, making
the demo a free outreach channel into real inboxes.

**Split, per `01` §E23a** ("split across two PRs if the diff exceeds ~30 files"). 68
routes were flagged. Pass one is the outward-facing set, where the harm leaves the
platform:

| Route | Why strict |
|---|---|
| `messages` POST | real messages to real venues |
| `placements` POST + PATCH | both email real users |
| `artwork-requests` POST | |
| `artwork-requests/[id]/responses` POST | |
| `offers` POST | |
| `offers/[id]/checkout` POST | real money |
| `checkout` POST | real money |

All take the STRICT 403 variant. On `checkout` the guard sits **inside the
authenticated branch only**, because guest checkout is supported and an anonymous
caller has no id to test.

**Where the doc's list needed adjusting.** It names `/api/enquiry` for the strict
variant, but that route has no auth at all, so there is no user id to guard. Exempted
with that reason recorded, rather than left looking unwired.

**New: `tests/integration/demo-guard-coverage.test.ts`.** Enumerates every mutating
service-role route and asserts each is guarded, exempt-by-decision, or on a counted
not-yet-wired list. Two separate lists again, so debt is never read as a decision,
and the count is a **ratchet**: it may shrink, never grow, so a newly added unguarded
route fails the build.

**The test caught three errors in its own allowlist as I wrote it**, which is exactly
what the honesty assertions are for:

1. `"demo/reset/route.ts"` does not exist. I had guessed it.
2. The not-yet-wired count of 55 was a guess. The measured value is **45**.
3. `"cron/"` matched nothing, because every cron route is GET-only and never reaches
   the mutating filter. **Removed rather than kept**: an exemption matching nothing
   today would silently un-guard the first cron route that ever gains a POST.

**Verification, both directions.** Unwiring `messages` again:

```
 × has the guard wired on every outward-facing route
 × uses the STRICT variant wherever real money or a real email can leave
 × holds the unwired count at its recorded value, so new debt fails the build
      Tests  3 failed | 3 passed (6)
```

Restored:

```
 Test Files  152 passed (152)
      Tests  1486 passed (1486)
✖ 239 problems (0 errors, 239 warnings)      ← demo-guard lint warnings 68 → 58
```

**Pass 2 is the remaining 45 in-portal routes** (soft `assertNotDemo`, 200 +
`{demo:true}` so the UI can toast without unwinding optimistic state). Item 15's
`warn → error` flip must wait for that, or CI goes red on known work, exactly as the
doc says.

**Commit:** 37987e1

---

## E23a pass 2 of 2 — the demo guard is now wired everywhere (owner: `01` Phase E item 13)

**Done.** Every mutating service-role route either calls the guard or carries an
explicit exemption with a reason. It had **zero** call sites when this started.

- **37 routes** took a uniform insertion after `if (auth.error) return auth.error;`,
  scoped **per handler** so GET handlers are untouched. Reads stay open in the demo,
  which is the point of a demo.
- **6 needed bespoke handling** because their auth shape differs from the standard
  anchor. Enumerating first and finding these rather than blind-patching 45 files is
  what stopped a broken insertion:

  | Route | Shape | Variant |
  |---|---|---|
  | `walls/[id]` PATCH+DELETE | `resolveAndAuthorize()` returns `userId` | soft |
  | `feature-requests` | anonymous posting allowed, id may be null | soft |
  | `moderation` | same | soft |
  | `terms/accept` | unauthenticated-by-email supported | soft |
  | `stripe-connect/onboard` | `const { user, error } = ...` | **strict** |
  | `stripe-connect/dashboard` | same | **strict** |

  The two Connect routes are strict on purpose: they create or open a real Stripe
  Connect account, which is an external identity and a payout destination.

- **2 are exemptions, not debt.** `auth/oauth-finalize` and `auth/welcome` are signup
  finalisation authenticated by a one-time token. A demo session never traverses them
  (the demo ids are pre-seeded and entered via `demo/login`), so a guard there could
  only ever block a real signup.

**The ratchet is now 0**, which converts the coverage test from a debt counter into a
real gate: a new mutating service-role route must call the guard or earn an exemption.

**Reconciled two allowlists that disagreed.** `eslint-rules/public-routes.js` and the
coverage test exempted different sets, differing on exactly six routes. Two
vocabularies for one rule is the drift this whole plan exists to remove, so
`DEMO_EXEMPT_ROUTES` now carries the four admin surfaces and the two auth routes with
per-entry reasons.

```
demo-guard lint warnings: 58 → 0
total lint warnings:      239 → 181
audit:allowlist:          13 public route(s) and 21 demo-exempt route(s), all with reasons
```

**Added behavioural proof, and this matters.** Everything else in that file checks
wiring by reading source, which is the right shape across 60-odd routes but would
**pass if the guard were imported and never called** — a near-miss of the original
finding, where the control existed and did nothing. Two tests now drive
`artist-profile` PUT for real:

- a demo id gets `200 + {demo:true}`, with a **throwing** db mock proving nothing
  below the guard executes
- a non-demo id reaches the write, so the guard is not simply blocking everyone

Probed by unwiring that handler: the behavioural test fails.

```
 Test Files  152 passed (152)
      Tests  1488 passed (1488)
✖ 181 problems (0 errors, 181 warnings)
```

**Commit:** 71b137f

---

## Phase E item 14 — bare catches were flattening AuthzError to 400 (owner: `01` §1.3)

**The problem.** Every route phases B to D touched ended in a bare `catch {}`
answering `{ error: "Invalid request" }` with 400. Three different things collapsed
into that one response:

- an **AuthzError**, meaning 403 or 404, which is the entire point of the `assert*`
  helpers those phases introduced;
- a genuine schema or JSON failure, which really is 400;
- a **real server fault**, which nobody could see because the error object was
  discarded.

**What changed.** 12 handler-level catches across 7 routes now bind the error,
consult `handleAuthzError` first so a denial keeps its status, and **log** the fault.
Inner catches that fall back to a value (`catch { return [] }`) or swallow a
best-effort side effect are deliberately untouched: they are a different thing.

**The logging half is not decoration.** A fixture gap surfacing as a generic 400 is
indistinguishable from "the new guard rejected this", and that cost real time three
separate times while building phases C and D (E20's `db.from(...).delete`, E21's
three missing `.maybeSingle()` branches, E22's invalid test UUID). Each time the only
way to tell them apart was to temporarily add a `console.error` and re-run.

It paid off in the very first full run after the change:

```
[messages] unhandled error TypeError: db.from(...).select(...).or is not a function
```

That is a pre-existing incomplete fixture which had been hiding behind a 400 for the
whole session. The tests still pass because they assert a refusal and get one, but it
is now visible instead of silent.

**New: `tests/integration/authz-error-surfacing.test.ts`**, the CI gate the item asks
for. Three probes:

```
A  restore a blanket bare catch        → 3 fail
B  bind err but drop handleAuthzError  → 1 fails
C  drop the log                        → 1 fails
```

**Probe B passed on the first attempt, which was a hole rather than a pass** — the
third time this session that probing a guard found the guard wrong. The check used a
400-character regex window after `catch (err) {` and then asked whether the **whole
file** mentioned `handleAuthzError`. Both halves were wrong: the window was shorter
than the explanatory comments now inside those catches, so it silently stopped
matching, and a file-wide search would be satisfied by a mention anywhere. It is now
**block-scoped**, walking braces from the catch.

**Then the block-scoped version flagged its own comments**, because those comments
contain the literal `` `} catch {` ``. It now strips comments before scanning, which
is the **second time this session** a source-reading assertion has needed that: the
CI-gates test needed the same treatment for YAML in iteration 2. Worth stating as a
rule: an assertion over source must read *executable* source.

**The stricter gate then found a real miss of its own.** A fourth `placements` catch
already bound and logged the error but still flattened an AuthzError to 400. The
`} catch {` sweep could not match it, because it was already bound. Converted.

```
 Test Files  153 passed (153)
      Tests  1503 passed (1503)
✖ 175 problems (0 errors, 175 warnings)      ← 181 → 175
```

**Commit:** 99e8c83

---

## Phase E item 15 — rule extension done, the flip deliberately not (owner: `01` Part 3)

**Extension, landed.** `require-authz-on-mutation` now treats any `@/lib/db/*`
import as service-role-equivalent, because those helpers use the admin client
internally. This is **E32's exact shape**: `api/artist-works` never imported
`supabase-admin`, it called `lib/db/artist-works.ts`, so the rule could not see it
and the unscoped update went unflagged. 5 new rule tests, probed by reverting the
extension (2 fail).

**It flags zero additional routes today, and I am not claiming otherwise.** Only one
route in the tree has that shape and it already imports authz. The value is
prospective: the next route written that way gets caught.

**Except it found something immediately anyway.** `api/artist-works` had POST and
DELETE with **no demo guard**. E23a pass two missed it because my enumeration
filtered on a `getSupabaseAdmin` import, which is precisely the blind spot this
extension exists to close. Both handlers are now guarded, and
`demo-guard-coverage.test.ts`'s filter is widened the same way, so the test is no
longer blind in the manner the rule was. Two guards built to catch the same class of
bug, and one of them had the bug.

**The flip: not done, and the doc's precondition is wrong.** `01` says land it "once
phases B to D are green, or CI will be red on known work". Phases B to D **are**
green, every finding fixed. But the rule's criterion is "imports `@/lib/authz` or
`@/lib/admin-auth`, or is allowlisted", which is far broader than "the findings are
fixed". **43 route files still fail it, and they are not unauthorised.** Sampled
three at random and all authorise inline by self-scoping:

```
saved/route.ts              .eq("user_id", auth.user!.id)
notifications/route.ts      .eq("user_id", auth.user!.id)
customer-addresses/route.ts .eq("user_id", auth.user!.id)
```

That is real authorisation, just not routed through the shared helpers. Flipping
today would turn CI red across 43 files over a **convention migration**, not a
security gap. Doing that unasked would be the opposite of the plan's intent.

**What shipped instead:** `tests/integration/authz-import-ratchet.test.ts` holds the
count at 43 and asserts the rule stays at `warn` while it is non-zero. The count may
shrink, never grow, so the flip becomes reachable rather than indefinitely deferred,
and nobody can add a new unannotated mutating route. It also asserts the demo-guard
arm is still at zero, which proves the two arms move independently.

**Probed three ways:**

```
add an unannotated route  → fails, "Expected 43, found 44"
flip to error early       → fails, "43 routes still lack the import"
revert the extension      → 2 rule tests fail
```

**The second probe initially reported "no tests" rather than a failure.** eslint
exits non-zero when it reports an error, `execFileSync` throws on that, and the file
died at collection time. So the severity assertion **could never have run in the
state it exists to catch**. It now reads the report off stdout either way. That is
the fourth guard-hole this session found by probing rather than by assuming.

```
 Test Files  154 passed (154)
      Tests  1511 passed (1511)
✖ 175 problems (0 errors, 175 warnings)
```

**Owner decision available, not blocking.** To reach the flip, the 43 routes need
either migrating to `assert*` helpers or allowlisting with "self-scopes on user_id"
as the stated alternative control. The second is cheap and honest; the first is
better hygiene. Neither is a security fix, so it is a judgement call about how much
convention work is worth it. The ratchet means the decision can wait without the gap
widening.

**Commit:** 0fd8a4d

---

## Phase E item 16 / E39 part 2 — assessed as void, decision locked instead (owner: `01`)

**Not built.** Item 16 asks for a `sessionId` claim on the order token, minted into
the Stripe `success_url`, with the full session payload restored behind a
token-or-email check. Two reasons, both checked rather than reasoned about.

**1. No consumer.** `/api/checkout/session` has exactly one caller,
`checkout/confirmation/page.tsx`, and it reads only
`id / status / amountTotal / lineItems`. The page already carries this comment:

> The delivery address is deliberately not shown here. It used to come from the
> unauthenticated /api/checkout/session response, which meant anyone with the
> session id could read it (E39). The buyer has the address in their confirmation
> email.

Grepped the tree for other consumers: none. Restoring PII would widen the very
disclosure surface E39 exists to close, for data nothing renders.

**2. The prescribed mechanism has an ordering bug.** The token must be bound to the
Stripe session id (the doc's check is `verified.sessionId === sessionId`), but
`success_url` is fixed at **session-creation time, before that id exists**. Stripe
only templates `{CHECKOUT_SESSION_ID}`, so a token derived from the id cannot be
placed there. Making it work needs a second binding: a pre-generated nonce in the
`success_url`, carried in session metadata, verified on read. Real machinery, for a
feature with no consumer.

`01` §E39 anticipates exactly this outcome. It offers "the minimum viable change is
to drop the PII from the anonymous response", which is what part 1 shipped in Phase
B. So part 1 was the doc's own fallback and it is sufficient.

**One more trap for whoever revives it:** `verifyOrderToken` **throws** on an invalid
token rather than returning null, so the doc's `const verified = await
verifyOrderToken(token); authorised = !!verified && ...` would propagate the throw
instead of falling through to the email check. It needs a try/catch.

**What shipped instead**, so the decision is enforceable rather than a comment: the
phase B test file now pins the response shape **exactly**. Any new field fails,
including ones nobody thought to forbid by name, and each line item is pinned to its
three display fields so expanded Stripe `price.product` metadata cannot ride along.

**Probed twice:**

```
restore customerEmail        → 3 fail
add an innocuous `currency`  → 2 fail, and every by-name assertion PASSES
```

That second probe is the argument for the lock. The existing tests forbade four
fields by name, so an un-enumerated addition slipped past all of them.

**Residual exposure, accepted and already documented in the route.** Anyone holding a
leaked session id can still learn the order total and the line-item names. Closing
that needs caller binding, which guests cannot provide, which is why part 1 stripped
the payload rather than adding auth. If it ever matters, the cheap narrowing is to
bound the endpoint by the `cart_sessions` TTL so an old id stops working, turning an
indefinite capability into a short-lived one. Not done: it is a different change from
what item 16 asks for, and scope drift is how the knot re-formed last time.

```
 Test Files  154 passed (154)
      Tests  1514 passed (1514)
✖ 175 problems (0 errors, 175 warnings)
```

**Commit:** 6c8e1d1

**`01` is now complete** except item 15's `warn` → `error` flip, which is an owner
decision held behind a ratchet.

---

## `06` B1 / E46b — ToS-acceptance forgery (owner: `06` §3.2)

**The finding.** `POST /api/terms/accept` inserted `user_email` straight from the
request body while **discarding the auth error**, so an unauthenticated caller could
forge a row asserting that any email address had accepted the platform terms,
stamped with the attacker's IP and user agent. `terms_acceptances` is the evidence
trail for a contractual act, so the harm is twofold: a forged acceptance against a
third party, and repudiation cover for a real one. Four uncapped free-text fields on
an unbounded unauthenticated insert made it a storage vector as well.

**The prod fact that framed the fix:**

```
terms_acceptances: 51 rows | with user_id: 0 | anonymous: 51
```

**Every acceptance on record is the unverifiable kind.** Not one is bound to an
authenticated user, because all six callers are pre-signup.

**Closed.**

- An **authenticated** acceptance now takes the email from the token and ignores the
  body's, lower-cased so the trail is comparable. The body can no longer name a
  third party.
- The body is schema-validated (`termsAcceptSchema`: `userType` an enum, `userEmail`
  must parse as an email, versions capped) instead of four uncapped strings.
- The route is rate limited, checked **before** parsing so a large body cannot be
  used to probe.

**Not closed, and not closable here.** The doc says to grep the callers first, so I
did. All six (`signup/artist`, `signup/venue`, `signup/customer`,
`ApplicationForm` twice) fire immediately after `supabase.auth.signUp` and **before
email confirmation**, so there is no session. Requiring auth breaks every one.

`06` §3.2 anticipates this and proposes splitting the route, binding pre-signup
acceptance to "a short-lived signed token issued by the signup flow". **That cannot
work.** Any endpoint issuing such a token pre-auth is itself unauthenticated, so an
attacker mints one for the victim's address and is exactly where they started. A
pre-auth assertion about an email address is forgeable by construction; no amount of
HMAC fixes it, because the thing being signed is unverified.

**Recommendation, needs an owner call.** Record acceptance **after** confirmation,
from the token, carrying the terms version through `signUp`'s `options.data` (which
already carries `user_type` and `display_name`). The client then asserts nothing; the
row is written by a post-auth step from verified identity. The trade-off is that the
evidence is stamped at confirmation rather than at the moment the box was ticked, and
a user who never confirms leaves no acceptance row at all. That is a legal-trail
decision, not a code one, so it is escalated rather than guessed.

A cheaper interim, if the timestamp semantics matter: keep the pre-signup insert but
add a column distinguishing a token-verified acceptance from a self-asserted one, so
the 51 existing rows and future pre-signup rows stop carrying evidentiary weight they
cannot support. That needs a migration and is still an owner call about what the
trail must prove.

**Tests.** 12 new. The pre-signup path is pinned with an explicit comment saying it
is the **residual gap**, not behaviour being blessed as correct, so nobody later
reads the test as approval.

**Probed three ways:**

```
trust the body email again  → 2 fail
drop the schema             → 4 fail
drop the rate limit         → 2 fail
```

```
 Test Files  155 passed (155)
      Tests  1526 passed (1526)
✖ 175 problems (0 errors, 175 warnings)
```

**Commit:** a4142c2

---

## `06` B2/B3/B4 / E46d — private-brief bid injection (owner: `06` §3.6)

**The hole.** Any signed-in approved artist could bid on a **private** brief they
were never invited to. The POST's gates were: valid token, has an artist profile,
under the daily cap, request is open. `visibility` and `invited_artist_slugs` were
never consulted, while the sibling LIST route did enforce them. Chained with the
then-unauthenticated GETs, an attacker could read every rival bid and then submit
their own.

**I nearly recorded this as already fixed, and that is the lesson.** Both handlers
live in one file. `01`'s E17/E18 added `assertCanViewArtworkRequest` to the GET, so
`grep assertCanViewArtworkRequest` on the file returns a hit and the POST looks
covered. It was not: **line 71 is inside GET; POST starts at line 90.** The test
caught it, the reading did not. An undifferentiated grep across a multi-handler file
is not evidence about a specific handler.

**What changed.** POST now calls `assertCanViewArtworkRequest`, placed after the
artist-profile check (so a non-artist still gets the clearer `artist_only` 403) and
**before** the outreach cap (so a refused attempt does not burn quota). The
request-is-open check moved ahead of the cap as well: responding to a **closed** brief
used to cost the artist one of their two-to-ten daily sends for nothing.

**B2 is void.** It asks for a new `src/lib/artwork-request-access.ts` exporting
`canArtistSeeRequest`. That rule already exists as `assertCanViewArtworkRequest` in
`@/lib/authz`, used by both GETs. Writing the doc's helper would be a **parallel copy
of a rule that already has one**, which is precisely the pattern this plan exists to
remove ("no `_v2` beside `_v1`"). Reused the existing one.

**B4 was already done** by E17/E18: both GETs require auth, return 404 rather than
403, and give the full response set only to the owning venue. Verified in the source
rather than assumed.

**Deviation on the status code.** The doc wants `403 not_invited`;
`assertCanViewArtworkRequest` denies `404 artwork_request_not_found`. Kept the 404: it
does not confirm a given private id exists, and it matches what the GETs already do.

**The fixture was hiding the bug.** The test stub had `chain.eq = () => chain`,
ignoring every filter, so the helper's owner query (`.eq("venue_user_id", actor.id)`)
matched and **every artist was classified as the owner**. The six pre-existing tests
passed because the fixture was permissive, not because any rule held, and the
visibility logic had **zero** coverage on this route. The stub now records and honours
`eq` and `contains`, so owner / semi_public / invited-private behave distinctly. This
is the second fixture this session that was quietly asserting nothing.

**Prod context.** All 6 `artwork_requests` are `semi_public` with no invite list, so
the private path is unexercised in production today. The hole was real but had not yet
been walked through.

**Tests.** 6 new. Probed both halves:

```
remove the visibility gate    → 2 fail
restore the old cap ordering  → 1 fails
```

```
 Test Files  155 passed (155)
      Tests  1532 passed (1532)
✖ 175 problems (0 errors, 175 warnings)
```

**Commit:** f657719

---

## `06` B5 / E46a — unvalidated write boundary on artist works (owner: `06` §3.1)

**What was unguarded.** `POST /api/artist-works` destructured the body and passed it
straight to `upsertWork`:

| Field | Risk |
|---|---|
| `pricing` | no array cap, no per-tier price check |
| `quantity_available` | no lower bound, and **checkout reads `<= 0` as sold**, so a negative value made a work permanently unbuyable |
| `shipping_price` | stored unbounded; feeds `calculateOrderShipping` even though the checkout schema caps what a *cart* may claim |
| `sort_order` | unbounded |

`pricing` is the one that reaches money: checkout recomputes `unit_amount` from the
stored tier. It is defended there too (a non-positive tier falls back to the client
price), so this was a correctness and trust problem rather than direct theft. Fixed at
the write boundary regardless, which is where it belongs.

**The sanitiser is deleted, not left beside the schema.** 45 lines of hand-rolled
`frameOptions` cleaning came out; `artistWorkInputSchema` enforces the same rules
(label trimmed and capped, at most 20 frames, `pricesBySize` keys and values bounded).
Keeping both would be two sources of truth for one rule, which is the pattern this
plan exists to remove. The route is 45 lines shorter.

**One deliberate behaviour change.** The sanitiser did `Math.max(0, priceUplift)`,
quietly turning a `-50` uplift into `0`. The schema **refuses** it. Silently rewriting
an artist's pricing is worse than telling them they typed a negative, and a floor that
hides input errors is how bad data becomes permanent.

**Stopped writing `in_store_price`.** The column exists in no migration and not in the
live table, so `upsertWork`'s strip-and-retry dropped it on **every single save**: a
guaranteed-failing column write per request. Already absent from
`ARTIST_WORK_WRITABLE` for the same reason (A8). A client-supplied `inStorePrice` is
accepted and ignored rather than rejected, because the portal still sends it and
400ing would break saving a work outright.

**New finding, escalated.** The artist portal has a **per-size in-store-price UI**
(`inStorePrices` at `artist-portal/portfolio/page.tsx:61`), so artists have been
typing values that were never stored anywhere. This is the **eighth phantom column**
found this session and the first with a user interface behind it. Finishing the
feature needs a migration; removing it needs a UI change. Either way it is a product
call, so it is queued rather than decided.

**Tests.** 15 new. Probed both halves:

```
bypass the schema (restore the raw destructure)  → 11 fail
put in_store_price back in the write             → 2 fail
```

```
 Test Files  155 passed (155)
      Tests  1547 passed (1547)
✖ 175 problems (0 errors, 175 warnings)
```

**Commit:** e53630d

---

## `06` B6 / E46c — "free frames": the uplift was client-trusted (owner: `06` §3.3)

**The hole, and the source admitted it.** A comment in `checkout/route.ts` called the
client-trusted uplift a "residual risk" while the hole stayed open with a warn log
beside it. Observability is not a control.

Framed lines carry size `"<base> + <frame label>"`, which never matches a DB pricing
tier (tiers are bare base sizes), so the line-item builder found no tier and kept the
**client's** price. The only guard was a floor at the bare unframed price:

```
DB tier A3 = £100, artist's oak frame = £85, legitimate total £185
attacker posts { size: "A3 + Oak Frame", price: 100 }  →  charged £100
```

The frame was free, down to and including a zero uplift.

**The fix.** The server computes the whole number from the work's own row:

```
base tier price + (frame.pricesBySize[tier] ?? frame.priceUplift)
```

and `item.price` is never used for a framed line. `frame_options` was already
persisted per work, so the data was on the row all along; only the cart line lacked
frame identity. `CartItem` now carries `frameLabel`, the artwork page sends it from
both add-to-cart paths, and the checkout page forwards it. **Legacy carts already in
localStorage still resolve** via the `" + "` split, so there is no migration window.
A framed line naming a frame the work does not offer now 409s instead of being charged
at the client's number.

**This retires `price_below_base`.** That code existed only because the server knew
the *floor* and had to reject anything under it while trusting anything over it. The
server owns the whole number now, so a mismatch is a corrected charge plus a warn,
exactly as unframed lines already behave.

**Five pre-existing tests asserted the old contract and were rewritten, not kept.**
Two pinned `price_below_base`; three relied on the client-price fallback that *was*
the finding. The clearest was:

> `it("accepts framed line where client price is at or above DB base (with warn log)")`

That warn log was the vulnerability. The test now asserts the server's number is
charged and the client's is ignored. Leaving these passing would have meant a green
suite guarding an exploit.

**Prod context.** `frame_options` is a real `jsonb` column and **6 of 35** works carry
frames, so the exploit surface was real but small.

**Tests.** 10 new, 5 rewritten. Probed both halves:

```
restore the client-price fallback     → 10 fail
accept a frame the work doesn't offer → 2 fail
```

```
 Test Files  155 passed (155)
      Tests  1557 passed (1557)
✖ 175 problems (0 errors, 175 warnings)
```

**Commit:** 1a79952

**`06` Phase B is complete** (B1, B2 void, B3, B4, B5, B6). Remaining in `06`: A5/A7's
`assertNoServerOwned` (needs the exemption design noted earlier) and Phase C
(gating + guardrails).

---

## `06` A5 + A7 — `assertNoServerOwned` at the write boundary (owner: `06` §5.1)

**The state before.** The guard existed with full unit coverage and **no call site**.
E44 and E45 were both fixed at the route via `pickWritable`, which stops today's
payloads but leaves the boundary itself open: any future caller of
`upsertArtistProfile` or `upsertVenueProfile` can still hand over `review_status`,
`subscription_plan`, `stripe_connect_account_id` or `user_id`.

**Now enforced inside both upsert functions**, so no caller can skip it. Every write
to `artist_profiles` and `venue_profiles` goes through one of the two.

**The exemption design that was blocking this.** Three call sites legitimately set a
server-owned column with a **server-computed** value:

| Call site | Columns | Why |
|---|---|---|
| artist PUT | `lat`, `lng` | geocoded from the postcode, never from the body |
| artist POST | `slug`, `review_status` | chosen at creation; `pending` must be forced so a new profile cannot self-publish |
| venue POST | `slug` | chosen at creation |

A blanket refusal would have made the guard **unsatisfiable**, and an unsatisfiable
guard gets deleted. That is E23a all over again, so the shape matters: the guard has
to be usable or it will not survive.

`assertNoServerOwned` now takes an `allow` list, declared per call at the call site
via `{ allowServerOwned: [...] }` and enforced inside the function. **It is a per-call
entitlement, not a global widening**: being allowed to set `lat` does not let
`subscription_plan` through on the same call. That is the property that makes it safe,
so it has its own test, and a probe that converts the exemption into a blanket bypass
fails it.

The error message now names the exemption route as well as `pickWritable`, so the next
caller who trips it is told both correct answers rather than only one.

**Tests.** 6 for the exemption semantics, plus a new `profile-upsert-guard.test.ts`
with 12 that prove the guard **fires from the upsert**. That distinction is the point:
`writable-fields.test.ts` already covered the helper in isolation, and isolated
coverage of an uncalled control is exactly what E23a was.

**Probed twice:**

```
remove the guard from upsertArtistProfile → 4 fail
make the exemption a blanket bypass       → 2 fail
```

```
 Test Files  156 passed (156)
      Tests  1575 passed (1575)
✖ 175 problems (0 errors, 175 warnings)
```

**Commit:** 083a966

`06` Phase A is now complete. Remaining in `06`: Phase C (C1-C5, gating and
guardrails).

---

## 06 C1 (E16) — flag values now reach the client bundle

`06-validation-massassign.md` Phase C item C1. Commit `a11fceb`.

**What was wrong.** `readBoolEnv` read `process.env[key]` with a computed key.
Webpack's DefinePlugin only substitutes statically-written member expressions, so
that read survived into the client bundle as a call-time lookup. Confirmed in the
pre-fix production build (`.next/static/chunks/15.vleg-g8sv8.js`, built 00:17):

```js
let n=function(e){let r=t.default.env[e];   // t = the bundled `process` polyfill
return null!==n?n:i.prodDefault             // NODE_ENV folded to production
```

`t.default.env` is `{}` in the browser, so every client-side `isFlagOn` call
returned null from `readBoolEnv` and fell through to `prodDefault`. The env var
had no effect on the client **in either direction**, which is worse than §4.3
describes: it documents gating staying invisible while the var is on, but the
same defect makes a kill switch flipped to `0` keep rendering the feature it was
meant to kill. Both directions now have a test.

**Change.** `src/lib/feature-flags.ts`: added a `CLIENT_ENV` map with one static
`process.env.NEXT_PUBLIC_FLAG_*` read per flag, and `readBoolEnv` now reads
`process.env[key] ?? CLIENT_ENV[key]`.

**Deviation from the doc, deliberate.** §4.3 proposes the reverse order,
`CLIENT_ENV[key] ?? process.env[key]`. That pins each flag to whatever was set
when the module was first evaluated: on the server `process.env` is real and
current, and the existing test suite mutates it after import, so a snapshot-first
read would make a later change to the var invisible. Live value first, snapshot
second is identical in production (both come from the same build-time env) and
strictly safer everywhere else. The fifth new test pins this ordering.

**Test.** `src/lib/feature-flags.test.ts`, 5 new cases in
`describe("E16: a flag resolves from a build-time snapshot, not a call-time lookup")`.

§4.3 asserts "feature-flags.test.ts cannot catch this: every test runs in Node
under Vitest, where `process.env[key]` works fine". That is wrong, and the doc
should be read as "a test that tries to be a browser cannot catch this". What the
two reads actually differ on is *when* the value is captured: a static read is
frozen at build time, which under Vitest is module-evaluation time, while
`process.env[key]` is read at call time. So the test sets the var, re-imports the
module, then deletes the var before calling `isFlagOn`. That models the browser
exactly and needs no bundler. 3 of the 4 behavioural assertions failed before the
fix:

```
FAIL  src/lib/feature-flags.test.ts > E16 ... > GATING_V1=1 still resolves on once the runtime env is empty
FAIL  src/lib/feature-flags.test.ts > E16 ... > the kill switch survives too: =0 beats an on-by-default prod flag
FAIL  src/lib/feature-flags.test.ts > E16 ... > holds for every flag, so a new one cannot be added without its static read
AssertionError: NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE is not statically read: expected false to be true
 Tests  3 failed | 12 passed (15)
```

After: `Test Files 1 passed (1)`, `Tests 15 passed (15)`.

**The doc's verification command is unsound.** §4.3 says to run
`grep -rl "NEXT_PUBLIC_FLAG_GATING_V1" .next/static/chunks/ | head` and expect it
"empty before the fix, non-empty after". It is non-empty before the fix: the
`FLAGS` map ships `envKey: "NEXT_PUBLIC_FLAG_GATING_V1"` as a string literal into
every client chunk that imports the module. Following the doc would have produced
a false pass. The sound check is to grep for an inlined **key:value** pair, which
can only exist if DefinePlugin substituted a static read.

Before (pre-fix build):

```
$ grep -o 'NEXT_PUBLIC_FLAG_[A-Z_0-9]*:"[^"]*"' before-15.js | grep -v envKey
(no output)
```

After (`NEXT_PUBLIC_FLAG_GATING_V1=1 npm run build`):

```
$ grep -rho 'NEXT_PUBLIC_FLAG_[A-Z_0-9]*:"[^"]*"' .next/static/chunks/ | sort -u
NEXT_PUBLIC_FLAG_GATING_V1:"1"

$ # .next/static/chunks/0awd0od__88t8.js
n={NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1:t.default.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1,
   ...,NEXT_PUBLIC_FLAG_GATING_V1:"1",...};
let i=function(e){let r=t.default.env[e]??n[e];
```

Only the flag that was set at build time is inlined; the four unset ones stay as
polyfill reads, which is correct (unset means fall through to the default) and
they will inline once Vercel defines them.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
tsc --noEmit → clean
Test Files  156 passed (156)
Tests  1579 passed (1579)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Note for C2.** The compiled resolver ends `return null!==i?i:a.prodDefault`,
so on the client `prodDefault` is the whole default path. That makes C2 (flip
`GATING_V1.prodDefault` to true) the change that actually aligns the client with
production, now that C1 has made the env var reachable.

---

## 06 C2 (E16) — GATING_V1 defaults to on in prod

`06-validation-massassign.md` Phase C item C2. Commit `7e6649a`.

**What was wrong.** `GATING_V1.prodDefault` was `false` and its description read
"Default off everywhere until the upgrade modal copy is locked". §4.1 records that
the owner has since set `NEXT_PUBLIC_FLAG_GATING_V1=1`, so both the default and
the description contradicted production.

**Does this change prod behaviour?** No. An explicit env value wins over the
default (`isFlagOn` checks `readBoolEnv` first), and prod has one set. What
changes is the failure mode of a build that *lacks* the var: gating used to
silently switch off, dropping the paywall for every artist, and now stays on. That
is the WALL_VISUALIZER_V1 pattern: ship the feature, keep the env var as a kill
switch.

**Change.** `src/lib/feature-flags.ts`:
- `GATING_V1.prodDefault: false → true`.
- Description rewritten to say gating is on in prod and `=0` is the kill switch.
- `devDefault` left at `false`, deliberately. Local QA must not need a
  subscription. A test pins this so an over-broad fix cannot flip both.
- The file-header convention block claimed "Off by default in production" of every
  flag. Untrue of `WALL_VISUALIZER_V1` already and now of `GATING_V1` too, so it
  now describes the two stages a flag goes through instead.

**Test.** 3 cases added to `describe("feature flags, defaults")` in
`src/lib/feature-flags.test.ts`. The doc names no test for C2, so these cover the
change and its two boundaries.

Probe, reverting only `GATING_V1.prodDefault` to `false`:

```
 FAIL  src/lib/feature-flags.test.ts > feature flags, defaults > GATING_V1 prod default is on
AssertionError: expected false to be true // Object.is equality
      Tests  1 failed | 17 passed (18)
```

Exactly one failure, so the test discriminates on the one line that changed. With
the fix: `Tests 18 passed (18)`.

**C5 is already satisfied for the two files it names.** The gating tests in
`artist-works/route.test.ts` and `messages/route.test.ts` drive the flag through
`isFlagOnMock.mockImplementation(...)`, i.e. `isFlagOn` is mocked wholesale, so no
`prodDefault` change can reach them. The suite confirms it. Vitest also runs with
`NODE_ENV=test`, which resolves to `devDefault`, so nothing outside
`feature-flags.test.ts` could have seen this flip either way.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  156 passed (156)
Tests  1582 passed (1582)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Note.** `listFlags()` is exported and has no caller anywhere in `src/`. The
doc's comment points it at "/api/_internal/flags or dev pages", neither of which
exists. Left in place: it is the natural consumer of C4's map check, and dead
exports belong to the 08 cull, not here.

---

## 06 C3 — lint rule against spreading a request object into a DB write

`06-validation-massassign.md` Phase C item C3. Commit `6e13a0a`.

**What it blocks.** E44 and E45 were the same single line, `.update({ ...body })`
against the service-role client: every key the client sent reached the column
list, so an artist could self-approve (`review_status`), self-grant Pro
(`subscription_plan`), redirect payouts (`stripe_connect_account_id`), or hand a
venue row to another account (`user_id`). Phase A/B fixed the sites with
`pickWritable()` and `assertNoServerOwned()`. This is the guardrail that stops the
next route reintroducing the shape.

**Files.** `eslint-rules/no-spread-into-db-write.js` (new),
`eslint-rules/index.js`, `eslint.config.mjs` (registered at **error**, like
`no-raw-arrangement-type` after 356cd37, not staged at warn: nothing in `src/`
violates it today, proven below).

**Where the spec was too narrow.** C3 asks for a spread "inside a `.insert(`,
`.update(` or `.upsert(` call". That misses the shape that actually shipped.
`src/lib/db/artist-profiles.ts` builds the object first and writes it on the next
line:

```ts
const insertPayload = { ...data, user_id: userId, review_status: ... };
const { error } = await db.from("artist_profiles").insert(insertPayload);
```

A rule that only inspects call arguments sees nothing here. So it also follows a
one-hop assignment: an object literal with a flagged spread, bound to a variable
that is later handed to a write call. The live probe below shows this catching the
`insert` site that the literal spec would have let through.

**The exemption is earned, not granted by filename.** The two remaining spreads in
`src/lib/db/{artist,venue}-profiles.ts` are safe *because* `assertNoServerOwned()`
runs at the top of the same function. Exempting them by path would have made the
rule blind at exactly the two sites that had the bug, and would let someone delete
the guard without the rule noticing. Instead the rule allows a spread only when
the enclosing function calls `assertNoServerOwned()`, matched on the AST rather
than on file text, so a comment mentioning the guard cannot stand in for calling
it. Both properties have a test.

**Test.** `tests/integration/eslint-no-spread-into-db-write.test.ts`, 17 cases,
following the `Linter`-based pattern of the existing rule tests. 6 invalid shapes,
7 valid ones, 4 on the exemption. Two fixtures initially failed as parse errors
(top-level `return`), which surfaced a real hazard: a parse error arrives as a
message with `ruleId: null`, so a broken fixture satisfies `toHaveLength(1)`
without the rule firing at all. The `lint()` helper now throws on any
`ruleId: null` message, so no test in this file can pass for that reason.

```
Test Files  1 passed (1)
Tests  17 passed (17)
```

**Live probe against the real code.** Removing the `assertNoServerOwned` call from
`upsertArtistProfile` and linting the actual file:

```
126:17  error  Don't spread `data` into a .update() call: ...  wallplace/no-spread-into-db-write
138:7   error  Don't spread `data` into a .insert() call: ...  wallplace/no-spread-into-db-write
✖ 5 problems (2 errors, 3 warnings)
```

`138:7` is the assemble-then-write site. Guard restored, file back to a clean
`git diff`, and `npx eslint src/lib/db/artist-profiles.ts` reports nothing.

**Whole tree at error, no violations:**

```
✖ 175 problems (0 errors, 175 warnings)
```

Same 175 as before the rule, so it adds no debt.

**Full gate.**

```
Test Files  157 passed (157)
Tests  1599 passed (1599)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Limits, recorded so nobody reads more into it.** It is a name heuristic:
`body`, `payload`, `data`. A request object stored as `fields` walks past it. The
real controls remain `pickWritable()` at the route and `assertNoServerOwned()` at
the boundary; this rule only makes the careless shape loud. It also follows one
assignment hop, not general dataflow.

---

## 06 C4 — CI check that CLIENT_ENV covers every flag, statically

`06-validation-massassign.md` Phase C item C4. Commits `edab91a` (C4) and
`b6254ed` (D28.1.3, below).

**Why it is needed.** `CLIENT_ENV` is hand-written, one line per flag. The failure
mode is adding a sixth flag and forgetting the sixth line: that flag then resolves
to its `prodDefault` on the client while the server reads the env var, which is
E16 reintroduced one flag at a time.

**Change.** `src/lib/feature-flags.ts` exports `FLAGS` and `CLIENT_ENV`. Four
checks in `src/lib/feature-flags.test.ts`:

1. every `FLAGS` entry has a `CLIENT_ENV` key (the doc's §4.4 assertion);
2. no `CLIENT_ENV` key is orphaned, so a stale entry left behind by a deleted flag
   cannot read as coverage;
3. `envKey` is exactly `NEXT_PUBLIC_FLAG_<name>`, pinning the assumption the whole
   scheme rests on: Next only inlines the `NEXT_PUBLIC_` prefix;
4. each entry is written as a **static, self-matching** member read.

Also replaced C1's hardcoded five-key list with a loop over `FLAGS`, so that
coverage test grows with the map rather than being left behind. Old list deleted,
not left beside the new one.

**Why check 4 reads the source.** A runtime test cannot see *how* a value was
read. In Node, `process.env[k]`, `process.env["K"]` and `process.env.K` all work
identically; only the last is reliably inlined by the bundler. So the runtime
checks are blind to the exact defect C1 fixed, and the source check is what closes
it.

**Three probes.**

```
PROBE A — sixth flag added to FLAGS, forgotten in CLIENT_ENV
  FAIL  C4 ... > every FLAGS entry has a CLIENT_ENV key
        NEW_THING_V1 is missing from CLIENT_ENV
  FAIL  E16 ... > holds for every flag ...
        NEXT_PUBLIC_FLAG_NEW_THING_V1 is not statically read
  FAIL  C4 ... > finds one static read per flag
        expected ... to have a length of 6 but got 5

PROBE B — copy-paste slip, BLOGS_V1's entry reads GATING_V1's var
  FAIL  C4 ... > reads each key's own env var, not a copy-pasted neighbour's
        CLIENT_ENV.NEXT_PUBLIC_FLAG_BLOGS_V1 reads process.env.NEXT_PUBLIC_FLAG_GATING_V1
  FAIL  E16 ... > holds for every flag ...
      Tests  2 failed | 22 passed (24)

PROBE C — computed access, process.env["NEXT_PUBLIC_FLAG_BLOGS_V1"]
  FAIL  C4 ... > finds one static read per flag
  FAIL  C4 ... > uses no computed access, which is the defect C1 fixed
      Tests  2 failed | 22 passed (24)
```

Probe C is the one that justifies the source check: the runtime tests **pass**
under it, because Node resolves bracket-with-literal access fine. Only reading the
file distinguishes the two.

---

## D28 acknowledged (supervisor, committed separately as `8169b73`)

**D28.1 authorises C2**, which had already shipped as `7e6649a`. Requirements 1, 2
and 4 were met by that commit (default flipped, env var documented as the kill
switch in the `WALL_VISUALIZER_V1` style, verified with the sound bundle check).

**Requirement 3 was outstanding**: a test asserting the *client* resolver returns
true under prod defaults. Added in `b6254ed`. The case it models is the one that
made C2 necessary, and it is narrower than the C2 default test: a client built
with **no** flag env var at all, so neither `process.env` nor the inlined snapshot
has anything and the resolver falls through to `prodDefault`. Plus a generalised
loop asserting every flag on a bare client resolves to its own `prodDefault`, so a
future flag cannot reintroduce the split quietly.

Probe, reverting C2:

```
 FAIL  feature flags, defaults > GATING_V1 prod default is on
 FAIL  E16 ... > the client resolves GATING_V1 on under prod defaults, matching the server
      Tests  2 failed | 24 passed (26)
```

**D28.2** makes "prove a verification command fails before the fix" a standing
rule, and records the doc's `grep -rl` as the fourth unsound-verification instance
this session. Already applied in C1 and recorded above; the C4 probes above are the
same discipline applied to the new checks.

**Full gate after both commits.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  157 passed (157)
Tests  1607 passed (1607)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Phase C status.** C1, C2, C3, C4 done. C5 is "re-run the full suite and confirm
the pre-existing gating tests still pass", which the run above does: both files it
names drive gating through `isFlagOnMock`, so they were never exposed to the
default change, and all 157 files pass.

**C5 explicitly, on the two files the doc names:**

```
✓ src/app/api/messages/route.test.ts (13 tests)
✓ src/app/api/artist-works/route.test.ts (20 tests)
Tests  33 passed (33)
```

**06 Verification ladder.** V1 (`npm run test`) and V2 (`npm run lint`, `tsc
--noEmit`) are green in every run above. **V3 and V4 remain undone and are not
blockers I can clear:** V3 wants the §1.3 E44 body replayed against a dev server,
and V4 wants Stripe to receive `unit_amount: 18500` for the §3.3 framed line. The
local `.env.local` holds placeholder Supabase credentials and `STRIPE_SECRET_KEY`
is `sk_test_PLAC...` (api.stripe.com returns 401, no webhook secret, no Stripe
CLI), so neither replay can run here. Both are covered by route-level tests
instead; the manual replays stay owner actions, alongside the Stripe items already
listed under owner decisions.

So `06` is complete except V3/V4. Checkboxes in the implementation docs are left
as authored throughout this plan (0 of 25 ticked in `06`), since PROGRESS.md is
the ledger.

---

## `04` D7 — an accepted offer was never re-validated against stock (owner: `04` §B3)

Commit `95d7d93`.

**The finding.** `purchase_offers` has no link to stock. An offer accepted on
Monday could still be paid on Friday for a work that sold through the cart on
Wednesday, so the buyer paid for something the artist no longer had. The cart
checkout (`api/checkout/route.ts`) has re-validated at session creation all along;
the offer branch never inherited it. Same drift as the T3 confirmation emails, and
the same remedy: one shared implementation rather than a second copy.

**What changed.**

- `src/lib/work-stock.ts` (new) holds `isWorkSold`. The cart route's inline
  predicate is **deleted** and now calls it, so the two paths cannot drift on what
  "sold" means.
- `api/offers/[id]/checkout/route.ts` re-validates before the payout pre-flight,
  so a dead offer costs no extra round trips and never reaches Stripe. On a sold or
  missing work it closes the offer and returns 409 `work_sold`.

**Prod facts that shaped it** (project `uwkuhygwvasdzwsusiym`):

| Fact | Consequence |
|---|---|
| `purchase_offers_status_check` includes `'expired'` | the plan's status value is valid, no migration needed |
| `chk_target_shape`: `cardinality(work_ids) > 0 AND collection_id IS NULL` **OR** `cardinality(work_ids) = 0 AND collection_id IS NOT NULL` | a collection offer **always** has an empty `work_ids`, so the plan's `if (offer.work_ids.length > 0)` skipped every collection offer |
| `artist_collections` has `work_ids` and `available` | the collection's works are resolvable in one extra query |
| 23 of 35 `artist_works` rows have `quantity_available IS NULL`; 12 positive; **none** zero | null must read as untracked, not as zero, or two thirds of the catalogue becomes unbuyable |
| all 35 works have `available = true` | the guard closes no live offer today |
| the two `accepted` offers (£127.00, £18.02) both have their work present and on sale | ditto, verified per row |
| `orders.items` is JSON with `size/image/title/quantity/lineTotal/artistName`, **no work id** | "has this work already been sold?" is not answerable from `orders`, so the stock flags are the only sound signal, exactly as the plan says |

**Two departures from the plan's snippet**, both to avoid shipping a new bug:

1. **Collection offers are covered.** Per `chk_target_shape` above, the snippet's
   `work_ids.length > 0` guard fired for exactly the half of offers that name their
   works, and skipped the half that does not. The route now resolves the
   collection's `work_ids`, and treats a deleted or withdrawn collection as gone.
2. **The expiry write is compare-and-set on `accepted`.** The snippet's unscoped
   `.eq("id", offer.id)` would let this overwrite a concurrent success: buyer pays
   in one tab, the webhook sets `'paid'`, this stamps `'expired'` on top, and a
   paid offer stops looking paid. One `.eq("status", "accepted")` prevents it.

Also de-duplicates `work_ids` before the `found.length !== workIds.length`
comparison. Without that, one repeated id makes the lookup look short and closes a
perfectly live offer.

**Tests.** 14 cases added to `src/app/api/offers/[id]/checkout/route.test.ts` (22
total in the file), plus `src/lib/work-stock.test.ts` (7). The existing mock
returned `null` for every table other than offers and profiles, so it grew
`artist_works`, `artist_collections`, and an update spy that records the `.eq()`
filters, which is what makes the compare-and-set assertable.

**Three probes**, one per claim:

```
PROBE 1 — D7 gate removed entirely
      Tests  9 failed | 13 passed (22)

PROBE 2 — dedupe removed
 FAIL  ... > does not mistake a duplicated work id for a missing work
      Tests  1 failed | 21 passed (22)

PROBE 3 — compare-and-set removed
 FAIL  ... > closes the offer, and only while it is still accepted
      Tests  1 failed | 21 passed (22)
```

Probes 2 and 3 fail exactly one test each, so both departures are pinned
individually rather than riding along on the main gate.

`src/app/api/checkout/route.test.ts` still passes all 44 cases after the predicate
swap, which is the regression that matters for the extraction.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  158 passed (158)
Tests  1627 passed (1627)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Stripe drive not run, and it cannot be here.** The runbook asks every payment
task to drive the Stripe test-mode event. `STRIPE_SECRET_KEY` is `sk_test_PLAC...`,
api.stripe.com returns 401, and there is no webhook secret or Stripe CLI, as
recorded earlier. What this change does is *prevent* session creation, so the
assertions are that `stripe.checkout.sessions.create` was never called, which the
mock proves directly. The money path itself is unchanged by this commit.

**Adjacent gap, not fixed here.** For a collection offer the webhook decrements
nothing: `offer_work_ids` metadata is empty by `chk_target_shape`, and the
decrement loop iterates that list. So collection offers never move stock (E10's
fix covers the named-works shape only). Recorded for `04` D5, which owns the
decrement rewrite.

---

## `04` T2 / E9 — the first artist was paid everyone's money (owner: `04` §B2 + §C2)

Commit `7dffb33`. Migration `082`.

**The finding.** Three lines in the cart webhook: the fee tier came from
`firstArtistSlug` only, one `platformFee` and one pooled `artistRevenue` were
computed, and exactly one transfer went to `artistUserId`. In a two-artist cart
that pays artist A the money owed to artist B, and charges B's sale at A's plan
rate.

**Blast radius, checked before writing anything** (project `uwkuhygwvasdzwsusiym`):
12 orders, **0 multi-artist**, and **0 of 14 artists** have
`stripe_connect_onboarding_complete = true`, so the transfer guard has never let a
transfer through on this path. Nobody has been misdirected money yet. This is
preventative.

**What changed.**

- `src/lib/payouts/legs.ts` (new): `buildArtistLegs`, `reconcilePlatformFee`,
  `assertLegsReconcile`, `penceToGbp`.
- Migration `082_cart_sessions_artist_shipping.sql`, applied to prod and verified
  (`jsonb`, `NOT NULL`, default `'{}'`).
- `src/lib/cart-sessions.ts` + `api/checkout/route.ts` carry
  `artistShippingPence` from `calculateOrderShipping().artistGroups`.
- `api/webhooks/stripe/route.ts`: the three sites replaced. Every figure on the
  order row is now the sum of the legs, so what is reported and what is transferred
  cannot disagree. One leg failing no longer strands the others.

**The plan numbered the migration wrongly.** §B2 says
`076_cart_sessions_artist_shipping.sql`, but 076 is inside `02`'s range (074-079).
D1 gives `04` the range 080-089, and 080/081 are taken, so this is **082**.

**Four departures from the plan's snippets, each with its own test:**

1. **Integer pence throughout.** §C2's `ArtistLeg` carries GBP floats, and its own
   reconciliation block converts back with `Math.round(l.netGbp * 100)` at every
   use site. That manufactures rounding drift on the one code path that has to
   balance exactly. Pence is the single source of truth; `penceToGbp` exists for
   the order's numeric GBP columns.
2. **`buildArtistLegs` does not select `free_until`.** §C2's version does. That
   column is in no migration and not in the live table, so PostgREST would reject
   the select whole, `profiles` would be null, every slug would land in `missing`,
   and it would **throw on every multi-artist cart**. `trial_end` is the real column
   (D17.1). This is the fifth phantom-column instance this session, and the second
   time a plan snippet has contained one.
3. **Shipping attribution handles three cases, not one.** The doc reads the map and
   uses it. But a session created before 082 has `'{}'`, which would attribute zero
   and quietly hand the buyer's postage to the platform; and a **collection order
   charges no postage at all** (`amount_total - subtotal` is 0) while the saved map
   still holds what posting would have cost, which would pay artists money the
   buyer never paid. So: sums-to-total uses the map as-is, sums-to-less splits the
   residual pro rata by artwork value, sums-to-more scales down proportionally.
   The remainder penny goes to the largest gross, ties broken by slug, so replays
   are deterministic.
4. **A residual is absorbed by the platform fee and logged, not thrown.** §C2's
   `assertLegsReconcile` throws, and the doc calls it "before writing anything".
   Thrown from the webhook that means an order the buyer has already paid for is
   never booked. `reconcilePlatformFee` moves any residual onto the platform fee
   (never onto a recipient), warns when it is larger than one penny per leg, and
   then the assert runs as a real invariant that must hold.

**A fixture was concealing the whole finding.** The webhook test mocked
`@/lib/platform-fee` with `vi.fn(() => 15)`, a flat 15% for every artist. That is
exactly the behaviour E9 removes, so a two-artist cart with two different plans
looked correct. The mock is **deleted**: the function is pure, over
`{ subscription_plan, trial_end }`, with no I/O, so there was nothing to mock and
the stub could only lie. Removing it is what made the per-plan assertions possible.

`setupDbMock` also grew a slug-aware `artist_profiles` branch supporting `.in()`,
and its `.eq()` now filters on the actual column, so a two-artist transfer test
gets each artist's own Connect row instead of one shared answer.

**Tests.** `src/lib/payouts/legs.test.ts` (26) and 7 cases in
`src/app/api/webhooks/stripe/route.test.ts`.

**Two probes, one per half of the finding:**

```
PROBE A — one pooled transfer to the first artist (the original shape)
 FAIL  E9 > pays each artist their own net, at their own plan rate
 FAIL  E9 > attributes shipping to the artist who posts the parcel
 FAIL  E9 > pays the other artist when one artist's Connect account has lapsed
      Tests  3 failed | 34 passed (37)

PROBE B — one fee tier for everyone (the first artist's plan)
 FAIL  legs > charges each artist their own plan rate, not the first artist's
 FAIL  legs > pays each artist their own net, so nobody receives another's money
 FAIL  legs > applies each artist's own placement rate to their own lines
 FAIL  E9 > splits to the penny: venue + fee + every leg equals what Stripe collected
      (+3 more)  Tests  7 failed | 56 passed (63)
```

Restored: `Tests 63 passed (63)` across both files.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  159 passed (159)
Tests  1660 passed (1660)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

Warning count is unchanged at 175: the one warning this work introduced was the
now-unused `platformFeePercentForArtist` import in the webhook, and that import was
deleted with the code path it served.

**Stripe drive not run.** Same blocker as D7: `STRIPE_SECRET_KEY` is
`sk_test_PLAC...`, api.stripe.com returns 401, no webhook secret, no CLI. The
split-to-the-penny assertion is made against `scheduleTransfer`'s recorded
arguments plus the persisted order row, which is the strongest evidence available
here. A real test-mode drive remains an owner action.

**Not done here, still open in `04`:** C1 `canReceivePayout` (the richer
`charges_enabled` / `payouts_enabled` check) and C3 `recordBlockedLeg` (a
`stripe_transfers` row with `status: 'blocked'` so ops can see what is owed). The
per-leg payability check is today's `stripe_connect_onboarding_complete` guard,
applied per artist instead of once, and the skip path logs the slug, user id and
amount. Both helpers remain their own tasks.

---

## `04` T6 / E7a — the paid-loan subscription was recorded by nothing (owner: `04` §B6, branch from §C5)

Commit `416aac2`.

**The finding.** `api/placements/[id]/payment/setup` mints a real Stripe
subscription, and no webhook branch consumed the resulting session. A venue could
complete the flow and be billed monthly while `placements.stripe_subscription_id`
stayed null, so the setup route's "already set up" guard never fired (a second
subscription could be minted for the same placement) and `cancelPaidLoanBilling`,
which reads `placement_recurring_billings`, had nothing to cancel.

**Prod confirms it:** `placement_recurring_billings` has **0 rows**, and **0 of
77 placements** have a `stripe_subscription_id`. Every column and constraint §C5
needs already exists, including the UNIQUE on
`placement_recurring_billings.stripe_subscription_id` that the upsert's
`onConflict` depends on, and `placements_subscription_status_check` allows
`'active'`.

**What changed.** Rather than pasting §C5's snippet into the webhook, the write is
extracted: `recordPaidLoanSubscription()` in
`src/lib/placements/paid-loan-billing.ts` owns the ledger row **and** the
`placements` mirror, plus `periodFromSubscription()` for the SDK-22 item-level
period bounds. `startPaidLoanBilling` calls it and **its inline upsert is
deleted**. One ledger, two callers. The snippet would have been a second copy of an
upsert that already existed twelve lines away, which is how these two paths would
drift apart again.

`startPaidLoanBilling` also never mirrored onto `placements`, so the setup route's
guard was false for subscriptions started that way too. It writes it now.

**Deliberately not flag-gated**, unlike `startPaidLoanBilling`. `PAID_LOAN_V2`
decides whether we *start* billing; once Stripe has a live subscription, recording
it is always correct. The setup route has no flag check either (verified in
source), so a venue can already be on a monthly subscription with the flag off, and
refusing to record that would leave them billed with nothing to cancel.

**Two departures from §C5, each with its own test:**

1. **The notification fires only on the first link.** §C5 notifies
   unconditionally, but Stripe redelivers, and the branch is entered by *both*
   `checkout.session.completed` and `checkout.session.async_payment_succeeded` for
   one session, so the artist would be told their payments had started two or three
   times. `recordPaidLoanSubscription` returns `newlyLinked`, which gates it.
2. **A placement with no monthly fee returns 200 + `ignored` instead of writing.**
   `monthly_amount_pence` carries `CHECK (> 0)`, so a zero raises 23514, the branch
   would answer 500, and Stripe would retry a request that can never succeed. All
   27 `paid_loan` placements have a positive fee today (7 of 9 `free_loan` rows have
   a null fee, but the setup route already refuses those), so this is defence
   against the fee being cleared afterwards.

**A fixture was proving nothing.** The existing `startPaidLoanBilling` test put
`current_period_start` / `current_period_end` on the subscription object. SDK 22
carries them on the **first item**, which is where the code has always read them,
so the assertion never touched the dates. Corrected, and it now asserts a real
period end, which is exactly the E11b failure mode (`new Date(undefined * 1000)`
stamping 1970-01-01).

**Tests.** 11 cases in `src/app/api/webhooks/stripe/route.test.ts`. The
`paid-loan-billing` module mock now uses `importOriginal` so
`recordPaidLoanSubscription` and `periodFromSubscription` are the **real**
implementations: E7a is about whether the ledger row and mirror get written, so
stubbing them would have tested nothing. `stripe.subscriptions.retrieve` was added
to the Stripe mock, and `buildDb` in `paid-loan-billing.test.ts` grew a
`placements` branch.

**Two probes:**

```
PROBE 1 — E7a branch removed
      Tests  9 failed | 39 passed (48)

PROBE 2 — notification not gated on newlyLinked
 FAIL  E7a > does not re-notify when Stripe redelivers the same session
      Tests  1 failed | 47 passed (48)
```

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  159 passed (159)
Tests  1671 passed (1671)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Stripe drive not run**, same blocker as D7 and E9. The subscription retrieve, the
ledger upsert and the mirror are asserted against the recorded mock calls.

**Still open in T6:** E7b (idempotency key + a working dedup guard), E8
(`charges_enabled` gating and the copy that promises a release mechanism that does
not exist), E7c (`cancelPaidLoanBilling` reading a table Path 2 never populated),
E7d (`setup_intent.succeeded`, the second §C5 branch), E11 (`PAID_LOAN_V2` off in
prod), E11b (`subscription_period_end` stamped 1970, now partly addressed by
`periodFromSubscription` being the single reader).

---

## `04` T6 / E7b — two clicks, two subscriptions (owner: `04` §B6)

Commit `b298ba5`.

**The finding.** `api/placements/[id]/payment/setup` created the Stripe session
with no idempotency key, so two clicks meant two live subscriptions and two monthly
charges for one placement. The dedup guard that should have caught the second
attempt read `placements.stripe_subscription_id`, which until E7a was written by
nothing, so it was permanently false.

**What changed.** The guard reads `placement_recurring_billings`, excluding
cancelled rows, and **keeps** the `placements` check alongside it. The mirror is
best-effort inside `recordPaidLoanSubscription` (a failed mirror is logged, not
fatal), so either signal on its own has to be able to block a second subscription.
The plan says to replace the old check; replacing it would have removed a guard
that E7a had only just made functional. 400 becomes 409 as the plan specifies,
which is safe because `PaymentClient.tsx` branches on `!res.ok` and renders
`data.error`, never on the code.

**Two departures from the plan's snippet, each with a test:**

1. **Not `.maybeSingle()`.** There is no unique index on
   `placement_recurring_billings.placement_id`; the UNIQUE is on
   `stripe_subscription_id` (verified in prod). So two rows for one placement are
   possible, and `maybeSingle()` would raise PGRST116, hand back `data: null`, and
   the guard would wave through a **third** subscription. `.limit(2)` plus a `find`
   cannot fail that way. The new test file's mock deliberately omits `maybeSingle`
   from that chain, so reverting to the plan's shape fails loudly rather than
   passing silently.
2. **The idempotency key carries the amount**, not just the placement and the hour
   bucket. A repeated key with *different* parameters is an idempotency error from
   Stripe, which would surface as the route's generic 500, so a fee edited between
   two attempts must produce a different key rather than a failure.

**Test.** `src/app/api/placements/[id]/payment/setup/route.test.ts` (new, 14
cases). The route had no test file at all.

**Three probes:**

```
PROBE 1 — idempotency key removed
      Tests  4 failed | 10 passed (14)

PROBE 2 — old guard restored (placements mirror only, 400)
      Tests  4 failed | 10 passed (14)

PROBE 3 — .maybeSingle() instead of a limited list (the plan's shape)
      Tests  10 failed | 4 passed (14)
```

Probe 3 fails widely because the mock has no `maybeSingle` on that chain, which is
the point: the shape cannot be reintroduced quietly.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  160 passed (160)
Tests  1685 passed (1685)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Stripe drive not run**, same blocker. The key is asserted against the recorded
`sessions.create` options, which is where Stripe would read it from.

**Still open in T6:** E8, E7c, E7d, E11, E11b.

---

## `04` T6 / E8 — a monthly charge we could not pay out (owner: `04` §B6)

Commit `ab96b2d`.

**The finding.** The setup route gated on `artistProfile?.stripe_connect_account_id`
being truthy, which is "the column is a non-empty string", not "this artist can be
paid". The column defaults to `''` and is written the moment onboarding *starts*,
so an account mid-KYC passed the check and the venue was charged monthly with no
way to forward the money.

**What changed.**

- The gate calls `canArtistAcceptOrders(slug)`, the same `charges_enabled` check
  (60s cache, fails closed) that the cart and offer checkouts already use, and
  returns 422 `payouts_unavailable`. §B6's fix names `canReceivePayout`, which is
  C1's helper and does not exist yet; using the primitive that is already in two
  other payment routes avoids standing up a second one, and C1 can fold all three
  call sites together when it lands.
- **Path 2 deleted** per §B6's stated decision: no `transfer_data`, no
  `application_fee_percent`. The platform collects the fee and the artist is paid by
  a separate transfer through the `stripe_transfers` ledger.
- The route's header comment described a "10% application fee placeholder" that no
  longer exists. Corrected.

**Why Path 2's deletion is urgent and not cosmetic.** `handleInvoicePaid` looks the
subscription up in `placement_recurring_billings` and schedules a transfer for the
artist's share. **E7a made setup-route subscriptions appear in that table**, so a
destination charge here would pay the artist once directly through Stripe and again
through the ledger. `PAID_LOAN_V2` being off in prod (`handleInvoicePaid` returns
false immediately) is the only reason that has not happened.

**Sequencing constraint, recorded loudly: E8 had to land before `PAID_LOAN_V2` is
enabled.** It has. But anyone turning that flag on should confirm both are present.

**The copy problem was worse than the plan describes.** §B6 says the banner promises
a release mechanism that does not exist, which is true. It is also gated on
`artist_stripe_ready`, and that is **not a column** (checked against prod: 0 rows in
`information_schema.columns`) and is produced by nothing in the codebase. So
`artistReady` was always false and the misleading banner rendered on **every**
paid-loan payment page, including for artists who were perfectly payout-ready. That
is the sixth phantom-field instance this session.

Rather than rewording a banner fed by a field that does not exist, the banner is
**deleted** and the route's 422 message is the single source of that information.
The client already renders `data.error`, so the message now comes from the check
that enforces it and cannot drift from it. The upfront warning is lost, but it was
always-wrong noise rather than information.

**Tests.** 9 cases added to `src/app/api/placements/[id]/payment/setup/route.test.ts`
(23 total), including the exact case the old check waved through: an account id
present, `charges_enabled` false.

**Two probes:**

```
PROBE 1 — capability gate removed
      Tests  5 failed | 18 passed (23)

PROBE 2 — destination charge restored (Path 2)
 FAIL  ... > sends no transfer_data, so the platform collects and the ledger pays out
 FAIL  ... > sends no application_fee_percent
 FAIL  ... > would otherwise double-pay: handleInvoicePaid already transfers the artist's share
      Tests  3 failed | 20 passed (23)
```

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  160 passed (160)
Tests  1694 passed (1694)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Blast radius: none live.** 0 rows in `placement_recurring_billings`, 0 placements
with a `stripe_subscription_id`, and `PAID_LOAN_V2` off in prod, so no existing
subscription changes behaviour.

**Stripe drive not run**, same blocker. The absence of `transfer_data` and
`application_fee_percent` is asserted against the recorded `sessions.create`
parameters, which is exactly what Stripe would have received.

**Still open in T6:** E7c, E7d, E11, E11b.

---

## `04` T6 / E7c — nothing stopped a placement having two live billing rows (owner: `04` §B6)

Commit `07317eb`. Migration `083`.

**Three parts, one already fixed.** §E7c's first paragraph (the cancel path reads a
table Path 2 never populated, plus "add the `placements.stripe_subscription_id`
mirror write") was resolved by E7a: both paths now write the ledger and the mirror.
What remained was the conflict target and the FK.

**The finding.** The table's only uniqueness was `UNIQUE (stripe_subscription_id)`
on a **nullable** column (confirmed in prod: `stripe_subscription_id text YES`), and
NULLs do not conflict in Postgres, so a row written before the subscription id was
known gave no protection and nothing stopped one placement accumulating live billing
rows. That matters because both `cancelPaidLoanBilling` and E7b's dedup guard ask
"does this placement have a live subscription?", and two rows make the answer
ambiguous.

**Migration 083** adds a partial unique index on `placement_id WHERE status <>
'cancelled'` and the FK to `placements`. Partial rather than total because cancelled
rows are archived by status, not deleted, so a venue who cancels must be able to
start again.

**The plan's UNCONFIRMED is resolved.** §E7c flags "UNCONFIRMED: whether
`placements.id` is TEXT PRIMARY KEY. Verify before adding the FK; the migration must
be split if not." Verified against the live project: `placements.id` is `text` with
`PRIMARY KEY (id)`, and `placement_recurring_billings.placement_id` is `text NOT
NULL`. Type-compatible, no split needed.

**Migration numbering, wrong again.** The plan names this `078`, inside `02`'s range
(074-079). D1 gives `04` 080-089 and 080-082 are taken, so it is **083**. Second
numbering error in this doc after E9's `076`.

**Proved against prod with a rolled-back `DO` block** (unconditional trailing
`raise`, so nothing is written):

```
ERROR: P0001: PROBE RESULT (rolled back):
  PASS: second live row refused with 23505
| PASS: cancelled row alongside live accepted
| PASS: orphan placement_id refused by the FK
```

`select count(*) from placement_recurring_billings` → `0` after the probe.

**A second defect the new index exposes.** `cancelPaidLoanBilling` read its row with
`.maybeSingle()`. A cancelled row beside a live one is exactly the state 083
permits, and `maybeSingle()` raises PGRST116 on the pair, returns `data: null`, and
the function reported `not_found` **while the subscription kept billing the venue**.
It now filters cancelled rows in SQL and takes a list, the same shape as E7b's
guard. This is the third `.maybeSingle()`-on-a-multi-row-query bug in this doc's
snippets, so it is worth naming as a pattern rather than three coincidences.

The unreachable "already cancelled" branch is deleted, and the behaviour change
(cancelled-only placements now return `not_found` rather than `cancelled`) is safe:
the only caller, `api/placements/route.ts:1385`, ignores the return value.

**Permanent versus transient failures.** `recordPaidLoanSubscription` reports 23505
on the new index as `duplicate_live_billing`, and the webhook treats it as permanent
(200 + `ignored`) alongside `monthly_amount_missing`. A retry can never resolve a
placement that already has a live row for a different subscription, so a 500 would
have Stripe retry for three days while the real problem, a venue being charged
twice, sat unread in the logs.

**Tests.** 5 cases added to `src/lib/placements/paid-loan-billing.test.ts` (18
total). `buildDb` grew the list-based lookup.

**Two probes:**

```
PROBE 1 — cancel path back to .maybeSingle()
 FAIL  ... > cancels the live subscription when a cancelled row sits beside it
      Tests  1 failed | 17 passed (18)

PROBE 2 — 23505 not distinguished
 FAIL  ... > reports duplicate_live_billing on 23505 rather than a generic failure
      Tests  1 failed | 17 passed (18)
```

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  160 passed (160)
Tests  1699 passed (1699)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

`tests/integration/migration-numbering.test.ts` → `Tests 4 passed (4)`, so 083 sits
in the right range.

**Still open in T6:** E7d (the `setup_intent.succeeded` branch, §C5's second half),
E11, E11b.

---

## `04` T6 / E7d — a card attached, and nothing ever billed it (owner: `04` §B6, §C5's second branch)

Commit `b4132fa`.

**The finding.** `paid-loan-billing.ts` documents that the flow is "re-invoked after
`setup_intent.succeeded` lands on the webhook". No such branch existed (confirmed:
`grep -c setup_intent` on the webhook returned **0**), and the client cannot
re-invoke by PATCH either, because that path requires status `pending` and the
placement is already `active` by then. So a paid-loan placement whose venue had no
card on file went live and never billed anyone.

**What changed.** The branch guards on the three metadata keys
`startPaidLoanBilling` stamps on the intent (`source:
"wallplace_paid_loan_billing"`, `placement_id`, `venue_user_id`), makes the new
card the customer's default so invoices can charge it off-session, then calls
`startPaidLoanBilling`, which is idempotent (`already_started` on a redelivery).

**Two departures from §C5, each with a test:**

1. **`"skipped"` does not page the admin.** §C5 alerts on any status that is not
   `started`/`already_started`. But `startPaidLoanBilling` short-circuits to
   `"skipped"` whenever `PAID_LOAN_V2` is off, which is its state in prod, so §C5's
   condition would have mailed the admin on **every single card attachment**. A
   stall is the flag being ON, the card attached, and billing still not starting.
   `skipped` is logged at warn with the reason instead.
2. **An unknown placement returns 200 + `ignored`** rather than a non-2xx, matching
   the treatment of permanent failures elsewhere in this webhook: Stripe would
   otherwise retry a lookup that can never succeed.

**§C5 calls a function that does not exist.** `notifyAdminBillingStalled` had zero
matches anywhere in `src/`. Added to `lib/email.ts` beside the four existing
`notifyAdmin*` helpers, using the same `ADMIN_EMAIL` and Resend shape, rather than
inventing a new alerting channel.

**Also verified, since §C5 asks:** the three placement columns it names all exist
(`stripe_subscription_id`, `subscription_status`,
`subscription_current_period_end`), so its "migration 086 is not needed" note holds
and none was written.

**Tests.** 10 cases in `src/app/api/webhooks/stripe/route.test.ts` (57 in the file).
The Stripe mock grew `customers.update`, and `startPaidLoanBilling` /
`notifyAdminBillingStalled` are stubbed so each status can be driven.

**Two probes:**

```
PROBE 1 — E7d branch removed
      Tests  7 failed | 50 passed (57)

PROBE 2 — §C5's alert condition (skipped also pages the admin)
 FAIL  ... > does NOT mail the admin when the helper skipped because the flag is off
      Tests  1 failed | 56 passed (57)
```

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  160 passed (160)
Tests  1708 passed (1708)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Stripe drive not run**, same blocker. The branch is exercised through
`constructEvent` returning a `setup_intent.succeeded` object, and the outcomes are
asserted against the recorded `customers.update` and `startPaidLoanBilling` calls.

**Still open in T6:** E11 (`PAID_LOAN_V2` off in prod, an owner decision on
enabling it) and E11b (`subscription_period_end` stamped 1970, partly addressed
because `periodFromSubscription` is now the single reader).

---

## `04` T6 / E11 — the flag gated the reconcilers, so a failed card did nothing (owner: `04` §B6)

Commit `336979e`.

**The finding.** Every helper in `paid-loan-billing.ts` short-circuited on
`PAID_LOAN_V2`, which is off in prod. So a failed venue card did nothing at all: no
`past_due`, no `paused`, no notification, and the placement kept displaying while
nobody was paying for it.

**What changed.** The flag check is removed from the three webhook reconcilers
(`handleInvoicePaid`, `handleInvoicePaymentFailed`, `handleSubscriptionDeleted`) and
from `cancelPaidLoanBilling`, and kept in `startPaidLoanBilling`. A subscription that
already exists in Stripe must be reconciled whatever the flag says; the flag only
decides whether we would create a **new** one. `cancelPaidLoanBilling`'s return type
loses `"skipped"`, which nothing else produced.

**Safe to ungate now, and only now.** An ungated `handleInvoicePaid` schedules a
transfer for the artist's share, so any subscription still carrying
`transfer_data.destination` from before E8 would be paid twice. Verified in prod
before making the change: **0** ledger rows, **0** placements with a
`stripe_subscription_id`, **0** paid-loan transfers ever
(`stripe_transfers where order_id like 'placement:%'`). No such subscription exists.
Had any existed, E11 would have had to wait.

**A test was pinning the defect.** `cancelPaidLoanBilling() > "skips when flag is
off"` asserted `{ status: "skipped" }`, i.e. it encoded the uncancellable-subscription
behaviour as correct. Rewritten to assert cancellation proceeds. This is exactly what
D27's "grep test titles for permissive verbs on payment, auth and authz paths" sweep
is for, found here by the change failing the old assertion rather than by the sweep.

**This does NOT flip the flag.** §E11 calls that "this plan's exit criterion"; it is
an owner decision and is listed under owner decisions below.

**Tests.** 4 new cases in a `describe("webhook reconcilers ignore PAID_LOAN_V2
(E11)")` block, plus the rewritten cancel test and a companion asserting `not_found`
still holds with the flag off. Each reconciler is driven with
`isFlagOnMock.mockReturnValue(false)`, prod's state.

**Probe** (flag checks restored on all four):

```
 FAIL  cancelPaidLoanBilling() > cancels even with PAID_LOAN_V2 off ...
 FAIL  webhook reconcilers ignore PAID_LOAN_V2 (E11) > handleInvoicePaid reconciles with the flag off
 FAIL  webhook reconcilers ignore PAID_LOAN_V2 (E11) > handleInvoicePaymentFailed marks past_due with the flag off
 FAIL  webhook reconcilers ignore PAID_LOAN_V2 (E11) > handleSubscriptionDeleted marks cancelled with the flag off
      Tests  4 failed | 19 passed (23)
```

---

## `04` T6 / E11b — a subscription that expired in 1970 (owner: `04` §B6)

Commit `4a8759f`.

**The finding.** Both artist-subscription sites read
`new Date((subscription.items.data[0]?.current_period_end ?? 0) * 1000)`. When Stripe
omits the period, `?? 0` becomes the Unix epoch, so the billing page showed a
subscription that expired 56 years ago and the upgrade email quoted "1 January 1970"
as the next billing date.

**What changed, and why more than the doc asks.** §E11b patches the expression at
both sites. But the same item-level read already existed in `paid-loan-billing.ts`
from E7a, so patching in place would have left a **third** copy of a two-trap
expression (bounds live on the item, not the subscription; and `?? 0` means 1970).
It now lives in `src/lib/stripe-subscription-period.ts` as
`periodFromSubscription` / `epochToIso` / `epochToUkDate`, and
`paid-loan-billing.ts` imports and re-exports it for existing callers.

`epochToUkDate` returns "your next billing date" when the date is unknown, so
customer-facing copy has no path to printing a 1970 date.

**Tests.** `src/lib/stripe-subscription-period.test.ts` (11 cases, including one
proving that period fields on the *subscription* are ignored, which is the SDK-22
half of the trap) and 4 webhook-level cases asserting `null` rather than 1970.

**Probe** (`?? 0` restored at both sites):

```
 × E11b > writes null, not 1970, when Stripe sends no period
   → expected '1970-01-01T00:00:00.000Z' to be null
 × E11b > writes null, not 1970, when the subscription has no items
   → expected '1970-01-01T00:00:00.000Z' to be null
 × E11b > never writes a 1970 date under any of those shapes
   → expected '1970-01-01T00:00:00.000Z' not to contain '1970'
```

The probe reproduces the finding's exact string, so the test is measuring the real
defect and not a proxy for it.

**Full gate after both commits.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  161 passed (161)
Tests  1726 passed (1726)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**`04` T6 is complete**: E7a, E7b, E7c, E7d, E8, E11, E11b. No Stripe drive was
possible for any of them (`sk_test_PLAC...`, api.stripe.com 401, no webhook secret,
no CLI), so each is verified against recorded Stripe-client calls and DB writes.

---

## `04` B0 / D1 — the webhook had no global replay guard (owner: `04` §B0)

Commit `13aed91`. Migration `084`.

**B0 status first.** D2 (unauthenticated `POST /api/orders`) was already done under
finding **E19/E46f** (`740b79a`): the POST handler is gone and a ratchet test in
`api/orders/route.test.ts` fails if it is re-added. D3 (order-id collision) is still
open. This iteration did **D1**.

**The finding.** The webhook had no `event.id` table; idempotency was per-branch and
ad hoc (cart on `stripe_payment_intent_id`, offer on a status compare-and-set,
curation on a status read). A redelivery reaching a branch with a weaker guard could
act twice.

**What changed.** Migration `084` adds `stripe_webhook_events` (`event_id PRIMARY
KEY`, RLS on, 0 policies, service-role only). The handler claims `event.id` at the
top: a duplicate (23505) short-circuits to `{ received, duplicate }`, a real insert
failure 500s so Stripe retries.

**Departure from the plan's snippet, with a dedicated test.** The snippet claims the
event and never releases it. That turns any **transient** 500 into a **permanent
drop**: a money branch's DB write fails, we return 500, Stripe retries, the retry
hits 23505 and is waved through as a duplicate with the work never done. There are 6
such 500-return sites in the handler, all "DB write failed, retry me" cases. So the
POST body is split into a thin wrapper plus `handleWebhookEvent(event, db)`, and the
wrapper deletes the claim whenever the handler returns >= 500. The extraction is
mechanical: `request` is unused past the signature check, and the body keeps its
indentation because it was already one level deep. The **61 existing branch tests
still pass**, which is what validates the extraction.

**Migration numbering, wrong again.** The plan names it
`074_stripe_webhook_events.sql`, but 074 is taken (`074_rls_gap_closure.sql`) and
074-079 is `02`'s range (D1 decision). It is `04`-owned, range 080-089, 080-083
taken, so **084**. Third numbering correction (E9 → 076, E7c → 078, D1 → 074).

**Scope: the event-dedup half only.** D1 bundles a second, explicitly "Separately"
paragraph: no branch checks `session.payment_status`, and the
`async_payment_succeeded` / `_failed` / `expired` branches "fall on the floor". Not
done here, deliberately:

- Only `card` is enabled (`payment_method_types: ["card"]` at every session
  creation), so `checkout.session.completed` always carries `payment_status: "paid"`
  today; the gate is defence for a delayed-notification method that is not turned on.
- The subscription-mode branches (paid-loan, managed curation) report `payment_status`
  differently (`no_payment_required` for a trial), so a blanket `isSettled` gate
  would need a Stripe test-mode drive to prove it does not reject a legitimate
  subscription. That drive is impossible here (`sk_test_PLAC...`, api 401).

Recorded as the remaining part of D1 under owner decisions.

**Tests.** 5 cases in `describe("Stripe webhook — global replay guard (D1)")`. The 5
`fromMock.mockImplementation` sites in the file each grew a `stripe_webhook_events`
stub so every existing branch test runs behind the new guard.

**Two probes:**

```
PROBE A — claim-only, no release (the plan's snippet)
 FAIL  D1 > releases the claim when the handler returns a 5xx, so the retry can reprocess
      Tests  1 failed | 65 passed (66)

PROBE B — no global guard at all
      Tests  4 failed | 62 passed (66)
```

Probe A is the one that matters: it fails exactly the release test, so the departure
from the snippet is pinned as load-bearing rather than decorative.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  161 passed (161)
Tests  1731 passed (1731)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**DB verification.** `pg_policies` SELECT-leak assertion → 0 rows. Advisor (via MCP)
shows `stripe_webhook_events` as `rls_enabled_no_policy` INFO, which is intended for
a service-role-only table, and adds no new WARN or ERROR.

---

## `04` B0 / D3 — order-id collisions were silently dropped (owner: `04` §B0)

Commit `c066a38`. **B0 is now complete** (D1 `13aed91`, D2 `740b79a`, D3 `c066a38`).

**The finding.** `orders.id` was `WS-${session.id.slice(-8)}` (and `OFR-${...}`),
only 8 characters. Two different payments could collide, and the webhook then saw
the second insert's 23505 and returned `{ received, duplicate }`, so the second
buyer's money was taken with no order written.

**What changed.** `src/lib/orders/order-id.ts` (new) holds both halves:
- `orderIdFromSession(prefix, sessionId)` takes 16 chars of the session entropy
  (the part after the last underscore, 24+ random chars) and uppercases it, making
  a collision cryptographically implausible.
- `classifyOrderIdConflict(db, orderId, paymentIntentId)` reads the clashing row on
  a 23505: same payment intent → `"duplicate"` (a real redelivery, safe to drop),
  anything else → `"collision"` (500, so Stripe retries loudly). The bias is always
  a loud retry over a silent drop: a missing clash row, a different intent, or a
  null-vs-nonnull mismatch all count as a collision.

Both branches use it. The cart branch's **two** 23505 sites (main insert and the
strip-and-retry) and the offer branch's 23505 path, which used to proceed and flip
the offer paid unconditionally, now route through the check.

**Extracted, not inlined.** The helpers first went inline in the route, but the
collision check reads the DB and both branches share it, so a small module is the
testable home (the pattern used for work-stock, legs, confirmations,
stripe-subscription-period). That also keeps the route file, already 1500 lines,
from growing.

**The plan's UNCONFIRMED is resolved.** §D3 flags "whether any existing UI or email
hardcodes an 11-character `WS-xxxxxxxx` shape. Grep `WS-` before landing." Grepped:
nothing hardcodes the shape or slices order ids by length, and `orders.id` is TEXT.
Widening is safe; existing orders keep their ids, only new orders get the wider
form.

**Interaction with D1.** The global replay guard (D1, this session) already catches
same-event redelivery upstream, so `classifyOrderIdConflict` fires in practice only
for a null-intent redelivery (both null → duplicate) or a true collision. It is the
backstop, not the primary dedup, which the tests note.

**Tests.** `src/lib/orders/order-id.test.ts` (11 unit cases across both helpers),
plus an offer-branch integration test asserting a 500 and that the offer is NOT
flipped paid on a collision. The offer test harness grew an `orders.select` for the
classify read and an `orderClash` fixture; one existing assertion moved to the new
uppercased 16-char id.

**Two probes:**

```
PROBE A — widening reverted (old slice(-8), no uppercase)
      Tests  7 failed | 71 passed (78)

PROBE B — collision distinction reverted (always duplicate, the old bug)
      Tests  4 failed | 74 passed (78)
```

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  162 passed (162)
Tests  1743 passed (1743)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Stripe drive not run**, same blocker as the rest of `04`. The widening is asserted
on the persisted `id` / `paid_order_id`, and the collision path on the recorded
insert error plus the `orders.select` the check reads.

---

## `04` T1 / D4 — the artist lookup silently zeroed attribution (owner: `04` §B1)

Commit `68885e8`.

**First, Bug 15.** The dependency order and PROGRESS both mark D4 as "Bug 15, done
at Phase 0 (ee7e888)". Bug 15 was a *different* D4-adjacent fix (the curation Phase
0 work). The finding **D4 in §B1** (the `.single()` swallow on the cart artist
lookup) was still live: `webhooks/stripe/route.ts:588` used `.single()` and
discarded the error. Done now.

**The finding, and how E9 shrank it.** `.single()` errors on 0 rows AND on >1 row.
The old code took `const { data: ap } = ...` and dropped the error, so on either
case `ap` was null, `artistUserId` stayed null, and the order booked unattributed.
Pre-E9 this also skipped the artist transfer (`if (artistUserId && ...)`) and
defaulted the fee to 15%. E9 moved payouts and the fee to per-artist legs, so those
two consequences are gone; what remained is the order row's `artist_user_id`.

**What changed.** `.maybeSingle()` with an explicit error/null check that 500s
rather than booking an order it cannot attribute. The 500 is safe: this lookup runs
at line ~588, well before the order insert at ~760, so nothing is half-written, and
Stripe's retry is idempotent via D1's event dedup and D3's payment-intent check
(both landed this session).

**The plan's D4 snippet is stale.** It selects `user_id, subscription_plan,
free_until` and restores the `platformFeePercentForArtist(ap)` fee assignment.
`free_until` is the phantom column removed in D17.1, and the fee logic now lives in
the legs. Kept the select to `user_id` only, which is all the order row's
attribution needs.

**Isolating D4 from buildArtistLegs in the test.** buildArtistLegs (line ~638) also
throws on a missing artist, so a naive "missing artist" test would 500 from there,
not from D4. The test sets the cart line's artist (bob) to resolve while
`firstArtistSlug` (from `artistSlugs`) is "ghost", so buildArtistLegs succeeds and
only the D4 lookup fails. That is the exact gap D4 covers: firstArtistSlug can
differ from the cart-line slugs.

**Tests.** 2 cases in `describe("Stripe webhook — artist attribution lookup
(D4)")`. The shared mock's `artist_profiles.eq` grew a `maybeSingle`.

**Probe** (revert to `.single()` with a swallowed error):

```
 FAIL  D4 > 500s and books no order when the first artist's profile is missing
   → expected 200 to be 500
      Tests  1 failed | 68 passed (69)
```

Under the old code the missing-artist order books with a 200 and a null
`artist_user_id`, which is the defect.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  162 passed (162)
Tests  1745 passed (1745)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Still open in T1:** D5 (read-then-write stock decrement → atomic RPC, migration
in 04's range, next free is 085) and D6 (the strip-and-retry loop can drop money
columns).

---

## `04` T1 / D5 — read-then-write stock decrement let two buyers get one piece (owner: `04` §B1)

Commit `dc37c18`. Migration `085`.

**The finding.** The decrement was `SELECT quantity_available` → `max(0, current -
qty)` → `UPDATE`. Two concurrent orders for the last piece both read 1 and both
wrote 0, so both buyers got it. `decrement_work_stock(work_id, qty)` does it in a
single `UPDATE ... SET quantity_available = GREATEST(0, ... - qty)`, which Postgres
serialises: the first takes 1→0, the second 0→0.

**Scope: both branches.** E10's decrement comment explicitly said "replacing that
pattern with an atomic decrement is D5's task, and inventing a second mechanism
here would just add a third". So D5 converts **both** the cart decrement (its named
target) and the offer decrement to the one RPC. The offer branch keeps a separate
best-effort `title` read for the confirmation email, which is display-only and need
not be atomic.

**Proved against prod with a rolled-back `DO` block** (unconditional trailing
`raise`):

```
start=1 afterMinus1=0 afterFloor=0 afterExtra=0 availableAtZero=f missingReturns=NULL
```

1→0, floors at 0, `-5` stays 0 (never negative, which checkout reads as sold),
`available` flips false at 0, an unknown id returns NULL. `count(*) where
quantity_available < 0` → 0 after; nothing written.

**Two departures from the plan, each with a reason.**

1. **EXECUTE revoked from anon and authenticated, not just PUBLIC.** The plan's
   migration only `REVOKE ... FROM PUBLIC`. Checking the live ACL after apply showed
   `anon=X, authenticated=X` still present: Supabase grants those roles **explicitly**,
   not via PUBLIC. A `SECURITY DEFINER` function any signed-in or anonymous caller
   could invoke to `decrement_work_stock('any_work', 999)` is a real vulnerability, so
   this would have *introduced* one. Revoked all three; the live ACL is now
   `postgres=X, service_role=X` only. **This is the fifth "advisor/ACL clean is not
   proof" moment: the pg_policies leak assertion says nothing about function grants,
   and neither does the advisor here.**

2. **Best-effort, not fatal.** The plan says "treat failure as fatal for the order".
   But the decrement runs *after* the order insert and *before* the buyer's receipt,
   and a 500 there loses both on the retry: Stripe re-delivers, the order's 23505 is
   classified a duplicate by D3 and returns early, so neither the decrement nor the
   emails ever run again. The plan's own note ("the retry path relies on D1's event
   dedup plus the D3 payment-intent check to stay idempotent") is exactly what makes
   fatal unrecoverable. True fatality needs the decrement inside the order-insert
   transaction, larger than D5 scopes. The race, which is the finding, is closed
   regardless; a failed decrement oversells by at most the failed line and is logged.

**Migration numbering, wrong again.** The plan names it `075`, inside `02`'s range.
`04` is 080-089, 080-084 taken, so **085**. (Running tally: 076→E9/082, 078→E7c/083,
074→D1/084, 075→D5/085.)

**Tests.** 4 cart cases in `describe("Stripe webhook — atomic stock decrement
(D5)")` (per-line RPC call + qty, no read-then-write UPDATE, best-effort on RPC
error, skips no-id/zero-qty lines), plus the E10 offer test rewritten to assert the
RPC. The webhook mock gained `db.rpc` and a `maybeSingle` on the offer title read.

**Probe** (revert the cart decrement to read-then-write):

```
 FAIL  D5 > calls the RPC once per line with the line quantity
 FAIL  D5 > does not read-then-write: no artist_works UPDATE is issued
 FAIL  D5 > skips lines with no work id or a non-positive quantity
      Tests  3 failed | 70 passed (73)
```

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  162 passed (162)
Tests  1749 passed (1749)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

DB: pg_policies SELECT-leak assertion → 0 rows; advisor shows no new item for
`decrement_work_stock` (the fixed `search_path` avoids `function_search_path_mutable`).

**Still open in T1:** D6 (the strip-and-retry loop can drop money columns; split the
list so money columns and `stripe_payment_intent_id` are never stripped).

---

## `04` T1 / D6 — the strip-and-retry loop could drop the money columns (owner: `04` §B1)

Commit `532eece`. **T1 (B1) is now complete**: D4 (`68885e8`), D5 (`dc37c18`,
migration 085), D6 (`532eece`).

**The finding.** On a schema-drift insert error the loop stripped whatever column
the error named and retried. `optionalCols` included `venue_revenue`,
`artist_revenue`, `platform_fee`, `venue_revenue_share_percent`,
`platform_fee_percent` and `stripe_payment_intent_id`, so the order could save with
the split silently missing, and the code then scheduled transfers from the
in-memory values that were never persisted. Reconciliation became impossible.

**What changed.** The list is split, per the plan:
- `strippableCols`: attribution only (`source`, `artist_slug`, `artist_user_id`,
  `venue_slug`, `placement_id`, `fulfilment_method`, `collection_notes`,
  `delivered_at`, `status_history`). Dropping these keeps an order bookable.
- `REQUIRED_MONEY_COLS`: `venue_revenue_share_percent`, `venue_revenue`,
  `artist_revenue`, `platform_fee_percent`, `platform_fee`,
  `stripe_payment_intent_id`. Never stripped. An insert error naming one 500s with
  `Schema drift on money columns`, so Stripe retries (idempotent via D1 + D3)
  rather than us booking a half-attributed order.

**Beyond the plan's snippet, minor.** The plan puts the money-column check only
before the loop. I added the same check to the retry error inside the loop, so a
money column that only surfaces after an attribution strip also fails loud with the
clear message rather than falling through to the generic "DB save failed". Both are
500; the difference is diagnosability. (Even without the retry check the loop could
not strip a money column, since they are no longer in `strippableCols` — the retry
check just makes the message uniform.)

**Tests.** 3 cases in `describe("Stripe webhook — strip-and-retry money-column
guard (D6)")` driving an insert that errors "column X does not exist": a money
column (`artist_revenue`) 500s with one attempt, `stripe_payment_intent_id` 500s,
and an attribution column (`placement_id`) is stripped and the order books with the
money columns intact.

**Probe** (money columns back in the strippable list, guard neutered):

```
 FAIL  D6 > 500s rather than stripping a money column (artist_revenue)
 FAIL  D6 > 500s rather than stripping stripe_payment_intent_id
      Tests  2 failed | 74 passed (76)
```

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  162 passed (162)
Tests  1752 passed (1752)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**`04` progress.** B0 (D1-D3), T1 (D4-D6), T2 (E9), T3 (E6/E10 + D7), T6 (E7a-E7d,
E8, E11, E11b), Phase 0 (Bug 15, curation, G-C/Bug 10) all done. Remaining `04`:
T4 (D8, D9), T5 (D10, D11), T7 (D12-D15), T8 refunds (D16-D18), T9 (N1, N2), and
the C-series helpers the plan factored out (C1 canReceivePayout, C3 recordBlockedLeg,
C4 retry sweep) where they are not yet folded in.

---

## `04` T4 / D8 — billing survived collection and sale (owner: `04` §B4)

Commit `420739f`.

**The finding.** `cancelPaidLoanBilling` was called only on `active → cancelled`.
A collection (`stage: "collected"`, which sets `status: "completed"`) or a sale
left the Stripe subscription live, so the venue kept paying a monthly fee for a
piece that had come off the wall.

**Where the plan's fix falls short, with a probe.** §D8 widens the body `status`
comparison to `status === "cancelled" || status === "completed" || status ===
"sold"`. But the real collection path sends `stage: "collected"`, not `status`, and
the handler sets `updates.status = "completed"` while the body `status` stays
undefined. A *direct* `status: "completed"` write is rejected at the schema (the
E23b test asserts the 400), so the body-`status` comparison can never see
"completed" on the path that actually happens. Probe A (apply the plan's fix
verbatim) fails the collection test:

```
PROBE A — plan's fix (widen the body status)
 FAIL  D8 > cancels billing when the work is collected via stage:collected
```

**What changed.** The check reads the **effective** new status,
`(updates.status as string) ?? existing.status`, which is exactly the pattern the
inventory-restore block immediately below already uses (`becameCollected`, my E23b
work). Renamed `goingCancelled` to `goingInactive`, since it now covers cancelled,
completed and sold. Direct `status: "cancelled"` still cancels (unchanged); a
non-terminal stage (`installed`) and an undo (`unsetStage: "collected"`, which sets
`updates.status = "active"`) both correctly do NOT cancel.

**Prod.** No status CHECK on `placements.status` (free text; statuses in use:
active, cancelled, completed, declined, pending). `sold` is not currently present
but is possible, so its branch is defensive. `completed`/`sold` placements with a
live subscription: **0**. With `PAID_LOAN_V2` off and no subscriptions linked, this
is preventative.

**Tests.** 4 cases in `describe("PATCH /api/placements stops billing on a terminal
transition (D8)")`. A hoisted `cancelBillingMock` replaced the inline
`cancelPaidLoanBilling` stub so the call is assertable.

**Probes.** A (plan's fix) and B (original `cancelled`-only) both fail the
stage:collected test, 1 of 16. Restored: 16 pass.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  162 passed (162)
Tests  1756 passed (1756)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Still open in T4:** D9 (revenue_share_percent unbounded + non-deterministic
duplicate placements: a bounded CHECK migration and a determinism fix in the
webhook's placement map, with an UNCONFIRMED about the unique-index key given
multi-work placements).

---

## `04` T4 / D9 — unbounded share + non-deterministic duplicate placements (owner: `04` §B4)

Commit `5de53c3`. Migration `086`. **T4 (B4) is complete** (D8 `420739f`, D9
`5de53c3`), with one owner decision carved out (below).

**Two halves, and where the plan was stale.**

**(a) Bounds.** `placements.revenue_share_percent` had no CHECK (the constraint the
grep matched, `placements_arrangement_type_check`, only lists `revenue_share` as an
arrangement_type enum value). So a 150% counter-offer made the artist's net negative
in buildArtistLegs (`venueCut = gross * 1.5`). Migration 086 adds
`CHECK (revenue_share_percent IS NULL OR 0..100)`, with clamp UPDATEs first for
replay-safety (prod had **0** out-of-bounds rows, so no live row was touched).
Proved with a rolled-back `DO` block: `150 rejected | -5 rejected | 50 accepted`.
Bounds check live, `out_of_bounds_now = 0`.

**(b) Determinism.** The webhook filled `placementByArtistSlug` with no ordering and
last-wins, so with duplicate active placements the venue's share could differ
between two replays of the same event. The query now
`.order("created_at", { ascending: true })` and the fill skips a slug already
present (first-wins). Test: two active placements for one artist+venue at 20% and
40%, earliest first, and the order books at 20% with the first placement_id. Probe
(remove the skip) → 40 wins, 1 test fails.

**The unique index is BLOCKED and is an owner decision.** §D9 pairs the bounds with a
partial unique index on active placements and flags "UNCONFIRMED: whether work_title
is the right third key given multi-work placements". Resolved **against** it:

- 4 (artist_slug, venue_slug) pairs have multiple active placements.
- `the-mayfield` has **two** active placements with the **same** work_title
  ("Vietnamese Village"); `testing-venue` has **18** active rows across only 4
  titles.

So `(artist_slug, venue_slug, COALESCE(work_title,''))` is not unique in the live
data and the index cannot be created without retiring duplicates first. That is a
data decision (which of 18 near-identical active placements to keep, flag not
delete), so it is the owner's, not the loop's. The determinism fix removes the
*symptom* (non-deterministic rate) without the index, which is exactly what the plan
says to do "regardless". Added to owner decisions.

**Migration numbering, wrong again.** Plan says `077` (in `02`'s range); `04` is
080-089, 080-085 taken, so **086**. (Tally: 076→E9/082, 078→E7c/083, 074→D1/084,
075→D5/085, 077→D9/086.)

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  162 passed (162)
Tests  1757 passed (1757)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

migration-numbering gate: 4 passed. SELECT-leak assertion: 0 rows.

**Still open in `04`:** T5 (D10, D11), T7 (D12-D15), T8 refunds (D16-D18), T9 (N1,
N2), and the C-series payout helpers (C1 canReceivePayout, C3 recordBlockedLeg, C4
retry sweep).

**New owner decision:** retire the duplicate active placements (4 artist+venue
pairs, up to 18 rows at testing-venue) so the D9 active-uniqueness index can be
added. All are fin-coles at test venues (april-venue, testing-venue, the-mayfield,
the-venue-test), so they look like test data, but which to keep is a call for the
owner. Until then the webhook determinism fix holds the line.

---

## `04` T5 / D10 — client-asserted venueSlug diverted artist revenue (owner: `04` §B5)

Commit `6ab6338`.

**The finding.** `api/checkout/route.ts` took `venueSlug` from the request body. A
real slug for a venue where the artist holds an active placement moves the venue's
revenue share out of the artist's net (E9's `buildArtistLegs` reads
`placementByArtistSlug`, keyed off that venueSlug), so a venue operator could divert
an artist's money on a sale that never came through their QR.

**What changed (6 files).** The QR redirect resolves the venue server-side, so it
now mints an HMAC token binding the venue to the scanned artist, and checkout
verifies it instead of trusting a slug:
- `src/lib/qr-attribution-token.ts` (new): `signQrAttribution` / `verifyQrAttribution`,
  reusing `ORDER_TOKEN_SECRET`, mirroring `order-tracking-token.ts`.
- `api/qr/[slug]/route.ts`: mints the token into the redirect as `va` (best-effort;
  a missing secret does not break the redirect).
- `lib/validations.ts`: `venueAttributionToken` on the checkout schema.
- `api/checkout/route.ts`: verify the token, honour the venue only when the claim's
  artist is in the cart.
- `lib/qr-context.ts` + `browse/[slug]/ArtistProfileClient.tsx` +
  `checkout/page.tsx`: thread the token through the existing localStorage bridge.

**Behaviour preserved by default; the flip is the owner's.** The bare venueSlug is
still accepted as a fallback for QR codes printed before the token existed, UNLESS
`QR_ATTRIBUTION_ENFORCE=1`. That is the one-release transition the plan specifies,
so this commit regresses nothing. **The hole is actually closed by turning
enforcement on**, once old codes age out, which is an owner decision (like the
GATING_V1 flip). Recorded under owner decisions.

**Tests.** `qr-attribution-token.test.ts` (6: round-trip, tamper, wrong secret,
expiry, malformed, unset secret). 6 checkout cases: valid in-cart token honoured,
out-of-cart token ignored, forged token ignored, bare-slug fallback with
enforcement off, bare-slug dropped with enforcement on, token beats a mismatched
bare slug. Probe (trust the raw slug) fails 3.

**Not verified here, recorded as owner actions.** The browser QR-scan ->
localStorage -> checkout flow cannot be exercised end to end in this environment
(no QR E2E), and the enforcement flip that closes the hole is the owner's. The
server logic and the token are unit-tested; the frontend threading is additive
(new optional field carried through the existing bridge) and typechecks.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  163 passed (163)
Tests  1769 passed (1769)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**New owner decisions.**
1. **Enable QR attribution enforcement in this ORDER, never as a single flip (D39):**
   1. Set `ORDER_TOKEN_SECRET` (min 32 chars) as a server env var. It signs both
      the order-tracking and the QR venue-attribution tokens.
   2. Confirm a `va=` parameter actually appears on a real QR redirect
      (`GET /api/qr/<artist>?vs=<venue>` → the `Location` header should carry
      `va=...`). No `va=` means signing is failing (secret unset or wrong), and
      enabling enforcement would then reject every attribution.
   3. Only THEN set `QR_ATTRIBUTION_ENFORCE=1`, once QR codes printed before D10
      have aged past usefulness.

   Flipping step 3 before step 1 used to set `venueSlug=""` on every sale,
   silently zeroing every venue's revenue share on the order row, the placement
   lookup and the venue transfer. Checkout now **fails closed (503)** in that
   state (D39, `src/app/api/checkout/route.ts`), so the misconfiguration is loud
   instead of silent, but the ordered sequence above is still the correct
   operational procedure. This is the only thing that fully closes D10.
2. E2E-verify the QR-scan -> browse -> checkout attribution once in a browser env,
   since the localStorage threading was not exercised here.

**Still open in T5:** D11 (non-active placements silently pay the venue nothing;
log the miss so it is observable).

---

## `04` T5 / D11 — a QR sale with no active placement was silent (owner: `04` §B5)

Commit `ff01100`. **T5 (B5) is complete** (D10 `6ab6338`, D11 `ff01100`).

**The finding.** The venue-attributed branch filters `status = 'active'`. A
placement in pending, paused or completed yields `pct = 0` with no log, so the venue
saw a sale and no revenue and nobody could tell why.

**What changed.** After the map fill, iterate the cart's unique artist slugs and
`console.warn("[webhook] QR sale with no active placement", { orderId, venueSlug,
artistSlug })` for any slug with no active placement at the attributed venue. Purely
observability; the revenue maths is unchanged. Note this only runs when `venueSlug`
is set (a venue-attributed sale), so a plain direct sale with no venue does not warn.

**Tests.** 2 cases: warns when the artist has no active placement at the venue, does
NOT warn when they do. Probe (remove the log) fails the first, 1 of 79.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  163 passed (163)
Tests  1771 passed (1771)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**`04` status.** Done: Phase 0 (Bug 15, curation, G-C/Bug 10), B0 (D1-D3), T1 (D4-D6),
T2 (E9), T3 (E6/E10 + D7), T4 (D8, D9), T5 (D10, D11), T6 (E7a-E7d, E8, E11, E11b).
Remaining: T7 (D12-D15, artist subscription), T8 refunds (D16-D18), T9 (N1, N2),
and the C-series payout helpers (C1 canReceivePayout, C3 recordBlockedLeg, C4 retry
sweep) where the earlier tasks used simpler primitives.

---

## `04` T7 / D12 — an unknown price id silently downgraded the artist (owner: `04` §B7)

Commit `62f8fed`.

**The finding.** The subscription branch did `let plan = "core"` then bumped up on a
price match. So an unset or mistyped `STRIPE_PRICE_PRO` wrote every Pro artist's
profile as `core`, and `platformFeePercentForArtist` then charged 15% instead of 5%
on every sale, silently and ongoing.

**What changed.** A `PRICE_TO_PLAN` map built from the six `STRIPE_PRICE_*` envs
(empty entries filtered out). An unrecognised price returns
`{ received, ignored: "unknown_price" }` and stamps nothing, so a misconfigured env
**fails closed** (no write) rather than mis-charging. This also correctly ignores
paid-loan and curation subscriptions, whose prices are dynamic `price_data` rather
than a `STRIPE_PRICE_*` id, leaving them to their own handlers (a partial overlap
with D15's kind-scoping, which is still its own task for the recognised-price case).

**Tests.** 3 D12 cases: recognised Pro price → `pro`; unknown price → ignored, no
`artist_profiles` write; a paid-loan dynamic price → ignored. The 4 E11b
subscription-period tests were reshaped to carry a recognised price (the branch now
needs one) and vary only the period; the old no-items shape is an ignored event
under D12 and its null-period behaviour is already covered by
`stripe-subscription-period.test.ts`. Probe (restore guess-to-core) fails 2.

**Correction + done (`222eb60`).** I first recorded that `src/env.ts` does not
exist and left the plan's requested startup assertion undone. That was wrong:
`src/env.ts` and `env.test.ts` both exist. `assertStripePricesConfigured()` (throws
in production if any of the six `STRIPE_PRICE_*` envs is unset, no-op elsewhere) and
`missingStripePriceEnvs()` were added there with 4 tests, and the webhook's
`unknown_price` log now carries the missing-envs list so the misconfiguration is
diagnosable at the point it bites. Wiring the assertion into a fatal boot hook is
left out deliberately: Next has no clean per-route boot, and the D12 code already
fails closed, so a throw-at-module-load would be riskier than the fail-closed +
loud-log it now has. Available for a deploy healthcheck.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  163 passed (163)
Tests  1774 passed (1774)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Still open in T7:** D13 (the subscription.deleted stale-guard early-return skips
the paid-loan handler), D14 (referral credit read-modify-write; NOTE its snippet
reads the phantom `free_until` column, so it needs adapting to the live schema),
D15 (scope the subscription handler by metadata.kind).

---

## `04` T7 / D13 — a stale SaaS subscription.deleted skipped the paid-loan cancel (owner: `04` §B7)

Commit `9922c98`.

**The finding.** The SaaS `customer.subscription.deleted` block returned early on
`isStale` (the upgrade-race guard). That `return` exited the whole handler, so the
paid-loan `customer.subscription.deleted` block below it never ran. An artist
upgrading their plan (a stale SaaS deletion) could leave a paid-loan billing row
stuck `active` after Stripe cancelled the subscription.

**What changed.** The `isStale` check now guards only the SaaS-specific work (the
profile status write + the cancellation email) with `if (!isStale) { ... }` instead
of an early `return`, so execution falls through to the paid-loan handler. The
paid-loan handler already no-ops for a subscription it does not own.

**Deliberately minimal.** §D13 also asks to consolidate the two
`customer.subscription.deleted`, two `invoice.payment_failed` and two `invoice.paid`
blocks into one branch each ("duplicated event.type checks... is how D13 happened").
That is a maintainability refactor across ~6 blocks, not the bug, and it would make
this change hard to review. Left for a dedicated pass; recorded here so it is not
lost. **New owner/cleanup item: consolidate the duplicated `event.type` blocks in
the webhook.**

**Tests.** 2 cases: the paid-loan handler runs even when the SaaS deletion is stale,
and on a non-stale deletion. A hoisted `handleSubDeletedMock` makes the paid-loan
call assertable. Probe (restore the early return) fails the stale case, 1 of 84.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  163 passed (163)
Tests  1780 passed (1780)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Still open in T7:** D14 (referral credit read-modify-write; its snippet reads the
phantom `free_until` column and needs adapting to the live schema), D15 (scope the
subscription handler by metadata.kind).

---

## `04` T7 / D14 — BLOCKED on a product decision (owner: `04` §B7)

**Not implemented. The finding's premise is false against prod.**

§D14 says the referral credit is a read-modify-write race and gives an atomic fix
plus migration `079_extend_free_until.sql` operating on `free_until`. But:

- **`free_until` is not a column** in the live `artist_profiles` (columns present:
  `referral_code`, `referred_by_code`, `referral_credited_at`, `trial_end`, ... but
  no `free_until`). The referral block's `.select("id, free_until")` on the referrer
  is therefore rejected by PostgREST, `referrer` comes back null, the
  `if (referrer)` branch never runs, and the credit is silently inert. The
  subsequent `.update({ free_until })` would be rejected too.
- **The race can never fire.** It is a read-modify-write in code that has never
  executed, because the target column does not exist.
- **There is no data either.** `referred_by_code` set on **0** profiles,
  `referral_credited_at` set on **0**. 7 profiles have a `referral_code`, but nobody
  has ever been referred and no credit has ever been applied.

So the doc's atomicity fix would polish dead code, and its `extend_free_until` RPC
targets a column that isn't there.

**Why this is an owner decision, not a guess.** Making the feature actually work
needs a home for the referral bonus:
- `free_until` was removed (D17.1 territory: the fee-free window moved to
  `trial_end`).
- `trial_end` is written by the subscription webhook from Stripe's own trial, so a
  referral extension stamped there would be clobbered the next time the referrer's
  subscription updates. Not a safe target.
- A new column (e.g. `referral_free_until`) plus a change to
  `platformFeePercentForArtist` to honour it is a schema + commercial-model change.

Which of these is a product call about the referral programme, so per "escalate,
don't guess" it is recorded here rather than guessed. **No code shipped for D14.**

**New owner decision.** Decide where a referral bonus lives (new column vs. reuse),
then the atomic-credit implementation (conditional update on `referral_credited_at`
as the guard, RPC increment on the chosen column) is straightforward. Until then the
referral-credit block is inert and harmless (it writes nothing, because the phantom
select fails).

Proceeding to D15 in the same iteration per the loop's "record the blocker and move
to the next unblocked task".

---

## `04` T7 / D15 — SaaS subscription handler was not scoped by kind (owner: `04` §B7)

Commit `0d08a01`. **T7 (B7) is code-complete bar D14** (D12 `62f8fed` + env
`222eb60`, D13 `9922c98`, D15 `0d08a01`; D14 blocked on a product decision above).

**The finding.** The `customer.subscription.created|updated` branch writes
`artist_profiles` by `stripe_customer_id` and matched *every* subscription,
including paid-loan and managed-curation ones. A near-miss today (those flows create
fresh customers rather than reusing an artist's customer id), one refactor from
stamping a plan onto the wrong profile.

**What changed.** The branch returns `{ received, ignored: "not_saas_subscription" }`
when `metadata.kind`/`source` is `paid_loan_monthly`, `wallplace_paid_loan_billing`
or `curation_request`. This is independent of the price, so it also covers a curation
tier priced via a `STRIPE_PRICE_*` id, which D12's unknown-price guard would not
catch (they compose: D12 catches paid-loan's *dynamic* price; D15 catches by kind
regardless of price).

**Tests.** 4 cases: ignore paid-loan (even with a known SaaS price), ignore
curation, ignore the `wallplace_paid_loan_billing` source label, still process a
genuine no-kind SaaS subscription. Probe (remove the guard) fails 3.

**Full gate.**

```
✖ 175 problems (0 errors, 175 warnings)
Test Files  163 passed (163)
Tests  1784 passed (1784)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**`04` status.** Done: Phase 0, B0 (D1-D3), T1 (D4-D6), T2 (E9), T3 (E6/E10 + D7),
T4 (D8, D9), T5 (D10, D11), T6 (E7a-E7d, E8, E11, E11b), T7 (D12, D13, D15; D14
blocked). Remaining: T8 refunds (D16-D18), T9 (N1, N2), and the C-series payout
helpers (C1 canReceivePayout, C3 recordBlockedLeg, C4 retry sweep).

---

## `04` T8 / D16 — partial reversal used the wrong denominator (owner: `04` §B8)

Commit `2fdc567`. First of the three T8 refund findings (D17 restock, D18 curation
still to do).

**The finding (confirmed against prod).** `refunds/process/route.ts` pro-rated a
partial transfer reversal against `order.total`:
`round(amount_cents * refundCents / round(order.total*100))`. But shipping is not
shared revenue: the artist keeps 100% of it and pays the courier from it. Verified
in prod: `orders` money columns are real (`subtotal`, `shipping_cost`, `total`,
`artist_revenue` all numeric), `total = subtotal + shipping_cost`, and
`artist_revenue = 0.85*subtotal + shipping` (e.g. `WS-tHkhJLuA`: 29.99*0.85 + 3.50 =
28.99). So reversing against total clawed back a slice of shipping the artist had
already spent.

**What changed.**
- Partial reversal now pro-rates against `subtotal` (the artwork base), and reverses
  the shipping portion of a shipping-inclusive refund against the **artist leg
  only** (`recipient_type === "artist"`; `stripe_transfers.recipient_type` is a real
  text column, values exactly `"artist" | "venue"`, confirmed via `scheduleTransfer`
  in `lib/stripe-connect.ts`).
- Added a process-time guard: `refundAmountCents > round(order.total*100)` → 400,
  releasing the claim back to `pending`. The request route enforces this at
  submission, but the total can be re-read between request and process.

**Files.** `src/app/api/refunds/process/route.ts` (guard + subtotal-based
`reverseAmount`), `src/app/api/refunds/process/route.test.ts` (+2 tests). The doc
named `tests/transactions/t8-refunds.test.ts`; the repo convention is co-located
`route.test.ts`, so the tests went there (doc path stale — noted).

**Test (fails before, passes after — verified both directions).**
- D16 regression: partial £90 refund on subtotal £180 / shipping £14.50, artist leg
  13150 → reversal asserted `=== 6575` (`round(13150 * 9000/18000)`). Before the fix
  it produced 6085 (`13150 * (9000/19450)`). Probe output pasted below.
- D16 guard: £60 refund on a £50 order → 400, no Stripe calls, claim released.

```
# pre-fix (probe): both new tests fail
- 6575  +6085          (reversal used total denominator)
- 400   +200           (no over-total guard)
# post-fix: whole file green
✓ src/app/api/refunds/process/route.test.ts (12 tests)
# full gate
Test Files  163 passed (163)
Tests  1786 passed (1786)
✖ 175 problems (0 errors, 175 warnings)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Payment-drive limitation (stated, not hidden).** No live Stripe test drive is
possible here (no test key / webhook secret, as every prior payment iteration).
`stripe_transfers` is **empty in prod** (Connect not live), so this path is dormant
and no externally-visible behaviour changes today. The penny-level split is asserted
via the mocked `createReversal` call args (6575), which is the strongest check
available without Connect.

**What the plan got slightly wrong (recorded for the owner, not guessed around).**
The doc's `ship` term is provably inert under the *current single-recipient money
model*: `base = amount_cents * artworkRefundPence/subtotalPence` reaches the whole
leg exactly when `shippingRefundPence > 0` (both require `refund >= subtotal`), so
`min(amount_cents, base + ship)` always clamps `ship` away. Kept verbatim anyway
because (a) it matches the doc's named regression to the penny, (b) it documents the
shipping intent, and (c) a *perfectly* correct multi-artist decomposition would need
each leg's shipping share stored on `stripe_transfers` (only `amount_cents` is
stored today) — that's a schema/money-model decision, and moot until Connect is live
with real transfer rows. Flagging it here rather than silently shipping an alternate
formula that contradicts the doc's own test.

**`04` status.** Done: Phase 0, B0 (D1-D3), T1 (D4-D6), T2 (E9), T3 (E6/E10 + D7),
T4 (D8, D9), T5 (D10, D11), T6 (E7a-E7d, E8, E11, E11b), T7 (D12, D13, D15; D14
blocked), **T8/D16**. Remaining: T8 D17 (restock on full refund), T8 D18 (curation
refund path — deferred to B10), T9 (N1, N2), C-series payout helpers (C1, C3, C4).

---

## `04` T8 / D17 — full refunds never restocked (owner: `04` §B8)

Commit `e417cbd`, migration `087_restock_work` (applied to prod, registered in
schema_migrations). Second of the three T8 findings (D18 curation refund path is
deferred to B10 by the doc itself).

**The finding, and what the doc got wrong.** `refunds/process/route.ts` never
touched `artist_works`, so a refunded piece stayed sold forever. The doc's fix
looped `order.items` keyed on `item.workId || item.id` — but prod order items
**never carried a work id**: verified `0 of 66` items have `workId`/`id`/
`work_id`/`workSlug`; the keys present are display-only (`title, image, size,
price, qty, quantity, artistName, artistSlug, lineTotal`). So the doc's snippet
would have restocked nothing (another inert phantom-field fix, same class as
`free_until`). The webhook decrements from **cart items** (which have `workId`,
route.ts:917) and offer metadata (`offer_work_ids`, route.ts:178), then persists
an *enriched* items shape (route.ts:975) that dropped the id.

**What changed (the complete, non-inert fix).**
1. `restock_work(p_work_id text, p_qty integer)` — migration 087, the mirror of
   `decrement_work_stock` (085): `quantity_available = GREATEST(0, coalesce)+
   GREATEST(0,p_qty)`, `available` flips back to true when the count goes > 0.
   SECURITY DEFINER, `REVOKE ... FROM anon, authenticated, PUBLIC`.
2. Webhook now persists `workId` on each enriched cart item (route.ts ~965) and
   `OrderEmailItem` gained an optional `workId` — so future cart orders can be
   restocked. Offer orders already persist a `work_ids` array (route.ts:197).
3. Refund route: for **full refunds only**, a loop that restocks both shapes
   (`workId`+quantity per cart line; each id in `work_ids` at qty 1 for offers).
   Best-effort: a failing rpc is logged, never fatal (money already moved).

**Files.** `supabase/migrations/087_restock_work.sql` (new),
`src/lib/orders/confirmations.ts` (`OrderEmailItem.workId?`),
`src/app/api/webhooks/stripe/route.ts` (persist workId),
`src/app/api/refunds/process/route.ts` (restock loop),
`src/app/api/refunds/process/route.test.ts` (+3 tests, `rpcMock`).

**Tests (fail before, pass after — both directions via a probe).** Full refund
restocks each cart-line work once `[w1:1, w2:2]`; full refund restocks each id in
an offer `work_ids` array `[w1:1, w2:1]`; partial refund does **not** restock.
Probe (route `if (isFullRefund)` → `if (false)`): the two positive tests fail
(`expected [] to have length 2`), the negative test stays green.

**Migration / DB verification (evidence).**
```
apply_migration 087_restock_work -> {"success": true}
# SECURITY DEFINER leak surface (the advisor does NOT catch this):
restock_work:          anon_can_exec=false authd_can_exec=false service_can_exec=true
decrement_work_stock:  anon_can_exec=false authd_can_exec=false service_can_exec=true
restock_acl = "postgres=X/postgres service_role=X/postgres"
# increment probe on a real row, rolled back:
PROBE before=8/avail=t -> after=11/avail=t ; re-read after rollback = 8 (untouched)
restock_work('missing-id', 5) -> NULL   # safe no-op on unknown work
# plan's SELECT-policy leak assertion:
authenticated_select_leaks = 0
```

**Full gate.**
```
Test Files  163 passed (163)
Tests  1789 passed (1789)
✖ 175 problems (0 errors, 175 warnings)
PASS: 13 public route(s) and 21 demo-exempt route(s) all resolve, with reasons.
```

**Limitations stated.** `npm run audit:advisors` needs `SUPABASE_ACCESS_TOKEN`
(unset here — existing owner item); used the Supabase MCP `get_advisors(security)`
instead, which showed only the pre-existing baseline (service-role-only
`rls_enabled_no_policy` INFOs, intentional public-insert `rls_policy_always_true`
WARNs, the auth leaked-password WARN) with **no new finding** from this change. No
live Stripe drive possible; restock is asserted via the mocked `restock_work`
rpc calls. Dormant in prod today (refunds/Connect not live, `stripe_transfers`
empty), so no externally-visible behaviour change now.

**Legacy gap (recorded, not fixed).** The 66 existing order items have no work
id, so a refund on any *pre-D17* cart order still cannot restock. Backfilling
would need to resolve each historical item back to a work (no stored linkage
beyond the image path), which is not reliable; and it is moot until refunds go
live. Left as-is; new cart orders carry the id from now on.

**`04` status.** Done: Phase 0, B0 (D1-D3), T1 (D4-D6), T2 (E9), T3 (E6/E10 +
D7), T4 (D8, D9), T5 (D10, D11), T6 (E7a-E7d, E8, E11, E11b), T7 (D12, D13, D15;
D14 blocked), T8 **D16 + D17** (D18 curation-refund deferred to B10 by the doc).
Remaining: T8 D18 (B10), T9 (N1, N2), C-series payout helpers (C1, C3, C4).

---

## `04` C1 — canReceivePayout gates on payouts_enabled (owner: `04` §C1)

Commit `6d5c197`, migration `088_payouts_enabled_columns` (applied + registered).
Phase 1 shared primitive. Picked per the corrected dependency order (Phase 1
precedes T9/curation).

**What changed.** New `src/lib/payouts/capability.ts` (`canReceivePayout`,
`decide`, `payoutBlockMessage`) answers "can we pay this person now, and why not"
for artists AND venues, gating on `payouts_enabled` (charges_enabled is not
enough: an account can accept charges while payouts are held mid-KYC). 60s cache
on the profile, fails closed. Superseded `lib/stripe-connect-status.ts`
(charges-only, artist-only, bare boolean) — **deleted in the same commit** with
all THREE callers migrated (doc named only one): cart checkout (`checkout`),
offer checkout (`offers/[id]/checkout`), placement payment setup
(`placements/[id]/payment/setup`). Webhook `account.updated` now warms the cache
(charges/payouts/checked_at).

**Migration 088** (04 range; doc drafted it as 084, taken): +`stripe_payouts_enabled`
on artist_profiles; +`stripe_charges_enabled`,`stripe_payouts_enabled`,
`stripe_charges_checked_at` on venue_profiles. All 6 verified present in prod
after apply.

**Tests.** New `capability.test.ts` (8): no_account (null + empty-string), fresh
ok, fresh payouts_disabled (the reason C1 exists), stale re-check → payouts_disabled,
charges_disabled, stripe throw → fail closed, venue target hits venue_profiles.
3 caller test files re-mocked `@/lib/payouts/capability`. Old
`stripe-connect-status.test.ts` deleted (coverage ported).

**Gate.** `Test Files 163 passed (163)`, `Tests 1794 passed (1794)`,
`176 problems (0 errors, 176 warnings)`, allowlist PASS, `pg_policies` SELECT-leak
assertion = 0. No live Stripe drive possible (dormant; Connect not live).

**Satisfies D29.2 / CC6 unknowingly-then-knowingly.** The doc's D29.2 rule
"test emptiness not nullness for stripe_connect_account_id" is met: `accountId =
profile?.stripe_connect_account_id || null` treats `''` as no_account, and there
is an explicit `''` test. Verified prod: 13 of 14 artists have empty/null connect
id; only fin-coles has a real `acct_`.

---

## ‼️ DISCOVERY — unauthored supervisor-queue additions in the BINDING doc, bundled into 6d5c197

While staging C1, `git add -A` swept **uncommitted, working-tree-only** additions
to `2026-07-11-EXECUTION-DECISIONS.md` into commit `6d5c197`. **I did not author
them.** They are new supervisor entries (D29, D37–D40) plus a "SUPERVISOR QUEUE"
of rows 13–16, in the same forensic/prod-evidence style as the existing D16–D20
supervisor checks. They appeared mid-session (session start was clean).

**Provenance check: the prod claims are all TRUE**, so the content is credible,
not an injection:
- D29.2: 13 of 14 artists have empty/null `stripe_connect_account_id` — verified.
- Row 13: `artist_profiles` has `anon:SELECT` + `authenticated:SELECT` table
  grants, RLS on, policy `artist_profiles_select` = `roles=public qual=true`, so
  **anon can read postcode, stripe_customer_id, stripe_connect_account_id,
  stripe_subscription_id on every artist** — a real live PII/financial exposure.

**Why this needs the human, not a guess.** The queue says "rows 13 and 14 are
live prod exposures and outrank the remaining 04 correctness work; take them
next." That (a) reorders the plan I was given, and (b) directs **prod grant
revokes** (row 13 mig 076, row 14 mig 075) and a live payment-split fix (row 16,
`platformFeePercentForArtist` vs `subscription_status`). Prod security/payment
changes arriving via a mid-session unauthored doc edit are exactly the
escalate-don't-guess case. C1 stands (done + green); pausing to confirm the pivot
before executing the queue. Also flagging that 6d5c197 mixed these doc edits with
C1 code — not my intent, `git add -A` did it.

**RESOLUTION (user, via chat this session).** User chose "Work the security queue
next." The pivot is authorised: the loop now works the supervisor queue (rows
13–16) ahead of the remaining 04 C-series. **Next task = row 13 (D38, doc `02`):**
revoke anon/authenticated `SELECT` on `artist_profiles.postcode`,
`stripe_customer_id`, `stripe_connect_account_id`, `stripe_subscription_id` —
migration in `02`'s free range (074-079; 074 taken → 075/076 free), copying
`071`'s DO-block pattern (a bare column REVOKE is a silent no-op while a table
grant exists). Exclude `lat`/`lng` (still read via `select("*")` until
`getAllDatabaseArtists` is narrowed). Update ADR 0004 (currently argues against
this). This is a live anon PII/Stripe-ID exposure, verified in prod this session.
Then rows 14 (revoke EXECUTE on `increment_placement_revenue`) and 16
(`platformFeePercentForArtist` must respect `subscription_status`).

---

## Supervisor-queue row 13 / D38 — anon+authenticated PII leak on artist_profiles CLOSED

Owner-authorised pivot (this session). Two commits:
- `dc13688` — anon half: migration `076`, `getAllDatabaseArtists` repointed to
  service-role, ADR 0004 amended.
- `93f2047` — authenticated half: migration `077`, ADR updated.

**The finding (verified live).** `artist_profiles` had a `USING(true)` public
SELECT policy plus table-level SELECT grants to `anon` and `authenticated`, so any
holder of the anon key (or any logged-in user) could read every artist's
`postcode`, `stripe_customer_id`, `stripe_connect_account_id`,
`stripe_subscription_id` straight off PostgREST. `has_column_privilege` for all
four returned `true` for both roles beforehand.

**What changed.**
- `getAllDatabaseArtists` (the marketplace listing, and the LAST anon-client
  `SELECT *` on the table, both the primary and the review_status-fallback call)
  now reads via the service-role client. Server-side only, same rows (keeps the
  explicit `review_status='approved'` filter), so the marketplace is unchanged and
  is now immune to the column revokes. The unused anon `supabase` import was
  removed.
- Migrations 076 (anon) + 077 (authenticated): revoke the table SELECT, re-grant
  column SELECT on all columns EXCEPT the four (071's DO-block exclusion pattern).
  `lat`/`lng` kept granted (public map coords); `service_role` untouched.
- ADR 0004 amended: the "artist_profiles not restricted" scope note is marked
  superseded, with a dated amendment recording 076/077 and the reasoning.

**Safety sweep (why no breakage).** The only browser-client (`@/lib/supabase`)
reads of artist_profiles are `AuthContext` (`subscription_status`,
`subscription_plan`) and `stats/public` (`id`) — none touch the four columns. No
server-side user-JWT (authenticated-role) client reads the table (`api-auth`'s
token client only calls `auth.getUser`; grep for `createClient`+artist_profiles is
empty). The artist portal + `useCurrentArtist` load via `/api/artist-profile`
(service-role).

**Verification (fail-before / pass-after, both roles).**
```
before: has_column_privilege(anon|authenticated, artist_profiles, <4 cols>, SELECT) = true (all)
after 076: anon    -> false for all 4; name/lat/lng/subscription_status stay true; table grant gone
after 077: authd   -> false for all 4; name/lat/subscription_status stay true; table grant gone
service_role: postcode SELECT still true (untouched)
# gate
Test Files 163 passed (163); Tests 1794 passed (1794); 176 problems (0 errors); allowlist PASS
# DB task
pg_policies SELECT-leak assertion = 0
get_advisors(security): baseline unchanged, no new finding (it does NOT catch grant leaks; the
  advisor never flagged this exposure at all, which is exactly why D12 says the grant assertion is the proof)
```

**Divergence from the doc, flagged for review (per "note what the plan got wrong").**
D44.4 suggested repointing `getAllDatabaseArtists` to an *explicit column list* on
the anon client (so it keeps running under the caller's role and respects RLS). I
instead repointed it to the *service-role* client. Both close the leak and keep
the marketplace working; I chose service-role because (a) it needs no ~45-column
enumeration that would silently drift as the transform gains columns, and (b) it
matches ADR 0004's own stated pattern ("the app's server routes read via the
service-role client"). Trade-off: the marketplace list now bypasses RLS row
policies (moot today: the policy is `qual=true` and the query keeps its explicit
`review_status` filter). If the supervisor/owner prefers the RLS-respecting
explicit-column mechanism for posture reasons, it is a self-contained swap in that
one function; say the word.

**Migration numbers.** 076 = row 13 anon (per D44.6). Authenticated needed a fresh
number since 076 was already applied → 077. 075 stays reserved for row 14.

**Limitation.** No anon-role `SELECT *` probe was run from here (the Supabase MCP
runs as service-role and rejects `select *`); the `has_column_privilege` assertion
is the ADR-0004-prescribed proof for this class. The e2e security-no-leaks spec
covers the separate API-redaction layer and can't run here (no anon creds).

**Next: row 14 (D37/E50, doc `02`, migration `075`)** — revoke PUBLIC/anon/
authenticated EXECUTE on `increment_placement_revenue`, grant `service_role`. Do
NOT churn the five trigger functions.

---

## Supervisor-queue row 14 / E50 / D37 — increment_placement_revenue locked to service_role

Commit `ecd5fc5`, migration `075` (applied + registered). Owner-authorised
security queue. Supervisor D49.5 confirmed this as next and reserved 075.

**The finding (verified live).** `increment_placement_revenue(text, numeric)` was
PUBLIC-executable and `SECURITY INVOKER`. Prod ACL before:
`=X anon=X authenticated=X service_role=X` (the leading `=X` is PUBLIC);
`has_function_privilege` = true for anon and authenticated. Because RLS on
`placements` allows an artist to update their own placement, any authenticated
artist could call it with any `p_amount` and inflate `revenue` / `delivery_count`
(venue-facing, feeds analytics). anon can't (no auth.uid()).

**What changed.** Migration 075: `revoke execute ... from public, anon,
authenticated; grant execute ... to service_role`. Mirrors decrement_work_stock
(085) / restock_work (087). Function body + SECURITY INVOKER unchanged (D37: grants
only). The five trigger functions with PUBLIC EXECUTE are left untouched (D37.3:
they take no args and error outside a trigger context).

**Caller check (D37.2).** The only code caller is `api/orders/route.ts:340`
(`db.rpc(...)` where `db = getSupabaseAdmin()`), i.e. service-role, so the revoke
is invisible to the app. No client-side caller exists.

**Verification (fail-before / pass-after).**
```
before: acl "=X anon=X authenticated=X service_role=X"; anon_exec=true, authd_exec=true
after:  acl "postgres=X/postgres service_role=X/postgres"; anon_exec=false, authd_exec=false, service_exec=true
gate: Test Files 163 passed (163); Tests 1794 passed (1794); allowlist PASS
pg_policies SELECT-leak assertion = 0
```
No code changed (migration only), so the test count is unchanged from row 13's run.
Proof is the has_function_privilege ACL assertion (same method as 085/087); there is
no unit harness for function grants.

**Follow-up recorded, not done (D37.4).** The periodic sweep should gain a
function-grant check: any non-trigger `public.*` function that mutates and is
executable by anon/authenticated/PUBLIC is a finding. That is a guard-script task
(the function analogue of the phantom-columns column guard), separate from this
revoke. Left as an owner/guard item.

**Next: row 16 (D40/E52, doc `04`).** `platformFeePercentForArtist` must return the
15% default unless `subscription_status` is `active`/`trialing` — today a cancelled
Pro artist keeps 5% for ever. Add `subscription_status` to `ArtistPlanState` AND to
all five callers' `.select()`, or PostgREST rejects the query whole (phantom-column
class).

---

## Supervisor-queue row 15 / D39 — QR enforcement no longer a loaded gun

Commit `c509771`. Owner-authorised security queue.

**The finding.** D10 added signed QR venue-attribution, gated by
`QR_ATTRIBUTION_ENFORCE`. But `ORDER_TOKEN_SECRET` (which signs those tokens) was
declared in no schema and validated nowhere, and setting
`QR_ATTRIBUTION_ENFORCE=1` without it was worse than the bug it closes: every
token throws in `verifyQrAttribution`, the bare-slug fallback is off, so
`venueSlug=""` on every sale, silently zeroing every venue's revenue share on the
order row, the placement lookup and the venue transfer.

**What changed.**
1. `src/env.ts`: added `ORDER_TOKEN_SECRET: z.string().min(32).optional()` to the
   server schema (D39.1). (Note: nothing calls `serverEnv()` today, so the schema
   is documentation-only until it is wired to boot — the real guard is the route
   check below. Flagged so the next reader knows.)
2. `src/app/api/checkout/route.ts`: fail closed and loud — when
   `QR_ATTRIBUTION_ENFORCE==="1"` and `ORDER_TOKEN_SECRET` is unset, `console.error`
   and return **503** before pricing anything, instead of proceeding with
   `venueSlug=""` (D39.2).
3. PROGRESS owner instruction (was a single "flip `QR_ATTRIBUTION_ENFORCE=1`")
   rewritten as the ordered sequence: set the secret -> confirm `va=` appears on a
   real QR redirect -> then flip (D39.3 item 4).

**Test (fails before, passes after — probe-verified).**
`checkout/route.test.ts` "503s and prices nothing when enforcement is on but
ORDER_TOKEN_SECRET is missing": asserts 503, no `saveCartSession`, no `stripe`
call. Probe (guard -> `if (false && ...)`) → the route returns **200 and prices
the sale**, so the test fails before and passes after. The existing D10 test
(enforcement on WITH the secret still prices the sale) is the does-not-over-trigger
case.

**Gate.** `Test Files 163 passed (163)`, `Tests 1795 passed (1795)`,
`176 problems (0 errors, 176 warnings)`, allowlist PASS.

**Divergence flagged.** D39.3 suggested a 500; I returned **503** (Service
Unavailable) — semantically apter for a missing-config state and distinct from a
generic crash. Both satisfy "fail closed and loud."

**Next: row 16 (D40/E52, doc `04`).** `platformFeePercentForArtist` must return the
15% default unless `subscription_status` is `active`/`trialing` (a cancelled Pro
artist keeps 5% for ever). Add `subscription_status` to `ArtistPlanState` AND to
all five callers' `.select()`, or PostgREST rejects the query whole (phantom-column
class). That is the last supervisor-queue row; after it, back to the 04 C-series
(C3, C4).

---

## Supervisor-queue row 16 / D40 / E52 — platformFeePercentForArtist respects subscription_status (LAST queue row)

Commit `d404864`. Owner-authorised security queue. **This completes the supervisor
queue (rows 13-16).**

**The finding (verified live).** `platformFeePercentForArtist` read
`subscription_plan` only. `customer.subscription.deleted` writes
`subscription_status='canceled'` but never resets `subscription_plan`, so a
cancelled Pro artist kept 5% for ever. Prod shapes confirm the exposure: one
`pro`/`none` profile (maya-chen-demo) and two `core`/`canceled` — all were getting
their plan rate instead of the 15% default. `subscription_status` is a real `text`
column. No artist has a future `trial_end`, so gating the trial 0% on status too
changed no current fee.

**What changed.**
- `platform-fee.ts`: `ArtistPlanState` gained `subscription_status`; the helper now
  returns the 15% default unless status is `active`/`trialing`, then applies the
  trial 0% / plan rate. Stripe leaves status `active` through `cancel_at_period_end`
  until the period ends, so this is paid-through-period-end with no proration.
- All FOUR fee-relevant `.select()`s now fetch `subscription_status`:
  `payouts/legs.ts` (the webhook sale path via buildArtistLegs),
  `paid-loan-billing.ts`, `offers/[id]/checkout`, `placements/[id]/payment/setup`.
  Omitting it hands the helper `undefined` and over-charges an active artist the
  default (the inverse of the `free_until` phantom-column failure). Types updated
  alongside each select; the offers comment (still referencing the long-removed
  `free_until`) was corrected.

**Design note.** Gated on the literal ruling: status must be `active`/`trialing`
for ANY discount, including the trial 0%. A cancelled artist with a lingering
future `trial_end` gets 15%, not 0% (there are none in prod). A legitimately
trialing artist has status `trialing`, so the 0% still applies.

**Tests (fail-before / pass-after, probe-verified).** New `platform-fee`
`subscription_status gate` block: cancelled Pro -> 15, status `none` -> 15, missing
status -> 15, cancelled-with-future-trial -> 15; probe (disable the gate) fails
those 4 (they return the old 5/8/0). Existing plan/trial tests updated to pass
`subscription_status: "active"`/`"trialing"`. Offers route: a cancelled artist's
split asserted to the penny (`495` fee + `2805` net = `3300`). `legs` + webhook E9
mock profiles set to `active`.

**Gate.** `Test Files 163 passed (163)`, `Tests 1801 passed (1801)`,
`176 problems (0 errors, 176 warnings)`, allowlist PASS.

**Payment-drive limitation.** No live Stripe drive here; the split is asserted
through the mocked webhook E9 ("splits to the penny") and offers-route paths, and
the fee values directly in the unit test.

---

## Supervisor queue COMPLETE (rows 13-16)

All four owner-authorised security-queue rows are done:
- 13 (D38): artist_profiles anon+authenticated PII/Stripe revoke (migrations 076/077).
- 14 (E50/D37): increment_placement_revenue locked to service_role (migration 075).
- 15 (D39): QR enforcement fails closed (503) + ORDER_TOKEN_SECRET in env schema.
- 16 (D40/E52): platformFeePercentForArtist respects subscription_status.

**Next:** return to the `04` C-series in Phase-1 dependency order — C3
(`recordBlockedLeg` + `scheduleTransfer` must throw) then C4 (retry sweep with
`retry_count`). Then the remaining T8 D18 (curation refund path, B10), T9 (N1/N2),
and any owner-decision items. D14 (referral credit) remains blocked on a product
decision.

---

## `04` C3 — ledger write must throw + recordBlockedLeg (owner: `04` §C3)

Commit `6dd4e40`, migration `089_stripe_transfers_payout_hardening` (applied +
registered). Phase-1 payout primitive; the supervisor queue (13-16) is done, so
back on the 04 C-series.

**What changed.**
- `scheduleTransfer` (was E37's silent-vanish): discarded the insert error and
  returned void, so a failed ledger insert looked scheduled. Now validates
  `connectAccountId` + `amountCents`, returns the row id, treats a
  `(order_id, recipient_user_id)` 23505 as an idempotent replay (returns the
  existing id), and throws on any other insert failure.
- New `recordBlockedLeg(db, {orderId, recipientUserId, amountCents, reason})`:
  writes an owed-but-unsendable payout as a `'blocked'` ledger row with
  `last_error`, so a lapsed Connect account surfaces in reconciliation. Wired into
  both webhook blocked-leg branches (cart + offer).
- Migration 089: `retry_count`/`last_error`/`next_attempt_at`/`updated_at`, a
  status CHECK (adds `'blocked'`), and the C4 retryable index.

**Files.** `supabase/migrations/089_stripe_transfers_payout_hardening.sql`,
`src/lib/stripe-connect.ts`, `src/lib/stripe-connect.test.ts`,
`src/app/api/webhooks/stripe/route.ts`.

**Tests (fail-before / pass-after).** scheduleTransfer: returns id, throws on
insert failure (probe: swallow → the throw test fails "resolved instead of
rejecting"), 23505 → existing id, input validation; recordBlockedLeg: blocked-row
shape, swallows 23505, throws otherwise. `Tests 1809 passed (1809)`, `0 lint
errors`, allowlist PASS, pg_policies leak = 0. 089 verified applied in prod
(4 cols + status CHECK with 6 values + retryable index). No live Stripe drive.

**What the plan got wrong / deliberately NOT done (flag for the owner/supervisor).**
1. **The doc's webhook "500 → Stripe retries the legs" is likely inert and I did
   not ship it.** C3 says the webhook catch should `return 500` so Stripe retries
   and re-runs the legs. But on retry the order row already exists, and D3's
   `classifyOrderIdConflict` returns `duplicate` → the handler **early-returns
   before reaching the leg-scheduling block**. So a 500 would not give the legs a
   second chance; it would just churn. The robust retry path is the **C4 sweep**
   (retries `pending`/`failed` rows), not webhook re-delivery. Left the webhook
   catches as log-and-continue; making scheduleTransfer throw already upgrades a
   silent loss to a logged one. **Deeper gap:** if the ledger INSERT itself fails,
   there is no row for the sweep to retry and (per the above) no webhook retry
   either — genuinely unrecoverable. Recommend the owner decide whether to schedule
   legs before the order insert, or make the retry re-enter the leg block. Not
   guessed here.
2. **`recordBlockedLeg` takes `amountCents`, not the doc's `netGbp`** — the ledger's
   native unit, avoiding a lossy pounds round-trip. Webhook legs carry `netPence`,
   passed straight through.
3. **Migration numbering:** 04's 080-089 range had only 089 free, so 089 carries
   C3's `last_error`/CHECK AND pre-provisions C4's `retry_count`/`next_attempt_at`.
   C4 is now code-only (no migration). Noted so C4 does not try to take a number
   outside 04's range.

**Next: C4 (04 §C4)** — the retry sweep. `processPendingTransfers` must select
`pending` AND retryable `failed` rows (by `next_attempt_at`), increment
`retry_count` with backoff on failure, stop at MAX_RETRIES, and `executeTransfer`
widened to accept `failed`. Columns already exist (089). Plus the exhausted-payout
admin surface.

---

## OWNER DECISION (chat, this session): adopt D52's order

Supervisor D52 flagged that C1's `canReceivePayout` was never adopted by the
webhook — all three payout gates (offer→artist, cart→venue, cart→artist) still use
the stale `stripe_connect_onboarding_complete` boolean C1 replaced. I escalated
(rule 4: reorders the plan + money path). **Owner chose "Adopt D52's order":**
1. NEXT: replace the 3 webhook payout gates with `canReceivePayout`, using
   `PayoutCapability.reason` to drive `recordBlockedLeg` (real reason instead of the
   single "onboarding_incomplete"). Completes C1 (the callers C1 left behind).
2. THEN C4 = retry sweep + orders-without-legs reconciliation (catches the "12
   orders, 0 transfers" blind spot) + duplicate-redelivery leg re-entry (D52.3).
All dormant (Connect not live). Authorised.

---

## D52.2 — webhook adopts canReceivePayout (completes C1)

Commit `3d6ee4e`. Owner-authorised (adopt D52's order) ahead of C4.

**The finding (supervisor D52, verified).** C1's `canReceivePayout` was referenced
in the webhook only in comments; all three live payout gates still keyed on
`stripe_connect_onboarding_complete` — the predicate C1 replaced because it can't
distinguish `payouts_enabled` from `charges_enabled`. So a lapsed account passed
the gate and the transfer landed in an unpayable balance. C1 shipped the
replacement and left the callers behind (a "new impl => old deleted" miss, one
commit late).

**What changed.** All three gates (offer→artist, cart→venue, cart→artist) call
`canReceivePayout` at transfer time and use `PayoutCapability.reason` to drive
`recordBlockedLeg` (no_account / charges_disabled / payouts_disabled), replacing
the single "onboarding_incomplete". `recordBlockedLeg` gained an optional
`recipientType` so a blocked VENUE payout is recorded too. The stale
`onboarding_complete` reads in these gates are gone.

**Files.** `src/lib/stripe-connect.ts` (recordBlockedLeg recipientType),
`src/app/api/webhooks/stripe/route.ts` (3 gates + import),
`src/app/api/webhooks/stripe/route.test.ts` (canReceivePayout mock + 2 reworked
blocked tests).

**Tests.** Webhook now mocks `canReceivePayout` (default payable, account id derived
`u-alice → acct_alice`; `blockedPayoutTargets` simulates a lapse). The two blocked
tests assert no transfer AND a recorded blocked leg with the real reason. Probe
(force the offer gate open) fails the blocked test ("expected spy not to be called,
called 1 time"), proving the gate is respected. `Tests 1809 passed (1809)`, `0 lint
errors`, allowlist PASS. Dormant (Connect not live).

**Follow-up (D52.2, not bundled).** `lib/email/welcome.ts:66,82` reads the same
`stripe_connect_onboarding_complete` for a `stripeConnected` welcome-email flag.
Cosmetic (not money). Supervisor said fix it after the gates, in its own commit.
Left as a small follow-up item.

**Next: C4** (owner-authorised expanded scope, D52.3): the retry sweep in
`processPendingTransfers` (select pending AND retryable failed by next_attempt_at,
backoff via retry_count, stop at MAX_RETRIES, widen executeTransfer to accept
failed, exhausted-payout admin alert), PLUS the orders-without-legs reconciliation
(catches the "12 orders, 0 transfers" blind spot) and the duplicate-redelivery
leg re-entry. Columns exist (089). Given the scale, C4 may span 2 iterations
(sweep first, then reconciliation + re-entry).

---

## `04` C4 (part 1) — retry sweep with backoff (owner: `04` §C4)

Commit `779c588`. Code-only (columns from migration 089). First half of the
owner-authorised C4; the D52.3 reconciliation + leg re-entry is part 2 (next).

**What changed.** `processPendingTransfers` was terminal-fail: it selected only
`status='pending'` and wrote `'failed'` on any throw, never looking again, so a
transient Stripe blip permanently killed a payout. Now it selects `pending` AND
retryable `failed` rows (`retry_count < 6`, `payout_after` elapsed), skips rows
whose `next_attempt_at` backoff has not elapsed, re-schedules a failed attempt
with exponential backoff `[1,4,15,60,240,960]` minutes (incrementing
`retry_count`, recording `last_error`/`next_attempt_at`), and at `MAX_RETRIES`
leaves the row `failed` and alerts an operator via `notifyAdminPayoutExhausted`
(email, modelled on `notifyAdminBillingStalled`). It also cancels a due transfer
whose order is cancelled/refunded. `executeTransfer` widened to accept a `failed`
row; the stable Stripe idempotency key keeps the retry from double-paying.

**Files.** `src/lib/stripe-connect.ts` (constants, `SweepResult`, sweep rewrite,
`alertExhaustedPayout`, executeTransfer widen), `src/lib/stripe-connect.test.ts`
(executeTransfer mock `.eq().in()`; 4 sweep tests), `src/lib/email.ts`
(`notifyAdminPayoutExhausted`). Return type is now `SweepResult` (superset of the
old `{processed}`; the process-pending route still typechecks).

**Tests (probe-verified).** Re-schedules a failed row (retry_count 2→3, backoff +
last_error set; probe: stop the increment → the test fails on retry_count); exhausts
at 6 and alerts; cancels a cancelled-order transfer; skips a row still in backoff.
`Tests 1812 passed (1812)`, `0 lint errors`, allowlist PASS. No live Stripe drive.

**Plan deviation, flagged.** The doc expressed the backoff as a PostgREST
`.or(next_attempt_at.is.null,next_attempt_at.lte.<now>)`. That trips the
`wallplace/no-raw-or-filter` lint rule, and `orFilter()` cannot pass an ISO
timestamp (its safe-charset excludes colons). Moved the backoff to a code-side
`continue` instead. Trade-off: the query can fetch up to 200 rows including
not-yet-due failed ones and skip them in code; acceptable at current (dormant)
volume, and the sweep re-runs on the cron. Noted for the owner.

**Next: C4 part 2 (D52.3).** (c) orders-without-legs reconciliation — select orders
with money owed and NO stripe_transfers row (the "12 orders, 0 transfers" blind
spot); (d) re-enter the leg block on a `duplicate` redelivery at the D3
short-circuit (`webhooks/stripe/route.ts`), safe via scheduleTransfer's 23505
idempotency. Then the D52.2 `lib/email/welcome.ts` cosmetic follow-up, then T8 D18
/ T9.

---

## `04` C4 (part 2c) — orders-without-legs reconciliation (D52.3)

Commit `c02fdfe`. Code-only. Owner-authorised (D52's order). Second of three
C4-part-2 pieces (leg re-entry still to do; welcome.ts cosmetic after).

**The finding (verified read-only in prod).** The retry sweep only re-tries
`stripe_transfers` rows that EXIST, so it cannot see the failure that produces
nothing: a ledger INSERT that threw, a webhook that never ran, or a duplicate
redelivery that early-returned. Prod: **11 orders owe an artist and have zero
transfer rows** (6 with a resolvable `artist_user_id`; 0 owe a venue; statuses
confirmed/delivered/processing).

**What changed.** New `reconcileOrdersWithoutLegs()` selects orders with
`artist_revenue > 0` in a paid status with no `stripe_transfers` row and records
the owed amount as a `'blocked'` ledger row (reason
`reconciliation:missing_ledger`). Blocked, not scheduled: it SURFACES the owed
money without auto-paying, so the manual Stripe reconciliation stays the human's
call (D11 covers the two unpaid offers). Idempotent via the unique index. Wired
into the process-pending cron next to the sweep.

**Files.** `src/lib/stripe-connect.ts` (reconcile fn + ReconcileResult),
`src/lib/stripe-connect.test.ts` (+3 tests),
`src/app/api/stripe-connect/process-pending/route.ts` (wire + response fields).

**Tests (probe-verified).** Flags an owed order (2899p for a 28.99 net); skips an
order that already has a ledger row (probe: drop the skip → it double-flags);
counts a null-artist order as unresolved. `Tests 1816 passed (1816)`, `0 lint
errors`, allowlist PASS.

**Not run against prod.** The reconciliation writes blocked legs to the payout
ledger for real orders; left to the cron / ops to trigger, per the payment-touching
+ D11 caution. Detection query was read-only.

**Scope notes.** Artist-only (0 venue owed in prod; venue would need
venue_slug→venue_profiles user-id resolution — follow-up if venue owed appears).
`OWED_ORDER_STATUSES` allowlist = confirmed/processing/shipped/delivered; a paid
order in another status is not reconciled (none in prod today).

**Next: C4 part 2d** — duplicate-redelivery leg re-entry: at the D3 duplicate
short-circuit in `webhooks/stripe/route.ts`, look up existing `stripe_transfers`
for the order and schedule any missing legs before returning (safe via
scheduleTransfer's 23505 idempotency). Then the D52.2 `lib/email/welcome.ts`
cosmetic follow-up. Then T8 D18 / T9.

---

## `04` C4 (part 2d) — duplicate-redelivery leg re-entry (D52.3). C4 COMPLETE.

Commit `b6e80cb`. Webhook money-path change, done via a clean extraction.

**The finding.** The D3 duplicate-order short-circuit returned `{duplicate}` before
reaching leg scheduling, so a Stripe redelivery of a session whose order already
exists (the F30 payment-intent check `:786`, and the 23505 order-id check `:807`)
never re-attempted the payouts. If the first delivery inserted the order then 500'd
before/around the legs, the retry saw the order, returned, and the legs were lost.

**What changed.** Extracted the ~90-line transfers block into a module-level
`scheduleOrderLegs(db, {orderId, legs, venueSlug, venueRevenue, isCollection})` and
call it from all THREE points: the normal path and both duplicate returns. All the
locals it needs are declared before the duplicate returns (orderId:573,
venueSlug:575, venueRevenue:582, legs:684, isCollection:729), verified by typecheck.
Safe because `scheduleTransfer` treats a `(order_id, recipient_user_id)` 23505 as an
idempotent replay (C3), so a redelivery only fills the legs the first pass missed
and never double-pays. No `_v2`: the block is one function now, not two copies.

**Files.** `src/app/api/webhooks/stripe/route.ts` (extract + 3 call sites +
ArtistLeg import), `src/app/api/webhooks/stripe/route.test.ts` (+1 test).

**Tests (probe-verified).** A duplicate redelivery (existingOrderId → F30 path) now
schedules both artist legs; probe (drop the F30 re-entry) → 0 legs, the blind spot.
The E9 tests verify the extracted helper is unchanged on the normal path.
`Tests 1817 passed (1817)`, `0 lint errors`, allowlist PASS. Dormant (Connect not
live), so no live Stripe drive.

**Feasibility note (the prompt asked me to escalate if too invasive).** It was NOT
too invasive: a clean extraction with 6 well-defined params, the same code called
from 3 places, verified by the existing E9 suite. So I did it rather than escalate.

## C-SERIES COMPLETE (C1, C3, C4); D52 order fully executed
- C1 canReceivePayout (`6d5c197`) + D52.2 webhook adoption (`3d6ee4e`).
- C3 scheduleTransfer throws + recordBlockedLeg + migration 089 (`6dd4e40`).
- C4: retry sweep (`779c588`), orders-without-legs reconciliation (`c02fdfe`),
  duplicate-redelivery leg re-entry (`b6e80cb`).
(C2 per-artist legs = E9, done earlier; C5 paid-loan webhook branches = earlier T6.)

**Next:** the small D52.2 `lib/email/welcome.ts` `stripeConnected` cosmetic
follow-up (own commit), then T8 D18 (curation refund, B10) and T9 (N1/N2). D14
blocked on a product decision.

---

## D52.2 follow-up — welcome.ts stripeConnected: assessed, NO change (correct as-is)

`lib/email/welcome.ts` derives `stripeConnected = !!profile.stripe_connect_onboarding_complete`
and uses it for one welcome-email CHECKLIST step: `{ label: "Connect Stripe to get
paid", done: stripeConnected }`.

**Decision: leave it on `stripe_connect_onboarding_complete`.** Unlike the three
webhook payout GATES (D52.2), which must know "can we send money now"
(payouts_enabled) at transfer time, this is an onboarding-checklist signal: "has the
artist finished connecting Stripe". `stripe_connect_onboarding_complete` is exactly
that. Swapping to `canReceivePayout` would be **wrong** here:
- Semantics: an artist who connected but is mid-KYC-review (payouts_enabled=false)
  has connected Stripe — the checklist step is done. `canReceivePayout` would flip
  it back to undone and read as "you haven't connected Stripe" when they have.
- Cost: `canReceivePayout` does a synchronous `stripe.accounts.retrieve` (60s cache)
  — an unnecessary Stripe round-trip on the welcome-email path for a cosmetic flag.

So this is the right predicate for the right job; the D52.2 gate swap does not
generalise here. The supervisor flagged it "cosmetic, fix after the gates" — the
assessment is that it needs no fix. **No code change.**

**Residual (pre-existing, not this task).** `stripe_connect_onboarding_complete` is
written only by `account.updated` (D32.1: may not be enabled), so the checklist can
show a false "not connected". The fix for that is the account.updated pipeline, not
a predicate swap here. Left as-is.

**Remaining 04 work.** Per the corrected dependency order: B10 curation (D19-D25:
managed tiers unbookable, orphan payment, subscription-id in the payment-intent
column, reconcile, etc.) at Phase 7; then T9 (N1/N2 collect-from-venue) at Phase 8,
which is net-new checkout FEATURE work — surface to the owner before building. D14
blocked on a product decision; the two unpaid offers are D11 manual.

---

## `04` B10 / D25 — managed curation tiers bookable (mostly already done; guard added)

Commit `1b6375c`. First curation finding.

**Verified live before acting (the doc flagged UNCONFIRMED drift).** The live
`curation_requests_tier_check` already permits all five tiers (`single_wall,
full_space, bespoke, managed_monthly, managed_quarterly`) — migration
`080_curation_managed_tiers.sql` widened it in an earlier iteration ("curation 7.0
at Phase 0"). So the managed tiers (79.99/mo, 199.99/qtr) are bookable; D25's "live
revenue outage" is NOT current. The regression guard the doc asks for also already
exists: `src/lib/curation-tiers.test.ts` asserts the migration's tier CHECK equals
`CURATION_TIER_KEYS` (5 tests, passing) and fails if code/schema tiers drift.

**What I added.** A `23514` (check_violation) branch in the curation insert error
path (`api/curation/route.ts`) so a tier/status the schema does not know about is
logged as a distinct schema-drift error rather than a silent generic 500 — the
runtime defence-in-depth the doc asked for. No route test harness exists and building
one for one log line is disproportionate; the drift itself is already CI-guarded by
curation-tiers.test.ts, so the 23514 path is verified by typecheck + inspection.

**Verification.** `Test Files 163 passed (163)`, `Tests 1817 passed (1817)`, `0 lint
errors`, allowlist PASS. Live tier CHECK = 5 tiers; live status CHECK =
`pending_payment,awaiting_quote,paid,in_progress,shortlist_sent,completed,cancelled,refunded`
(NO `past_due`/`paused`).

**What the plan got wrong / deferred.** The doc's migration `083` (tier+status) is
**redundant for the tier part** (080 did it). The **status** widen (add `past_due`,
`paused`) is real and still needed — but by **D21's** reconcile handlers, so it
ships with D21, not here. **04's migration range (080-089) is fully used**, so D21's
status migration needs a number resolution (escalate the range when D21 lands).
Doc D25 section annotated RESOLVED for the tier.

**Also noticed (not this task).** Two tier modules coexist: `curated-tiers.ts`
(`CURATED_TIER_KEYS`, marketing) and `curation-tiers.ts` (`CURATION_TIER_KEYS`, the
route's source of truth). Possible `_v1/_v2` duplication worth a cleanup pass, but
out of D25 scope.

**Next: D19** (orphan payment: the curation error path deletes a row whose Stripe
session is live, `api/curation/route.ts:196-233`).

## `04` B10 / D19 — never delete a curation row once its Stripe session is live

Commit `a92c94b`. Second curation finding.

**The defect (confirmed in source).** Both checkout branches in
`api/curation/route.ts` wrapped `stripe.checkout.sessions.create` AND the
follow-up `curation_requests.update({ stripe_checkout_session_id })` in one
`try` whose `catch` ran `db.from("curation_requests").delete().eq("id", row.id)`.
If the link update **threw** after the session was created (e.g. a transient
Postgres connection drop at the `await`), the row was deleted while a payable
Stripe session stayed live. Verified the attribution path: the webhook keys a
curation payment off `session.metadata.curation_request_id` and looks the row up
by `.eq("id", requestId)` (`webhooks/stripe/route.ts:116-131`), so a deleted row
means the buyer can pay and the webhook finds nothing → money taken with no
record, no confirmation email, no refund trail. Present in **both** the one-off
(one-time) and managed (subscription) branches.

**The fix.** Split each branch into two steps. `stripe.checkout.sessions.create`
sits in its own `try`; its `catch` deletes the pending row (safe — nothing is
payable yet) and 500s. Once a session exists the row is **retained**: the
`stripe_checkout_session_id` link update is wrapped so an `{ error }` return or a
throw is logged (`... session link failed/threw, row retained`) but never
deletes, and the buyer still gets the checkout URL. The webhook attributes the
payment via metadata regardless of whether the link write landed. The managed
branch's pre-session delete (missing `priceEnvVar`, 503) is unchanged — it fires
before any session exists, so it stays safe.

**Test added.** `src/app/api/curation/route.test.ts` (new; no curation route
harness existed). Five cases across both branches:
- one-off / managed, session-link update **throws** after create → status 200,
  checkout URL returned, `deletes` length 0 (the regression assertion).
- one-off, link update returns `{ error }` → 200, row retained.
- one-off / managed, `sessions.create` itself rejects → 500, row deleted
  (`["id","cr_1"]`) — the safe-cleanup path still works.
The throw case is the fail-before/pass-after pin: reintroducing the
delete-in-catch shape as a probe made *only* `one-off: ... session link update
throws` fail (`Tests 1 failed | 4 passed`); restoring the fix → all pass. The
`{ error }` and create-fail cases pass in both shapes by design (the old bare
`await update()` ignored an `{ error }` return; only a throw reached the catch),
so they are guards, not the regression.

**Verification.** `npm run check` → `EXIT=0`, `Test Files 164 passed (164)`,
`Tests 1822 passed (1822)`, 0 lint errors (only pre-existing warnings, none in
the curation files), allowlist PASS. No schema/RLS change, so advisor + the
`pg_policies` SELECT-leak assertion do not apply. A live Stripe test-mode drive
remains impossible in this environment (no test key / webhook secret); the mocked
route test exercising session-create + link-failure is the available proof.

**Plan note.** The doc cited the bug at `:196-233`; after the earlier `23514`
edit (D25) the one-off branch had shifted to `~:195-232`, and the doc did not
mention the **managed** branch carried the same shape (`~:159-191`) — fixed both.

**Next: D20** (a subscription id stored in `curation_requests.stripe_payment_intent_id`
is type-confused and breaks any refund keyed on it; D18 curation refund folds in).
Re-read `api/curation/route.ts` + `webhooks/stripe/route.ts:116-160` and verify the
live `curation_requests` columns first.

## `04` B10 / D20 — subscription id no longer masquerades as a payment intent

Commit `c2dcc8b`. Third curation finding (folds in the D18 storage half).

**The defect (confirmed in source + prod).** The curation webhook branch wrote
`stripe_payment_intent_id: paymentIntentId || subscriptionId`
(`webhooks/stripe/route.ts`, was doc-cited `:84`, actually `:137`). A managed
tier is a Stripe **subscription**: its `checkout.session.completed` has
`payment_intent = null`, so `paymentIntentId` is `""` and the column received the
`sub_…` id. Any refund keyed on that column would call
`stripe.refunds.create({ payment_intent: "sub_…" })` and fail. Prod
`curation_requests` has **no `stripe_subscription_id` column** (unlike
`artist_profiles` and `placements`, which both have one) — that missing column is
the root cause of the jam-it-into-the-PI-column hack.

**Prod facts checked first (Supabase MCP, project uwkuhygwvasdzwsusiym).** 2 total
rows, 0 managed, 0 `stripe_payment_intent_id LIKE 'sub_%'`, 0 `pi_%`. So the fix
is purely forward-looking; **no backfill** (and no UPDATE of payment rows).

**The fix.** `stripe_payment_intent_id: paymentIntentId || null`, and the dead
`subscriptionId` derivation removed. The column now only ever holds a real `pi_…`
or `null`. The subscription remains recoverable from the stored
`stripe_checkout_session_id` (`→ session.subscription`) when a refund path is
built. Migration-free by design: the correct data model (a
`curation_requests.stripe_subscription_id` column) needs a migration and **04's
range 080-089 is exhausted**, so it is escalated, not taken out of range.

**Test added.** New `describe("Stripe webhook — curation payment id storage (D20)")`
in `webhooks/stripe/route.test.ts` (the branch had zero coverage). It drives a
curation `checkout.session.completed` through the real handler and asserts the DB
update payload: subscription mode → `stripe_payment_intent_id === null` (not the
sub id) and `status === "in_progress"`; one-off → `=== "pi_live_456"` and
`status === "paid"`. Fail-before/pass-after verified: reintroducing the
`|| subscriptionId` behaviour inline made **only** the subscription test fail
(`Tests 1 failed | 1 passed`), the one-off stayed green (the bug only touches the
subscription path); restoring the fix → both pass.

**Verification.** `npm run check` → `EXIT=0`, `Test Files 164 passed (164)`,
`Tests 1824 passed (1824)` (+2), 0 lint/type errors. Payment task, but a live
Stripe test-mode drive is impossible here (no test key / webhook secret); the test
drives a simulated event through the actual webhook handler, the available proxy.
No penny-split in this finding. No schema/RLS change → advisor + `pg_policies`
assertion N/A.

**Escalations recorded (owner decision).** (1) `curation_requests.stripe_subscription_id`
column — blocked on 04's exhausted migration range (080-089); bundle with D21's
status-CHECK widen. (2) The actual curation **refund path** (endpoint / admin
action) does not exist — that is D18's feature half, not a bug fix. Doc D18 section
annotated RESOLVED (storage half).

**Next: D21** (managed curation subscriptions never reconcile — needs the status
CHECK widened to add `past_due`/`paused`, the 04-range-exhausted migration → this
is the escalation point). Re-read the invoice/subscription webhook handlers and
verify the live `curation_requests_status_check` first.

## `04` B10 / D20-complete — curation subscription id gets its own column

Commit `14eafec` (migration 099 applied to prod). Supervisor D57 committed in
isolation first (`402ebb8`).

**Why re-opened.** D20 shipped the migration-free half (`stripe_payment_intent_id:
paymentIntentId || null`) and escalated the missing column. Before I raised the
escalation, supervisor **D57** landed in EXECUTION-DECISIONS: it **retires D1's
per-doc migration ranges** (D57.2 — allocate sequentially above the highest
existing number, 098 → 099; D57.3 — never backfill the 078/079, 090-097 gaps
because a migration's filename is its apply order on a fresh DB) and **authorises**
migration 099 (this column) and 100 (D21's status widen) as additive,
non-destructive changes needing no owner input. D57 does not reorder the task
dependency order, move money, or change grants, so per operating rule 4 it was
committed in isolation and not re-escalated; the authority to apply an additive
migration was already in the loop grant.

**What shipped.** Migration `099_curation_requests_stripe_subscription_id.sql`:
`ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT` + comment + schema reload.
Applied to prod via the Supabase MCP; verified live (`text`, nullable). The
webhook curation branch re-derives `subscriptionId` (null for a one-off) and
writes it to the new column; `stripe_payment_intent_id` still holds a real `pi_…`
or null.

**Test.** The D20 webhook describe block now also asserts: subscription session →
`stripe_subscription_id === "sub_live_123"` and payment-intent column null;
one-off → `stripe_subscription_id === null`. Fail-before verified: deleting the
`stripe_subscription_id: subscriptionId` write fails **both** cases (undefined ≠
the expected value / null); restored byte-identical.

**Verification.** `npm run check` → `EXIT=0`, `Test Files 164 passed (164)`,
`Tests 1824 passed (1824)`. DB ladder: SELECT-leak assertion **0 rows**;
`get_advisors` (MCP, since `npm run audit:advisors` needs SUPABASE_ACCESS_TOKEN
which is absent here) shows **no new finding on curation_requests** — all lints
pre-existing (`rls_enabled_no_policy` INFO on unrelated tables, `rls_policy_always_true`
on public-insert forms, auth password-protection WARN). Payment task, but a live
Stripe drive is impossible here; the test drives a simulated event through the
real handler.

**Next: D21** (managed curation subscriptions never reconcile). Now unblocked for
its migration by D57. Scope: migration **100** widening `curation_requests_status_check`
to add `past_due`,`paused` **plus** the columns D21's handlers write
(`last_invoice_paid_at`, `cancelled_at` — the doc's D21 snippet uses them but D57.4
named only the status widen; include them so the handlers don't 23514); a new
`src/lib/curation/billing.ts` with the three reconcilers; wiring into the webhook's
`invoice.paid` / `customer.subscription.deleted` / `invoice.payment_failed`
branches; a `readSubscriptionIdFromInvoice` shared helper (extract from
paid-loan-billing.ts); `notifyAdminCurationCancelled`; and a `curation_renewal_receipt`
email. Larger build — re-read the paid-loan-billing handlers + verify the live
status CHECK before writing. The curation **refund path** stays out of scope
(feature, per D57.4).

## `04` B10 / D21 — managed-curation subscriptions now reconcile

Commit `dfa2f06` (migration 100 applied to prod). Larger build; unblocked by D57.

**The defect.** A managed curation tier is a Stripe subscription, but the webhook
had no branch for its lifecycle: `invoice.paid` (line ~1030) looked up
`artist_profiles` and found nothing; `customer.subscription.deleted` touched only
`artist_profiles`; `invoice.payment_failed` the same. So a renewal produced no
signal, a cancellation left `status='in_progress'` forever (curator works unpaid),
and a failed card did nothing.

**The fix (mirrors paid-loan-billing).** New `src/lib/curation/billing.ts` with
three handlers, each finding the row by `.eq('stripe_subscription_id', subId)`
(the column added in D20-complete/099) and returning `false` when the sub is not a
curation one so the router falls through:
- `handleCurationInvoicePaid` -> `in_progress` + `last_invoice_paid_at`.
- `handleCurationSubscriptionDeleted` -> `cancelled` + `cancelled_at` +
  `notifyAdminCurationCancelled`.
- `handleCurationInvoiceFailed` -> `past_due` while `next_payment_attempt` is set,
  `paused` once it is null.
Wired into the webhook's `invoice.paid` / `invoice.payment_failed` /
`customer.subscription.deleted` branches, right after the paid-loan block.

**Schema — migration `100_curation_requests_reconcile_columns.sql`** (applied to
prod, verified live): widened `curation_requests_status_check` to add `past_due`,
`paused` (drop+add, additive superset so no row can violate it) and added
`last_invoice_paid_at`, `cancelled_at` TIMESTAMPTZ. Numbered 100 per D57 (next
above 099, no gap backfill).

**Refactor (DRY, precedent-following).** `readSubscriptionIdFromInvoice` moved
from `paid-loan-billing.ts` to the neutral `stripe-subscription-period.ts` (where
`periodFromSubscription` already lives for the same reason); the private copy was
deleted and both reconcilers import the one export.

**Admin surface.** `admin/curation/page.tsx` renders the two new states (labels +
amber/red badges). Left `STATUS_ORDER` and the admin PUT enum
(`api/admin/curation/route.ts`) alone: `past_due`/`paused` are Stripe-derived, not
admin-settable.

**Tests.** `src/lib/curation/billing.test.ts` (8 unit tests) pins each handler's
transitions + `not-found -> false`. The webhook test adds 3 wiring tests
(`describe D21 curation reconcile wiring`) mocking the billing module and
asserting each event reaches its handler. Fail-before/pass-after proven both
ways: inverting the `past_due`/`paused` branch failed 2 unit tests; removing the
webhook wiring failed all 3 wiring tests; both restored byte-identical.

**Verification.** `npm run check` -> `EXIT=0`, `Test Files 165 passed (165)`,
`Tests 1835 passed (1835)` (+11), 0 lint/type errors (no warnings in the changed
files). DB ladder: SELECT-leak assertion `0 rows`; migration 100 is additive with
no RLS/policy change, so the advisor surface is unchanged from the D20-complete
snapshot (no `curation_requests` findings). Payment task, but a live Stripe drive
is impossible here; the unit tests exercise the handler logic and the webhook
tests drive simulated events through the real router.

**Out of scope (recorded).** The customer renewal-paid receipt is D23's
territory ("nobody told the money landed"); `handleCurationInvoicePaid` does the
reconcile only. The curation refund path stays a feature (D57.4/D56.3).

**Next: D22** (declared billing interval decorative — `api/curation/route.ts:18-19`
`interval` field never read; code-only). Then D23 (curation-paid customer
notification, folds in the renewal receipt deferred here), D24 (/curated/success
asserts payment never verified). Re-read api/curation/route.ts + the curated
success page first.

## `04` B10 / D22 — managed curation billing interval made authoritative

Commit `4d129fd`. Code-only, no migration.

**The defect.** `curation-tiers.ts` declared `interval: "month"/"quarter"` on the
managed tiers, and nothing read it. The actual cadence came from the Stripe price
behind `STRIPE_PRICE_CURATION_MONTHLY`/`_QUARTERLY`, unvalidated: a quarterly env
pointing at a monthly price would bill £199.99 every month while the page promises
every quarter, silently.

**The fix (doc's prescription — validate, not delete the field).** In the managed
branch of `api/curation/route.ts`, before creating the subscription session,
retrieve the configured price (cached 5 min in module scope) and check it against
the tier: `recurring.interval === "month"`, `interval_count === (quarter ? 3 : 1)`
(Stripe models quarterly as monthly ×3), `unit_amount === priceGbp*100`,
`currency === "gbp"`. On mismatch or a retrieve failure, delete the pending row
(safe — no session exists yet, D19) and 503 "Managed curation is temporarily
unavailable". `tier.interval` is now read (lines 72, 211), so the field is
authoritative.

**Tests.** `curation/route.test.ts` gains a D22 block: matching price → checkout
proceeds; wrong cadence, wrong amount, and failed retrieve each → 503 + row
deleted + no session created. The stripe mock gained `prices.retrieve`, defaulted
to a managed_monthly-matching price (so the D19/D20 managed cases still reach
session creation); tests needing a specific outcome use a unique price id because
the route's 5-min price cache is module-scoped and not cleared between tests.

**Verification.** Fail-before: removing the validation block failed all 4 D22
cases; restored byte-identical. `npm run check` → `EXIT=0`, `Test Files 165
passed`, `Tests 1839 passed (1839)` (+4), 0 lint/type errors (warning count
unchanged). No schema/RLS change → no DB ladder. Payment task; a live Stripe drive
is impossible here, so the mocked route test exercises the retrieve+validate paths.

**Next: D23** (nobody is told the money landed — 04 §B10 doc ~:1868). The admin is
notified at SUBMIT (`notifyAdminCurationRequest`, before payment) but never when
the payment settles. Doc fix: add `notifyAdminCurationPaid` in the webhook curation
branch next to `notifyCurationCustomerPaid`. Also folds in the D21-deferred
customer renewal-paid signal (send on `invoice.paid billing_reason ===
'subscription_cycle'`). Re-read the webhook curation branch + lib/email.ts first.

## `04` B10 / D23 — the admin is told when a curation payment lands

Commit `ed7a946`. Code-only, no migration. Folds in the D21-deferred renewal signal.

**The defect.** `notifyAdminCurationRequest` fires at SUBMIT (before payment), and
nothing fired when the payment settled. An admin could not tell a paid £49 brief
from an abandoned checkout without opening Stripe, and managed renewals were silent.

**The fix.** New `notifyAdminCurationPaid` in `lib/email.ts` (plain
`resend.emails.send`, mirroring the other curation admin emails). Called from:
- the webhook curation branch (`checkout.session.completed`), on settlement of a
  one-off or a managed first payment. Placed OUTSIDE the `if (contact_email)` guard
  so the admin is told even when the venue left no contact email.
- `handleCurationInvoicePaid` (`src/lib/curation/billing.ts`) on a managed
  renewal, guarded to `invoice.billing_reason === "subscription_cycle"` so the
  first invoice (`subscription_create`) — already covered by the checkout webhook —
  does not double-send. `isRenewal: true` flavours the email.

**DRY.** Replaced the webhook's inline `tierLabels` map (a duplicate of the tier
labels) with the single `CURATION_TIERS[tier].label` source, shared by the admin
and customer notifications; `billing.ts` uses the same source for the renewal.

**Tests.** `billing.test.ts` (+2): renewal pings on `subscription_cycle`, does NOT
ping on `subscription_create` (still reconciles the row). Webhook test (+1): a
settled curation payment calls `notifyAdminCurationPaid` with amount £79.99 and
tier "Managed, monthly rotation". Fail-before verified both ways: neutering the
renewal guard failed the renewal test; removing the webhook call failed the
money-landed test; both restored byte-identical.

**Verification.** `npm run check` → `EXIT=0`, `Test Files 165 passed`, `Tests 1842
passed (1842)` (+3), 0 lint/type errors (no new warnings). No schema/RLS change →
no DB ladder. Payment task; a live Stripe drive is impossible here, so tests drive
simulated events through the real webhook + reconciler.

**Out of scope (recorded).** The customer renewal receipt (the D21 doc snippet's
`curation_renewal_receipt`) is a nicety, not the identified admin-awareness gap;
the venue already gets its "underway" email at signup. Left for a future pass.

**Next: D24** (the /curated/success page asserts payment that was never verified —
04 §B10 doc ~:1890). `(pages)/curated/success/page.tsx` is a static component
reading "Payment received." with no session lookup, though the success URL carries
session_id (`api/curation/route.ts` success_url). Doc fix: make it a server
component that retrieves the Stripe session and branches on `payment_status`,
matching the checkout/confirmation pattern; a `processing` state must say so rather
than claim receipt. Re-read the success page + the checkout/confirmation pattern
first. Likely no migration.

## `04` B10 / D24 — curation success page verifies the payment

Commit `feb967e`. Code-only, no migration. **This completes B10 (curation).**

**The defect.** `(pages)/curated/success/page.tsx` was a static component that
always read "Payment received." with no session lookup, though the Stripe success
URL carries `session_id`. A buyer whose payment had not settled, or who reached
the URL with a stale id, was told the money was taken when it may not have been.

**The fix.** Now an async server component (Next 16, `searchParams` is a Promise).
It calls `stripe.checkout.sessions.retrieve(session_id)` and branches on
`payment_status`: `paid` → the receipt; anything else → a "We're confirming your
payment" processing state that does NOT claim receipt; a failed retrieve falls to
the same processing state; no `session_id` → a neutral "Start your curation"
state. A server component (not the client+API confirmation pattern) because this
page has no cart/auth dependency, so verification is simplest server-side. Public
copy is dash-free per AGENTS.md.

**Test.** `(pages)/curated/success/page.test.tsx` (jsdom) awaits the server
component with a mocked Stripe and asserts each branch. Fail-before: the old
static page fails all four cases (it never calls Stripe and always says
received); restored. **Browser-verified** on the dev server: `?session_id=cs_fake`
→ processing state (screenshot), no `session_id` → neutral state — neither claims
receipt. The `paid` state needs a real Stripe session so it is unit-test only.

**Verification.** `npm run check` → `EXIT=0`, `Test Files 166 passed`, `Tests 1846
passed (1846)` (+4), 0 lint/type errors. No schema/RLS change → no DB ladder.

---

## B10 (curation) COMPLETE

All eight curation findings shipped this session: D25 (tier CHECK, guard), D19
(orphan-payment race), D20 + D20-complete (payment-intent/subscription-id columns),
D21 (subscription reconcilers + migration 100), D22 (managed price validation),
D23 (payment-settled notification), D24 (success-page verification). Migrations
099 and 100 applied to prod. Supervisor D57 retired D1's per-doc migration ranges
mid-session.

**Remaining plan items are all owner-decision or feature work, not loop-eligible
bug fixes:**
- **T9 / N1 / N2** (collect-from-venue): net-new checkout FEATURE. Per the plan it
  needs an owner decision before building (surface via AskUserQuestion).
- **D14** (referral credit): blocked on a product decision.
- **The two unpaid offers** off_1778 (£33) / off_1779 (£27), artist fin-coles:
  D11, a MANUAL human Stripe reconciliation, explicitly not a code change.

Per per-iteration procedure step 8 ("stop when only owner-decision items remain"),
the loop stops here.

## CORRECTION to the "loop stops here" conclusion above

The B10-complete summary concluded the loop should stop because "only
owner-decision items remain". That was WRONG, and EXECUTION-DECISIONS says so
directly: supervisor **D57.6** and the callout at `2247` flag that the loop's
remaining-work survey "lists B10, T9, D14 and D11 without" D55, and that E25 is
still open. Three loop-eligible BUG FIXES remain (not owner-decision, not
feature):

- **D55.2 (queue row 17)** — `reconcileOrdersWithoutLegs` keys on
  `.gt("artist_revenue", 0)` (`stripe-connect.ts:199`), which excludes the exact
  orders it must catch: `artist_revenue = 0` is the signature of the D4
  attribution failure, not evidence nothing is owed. Re-key on "money in, nothing
  out": `total > 0` + an owed status + no `stripe_transfers` row. Regression test
  must use the `WP-WSP06D` shape (total > 0, `artist_revenue` 0, `artist_user_id`
  NULL) — a test on `artist_revenue > 0` proves nothing.
- **D55.3 (queue row 18)** — `ReconcileResult.unresolved` is a bare counter
  (`stripe-connect.ts:173`); 5 of 11 flagged prod orders land there and their ids
  are discarded. Change to `unresolved: string[]` (or `{orderId, total}[]`), no
  new table/surface. These two are small edits to the same existing function and
  are naturally tested together (WP-WSP06D should surface as unresolved-with-an-id).
- **E25** — `message-attachments` storage bucket is still `public = true` (1
  object in prod, per D38.6). A public bucket serves any object by direct URL
  regardless of listing, so the existing "listing is not anon-accessible" test
  misses the exposure. Flip the bucket to private, serve attachments via signed
  URLs, and fix the test to assert a direct object fetch is denied. Last item from
  the original security queue.

The loop CONTINUES to these. Only after D55.2, D55.3 and E25 are done do just
T9/N1/N2 (feature), D14 (product decision) and the two unpaid offers (D11 manual)
remain — and the loop stops then.

## `04` D55.3 — reconcile sweep keeps the unresolved order ids

Commit `c172fa7` (supervisor D58 committed in isolation first, `c99cccd`). Code-only.

**The defect.** `ReconcileResult.unresolved` was a bare `number`
(`stripe-connect.ts`), so `reconcileOrdersWithoutLegs` discarded the id of every
owed order with no resolvable artist (null `artist_user_id`). Prod: 5 of 11
flagged orders land there; an operator saw `{flagged: 6, unresolved: 5}` and could
not learn which to chase.

**The fix.** `unresolved: string[]`; push `o.id` instead of `result.unresolved++`.
The `process-pending` route now returns `reconciledUnresolved` (the ids) plus
`reconciledUnresolvedCount`. No new table/surface.

**Test.** The unresolved case asserts `res.unresolved` toEqual `["o2"]` (the id),
not a count. Fail-before verified: reverting `stripe-connect.ts` to the counter
fails both touched assertions; restored. `npm run check` → `EXIT=0`, `Tests 1846
passed`, 0 lint/type errors. Code-only, no DB ladder.

## SCOPE CORRECTION 2 (supervisor D58) — the plan is ~55% done, not ~95%

My B10-complete correction (`b984cdc`) reinstated D55.2/D55.3/E25 but STILL
understated the remaining work. Supervisor **D58** (and new **operating rule 6**,
now hoisted at the top of EXECUTION-DECISIONS) enumerates **six ledger rows still
`todo`**, spanning docs I have not touched — roughly **220 of the plan's 391
subtasks**:

| Row | Task | Doc |
|---|---|---|
| 7b | Schema-column guard, full form (generated schema-columns.json + scan every .select()) | `02` |
| 7c | `placements/route.ts` phantom `requester_user_id` (~20 refs) | `01`/N3 |
| 8 | `05` frontend saves + listing | `05` |
| 9 | `03` auth/admin — create+backfill `admin_users` BEFORE dropping the user_metadata conjunct (or admins are locked out) | `03` |
| 10 | `09` emails — artist-sale trigger first | `09` |
| 11 | `07` K5a/K5b before `08` PR#2; `09 §4.1` harness before `08` PR#5 | `07`,`09` |
| 12 | `08` rewritten cull, last | `08` |

Cause (per D58.3): I have been inside `04` for hours, so the `04` list felt like
the plan; it is 1 of 9 docs. **Per operating rule 6, before ever concluding the
loop is done I must re-read the ledger table at the top of PROGRESS.md and confirm
every row reads done / void / owner-only.** Row 9 carries a DESTRUCTIVE ordering
constraint (admin lockout) and row 12 (`08` cull) is partly an escalation item.

Remaining loop order from here: **D55.2** (reconcile predicate), **E25** (bucket
→ private), then the six rows above in dependency order. The loop does NOT stop
after E25.

## `04` D55.2 — reconcile sweep keys on money-in, not artist_revenue

Commit `f842916`. Code-only (reads an existing column, no migration).

**The defect.** `reconcileOrdersWithoutLegs` selected `.gt("artist_revenue", 0)`.
`artist_revenue = 0` is the SIGNATURE of the D4 attribution failure (WP-WSP06D:
£64.49 taken, no artist attributed), not evidence nothing is owed, so the sweep
was blind to exactly the orders money is stuck on. Verified against the doc's prod
finding (D55.2, EXECUTION-DECISIONS ~:2224): 1 invisible zero-revenue order.

**The fix.** Predicate → `total > 0` + owed status + no ledger row (added `total`
to the select). Loop branch: recipient present AND `owedCents > 0` → record the
blocked leg as before; otherwise (no recipient, OR artist_revenue 0) → `unresolved`
with the id.

**Refinement noted (doc vs the amount_cents CHECK).** The D55.2 ruling said "if
artist_user_id is present, record the blocked leg as now." But `stripe_transfers`
has `CHECK (amount_cents > 0)`, so a 0-revenue order (the D4 shape) cannot be a
blocked leg even when the artist is known: there is no valid amount to record.
Those route to `unresolved`-with-id instead. This is stricter than the doc's
literal wording and matches the CHECK; recorded here per the trust-source rule.

**Tests.** (1) the sweep keys on `total`, not `artist_revenue` (captures the
predicate column — the crux, since a mocked DB returns rows regardless of the
predicate, so this is the only way to prove the change); (2) the WP-WSP06D shape
(total>0, artist_revenue 0, artist_user_id NULL) surfaces as unresolved-with-id;
(3) a 0-revenue order with a present artist routes to unresolved, not a £0 leg.
Fail-before: the old predicate fails tests (1) and (3); restored.

**Verification.** `npm run check` → `EXIT=0`, `Test Files 166 passed`, `Tests 1849
passed (1849)` (+3), 0 lint/type errors. No schema/RLS change → no DB ladder.
Payment task, but the sweep drives no Stripe event (it reads orders + writes
blocked legs); the unit tests cover the predicate + branch logic. **D55 (rows
17+18) now fully done.**

**Next: E25** (message-attachments bucket public → private + signed URLs + test).
Then the six D58 ledger rows (7b/7c/8/9/10/11/12). Per operating rule 6, re-read
the top-of-PROGRESS ledger before ever concluding the loop is finished.

## `04` E25 — BLOCKED on an owner-coordinated deploy cutover (not done autonomously)

Investigated this iteration; not implemented. Recording the blocker per loop step 6
and moving to the next unblocked task.

**Confirmed in prod (Supabase MCP).** `storage.buckets` `message-attachments`:
`public = true`, 1 object. The exposure is real: a public bucket serves any object
by direct URL regardless of listing, so message attachments (potentially sensitive
DMs) are anonymously fetchable by anyone who has or guesses the path.

**The data flow (why the fix is not a one-liner).**
- `src/lib/upload.ts` `uploadMessageAttachment` runs on the **browser** client
  (`import { supabase } from "./supabase"`), uploads to `message-attachments`, and
  returns `getPublicUrl(path).publicUrl`.
- That public URL is persisted into `messages.attachments[].url` (JSONB), validated
  as `z.string().url()` in `src/lib/validations.ts`, written by
  `src/app/api/messages/route.ts`.
- `MessageInbox.tsx` renders it directly: `<img src={a.url}>` / `<a href={a.url}>`.

So the stored value IS a public URL, and rendering depends on the bucket being
public. A private bucket has no working public URL.

**Why it cannot be done autonomously and safely (the hard blocker).** Flipping the
bucket to `public = false` takes effect **immediately on the live site**. The
remedying code (store a path, mint short-lived signed URLs through an
authenticated read path) only takes effect **on deploy**, and this loop never
pushes or deploys (authority: never push without approval). So flipping the bucket
now breaks every attachment on the deployed site (still running `getPublicUrl`),
with the fix sitting undeployed on the branch. There is no safe autonomous slice:
closing the hole = flipping the bucket = breaking the live feature until a deploy
that only the owner can do.

**The complete fix (owner-coordinated), for when it is scheduled:**
1. Change the stored shape from a public URL to a storage **path**
   (`attachments[].url` → `path`; update `validations.ts`, `upload.ts`, the send
   route, and `MessageInbox`).
2. Add an authenticated read path (e.g. `GET /api/messages/attachment?path=…`)
   that verifies the requester is the sender or recipient of the message carrying
   that attachment, then redirects to / streams a short-lived `createSignedUrl`.
   Render `<img src="/api/messages/attachment?path=…">`.
3. **Deploy that code**, THEN flip the bucket `public = false` (coordinated, so the
   live site is never serving old public-URL code against a private bucket).
4. Backfill the 1 existing object's stored `url` → `path` (this UPDATEs a real
   `messages` row — an escalation-listed "touching real messages" action, owner's
   call).
5. Fix `tests/e2e/security-no-leaks.spec.ts`: assert a DIRECT object fetch
   (`getPublicUrl` → fetch) is DENIED, not just that listing is denied (D38.6: the
   current test misses the exposure because listing is not the exposure).

**Owner decision needed:** schedule the coordinated deploy + bucket flip (and the
1-row backfill). Until then the bucket stays public and E25 stays open. This is the
last item from the original security queue; it is a genuine open exposure, so it is
worth the owner's attention soon.

**Moving on:** the next unblocked loop task is D58 row **7b** (`02` schema-column
guard, full form) — code-only, no prod cutover.

## `02` D58 row 7b — phantom-column guard, full form

Commit `7f556eb`. Code+tooling only, no prod change (schema was read-only).

**What shipped.** `tests/integration/schema-columns.json` — a committed snapshot of
every column of every public table (generated from prod
`information_schema.columns`; regen query in the guard header). The guard
(`phantom-columns.test.ts`) is rewritten from a 4-column denylist to an ALLOWLIST
scan: every `.from().select()` is checked against the snapshot, so a select naming
ANY absent column fails, not just the four already known. A paren-aware top-level
comma split stops embed inner columns (`select("*, orders(total)")`) being
mis-read as phantom columns of the parent (that was the one false-positive class,
3 refund selects; now clean). `phantomColumns()` is exported + unit-tested.

**Verification.** Fail-before: dropping a grandfather entry makes the guard flag
that phantom as a build failure. `npm run check` → `EXIT=0`, `Tests 1854 passed`,
0 lint/type errors.

**What the guard found — 12 pre-existing phantom selects (22 columns), grandfathered
as a ratchet.** These are REAL bugs (the select is rejected whole → silent
null/`[]`), queued as follow-up. 7c fixes #2 next; the rest are open:

| # | file | table.phantom | real column / fix |
|---|---|---|---|
| 1 | webhooks/stripe/route.ts:1207 | artist_profiles.free_until | D17.2 open (parked no-op) |
| 2 | placements/route.ts:807 | placements.requester_user_id | proposed_by_user_id (7c, NEXT) |
| 3 | cron/onboarding-nudges:51 | artist_profiles.artist_statement, profile_photo | extended_bio/short_bio, profile_image; nudges silently skipped |
| 4 | cron/placement-ending-soon:30 | placements.end_date | no such col; the ending-soon cron never fires |
| 5,6 | offers/route.ts:174,448 | artist_collections.title | name |
| 7 | orders/[id]/events:39 | orders.venue_user_id, currency, placed_at | venue via venue_slug; no currency; created_at |
| 8 | orders/track:80 | orders.buyer_name, total_amount, shipping_amount, currency, cart_items, tracking_url, shipped_at, delivered_at | order tracking cannot load an order at all |
| 9 | placements/[id]/route:59 | artist_profiles.image | profile_image |
| 10 | walls/my-works:72 | placements.work_id | no such col; my-works cannot list placed works |
| 11 | sitemap.ts:74 | artist_works.updated_at | created_at |
| 12 | paid-loan-billing.ts:200 | venue_profiles.contact_email | email; ensureVenueCustomer always falls back to auth email |

**These 10 (excluding #1 parked, #2 = 7c) are genuine live bugs surfaced by the
guard.** #8 (order tracking) and #7 (order events) and #4/#10 (whole-select
rejections) are the most user-visible. They are not in the D58 ledger yet; the
loop should work through them after the six ledger rows, or the owner may
prioritise the user-facing ones (order tracking) sooner. Recorded here so they are
not lost.

**Next: 7c** (`01`/N3) — fix `placements/route.ts` phantom `requester_user_id`
(~20 refs; real column proposed_by_user_id) and shrink the ratchet to 11. Re-read
placements/route.ts + verify against the live placements columns first.

## `01`/N3 D58 row 7c — placements route uses the real proposed_by_user_id column

Commit `96fc84b`. Code-only (the column already exists in prod, no migration).

**The defect.** `placements/route.ts` referenced a phantom `requester_user_id` in
23 snake_case sites (reads, an insert, an update, a role-flip, a strip-candidate
list, a fetch select). Every such query was rejected whole by PostgREST and
silently retried without the column, so the proposer was never resolved from the
row (only from message metadata). Real column: `proposed_by_user_id` (in the 7b
snapshot; already used by lib/authz.ts).

**The fix.** Renamed all 23 snake_case column refs to `proposed_by_user_id`. The 6
camelCase `requesterUserId` refs are a metadata-key contract, left untouched
(verified: 0 touched). The primary fetch select now succeeds, so the dead "retry
without the column" fallback it relied on is deleted (anti-knot rule) rather than
left inert. Shrank the 7b ratchet: removed the placements grandfather entry,
GRANDFATHERED 12 -> 11.

**Verification.** Fail-before: reintroducing the phantom select fails the guard
(no longer grandfathered). `npm run check` -> `EXIT=0`, `Tests 1854 passed`, 0
lint/type errors; placements route suite 16 pass; phantom guard 10 pass.

## Loop prioritisation note (after 7c)

The 7b guard surfaced 10 open phantom-column bugs (PROGRESS 7b table #3-#12). Some
are LIVE user-facing breaks — most notably **order tracking** (`orders/track`
selects 8 non-existent columns, so PostgREST rejects the whole select and the route
returns 500 on every lookup) and **order events**. These are small, well-defined
fixes that each also shrink the ratchet. I am prioritising them ahead of the
doc-scale D58 rows 8-12 (entire implementation docs), because fixing a known live
break is higher value than starting a large unread doc row, and they clear the
guard's debt. Order: order-tracking, order-events, the two broken crons
(onboarding-nudges, placement-ending-soon), then the cosmetic ones (title->name,
image->profile_image, work_id, updated_at->created_at, contact_email->email), then
rows 8-12. The owner can re-order if the doc rows are more urgent.

**Next: the order-tracking phantom fix** (`orders/track/route.ts:80`): map the 8
phantom columns to real ones (total_amount->total, shipping_amount->shipping_cost,
cart_items->items; drop/replace buyer_name, currency, tracking_url, shipped_at,
delivered_at against the real schema + the DbOrder type + the response mapping),
then remove that grandfather entry (ratchet 11 -> 10). Re-read the route + its
test + the orders snapshot first.

## row 19 #1 — order tracking selects real columns (was 500 on every request)

Commit `66dc55a` (supervisor D59 committed in isolation first, `8cecbaa` — D59
ratifies working row 19 ahead of docs 05/03/09/07/08, matching the loop's own call).

**The defect.** `/api/orders/track` selected 8 columns absent from `orders`
(total_amount, shipping_amount, currency, cart_items, buyer_name, tracking_url,
shipped_at, delivered_at). PostgREST rejected the whole select → `error` set →
the route returned 500 on EVERY request. Order tracking was fully broken in prod.

**The fix.** Real columns: total_amount->total, shipping_amount->shipping_cost,
cart_items->items, tracking_url dropped (only tracking_number exists; the page
treats url as optional). buyer_name/shipped_at/delivered_at were never rendered
(the page shows the status_history timeline) → dropped from the response, the
DbOrder type, and the page's TrackedOrder type. currency hardcoded "gbp".

**Test.** The mock returned the phantom columns (why the suite stayed green while
the route 500'd); now it mirrors the real columns and the first test asserts the
mapping (total/shipping/currency/items). Ratchet 11 -> 10. Fail-before: the old
phantom route fails BOTH the mapping test and the guard.

**Verification.** `npm run check` -> `EXIT=0`, `Tests 1854 passed`, 0 lint/type
errors. The tracking page is browser-observable but driving it needs a real order
+ token against prod, so the browser step was not run; the unit test covers the
mapping.

**Next (row 19 #2, D59 impact order):** `cron/placement-ending-soon:30`
`placements.end_date` — the column is absent, so the whole select is rejected and
this cron has NEVER fired. Verify what "ending soon" should key on (placements has
live_from / scheduled_for / collected_at, no explicit end), fix the select, remove
the grandfather entry (ratchet 10 -> 9). Re-read the cron + the placements columns
first.

## row 19 #2 — placement-ending-soon cron: BLOCKED on a data-model decision (owner)

Investigated; not fixed. Recording the blocker per the supervisor's own "flag if
genuinely ambiguous" instruction (EXECUTION-DECISIONS :574) and loop step 6, then
moving to the next phantom bug.

**The defect.** `cron/placement-ending-soon/route.ts:30` selects/filters on
`placements.end_date`, which does not exist. PostgREST rejects the whole select, so
the cron finds nothing and the "your placement is ending soon" email has never
sent (confirmed absent from all sends in EXECUTION-DECISIONS :561). The source
comment admits the guess: "map from whichever DB column holds it. Common options:
end_date, ends_at, collected_at."

**Why it is not a simple rename (genuinely ambiguous).**
- `placements` has NO planned-end column. The G-doc (2026-05-03-G :334) planned
  `placements.start_date` + `end_date`, but they were never migrated.
- `placements.collected_at` / `cancelled_at` are PAST events (set when the
  placement ends), so they cannot drive a reminder 14 days BEFORE the end.
- `scheduled_for` is a scheduling (start/install) date, not an end.
- The planned-collection concept may live in the SEPARATE `placement_records`
  table (`collection_date`, `review_date` — future planned dates). Reworking the
  cron to join `placement_records` and key on `collection_date` is plausible, but
  needs confirming that active placements reliably have a record with a populated
  `collection_date` (likely sparse), or the cron still sends nothing.
- Adding a `placements.end_date` column is a FEATURE/migration (owner sign-off per
  the loop's authority; do not invent a column autonomously).
- The `08` cull doc (:302) lists this cron under "zero callers is correct" (KEEP,
  a legitimate Vercel cron), so "deleting beats fixing" does NOT authorise deleting
  it either.

**Owner decision needed (recommendation).** Pick one: (a) rework the cron to key
on `placement_records.collection_date` (verify population first — this is the most
likely "real column" answer, matching the G-doc intent); (b) add an explicit
`placements.end_date` column + populate it on placement accept (a feature); or (c)
retire the ending-soon reminder (delete the cron + its vercel.json entry + the
PlacementEndingSoon template). Until then the cron stays grandfathered in the
phantom guard (ratchet unchanged at 10) and remains inert (it already sends
nothing). Its twin, `onboarding-nudges`, is a clean rename and is being fixed next.

**Moving on:** row 19 #3, `cron/onboarding-nudges:51` (artist_statement /
profile_photo → real columns), which is unambiguous.

## row 19 #3 — onboarding-nudges artist branch uses real bio/image columns

Commit `bb1a695` (supervisor D60 committed in isolation first, `faf76bf`).

**The defect.** The artist branch selected `artist_profiles.artist_statement` +
`profile_photo` (absent), so the whole artist select was rejected and the artist
onboarding nudges have NEVER sent (the venue branch, real columns, works).

**The fix.** `artist_statement` -> `short_bio`, `profile_photo` -> `profile_image`
across the select + 8 completeness checks. `short_bio` (not extended_bio) is the
right target: it is the primary bio shown on cards/search that a complete profile
needs; extended_bio is explicitly optional. Labels ("Artist statement"/"Profile
photo") unchanged copy. Ratchet 10 -> 9. Fail-before verified via the guard.
`npm run check` -> `EXIT=0`, 1854 tests, 0 errors.

**Supervisor D60 (this run) on #2 (placement-ending-soon):** confirmed my
escalation was right, and ELIMINATED my recommended option (a): verified
`placement_records.collection_date` is populated for only 1 of 37 active
placements (0 in the future), so rewiring there is "the same silence with more
code". The owner decision is now two-way: (b) build a real `placements.end_date`
data model (a feature), or (c) disable the cron honestly. D60 is emphatic that
LEAVING IT AS-IS is the worst option (a Vercel-scheduled job that looks healthy and
has never sent an email).

**Next iteration (per D60): honestly disable the ending-soon cron (option c
interim).** Gate the handler to return early with a comment that the placement
end-date data model does not exist (removes the phantom select + the daily wasted
invocation + the pretence), remove its phantom-columns grandfather entry (ratchet
-> 8), and correct `08 §302`'s "KEEP" note to record it is non-functional pending
the owner's (b)-vs-(c) decision. This interim is fully reversible and does not
foreclose (b); it just stops the pretence. Surface (b) to the owner. THEN continue
row 19 #4 (walls/my-works placements.work_id).

## row 19 #2 — placement-ending-soon cron honestly disabled (D60 option-c interim)

Commit `2d52b98`. Code-only.

Per supervisor D60 (don't leave a healthy-looking-but-dead cron running): the
handler now returns `200 {ok, skipped:"..."}` after cron auth and no longer runs
the phantom `placements.end_date` select. The dead body (query + runBatch + email
loop) and now-unused imports are deleted; the vercel.json entry and the
PlacementEndingSoon template stay for the owner's full (c). Ratchet 9 -> 8;
`08-surface-cull.md` §302 annotated NON-FUNCTIONAL. `npm run check` green (1854),
0 live `.from()`/`.select()` left.

**OWNER DECISION still open (b vs c):** build a real `placements.end_date` data
model (a feature: add the column, populate it on placement accept, decide what
sets it) and re-enable, OR fully remove the cron + vercel entry + template. The
interim stops the pretence and is reversible either way.

**Next: row 19 #4** — `walls/my-works:72` selects `placements.work_id`, which does
not exist (placements carries `work_title`/`work_image`/`current_placement_id`).
Re-read the route to determine what it needs the work id FOR (likely joining to
artist_works via current_placement_id, or it should select current_placement_id),
fix the select + usages, remove the grandfather entry (ratchet 8 -> 7). Verify
against the schema snapshot first.

## row 19 #4 — walls/my-works joins via current_placement_id, not phantom work_id

Commit `7f8f6d8`. Code-only (real column, no migration).

**The defect.** The route selected `placements.work_id` to join `artist_works`
for pricing. placements has no work_id, so the placements select was rejected
whole and the venue "works on my wall" panel always returned `[]` (another live
break).

**The fix.** placements has no forward work link (only denormalised
work_title/work_image); the real link is the REVERSE FK
`artist_works.current_placement_id` (migration 038). Query artist_works by
`current_placement_id IN (active placement ids)` and map placement -> work, keeping
the denormalised fallback. Dropped work_id from the select + PlacementRow type.

**Test.** New `walls/my-works/route.test.ts` drives the resolved-work path (real
pricing + work id via current_placement_id). Fail-before verified against the old
work_id join (fell back to denormalised fields). Ratchet 8 -> 7. `npm run check`
green: 167 files, 1855 tests.

**Next: row 19 #5** — `orders/[id]/events/route.ts:39` selects `venue_user_id`
(orders has none; venue is via venue_slug), `currency` (none), `placed_at` (use
created_at). Re-read the route (loadOrder + how these are used) to map/drop each
correctly, fix the select + usages, remove grandfather (ratchet 7 -> 6).

## row 19 #5 — orders/[id]/events selects real columns + resolves venue by slug

Commit `1b8a270`. Code-only.

**The defect.** loadOrder selected phantom `venue_user_id`/`currency`/`placed_at`,
so the select was rejected and the order-events route 404'd for every order (the
customer tracking stepper could not load).

**The fix (with an authz subtlety).** `venue_user_id` was gating a real check (a
venue viewing its order's events). orders links the venue via `venue_slug`, so the
fix resolves the venue user id from `venue_slug -> venue_profiles.user_id`
(`isVenueForSlug`) rather than dropping the venue path. `currency -> "gbp"`,
`placed_at -> created_at`. OrderRow + select trimmed.

**Test.** New route test pins the mapping AND the venue authz path (venue via slug
authorised; unrelated user 403). Fail-before: the old phantom route fails the
mapping AND the venue-authz test (order.venue_user_id was always undefined, so
venues would have been wrongly 403'd). Ratchet 7 -> 6. `npm run check` green: 168
files, 1858 tests. (Pre-existing lint warning on the POST handler's authz is
unrelated and unchanged.)

## row 19 #6 — paid-loan-billing selects venue_profiles.email, not phantom contact_email

Commit `648fb10`. Code-only. MONEY PATH.

**The defect.** `ensureVenueCustomer` selected `"user_id, stripe_customer_id,
contact_email, name"` from `venue_profiles`, but the column is `email`, not
`contact_email` (confirmed against schema-columns.json). PostgREST rejected the
whole select, so the venue row came back null and the function fell through to the
auth-user email (`getUserById`) for the Stripe customer it creates. Every paid-loan
venue that had never had a Stripe customer minted got one keyed to the auth email
instead of the venue's billing email, and any receipt/customer-portal mail Stripe
sends went to the wrong address.

**The fix.** `contact_email -> email` across all four references (the SELECT, the
`VenueRow` inline type, the early-return `{ customerId, email: venue.email }`, and
`let fallbackEmail = venue.email`). The auth-email path stays as a genuine fallback
for venues that truly have no email. Grandfather entry removed, ratchet 6 -> 5.

**Test.** New regression in `paid-loan-billing.test.ts`: a venue with
`email: "venue-real@e.com"` and `stripe_customer_id: null` drives
`startPaidLoanBilling`; asserts `stripe.customers.create` is called with that email,
not the auth fallback `venue@example.com`. Simulated event through the real handler
(no live Stripe key in this env). Fail-before verified both directions by reverting
the source to the committed phantom version: the regression test failed with
`+ "email": "venue@example.com"` (the bug) and the phantom guard failed with
`paid-loan-billing.ts:200 selects "venue_profiles.contact_email" (not in the live
schema)`. Re-applied -> both pass. `npm run check` green: 168 files, 1859 tests,
audit:allowlist PASS, exit 0.

## row 19 #7 — offers/route.ts selects artist_collections.name, not phantom title

Commit `81c3dbe`. Code-only.

**The defect.** Two selects on the offers route named `artist_collections.title`,
which does not exist (the column is `name`). Site 1 (GET enrichment, :174,
`"id, title, work_ids"`) had PostgREST reject the whole query, so `collectionById`
was empty and every collection offer came back with `collection: null` on the
offers list. Site 2 (POST, :448, `"title"`) read `collection?.title` (undefined)
into the offer's message metadata, so `collectionTitle`/`primaryTitle` fell back to
the work title or "Artwork" for every collection offer.

**The fix.** `title -> name` on both selects and their inline types. Site 1's
enriched `collection` object now carries `name`, so the one consumer
(`OffersList.tsx`, the only place in the repo that read `collection.title`, a branch
that never fired because the value was always null) is updated to `collection.name`
and its `EnrichedCollection.title` type field to `name`. This aligns the offers path
with every other collection consumer (CollectionCard, the browse pages), which all
already read `collection.name`. Site 2's `collectionTitle` local keeps its name (it
is the collection's display title, which IS `name`).

**Test.** New GET test in `offers/route.test.ts`. Because a naive mock that ignores
the select string would mask this bug, the `artist_collections` mock models
PostgREST faithfully: it rejects the whole query when the select names a column the
table lacks. Asserts `offers[0].collection` is `{ id, name }`. Fail-before verified
by reverting `route.ts`: the GET test failed with `expected null to match object`
(the rejection) and the phantom guard failed on both `route.ts:174` and `:448`.
Re-applied -> pass. Both grandfather entries removed, ratchet 5 -> 3.
`npm run check` green: 168 files, 1860 tests, audit:allowlist PASS, exit 0.

## row 19 #8 — placements/[id] selects artist_profiles.profile_image, not phantom image

Commit `5191471`. Code-only.

**The defect.** The placement-detail route selected `artist_profiles.image`, which
does not exist (the column is `profile_image`). Because PostgREST rejects a select
naming a missing column, the whole artist lookup came back null, so the response's
entire `artist` block (name, slug, image) was null and the "from <artist>"
attribution link never rendered on the placement detail page. (The sibling
`venue_profiles` select on the next line is fine: venue_profiles really does have
`image`, `location` and `city`.)

**The fix.** `image -> image:profile_image` (a PostgREST alias) on the one select.
The consumer state type in `PlacementDetailClient.tsx` is `{ name; slug; image? }`
and does not render the image (only name + slug), so aliasing keeps the response's
`artist.image` shape intact with a single source-line change and no consumer edit.
Aliases are an established pattern here and are skipped by the phantom guard.

**Test.** New `route.test.ts` drives GET with the artist as the placement party. The
`artist_profiles` mock models PostgREST faithfully (rejects a select naming a column
the table lacks; skips alias tokens), so it fails before the fix (artist null) and
passes after. Asserts `body.artist` is `{ name, slug, image }`. Fail-before verified
by reverting `route.ts`: the test failed with `expected null to match object` and
the phantom guard failed on `route.ts:59`. Re-applied -> pass. Grandfather entry
removed, ratchet 3 -> 2. `npm run check` green: 169 files, 1861 tests,
audit:allowlist PASS, exit 0.

## row 19 #9 — sitemap selects artist_works.created_at, not phantom updated_at

Commit `6db8f07`. Code-only. **Closes row 19's active phantom queue.**

**The defect.** The sitemap's artwork query selected `artist_works.updated_at`,
which does not exist (the column is `created_at`). PostgREST rejected the whole
select, so `dbWorks` was null and **no artwork URL made it into the sitemap** from
the DB (only the static/seed entries survived). The sibling `artist_profiles` and
`blogs` selects on nearby lines are fine: both those tables really have `updated_at`.

**The fix.** `updated_at -> created_at` on the select, the inline row type, and the
`lastModified` read (three edits, one file). The row object is internal to the
sitemap builder (not an external response), and the old type mislabelled the field,
so a plain rename is honest and self-contained. created_at is the best available
lastmod for artist_works (it has no updated_at); noted inline.

**Test.** Added to `sitemap.test.ts` (its Supabase mock refactored to a per-test
`fromMock` so the existing fix-6.2 tests keep their empty-DB behaviour). The new
test's `artist_works` mock models PostgREST faithfully (rejects a select naming an
absent column, skips embeds/aliases), so it fails before the fix (the artwork URL is
absent) and passes after, and asserts the entry's `lastModified` equals the row's
created_at. Fail-before verified by reverting `sitemap.ts`: the test failed on
`expect(work).toBeDefined()` and the guard flagged `sitemap.ts:74`. Re-applied ->
pass. Grandfather entry removed, ratchet 2 -> 1. `npm run check` green: 169 files,
1862 tests, audit:allowlist PASS, exit 0.

**Row 19 phantom queue CLOSED.** All 10 live phantom selects the 7b guard surfaced
are resolved (#1-#9 fixed; the 10th, `free_until` at webhooks/stripe, is parked at
the ratchet floor of 1 per D14/D17.2, owner-gated). The `GRANDFATHERED` ratchet is
now at 1 and cannot shrink further without an owner decision on free_until.

## row 8 (doc `05`) §1.1 — typed write primitive `mutate()` in api-client.ts

Commit `80a7c41`. Code-only. Foundation for the E41/E42/E43 caller migrations.

**The defect class (05 §0).** `authFetch` returns the raw Response and never throws
on a non-2xx, so ~a third of callers forget `res.ok` and report a save that never
happened. Worse, `supabase.auth.getSession()` rejecting escaped *before* `fetch`
ran, so a save could fire zero requests and surface no error anywhere (bug 12).

**The fix (additive, no callers migrated yet).** Added to `src/lib/api-client.ts`:
`ApiError` (status/code/payload), `NetworkError`, a shared `authHeaders()` that
converts the getSession rejection into a typed `NetworkError`, `mutate<T>()` (the
write primitive: throws ApiError on non-2xx, NetworkError when the request never
lands, returns the parsed body on 2xx), and `isTransient()`. `authFetch` stays but
now routes through `authHeaders`, so its pre-fetch rejection is typed too. No call
sites changed this iteration — that is the E41/E42/E43 work, one per iteration.

**Test.** New `api-client.test.ts` (7 tests): 2xx returns body; non-2xx throws
ApiError with status+code; fetch-rejection and getSession-rejection both throw
NetworkError; the getSession-rejection case asserts `fetch` was never called (the
bug-12 zero-requests path); authFetch still returns a non-2xx Response without
throwing; isTransient classification. Fail-before verified by reverting
api-client.ts: 6 tests failed (`mutate is not a function`, `NetworkError is not a
constructor`). Re-applied -> pass. `npm run check` green: 170 files, 1869 tests,
audit:allowlist PASS, exit 0.

**SUPERVISOR D61 (6ee3083): row 19 confirmed CLOSED; new ROW 20 inserted** — add an
`npm run schema:snapshot` script for the phantom guard, sequenced BEFORE the next
migration (not after the remaining docs), because docs `03`/`05`/`09` carry
migrations that would leave the snapshot stale and break the guard. This reorders
the plan (surfaced per operating rule 4); it is low-risk tooling (npm script + guard
header line + a mention in the migration steps), no migration/money/prod-grant.

## ROW 20 (supervisor D61) — schema:snapshot regeneration script for the phantom guard

Commit `08495ae`. Tooling + docs.

**Why (D61.3).** The phantom guard's snapshot (`tests/integration/schema-columns.json`)
was maintained by a documented raw-SQL step with no npm script and nothing in
`scripts/`. The next column migration would leave it stale, the guard would flag the
new *real* column as a phantom, and the easy wrong fix under pressure is to add it to
`GRANDFATHERED` (hollowing out the one guard against this codebase's dominant failure
mode). Sequenced before the remaining docs because `03`/`05`/`09` carry migrations.

**What.** (a) `scripts/schema-snapshot.lib.ts` — pure `toSnapshot()` (extracts the
`{table:[cols]}` object from the query API's `[{snapshot:...}]` row array, validates,
throws on garbage) + `serialize()` (emits the committed on-disk format byte-for-byte:
2-space keys, inline `", "` column arrays, trailing newline) + `SNAPSHOT_SQL`.
(b) `scripts/schema-snapshot.ts` — thin runner: POSTs `SNAPSHOT_SQL` to the Supabase
Management API `database/query` (same `SUPABASE_ACCESS_TOKEN` + project ref as
`snapshot-advisors.ts`), writes `tests/integration/schema-columns.json`; exits 2 if
the token is unset. (c) `package.json`: `"schema:snapshot": "tsx scripts/schema-snapshot.ts"`.
(d) guard header updated to name `npm run schema:snapshot` (and warn against the
GRANDFATHERED shortcut). (e) MASTER-RUNBOOK: added to the scripts list and the
DB-task definition-of-done.

**Test.** `scripts/schema-snapshot.lib.test.ts` (8 tests): toSnapshot shape + throw
cases; serialize format; a **byte-for-byte round-trip of the committed snapshot**
(`serialize(JSON.parse(committed)) === committed`, proving the writer reproduces the
file so a no-change regen is a git no-op); and wiring assertions (package.json script
+ guard header reference). Fail-before verified by reverting package.json + the guard
header: the two wiring assertions failed. Re-applied -> pass. Runner not run
end-to-end here (no `SUPABASE_ACCESS_TOKEN` locally, and Wallplace `.env.local` is a
placeholder), but the live response shape was confirmed via the Supabase MCP
(`[{snapshot:{...}}]`, 53 tables in the same order as the committed file — a clean
no-op regen). `npm run check` green: 171 files, 1877 tests, audit:allowlist PASS,
exit 0.

## row 8 (doc `05`) §1.2 — the `useSaveAction` hook

Commit `093a08c`. Code-only. Additive (new file, no callers migrated yet).

**What.** New `src/hooks/useSaveAction.ts`, per the doc's reference impl: one save
control done correctly — an `inFlight` ref that blocks a double-submit before React
flushes `saving`; awaits `run` (which must throw, i.e. `mutate`); reports success
ONLY on a confirmed resolve (`onSuccess` + `clearDirty` + optional success toast +
`saved=true`); on failure rolls back the `optimistic` change, surfaces the real
error via `describe()` (ApiError/NetworkError message) + an error toast, and returns
false. `clearDirty` (the unsaved-changes guard) is cleared on success and nowhere
else. Confirmed `ToastContext` exposes only info|warn|error (no `success`), so
confirmed saves use the default info — not adding a variant this iteration (doc note).

**Test.** New `src/hooks/useSaveAction.test.tsx` (3 tests, `renderHook`+`act`,
`// @vitest-environment jsdom`): (a) confirmed success → true, onSuccess+clearDirty
run, one success toast, saved=true; (b) failure (`mutate` throws ApiError) → rollback
fires, clearDirty NOT called, error toast with the code, resolves false, error set;
(c) in-flight lock → a second concurrent `save()` returns false and `run` is called
once. Fail-before verified by mutating the hook's catch to report success (return
true + clearDirty): test (b) failed on `ret===false`. Restored -> pass. `npm run
check` green: 172 files, 1880 tests, audit:allowlist PASS, exit 0.

## row 8 (doc `05`) E41-a — portfolio add/edit save now awaits the write

Commit `c9a4925`. Code-only. The worst data-loss path in the app.

**The defect.** `artist-portal/portfolio/page.tsx` `saveWorks()` was fire-and-forget
(`authFetch` in a `forEach`, no `await`, no `res.ok`), and `handleSubmit` closed the
form, reset the dirty snapshot, and toasted "Artwork added" BEFORE any request
resolved. A 402 (subscription_required) / 403 (post_limit_reached) / 400 / 500 lost
the work silently while the UI reported success.

**The fix.** Extracted an awaitable `postWorks()` core (POST each work via `mutate`,
reconcile the saved row, surface warnings, throw the first rejection via
`Promise.allSettled`). `handleSubmit` now calls `saveWork.save(updated)`, a
`useSaveAction` instance whose `optimistic` snapshots+sets `works` (rollback on
failure), `run` awaits `postWorks`, `onSuccess` closes the form + clears
`editingIndex`, `clearDirty` resets `initialFormJson`, and `successMessage` toasts
only on a confirmed 2xx. The old `saveWorks` stays as a thin fire-and-forget wrapper
(`setWorks` + `void postWorks().catch`) because 7 other callers (deletes E41-b, bulk
reorders/edits E41-e) still use it — they migrate in their own findings; this keeps
E41-a scoped and non-duplicative.

**Test.** New `portfolio/page.test.tsx` (2 tests) renders the real page (mocking the
IO + layout), opens the Add form, fills title + a size price, clicks Save: (1) on
`mutate` reject `ApiError(403,...)` the error toast fires, NO "Artwork added" toast,
and the form stays open; (2) on resolve the "Artwork added" toast fires once and the
form closes. Fail-before verified by reverting `handleSubmit` to the old
unconditional-success tail: test 1 failed (fired "Artwork added" instead of the
error). `npm run check` green: 173 files, 1882 tests, audit:allowlist PASS, exit 0.

**SUPERVISOR D62 (4798b20): row 20's schema:snapshot regenerator is inert here.** It
needs `SUPABASE_ACCESS_TOKEN` (the Management API), which D12 verified is absent from
this environment, so it exits 2 until a human adds the token. My row-20 PROGRESS
entry omitted that dependency. **OWNER ESCALATION (D62.5):** adding
`SUPABASE_ACCESS_TOKEN` locally now matters — it is what keeps the phantom guard
maintainable across migrations (it joins the two CI secrets, but as a local export).

## ROW 20b (supervisor D62.4) — record the regenerator's token dependency + remedy message

Commit `2131d2a`. Tooling + docs.

**(1) Dependency recorded.** The phantom-guard header
(`tests/integration/phantom-columns.test.ts`) and `scripts/schema-snapshot.ts`'s doc
comment now both state that the regenerator hits the Supabase Management API, needs
`SUPABASE_ACCESS_TOKEN`, and is INERT in this environment (D12 verified the token is
absent) until an owner adds it (D62.5).

**(2) Remedy-pointing error.** Added `MISSING_TOKEN_MESSAGE` to
`schema-snapshot.lib.ts` and wired it into the runner's exit-2 path:
"SUPABASE_ACCESS_TOKEN not set; the schema-snapshot regenerator needs it (see
EXECUTION-DECISIONS D12/D62). Do NOT add the new column to GRANDFATHERED instead —
regenerate the snapshot once the token is set." A new lib test asserts it names the
variable, D12, and GRANDFATHERED. Fail-before verified by reverting the message to
the old bare string: the test failed on the D12 assertion.

**(3) Service-role path investigated — none clean, the token stands.** `information_schema`
(and `pg_catalog`) are not in PostgREST's exposed schema (only `public`), so the
`SUPABASE_SERVICE_ROLE_KEY` that IS present here cannot read the catalogue through
the REST API / `@supabase/supabase-js` (`from()` only addresses exposed tables). A
direct Postgres connection could, but needs a connection string this environment does
not have (D12: only `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), and there is no
`pg`/`postgres` dependency. Exposing the catalogue via a `SECURITY DEFINER` helper
was explicitly rejected (D62.4) — it would undo the function lockdown from doc `02`.
So the Management-API token is the only clean path; **the token stands** (owner action
D62.5). `npm run check` green: 173 files, 1883 tests, audit:allowlist PASS, exit 0.

## row 8 (doc `05`) E41-b — portfolio deletes now await the DELETE

Commit `bd2df65`. Code-only.

**The defect.** `handleDeleteWork` fired `authFetch(?id=..., DELETE)` with no
`await`/`res.ok` then `saveWorks(filtered)`, so the card left the grid whether or not
the DELETE succeeded (a failed delete left the work live on /browse). `bulkDelete`
did the same per id and ended with an unconditional "Deleted N works" toast.

**The fix.** One `deleteWorksSave = useSaveAction<[string[]]>`: `optimistic` removes
the ids from `works` and returns the snapshot rollback; `run` awaits
`Promise.allSettled` of `mutate("/api/artist-works?id=...", {method:"DELETE"})` and
throws the first rejection; the hook's error path shows the real error + rolls back.
`handleDeleteWork` -> `deleteWorksSave.save([work.id])`. `bulkDelete` -> `const
deleted = await deleteWorksSave.save(ids); if (deleted) { toast("Deleted N"); exitSelectMode(); }`
so the count toast + select-mode exit only fire on a confirmed delete.

**Plan note / behaviour change.** The old delete also re-POSTed every *remaining*
work (via `saveWorks(filtered)`) to renumber sort_order. The fix drops that re-POST
(it only removes the deleted rows). Relative order is preserved — `ORDER BY
sort_order` tolerates the gaps a delete leaves — so this is a strict improvement (no
more N writes per delete), not a regression. `saveWorks` stays for the reorder/bulk
callers (E41-e).

**Test.** Extended `portfolio/page.test.tsx` (+2): with a seeded work, hovering the
card reveals the Remove overlay; on `mutate` reject the error toast fires and the work
stays listed (rollback); on resolve `mutate` is called with the DELETE URL and the
card is removed. Fail-before verified by reverting `handleDeleteWork` to the
fire-and-forget path: both E41-b tests failed. `npm run check` green: 173 files, 1885
tests, audit:allowlist PASS, exit 0.

## row 8 (doc `05`) E41-d — frame payload keeps pricesBySize

Commit `181906c`. Code-only.

**The defect.** `postWorks`'s inline `frames` map carried `label`, `priceUplift`,
`imageUrl` but not `pricesBySize` (the artist's per-size frame-uplift overrides), so
every save stripped it — and because a save re-POSTs the edited work, the per-size
frame pricing was wiped for that work each time. `pricesBySize` is in the form state,
rehydrated on edit, and persisted by the API; this transform was the sole loss point.

**The fix.** Extracted the map to a pure `buildFramePayload()` in a sibling
`frame-payload.ts` (so it unit-tests without rendering the 4.8k-line editor), and
added `pricesBySize: f.pricesBySize`. `postWorks` now calls the helper. priceUplift
coercion unchanged.

**Test.** New `frame-payload.test.ts` (4 tests): pricesBySize retained; string
priceUplift coerced (and non-numeric → 0); pricesBySize stays undefined when absent
(no phantom key); undefined input → []. Fail-before verified by dropping the
`pricesBySize` key: the retention test failed. `npm run check` green: 174 files, 1889
tests, audit:allowlist PASS, exit 0.

## row 8 (doc `05`) E41-e — bulk price editor preserves per-size shipping / in-store

Commit `a595ae5`. Code-only.

**The defect.** Both bulk-editor paths rebuilt each size row from scratch:
`saveBulkPrices` kept only `{label, price}`, and the "copy sizes" action kept
`{label, price, quantityAvailable}` — both discarding per-size `shippingPrice` and
`inStorePrice` (stored in the `artist_works.pricing` JSON). So tweaking one price in
the bulk editor wiped per-size shipping + in-store pricing for every row of every
work, killing the "Collect from venue" CTA.

**The fix.** Extracted both merges to a pure sibling `bulk-pricing.ts`:
`mergeBulkPricing(existing, rows)` (matches by `sizeIndex`, so a rename keeps the
fields; spreads the existing row then overrides label/price; drops empty/£0 rows;
skips the merge for `isNew` rows) and `copySizesPricing(source, target)` (matches by
label, spreads the target row then overrides). `saveBulkPrices` and the copy-sizes
handler now call them.

**Test.** New `bulk-pricing.test.ts` (6 tests): shipping/in-store/quantity survive a
price tweak; survive a rename (by sizeIndex); a brand-new size does not inherit an
existing row; empty/£0 rows dropped; copy-sizes keeps the target's shipping/in-store
for a matching label and defaults price/quantity for an unmatched one. Fail-before
verified by dropping the merge spreads: the 3 preserve tests failed. `npm run check`
green: 175 files, 1895 tests, audit:allowlist PASS, exit 0.

## row 8 (doc `05`) E41-f — deleted the dead localStorage-only artwork editor

Commit `6a25cc6`. Code-only. Deleting beats fixing (−292 lines).

**The defect.** `artist-portal/profile/page.tsx` carried a second artwork editor: an
inline add/edit form whose `saveWorks` wrote only
`localStorage.setItem("wallplace-artist-works", ...)` — never `/api/artist-works` —
which nothing reads back and the profile refetch discards, so an artist who edited a
work here lost it. (A prior partial migration had already pointed "+ Add Work" at
`/artist-portal/portfolio` as a `<Link>`, but left the edit form live.)

**The fix (delete, not rewire).** Removed the `WorkImageDropzone` component, the work
editor state (`showWorkForm`/`editingWorkIndex`/`workForm`/`workImageRef`), the
handlers (`saveWorks`/`openAddWork`/`openEditWork`/`handleWorkImageUpload`/`submitWork`),
the inline edit modal, the `Combobox` import, the now-orphaned `uploading` state, the
`wallplace-artist-works` key, and (E41-g nit) the unread `wallplace-artist-profile`
mirror in the profile save. The works grid is now a read-only preview; the "+ Add
Work" portfolio link stays as the single authoritative editor.

**Doc correction.** The doc's suggested test ("assert no '+ Add Work' control
renders") is stale: that control is a legitimate `<Link>` to the portfolio and should
stay. The real regression is that no inline editor opens and the dead keys are never
written — that is what the test pins.

**Test.** New `profile/page.test.tsx` (jsdom, real `artists[0]` fixture so the
profile-build effect has every field): renders, shows the work read-only, clicking a
card opens NO "Edit Work"/"Add New Work" modal, and `localStorage.setItem` is never
called with either key. Fail-before verified by restoring the pre-delete editor: the
click opened the "Edit Work" modal and the test failed. `npm run check` green: 176
files, 1896 tests, audit:allowlist PASS, exit 0.

**SUPERVISOR D63 (7e9fee4): record E41-c's status; E41-g void.** E41-c was worked
around (a→b→d→e→f) with no PROGRESS record. Per D63 (ordering fine, no re-sequence,
just record it):
- **E41-c — TAKE NEXT.** Real, loop-actionable, and the largest E41 defect: every save
  re-POSTs the entire portfolio (one write per work), so editing one work in a 20-work
  portfolio fires 20 concurrent SELECT+UPDATE+read-back writes, and it makes the
  `existingWorks.length >= postLimit` check at `api/artist-works/route.ts:70` a TOCTOU
  race. Fix: in `postWorks`/`saveWorks`, diff against a last-known-persisted snapshot
  and POST only genuinely changed works (a lightweight `{id, sortOrder}` batch for
  pure reorders). Doc `05 §E41-c`.
- **E41-g — VOID (already correct).** The artist-profile `handleSave` awaits, checks
  `!res.ok`, toasts on failure and only then clears the dirty flag (SAFE per the doc);
  its only nit, the `wallplace-artist-profile` localStorage mirror, was removed in
  E41-f above. Nothing to do.

## row 8 (doc `05`) E41-c — a save POSTs only the changed works

Commit `642a3f5`. Code-only.

**The defect.** `postWorks(updated)` mapped over ALL of `updated` and POSTed each
work, so editing one work in a 20-work portfolio fired 20 concurrent
`mutate("/api/artist-works", POST)` calls (each a SELECT+UPDATE+read-back). It also
turned the per-tier post-limit check into a TOCTOU (below).

**The fix (client-side diff).** Extracted a pure `worksToPost(updated, persisted)` to
`changed-works.ts`: returns only the works that are new (no persisted match by id),
moved (index/sortOrder changed), or field-changed (a canonical `postKey` over the
POSTed fields differs), each with its new index. Added a `persistedWorks` ref seeded
from the loaded artist and advanced to `updated` after each successful `postWorks`;
`postWorks` now POSTs only `worksToPost(...)`. The delete path advances the baseline
too (drops deleted ids) so a later edit does not re-POST index-shifted works.

**Test.** `changed-works.test.ts` (5): only the field-changed work returned (with its
index); a new work included; `[]` when nothing changed; moved works returned on a
reorder but not the unmoved one; a per-size shipping change detected. Plus a render
test in `portfolio/page.test.tsx`: adding one work to a 2-work portfolio calls
`mutate` ONCE, not three times. Fail-before verified by making `worksToPost` return
every work: 4 unit tests + the mutate-once render test failed. `npm run check` green:
177 files, 1902 tests, audit:allowlist PASS, exit 0.

**SURFACED — residual server-side TOCTOU (owner / not loop-fixable client-side).**
`src/app/api/artist-works/route.ts` reads `existingWorks = getWorksByArtistProfileId(...)`
then checks `isNewWork` + `existingWorks.length >= postLimit` and inserts — a
read-then-write with no DB-level guard, so two concurrent new-work POSTs can both pass
the cap. E41-c removes the CLIENT's habit of firing N concurrent POSTs (the usual
trigger), which greatly narrows the window, but the server check is still not atomic.
A proper fix is a DB-level constraint/transaction (e.g. count-in-a-transaction or a
partial unique/exclusion guard) — a migration + owner call, out of scope for this
client finding. Recorded for the owner.

**Reorder batch:** the doc suggested a lightweight `{id, sortOrder}` batch for pure
reorders; the route has no such batch endpoint, so a reorder simply marks the moved
works "changed" and POSTs them normally (far fewer than the whole portfolio). A
dedicated reorder endpoint is a possible future optimisation, not built here.

## row 8 (doc `05`) E42-a — venue profile: display split from input value

Commit `6b67966`. Code-only.

**The defect.** The venue detail rows bound a display fallback chain
(`detailType || venue?.type || "Not set"`, `detailName || venue?.name || "Your Venue"`)
straight into the controlled `<input value>`. The `detail*` states ARE hydrated from
the venue, so the fallback only fired when a field was empty — but then edit mode
seeded the input with the literal "Not set"/"Your Venue", the first keystroke made it
"Not setCafe", and the footfall `type=number` got an invalid `value="Not set"`.

**The fix.** Each row now carries `value` (the editable state only) and `display`
(the `|| "Not set"` fallback). The edit `<input value>` uses `value`; the read-only
`<p>` uses `display` (with muted-italic styling when unset). The "Not set"/"Your
Venue" strings can no longer enter the input. Added real placeholders per row.

**Test.** New `venue-portal/profile/page.test.tsx` (jsdom, venue with `type`
undefined): enter edit mode, assert the type input's `value === ""` (its placeholder
"e.g. Independent cafe", not "Not set"), type "Cafe", assert the PUT body carries
`type: "Cafe"` (not "Not setCafe"). Fail-before verified by restoring the fallback in
the type row's `value`: the input read "Not set" and the assertion failed. `npm run
check` green: 178 files, 1903 tests, audit:allowlist PASS, exit 0.

**SUPERVISOR D64 (aa4cf10): the post-limit TOCTOU is NOT owner-gated — reassigned to
ROW 21.** D64 overruled the E41-c escalation: the loop's standing authority covers
migrations, the codebase already has the atomic pattern (D5 `decrement_work_stock`,
`restock_work`/087), and enforcing an existing cap correctly is no policy change. The
owner background-task chip was dismissed. Row 21 (below) is loop-actionable, sequenced
AFTER doc `05` closes (real but low-urgency; E41-c already removed the client's N
concurrent POSTs).

## row 8 (doc `05`) E42-b — BLOCKED: the two venue columns do not exist in prod (OWNER decision)

**RESOLVED by supervisor D66 (c1e5f12) — no longer owner-gated; reassigned to row 23.**
D66 ruled the two halves are different problems with different answers, both the loop's:
(a) `interested_in_local_artists` is a genuinely rendered, state-bound checkbox
(`page.tsx:212/:249/:616`) whose value is discarded — **build it** (one nullable boolean
column + allowlist entry; persisting a shipped control is completion, not a feature
call); (b) `preferred_sizes` is **vestigial** — its only non-test reference is a comment
at `writable-fields.ts:170`, no UI/reader/data, so **drop the dead refs**. This corrects
my note below: there is NO sizes selector in the UI (I over-assumed symmetry with the
Local-artists toggle), and `preferred_styles` DOES exist in prod, so the pair was an
incomplete migration, not a deliberate dormant feature. Tracked as row 23, after `05`.

**(Original block note, superseded — kept for the trail.) The plan is wrong about prod.** E42-b asks to add `interested_in_local_artists` and
`preferred_sizes` to the venue PUT payload, on the doc's premise that "both columns
exist". They do NOT: `tests/integration/schema-columns.json` venue_profiles lacks
both, and a live query against prod (`information_schema.columns ... venue_profiles`,
project uwkuhygwvasdzwsusiym) returned zero matches for local_artist / preferred_size /
size / artist. Adding them to the payload would make the save error (unknown column)
the moment the server strip is gone.

**Owner decision needed.** The venue-profile UI DOES have the "Local artists" toggle
and a sizes selector, and the DAO named the columns — so the feature was built but the
migration to create the columns was never applied. Either (A) add an additive
migration creating `interested_in_local_artists boolean default false` and
`preferred_sizes text[]` on venue_profiles (then wire the payload + hydrate sizes from
`venue.preferredSizes` + regenerate the guard snapshot), completing the built feature;
or (B) treat it as intentionally dormant and drop E42-b. Recording as BLOCKED (loop
rule: record + move to the next unblocked task) rather than migrating prod schema for a
possibly-dormant feature without a steer. **E42-a's `sizes` state stays hydrated from
the existing literal until this is decided.**

## row 8 (doc `05`) E42-c — venue-profiles DAO no longer strips columns that DO exist

Commit `9d8835c`. Code-only. Done AHEAD of E42-b (E42-b blocked).

**The defect.** `upsertVenueProfile` (`src/lib/db/venue-profiles.ts`) stripped 7
columns before writing: the UPDATE branch retried-without-them on ANY error and
returned success (so a constraint failure elsewhere silently dropped the venue's
photos + display details), and the INSERT branch stripped them UNCONDITIONALLY (a new
venue could never persist photos on first save). Five of the seven — `images`,
`display_wall_space`, `display_lighting`, `display_install_notes`,
`display_rotation_frequency` — exist in prod (migrations 022/028 applied), so the
strip is pure data-loss.

**The fix.** Deleted both strip-lists: the UPDATE branch is a single update that
returns its error (no strip-and-retry-to-false-success); the INSERT branch inserts the
data as-is. Safe now because the current payload does NOT contain the two non-existent
columns (E42-b blocked) — so nothing errors. **Doc-vs-prod divergence noted:** the doc
said "delete both strip-lists" assuming all 7 columns exist; 2 do not, but since they
are absent from the payload the deletion is correct, and once E42-b's migration adds
them they will persist rather than being stripped.

**Test.** New `venue-profiles.test.ts` (2): the insert branch keeps `images` +
`display_wall_space`; the update branch surfaces a first-attempt error instead of
retrying to a false success (and calls update once, not twice). Fail-before verified
by restoring the strip version: both failed. `npm run check` green: 179 files, 1905
tests, audit:allowlist PASS, exit 0. (Code-only, no migration/RLS change.)

## row 8 (doc `05`) E42-d — venue fields can be blanked (`|| null`, not `|| undefined`)

Commit `f7e81d9`. Code-only.

**The defect.** The venue PUT payload sent `detailName || undefined` (and 8 more
clearable text fields). `JSON.stringify` omits `undefined` keys, so once a field had a
value a venue could never blank it: clearing the input made the state `""`, `"" ||
undefined` was `undefined`, the key was dropped from the JSON, and the DAO's UPDATE
never touched the column, so the old value stuck.

**The fix.** Changed the 9 clearable text fields (`name`, `type`, `location`,
`wall_space`, `approximate_footfall`, `display_wall_space`, `display_lighting`,
`display_install_notes`, `display_rotation_frequency`) from `|| undefined` to `||
null`, so an emptied field sends `null` and the DAO writes NULL. Left the arrays
(`preferred_styles`/`themes`/`images`) and booleans untouched. E42-c already removed
the server strip, so the NULL lands cleanly.

**Test.** Extended `venue-portal/profile/page.test.tsx`: a venue with `type: "Cafe"`,
enter edit, clear the type input, Save — the PUT body has `type: null` and the key is
present. Fail-before verified by reverting the `type` field to `|| undefined`: the key
was dropped and the assertion failed. `npm run check` green: 179 files, 1906 tests,
audit:allowlist PASS, exit 0.

**Next: doc `05` E42-e** — `venue-portal/profile/page.tsx` hand-rolls a `beforeunload`
handler with only `e.preventDefault()` (no `e.returnValue = ""`, and no capture-phase
anchor interception for Next.js client nav). Replace it with
`useUnsavedWarning(hasUnsavedChanges)` from `@/lib/use-unsaved-warning` (which sets
both and catches client nav). Re-read the effect first. That closes the E42 venue
findings that are loop-actionable (E42-b stays BLOCKED on the owner column decision).
Then E43-a..k, bug-12; `no-authfetch-mutation` eslint rule LAST.

## row 8 (doc `05`) E42-e — venue unsaved-changes guard uses the shared hook

Commit `33a15f2`. Code-only.

**The defect.** `venue-portal/profile/page.tsx` hand-rolled its own unsaved-changes
guard: a `useEffect` that added a `beforeunload` listener whose handler only called
`e.preventDefault()`. It never set `e.returnValue = ""` (some browsers still need the
pair to actually show the native "leave without saving?" dialog), and it did nothing
about Next.js client-side `<Link>` navigation — so clicking any in-app link with a
dirty form left silently, no warning. The shared `useUnsavedWarning`
(`src/lib/use-unsaved-warning.ts`) sets both `preventDefault` + `returnValue` AND adds
a capture-phase document click listener that `confirm()`s before same-origin `<Link>`
navigation.

**The fix.** Deleted the hand-rolled `useEffect` and replaced it with a single
`useUnsavedWarning(hasUnsavedChanges)` call (import added from
`@/lib/use-unsaved-warning`), mirroring `artist-portal/profile/page.tsx:403` and
`portfolio/page.tsx:329`. No `_v2`-beside-`_v1`: the old effect is gone in the same
commit. `useEffect` stays imported (still used by the load effect at line ~243).

**Test.** Extended `venue-portal/profile/page.test.tsx`: mocked
`@/lib/use-unsaved-warning` with a spy, rendered the page (spy called with `false` on
the clean first render), entered edit mode and changed the type field (→ `markDirty()`
→ `hasUnsavedChanges = true`), and asserted the spy was then called with `true`.
Fail-before verified by restoring the pre-fix hand-rolled effect: the spy was called 0
times and the assertion failed (`Number of calls: 0`). `npm run check` green: 179
files, 1907 tests (+1), audit:allowlist PASS, exit 0.

**E42 status.** With E42-e done, every E42 venue finding under this doc is resolved
(a, c, d, e). **E42-b was un-blocked by supervisor D66** while this iteration ran: it
is no longer owner-gated. D66 split it into row 23 (loop-actionable, after `05` with
rows 21/22): build `interested_in_local_artists` (a shipped, state-bound checkbox at
`page.tsx:616` whose value is currently discarded) as one nullable boolean column, and
drop the vestigial `preferred_sizes` references. D66 committed in isolation (c1e5f12)
per operating rule 4; the row-23 ledger entry above reflects it.

**Next: doc `05` E43-a** — placement status update in BOTH portals
(`artist-portal/placements/page.tsx` + `venue-portal/placements/page.tsx`
`updateStatus`): optimistic `setPlacements` with no `res.ok` check, and it dispatches a
`wallplace:placement-changed` event even on a 403/500. Route through `mutate` +
`useSaveAction`, snapshot-rollback on failure, fire the event only in `onSuccess`.

## row 8 (doc `05`) E43-a — placement status update: rollback + success-only event, in one shared helper

Commit `e462197`. Code + new lib + test.

**The defect (both portals).** `artist-portal/placements/page.tsx` and
`venue-portal/placements/page.tsx` had byte-for-byte identical `updateStatus` handlers:
an optimistic `setPlacements(...)` with no snapshot, then
`authFetch("/api/placements", { method: "PATCH", ... }).then(() => window.dispatchEvent(new
CustomEvent("wallplace:placement-changed", ...)))`. `authFetch` resolves for non-2xx
(it never throws on a bad status), so the `.then` fired the cross-portal refresh event
on a 403/500 too — a rejected status change looked successful on BOTH portals, the
optimistic row stuck with no rollback, and every other open surface refreshed as if the
change had landed. The `.catch` handled only network errors, logging to console with no
rollback either.

**The fix.** Extracted the logic into one shared helper,
`src/lib/placements/status-update.ts` → `updatePlacementStatus<P>({ id, newStatus,
placements, setPlacements, showToast })`, and both `updateStatus` handlers are now a
one-line call to it (the duplicated inline logic is deleted in the same commit — no
`_v2` beside `_v1`). The helper snapshots the list before the optimistic write, `await`s
the PATCH, checks `res.ok`, and on failure rolls back to the snapshot + shows an error
toast + returns false; on a network error it does the same in `catch`; the
`wallplace:placement-changed` event fires ONLY on a 2xx. This mirrors the correct
`cancelPlacement`/`archivePlacement` handlers already in both files. (I mirrored the
file's own `authFetch`+`res.ok` idiom rather than introducing `mutate`/`useSaveAction`
into one handler while its three siblings still use raw `authFetch`; the whole file
migrates to `mutate` together at the final `no-authfetch-mutation` step. Same net
behaviour — throws-free, res.ok-checked, rollback on failure.)

**Test.** New `src/lib/placements/status-update.test.ts` (jsdom, mocks `authFetch`):
(1) non-2xx (403) → returns false, `setPlacements` called twice (optimistic then the
exact snapshot = full rollback), event NOT fired, error toast with the server message;
(2) 2xx → returns true, `setPlacements` called once (no rollback), event fired exactly
once, no toast; (3) network reject → rollback + toast, no event. Plus an `apiStatusFor`
mapping test. Fail-before verified by stripping the `res.ok` guard from the helper (old
behaviour): the 403 test failed (`expected true to be false` — it returned true and
would have fired the event without rolling back). Restored. `npm run check` green: 180
files (+1), 1911 tests (+4), audit:allowlist PASS, exit 0.

**Why a shared helper, not a per-page render test.** Both pages are ~1900-line client
components with heavy multi-call load flows; seeding one placement row through that to
fire a `<select>` onChange would be fragile. The two handlers were identical, so lifting
them into one tested helper (the same extract-and-test pattern used for the E41 portfolio
libs `frame-payload.ts`/`changed-works.ts`, and matching the existing
`lib/placements/*.ts` + `*.test.ts` pairs) is DRY, deterministic, and removes the
duplication that let the two copies drift.

**Next: doc `05` E43-b** — withdraw offer in `components/offers/OffersList.tsx`: `act()`
returns void so the success toast fires regardless of the response. Make `act` return
`Promise<boolean>` (false in the `!res.ok` and catch branches) and gate the toast, or
route it through `useSaveAction`.

## row 8 (doc `05`) E43-b — withdraw offer: gate the success toast on the result

Commit `37b4ea9`. Code + test.

**The defect.** In `src/components/offers/OffersList.tsx` the withdraw confirm handler
was `await act(target.id, "withdraw"); showToast("Offer withdrawn.");`. `act()` returned
`void`: on a non-2xx it set an inline error banner (`setError`) and on a network error it
set a network-error banner, but it never signalled failure to its caller. Since
`authFetch` resolves for non-2xx, `act` always resolved and the success toast fired every
time — a 403/500 or offline showed a green "Offer withdrawn." while the offer stayed
pending (the failed path does not re-run `load()`). The user saw a success toast AND a red
error banner at once.

**The fix.** `act` now returns `Promise<boolean>` — `false` in the `!res.ok` branch and
the `catch`, `true` only after a confirmed 2xx (including the accept→pay redirect path).
The withdraw caller gates on it: success toast on `true`, an error toast
("Could not withdraw the offer. Please try again.", variant error) on `false`. The
accept/decline button callers ignore the return value and keep relying on `act`'s inline
error banner, unchanged. No behaviour change on success. (Kept the file's own
`authFetch`+`res.ok` idiom rather than introducing `mutate` here; the whole file migrates
to `mutate` together at the final `no-authfetch-mutation` step.)

**Test.** New `src/components/offers/OffersList.test.tsx` (jsdom; mocks `authFetch`,
`useToast`, `ConfirmDialog` → a plain confirm button when open): seed one pending
sender-side offer so the Withdraw button renders, click it, confirm. (1) PATCH 403 → the
error toast fires, the "Offer withdrawn." success toast does NOT, and the offer stays on
screen; (2) PATCH 2xx → success toast fires, no error toast. Fail-before verified by
reverting the caller to the old `await act(...); showToast("Offer withdrawn.")`: the 403
test failed (it fired "Offer withdrawn." instead of the error toast). `npm run check`
green: 181 files (+1), 1913 tests (+2), audit:allowlist PASS, exit 0.

**Next: doc `05` E43-c** — mark fulfilled in `venue-portal/artwork-requests/[id]/page.tsx`:
`setStatus` swallows the catch and never checks `res.ok`, so a failed status change reads
as done. Await + check `res.ok` (or `useSaveAction`), and reload via `load()` only on
success.

## row 8 (doc `05`) E43-c — artwork-request setStatus: check res.ok, surface the error

Commit `4339efd`. Code + test.

**The defect.** In `src/app/(pages)/venue-portal/artwork-requests/[id]/page.tsx`,
`setStatus` (behind the "Mark fulfilled" and "Close" buttons) was
`try { await authFetch(...PATCH...); await load(); } catch { /* swallow */ }`. It never
checked `res.ok` and the catch was empty. Since `authFetch` resolves for non-2xx, a
403/500 fell through to `load()` (which re-fetches the true, unchanged state) and a
network error was swallowed — either way the click silently did nothing and no error
surfaced. It was the only handler in the file not following the `act()` /
`fulfillResponse()` shape.

**The fix.** `setStatus` now mirrors those two: `setError(null)` up front, check
`res.ok`, on failure `setError(data.error || "Could not update the request status. Please
try again.")` and return without reloading, on success `await load()`, and a network-error
`setError` in the catch. The file already renders `{error && <p ...>}` (line ~261) right
by the buttons.

**Plan divergence (noted per the non-negotiable).** The doc said "show an error toast
(via `useToast`)". This file does not import `useToast`; its two sibling handlers surface
errors via `setError` + an inline banner. I used the file's own `setError` idiom for
consistency rather than introducing `useToast` into one handler. Same user-visible
outcome: the failure is shown, the status does not advance.

**Test.** New `venue-portal/artwork-requests/[id]/page.test.tsx` (jsdom; the page unwraps
`params` via `use()`, so the render is wrapped in `<Suspense>` and flushed inside
`act()`): (1) PATCH 403 → the error banner shows and the open-only "Mark fulfilled"
button remains (status did not advance); (2) PATCH 2xx → the reload returns `fulfilled`
so the button disappears, with no error. Fail-before verified by restoring the swallowing
`setStatus`: the 403 test failed (no error banner appeared). `npm run check` green: 182
files (+1), 1915 tests (+2), audit:allowlist PASS, exit 0.

**SUPERVISOR D67 (10fc64d) — plan reorder, ESCALATED to owner (rule 4), not yet
actioned.** While this iteration ran, the supervisor ruled that the
`no-authfetch-mutation` lint rule should move from LAST to FIRST in the remaining E43
work (land at `warn` with a grandfathered ratchet like the 7b phantom guard; the rule's
output becomes the real E43 list; work the union, shrink the ratchet per fix, flip to
`error` at zero). Operating rule 4 requires escalating a plan reorder regardless of
signature, so I committed D67 in isolation and surfaced the decision to the owner rather
than acting on it. Until the owner steers, the pre-D67 order stands (next would be E43-d).

**Next (OWNER ANSWERED D67 = "Follow D67, rule first", 2026-07-31): write the
`no-authfetch-mutation` eslint rule** at `warn` with a grandfathered ratchet (7b
phantom-guard style). Run it; its output is the real E43 list. Reconcile against E43-d..k
(flagged → fix + shrink the ratchet in the same commit; not flagged → void or
out-of-reach with a reason). Then bug-12; flip the rule to `error` at ratchet zero.

**Governance note (2026-07-31).** Supervisor D68 (e80f9aa) amended operating rule 4: the
ORDER of already-approved tasks is now the loop's to change on a signed supervisor
ruling; SCOPE (add/drop a task, change what a task builds, touch prod grants/data, move
money, reverse an owner decision) still escalates. D67 was correctly escalated under the
old text and the owner approved it. D69 (e80f9aa) is a diagnostic flagging a
stall-after-docs-only-commit pattern for the owner to check in the loop's wakeup logic
(no code action on this side; the loop keeps re-arming after every iteration incl.
docs-only ones).

## row 8 (doc `05`) E43 rule — `no-authfetch-mutation` at warn + grandfathered ratchet (D67, owner-approved)

Commit `468e3f1`. Rule + config + 2 tests.

**Why this ran first (owner-approved D67).** The E43 family is one defect: `authFetch`
returns the raw Response and RESOLVES on a non-2xx (it never throws), so a mutation
written with it runs its success path on a 403/500. The hand-written list was 11 items
(E43-a..k). The rule, run over all of `src`, finds **94 mutating `authFetch` calls across
44 files** — roughly 8x the hand list. That gap is exactly D67's argument (a read finds
~half the surface; a detector finds all of it), and the 7b phantom guard is the
precedent (4 hand-known columns → 10 live bugs once the snapshot-built guard ran).

**What landed.**
- `eslint-rules/no-authfetch-mutation.js`: flags `authFetch(url, { method: "POST"|"PUT"|"PATCH"|"DELETE" })` (string-literal verb, case-insensitive). Registered in `eslint-rules/index.js` and set to **`warn`** in `eslint.config.mjs` (build stays green). Documented limits: a non-literal verb or a variable options object is not visible to the AST (the ratchet count is the backstop); GET/HEAD and method-less options are reads.
- `tests/integration/eslint-no-authfetch-mutation.test.ts`: 10 RuleTester cases (flags PATCH/POST/PUT/DELETE, case-insensitive, spread options, one-per-call; does not flag GET, method-less, `mutate()`, dynamic verb, or test files).
- `tests/integration/authfetch-mutation-ratchet.test.ts`: runs `npx eslint src/**/*.{ts,tsx} -f json`, counts the rule's messages, asserts `=== LITERAL_FLOOR (94)` and that the rule severity is `warn` while the floor is non-zero. Mirrors the authz-import ratchet. Teeth verified: setting the floor to 93 fails with "Expected 93, found 94".

**Verification.** `npm run check` green: 184 files (+2), 1927 tests (+12), the 94 rule hits
appear as **warnings** (not errors) in the lint pass, audit:allowlist PASS, exit 0.

**Reconciliation of the 94 against the hand-enumerated E43-d..k + bug-12** (D67.3 step 4):
| Hand item | In the 94? | Notes |
|---|---|---|
| E43-d artist-portal/portfolio | yes (1) | shipping save |
| E43-e components/MessageInbox | yes (12) | report/delete/block among them (trust & safety) |
| E43-g artist-portal/saved + customer-portal/saved | yes (1 + 1) | |
| E43-h browse/[slug]/ArtistProfileClient | yes (1) | public enquiry |
| E43-i components/Header | yes (3) | mark-as-read |
| E43-j components/VenuePortalLayout | yes (1) | self-heal |
| bug-12 components/BlogEditor | yes (3) | authFetch half; the flag-gate/`notFound()` half is a SEPARATE change the rule can't see |
| **E43-f venue-portal/enquiries** | **NO** | **out of the rule's reach — dead View buttons with no onClick/href, not an authFetch mutation. Still needs its own fix.** |

The other ~70 sites (billing, orders, collections, addresses, admin pages, placement
detail/loan/stepper, SavedContext, dialogs, etc.) were never in the hand list — they are
the surface D67 predicted the reading missed.

**Go-forward (D67 steps 2-3).** Work the union ONE file (or one handler) per iteration:
migrate each `authFetch` mutation to `mutate()` and fix the false-success handling
(await + the thrown ApiError/NetworkError, rollback, success-only side-effects), then
LOWER `LITERAL_FLOOR` by the number migrated in the SAME commit. When it reaches 0, flip
the rule to `error` in `eslint.config.mjs` and delete the ratchet file. E43-f is handled
separately (no authFetch to migrate). Note: `mutate()` throwing is a bigger change than
the minimal res.ok checks used in E43-a/b/c — those three are already correct on the
res.ok axis and remain in the 94 only because they still call `authFetch`; migrating them
to `mutate` is a mechanical simplification.

**Next: begin the union — E43-e (`components/MessageInbox.tsx`, 12 sites, the report /
delete / block trust-and-safety trio is the priority) OR the highest-value cluster**, one
per iteration, each lowering the floor. Task 0 (`continue-on-error` in ci.yml) still
pending as its own change.

## row 8 (doc `05`) E43-e — MessageInbox report/delete/block via a shared submitFlagAction helper

Commit `7381399`. Code + new lib + test. First migration under the D67 rule; ratchet floor 94 → 91.

**The defect.** The Report / Delete / Block actions in the message flag popup
(`components/MessageInbox.tsx`) each did `try { await authFetch(url, { method }) } catch
{ /* swallow */ } setFlagSubmitted(outcome)`. `authFetch` resolves on a non-2xx and the
catch swallowed network errors, so the confirmation ("Report submitted" / archive done /
"User blocked") was shown regardless. **Block was the worst**: a user could believe a
harasser was blocked when the block never persisted.

**The fix.** Extracted the shared shape into `src/lib/messages/flag-action.ts` →
`submitFlagAction({ url, method, body, outcome, errorMessage, setSubmitting, setSubmitted,
showToast })`, which calls `mutate()` (throws ApiError on non-2xx, NetworkError when the
request never lands), sets the confirmation ONLY after it resolves, and shows an error
toast on failure. All three handlers are now one call to it; the inline try/catch blocks
are deleted (no `_v2`). `mutate` is no longer imported into MessageInbox directly.

**Why a helper, not a render test.** MessageInbox is 1768 lines; driving the block flow
through a render (seed conversations → select one → open the flag popup → confirm) is
fragile. The three handlers were identical, so extracting + unit-testing mirrors the
E43-a (`updatePlacementStatus`) precedent.

**Test.** New `src/lib/messages/flag-action.test.ts` (mocks `mutate`): success sets the
outcome + no error toast; a rejected block does NOT set the outcome, shows the error
toast, returns false; the method + JSON body are passed through. Fail-before verified by
setting the outcome unconditionally (old behaviour): the reject test failed. A subtle
harness bug surfaced and is worth recording: `beforeEach(() => mutateMock.mockReset())`
returns the mock, and **vitest registers a function returned from a hook as a teardown
callback**, so it called the (throwing) mock during teardown. Fixed with a block-body
`beforeEach(() => { mutateMock.mockReset(); })`.

**Ratchet.** Migrated 3 of MessageInbox's 12 sites → measured 91 remaining, lowered
`LITERAL_FLOOR` 94 → 91 in `authfetch-mutation-ratchet.test.ts`. `npm run check` green:
185 files (+1), 1930 tests (+3), the rule's 91 hits are warnings, audit PASS, exit 0.

**Batching change (supervisor D70.3, actioned — sequencing within approved scope, no
escalation under amended rule 4).** Go-forward is **per FILE, not per call site**: 44
files vs 94 sites, and sites in a file share a shape/import/test. This E43-e iteration did
only the trust-and-safety trio (a pre-D70 sub-unit); from here each iteration migrates
every mutating `authFetch` in one file and lowers the floor by that file's count. Also
**D70.2: 94 is a migration surface, not 94 bugs** — the rule has no `res.ok` exemption, so
it includes already-correct-but-non-standard sites; the live-bug subset is the unchecked
ones.

**Next: finish `MessageInbox.tsx`** — its remaining ~9 mutating `authFetch` sites
(message send ×2, mark-read PATCH, delete conversation/message, pin, offer accept/decline,
placement PATCH), migrated to `mutate` with proper success/error handling, lowering the
floor by ~9.

## row 8 (doc `05`) MessageInbox.tsx COMPLETE — 9 mutating authFetch → mutate (per-file, D70.3)

Commit `e4ff19f`. Code + test. Ratchet floor 91 → 82.

**What changed.** Migrated the remaining 9 mutating `authFetch` calls in
`components/MessageInbox.tsx` to `mutate()` (throws ApiError on non-2xx, NetworkError on
request failure), per the D70.3 per-file batch. The 2 read GETs (load conversations,
load thread) keep `authFetch` — the rule only flags mutations. Sites:
- `handleSendReply` POST, `handleSendNewMessage` POST — optimistic append / compose-close
  now only run on a confirmed send; the error is set from the thrown message.
- mark-conversation-read PATCH (in `loadThread`) — wrapped in its OWN try/catch so a
  failed best-effort mark-read neither reports the thread load as failed nor clears the
  unread badge (previously `authFetch` resolved and the badge cleared regardless).
- `handleDeleteConversation` DELETE, `handleTogglePin` PATCH, `handleDeleteMessage`
  DELETE — the optimistic-then-rollback handlers now roll back in the `catch`; the toast
  uses the server message when `err instanceof ApiError`, else the file's existing
  network-error string.
- `handleOfferResponse` PATCH + its checkout POST, `handlePlacementResponse` PATCH — the
  PATCH failure toasts + returns; the checkout stays best-effort (fall through to
  refresh); navigation (`window.location.href`) only on the success path.

**Test.** New `components/MessageInbox.test.tsx` (jsdom): drives the compose flow via
`initialArtistSlug` (opens compose with the recipient pre-set once the load resolves).
A rejected `handleSendNewMessage` surfaces the error and keeps compose open; a confirmed
send closes it and calls `mutate("/api/messages", {POST})`. Needed a `window.matchMedia`
stub (jsdom lacks it; the component reads it for its desktop/mobile layout) and a
fresh-`Response`-per-call authFetch mock (a Response body reads once). Fail-before
verified by dropping `setSendError` from the catch: the error no longer appeared.
`npm run check` green: 186 files (+1), 1932 tests (+2), MessageInbox now 0-flagged by the
rule, ratchet at 82, audit PASS, exit 0.

**Next: continue the per-file migration** — E43-d (`artist-portal/portfolio/page.tsx`
shipping-settings save, 1 site; the file already uses `mutate` for works), then E43-g
(saved-item removal, `artist-portal/saved` + `customer-portal/saved`), E43-h, E43-i
(`Header.tsx` ×3), E43-j, bug-12 (`BlogEditor.tsx` ×3), then the ~70 remaining sites by
file. Floor 82 → 0, then flip the rule to `error`.

## row 8 (doc `05`) E43-d — portfolio shipping-settings save → mutate (per-file, floor 82→81)

Commit `e70ca39`. `src/app/(pages)/artist-portal/portfolio/page.tsx` + its test.

The shipping "Save Shipping Settings" button did `await authFetch("/api/artist-profile",
{ method: "PUT", body }).catch(() => {})` — no `res.ok`, swallowed errors, and NO user
feedback at all (the finding E43-d). A rejected save silently no-op'd. Migrated to
`mutate` in a try/catch: success shows "Shipping settings saved", failure shows the server
message (or a fallback) with `variant: "error"`. The file already used `mutate` for works
(E41); its `/api/artist-profile` GET (read) stays on `authFetch`.

Extended `portfolio/page.test.tsx`: a 2xx shows the success toast (and PUTs to
`/api/artist-profile`); a rejected `ApiError` shows the error toast and NOT the success
toast. Fail-before verified by restoring the `authFetch(...).catch(() => {})` (both tests
failed: no toast). Ratchet `LITERAL_FLOOR` 82 → 81 (portfolio now 0-flagged). `npm run
check` green: 186 files, 1934 tests (+2), exit 0.

**Next: E43-g** — saved-item removal `handleRemove` in `artist-portal/saved/page.tsx` and
`customer-portal/saved/page.tsx` (res.ok unchecked, failure ignored). Migrate to `mutate`
with optimistic + rollback, or route through `SavedContext.toggleSaved`.

## row 8 (doc `05`) E43-g — saved-item removal (both portals) → mutate (per-file, floor 81→79)

Commit `516ec5f`. `artist-portal/saved/page.tsx` + `customer-portal/saved/page.tsx` + one test.

Both `handleRemove` handlers were `try { await authFetch("/api/saved", {DELETE, body}); setItems(filter) } catch { /* ignore */ }`. `authFetch` resolves on a non-2xx, so `setItems(filter)` ran on a 403/500 too — the item vanished from the UI and reappeared on the next reload, while a network error was swallowed silently. Migrated both to `mutate` (throws on a non-2xx): the item is dropped ONLY on a confirmed delete, and a failure shows an error toast (server message via `err instanceof ApiError`, else a fallback) and leaves the item in place. Added `useToast` to both files; the `/api/saved` read GET stays on `authFetch`.

Test: `artist-portal/saved/page.test.tsx` (jsdom; importActual keeps `ApiError`, mocks `mutate`/`authFetch`/global `fetch`, seeds one saved work): a rejected delete shows the error toast and the "Remove" button stays; a confirmed delete removes it. Fail-before verified by swapping `mutate`→`authFetch` (no error toast). Ratchet `LITERAL_FLOOR` 81 → 79 (both pages 0-flagged). `npm run check` green: 187 files (+1), 1936 tests (+2), exit 0.

**Next: E43-h** — public enquiry form in `browse/[slug]/ArtistProfileClient.tsx`: the catch sets `setEnquirySent(true)` (the happy path), so a failed enquiry shows success. /api/messages must succeed (mutate); /api/enquiry stays best-effort.

## row 8 (doc `05`) E43-h — public enquiry form → mutate, confirm only on success (floor 79→78)

Commit `3d51a9b`. `browse/[slug]/ArtistProfileClient.tsx` + new test.

The enquiry submit did `try { await authFetch("/api/messages", {POST}); await fetch("/api/enquiry", {POST}); setEnquirySent(true) } catch { setEnquirySent(true) }`. Two false-success paths: `authFetch` resolves on a non-2xx so a rejected message fell through to the confirmation, AND the catch set `setEnquirySent(true)` so a network error also confirmed. A visitor was told their enquiry was sent when it was not.

Fixed: the primary `/api/messages` send goes through `mutate` (throws on a non-2xx); `setEnquirySent(true)` runs only after it resolves; the catch shows an error toast (server message via `ApiError`, else a fallback) and does NOT confirm. The secondary `/api/enquiry` (backward-compat, a bare `fetch` the rule does not flag) is now wrapped in its own try/catch so its failure is best-effort and does not undo the confirmation. `authFetch` dropped from the import (no reads left in this file).

Test: `browse/[slug]/ArtistProfileClient.test.tsx` (jsdom; seeds one work, opens the lightbox via the "Quick look" button, then the Message modal): a rejected send shows the error toast and NOT "Message Sent"; a confirmed send shows "Message Sent" with no toast. Fail-before verified by restoring the `catch { setEnquirySent(true) }`. Ratchet `LITERAL_FLOOR` 79 → 78. `npm run check` green: 188 files (+1), 1938 tests (+2), exit 0.

**Next: E43-i** — `components/Header.tsx` mark-as-read (×3 flagged sites). Low severity; migrate to `mutate` with an explicit silent/best-effort catch (mark-read is fire-and-forget).

## row 8 (doc `05`) E43-i — Header mark-as-read (×3, fire-and-forget) → mutate (floor 78→75)

Commit `335de6c`. `components/Header.tsx` only (no test — see below).

Three fire-and-forget mark-read writes in the message/notification dropdowns —
`authFetch("/api/messages", {PATCH, all:true}).catch(()=>{})` (mark all messages read),
the same for `/api/notifications` (mark all), and `/api/notifications {id}` (mark one) —
each after an optimistic badge clear. Migrated all three `authFetch`→`mutate`, keeping the
`.catch(() => {})` so they stay best-effort (a failed mark-read just leaves the badge; the
next poll reconciles). The 7 read GETs in the file stay on `authFetch`; `authFetch` stays
imported.

**No bespoke test, stated honestly (the plan sanctions this for a render-heavy
fire-and-forget change).** `Header.tsx` mounts 4+ polling GETs (unread, notifications,
messages, roles) and has no user-visible success/failure for a mark-read — a render test
would only re-assert `mutate` was called, which the ratchet already guarantees. Coverage:
the ratchet holds Header at 0 flagged (can't regress to `authFetch`), `mutate`'s throw
contract is tested in `api-client`, and the swap is typechecked. Ratchet `LITERAL_FLOOR`
78 → 75. `npm run check` green: 188 files, 1938 tests, exit 0.

**Next: E43-j** — `components/VenuePortalLayout.tsx` self-heal: surface a blocking error
instead of swallowing it (migrate the flagged `authFetch` mutation to `mutate`).

## row 8 (doc `05`) E43-j — VenuePortalLayout self-heal → mutate, surface instead of swallow (floor 75→74)

Commit `ec57636`. `components/VenuePortalLayout.tsx` + new test.

The venue portal self-heals its `venue_profiles` row on load (`PATCH /api/venue-profile
{ensureProfile:true}` — links the registration orphan or inserts a minimal row). The
write was `authFetch(...).catch(() => {})`, so a failed self-heal was invisible; the
comment itself notes that without it, every venue-only API call then fails with a
misleading "Artist profile not found". Migrated to `mutate` (throws on a non-2xx) inside a
`runSelfHeal` useCallback; on failure it sets `selfHealFailed`, which renders a
dismissible amber banner above the portal content with a **Retry** (re-runs the heal).
Chose a non-blocking banner over a hard portal block so a transient network blip doesn't
lock the venue out, while still surfacing the failure. `authFetch` dropped from the import
(no reads in this file).

The `runSelfHeal()` call in the effect needed
`// eslint-disable-next-line react-hooks/set-state-in-effect` — its setState runs only
after the `await`, not synchronously, which is the same async-effect pattern the context
providers (`CartContext`, `SavedContext`, checkout) already disable that rule for.

Test: `VenuePortalLayout.test.tsx` (jsdom, mocks useAuth as a confirmed venue + mutate):
a rejected self-heal shows the "finish setting up your venue portal" banner + Retry; a
resolved one shows no banner. Fail-before verified by restoring the swallowing catch (the
banner never appeared). Ratchet `LITERAL_FLOOR` 75 → 74. `npm run check` green: 189 files
(+1), 1940 tests (+2), exit 0.

**Next: bug-12** — `components/BlogEditor.tsx` (×3 mutating `authFetch` → `mutate`). Its
OTHER half (flag-gate + `notFound()` on the 3 blog pages + nav gated by
`isFlagOn("BLOGS_V1")`) is a SEPARATE iteration, not an authFetch migration.

## row 8 (doc `05`) bug-12 part 1 — BlogEditor 3 saves → mutate (floor 74→71)

Commit `b2c3769`. `components/BlogEditor.tsx` + new test. (This is ONLY the authFetch→mutate half of bug-12; the blog feature-flag gate + `notFound()` is a SEPARATE later iteration.)

The three blog saves — `saveExisting` (PATCH auto-save), `handleCreate` (POST create),
`handleSubmitForReview` (PATCH submit) — used `authFetch` with a manual `if (!res.ok)`
check and `describeSaveError(await res.json())`. Migrated all three to `mutate` (throws on
a non-2xx; `ApiError` carries the parsed body as `.payload`), so the `!res.ok` branch
becomes a `catch (err)` that does `setError(err instanceof ApiError ?
describeSaveError(err.payload) : "Network error")`. `handleCreate` reads the created id
from `mutate`'s returned body (`await mutate<{ blog: { id } }>(...)`). The `/api/artist-works`
read GET stays on `authFetch`. Same user-visible behaviour on both success and a checked
error; the win is consistency (rule) + no reliance on authFetch's non-throwing resolve.

Test: `BlogEditor.test.tsx` (jsdom; importActual keeps `ApiError` + `describeSaveError`,
mocks `mutate`/`authFetch`/`useRouter`): fill Title + Body, click "Save as draft"; a
rejected `ApiError({error:"Title already taken"})` shows that message + "Save failed" and
NOT "Saved"; a resolved `{blog:{id}}` shows "Saved" and `router.replace`s to the edit URL.
Fail-before verified by making the catch set "saved". Ratchet `LITERAL_FLOOR` 74 → 71.
`npm run check` green: 190 files (+1), 1942 tests (+2), exit 0.

**Next: the biggest-count remaining files** — `placements/[id]/PlacementDetailClient.tsx`
(6) and `components/PlacementContextPanel.tsx` (6) are good standalone iterations, then
the rest one file per iteration down to floor 0, then flip the rule to `error`.

## row 8 (doc `05`) PlacementDetailClient.tsx — 6 handlers → mutate (floor 71→65)

Commit `239ea48`. `placements/[id]/PlacementDetailClient.tsx` only (no bespoke test — see below).

Migrated all 6 mutating `authFetch` sites to `mutate`:
- `handleAdvance` (PATCH stage) — was `if(!res.ok) return` + swallow; now try/mutate/catch (still best-effort, next load reconciles).
- `handleUndoStage` (PATCH unset) — res.ok→catch, keeps the error toast.
- **`handleRespond` (PATCH accept/decline)** — the important one: it dispatches
  `wallplace:placement-changed`. Now the event fires ONLY after `mutate` resolves, so a
  rejected accept/decline no longer fans the cross-portal event out (same E43-a class).
  The error goes to `respondError` (inline) via `ApiError`.
- `handlePhotoUpload` (POST) — was `if(res.ok)` silent on failure; now `mutate` throws to
  the outer catch which toasts (a failed photo upload is surfaced instead of vanishing).
- `handleDeletePhoto` (DELETE) — was silent on failure; now try/mutate/catch + toast.
- `createRecordIfMissing` (PUT) — was `if(res.ok)` with no failure path; now a catch toasts.
The `/api/placements/:id` read GET stays on `authFetch`. Ratchet `LITERAL_FLOOR` 71 → 65.

**No bespoke test, stated honestly.** This is a 1299-line page whose accept/decline
buttons only render behind a fully-loaded `pending` placement (`status === "pending" &&
viewerRole && requester_user_id !== user.id`) plus ~900 lines of JSX referencing dozens of
placement fields — a fixture complete enough to render them is disproportionately fragile.
Coverage: the ratchet holds the file at 0-flagged (can't regress to `authFetch`); `mutate`'s
throw contract is tested in `api-client`; and the key behavioural fix (`handleRespond`
firing the event on success only) is the EXACT class already proven by
`tests/integration/../status-update.test.ts` (E43-a: a 403 does not fire the event); plus
typecheck. `npm run check` green: 190 files, 1942 tests, exit 0.

**Next: `components/PlacementContextPanel.tsx`** (6 flagged sites).

## row 8 (doc `05`) PlacementContextPanel.tsx — 6 handlers → mutate (floor 65→59)

Commit `13bc052`. `components/PlacementContextPanel.tsx` only (no bespoke test — deeply gated, see below).

Migrated all 6 mutating `authFetch` sites (handleAccept, handleDecline, handleUndoStage,
handleAdvance, handleCounterSubmit, handleRequest) to `mutate`. Each had the shape
`try { const res = await authFetch(...); if(!res.ok) setError(...) else {success} } finally
{ setBusyAction(null) }` — with a `finally` but **NO catch**, so a network error propagated
uncaught. Now each is `try { await mutate(...); <success> } catch (err) { setError(err
instanceof ApiError ? err.message||"<fallback>" : "Network error. Please try again.") }
finally {...}` — closing that uncaught-rejection gap as well as the false-success one.
`handleUndoStage` dispatches `wallplace:placement-changed`; it now fires ONLY after `mutate`
resolves (E43-a class). The `/api/placements` read GET stays on `authFetch`. Ratchet
`LITERAL_FLOOR` 65 → 59.

**No bespoke test, stated honestly (same as PlacementDetailClient).** This is a 1069-line
panel rendered inside the message inbox; its `current` placement is derived from a
`loadPlacements()` GET (not a prop) and the accept/decline/undo buttons gate on the
placement's status + the viewer's role, so a fixture that renders them is disproportionately
fragile. Coverage: the ratchet holds the file at 0-flagged; `mutate`'s throw contract is
tested in `api-client`; the event-on-success-only behaviour is the class proven by
`status-update.test.ts` (E43-a); plus typecheck. `npm run check` green: 190 files, 1942
tests, exit 0.

**Next: the biggest remaining flagged files** — `artist-portal/billing/page.tsx` (4) and
`artist-portal/orders/page.tsx` (4), then down the list one file per iteration to floor 0.

## row 8 (doc `05`) artist-portal/billing/page.tsx — 4 Stripe-session POSTs → mutate (floor 59→55)

Commit `953e121`. `artist-portal/billing/page.tsx` + new test.

Migrated the 4 mutating `authFetch` POSTs to `mutate`: `handleSubscribe` (POST
`/api/subscribe` → Checkout URL), `handleConnectOnboard` (`/api/stripe-connect/onboard`),
`handleConnectDashboard` (`/api/stripe-connect/dashboard`), `handleManage`
(`/api/subscribe/portal`). **Money boundary (per the plan's note): these are TRANSPORT
SWAPS only.** Each POST asks the SERVER to create a Stripe-hosted session and returns a
`{ url }`; the client just `window.location.href = url`. No amount/split math, no Stripe
dashboard/webhook config, and no fund transfer runs in the client — only how the session
request is sent changed. The redirect stays on the success path; a failed session-create
now surfaces the server's error (`ApiError.message`) via toast (subscribe/manage) or the
inline connect-error state (onboard/dashboard) instead of a generic string, and can no
longer fall through to a false-success. The `/api/artist-profile` + `/api/stripe-connect/status`
read GETs stay on `authFetch`. Ratchet `LITERAL_FLOOR` 59 → 55.

Test: `artist-portal/billing/page.test.tsx` (jsdom; importActual keeps `ApiError`, mocks
`authFetch`/`mutate`; profile load returns a subscribed plan so the "Manage Subscription"
button renders): a rejected `/api/subscribe/portal` (ApiError) toasts the server message
and calls `mutate` with the portal endpoint. Fail-before verified by reverting the catch
to the generic message. `npm run check` green: 191 files (+1), 1943 tests (+1), exit 0.

**Next: `artist-portal/orders/page.tsx`** (4 flagged sites).

## row 8 (doc `05`) artist-portal/orders/page.tsx — PARTIAL: order-status → mutate; refund handlers OWNER-GATED (floor 55→54)

Commit `4ab254a`. `artist-portal/orders/page.tsx` + new test. **1 of 4 flagged sites migrated; 3 held for the owner.**

The file had 4 flagged mutating `authFetch` sites. Split by the money boundary:
- **MIGRATED — `updateStatus` (PATCH `/api/orders`)**: a plain order-STATUS update
  (mark processing/shipped + tracking number). Not a payment path. → `mutate`; a rejected
  update now surfaces the server reason (via `ApiError.message`, e.g. the legacy
  "order missing artist_user_id" 403) through `statusError` instead of authFetch resolving,
  and the optimistic status advance runs only on a confirmed 2xx.
- **NOT migrated — OWNER-GATED (SURFACED per rule 4 / the money boundary):** `processRefund`
  (POST `/api/refunds/process` action approve/reject) and `issueProactiveRefund` (POST
  `/api/refunds/request` then POST `/api/refunds/process` action approve) — **these execute
  Stripe refunds server-side, i.e. they move money.** The plan's standing rule is to STOP
  and surface anything that triggers a refund/fund movement, so these 3 sites (current lines
  ~129/151/158) stay on `authFetch`, grandfathered in the ratchet, until the owner decides
  whether a transport-only `authFetch`→`mutate` swap on the refund handlers is acceptable
  (it would not change any amount, split, or execution — only that a non-2xx throws instead
  of resolving) or wants them handled another way.

Consequence: the ratchet cannot reach 0 (and the rule cannot flip to `error`) until these 3
owner-gated refund sites are resolved. Ratchet `LITERAL_FLOOR` 55 → 54 (orders now 3-flagged,
down from 4).

Test: `artist-portal/orders/page.test.tsx` (jsdom): seed one "processing" order, select it,
click "Mark as Shipped"; a rejected PATCH (ApiError) surfaces the server message and calls
`mutate` with `/api/orders`; a confirmed PATCH advances the status (the action button goes
away). Fail-before verified by reverting the catch to the generic message. `npm run check`
green: 192 files (+1), 1945 tests (+2), exit 0.

**Next: the next flagged file** — measure with `npx eslint`; remaining non-owner-gated set
includes collections (2), addresses (2), admin pages, dialogs, SavedContext, etc. Plus the
3 owner-gated refund sites above (need owner sign-off before the rule can flip to error).

## row 8 (doc `05`) lib/placements/status-update.ts — E43-a helper → mutate (floor 54→53)

Commit `b4ce0b4`. `src/lib/placements/status-update.ts` + its test.

The shared `updatePlacementStatus<P>` helper (called by both placement portals to change
a placement's status from a dropdown) was itself still on `authFetch` + a manual `if (!res.ok)`
check — the last authFetch mutation in my own E43-a fix. It is a plain status PATCH
(`/api/placements`, no payment path), so this is a clean transport swap: `mutate` throws on a
non-2xx (`ApiError`) or a dropped request, so the manual `res.ok`/`res.json()` branch collapses
into the existing `catch`. Behaviour is unchanged and already pinned — optimistic write, roll
back to the snapshot on failure, and dispatch `wallplace:placement-changed` ONLY on success.
The error toast now prefers the server's reason (`ApiError.message`) and falls back to the
generic network message for a non-`ApiError` reject. Ratchet `LITERAL_FLOOR` 54 → 53.

Test: `src/lib/placements/status-update.test.ts` rewritten to mock `mutate` (importActual keeps
the real `ApiError`; `@/lib/supabase` mocked so the real api-client module loads): (1) an
`ApiError(403, "not allowed")` reject rolls back (setPlacements twice, last call === the exact
snapshot), toasts "not allowed", and does NOT fire the event; (2) a resolve keeps the optimistic
write, fires the event once with `action: "status"`, no toast; (3) a non-`ApiError` reject rolls
back and toasts the generic "Network error…" message. The three paths are the same ones the prior
(authFetch) version of this test pinned — this commit only swaps the mocked transport.
`npm run check` green: 192 files, 1945 tests, exit 0.

**Next: the next flagged file** — measure with `npx eslint`; largest remaining non-owner-gated
are artist-portal/placements (5) and venue-portal/placements (5), then artwork-requests/[id] (3),
OffersList (3), and a long tail of 1–2-site files. Plus the 3 owner-gated orders refund sites.

## row 8 (doc `05`) artist-portal/placements/page.tsx — 5 handlers → mutate (floor 53→48)

Commit `d0b5855`. `src/app/(pages)/artist-portal/placements/page.tsx` (no test — see note).

Five flagged mutating `authFetch` sites migrated; the four read GETs (archived count, engaged
counts, loadPlacements, venues) stay on `authFetch`:
- **`respond`** (PATCH `/api/placements`, accept/decline): the optimistic row update and the
  cross-portal `wallplace:placement-changed` event now run only on a confirmed 2xx; a non-2xx
  surfaces the server reason via `ApiError.message` into `respondError` (was: authFetch resolved,
  so `res.ok` gated it — behaviour preserved, error text improved).
- **`handleSubmit`** (POST `/api/placements`, create): the `!res.ok` branch collapses into the
  catch. NOTE a latent bug this fixes: the old catch only `console.error`'d, so a genuine network
  drop on submit showed nothing (spinner just stopped). Now an `ApiError` sets `submitError` and a
  non-`ApiError` sets a network `submitError` too — a failed submit is always visible.
- **`bulkArchiveSelected`** (DELETE loop): the old guard treated `res.status === 404` as "already
  gone = success". Preserved by `if (err instanceof ApiError && err.status === 404) continue;`
  before counting a failure.
- **`archivePlacement`** (DELETE): 404 kept the optimistic removal with no rollback and no reload.
  Preserved by an early `return` on `ApiError.status === 404`; other `ApiError`s roll back + toast
  the server message; network errors roll back + toast the generic message.
- **`cancelPlacement`** (PATCH cancel): rollback + toast on failure, event + reload only on success;
  `ApiError.message` preferred for the toast.

Ratchet `LITERAL_FLOOR` 53 → 48 (file went 5 → 0). Measured with
`npx eslint "src/**/*.{ts,tsx}" -f json` filtered for the rule: total 48, file no longer listed.

Test: NONE added, stated honestly per the plan's render-heavy allowance. This is a 1926-line page
with no existing test harness, needing `useCurrentArtist` + Auth/Toast/Confirm contexts + ~10 child
mocks to render a row and reach these closures. The shared status path (`updateStatus` →
`updatePlacementStatus`) is already pinned by `src/lib/placements/status-update.test.ts` (E43-a);
the five swaps here are uniform transport changes with behaviour preserved (the subtle 404-DELETE
semantics kept via explicit `err.status === 404` guards mirroring the old `res.status` checks).
Verified via `npm run check`: typecheck (confirms `ApiError.status`/`.message` usage), lint (zero
remaining rule violations in the file), full suite 192 files / 1945 tests green, route audit PASS.

**Next: venue-portal/placements/page.tsx (5)** — the symmetric page; then artwork-requests/[id] (3),
OffersList (3), and the 1–2-site tail. The 3 owner-gated orders refund sites remain last.

## row 8 (doc `05`) venue-portal/placements/page.tsx — 5 handlers → mutate (floor 48→43)

Commit `ea0e0ba`. `src/app/(pages)/venue-portal/placements/page.tsx` (no test — see note).

The venue side of the placements portal, structurally symmetric to artist-portal/placements
(migrated in `d0b5855`). Same five flagged mutating `authFetch` sites migrated; the six read GETs
(`/api/saved`, `/api/messages`, `/api/placements` ×3, archived count) stay on `authFetch`:
- **`request`** (POST `/api/placements`, `fromVenue: true`): `!res.ok` branch collapses into the
  catch; optimistic insert runs only on a confirmed 2xx; `ApiError.message` preferred for
  `submitError`, network drop still falls to the generic message (this side already set it).
- **`respond`** (PATCH accept/decline): optimistic write + cross-portal event only on 2xx;
  `ApiError.message` into `respondError`, else `console.error` + network message.
- **`bulkArchiveSelected`** (DELETE loop): 404 counted as done, not failure —
  `if (err instanceof ApiError && err.status === 404) continue;`.
- **`archivePlacement`** (DELETE): 404 early-returns keeping the optimistic removal; other
  `ApiError`s roll back + toast the server message; network errors roll back + generic toast.
- **`cancelPlacement`** (PATCH cancel): rollback + toast on failure, event + reload only on success.

Ratchet `LITERAL_FLOOR` 48 → 43 (file 5 → 0, measured via `npx eslint … -f json`, total 43, file
no longer listed).

Test: NONE added, stated honestly per the render-heavy allowance (same call as the artist page).
This is a 2057-line page with no existing harness; the shared status path (`updateStatus` →
`updatePlacementStatus`) is pinned by `status-update.test.ts` (E43-a), and the five swaps are
uniform transport changes with behaviour preserved (404-DELETE semantics kept via explicit
`err.status === 404` guards). Verified via `npm run check`: typecheck + lint (zero remaining
violations in the file) + 192 files / 1945 tests green + route audit PASS.

**Next: venue-portal/artwork-requests/[id]/page.tsx (3)** — then OffersList (3), then the 2-site
files (collections, addresses, customer-portal, PlacementLoanForm, venue settings, PlacementStepper,
SavedContext) and the 1-site tail. The 3 owner-gated orders refund sites remain last.

## row 8 (doc `05`) venue-portal/artwork-requests/[id]/page.tsx — 3 handlers → mutate (floor 43→40)

Commit `ebe2f2c`. `src/app/(pages)/venue-portal/artwork-requests/[id]/page.tsx` + its existing test.

The venue's single artwork-request detail page. Three flagged mutating `authFetch` sites migrated;
the one read GET (`load`, `GET /api/artwork-requests/:id`) stays on `authFetch`:
- **`act`** (PATCH `…/responses/:responseId`, accept/decline): `mutate<{ nextStepLink? }>` returns the
  parsed body on 2xx, so the accept-navigate / reload only runs on success; a non-2xx surfaces
  `ApiError.message`.
- **`setStatus`** (PATCH `…/:id`, the E43-c handler for Mark fulfilled / Close): the manual `!res.ok`
  branch collapses into the catch; reload only on a confirmed 2xx. (E43-c already fixed the silent
  swallow; this keeps that and drops the now-redundant `res.ok` plumbing.)
- **`fulfillResponse`** (POST `…/fulfill`): `mutate<{ route_to? }>`; navigate/reload only on 2xx;
  dropped the explicit `Content-Type` header (mutate's authHeaders sets it when a body is present).

Ratchet `LITERAL_FLOOR` 43 → 40 (file 3 → 0, measured; total 40, file no longer listed).

Test: `page.test.tsx` updated (mutate migration + one new case). It previously mocked `authFetch`
fully; now mocks `@/lib/supabase` + api-client (importActual → real `ApiError`, override `authFetch`
for the read GET and `mutate` for the writes). Kept both E43-c `setStatus` cases (403 → error, no
advance; 2xx → advances) now driven through `mutate`, and ADDED an `act()` decline case: a
`ApiError(409)` reject surfaces "Response already handled" and leaves the response's actions in place.
Fail-before verified for the new case by dropping `err.message` from `act`'s catch (assertion failed),
then restored. `npm run check` green: 192 files, 1946 tests (+1), exit 0, route audit PASS.

**Next: components/offers/OffersList.tsx (3)** — then the 2-site files (collections, addresses,
customer-portal, PlacementLoanForm, venue settings, PlacementStepper, SavedContext) and the 1-site
tail. The 3 owner-gated orders refund sites remain last.

## row 8 (doc `05`) components/offers/OffersList.tsx — PARTIAL: 2 of 3 → mutate; checkout OWNER-GATED (floor 40→38)

Commit `77549d8`. `src/components/offers/OffersList.tsx` + its test. **2 of 3 flagged sites migrated;
1 held for the owner (money boundary).**

The file had 3 flagged mutating `authFetch` sites. Split by the money boundary:
- **MIGRATED — `act`** (PATCH `/api/offers/:id`, accept/decline/withdraw): a STATUS transition on the
  offer, not a payment. → `mutate`; still returns the E43-a/E43-b boolean (true only on a confirmed
  2xx) so the withdraw caller keeps gating its "Offer withdrawn." toast on it; a non-2xx now surfaces
  `ApiError.message`.
- **MIGRATED — `submitCounter`** (POST `/api/offers`, `parentOfferId` set): creates a child counter-offer
  row, a negotiation action, not a payment. → `mutate`; dialog closes + reloads only on 2xx.
- **NOT migrated — OWNER-GATED (SURFACED per the money boundary):** `pay` (POST
  `/api/offers/:id/checkout`) — this starts a **Stripe checkout** (creates the session and redirects to
  pay). The iteration NOTE was explicit: a handler that POSTs to a payment/refund/**checkout** endpoint
  is surfaced, not silently migrated. Left on `authFetch`, grandfathered in the ratchet, until the owner
  signs off on the transport-only swap (it would not change any amount or the redirect, only that a
  non-2xx throws instead of resolving) — exactly like the orders refund handlers.

Consequence for the endgame: there are now **4 owner-gated flagged sites**, not 3 — the 3
`artist-portal/orders` refund sites PLUS this 1 `OffersList` checkout site. When every other file is
migrated the ratchet floor will be **4** (not 3), and the rule stays at `warn` until the owner rules on
all four. Ratchet `LITERAL_FLOOR` 40 → 38 (OffersList now 1-flagged, down from 3).

Test: `OffersList.test.tsx` updated to mock both `authFetch` (the read GET `load`) and `mutate` (the
`act` PATCH) via importActual (real `ApiError`). Kept the two E43-b withdraw cases (403 → error toast,
no false "Offer withdrawn.", offer stays; 2xx → success toast) now driven through `mutate`. Fail-before
re-verified by making `act`'s catch `return true` (the 403 case failed), then restored. `npm run check`
green: 192 files, 1946 tests, exit 0, route audit PASS.

**Next: the 2-site files** — artist-portal/collections, customer-portal/addresses, customer-portal,
placements/[id]/PlacementLoanForm, venue-portal/settings, PlacementStepper, SavedContext; then the
1-site tail. The 4 owner-gated sites (3 orders refund + 1 offers checkout) remain last.

## row 8 (doc `05`) artist-portal/collections/page.tsx — 3 handlers → mutate (floor 38→36)

Commit `5f522af`. `src/app/(pages)/artist-portal/collections/page.tsx` (no test — see note).

The ratchet flagged 2 sites, but the file had **3** mutating `authFetch` handlers — the third
(`handleSave`) is a mutation the rule cannot see because its verb is a ternary
(`method: editingId ? "PATCH" : "POST"`), not a string literal. Migrated all three so no latent
mutating `authFetch` is left behind; the one read GET (`/api/collections`) stays on `authFetch`:
- **`handleSave`** (POST/PATCH, unflagged ternary verb): → `mutate`. It already checked `res.ok`, so no
  E43 false-success here; the 2xx-without-a-`collection` case is still treated as a failure, and a
  non-2xx now surfaces `ApiError.message`. Also collapsed a redundant `editingId ? "/api/collections" :
  "/api/collections"` (both branches identical) to the plain string.
- **`handleDelete`** (DELETE, flagged): optimistic remove; the old `!res.ok`-revert and catch-revert
  collapse into a single catch that reverts on any throw (no 404 special-case existed, so none added).
- **`toggleAvailability`** (PATCH, flagged): optimistic toggle; revert on any throw; on 2xx reconcile
  with the server's returned row if present.

Ratchet `LITERAL_FLOOR` 38 → 36 (the 2 flagged sites; the 3rd was already invisible to the rule).
Measured: total 36, file no longer listed.

Test: NONE added, stated honestly per the render-heavy allowance. This is an 881-line page (create/edit
form + confirm-dialog delete + optimistic list) with no existing harness, gated behind `useCurrentArtist`;
reaching these `useCallback` closures needs the full render + a collections GET. The three swaps are
uniform transport changes with behaviour preserved (optimistic revert on failure, server reconcile on
success, the save's `!data.collection` guard). Verified via `npm run check`: typecheck (the typed
`mutate<{ collection? }>` narrowing), lint (zero remaining violations in the file), 192 files / 1946
tests green, route audit PASS.

**Next: customer-portal/addresses/page.tsx (2)** — then customer-portal (2), PlacementLoanForm (2),
venue-portal/settings (2), PlacementStepper (2), SavedContext (2), then the 1-site tail. The 4
owner-gated money sites remain last.

## row 8 (doc `05`) customer-portal/addresses/page.tsx — 3 handlers → mutate (floor 36→34)

Commit `5ac20c6`. `src/app/(pages)/customer-portal/addresses/page.tsx` + new test.

The ratchet flagged 2 sites but the file had **3** mutating `authFetch` handlers — `submit` is a
mutation the rule cannot see because its verb is the `method` variable, not a literal. Migrated all
three; the read GET (`loadAddresses`) stays on `authFetch`:
- **`submit`** (POST/PATCH, variable verb, unflagged): the address create/edit save. It extracted zod
  field errors from the response body (`err.issues.fieldErrors`); with `mutate` those live on
  `ApiError.payload`, so the extraction reads `err.payload`. Used `err.code` (mirrors the old
  `body.error`) as the fallback so the friendly "Couldn't save address." default still wins when the
  server sent neither a field error nor an error string.
- **`setDefault`** (PATCH, flagged): preserved the distinct messages — `ApiError` → "Couldn't set
  default. Try again.", `NetworkError` → "Network error, please try again.".
- **`confirmDelete`** (DELETE, flagged): same split — `ApiError` → "Couldn't delete address.",
  network → the generic message.

Ratchet `LITERAL_FLOOR` 36 → 34 (the 2 flagged sites; `submit` was invisible to the rule). Measured.

Test: NEW `page.test.tsx` (jsdom). Mocks `@/lib/supabase` + api-client (importActual → real `ApiError`,
override `authFetch` for the read GET and `mutate` for the write) + ToastContext + the layout/EmptyState/
ConfirmDialog. Renders the page with one non-default address, clicks "Set default": (1) a rejected
`mutate` (ApiError) shows "Couldn't set default. Try again." and NOT the success toast, and calls
`mutate` with the PATCH; (2) a resolve shows "Default address updated". Fail-before verified by making
the catch emit the success message (the failure case failed), then restored. `npm run check` green:
193 files (+1), 1948 tests (+2), route audit PASS.

**Next: customer-portal/page.tsx (2)** — then PlacementLoanForm (2), venue-portal/settings (2),
PlacementStepper (2), SavedContext (2), then the 1-site tail. The 4 owner-gated money sites remain last.

## row 8 (doc `05`) customer-portal/page.tsx — BOTH sites OWNER-GATED (surfaced, not migrated; floor stays 34)

Commit `e944e7e`. `src/app/(pages)/customer-portal/page.tsx` (comments only; no migration).

Read both flagged handlers; both are money handlers, not plain status swaps, so per the money
boundary and the "don't guess, surface" rule they are SURFACED and left on `authFetch` (grandfathered),
not silently migrated. Added an in-code OWNER-GATED marker to each so future iterations don't re-attempt:
- **`confirmDelivery`** (PATCH `/api/orders` → status `delivered`): the E21 note on this page states the
  buyer confirming delivery **releases the artist's escrow** — a fund movement/payout. Gated exactly
  like the orders refund handlers and the OffersList checkout.
- **`submitRefundRequest`** (POST `/api/refunds/request`): the refund flow, the same path the
  artist-orders refund handlers (which are already owner-gated) use. NB flagged for the owner: migrating
  it would ALSO fix a latent silent failure — a non-2xx currently shows the customer nothing (there is no
  `!res.ok` branch and the catch only `console.error`s), so a rejected refund request looks like it did
  nothing. Worth doing when the owner approves the refund transport swaps.

The read GETs (`/api/orders`, `/api/refunds`) are unaffected. Ratchet `LITERAL_FLOOR` UNCHANGED at 34
(nothing migrated); both sites stay flagged/grandfathered. Verified: total still 34, file still 2-flagged;
`npm run check` green: 193 files, 1948 tests, route audit PASS.

**Owner-gated money sites are now SIX**, not four: (1-3) the 3 artist-orders refund sites; (4) the
OffersList checkout; (5) customer confirmDelivery (escrow release); (6) customer submitRefundRequest.
The terminal ratchet floor is therefore **6**. The rule stays at `warn` until the owner rules on all six.

**Next: placements/[id]/PlacementLoanForm.tsx (2)** — then venue-portal/settings (2), PlacementStepper
(2), SavedContext (2), then the 1-site tail. The 6 owner-gated money sites remain last.

## row 8 (doc `05`) placements/[id]/PlacementLoanForm.tsx — 2 handlers → mutate (floor 34→32)

Commit `be273ea`. `src/app/(pages)/placements/[id]/PlacementLoanForm.tsx` (no test — see note).

Both flagged sites read + confirmed NOT money handlers (checked against the boundary), then migrated;
this file has no read GET, so `authFetch` is dropped from the import entirely:
- **loan-record save** (PUT `/api/placements/:id/record`): records the agreed loan terms (dates,
  condition, agreed/insured/sale values, payout terms, per-role approvals) — documentation/CRUD, it does
  NOT execute any Stripe charge/payout. → `mutate`. The old `!res.ok` branch (which read `body.error` +
  `body.fieldErrors`) collapses into the catch: on `ApiError`, `err.code` (mirrors the old `body.error`)
  sets the message and `err.payload.fieldErrors` restores the per-field errors; the `approvalsReset`
  success handling is unchanged.
- **view-contract** (POST `/api/contracts/sign`): despite the name, this mints a short-lived **signed
  storage URL** so the viewer can open the attached contract PDF (file access, not an e-signature or
  payment). → `mutate`; a 2xx without a `signedUrl` is still treated as a failure.

Ratchet `LITERAL_FLOOR` 34 → 32 (both flagged sites migrated). Measured: total 32, file no longer listed.

Test: NONE added, stated honestly per the render-heavy allowance. This is a 625-line dense multi-section
form whose props require a full `PlacementRecord` object + an `onSaved` callback (imported types), with no
existing harness; exercising either handler needs the whole form rendered and submitted. The two swaps are
transport changes with behaviour preserved (the `fieldErrors` extraction now via `ApiError.payload`, the
`err.code` fallback, the `approvalsReset` flow, the signed-URL-or-fail branch). Verified via `npm run
check`: typecheck (the removed `authFetch` import + the `ApiError.payload` casts) + lint (zero remaining
violations in the file) + 193 files / 1948 tests green + route audit PASS.

**Next: venue-portal/settings/page.tsx (2)** — then PlacementStepper (2), SavedContext (2), then the
1-site tail. The 6 owner-gated money sites remain last.

## row 8 (doc `05`) venue-portal/settings/page.tsx — 2 Stripe Connect handlers → mutate (floor 32→30)

Commit `823971b`. `src/app/(pages)/venue-portal/settings/page.tsx` + new test.

Both flagged sites are Stripe **Connect** handlers. Read them against the money boundary and confirmed
NEITHER moves money — both just mint a redirect URL and `window.location.href` to it — so they are
account-setup/access ("settings") transport swaps, not fund movements, and are migrated (not gated):
- **`handleConnectOnboard`** (POST `/api/stripe-connect/onboard`): returns a Stripe account-onboarding
  link (payout ACCOUNT setup / KYC). No charge/payout happens here.
- **`handleConnectDashboard`** (POST `/api/stripe-connect/dashboard`): returns an Express dashboard
  login link (access only).
Both → `mutate<{ url? }>`; a 2xx without a `url` still shows the failure toast; a non-2xx surfaces
`err.code` (mirrors the old `data.error`) and a network error keeps the "Something went wrong" copy.
The read GET (`/api/stripe-connect/status`) stays on `authFetch`. (Distinct from the plan's owner-gated
"Stripe dashboard CHANGES" item, which is about altering Stripe's own config, not linking to it.)

Ratchet `LITERAL_FLOOR` 32 → 30 (both flagged migrated). Measured: total 30, file no longer listed.

Test: NEW `page.test.tsx` (jsdom). Mocks supabase + api-client (importActual → real `ApiError`, override
`authFetch` for the status GET and `mutate` for the writes) + Toast/Auth contexts + useCurrentVenue +
useNotificationPrefs + the layout/danger-zone/payout-modal. Status GET returns no account → the "Set Up
Payouts" button renders; clicking it: (1) a rejected `mutate` toasts "Something went wrong. Please try
again." and calls `mutate` with the onboard POST; (2) a 2xx with no `url` toasts "Failed to start payout
setup". (Success navigates via `window.location`, so only the reject/no-url paths are exercised.)
Fail-before verified by changing the network toast string (the reject case failed), then restored.
`npm run check` green: 194 files (+1), 1950 tests (+2), route audit PASS.

**Next: PlacementStepper.tsx (2)** — then SavedContext (2), then the 1-site tail. The 6 owner-gated
money sites remain last.

## row 8 (doc `05`) components/PlacementStepper.tsx — 2 handlers → mutate (floor 30→28)

Commit `13a3dc5`. `src/components/PlacementStepper.tsx` + new test.

Both flagged sites are placement lifecycle STAGE transitions (not money), and both `authFetch` in the
file are mutations, so `authFetch` drops from the import entirely:
- **`advance`** (PATCH `/api/placements`, `stage`): stamps the next stage. The optimistic `onChange`
  and the cross-portal `wallplace:placement-changed` event now fire only on a confirmed 2xx
  (same E43-a class as the placements pages).
- **`undoStage`** (PATCH `/api/placements`, `unsetStage`): clears a stage timestamp; same success-only
  gating for `onChange` + the event.
Both surface `err.code` (mirrors the old `data.error`) on `ApiError`, else the network message.

Ratchet `LITERAL_FLOOR` 30 → 28 (both flagged migrated). Measured: total 28, file no longer listed.

Test: NEW `PlacementStepper.test.tsx` (jsdom). Seeds an active placement already scheduled, so the next
advanceable stage is `installed` (a direct stamp, unlike `scheduled` which opens a date picker), then
clicks "Mark installed": (1) an `ApiError(403)` reject shows "Not allowed", fires NEITHER `onChange` nor
the event, and calls `mutate` with the PATCH; (2) a resolve calls `onChange` once with `installedAt` set
and fires the event exactly once. Fail-before verified by making the catch call `onChange` (the failure
case failed), then restored. `npm run check` green: 195 files, 1952 tests, route audit PASS.

**Next: context/SavedContext.tsx (2)** — then the 1-site tail. The 6 owner-gated money sites remain last.

## row 8 (doc `05`) authFetch→mutate MIGRATION COMPLETE — floor 28→7, only owner-gated money sites remain

Commits `9a4d126` (28→20) and `5a07067` (20→7), after `13a3dc5` (30→28).

Ran continuously rather than one-file-per-iteration (owner instruction, 2026-08-15: "continue
until completion, no loop"). Twenty-two remaining non-gated sites across 21 files migrated:
`9a4d126` — SavedContext (2 favourites toggles), account/email prefs PATCH, account/export POST,
and the four admin pages (applications accept/reject, blogs approve/reject, disputes
resolve/escalate, curation row PATCH).
`5a07067` — artist artwork-request response, artist profile PUT, venue profile PUT, feature-request
upvote, placement review, venue artwork-request create + edit, auth-callback oauth-finalize,
AccountDangerZone delete, CounterOfferDialog, CounterPlacementDialog, MakeOfferModal,
use-notification-prefs togglePref.

Three latent bugs fixed on the way, all previously invisible:
- **admin/blogs + admin/disputes had NO catch at all** — a network failure rejected unhandled and
  showed the admin nothing. Both now report it.
- **admin/curation's failure branch was empty** — a rejected row PATCH silently did nothing, so the
  admin could not tell a save from a no-op. It now surfaces via the page's existing error banner.
- **use-notification-prefs**: removing its manual `res.ok` throw made the hook fully analysable to
  the react-hooks compiler pass, which then reported a **pre-existing** `set-state-in-effect` error
  on the unrelated load effect (confirmed pre-existing by linting the HEAD version: 0 errors only
  because the rule had bailed out of the hook). Fixed with the microtask defer already used in
  `account/export`. Worth knowing: that lint rule can be silently suppressed by an unanalysable
  construct elsewhere in the same hook.

Mapping notes for the recipe: `ApiError.message` already prefers `body.message` over `body.error`,
so handlers with that precedence (artwork-request cap-hit, the two request forms, counters) map to
`err.message`; handlers that read only `body.error` map to `err.code`; structured failure bodies
(`fieldErrors`, `minimumPence`) come off `err.payload`.

**ONE MORE OWNER-GATED SITE FOUND** (7 total, not 6): `PaymentClient.startCheckout` (POST
`/api/placements/:id/payment/setup`) starts the paid-loan **Stripe checkout**, so it was surfaced
with an in-code marker rather than migrated, like the others.

Five existing tests updated to mock `mutate` (AccountDangerZone, use-notification-prefs,
MakeOfferModal, auth callback, venue profile) — all assert the same behaviour as before.

Ratchet `LITERAL_FLOOR` **7**, measured, and the remaining 7 are exactly the owner-gated set:
1-3. `artist-portal/orders` `processRefund` ×2 + `issueProactiveRefund` (execute Stripe refunds)
4. `OffersList.pay` (POST `/api/offers/:id/checkout`)
5. `customer-portal` `confirmDelivery` (PATCH → delivered, RELEASES artist escrow)
6. `customer-portal` `submitRefundRequest` (POST `/api/refunds/request`; migrating it would also fix
   a latent silent failure — a non-2xx currently shows the customer nothing)
7. `PaymentClient.startCheckout` (paid-loan Stripe checkout)

`npm run check` green: **0 lint errors**, 195 files, 1952 tests, route audit PASS.

**OWNER DECISION NOW DUE (blocks the `warn`→`error` flip, nothing else).** Every non-money
`authFetch` mutation in the codebase is migrated. The rule stays at `warn` and the ratchet holds at
7 until you rule on the seven money handlers above. The proposed change for each is transport-only:
`mutate` throws on a non-2xx instead of resolving, so the handler's success path (a redirect, a
confirmation, a status flip) can no longer run after a failed request. No amount, split, recipient
or execution path changes. Options: (a) approve all seven, then flip the rule to `error` and delete
the ratchet; (b) approve a subset; (c) leave them on `authFetch` permanently and flip the rule with
seven documented exemptions.

## rows 21 / 22 / 23 + bug-12 part 2 + E43-f — continuous run, 2026-08-15

The owner lifted the one-file-per-iteration cadence ("continue until completion, no
loop"), so these ran back to back rather than one per wake-up.

### DONE

- **bug-12 part 2** (`af2eb2f`): the blog surface is gated on `BLOGS_V1`. The nav item
  is spread in only when the flag is on, and all three blog pages `notFound()` when it
  is off, so typing the URL does not reach an editor whose every save 403s. Doc
  correction: the plan says all three are server components; only `new/page.tsx` is, the
  other two are `"use client"`. The gate still holds (`notFound()` works from a client
  component, `isFlagOn` is client-safe via the CLIENT_ENV snapshot), it just runs after
  hydration on those two. New `blogs-flag-gate.test.tsx`, fail-before verified.

- **E43-f** (`07931c6`): both "View" controls on venue-portal/enquiries had no onClick,
  no href and no form association while looking live. Both now push to the messages
  inbox. **Doc correction:** the plan says wire them to `?conversation=<id>`; that param
  does not exist — the messages page reads `?artist=` / `?artistName=`, and
  `enquiry.artist` already holds the slug. Rows with no slug fall back to the unfiltered
  inbox. Also deleted an `/api/orders` fetch in the same effect whose `.then` body was
  empty, so every page load spent a request on data it discarded. New test, fail-before
  verified.

- **row 22** (`9af466a`): all strip-and-retry paths in `placements/route.ts` deleted.
  **Seven sites, not the five the plan listed** (the two extra are the same
  message-insert fallback in the response and cancellation paths). Every candidate
  column verified present in the committed schema snapshot, so no fallback could do what
  its comment claimed; each could only convert a real failure into a false success. The
  worst two: the POST insert re-inserted without the payment terms (a placement created
  with its agreed fee and QR setting gone, 200 OK), and the stage update fired on ANY
  error and stripped all ten lifecycle columns (a stage advance returning 200 having
  written nothing). Two new tests drive a permission error through the stage-advance and
  unsetStage paths and assert 500 + exactly one write attempt; fail-before verified by
  restoring the blanket retry.

- **row 23(b)**: `preferred_sizes` had no code left to delete — its only reference was a
  stale comment in `writable-fields.ts`, which wrongly grouped it with
  `interested_in_local_artists`. Rewritten so the two read apart: one is vestigial (an
  incomplete migration next to the `preferred_styles` that does exist), the other is a
  shipped control awaiting a column. The strip-and-retry that comment pointed at was
  already gone (E42-c).

### BLOCKED — Supabase MCP is unauthorised in this session

**Rows 21 and 23(a) both need a prod migration and cannot be completed.** Both
`execute_sql` and `list_migrations` against `uwkuhygwvasdzwsusiym` return "You do not
have permission to perform this action". I deliberately did NOT write the `.sql` files:
a migration on disk that has not been applied is exactly the ledger-divergence problem
already sitting in the owner-questions list, and the plan's own rule is write **and**
apply **and** verify in one step.

Both are ready to execute the moment the MCP is authorised:

- **Row 21** (post-limit TOCTOU, `artist-works/route.ts`). Confirmed the defect by
  reading: the route counts the artist's works, compares to the tier cap, and inserts
  later through `upsertWork`, so two concurrent POSTs both pass the check. A plain
  `INSERT ... WHERE (SELECT count(*)) < limit` does **not** fix it — under READ COMMITTED
  both statements read the same snapshot. It needs serialisation per artist: either a
  `pg_advisory_xact_lock` on the artist id or a `SELECT ... FOR UPDATE` on the parent
  `artist_profiles` row, then count, then insert, all inside one `SECURITY DEFINER`
  function following the 085/087 pattern (`SET search_path = public`, EXECUTE revoked
  from anon/authenticated/PUBLIC, granted service_role only), numbered 101.
- **Row 23(a)**: one nullable boolean column on `venue_profiles` plus the
  `writable-fields.ts` allowlist entry, numbered after row 21's.

Owner action needed: authorise the Supabase MCP (or say to write the migrations
unapplied and accept the divergence, which I would not recommend).

`npm run check` green throughout: 0 lint errors, 197 files, 1962 tests.

---

## Session 2026-08-28 — finishing the plan

Supabase MCP re-verified live at the start of the session against
`uwkuhygwvasdzwsusiym` (a cheap `information_schema` read returned 43 columns for
`venue_profiles`), so rows 21 and 23(a) are unblocked. Baseline `npm run check`
green before any change: 0 lint errors, 201 files, 1982 tests.

Worktree note: this session started on `claude/wallplace-remediation-finish-42e4c1`,
which was pinned at 356cd37 and therefore missing every commit above. Fast-forwarded
onto `claude/wallplace-remediation-loop-b4984a` (a clean ff, 356cd37 was its ancestor)
before doing anything, and ran `npm ci`.

### E34 — venue takeover via a self-asserted `venue_slug` (03 §3) — DONE

**The doc's open question, answered against prod.** `03` §3.2 could not tell whether
`venue_profiles.user_id` is nullable in the deployed database, and said the answer
decides the classification. It is **NOT NULL**, and prod holds **9 venues with 0
ownerless rows**. So §3.5's second branch applies, and the hand-off prompt's framing
("STILL LIVE, verified") is half right. Split honestly:

- **Adopt-by-slug is latent, not live.** `.is("user_id", null)` can never match a row,
  so the branch is unreachable today. It becomes a live takeover the moment anyone
  makes that column nullable — and the branch was written *expecting* it to be.
- **The insert half IS live.** The same self-asserted string was the base slug for the
  fallback INSERT, so a signup could pre-claim the canonical handle of a venue that had
  not registered yet: `/venues/<slug>`, plus the inbound routing for artist messages,
  placements and artwork requests. No orphan needed.
- **And the seed has never worked.** `register-venue` inserted a `venue_profiles` row
  with `user_id` omitted against a NOT NULL column, so every venue registration since
  launch hit a 23502 that was logged and swallowed. §3.5 predicted exactly this. The
  0-orphan count is the proof.

**What changed.**
- `api/venue-profile/route.ts`: deleted the adopt-by-slug branch outright; adoption is
  now by **confirmed** email only (`user.email_confirmed_at`, previously not checked at
  all) and only when **exactly one** orphan matches — taking `.order(created_at desc)
  .limit(1)` of several was a coin flip on a shared or role address. The fallback insert
  derives its slug from the registration/display name, never from metadata.
- `api/register-venue/route.ts`: deleted the orphan factory. It read `body.venueSlug`
  off the **raw** body (not in `registerVenueSchema`, so unvalidated and never
  slugified), which is what let an anonymous caller name any slug. Dead code by the
  NOT NULL finding, and the entry point for the takeover.
- To keep the deletion honest rather than a silent feature loss, `ensureVenueProfile`
  now hydrates the new row from the caller's own `venue_registrations` entry, matched on
  the confirmed email: name, type, location, contact_name, phone, wall_space — the same
  fields the dead seed intended. Registration details still reach the profile; they just
  key off a verified fact now.
- `signup/venue/page.tsx`: stopped writing `venue_slug` into user_metadata and stopped
  sending `venueSlug` to the API. Nothing reads it any more, and leaving a dead
  self-asserted field invites the next reader to trust it again.
- `components/VenuePortalLayout.tsx`: comment corrected — it claimed registration
  inserts the row with `user_id=NULL`, which was never true in prod.

**Also answered while here:** `03` §3.1 flagged as UNCONFIRMED whether an
adopt-orphan-by-`artist_slug` path exists. It does not. `user_metadata.artist_slug` has
**zero** server-side readers; `venue_slug` had exactly one, now removed.

**What this does and does not buy.** After the fix a slug can only be obtained by
registering a venue under that name with a confirmed email — auditable in
`venue_registrations` (`status: 'pending'`) and rate-limited. It never transfers an
existing row. Name-squatting by registering "The Copper Kettle" yourself is still
possible; that is a moderation problem, not an authz hole, and the fix does not claim
to solve it.

**Tests.** `src/app/api/venue-profile/ensure-profile.test.ts` (10) and
`src/app/api/register-venue/route.test.ts` (6), both new. The venue-profile file uses an
in-memory stand-in for the service-role client that enforces the real `venue_profiles.slug`
UNIQUE constraint, so the suffix loop is exercised for real. Exploit assertions, not just
happy paths: the attacker gets no adoption AND the victim row's `user_id` stays null; the
created slug is not the one they asserted.

**Fail-before verified.** Against unfixed code, 6 of the 10 ensure-profile tests fail
(`does not adopt an orphan named only by the attacker's metadata slug`, `does not use
the metadata slug as the new row's slug either`, `falls back to a user-scoped slug…`,
`refuses to adopt when the email is not confirmed`, `refuses to adopt when two orphans
share the email…`, `copies registration details…`). Restoring the orphan factory in
`register-venue` fails 2 of 6 there (`never opens a service-role client`, `ignores a
venueSlug smuggled in on the raw body`); reverting restored 6/6.

`npm run check` green: 0 lint errors (169 warnings), 203 files, 1998 tests.

### E36c — spoofable rate-limit key (03 §5.3) — DONE

**The doc's UNCONFIRMED, answered.** §5.3 said "UNCONFIRMED which of Cloudflare or
Vercel actually fronts production; confirm before choosing the order". Probed live
2026-08-28: `https://www.wallplace.co.uk` returns `server: Vercel` and **no** `cf-ray`,
so Vercel fronts production directly with no Cloudflare.

**That makes the doc's own suggested fix wrong here, and I did not ship it.** It
proposed reading `cf-connecting-ip` first. With nothing setting that header, it is
entirely client-supplied, so the "fix" would have reproduced the exact bug it was
meant to close — an attacker rotates `cf-connecting-ip` instead of
`x-forwarded-for` and nothing changes. `cf-connecting-ip` is deliberately not read,
and there is a test pinning that.

**What changed.** New `src/lib/client-ip.ts` with `getClientIp(Request | Headers)`,
the doc's "export a shared helper" follow-on. It reads only `x-vercel-forwarded-for`
then `x-real-ip`, both set by the platform proxy on the way in, and never falls back
to a client-supplied header. XFF is not read at all: proxies *append* to it, so its
left-most entry is whatever the caller typed. All four derivation sites now use it:

- `lib/rate-limit.ts` — `getIP` kept as a delegating shim so existing callers
  (`api/moderation`) are untouched.
- `api/terms/accept` — the audit IP on a legal acceptance record. It was the field
  meant to make the row hard to repudiate and was the easiest one to forge. Now stores
  `null` rather than the string `"unknown"` when no platform header identified the
  caller, so the column never implies more than it can prove.
- `lib/analytics.ts` — `generateVisitorId`, so unique-visitor figures were forgeable.
- `api/auth/verify-turnstile` — was `cf-connecting-ip || x-forwarded-for`, both
  client-supplied here. Now sends `remoteip` only when a platform header resolved one;
  a forged remoteip weakens Turnstile's own analysis, so sending nothing is better than
  sending something invented.

**On the "unknown" bucket.** The doc's second follow-on was to give `"unknown"` a much
tighter limit. I did **not** do that, deliberately: if the platform header turns out to
be absent in production, a tighter limit converts a misconfiguration into an outage on
an assumption I cannot verify from here. Instead `"unknown"` is one shared bucket (which
is already tight) and `getClientIp` warns once, loudly, in production when it is reached
— the same fail-loud pattern as the Upstash fallback warning directly above it, and as
09 Phase 0. Tightening it is a safe follow-on once prod logs confirm the header is
populated.

**Tests.** `src/lib/client-ip.test.ts`, 12 new. The one that matters: four requests
with the same `x-vercel-forwarded-for` but a different `x-forwarded-for` each time share
a bucket and the fourth is refused with a 429. Before the fix all four landed in
separate buckets and none was ever refused.

`src/lib/rate-limit.test.ts` updated. Its `it("prefers x-forwarded-for (first entry)")`
was pinning the vulnerability as intended behaviour; it now asserts the opposite, with
a comment naming the reversal, exactly as §5.3 required.

**Fail-before verified.** Restoring `x-forwarded-for` and `cf-connecting-ip` to the
trusted list fails 6 of the 12, including the bucket-sharing regression test; reverting
restored 12/12.

`npm run check` green: 0 lint errors (169 warnings), 204 files, 2011 tests, exit 0.

### E36b — open redirect in /api/demo/login (03 §5.2) — DONE

`destinationFor` accepted any `next` starting with `/`. That includes
protocol-relative URLs: `new URL("//evil.example/x", "https://wallplace.co.uk/…")`
resolves to `https://evil.example/x`, and `/\evil.example` is read as a host by
several browsers. It mattered more than a bare open redirect because the route sets
the `sb-*-auth-token` cookie on the same response, so the bounce is
credential-adjacent and starts on a wallplace.co.uk URL.

This was the only redirect construction in the app not going through
`@/lib/safe-redirect`. It uses the shared helper now; nothing new was written.

**Tests.** `src/app/api/demo/login/route.test.ts`, 15 new, table-driven over eight
hostile `next` values plus the in-app paths that must keep working. One asserts the
auth cookie is set on the very response that redirects, so the reason this mattered
is written down and not just in a comment.

**Fail-before verified.** Restoring `startsWith("/")` fails 6 of 15: the
protocol-relative, triple-slash, backslash-host and CRLF cases, plus the venue
default and the cookie test. The `javascript:`, `data:`, absolute-https and bare-host
cases passed even before the fix (none starts with `/`), which is worth stating
rather than implying all eight were live.

### E36d — user enumeration on apply / waitlist / register-venue (03 §5.4) — DONE

All three returned a distinct 409 with a specific message on a duplicate email
against a 200 otherwise, so a public unauthenticated form told anyone with a list of
addresses who had applied, joined the waitlist, or registered a venue. With E36c's
spoofable key (fixed above) the oracle was unlimited.

**Both channels closed, not just the obvious one.** §5.4 warned that a timing side
channel survives the naive fix: the success path awaits `sendEmail` while the 409
path returns immediately, so latency separates the cases even with identical status
codes. That is now closed too, and the tests assert the byte-identical body, not
merely the status.

- Duplicate branches return byte-identical output to a fresh submission. The signal
  moves to a `console.warn` server log line, which is where it belonged.
- New `src/lib/after-response.ts` wraps Next 16's `after()`. Both sends move off the
  response path, so both branches return at the same point. It falls back to running
  the task inline when there is no Next request scope, because `after()` throws
  there rather than deferring, and every route unit test in this repo calls handlers
  directly. §5.4 preferred enqueuing over an artificial delay and asked whether it
  was feasible: `after()` is exactly that, and it needed no new infrastructure.
- Neither send fires on a duplicate. Skipping matters beyond noise: re-sending would
  let anyone mail a stranger, and re-pinging would let anyone fill the admin inbox,
  by submitting an address they guessed.
- `apply`'s profile bridge is also skipped on a duplicate. It was already idempotent
  (guarded by an existence check on `user_id`), so this is about not doing pointless
  work on the oracle path.
- **newsletter fixed too, as §5.4 asked.** Its comment claimed it avoided the leak;
  the code returned `{ok: true, alreadySubscribed: true}`, which is the same
  disclosure one level down. Flag dropped, and `NewsletterForm.tsx` now shows one
  message for both cases instead of "You're already subscribed."

**Checked before merging, per §5.4's breakage note.** Grepped for consumers of the
409 and of "already exists" across components and pages: none. The only `409` handler
is `checkout/page.tsx`, a different route, and `apply/claim/page.tsx` matches on
Supabase Auth's own message, not ours.

**Tests.** 21 new across four files (`waitlist`, `newsletter`, `register-venue`,
plus 6 added to the existing `apply` suite), and 5 for the helper. Each route asserts
`{status, body}` equality between the duplicate and fresh cases, that a real database
failure (42501) still 500s rather than being swallowed into a fake success, and that
neither send fires on a duplicate. Those last assertions await a tick first —
`afterResponse` deliberately does not await the task, so without the flush they would
have passed vacuously. `apply`'s existing mock was changed to return the mock's value
rather than a hardcoded `{error:null}`, defaulting to success so the pre-existing
tests are untouched.

**Fail-before verified.** Restoring the 409 branches and the `alreadySubscribed` flag
fails 8 of 31; reverting restored 31/31.

`npm run check` green: 0 lint errors, 208 files, 2052 tests, exit 0.

### E30b + 03 §1.4 steps 0-2 — the admin surface and the admin_users table — DONE

**Step 0, the inventory the doc says must be written down before anything else.**
Run against prod 2026-08-28:

- `SELECT to_regclass('public.admin_users')` → **NULL. The table has never existed.**
  This closes §1.1's UNCONFIRMED fact 3, and the consequence is bigger than the doc
  allowed for: the deployed predicate was never ADR 0001's three-source conjunction.
  The PostgREST select errored, `data` came back null, `Array.isArray(null)` was
  false, and the branch silently returned false for everyone. The live rule was
  `metadata AND email IN ADMIN_EMAILS`. The select also asked for `id`, a column the
  intended table does not have.
- 40 auth users; exactly **1** with `raw_user_meta_data->>'user_type' = 'admin'`
  (`fcoles2598@gmail.com`, confirmed). So creating and backfilling the table is
  additive and risk-free, exactly as §1.4 predicted for this branch.

**Step 1, migration 101 — written, applied, verified in one piece of work (D57).**
`supabase/migrations/101_admin_users.sql`, applied via the Supabase MCP and verified
live: table exists, RLS enabled, **0 policies**, **0 grants to anon/authenticated/PUBLIC**,
`service_role` granted, **0 rows**. It therefore grants nobody anything on its own —
it is the second operand of an OR whose first operand is unchanged. Snapshot
regenerated: `tests/integration/schema-columns.json` now has 54 tables, with
`admin_users` inserted at the JSONB-canonical position (after `placements`), produced
through the regenerator's own `serialize()` so the diff is one line and not a
reformat. `SUPABASE_ACCESS_TOKEN` is still unset (D62), so the regeneration went
through the same library the script uses rather than the script itself.

**Step 2, backfill — script shipped, deliberately not run.** `scripts/backfill-admin-users.ts`,
wired as `npm run admin:backfill`, with `--dry-run`. It resolves each `ADMIN_EMAILS`
entry through `auth.admin.listUsers()` (paged) and upserts a row, then asserts the
table mirrors the allowlist completely and exits 1 naming any address with no auth
user. It refuses to run on an empty allowlist, because backfilling nothing and
reporting success is the precise state that makes the later cutover lock everyone out.

**I did not insert rows myself, on purpose.** The correct row set is derived from the
deployed `ADMIN_EMAILS`, which is not readable from here. Inserting the one metadata
admin on a guess would be granting prod admin to an account that may not currently
hold it — a prod grant, which the loop escalates rather than does. Running the script
in an environment that has the real allowlist is both safer and the doc's own design.

**Step 3, the predicate cutover — NOT DONE, owner-gated,** per the standing
instruction and D5. The `user_metadata` conjunct stays until the owner says
otherwise, and `admin-auth.ts` now carries a comment saying so and naming its
prerequisites.

**What DID change in `admin-auth.ts`:** the `admin_users` select asked for `id`
(nonexistent) and swallowed its error. It now selects `user_id`, distinguishes a
failed lookup from an empty one, and logs the failure. That takes the branch from
"always false because it errored" to "correctly false because the table is empty",
which is not a privilege change.

**E30b, the surface gate.** `admin/layout.tsx` returned its children unwrapped, so
nothing ran ahead of the `/admin` route group and the only gate was a render-time
`userType !== "admin"` check inside a client component, on the field the attacker
writes. New `AdminGate` wraps the route group and renders nothing until
`/api/admin/whoami` (new, using the real `getAdminUser`) confirms. Wiring it at the
route-group boundary rather than per page is the point: the original hole was
reachable because nothing enforced the pairing.

**One deliberate deviation from §2.2:** it groups 503 with 401/403 and redirects all
three to `/login`. A 503 means the server has no admin source configured, so sending
the admin to a login form they will complete successfully and then bounce from again
is a loop. `AdminGate` names the misconfiguration instead. `AdminPortalLayout` keeps
its check as a cheap second line, with the comment rewritten to stop implying it is
the gate.

**§2.2's ordering warning, assessed and found not to apply here.** It says stage 1
must ship *after* the predicate change or admins are locked out of the UI. That is
about a gate stricter than the current one. It is not: today's client gate already
requires the metadata, so `AdminGate` (metadata AND allowlist) can only reject people
the current gate already rejects. Nobody with access today loses it.

**Tests.** 24 new. `AdminGate.test.tsx` (7): the regression case is metadata claiming
admin while the server says 403 renders nothing; plus no shell flash before the
answer, fail-closed when the check throws, 503 named not looped, and exactly one call
to the read-only whoami route. `whoami/route.test.ts` (7) drives the real
`getAdminUser` through the same mock harness as `admin-auth.test.ts` rather than
mocking the thing under test. `admin-route-guard.test.ts` (3) is the invariant that
keeps the real boundary real: every route under `api/admin` must call a guard, and
per exported handler, not once per file. Proved it bites by adding an unguarded
`api/admin/__probe/route.ts`: 2 of 3 failed naming the file, and passed again once
removed. `AdminGate.test.tsx` needed an explicit `afterEach(cleanup)` — this repo has
no global auto-cleanup and `screen` queries the whole document, so one test's rendered
shell was being found by the next test's "rendered nothing" assertion.

**One real bug the tests caught in my own code:** `AdminGate`'s effect had `[router]`
in its deps, so an unstable router identity re-ran the whoami check on every render.
Split into ask-once (empty deps, genuinely exhaustive) and act-on-the-answer.

**ADR 0008 written**, superseding 0001. It quotes and corrects 0001's false claim that
`user_metadata` "can only be set via the Supabase service-role API", strikes it
through in place so it cannot be quoted out of context, and records the step table
with what is done and what is owner-gated.

`npm run check` green: 0 lint errors, 211 files, 2069 tests, exit 0.

### E35d — `user_type` is self-settable, and "admin" was an accepted input (03 §4.3) — DONE

**Items 1-3, the code paths.** New `SIGNUP_ROLES` / `isSignupRole` in `auth-roles.ts`,
alongside the existing `ALLOWED_ROLES` / `isRole`. The asymmetry is deliberate and
commented: reading a stored value still has to accept "admin" or `portalPathForRole`
and the sidebar break for real admins; accepting one as *input* is what was wrong.

- `oauth-sign-state` validated a user-supplied body field with `isRole`, on an
  unauthenticated route, so `POST {"role":"admin"}` minted a validly HMAC-signed
  state token claiming admin. Now `isSignupRole`.
- `oauth-finalize` declared its own `ALLOWED_ROLES = ["artist","customer","venue"]`
  and never used it: the const existed only to derive a type, while the value reached
  `user_metadata` through `v.role as Role`, a cast. `verifyOAuthState` validates
  against the WIDE list, so "admin" passed. Real check now, dead const deleted.
  Fixing only the minting route would have left every already-issued token able to
  carry admin through, which is why the test mints its state directly with the
  `oauth-state` helper rather than through the sign-state route.
- **Not in the doc, found while checking the call sites:** `AuthContext`'s `signUp`
  typed its metadata as `{ user_type: UserRole }`, and `UserRole` includes "admin".
  Any caller could ask GoTrue for an admin account with the anon key and TypeScript
  would agree. Narrowed to `SignupRole`.

**Item 4, migration 102 — the only control covering the direct-to-GoTrue path.**
Written, applied and verified live. A `BEFORE INSERT OR UPDATE` trigger on
`auth.users` that strips a *newly acquired* `user_type = 'admin'`.

**"Newly acquired" is load-bearing, and the doc's version would have caused an
outage.** §4.3's snippet strips unconditionally. The live predicate still contains
the `user_metadata.user_type = 'admin'` conjunct (the cutover is owner-gated), and
GoTrue writes to `auth.users` on every sign-in, so an unconditional trigger would
have revoked the only production admin the next time they logged in. This one
permits a row that already said 'admin'.

**§4.3's step-4 conflict, resolved the way the doc recommends.** It offers two ways:
have the trigger consult `admin_users`, or drop the metadata stamp and drive admin
nav off the server's answer. I took the second, and rejected the first for two
reasons: it would not help today (`admin_users` is empty until the backfill runs, so
the existing admin would be stripped anyway), and it would couple every write to
`auth.users` to another table — if that table were ever dropped, every signup and
login on the platform would fail. That is a bad thing to hang authentication on for
a defence-in-depth control. Stated consequence, in the migration and here: a future
admin granted only an `admin_users` row will not be auto-routed to `/admin` after
login, because `portalPathForRole` reads metadata. They keep full API access and can
navigate to `/admin` directly, where `AdminGate` admits them. §1.4 step 4 calls this
"a nav convenience", which is why it is sequenced last.

**Live verification, both attack paths, inside a rolled-back transaction:**

```
insert auth.users with '{"user_type":"admin","display_name":"Attacker"}'
update the same row to set user_type = 'admin'
-> probe_role_after_both_attempts: "customer"
-> other_metadata_preserved:       "Attacker"     (only the role is touched)
rollback
```

And the existing admin is unaffected by a sign-in-shaped write:

```
update auth.users set last_sign_in_at = now() where user_type = 'admin'
-> admins_still_admin: 1
rollback
```

**Tests.** 16 new: `auth-roles.test.ts` (4, including that `SIGNUP_ROLES` stays a
strict subset of `ALLOWED_ROLES`), `oauth-sign-state/route.test.ts` (5),
`oauth-finalize/route.test.ts` (5). Fail-before verified: restoring `isRole` and the
cast fails exactly the two admin tests; reverting restored 10/10.

**The trigger has no unit test, honestly.** It is a database control and this repo
has no DB-backed test harness (the e2e security suite needs real credentials, which
is a standing blocker). The live rolled-back proof above is the verification, and it
exercises the real trigger on the real table rather than a model of it.

`npm run check` green: 0 lint errors, 213 files, 2083 tests, exit 0.

### E30a — admin decisions were unaudited (03 §2.1) — DONE

`recordAdminAction` existed and was wired to five call sites, but nothing enforced
the pairing with the admin check, so coverage tracked whichever phase of work last
touched a file. The platform's admission gate, the curation lifecycle and
admin-approved Stripe refunds all mutated state with no trail at all.

**`withAdmin`, with a different signature from the one §2.1 proposed.** The doc's
version has the handler return `{ response, context }`, which means every early
return in a 250-line handler has to be restructured — the doc itself calls that the
medium-risk part. Mine passes an `audit(context, actionOverride?)` into the handler
instead, so `applications/[id]` kept all six of its early returns untouched. The
rules:

- handler called `audit(...)` → that row is written;
- handler returned 2xx without calling it → a row is written anyway, with no
  context, so a successful mutation is never invisible;
- handler returned non-2xx without calling it → nothing, because a rejected request
  changed nothing.

The `actionOverride` exists because one route can cover two decisions: the
applications gate writes `application_accepted` or `application_rejected`, not a
single `application_decision`, so the log stays queryable by action.

**Converted.** G1 `admin/applications/[id]` PUT, G2 `admin/curation` PATCH, G4
`admin/refresh-stats` POST. G3 `refunds/process` keeps explicit
`recordAdminAction` calls in its admin branch rather than going through the
wrapper, exactly as §2.1 directs, because artists legitimately call it too. That
one is a money handler, so the change is strictly additive: it adds a row next to
the refund and changes nothing about the refund, and `recordAdminAction` never
throws.

**G4 carried one real behaviour change, which I initially mis-described in a
comment and corrected.** It used a hand-rolled `getAuthenticatedUser` +
`isAdminRequest` pair. 401 for a missing token and 403 for a non-admin are
unchanged; the difference is that an unconfigured `ADMIN_EMAILS` now answers 503
like every other `getAdminUser` route, instead of a 403 blaming the caller for a
deployment fault.

**G5, the read-only bulk exports, deliberately NOT audited.** §2.1 offers "add a
row, or record the decision in the new ADR rather than leaving the inconsistency
undocumented". Recorded in ADR 0008: the admin dashboard loads several of these per
page view, so auditing them writes a handful of rows every time anyone opens
`/admin`. `admin_audit_log` exists to answer "did anyone read X's messages", and
burying that under routine navigation makes the table worse at its job. Revisit
when the log has a query surface that can filter by action.

**PII discipline.** Every `context` carries the decision, the target id and the
target's email, never the row. `applications/[id]` would otherwise have written the
applicant's artist statement and portfolio links into a JSONB column; there is a
test asserting those keys are absent. `curation` records *that* admin notes changed,
not what they say, with a test asserting the note text does not appear.

**Tests.** 21 new: 7 for `withAdmin` in `admin-auth.test.ts`, 4 added to the
existing `applications/[id]` suite, 6 for `curation`, 4 rewritten for
`refresh-stats`, plus 3 more invariants in `admin-route-guard.test.ts`. The
curation and refresh-stats suites run the REAL `withAdmin` and `getAdminUser`
against a mocked Supabase, so they exercise the actual predicate rather than a
stand-in.

**The invariant was proved to bite.** Reverting `curation` to a hand-rolled
`getAdminUser` with no audit call failed the coverage test, naming the file;
restoring passed 6/6. A third invariant names `refunds/process` explicitly, because
it sits outside the `api/admin` directory the sweep walks and would otherwise be
silently out of scope.

**Two fixture bugs the tests caught in my own work:** the existing
`applications/[id]` suite mocks the whole `admin-auth` module, so it needed a
faithful `withAdmin` stand-in rather than the module's real one (which would close
over the real `getAdminUser`, not the mock). And zod's `.uuid()` validates the
version and variant nibbles, so a "shaped like a UUID" fixture was rejected at the
schema and three tests were asserting 400s while looking like they passed.

`npm run check` green: 0 lint errors, 214 files, 2105 tests, exit 0.

### 07 K2 — two paid-loan billing implementations — DONE

**The doc is materially stale and I did not follow its §2.3.** It says implementation
A (destination charge via Checkout) survives and the transfer call in
`handleInvoicePaid` is deleted because "destination charges already settled the
artist's share". That was reversed by §B6 during the 04 T6 work (E8, commit ab96b2d,
"gate setup on payout capability, delete the destination charge"). The destination
charge is already gone; the surviving money model is the platform collecting in full
and paying the artist by a separate transfer through the `stripe_transfers` ledger,
because a destination charge bypasses that ledger and leaves refunds, reversals, the
payout dashboard and admin/financials blind to the money.

So both paths already shared one money model. **This collapse changes no money flow**,
which is worth being precise about given what it touches. What differed was the entry
point and the card-collection mechanism.

**What was deleted (664 lines net):**

- `startPaidLoanBilling` and its private helpers `ensureVenueCustomer`,
  `hasAttachedCard`, and the SetupIntent fallback. Checkout collects the card inside
  the session, so this machinery was redundant rather than merely duplicated.
- The private `isPaidLoan` shadow and its `PAID_LOAN_TYPES` set. §2.3 calls this "a
  third duplicate hiding inside B", and it is worse than a duplicate: unlike the
  canonical `arrangement-type.ts` predicate it never classified a legacy `free_loan`
  row with a positive monthly fee as a paid loan, so the billing module would never
  have billed a row the rest of the app displays as a paid loan. Deleted for free.
- The accept-path call in `placements/route.ts`, plus the whole `billingPrompt`
  return. **That was dead:** the API returned `{success, billingPrompt}` carrying a
  SetupIntent client secret for a Stripe Elements flow, and nothing in `src/` ever
  read `billingPrompt` off a response. The comment describing "the venue UI mounts
  Stripe Elements with the secret" described something that was never built.
- The `setup_intent.succeeded` webhook branch (E7d, 72 lines), whose only job was
  re-invoking the deleted creator. Nothing mints a paid-loan SetupIntent now.
- `notifyAdminBillingStalled` in `lib/email.ts`, left with zero callers by that.

**What I did NOT do, and why.** §2.4 says to replace the accept-path call with a
`pending` row in `placement_recurring_billings` "and surface the Set up payment CTA".
The CTA already exists and does not need one: `PaidLoanPaymentChip` keys off
`arrangement_type`, `monthly_fee_gbp` and `subscription_status`, and renders from the
moment a paid-loan placement goes active. A pending row would be a table write with
no reader. §2.5 step 4 also says to delete the file and create `paid-loan-webhooks.ts`;
the file is kept because `cancelPaidLoanBilling` is not a webhook handler and the
rename would mislabel it. Its header is rewritten to state exactly what it owns and
that it creates no subscriptions.

**PAID_LOAN_V2 is NOT deleted** (§2.5 step 5). Its remaining call sites are the two
label branches in `PlacementDetailClient.tsx`, which is K3's territory, and §2.5 is
explicit that K3 must land first or the label collapses to the wrong side. Checked
that this does not strand the surviving path: the payment CTA is not flag-gated.

**Guards.** New `eslint-rules/no-parallel-billing.js` at **error** from the start
(nothing violates it once the creator is gone): forbids `stripe.subscriptions.create`
and subscription-mode `checkout.sessions.create` outside an allowlist of exactly the
three billing entry points. One-off payment sessions are left alone deliberately, or
the rule would be noise across cart, offer and curation checkouts.

**Tests.** `tests/integration/paid-loan-single-path.test.ts` (7) and
`eslint-no-parallel-billing.test.ts` (9). The single-path file strips comments before
asserting: the comments deliberately name the deleted functions to explain why they
are gone, and an assertion that tripped on that would push people to delete the
explanation.

**Both guards proved to bite.** Re-adding a `startPaidLoanBilling` that calls
`stripe.subscriptions.create` fails 3 of the 7 integration tests AND produces a lint
error naming the rule; reverting restored 7/7 and 0 errors.

**Tests rewritten rather than deleted:** the `startPaidLoanBilling()` describe (188
lines) and the `setup_intent.succeeded` describe (159 lines) are replaced by tests
asserting the absence, not just removed. The webhook one needed its own `beforeEach`
for the replay-guard table, because the block I replaced carried the setup the
remaining test still needs.

`npm run check` green: 0 lint errors, 216 files, 2106 tests, exit 0.

### 07 K6 — three definitions of platform revenue — DONE

**The concrete divergence, measured.** `/api/admin/stats` excluded `refunded`,
`cancelled`, `failed` and `void`; `/api/admin/financials` excluded **only**
`cancelled`, so it counted refunded orders as revenue. Over the test's seeded order
set the two report **£1944.49 against £370.49** — a fivefold overstatement, not a
rounding difference. Both were internally consistent; they were answering different
questions under one word.

**Two modules, not one, because the doc's single `revenue.ts` cannot work.** The
per-order rules are needed by client components (`artist-portal/analytics`,
`artist-portal/page`, `artist-portal/orders`), and a module importing
`getSupabaseAdmin` is server-only. So:

- `src/lib/finance/order-money.ts` — pure: `NON_REVENUE_STATUSES`,
  `isRevenueBearing`, `poundsToPence`, `orderGrossPence`, `artistPayoutPounds`,
  `artistPayoutPence`, `formatPounds`. Importable anywhere.
- `src/lib/finance/revenue.ts` — the DB aggregates: `grossMerchandiseValuePence`,
  `artistEarningsPence`, `venueSpendPence`, `subscriptionMrrPence`, `planPricesPence`.

**§6.2's `amount_cents` plan is void, and there is no migration.** It says to pick
`orders.amount_cents`, backfill it from `total` and add a CHECK. That column exists
in no migration and not in the live table — Bug 15 established this, and that
selecting it made PostgREST reject the whole statement so admin read £0 against 12
real paid orders. `total` in pounds is the only amount column, so `orderGrossPence`
has one branch, not two.

**Both admin routes are now thin presenters.** `stats` no longer selects `total` at
all: it already ran two order queries, so it calls `grossMerchandiseValuePence`
twice instead, for the same query count. One improvement rides along: a failed
orders query now **throws** instead of `|| []`-ing to a silent zero, so the Bug 15
class fails loud with a 500 rather than reporting £0.

**Five copies of the per-order payout rule, collapsed.** §6.3 names four
(`api/dashboard`, `artist-portal/analytics`, `artist-portal/page`,
`artist-portal/orders`); the grep guard found a fifth in `lib/stripe-connect.ts`'s
reconcile sweep. The analytics copy carried a comment saying it "mirrors the
dashboard's calculation ... so Analytics and Dashboard show the same number", which
is what a copy looks like when it knows it is one.

**§6.3's specific bug claim is WRONG, and I checked before writing it up.** It says
`artist-portal/orders:586` "uses `||` not `??`, so a legitimate £0 payout falls
through and displays the gross order value as the artist's earnings". It does not:
`order.artist_revenue?.toFixed(2)` on `0` yields the string `"0.00"`, which is
truthy, so `||` never fires. Verified by running it. The real defect at that site is
different and smaller: it is the one copy with no `Number.isFinite` guard, so a NaN
rendered `"£NaN"` instead of falling back. Collapsing to one function fixes that.

**One real behaviour change, in a money path, stated plainly.**
`stripe-connect.ts`'s reconcile sweep computed `Math.round(Number(o.artist_revenue)
* 100)`. Identical to `poundsToPence` for every finite value; different for a NaN,
which used to stay NaN and pass the `owedCents <= 0` guard (because `NaN <= 0` is
false) and would have been recorded as a NaN-cent leg. It now becomes 0 and is
routed to `unresolved` for an operator, which is where an amount nobody can compute
belongs. No money movement changes.

**Tests.** `order-money.test.ts` (17) and `one-revenue-source.test.ts` (6). The
latter drives **both real route handlers** over one seeded order set and asserts
they agree to the penny — a unit test of the shared module could not catch a route
quietly keeping its own copy. Plus three grep guards, all comment-stripped so they
check code and not whether a file explains its own history.

**Fail-before verified.** Restoring `financials`' own `sumOrders` (excluding only
`cancelled`) fails 2 of 6: the penny-agreement test reports 194449 against the
expected 37049, and the inline-conversion guard names the file. Reverting restored
6/6.

**§6.6's lint rule NOT built, deliberately.** It specifies flagging `.from("orders")`
combined with `.reduce(` outside `src/lib/finance/**`. Three legitimate sites match
that shape (`placements/[id]`, `dashboard`, `webhooks/stripe`), including ones that
already use the shared helper, so the rule would need eslint-disables from day one —
the exact hollowing-out the repo's other guards were written to avoid. The three grep
assertions target the shapes that actually recurred and run in the same `npm run
check` gate, so enforcement is equivalent without the false positives. Similarly
§6.5's "no file outside lib/finance selects `total`" is narrowed to reading the
column AND folding it: taken literally it flags single-order display reads in
`api/orders/track` and `api/orders/[id]/events`, and the allowlist to keep it green
would grow until it meant nothing.

**Not done, and not silently:** §6.3's two copies of the placement realised-revenue
query (`placements/route.ts` vs `placements/[id]/route.ts`), which resolve the
viewer's side differently so a user who is both artist and venue sees different
numbers on the two pages. That is a real bug, it is separate from the revenue
definitions, and it is left as an open item below rather than bundled here.

`npm run check` green: 0 lint errors, 218 files, 2129 tests, exit 0.

### 09 item 3.2 — no resend-verification path — DONE

`.resend(` had zero hits in `src/`. A user who lost their confirmation mail could
not log in, could not sign up again (the address is taken), and had nothing to
click. That kills signups silently, which is the worst way for it to happen:
nothing about it surfaces as an error anywhere.

**Three pieces, because the route alone would have been unreachable.**

1. `POST /api/auth/resend-verification`. Calls `supabase.auth.resend({type:'signup'})`
   on the **anon** client, which is right: it is a public GoTrue endpoint that needs
   no elevated key, and using the service role would put a privileged credential on
   an unauthenticated path for nothing.
2. `emailRedirectTo` added to the two `signUp()` calls that lacked it
   (`AuthContext.tsx`, `apply/claim/page.tsx`), matching the three `signup/*` pages.
   Without it those two paths sent users to Supabase's default redirect.
3. **The login page now offers it.** Supabase answers "Email not confirmed" for
   exactly this case, so the form detects that and shows a "Send me a new link"
   control. Without this the endpoint exists and nobody can find it, which is the
   same outcome as not having it.

**Enumeration-safe by construction, applying what E36d just cost.** The response is
byte-identical whether the address has an unconfirmed account, a confirmed one, or
none at all. Supabase distinguishes all three; this endpoint does not, and its error
is swallowed to a `console.warn` rather than returned. The UI says the same thing
regardless, so the affordance does not leak what the endpoint refused to.

**Rate limit deliberately tighter than the other auth forms** (3 per 5 minutes,
against their 5 per minute): this one sends mail to an address the *caller* names,
so an unlimited version is a mail-bombing tool pointed at anyone. There is a test
asserting the limit stays at least that tight.

**One thing fixed while writing the test:** `SITE` was captured at module load from
`process.env`. That bakes in whatever the environment was when the bundle first
evaluated — a deployment footgun as well as untestable. Read at call time now.

**Tests.** `resend-verification/route.test.ts`, 10. Beyond the happy path: the
redirect is built from our own origin so a hostile `next` cannot make a
confirmation email an open redirect; the response is identical for unknown,
confirmed and unconfirmed addresses; Supabase's message never reaches the body;
the rate limit blocks before any send.

`npm run check` green: 0 lint errors, 219 files, 2139 tests, exit 0.

---

## Open items raised by this session (not blocking, not silently dropped)

- **Two copies of the placement realised-revenue query** (07 §6.3):
  `placements/route.ts` resolves the viewer's side with `role.type === "venue"`,
  `placements/[id]/route.ts` with `placement.venue_user_id === user.id`. A user who
  is both an artist and a venue therefore sees a different number on the list and
  the detail page. Real bug, separate from the revenue definitions, deliberately not
  bundled into K6.
- **`PAID_LOAN_V2` still exists**, gating only the two label branches in
  `PlacementDetailClient.tsx`. K3 owns those; deleting the flag before K3 collapses
  the label to the wrong side (07 §2.5 step 5).
- **`admin_users` backfill has not been run.** `npm run admin:backfill` must run in
  an environment holding the real `ADMIN_EMAILS` before the predicate cutover.

### 07 K1 / 09 Phase 2 — two email systems — DONE. `src/lib/email.ts` is deleted.

**The doc's inventory is stale.** §1.3 lists 16 exports / 15 live functions across
12 files. There were **19 exports across 13 importing files** —
`notifyAdminPayoutExhausted`, `notifyAdminCurationCancelled` and
`notifyAdminCurationPaid` were added after the doc was written, which is the
duplication doing exactly what a duplication does when nobody deletes it.

**Two were genuinely dead** (`confirmApplicationToArtist`, `notifyArtistNewOrder`).
Seventeen were live.

**Eight admin notifiers collapsed into one helper.** They differed only in the
heading and which fields they listed, so `sendAdminAlert` + one `AdminAlert`
template replaces all eight. Adding a ninth kind of alert is a call, not a file.

**Nine user-facing sends moved to templates.** Five already existed
(`MessageUnreadNotification`, `VenueNewPlacementRequest`, `ArtistPlacementAccepted`,
`ArtistPlacementDeclined`, `CustomerRefundConfirmation`). **Six did not, and their
absence is precisely why the legacy module survived** — each legacy call sat behind
a comment explaining that the polished path could not cover this case:

| New template | The comment that kept the legacy call alive |
|---|---|
| `ArtistNewPlacementInvitation` | "for venue-initiated (artist receives), we don't yet have a matching polished template, so fall back to the legacy helper" |
| `ArtistRefundRequested` | none existed; `ArtistRefundNotification` is past tense ("we've issued a refund") and would have told an artist money had moved when it had not |
| `CustomerRefundRejected` | the approve half was already on the pipeline; only the decline had no template |
| `CustomerOrderStatusUpdate` | "we keep the legacy `notifyBuyerStatusUpdate` only for statuses the dispatcher doesn't cover" |
| `VenueSaleFromPlacement` | distinct from the periodic `VenueRevenueShareStatement`; this one carries money |
| `CurationEnquiryReceived` / `CurationPaymentReceived` | no curation customer templates at all |

**One live duplicate send found and deleted.** `refunds/process` called the legacy
`notifyRefundDecision` "as safety net" *beside* the polished
`CustomerRefundConfirmation`, so **a buyer whose refund was approved received two
emails about it**, one of them from an unverified domain with no unsubscribe header.
That is the K1 defect in its purest form and it was live.

**K1g done too** (§1.4 step 7), because it was blocking a one-place change.
`EmailStream` and `EmailCategory` were each declared twice with no cross-import;
`lib/email` owns them now (it carries the behaviour) and `emails/types` re-exports.
Adding the `platform_admin` category was then a single edit — and the exhaustive
`Record<EmailCategory, string>` in the unsubscribe page caught its own omission at
compile time, which is the whole point of the collapse.

**Also collapsed while here:** `placementTermsSummary`. Two identical inline IIFEs
in `placements/route.ts` plus a third, differently-worded version inside
`notifyPlacementRequest` ("Revenue Share (10%)" against "Revenue share · 10%"), so
the two halves of one event described the same arrangement in two vocabularies
depending on which system sent the mail. Built on the canonical
`arrangement-labels`.

**Guards.**
- `tests/integration/no-legacy-email.test.ts` (5). The load-bearing one is "only
  one module constructs a Resend client": a second `new Resend(...)` is a second
  sending identity with its own `from` and no shared suppression list, which is
  how the first split happened. It also asserts every template id the migrated
  routes name is actually in `EMAIL_REGISTRY`, because item 1.6 found a template
  sitting outside it and therefore invisible to every audit.
- `.dependency-cruiser.cjs` gains `one-email-entrypoint`: importing `resend`
  outside `send.ts` is an error. **§1.6's snippet does not work** — it matches
  `path: "^resend$"`, but dependency-cruiser reports the RESOLVED path, so the
  import arrives as `node_modules/resend/dist/index.cjs` and the rule never fires.
  Found by adding a probe module and reading the graph; corrected to
  `^node_modules/resend(/|$)` and re-verified (probe → 1 error, removed → clean).
- `npm run depcheck` added to `npm run check`, per §14.1. It was already passing
  and gating nothing.

**Ten test files updated.** The interesting ones: `curation/billing.test.ts` had
two mocks for two near-identical notifiers and now has one, with the tests telling
the alerts apart by subject; `stripe-connect.test.ts` and
`webhooks/stripe/route.test.ts` moved from asserting named props to asserting the
alert's fields still carry every identifier, because an alert that omits the order
or transfer id is not actionable.

`npm run check` green (now including depcheck): 0 lint errors, 220 files, 2144
tests, 0 dependency violations, exit 0.

### 09 items 1.5, 4.2 and 4.6 — DONE

**1.5** (§C.4). Half was already done by K1: `notifyBuyerStatusUpdate` is deleted.
The other half was that *two places* decided which email an order event produces —
`emailsForEvent` returned `[]` for `order.cancelled` while a separate
`if (status !== shipped && !== delivered && !== processing)` branch inside
`orders/route.ts` sent the cancellation. One owner now: `order_cancelled` is a
dispatcher template bound to `customer_order_status_update`, and `cancelled` is
excluded from the fallback branch so it cannot send twice.

**`order.refunded` deliberately left returning `[]`,** with a comment saying why:
`refunds/process` already sends `CustomerRefundConfirmation`, so adding a trigger
here would send two emails for one refund — the exact defect K1 removed from that
route. A test pins it.

The lifecycle test that asserted `not.toHaveBeenCalled()` for `cancelled` is
**reversed**, with a comment naming the reversal, since it pinned the two-owner
state as intended.

**4.6.** `no-raw-arrangement-type` was the one registered rule with no test — for a
rule at `error`, that means nothing verified it fires at all. 11 tests, and writing
them **found a real bug in the rule**: its exemptions matched
`filename.endsWith("/src/lib/arrangement-type.ts")`, with a leading slash, so they
only fired when ESLint supplied an ABSOLUTE path. It does here, which is why lint
stayed green and the gap was invisible. `no-ad-hoc-cap` already handles both forms
deliberately; this one now does too, so a relative filename cannot start flagging
the very module that defines the values. Both forms are tested.

**4.2** (§E.4). `tests/integration/email-events-audit.test.ts`, 12 tests over a fake
Supabase client that records upserts. The audit trail is the whole reason `sendEmail`
won K1, and it only holds if every terminal outcome writes — a skip that writes
nothing is indistinguishable from a send that never happened.

§E.4's invariant is followed exactly, including its warning not to assert "one row
per attempt": the duplicate short-circuit deliberately writes nothing because the
original row exists. The assertion is **one row per distinct idempotency key,
ending terminal**. Covered: all five skip reasons write their matching status; a
render failure writes `render_failed` AND returns `ok:false` (both halves, because
`ok:false` with no row is invisible afterwards); a `queued` original counts as a
duplicate so two concurrent callers cannot both send; and metadata carries no `@`
and no `eyJ`-prefixed value, because that column is JSONB and callers pass it
freely.

`npm run check` green: 0 lint errors, 222 files, 2168 tests, 0 dependency
violations, exit 0.

**09 Phase 3 items 3.3–3.7 NOT done, and not silently.** They are feature builds,
not wiring: a `customer.subscription.created` branch and template (3.3), a support
acknowledgement with a reflected-send rate limit (3.4), newsletter double opt-in
including a migration and a confirm endpoint (3.5), and the dispute flows (3.6,
3.7) — of which the doc itself says "**Largest item in this document; it is a
feature, not a wiring task**" and notes there is *no dispute-creation path at all*,
so `disputes` is a table written by nothing. Building new product surface is a
different decision from removing duplication, and it belongs to the owner rather
than to a remediation pass. 3.1 and 4.7 are owner-only (DNS/DMARC and Supabase SMTP)
and 4.4 depends on the CI lint flag.

### 07 K3 — four sources of arrangement labels — DONE (core), and K2e with it

**All four implementations plus both API ladders are gone.** `src/lib/arrangement-labels.ts`
is the only one left, extended to express everything the others could:

- `mixed` is named. It was returning **"Other arrangement"** for a value that is
  live in production, which was the plainest symptom of the split.
- `revenue_share` renamed from "Revenue-share loan (QR-enabled)" to
  "Revenue share". It is not a loan, and the parenthetical described a
  configuration rather than the arrangement.
- Fee/QR-aware, so "Paid loan + QR" is expressible where only `status.ts` could
  say it.

**The two implementations disagreed on one input, and the disagreement is
preserved rather than papered over:** `labelForArrangement("free_loan")` returned
"Paid loan" (the alias map), while `arrangementLabel({arrangement_type:"free_loan"})`
returned "Free display" (no fee present). Both were right for their own callers, so
the **call form** decides: a caller with only a type string knows nothing about the
fee and keeps the paid reading; a caller passing the object is in the data-derived
world where no fee means no fee. Every existing caller keeps its meaning, and a test
says so explicitly.

**Deleted:** `placements/status.ts`'s `arrangementLabel` (25 lines) and
`arrangement-type.ts`'s `arrangementLabel` alias. That alias renamed a function to
collide with a *different* function's name, so which behaviour a file got depended
on its import line.

**The prose regex is not carried over.** `status.ts` scanned the free-text request
message for "£X/month" when the fee column was null, and `PlacementContextPanel`
kept its own copy. The label a user saw depended on wording someone had typed.

**E13 fixed.** `/spaces` rendered the literal "Revenue Share" at `:359` and `:392`
beside `ARRANGEMENT_LABEL.revenue_share` at `:538` — two names for one arrangement
on one page. Both literals now read from the canonical map.

**Both eslint-disable pairs removed**, which §3.5 says is worth more than its other
assertions ("a suppression comment is a knot being tied in front of you"):
`PlacementDetailClient`'s flag-gated ladder (which had a *second* ladder in its else
branch, a fifth vocabulary, title-cased unlike anything else) and
`placements/route.ts`'s negotiation-log terms (which said "Free loan arrangement",
a phrase no other surface uses).

**K2e done, unblocked by this.** `PAID_LOAN_V2` had only those two label branches
left, so §2.5 step 5's ordering is satisfied and the flag is deleted from
`FeatureFlag`, `FLAGS` and `CLIENT_ENV`. Removing its gate also **fixed a live
copy bug**: the "Venue owns the work" line was hidden behind a flag that is off in
production, so a venue looking at a purchase was never told they own the work.

**One thing measured rather than assumed, and deliberately left.**
`PlacementDetailClient` still parses the message for a displayed monthly-fee
*amount*, with a "re-confirm with the other party before payout" caveat beside it.
Against prod: **3 of 86 placements have a fee in the message and nothing in the
column**, so deleting it would show "Free display" on three real negotiated
placements. That is a data-backfill decision for the owner, not a duplicate-label
cleanup, and it is in the open items below with the query.

**Tests.** `arrangement-labels.test.ts` extended to 13 (including an exhaustive
type × fee × QR sweep asserting the output is always in the declared set), and
`one-label-source.test.ts` (5). `status.test.ts` had tested *only* the deleted
function; rather than delete the file, its other six exports — which had never had a
test — got one (15).

**NOT done: the §3.2 JSX sweep across the remaining 14 files.** The four
implementations, both API ladders, both suppressions and the E13 collision are the
substance and they are closed. What is left is hardcoded label strings in list rows,
profile bodies and dialogs: mechanical volume, no behavioural defect, and three of
them are near-identical dev-only surfaces §3.2 itself says `08` should cull rather
than fix. Listed as an open item rather than half-swept.

`npm run check` green: 0 lint errors, 223 files, 2188 tests, 0 dependency
violations, exit 0.

### 07 K4 — two placement-status renderers — DONE

`PlacementDetailClient` had its own colour switch and its own
`charAt(0).toUpperCase()`, in a file that did not import from
`@/lib/placements/status` at all. Same row, same moment, two answers: a `paused`
placement read "Paused" with a grey badge there and "Completed" with a bordered
neutral badge in both portals; `sold` was grey there and blue here. Finding E14.

Nine lines, replaced with `statusBadgeClass(normaliseStatus(...))`.

**This is a deliberate VISUAL change** and it is worth saying plainly: `-50` fills
with borders instead of `-100` fills without, and `paused` now reads "Completed"
on the detail page as it already did in both portals.

**Two questions the collapse forces, both deferred with the owner, per §4.2 which
is explicit that changing either is a behaviour change needing its own commit:**
1. Is `paused` to "Completed" right? It is a lie about a paused placement.
2. `normaliseStatus`'s `default: return "Active"` turns an unknown status into the
   most permissive-looking label, which is the wrong direction on a money-adjacent
   surface.

Both are in the open items. The collapse itself is behaviour-preserving relative to
the portals, which were already the majority reading.

`OffersList.formatStatus` is left alone: §4.1 calls it the same anti-pattern in a
different domain, but it is one named function with one call site and viewer-aware
logic, so collapsing it into a shared module would be over-engineering for one
caller.

**Guards.** Three assertions added to `one-label-source.test.ts`: no hand-rolled
status capitalisation in any placement surface, and no Tailwind status palette
keyed on `.status` in a placement surface outside the canonical module. Scoped to
placement surfaces deliberately, because orders, applications and disputes each
have their own status vocabulary and palette; sweeping those in would make the
guard noise. Proved to bite by restoring the hand-rolled block: 2 of 8 failed.

The doc also asks for a component test that a `paused` placement renders the same
text as `normaliseStatus("paused")`. Not written: the code now literally calls
`normaliseStatus(placement.status)`, so such a test would assert that a function
equals itself. The grep guard is what actually catches a regression here.

### 07 K5 — artist stats: two sources — DONE (bar the owner-gated column drop)

**The brief's hypothesis was wrong and §5.2 is right: the columns are not dead.**
`stats-cache.ts` wrote them, with predicates identical to the live aggregation. The
defect is *when*: its only caller was `POST /api/admin/refresh-stats`, admin-gated
and manual, and `vercel.json`'s nine cron entries do not include it.

**Measured against prod, and it is not an edge case: 2,295 `profile_view` events
across 54 artists, against 1 of 14 `artist_profiles` rows with a non-zero
`total_views`.** So 13 of 14 artists saw "0 views" on their dashboard while their
own analytics page counted real events. That is Bug 13.

**Design (a) taken, as §5.3 recommends.** New `src/lib/analytics/artist-totals.ts`
is the single aggregation, lifting the cache's predicates verbatim so the numbers
do not change, only their freshness. Repointed: the artist dashboard, and the
public artist profile page (an async server component, so four `head: true` counts
for one artist is nothing).

**Deleted:** `src/lib/stats-cache.ts` and the whole `api/admin/refresh-stats` route
plus its test. Grepped for a UI trigger first: none.

**NOT done, and it is destructive so it is owner-gated:** the migration dropping
`total_views`, `total_placements`, `total_sales`, `total_enquiries` from
`artist_profiles`, and removing the four fields from
`artist-profiles-transform.ts`. The transform feeds LIST endpoints where counting
per artist is an N+1, so it still maps the columns; they are now written by nothing
and read by no display, which is inert rather than wrong. Both the transform and
`writable-fields.ts` carry a comment saying so. The columns stay DENIED in
`writable-fields.ts` regardless: a client must never write its own view count,
whether or not anything else does.

**§5.7's invariant is now in `website/AGENTS.md`** under a new "Data invariants"
heading, so it lands in every agent's context: a column mirroring a computed value
must be written by a trigger or by a job in `vercel.json`, and one written only by
a manual admin endpoint is banned.

**Tests.** `one-stats-source.test.ts` (6). The sweep is scoped to member access
(`profile.total_views`) rather than the bare identifier, because `api/stats/public`
reports a SITE-wide `total_placements` counted live under a colliding JSON key, and
`writable-fields.ts` names the columns as string literals in a denylist. Neither is
a read of the artist column, and a guard that flagged them would be wrong.

`npm run check` green: 0 lint errors, 223 files, 2193 tests, 0 dependency
violations, exit 0.

### 07 K8 — duplicate demo personas — PARTIAL. The safe half done, the rest escalated.

**Prod state, checked before touching anything:**

| slug | name | review_status | plan | sub status | Connect |
|---|---|---|---|---|---|
| `maya-chen-demo` | Maya Chen | approved | pro | **none** | **no** |
| `fin-coles` | Fin Coles | approved | premium | canceled | yes |
| `finlay-coles` | Finlay Coles | approved | none | none | no |

That confirms two of §8.2's three preconditions on the demo row (no
`subscription_status`, no Connect account, so Bug 9's Buy Now 422 is real) and
turns up something the doc did not have.

**NEW FINDING, not in the doc: `finlay-coles` exists as an approved artist row,
and its public page is unreachable.** `next.config.ts` redirects
`/browse/finlay-coles` to `/browse/fin-coles` **permanently (308)**. So that
profile is listed in `/browse` and every click on it lands the visitor on a
*different artist*. Two distinct rows, one of them shadowed by a cached redirect.
Owner question below: are they the same person, and which row survives?

**Done, all code-only:**

- **§13.19's dead duplicate deleted.** `src/data/demo.ts` exported its own
  `DEMO_USER_IDS` and `isDemoUser`, shadowing the real pair in
  `src/lib/demo-guard.ts`. Its array had both entries commented out, so it was
  permanently empty and its `isDemoUser` returned **false for everyone, including
  the actual demo accounts**. Zero importers outside the file.
- **§8.3's claim about `assertNotDemo` is stale and the comment that repeated it
  is corrected.** The doc says it "has zero call sites in the entire repo. No
  mutation route is actually guarded... This is a security finding". E23a wired it
  across every outward-facing and in-portal route (ratchet 58 to 0), and
  `data/demo.ts`'s header still described Phase 2 as "future". Both fixed.
- **`/demo`'s silent fallback made loud.** `artists.find(...) || artists[0]` meant
  a misconfigured `NEXT_PUBLIC_DEMO_ARTIST_SLUG` produced no error at all, just a
  different artist than the CTA was pointed at. It now throws in development and
  logs in production, still falling back, because a broken /demo page is worse
  than the wrong artist on it.
- **`.env.example` had ZERO `DEMO` entries.** All eight are documented, including
  the note that an unset `DEMO_*_USER_ID` silently disables `assertNotDemo` for the
  account it names.
- **The redirect-target guard (§8.5).** `tests/integration/redirect-targets.test.ts`
  pins the artist redirect and its target together, and asserts no self-redirect
  and no redirect chain. `next.config.ts` gains the warning in prose: a 308 is
  cached indefinitely, the target is a DB row with no static seed behind it, so
  deleting it makes this a permanent 404 for everyone who already made the hop.

**NOT done, and why.** The rename half of §8.2 needs
`UPDATE artist_profiles SET slug='maya-chen' WHERE slug='maya-chen-demo'` on a live
row, deletion of the `maya-chen` static seed and its six works, and Stripe Connect
onboarding for the demo account so Bug 9's Buy Now stops 422-ing. That is prod data
plus a Stripe dashboard action: both are on the escalate list, and they only make
sense as one sequenced package. Written up as an owner item below rather than
half-done, because the intermediate states are worse than either end (renaming
before the static row is deleted produces a slug collision in the merge, and
deleting the static row first leaves the homepage's positional pick,
`artists.slice(0, 6)`, pointing at a different artist).

`npm run check` green: 0 lint errors, 224 files, 2197 tests, 0 dependency
violations, exit 0.

### Row 23a — the local-artists checkbox had nowhere to go — DONE

**Migration `103_venue_interested_in_local_artists.sql`, written, applied and
verified live** (D57: 103 is above the highest on disk, 102).

The control shipped on `venue-portal/profile` long before its column, and looked
like it worked: bound to state, hydrated on load. It did not, in **both**
directions:

- the save dropped it, because `writable-fields.ts` correctly refuses a column
  that is not there;
- **the read lied.** `venue-profiles-transform.ts` hardcoded
  `interestedInLocalArtists: true`, so every venue was told they had said yes,
  including the ones who unticked it.

So a venue could untick the box, save, reload, and see it ticked again, with no
error anywhere.

**Nullable with no default, deliberately.** NULL means "never answered", which is
honestly different from "answered no". All 9 live venue rows are in that state and
defaulting them either way would be inventing an answer they never gave.

**Four code changes:** allowlist entry, the save payload now sends it, the
transform reads the column (`?? false` for display, so the three-state
distinction survives in the column while the UI shows a boolean), and
`DbVenueProfile` gains the field.

**Snapshot regenerated:** `venue_profiles` 43 → 44 columns, one line of diff.

**The assertion that pinned the column as absent is flipped**, which is what its
own comment said to do ("when row 23a adds it this assertion is the one to flip").
Plus a new `venue-profiles-transform.test.ts` (3) whose middle test is the
regression: a row with `false` must not read back as `true`.

`npm run check` green: 0 lint errors, 225 files, 2201 tests, exit 0.

### Row 21 — the artwork post-limit TOCTOU — DONE

**Migration `104_claim_artist_work_slot.sql`, written, applied and verified live.**

The route counted the artist's works, compared to the tier cap, and inserted later
through `upsertWork`. Two concurrent POSTs both read the count before either insert
landed, so both passed a cap they should not have. It is a public API, so the
window is reachable by anyone with a session rather than only by a fast client.

**Why the obvious fix does not work, restated because it is the crux.** A plain
`INSERT ... WHERE (SELECT count(*)) < limit` does NOT close it. Under READ
COMMITTED each statement takes its own snapshot at statement start, so two inserts
that begin before either commits still see the same count and both proceed. The
check and the claim have to be serialised per artist, in one transaction.

`pg_advisory_xact_lock(4821, hashtext(artist_id))` does that without locking the
`artist_profiles` row (so a profile edit racing an upload is unaffected) and
releases at COMMIT or ROLLBACK, so a crashed call cannot leave an artist unable to
upload. The namespace constant keeps it from colliding with an unrelated advisory
lock.

**Why it only claims a slot rather than doing the whole insert.** `upsertWork` is
not one INSERT: it is a strip-and-retry ladder (full write, then core-only, then
each extended column individually, so one newer column cannot silently kill the
rest of a save). Reimplementing that in SQL would be a second copy of a subtle
path, which is the class of duplication doc 07 exists to remove. The function
inserts the four NOT NULL columns (`id`, `artist_id`, `title`, `image`, checked
against the live schema) and `upsertWork` then takes its update path unchanged.

**The compensating delete matters and has its own test.** The claim is a real row,
so a save that fails afterwards would permanently consume a tier slot with a row
the artist can neither see nor remove. The route releases it, and **only when it
created it**: a failed save on an EDIT must not delete the artist's existing work.

**Verified live, in a rolled-back transaction:**

```
baseline_works    count 0
first             claimed=true  created=true   count 1
second_over_cap   claimed=false created=false  count 1
edit_existing     claimed=true  created=false  count 1   (limit 0, still allowed)
```

ACL checked against 085/087: `postgres=X/postgres | service_role=X/postgres`,
`SECURITY DEFINER`, `search_path=public`. No anon or authenticated EXECUTE.

**Tests.** 7 new. Fail-before verified: restoring the read-then-check fails 6 of 7,
including "decides the cap through the RPC, not by counting in the route", which is
the one that actually distinguishes the two designs. The duplicate-title warning's
`getWorksByArtistProfileId` call moved to where it is used, after the save.

`npm run check` green: 0 lint errors, 225 files, 2208 tests, exit 0.

### 08 D6 item 3 — the wall kill-switch had a hole in it — DONE

`WALL_VISUALIZER_V1` gates the visualizer everywhere else, but
`api/venues/[slug]/profile` read and served `walls` unconditionally. Flipping the
flag off, which is what a kill-switch is for and includes doing it under incident
pressure, left this endpoint publishing every venue's public wall list **and the
signed URLs for uploaded wall photos**.

A kill-switch with a hole in it is worse than no kill-switch: it is one somebody
will reach for and believe.

The gate sits before the read rather than filtering after it, and there is a test
asserting the `walls` table is not even queried, because "returns nothing" and
"reads nothing" are different guarantees and only the second one is a kill-switch.

**Tests.** 6 new (this route had none at all). Fail-before verified: removing the
gate fails 2 of 6. One test needed `storage` on the Supabase fake, because
`loadWalls` signs a URL per uploaded wall and its `try/catch` would otherwise have
swallowed the entire load and let the test pass for the wrong reason.

### 08 — the rest, SURFACED not cut, as instructed

**D6 authorises five unconditional items. Item 3 is done (above). Items 1, 2 and 4
are verified but not executed, because verifying them showed the one-line summaries
do not survive contact with the code:**

| D6 item | Verified state | Recommendation |
|---|---|---|
| 1. Delete legacy `WallVisualiser.tsx` (139 LOC) | Present. Dead while `WALL_VISUALIZER_V1` is prod-ON, per the doc | Safe to delete, but confirm the flag's prod value first: it is dead **because** of a flag value, not structurally |
| 2. Delete two orphan DELETE handlers | Not located precisely enough to act on; the doc gives no file:line | Needs the doc's §4.3 table re-derived before cutting |
| 4a. `PlacementQRModal.tsx` | **Zero inbound references, confirmed** | Safe to delete |
| 4b. `/profile-designs` | **Zero inbound references, confirmed** | Safe to delete. Note §3.2 lists it as one of three near-identical copies |
| 4c. `/galleries` | **NOT clean.** The page may be unlinked, but `src/data/galleries.ts` is imported by `browse/page.tsx` and `venue-portal/saved` | Delete the ROUTE only. The data module must stay |
| 4d. `/feature-requests` (+2 API routes) | **NOT clean.** There is a live `admin/feature-requests` page, and `api/feature-requests` + `.../[id]/upvote` exist. §4.2 says two parallel systems, one orphaned; which one is orphaned is not established | Do not cut until it is established which system the admin panel reads |
| 5. `/email-preview` | Already gated non-prod (iteration 21). The admin conjunct half of D6 is still an open owner question | No action |

**§7's three owner decisions, restated so they are answerable without re-reading
the doc:**

1. **Is the wall visualizer part of the pitch?** ~14,000 LOC (about 12% of the
   codebase), 15 of 119 API routes, 6 of 22 production npm dependencies, 5 tables,
   2 storage buckets, and 5,230 LOC of untested canvas/3D component code. Option A
   keep whole / B keep the customer preview and cut venue walls + artist showroom
   (~7,900 LOC) / C cut whole (~14,000). The doc recommends B and so do I: the
   venue-side wall management is the expensive, untested, quota-metered half, and
   the ~600 LOC customer-side preview is the part a buyer actually sees.
   **D0 says do not remove the visualizer, so B and C both need an explicit
   owner instruction that overrides it.**
2. **Do you intend to sell managed curation at launch?** `/curated` sells up to
   £199.99/quarter recurring. If launch is enquiry-only, dropping the two
   `managed_*` tiers removes the riskiest path (recurring Stripe subscriptions plus
   webhook subscription handling) without touching the marketing surface. If it is
   the plan, that surface needs its own payment and auth audit before launch.
3. **Are `/demo` and `/waitlist` still go-to-market assets?** ~1,100 LOC between
   them. `/demo` is the homepage's "Tour the platform" CTA; `/waitlist` is in the
   sitemap and linked from no UI at all. Cutting a live homepage CTA on a
   pre-launch product is a business call.

**And the blocker above all of them:** D6 says `08` is **not executable until
rewritten** to reconcile with `09` and with the Option A/B/C decision. That rewrite
is still outstanding, so nothing beyond the five unconditional items should be cut
by anyone, including a future session reading only this file.

`npm run check` green: 0 lint errors, 226 files, 2214 tests, 0 dependency
violations, exit 0.

### 09 item 4.1 — the email harness — DONE

`scripts/email-harness.ts` with `render` and `audit`, wired as `npm run
email:render` / `email:audit`, and **`email:render` is now inside `npm run
check`** as §E.1 asks. All **131** registry templates render, in HTML and
plaintext.

**One extraction it forced, and the extraction is the point.** `substituteTokens`
lived in `dispatcher.ts`, which imports `sendEmail`, which imports
`supabase-admin`, which imports `server-only` and throws the moment a script
touches it. So the harness could not reuse it, and a harness with **its own copy**
of the substitution would pass while the real one left a literal `{{token}}` in an
inbox. Moved to a dependency-free `src/lib/email/subject-tokens.ts`, one owner.

Same reason for `src/lib/email/dispatcher-ids.ts`. That is a second copy of the
binding table, so it gets this session's treatment: `dispatcher-ids-in-sync.test.ts`
(4) fails the moment it drifts. A stale copy would silently downgrade a real
"this token goes out literally" failure into a warning, which is the direction
that matters.

**The subject-token check is scoped, deliberately.** §E.1 says to fail on any
leftover token after substituting against the mock. Run as written it fails 9 of
131. Checked where a leftover token can actually reach an inbox: the dispatcher is
the **only** sender that substitutes, because every `sendEmail` caller passes an
explicit subject and the registry's is documentation. **None of the 9 are
dispatcher-reachable**, so it fails for those seven ids and reports for the rest.
Blocking `check` on a docstring would have taught people to edit the docstring.

**`audit` found five real things, and they are not what they first look like.**
Its raw output named 11 "sends referencing an id not in the registry"; seven were
false positives, because `sendTransactional({ template: "order_placed" })` names a
DISPATCHER name, not a registry id, so the audit resolves through the bindings
first as §E.1 says. The remaining five are:

`offer_received`, `suspicious_login`, `welcome_artist`, `welcome_customer`,
`welcome_venue`

These are **not broken sends**: `sendEmail`'s `template` is documented as the label
written to `email_events`, not as a registry id. The divergence still matters:

1. the per-category throttle filters `.eq("template", input.template)`, so one
   template with two labels throttles as two templates;
2. an operator asking "did that email send?" greps `email_events` by the id they
   know, which is the registry's, and finds nothing.

Left as a follow-up rather than renamed here: changing a label that is already
written into live `email_events` rows splits the history of those five templates
in two, which is a data decision.

**`email:audit` is deliberately NOT in `check`.** §E.1 says report first, error
once clean, and it is not clean. It exits 1 when run directly, so it is usable as
a gate the moment the five above are settled.

`npm run check` green, now including `email:render`: 0 lint errors, 227 files,
2218 tests, 131 templates rendered, 0 dependency violations, exit 0.

---

## Session close, 2026-08-28. What is left, and who owns it.

Sixteen commits. `npm run check` is green at every one of them, and the gate is
stricter than it was: it now runs `depcheck` and `email:render` as well as lint,
typecheck, test and the route allowlist. 0 lint errors throughout; 1982 tests at
the start of the session, 2218 at the end.

Four migrations written, applied to prod through the Supabase MCP, and verified
live in the same piece of work, per the standing rule. None left unapplied.

| # | What | Verified |
|---|---|---|
| 101 | `admin_users` | table exists, RLS on, 0 policies, no anon/authenticated grants, 0 rows |
| 102 | `strip_self_asserted_admin` trigger | both attack paths land on "customer" in a rolled-back transaction; a sign-in-shaped write leaves the existing admin admin |
| 103 | `venue_profiles.interested_in_local_artists` | nullable boolean, no default |
| 104 | `claim_artist_work_slot` | cap holds, an edit never consumes a slot even at limit 0; ACL `postgres=X, service_role=X` only |

### Owner decisions, consolidated

**1. The admin predicate cutover (D5 order, the only launch-adjacent one).**
Run `npm run admin:backfill` in an environment holding the real `ADMIN_EMAILS`,
confirm it reports every address resolved, then remove the `user_metadata`
conjunct from `userIsAdmin`. Prod today: `admin_users` is empty and exactly one
auth user carries `user_metadata.user_type = 'admin'`. **Doing the cutover before
the backfill locks every admin out.**

**2. `finlay-coles` is an approved artist whose page is unreachable.** It exists
in `artist_profiles` alongside a separate `fin-coles`, and `next.config.ts` 308s
`/browse/finlay-coles` to `/browse/fin-coles`. It is listed in `/browse` and every
click lands on a different artist. Same person, or two accounts? Which row wins?

**3. The demo persona package (K8 rename half).** `UPDATE artist_profiles SET
slug='maya-chen' WHERE slug='maya-chen-demo'`, delete the `maya-chen` static seed
and its six works, and complete Stripe Connect for the demo account so Bug 9's Buy
Now stops 422-ing. Prod confirms the demo row has no `subscription_status` and no
Connect account. The steps only work as one sequence: renaming first collides in
the merge, deleting first repoints the homepage's positional pick.

**4. `08` §7's three, unchanged and still unanswered.** Is the visualizer part of
the pitch (~14,000 LOC, 12% of the codebase, and D0 currently says keep)? Is
managed curation sold at launch? Are `/demo` and `/waitlist` still go-to-market?
**And `08` itself is still not executable until rewritten, per D6.**

**5. Drop the artist counter columns.** `total_views`, `total_placements`,
`total_sales`, `total_enquiries` on `artist_profiles` are now written by nothing
and read by no display. Dropping them is destructive, so it is yours.

**6. Backfill `placements.monthly_fee_gbp` for the 3 rows that need it.**
`PlacementDetailClient` still parses a fee out of the request message, with a
"re-confirm before payout" caveat. 3 of 86 live placements have a fee in the
message and nothing in the column, so deleting the parse would show "Free display"
on three real negotiated placements.

**7. Five `email_events` labels that are not registry ids** (`offer_received`,
`suspicious_login`, `welcome_artist`, `welcome_customer`, `welcome_venue`).
Renaming splits those templates' history in live rows. `npm run email:audit`
prints them and exits 1, so it becomes a gate the moment they are settled.

**8. `paused` reads as "Completed", and an unknown status reads as "Active".**
Both surfaced by the K4 collapse, both behaviour changes 07 §4.2 says need their
own commit and your sign-off.

### Not done, stated plainly rather than left to be discovered

- **09 Phase 3 items 3.3 to 3.7.** Feature builds, not wiring. 3.7 in particular
  needs a dispute-creation path that does not exist at all: `disputes` is a table
  written by nothing.
- **09 items 4.3, 4.4, 4.5, 4.7, 4.8.** 4.4 depends on the CI lint flag, 4.7 is
  DNS, 4.8 is time-based.
- **07 K9, K10, K11.** K11 (no committed base schema) needs a real `pg_dump`;
  reconstructing DDL from `information_schema` over the MCP would produce a schema
  file nobody could trust, which is worse than not having one.
- **07 §3.2's remaining JSX label sweep**, ~14 files. All four label
  implementations, both API ladders, both eslint suppressions and the E13
  collision are closed; what is left is hardcoded strings in list rows and
  dialogs, with no behavioural defect, and three of them are dev-only surfaces
  `08` should cull rather than fix.
- **The `08` cull beyond D6 item 3.** Surfaced with per-item verification instead,
  because two of D6's four "zero inbound link" deletions are not in fact clean.

### 09 items 4.4 and 4.5 — DONE, and 4.4 found a real gap

**4.4 first, because it turned out to matter more than it reads.** CI's `check`
job runs `npm run lint`, `npm run typecheck` and `npm run test` as three separate
steps. It does **not** run `npm run check`. So three of that script's six parts
never ran on a PR:

- `audit:allowlist` (the public-route + demo-exempt allowlist) — **this gap
  predates the session**;
- `depcheck` (the `one-email-entrypoint` rule from K1);
- `email:render` (the template render pass from 4.1).

Two of those three are guards **I added this session believing they gated**. They
passed locally and were decoration everywhere it counted. Fixed: three new steps,
kept separate rather than collapsed into one `npm run check` so a red build names
the gate that broke.

**The lock is derived, not hand-written.** `ci-gates.test.ts` now parses
`package.json`'s `check` script into its `npm run X` parts and asserts a CI step
exists for each, with no `continue-on-error`. Adding anything to `check` and
forgetting the CI step now fails the test instead of silently un-gating whatever
it was added for. Proved it bites by appending `schema:snapshot` to `check`: 2 of
19 failed naming it; reverting restored 18/18.

**4.5.** `src/emails/OUTSTANDING.md` opened with "113 templates built · 50 wired ·
63 outstanding". All three numbers were wrong: the audit reports **131 built, 65
wired, 66 with no send path**. Replaced with the command rather than with fresher
numbers, because a hand-maintained count in a file nobody regenerates is exactly
how the document came to disagree with the codebase. §E.1 calls the audit "the
honest replacement for OUTSTANDING.md:3", so that is what it now says.

**One deviation from §4.5, stated rather than fudged.** It also says to delete
§1.1, §1.2 and §2.1 as "done in 0.5". Those are DNS records, Vercel environment
variables and Supabase dashboard settings. **Nothing in the repository can tell
me whether they are done**, so deleting them would be asserting infrastructure
state this file cannot see. They stay, with a note saying exactly that and what
to check before deleting them.

`npm run check` green: 0 lint errors, 227 files, 2218 tests, 131 templates, 0
dependency violations, exit 0.

### 09 item 4.3 — the §C.5 matrix as a test — DONE

The matrix is now declared in `email-one-per-event.test.ts` rather than described
in prose, and checked both ways: every row must name a template `EMAIL_REGISTRY`
carries (catching a row for a template nobody built) and a template something
actually sends (catching a row that is documentation only). Dispatcher rows
resolve through `TEMPLATE_BINDINGS` first, or seven of them read as unsent. A
third assertion holds §C.5's five retired templates unreferenced.

**Three rows shipped under different ids from the doc's proposed names**, and the
difference is recorded in the test rather than left to be tripped over:
`venue_placement_sale` → `venue_sale_from_placement`, `customer_order_cancelled` →
`customer_order_status_update`, `operational_admin_alert` → `admin_alert`. The
first two because the shipped templates cover a wider case than the proposed name
implies; the third because K1 collapsed eight admin notifiers into one.

**The real gap this closed:** §C.5's "+1 venue email only when a revenue share
exists" was **untested**. The item-1.1 fixture had `venue: null`, so the venue
branch had never been exercised at all. Five new tests: nothing to the venue on a
zero share, exactly one on a real share, buyer and artist still exactly one each
alongside it (an addition, not a replacement), the key is order-scoped so a Stripe
redelivery cannot double it, and the venue can actually see their share.

**One of those tests was weaker than it looked, and I only found out by checking.**
The "no revenue" case originally passed `venue: null`, which tests "no venue" —
every implementation passes that, including one with the revenue check deleted.
Verified by deleting `&& venue.revenue > 0` and watching it stay green. Rewritten
to attach a venue with a zero share; it now fails on that mutation.

**The last assertion moved from props to rendered HTML.** Every direct `sendEmail`
call in this codebase passes `Template({...})` rather than
`createElement(Template, {...})`, so the element carries the shell's props, not
the template's, and a props assertion would have been checking the wrong object
(it was, and passed vacuously). Rendering makes the claim stronger anyway: the
venue actually sees "£21.00", rather than it merely having been handed over.

`npm run check` green: 0 lint errors, 227 files, 2235 tests, exit 0.

### 09 items 3.6 + 3.7 — disputes, built end to end — DONE

Done together because they share one question, "who are the two parties to this
order", and answering it twice is how one side ends up told and the other does
not.

**3.7 was a feature build, not a wiring task, exactly as §D.1 warned.** The
`disputes` table shipped in migration 060. The admin panel could list and resolve
rows. `OrderDisputeOpened` and `OrderDisputeResolved` were both written, styled
and registered. And **nothing anywhere could create a dispute**, so the table was
permanently empty, both templates were unreachable, and a buyer with a damaged
painting had no route that was not an email to support.

`POST /api/disputes` now exists. Authenticated, demo-guarded, rate-limited,
zod-validated, and the opener must be a party to the order or placement, checked
through `assertOrderParty` / `assertPlacementParty` rather than an inline
comparison, per §D.1 and for the reason K9 exists. It inserts the row, mails both
parties, records the lifecycle event and alerts an admin.

**Deliberately not idempotent at the row level.** A person can open a second
dispute on one order, and refusing it would silently swallow a real complaint.
The emails carry the dedupe instead, keyed on the dispute id and the party's
role, so a retried request that does create a second row still cannot send two
copies about the first.

**One deviation from §D.1, and it is the doc that is wrong.** It specifies 403
for a non-party. `authz.ts` denies with 404 by design, documented in its own
header: a 403 confirms the row exists and is an enumeration oracle. The source
wins. The test asserts 404, states why, and adds a second test proving a
stranger cannot tell a real order id from an imaginary one.

**`disputed` had to stop mapping to null.** It was internal-only for as long as
no dispute could exist. Now the order's own lifecycle log has to show the case,
or the K3 stepper and any payout reconciler cannot see it. `emailsForEvent` still
returns `[]` for it on purpose: the route mails both parties itself, and a
trigger here would be a third email for one dispute, which is the duplicate-send
class K1 spent its whole PR removing.

**Migration 105 (written, applied to prod, verified live).** `order_events`
constrains `event_type` with a CHECK rather than an enum, so `order.disputed`
would have failed the INSERT. Widened by drop-and-add, which is additive: every
previously legal value is still legal and no existing row can violate it.
Verified against `uwkuhygwvasdzwsusiym`, the live definition now carries all
eight values. Did **not** add `order.dispute_resolved`: `eventForStatus` maps
from `orders.status` and no such status exists, so the value would be
unreachable from the only code that writes these rows.

**What opening a dispute deliberately does NOT do: change `orders.status`.** It
writes the lifecycle event and leaves the status alone. Flipping an order to
`disputed` would move it through the payout state machine, and that is a money
decision, not a wiring one. The dispute is visible in the admin panel and on the
order's event log either way.

**3.6 was a one-line root cause.** `admin/disputes/[id]` pre-fetched
`.select("id, status")`, so at the moment it resolved a case it held a decision
and no people. It could not have emailed the parties even if it had tried. The
select now carries `order_id, placement_id, opener_user_id`, and a resolve sends
`order_dispute_resolved` to both parties with the admin's own resolution text as
the outcome. Only on `resolve`: `close` has no outcome text and `escalate` is an
internal reclassification, so an email for either would say nothing.

**37 new tests, every fix verified fail-before by reverting it.** Mapping
`disputed` back to null fails the lifecycle test. Collapsing the idempotency key
to the dispute id alone fails the distinct-keys test. Emailing only the first
party fails four. Reverting the admin select to `"id, status"` fails the
column test; deleting the email block fails three more.

**One of mine was vacuous and I caught it on that last check.** "puts the admin's
resolution text in the email" iterated `sendEmail.mock.calls` directly, so with
the email block deleted it looped over an empty array and passed. Asserting the
count first fixes it, and it now fails on that mutation with the other two.

`npm run check` green: 0 lint errors, 230 files, 2274 tests, 131 templates, 0
dependency violations, exit 0.

### 09 item 3.4 — the contact form now answers the sender — DONE

Built `SupportRequestReceived` and wired it into `POST /api/contact`, which until
now told the Wallplace team and told the sender nothing. From the sender's side a
support request and a form that silently failed looked identical: same spinner,
same "thanks", no email, no reference, no way to check.

**§D.4's open question, answered: no, the 5/min IP limit is not sufficient.** The
acknowledgement is a REFLECTED send, an anonymous caller names the recipient, and
everything `sendEmail` already does is keyed on the wrong thing for that case.
The idempotency key stops a retry, not a fresh submission with new text. The
throttle needs `input.userId` and a stranger has none. `orders_and_payouts` sets
`throttleCount: 0` deliberately, because a receipt must never be dropped. And the
route's own limit is per IP, while the attack worth stopping is many IPs at one
inbox.

So `src/lib/email/unverified-recipient.ts` caps sends **per recipient**: three of
one template to one address per hour. It fails open on a database error, because
it guards against abuse and a Supabase blip must not silently swallow a real
person's acknowledgement. The newsletter confirmation (3.5) has exactly the same
shape and uses the same guard, which is why it is a module and not four lines in
a route.

**When the cap bites, only the EMAIL is refused.** The submission is still stored
and the admin alert still goes. Someone being flooded must not also lose the
ability to reach support.

**§D.4 is wrong about the reference, in two ways, and following it literally
would have broken the contact form.** It says to quote `submission.id` back at
the sender, via `.insert({...}).select("id").single()`.

1. `contact_submissions.id` is a **bigint sequence**, not the uuid the doc
   assumes. Reference "6" tells the sender Wallplace has had six contact
   submissions ever; submit twice a month apart and the gap is the growth rate.
2. The route uses the **anon** client. That table has INSERT policies and **no
   SELECT policy**, so PostgREST would filter the RETURNING to zero rows and the
   route would answer 500 on every submission it had just successfully stored.

**Migration 106 (written, applied to prod, verified live).** Adds
`contact_submissions.reference`, a `WP-XXXXXXXX` opaque token with a
`gen_random_bytes` default and a unique index. The route generates it and inserts
it, so nothing is ever read back and the anon path is untouched. Backfilled the
five existing rows; verified live that all 5 have distinct references matching
the format.

**A prod finding, recorded not acted on (grants are on the escalation list).**
All 53 public tables grant `TRUNCATE`, `REFERENCES` and `TRIGGER` to `anon` and
`authenticated`, alongside SELECT/INSERT/UPDATE/DELETE. This is Supabase's stock
default-privilege set rather than something Wallplace did, and PostgREST exposes
no TRUNCATE verb so it is not reachable through the API. It is still a wider
grant than any table needs, and `contact_submissions` in particular is protected
from reads only by the absence of a SELECT policy: add one permissive policy for
any reason and every name, address and message body becomes publicly readable.
Listed with the other owner decisions at the end of this file.

**14 tests, each fix verified fail-before.** Removing the acknowledgement fails 7.
Ignoring the flood guard fails 1. Returning a sequence-shaped reference fails 3.
Sending when the insert failed fails 1. One test asserts the route never calls
`.select()` after the insert, by giving the mock no `select` method at all.

`npm run check` green: 0 lint errors, 232 files, 2299 tests, 132 templates, 0
dependency violations, exit 0.

### Found while building 3.5 — one auth-user lookup, three latent duplicate-account bugs — DONE

Not on the plan. Building the newsletter confirmation needed "which auth user has
this email?", and three routes already answered it, each with its own copy of the
same four lines:

```
const { data } = await db.auth.admin.listUsers();
const user = data?.users?.find((u) => u.email === app.email);
```

**Both bugs were in all three copies.**

`listUsers()` with no arguments returns the **first 50 users**. Production has 40
today, so all three worked and all three were going to stop working at user 51,
silently, by reporting "no such user" for a user that exists. In
`admin/applications/[id]` that is not a display glitch: the miss falls through to
the invite path and creates a **second auth account** for an artist who already
has one, on approval.

And `u.email === app.email` is case-sensitive against a store that lowercases.
GoTrue normalises addresses; forms do not. An application submitted as
"Maya@Example.com" never matches the existing "maya@example.com" account, at any
user count. Same duplicate-account outcome, available today.

`account/roles` had the same defect under a comment asserting the opposite:
"admin.listUsers() paginates at 1000/page". It does not. The switch-portal menu
was going to start silently vanishing for anyone whose second account landed past
user 50.

`src/lib/auth/find-user-by-email.ts` replaces all three, with three shapes
because the call sites genuinely differ: `findUserByEmail` (first match, exits as
soon as it finds one), `findAllUsersByEmail` (every account on an address, which
is what the switch-portal menu needs, so it always reads to the end), and
`findUserIdsByEmails` (many addresses in ONE pass, because looping the singular
form over 20 enquiry senders pages 20 times).

`tests/integration/one-user-lookup.test.ts` is the ratchet: nothing outside the
helper may call `listUsers`, no call anywhere may omit its page size, the three
former call sites must still import the helper, and nothing may compare an email
with `u.email ===`. Reverting one call site to the old shape fails 3 of its 4
assertions.

25 unit tests on the helper. The pagination one builds 640 users and looks for
number 601; the case one is a straight "Maya@Example.com" against
"maya@example.com".

`npm run check` green: 0 lint errors, 234 files, 2328 tests, exit 0.

### 09 item 3.5 — newsletter double opt-in — DONE

The intent has been in the schema since migration 016 and was never implemented.
`email_preferences.newsletter_enabled` defaults to **false** with the comment
"double opt-in", `newsletter_subscribers` had no token column, so there was no
way to confirm anything and nothing ever set that flag true. Two consequences:
subscribing did nothing anyone could observe, and **anyone could subscribe anyone
else's address**.

Built end to end: `NewsletterSubscribeConfirm`, a token on the signup insert, the
send, `GET /api/newsletter/confirm`, and a landing page. §D.3 is right that the
route is the load-bearing half: without it the link 404s and double opt-in is
worse than none, because nobody is ever confirmed and the form still looks like
it worked.

**Migration 107 (written, applied to prod, verified live).** `confirm_token TEXT
UNIQUE` and `confirmed_at TIMESTAMPTZ`, plus a partial index on unconfirmed rows
only.

**The three existing subscribers are grandfathered as confirmed, and that is a
decision worth seeing.** They subscribed under single opt-in, which is consent:
they typed an address and pressed a button. Leaving them NULL looks like the
cautious choice and is not, because every future "send only to confirmed" query
would then silently drop three real people who did opt in and were never offered
a link. `confirmed_at` is set to their own `subscribed_at`, not to now, so the
row does not claim a confirmation happened today. One UPDATE reverses it. Listed
with the other owner decisions.

**The token is cleared on confirmation, not kept.** A retained token is a
standing capability sitting in a mailbox archive, a forwarded email and any proxy
log that recorded the URL. Cleared, a second click finds no row and lands exactly
where an unknown token lands, so "already confirmed" is not an answer anyone can
read off the page.

**The 7-day expiry in the email copy is enforced.** A claimed expiry that is not
checked is simply a false statement to the reader; the route compares against
`subscribed_at` and lands expired links on their own message.

**No resend on a duplicate**, per §D.3. The consequence is real and stated rather
than hidden: someone whose confirmation goes to spam has no self-service retry.
The recovery path is the contact form, which as of item 3.4 actually answers.

**The reflected-send cap from 3.4 applies here too**, which is why it is a module.
This is the same shape: an anonymous caller names a recipient who has not proved
they own the address. A flooded address gets the row and no email, and the
response is byte-identical to a fresh signup, so the cap cannot become the
membership oracle E36d removed.

**`sendEmail` is deliberately called with no `userId`.** Passing one would make it
check `newsletter_enabled`, which defaults to FALSE, and suppress the very email
whose job is to turn it true.

`tests/integration/schema-columns.json` regenerated for 106 and 107. The
regenerator needs `SUPABASE_ACCESS_TOKEN`, which this environment does not have
(D12), so it was rebuilt through the MCP instead and cross-checked: a per-table
md5 of the column list, live against committed, showed drift in exactly the two
tables these migrations touched and none elsewhere, and zero drift after the
patch. Not grandfathered, per D61.

31 tests across the two routes, each fix verified fail-before. Removing the
confirmation send fails 4. Keeping the token fails the single-use test. Dropping
the expiry check fails the expiry test. Skipping the preference flip fails that
one.

`npm run check` green: 0 lint errors, 235 files, 2355 tests, 133 templates, 0
dependency violations, exit 0.

### 09 item 3.3 — the first paid moment now sends something — DONE

Six `subscription_*` templates were registered and five were wired. There was no
"started", so an artist began paying Wallplace and received nothing in writing:
no amount, no billing date, no record they could file.

**The comment is why nobody noticed.** `stripe/route.ts` skipped the signup
invoice with "which is covered by subscription_created or the checkout receipt".
Neither existed. The comment described an intended design and read as a
description of the code, so the gap it named looked deliberate. It is accurate as
of this branch, and now says which item made it true.

Built `SubscriptionStarted` and the `customer.subscription.created` branch. The
amount, currency and interval come off the subscription item rather than a plan
table, so the email quotes what Stripe will actually charge. The plan name comes
from the price-id map, and an unrecognised price sends **nothing** rather than
guessing, the same rule D12 imposed after an unset `STRIPE_PRICE_PRO` charged
every Pro artist 15% instead of 5%.

**A trial's first charge is the trial end, not the period start.** Otherwise the
email tells someone they were billed today for a plan they have not paid for yet.

Keyed on `subscription.id`, so a Stripe redelivery cannot send a second
"you're on Premium". Wrapped so a mail failure still returns 200: the
subscription is already recorded, and a non-2xx would make Stripe retry a webhook
that did its real work.

Left `isRenewal` alone, per §D.5. `billing_reason === "subscription_cycle"`
already excludes `subscription_create`, and that is now correct rather than
accidental, because the new email owns the first one. There is a test for it.

**A new test file rather than an extension**, contrary to §D.5's suggestion.
`stripe-webhook.test.ts` pins `constructEvent` to one hardcoded
`checkout.session.completed`, so it cannot drive a subscription event without
rewriting the fake every other test depends on.

**One of my own tests was weak and the mutation run caught it.** "Puts the first
charge at the trial end" asserted only that the trial date appeared somewhere in
the body, and `trialEndsAt` renders that same date in the info box, so billing
from the period start passed it. Now it also asserts the period-start date
appears nowhere, and fails on that mutation.

11 tests. Removing the branch fails 5, firing on `updated` too fails 1, letting
the renewal receipt fire on the signup invoice fails 1.

**Not done: `subscription_card_expiring`**, the sixth and only other unwired
subscription template. §D.5 marks it lower priority and points at §F, and its
trigger is either a new Stripe event handler or a monthly cron. Listed as
outstanding rather than quietly skipped.

`npm run check` green: 0 lint errors, 236 files, 2366 tests, 134 templates, 0
dependency violations, exit 0.

### 07 §3.2 — the JSX label sweep, finished — DONE

The last open piece of K3. §3.2's inventory listed 17 files still holding
hardcoded arrangement-label strings after the four implementations and both API
ladders were collapsed. All of them now read from `arrangement-labels.ts`.

**It was not, as recorded, purely cosmetic. Two real defects were in there.**

**1. A fifth live implementation.** `MessageInbox.tsx` carried the whole ladder
inline in JSX, and it disagreed with the canonical one: a `paid_loan` row whose
`monthly_fee_gbp` is null read **"Free display"** in the message thread and
**"Paid loan"** in the placements list, for the same placement, in two panes of
the same application. Now one call to `labelForArrangement`.

**2. Title-case divergence, which is E13 again and was still live.** `/browse`
rendered "Paid Loan" on a work card while the artist's own profile rendered
"Paid loan". `venue-portal/profile` disagreed **with itself**: the three toggles
were title-cased and the summary line directly beneath them was sentence-cased.
Also in `BrowseArtistCard`, `SpacesPlacementRequestForm` and
`ArtworkRequestForm`.

**Two new guards, both verified to bite.** One rejects any hardcoded canonical
label in a rendering surface, matching the string- and JSX-literal forms rather
than the bare words, so prose is not swept in. The other rejects any title-cased
variant anywhere, because those are wrong however they are produced. Putting
"Paid Loan" back in `BrowseArtistCard` fails the second; putting "Revenue share"
back into a `<span>` fails the first.

**The title-case guard found one more thing, and it is a live display bug.**
`venue-portal/enquiries` typed its `type` field as
`"Paid Loan" | "Revenue Share" | "Purchase" | "Display"` — the arrangement
vocabulary, which that column has never held — and populated it by casting
`e.enquiry_type` straight in. So TypeScript could not object, and the union was
fiction. Checked against prod: `enquiries.enquiry_type` holds `venue_looking`
(7), `general` (3) and `purchasing` (1), and the portal rendered those raw. A
venue's enquiries list showed a badge reading **"venue_looking"** on 7 of its 11
rows.

`src/lib/enquiry-types.ts` is the fix: four values, their labels, and the option
text the artist-profile form already had written inline. The form and the badge
now read the same list, and an unrecognised value is title-cased from its own
slug rather than replaced with "Other", so a legacy row still says what it is.

**One behaviour change worth naming.** Routing `MessageInbox` through the
canonical function changes what a fee-less `paid_loan` reads as, from "Free
display" to "Paid loan". That is the canonical answer and matches
`terms-summary.ts`, but it is a change, not a no-op.

`npm run check` green: 0 lint errors, 237 files, 2375 tests, 134 templates, 0
dependency violations, exit 0.

### 07 K10d — the `002_run_me.sql` ghost, answered — DONE, and it was not harmless

K10d asks whether the deleted `002_run_me.sql` was ever applied to production.
**It was**, and the answer came with a live defect attached.

`002_run_me.sql` was added in `b22c19d`, deleted in `72b1f72` the same day, and
never joined the numbered series. Every one of its 24 objects exists in prod
today. 21 of them are also created by `001_analytics_events.sql`, so for those
the ghost is invisible. **Three are not.**

`idx_analytics_artist`, `idx_analytics_type` and `idx_analytics_venue` are live
in production, doing **837, 1079 and 130 scans**, and are created by **no
committed migration**. That is direct evidence the file was pasted into the
dashboard, not inference.

**And that turns a correct-looking migration into a real divergence.** `001`
creates the same three indexes under its own names (`idx_ae_artist_slug`,
`idx_ae_event_type`, `idx_ae_venue_name`). `070_qa44_db_hardening.sql:88-90`
drops all three as "redundant duplicate indexes", which was right **in
production**, where they duplicated the `idx_analytics_*` set. But 070 could only
drop what the repo knew about, and the repo has never known about
`idx_analytics_*`. So:

- **production** keeps the un-migrated three, and they are load-bearing;
- **a database built from the repo alone** creates 001's three, drops them at
  070, and ends with **no index at all** on `analytics_events(artist_slug)`,
  `(event_type)` or `(venue_name)`.

`analytics_events` is the busiest table in the system. A preview branch, a CI
database or a rebuilt production would sequential-scan every artist analytics
query. This is K11's thesis, "a fresh database built from the repo alone reaches
the same schema as production", failing in one measurable place.

**Migration 108 (written, applied to prod, verified live).** Creates the three
under the names **production** uses, `IF NOT EXISTS`, so it is a genuine no-op
there rather than a fourth copy under a fifth name. Verified after applying: the
scan counters are unchanged at 837 / 1079 / 130, which is what a no-op looks
like. Purely additive.

**Every other index 070 drops was checked against prod and is genuinely
covered**, each by a UNIQUE-constraint index a committed migration creates:
`artist_profiles_user_id_key`, `artist_profiles_slug_key`,
`artist_profiles_referral_code_key`, `artist_referrals_referral_code_key`,
`cart_sessions_stripe_session_id_key`, `newsletter_subscribers_email_key`,
`placement_records_placement_id_key`, `venue_profiles_slug_key`,
`venue_profiles_user_id_key`. The analytics three were the only unreplaced drop.

**`tests/integration/migration-index-drops.test.ts` is the guard**, and it is the
general form rather than a note about these three. It replays every
index-creating and index-dropping statement across all 108 migrations in filename
order and fails when a `(table, columns)` pair that once had an index ends with
nothing covering it. Getting it to be *correct* rather than noisy took three
things the first cut lacked, each of which was a false positive it found:

- **statement order within a file.** 074 drops
  `stripe_transfers_order_recipient_uniq` and recreates it two lines later.
  Processing all creates before all drops deleted the replacement.
- **UNIQUE-constraint indexes.** `newsletter_subscribers(email)` and four others
  are covered by a constraint's backing index that no `CREATE INDEX` names.
- **leading-column prefixes.** `walls(user_id)` is served by
  `walls_user_owner_type_idx`, exactly as 072 says.

One deliberate removal is allowlisted with its reason: `021` drops
`idx_placements_unique_active` because a venue can legitimately hold several
works by one artist at once. That was a constraint, not an access path, and prod
has no such index.

Verified both ways: deleting migration 108 fails 2 assertions naming the three
indexes; adding a bare `DROP INDEX idx_placements_status` fails the sweep naming
that pair.

**Still not done, and still honestly blocked: K10b, K10c, K11a.** They need the
Supabase CLI, Docker and `pg_dump`, and this environment has **none** of the
three (checked: `docker info` fails, `supabase`, `psql` and `pg_dump` are all
absent). K10c's CI job is the only thing that actually proves K10 and K11, and
writing a CI job I cannot execute once is how the 4.4 gap happened: a guard that
passes locally and is decoration where it counts. It stays open rather than
becoming a green tick nobody tested.

`npm run check` green: 0 lint errors, 238 files, 2378 tests, 134 templates, 0
dependency violations, exit 0.

### 09 items 2.2 and 2.9, and a live data-loss bug found underneath them — DONE

Group 2 was recorded as complete. Three items were not, and the third turned out
to matter most.

**2.9: a guard exemption that outlived the file it excused.**
`no-inline-admin-check` exempted `src/lib/email.ts`, which K1 deleted. A dead
exemption is worse than a dead file: it silently covers whatever is created at
that path next, and that is an obvious path for someone to recreate. §2.9 says to
repoint it at the replacement; **deleted instead**, because the replacement does
not need one. `admin-alert.ts` imports `adminEmails()` from admin-auth rather
than reading the env, so the ops inbox is the same list the rule protects, by
construction. Two tests: the old path is no longer exempt, and nothing but
`admin-auth.ts` is.

**2.1 is done under a different name, which is a doc correction not work.** It
asks for an `internal_ops` category with `stream: "tx"`,
`criticalAlwaysSend: true`, `throttleCount: 0`. `platform_admin` already existed
with exactly those three values and `AdminAlert` already uses it. Adding a second
identical category would be the duplication this document exists to remove.

**2.2: `sendMessageUnreadEmail` was inline, and `enquiry/route.ts` had its own
copy.** They had drifted three ways, each visible to a real person:

- `messages` truncated the preview at 200 characters; `enquiry` did not, so a
  long enquiry shipped whole into a block sized for a preview.
- `messages` keyed the send on **`Date.now()`**, which is not an idempotency key
  at all: a Vercel retry of one request sent a second email. `enquiry` keyed on
  the **conversation**, so a genuine second enquiry in an existing thread was
  silently dropped as a duplicate. Both wrong, in opposite directions.
- different subject lines for the same event.

`src/lib/email/notifications.ts` is now the one function, keyed on the message
row's id, which needed the insert to stop discarding it.

**The bug underneath: a flagged message silently lost its type, its metadata and
its attachments.** Row 22's class, in a file row 22 never looked at.

`messages/route.ts` built an `extendedRow` and fell back to a `baseRow` "if the
columns don't exist yet". The fallback was reachable, for a specific reason:
**`flagged` and `flagged_reason` do not exist on `messages`** (checked against
prod and against `schema-columns.json`), while `message_type`, `metadata` and
`attachments` all do. So a message that tripped the moderation filter carried two
phantom columns, PostgREST rejected the whole insert, and the retry wrote the
base row instead.

In plain terms: **a flagged placement-request message was stored as a plain text
message with no type and none of its negotiated terms, its attachments dropped,
and nothing errored.** The only trace of the flag was a `console.warn`.

Fixed: one insert, no ladder, and the flag travels in `metadata`, a jsonb column
that exists, so the signal survives on the row and is queryable.

**The test fake now rejects unknown columns the way PostgREST does**, which is
the difference between asserting a row's shape and reproducing the failure that
shape caused. I found that out by mutation: with a shape-only fake, restoring the
old code failed 3 of 5; with the faithful fake it fails 4 of 5, including the one
that matters ("keeps message_type, metadata and attachments on a FLAGGED
message").

**Surfaced, not built: flagged messages still reach no admin queue.**
`moderation_queue` (058) has a typed payload union covering blogs, feature
requests and feedback, with no `message` member. Adding one means extending the
union, the parser, the admin renderer and the `entity_type` constraint. That is a
feature. Listed with the other owner decisions.

`npm run check` green: 0 lint errors, 239 files, 2399 tests, 134 templates, 0
dependency violations, exit 0.

### 09 item 2.8 — the guard was watching for functions that no longer exist — DONE

`no-unawaited-critical-sideeffect` denylisted **`executeTransfer`, or any name
matching `/^notify/`**. K1 deleted every `notify*` function when it removed
`src/lib/email.ts`. So from that PR onward the rule guarded exactly **one real
name**, and a pattern matching nothing, while the four functions that took over
the notifiers' job went uncovered: `sendEmail`, `sendTransactional`,
`sendAdminAlert`, `recordOrderEvent`.

The rule was still registered, still in `check`, still green, and had stopped
covering the thing it was written for. Nothing in the build could say so, because
"zero violations" is what a working guard and a dead one both look like.

**It found a live one immediately.** `placements/route.ts:614` fires the
"request sent" confirmation to the person who just made a placement request as a
bare `sendEmail(...).catch(...)`. The `.catch` stops an unhandled rejection; it
does not keep the runtime alive. On Vercel an un-awaited promise left running
after the response can be killed mid-flight, so the confirmation silently never
sends and `email_events` records nothing, which is the exact failure that table
exists to make visible. §B.6 predicted this violation and named the line.

Fixed with `afterResponse`, the pattern `waitlist`, `apply` and `register-venue`
already use: the runtime keeps the function alive and the requester does not wait
on the send. Zero violations after.

22 new rule tests: each of the five names flagged bare, flagged behind a
`.catch()`, allowed when awaited, and allowed inside `afterResponse`. Plus one
that a hand-rolled `notify*` is still caught, so the dead pattern earns its keep
as an on-the-way-in guard, and one that `sendEmailPreferencesLink` is not
`sendEmail`. Reverting the denylist fails 10 of 32.

**Two more Group 2 items were done under different names, which is a doc
correction rather than work.** 2.1's `internal_ops` category is `platform_admin`,
which already had the three values §B.3 specifies. 2.7's
`no-legacy-email-import.js` is the `one-email-entrypoint` dependency-cruiser rule
plus `no-legacy-email.test.ts`; the cruiser catches relative paths a lint rule
would miss, and it runs in `depcheck` inside `check`.

**2.3's six templates: three shipped under different ids.**
`artist_new_placement_request` → `venue_new_placement_request` /
`artist_new_placement_invitation` (the shipped pair splits by recipient, which
the single proposed name does not),
`venue_curation_enquiry_received` → `curation_enquiry_received`, and
`venue_curation_payment_received` → `curation_payment_received`. Recorded here
the same way the §C.5 matrix records its three renames.

`npm run check` green: 0 lint errors, 239 files, 2421 tests, exit 0.

### Documentation truth pass — the checklists now match the code

The ledger is the source of truth and it had drifted, in both directions.

**`09` is complete bar four items, none of which this repository can do.** 31 of
its 35 checklist items are now ticked, and the four that are not are labelled
with why: 0.5 is DNS, Resend and Vercel env state; 3.1 is a Supabase dashboard
paste; 4.7 is DMARC staged over weeks; 4.8 is time-based and gated on the `08`
rewrite. Nothing in the repo can observe any of them, so ticking them would be
asserting infrastructure state this file cannot see.

**Three items were ticked in the ledger and were not done**, which is how 2.2,
2.8 and 2.9 came to be found late. 2.8 in particular had been quietly inert since
K1 and was hiding a live fire-and-forget send.

**Four were done under a different name and read as outstanding.** 2.1
(`internal_ops` → `platform_admin`), 2.3 (three of six templates shipped under
different ids), 2.7 (a dependency-cruiser rule instead of a lint rule), 1.4
(retirement enforced by a test rather than a registry flag). Each is now ticked
**with the difference written next to it**, so the next reader does not go
looking for a file that was deliberately never built.

**`06` was complete and entirely unticked.** Phase C's C1–C5 are all in the code:
the static `CLIENT_ENV` map, `GATING_V1.prodDefault: true`, the
`no-spread-into-db-write` rule, and the FLAGS↔CLIENT_ENV consistency test. V3 and
V4 stay open because both say "manually replay against a dev server".

Ledger rows 3, 10 and 11 rewritten to match.

### 04 §9.3 + open question 2 — the reconciliation report, and what it found — DONE (the report). The finding is OWNER.

Two items from `04`'s close-out that need no fund movement to build.

**Open question 2: the Stripe API version is now pinned.** `src/lib/stripe.ts`
passed no `apiVersion`, which does not mean "latest": it means the version
configured on the Stripe **account** applies. So the request and response shapes
every handler reads were decided in a dashboard, not in this repository, and a
bump made there would change them with no code change, no deploy and no review.
The shapes that would break quietly are the invoice and subscription ones
`paid-loan-billing.ts` reads, and `subscription.items.data[0].current_period_end`,
which `stripe-subscription-period.ts` exists to normalise **because Stripe has
already moved it once**.

Pinned to `2026-03-25.dahlia`, the version the installed SDK is built for. That
is the conservative pin, not an upgrade: the runtime now returns exactly the
shapes the TypeScript types describe instead of the two being free to differ.
**It cannot silently drift**, because the SDK types `apiVersion` as a single
string literal, so bumping the `stripe` package without updating the line fails
`typecheck` with both versions named in the error.

**§9.3: `npm run audit:reconcile`.** The arithmetic is in
`src/lib/finance/reconcile.ts` (18 tests, no database) and the script is a thin
shell. Two checks per revenue-bearing order: `total` must equal
`artist_revenue + venue_revenue + platform_fee`, and every penny of
`artist_revenue` must have a matching `stripe_transfers` row. Exit 0 clean, 1
drift, 2 misconfigured, so it can be a cron that pages. Refunded, cancelled,
failed and void orders are skipped, or every refund would read as drift. A
`blocked` transfer counts as committed: the charge happened and the money is
owed, and treating it as absent would make a stuck payout look reconciled.

It does **not** talk to Stripe, and says so. It answers "are our own books
internally consistent", which is the question that catches D4, E9 and D16. "Does
Stripe agree" is a different job and needs a live key.

**Ran the same two rules against production, and they found things.**

| | |
|---|---|
| Revenue-bearing orders | 12 |
| Gross | £1,174.87 |
| Recorded as owed to artists | £953.20 |
| Rows in `stripe_transfers` | **0** |

**`stripe_transfers` is completely empty.** Twelve real paid orders, £953.20
booked as owed, and not one ledger row. All twelve predate the C2/C3 leg work, so
this is history rather than a live regression, but the money is still owed and
nothing in the system records that.

**`WS-P06DDkUs` (2026-05-17, £64.49) has no artist at all.** `artist_slug` NULL,
`artist_user_id` NULL, and `artist_revenue`, `venue_revenue` and `platform_fee`
all zero. £64.49 collected, nobody attributed, nothing allocated. That is exactly
the D4 signature, and it is the single order whose split does not sum.

**Five more have a slug and no user id**: `WS-agEXJ0gn`, `WS-iJ7I3ENn`,
`WS-kcsWHfhq`, `WS-duumFTnR`, `WS-rQDHDmz5`, £535.42 between them. Same class:
the slug resolved, the user id did not, so `if (artistUserId && artistRevenue > 0)`
was false and no transfer was ever scheduled. D4's fix stops this happening again;
it does not repair these.

**This is an owner decision and I have not touched it.** Paying, writing off or
re-attributing any of it is fund movement. What the loop can do is make it
visible and keep it visible, which is what the script is for. Two of the twelve
name demo personas (`fin-coles`, `maya-chen`), so some may be test traffic; the
owner can tell and I cannot.

**Not added to `npm run check`.** It needs a service-role key and a network
round-trip, and `check` must stay runnable offline. §9.3 wants it nightly in CI,
which needs the secret adding first, the same blocker row 0c already carries.

`npm run check` green: 0 lint errors, 241 files, 2442 tests, 0 dependency
violations, exit 0.

### Found by sweeping for the strip-and-retry class: the referral programme has never worked — DONE

Row 22 found seven of these in `placements/route.ts`. 09 item 2.2 found an eighth
in `messages/route.ts`. This is the ninth, in `api/apply`, and it is the worst,
because the fallback did not merely hide a failure. **It deleted a field on every
application ever submitted.**

The chain, verified end to end against production:

1. `api/apply/route.ts` writes `referred_by_code` into `artist_applications`.
   **That column does not exist**, and never has. Migration 019 added it to
   `artist_profiles` only.
2. PostgREST therefore rejects the insert, and the strip-and-retry drops
   `referred_by_code` and inserts again. The application saves. The code is gone.
3. `admin/applications/[id]:202` reads `app.referred_by_code` on approval and
   copies it onto the new `artist_profiles` row. Always undefined.
4. The Stripe webhook credits a referrer **30 days of `free_until`** when a
   referred artist first pays, keyed on `artist_profiles.referred_by_code`.
   Always null, so it has **never fired**.

**Production: 13 applications, 7 artists holding a referral code to share, and 0
profiles recording who referred them.** The whole programme is dead, end to end,
and the retry loop is exactly why nobody found out. Without it, the first
application would have 500'd and someone would have fixed it in an hour.

**Every application inserted twice, referred or not.** `referred_by_code: null`
still names the column, so the first attempt always failed.

**Migration 109 (written, applied to prod, verified live).** One nullable TEXT
column plus the partial index 019 put on the other table. No backfill: the 13
existing applications keep NULL, which is the truth. Their codes were destroyed
at submission and are not recoverable from anything the database kept.

The strip-and-retry is deleted. It listed six columns to drop "if the schema
lags"; **five of them exist**, so for those it could only turn a real failure
into a quieter, lossier write.

**OWNER: this switches a dormant programme on.** Recording the code is a data
fix. The consequence is not: from the next referred artist's first payment, the
webhook will credit their referrer 30 days of `free_until`, and `free_until`
feeds `platformFeePercentForArtist`, so the platform takes no fee from that
artist for a month. That is real money, it has never happened once, and it starts
happening now. **Nothing is owed retroactively** — the 13 destroyed codes cannot
be recovered, so no back-credit is possible even if you wanted one. Listed with
the owner decisions. Reverting is one line: drop the field from the insert.

**The test fake rejects unknown columns the way PostgREST does, and counts
ATTEMPTS rather than successes.** Both mattered. With a shape-only fake, the old
code failed 2 of 5; counting only successful inserts let a strip-and-retry read
as a single insert. With both, it fails 4 of 5.

`npm run check` green: 0 lint errors, 241 files, 2447 tests, 0 dependency
violations, exit 0.

### The strip-and-retry sweep, closed out: two more dead fallbacks deleted — DONE

Finishing the sweep that migration 109 came out of. Two more, both over columns
that exist, so neither could fire for the reason it claimed.

**`admin/applications/[id]`** retried its status update without `reviewed_at` and
`reviewed_by` "for a legacy schema". Both columns exist (migration 052, confirmed
against the live schema). Had the branch ever fired it would have recorded an
admin's accept or reject **without who did it or when**, and returned 200. That
is the migration-109 class exactly: a fallback that reports success while
discarding the field the write was partly for.

The error check itself is kept and is the part that mattered: the original update
had none, so a failure left the row at `pending` and the admin list kept showing
the applicant as awaiting review after Accept was clicked.

**Its test is inverted rather than deleted.** It used to assert "retries with a
status-only payload"; it now asserts one attempt, carrying both audit columns,
and a 500 when that attempt fails.

**`venues/[slug]`** retried with a narrower column list "if the migration isn't
applied". All five supposedly-optional columns exist. But this one was not merely
dead, it ran on the common path: the primary read is `.maybeSingle()`, so `data`
is null both when a column is missing **and when the slug simply does not
exist**. Every request for an unknown venue ran a second full query, on a public
unauthenticated route. And it discarded the error, so a real PostgREST rejection
was indistinguishable from "no such venue", which is the D17.3 phantom-column
class in its original form.

One query now, and the error is checked. Six new tests on a route that had none:
one query on the happy path, the display columns actually requested, one query
when the row is absent, a 500 rather than a silent miss on a database error, and
the two PII assertions (`user_id` and exact postcode withheld from an anonymous
caller). Restoring the fallback fails two of them.

**Class tally: nine strip-and-retry sites found across four files.** Seven in
`placements/route.ts` (row 22), one in `messages/route.ts` (09 item 2.2, losing a
flagged message's type and attachments), one in `api/apply` (migration 109,
destroying every referral code ever submitted), plus these two dead ones. The
only one deliberately kept is `upsertWork`'s, and migration 104 records why.

`npm run check` green: 0 lint errors, 242 files, 2453 tests, exit 0.

### The strip-and-retry guard — DONE

A ratchet so the class cannot come back, since it produced nine sites across four
files and two of them were live data loss.

`tests/integration/one-write-attempt.test.ts` looks for the one thing all nine
shared: **a property deleted from an object that is then passed to a write.**

**The first version was wrong twice, and both corrections are in the file.**

It began as "a `delete` and a write in the same file", which flagged
`artwork-requests/route.ts` — where four keys are deleted from a row about to be
**returned**, to redact a public response. So the identifier is now tracked
through to the write, and a redaction is not a ladder.

It also began with a second assertion, "no write inside an `if (error)` block".
That was written, run, and thrown away: a window after any error branch catches
thirteen unrelated files, because "handle the error and carry on writing" is
ordinary code. A guard needing a thirteen-entry allowlist is a list, not a guard.
The rejected heuristic is recorded in the file so nobody adds it back.

**Two ladders are allowlisted, each with a reason the test checks is real** (over
60 characters, and the file must still contain a ladder, so a stale exemption
fails rather than lingering):

- `upsertWork` applies each extended column individually and **reports every
  dropped column back to the caller** through `droppedColumns` and
  `fallbackErrors`, which the route logs. That is the opposite of the pattern.
- The Stripe order insert, which D6 kept deliberately and hardened:
  `REQUIRED_MONEY_COLS` can never be stripped and a retry that surfaces one
  refuses to book. An order arriving from Stripe is money already taken, so
  refusing to write it at all is worse than writing it without an optional field.

Verified by adding a route with a textbook ladder: it is named as an offender.

**One landmine noted, not defused.** `upsertWork`'s `extendedColumns` still lists
`in_store_price`, which exists in no migration and not in the live table. The
route stopped passing it (A8) so nothing triggers it today, but any future caller
that does gets a guaranteed-failing per-column write. Removing it from that list
would make the phantom fail the CORE write instead, which is louder but breaks
the whole save, and the real fix (a migration, or removing the UI that collects
per-size in-store prices) is already escalated.

`npm run check` green: 0 lint errors, 243 files, 2456 tests, exit 0.

## Owner decisions added since the 2026-08-28 close, numbered on from 8

**9. £953.20 is booked as owed to artists and `stripe_transfers` is empty.**
Twelve revenue-bearing orders, £1,174.87 gross, and **not one ledger row**. All
twelve predate the C2/C3 leg work, so this is history rather than a live
regression, but the money is still owed and nothing records it. Two of the twelve
name demo personas (`fin-coles`, `maya-chen`), so some may be test traffic; you
can tell and I cannot. `npm run audit:reconcile` reproduces this on demand.

**9a. `WS-P06DDkUs` (2026-05-17, £64.49) has no artist at all.** `artist_slug`
NULL, `artist_user_id` NULL, and `artist_revenue`, `venue_revenue` and
`platform_fee` all zero. £64.49 collected, nobody attributed, nothing allocated.
The D4 signature, and the only order whose split does not sum.

**9b. Five more have a slug and no user id** (`WS-agEXJ0gn`, `WS-iJ7I3ENn`,
`WS-kcsWHfhq`, `WS-duumFTnR`, `WS-rQDHDmz5`, £535.42 between them). The slug
resolved, the user id did not, so no transfer was ever scheduled. D4's fix stops
this recurring; it does not repair these.

**10. The referral programme is broken in TWO places. Migration 109 fixed the
first. It still does not credit anybody, and that is deliberate.**

**Correcting myself**: I first wrote this entry saying the programme "goes live on
the next referred signup". That is wrong, and checking the second half is what
showed it.

Half one, now fixed: `api/apply` could not record `referred_by_code` because the
column did not exist, and a strip-and-retry destroyed it silently on every
application. Migration 109 adds it.

Half two, **still open and owner-gated**: the webhook's referrer lookup is
`.select("id, free_until")`, and **`artist_profiles.free_until` exists in no
migration and not in the live table**. PostgREST rejects the whole query, so
`referrer` is null and the credit is skipped. This is the parked floor of the
phantom-column ratchet, grandfathered in `phantom-columns.test.ts` with the
reason: *"the referral path writes a free window and where it should write is an
open owner question (trial_end is Stripe-managed)"*. That is D17.2.

So the honest position: **codes are recorded from now on, and nothing is credited
to anybody until you answer D17.2** — where a free window should live, given
`trial_end` is Stripe's. Nothing is owed retroactively either way: the 13
destroyed codes are unrecoverable.

**This also parks `04` item 5.3 / D14** (making the referral credit atomic).
Hardening a read-modify-write on a path that cannot execute is work with no
subject; it belongs immediately after D17.2, not before it.

**11. Flagged messages reach no admin queue.** A message that trips the
moderation filter now records `moderation_flagged` in its `metadata` (it
previously lost its type and attachments instead), but `moderation_queue` (058)
has a typed payload union covering blogs, feature requests and feedback, with no
`message` member. Adding one means extending the union, the parser, the admin
renderer and the `entity_type` constraint. That is a feature.

**12. Every public table grants `TRUNCATE`, `REFERENCES` and `TRIGGER` to `anon`
and `authenticated`** — all 53 of them, alongside SELECT/INSERT/UPDATE/DELETE.
This is Supabase's stock default-privilege set rather than something Wallplace
did, and PostgREST exposes no TRUNCATE verb, so it is not reachable through the
API. It is still wider than any table needs. `contact_submissions` is the sharp
case: it is protected from public reads only by the ABSENCE of a SELECT policy,
so one permissive policy added for any reason makes every name, address and
message body publicly readable. Grants are on the escalation list, so this is
recorded and untouched.

**13. T9 "collect from venue" is a feature build on the checkout path, and I have
not started it.** `04` Phase 8 is six items: two migrations, a new
`collect_venue` branch in `checkoutSchema`, server-side re-validation in
`/api/checkout`, a third tile on the checkout page and a new email. It is the last
substantial block in `04`. Building a new checkout mode unattended is exactly what
the money boundary exists to prevent, so it is surfaced rather than started.

**14. `upsertWork`'s `extendedColumns` still lists `in_store_price`**, which
exists in no migration and not in the live table. The route stopped passing it
(A8), so nothing triggers it today, but any future caller that does gets a
guaranteed-failing per-column write. The real fix is either a migration or
removing the UI that collects per-size in-store prices; both were already
escalated and this is the third place the same undecided question shows up.

### 04 item 0.2 — `checkout.session.completed` does not mean paid — DONE

The other half of D1, and the only Phase 0 item still open apart from 0.5.

`checkout.session.completed` fires when the customer finishes the flow, not when
the money arrives. A delayed payment method — BACS Direct Debit, SEPA, bank
transfer, some cards under SCA — fires it with `payment_status: "unpaid"` and
settles days later, **or never**. There was no `payment_status` check anywhere in
the webhook: `grep -c payment_status` returned 0.

Behind that event, four branches book something: an order row, a stock decrement,
an artist transfer, a curation request marked paid. So the gate is **one check at
the top of `handleWebhookEvent`** rather than four inside them, which is also the
only shape a fifth branch cannot forget.

**200, not an error.** Stripe must not retry: nothing is wrong, the money simply
has not landed. `checkout.session.async_payment_succeeded` is the event that says
it has, and this repo already handles it, so refusing the unsettled `completed`
loses nothing.

**Two deviations from the plan's literal text, both deliberate.**

It says gate on `payment_status === "paid"`. That would **refuse a legitimate £0
order**: a 100% discount or a trial that bills nothing today arrives as
`no_payment_required`, which means nothing is owed, which is settled. Both are
accepted.

And an **unrecognised** value is refused, including one Stripe adds later, while
an **absent** one is accepted. The two are not the same case. Absence is
compatibility: older API versions omit the field, and every hand-built test
fixture omits it. An unknown value is semantics, and the failures there are
asymmetric — accepting one books orders and schedules payouts against money that
may never arrive, silently, which is precisely what this gate exists to stop,
while refusing one halts booking, which is loud, noticed in minutes and fixed by
adding the value to a list.

**One of my own tests was weak and the mutation run caught it, again.** "Lets a
zero-total session through" asserted `expect(fromMock).toHaveBeenCalled()`, which
is true either way, because the event-dedup claim runs before the gate. It now
asserts that a real table is reached, and fails on the `=== "paid"` mutation.

11 tests. Removing the gate fails the unpaid case; narrowing to `=== "paid"`
fails two.

`npm run check` green: 0 lint errors, 244 files, 2467 tests, exit 0.

### 04 item 0.5 — D13's invariant pinned, and why the consolidation was NOT done

0.5 asks for the duplicated `event.type` branches to be collapsed into one each.
There are three top-level `customer.subscription.deleted` blocks (`:1329`,
`:1480`, `:1509`), one per subsystem: SaaS, paid loan, curation.

**Every one must run for a single event.** An artist changing plan produces a
"stale" SaaS deletion, and the paid-loan and curation reconcilers still need to
see it. D13 is what happens when they do not: the SaaS block used to `return` on
the stale case, which exited the **whole handler**, so a plan change could leave
a paid-loan billing row stuck `active` after Stripe had already cancelled it.

That specific `return` is already a scoped `if`. The remaining problem is
structural: the shape invites the bug back, because a `return` added to any of
the three silently skips its siblings.

**I have not restructured it, and that is a judgement I want visible.**
Collapsing three branches inside the money webhook is a large mechanical edit to
code whose current behaviour is correct, made unattended. The invariant is what
matters, not the shape, so it is pinned **behaviourally** instead: four tests
drive one `customer.subscription.deleted` and assert both other reconcilers run,
including on the stale path that D13 broke and on the no-profile path.

Reintroducing the early return fails the stale test specifically. That is the
guard 0.5 was really asking for; the consolidation remains available and is now
safe to attempt, because a mistake in it fails a test instead of shipping.

`npm run check` green: 0 lint errors, 244 files, 2471 tests, exit 0.

### The phantom-column class, on the WRITE side — a new guard, and four live bugs

`phantom-columns.test.ts` scans every `.select()` against a snapshot of the live
schema, because a select naming a column that does not exist is rejected whole by
PostgREST and the `?? null` fallback yields a plausible-but-wrong value. **Writes
fail exactly the same way and were never scanned.** Migration 109 and 09 item 2.2
both came out of that gap, and both were found by hand.

`tests/integration/phantom-write-columns.test.ts` closes it: every
`.from("t").insert({...}) / .update({...})` with an inline object literal, keys
compared against the same snapshot. It found four more.

**The first run produced eleven false positives, and the reason is in the file.**
`.from(...)[\s\S]{0,200}?.insert(` happily spans an intervening
`.from("other_table")`, so a `placements` insert was attributed to a
`venue_profiles` select two lines above it. The pattern now requires the NEAREST
`.from`. Top-level keys only, so `metadata: { foo }` contributes `metadata`, and
a payload passed as an identifier is skipped rather than guessed at.

---

**1. `DELETE /api/account` — the right to erasure — was not erasing.**

Nine unchecked writes, then `{ success: true }`. **Four could not have worked:**

| written | reality |
|---|---|
| `artist_profiles.image` | the column is `profile_image`. PostgREST rejects the WHOLE update, so the artist scrub did **nothing**: name, both bios, location, Instagram and website all survived |
| `from("waitlist")` | no such table. It is `waitlist_signups` |
| `from("applications")` | no such table. It is `artist_applications` |
| `artist_applications.phone` | no such column, so even the right table would have failed |

All four verified against production. The shape of the failure is the worst part:
a person asks to be deleted, gets a success response, **their auth user is then
deleted so they cannot log in and check**, and their name, biography, location,
social handles, waitlist entry and full application stay in the database.

Fixed: correct names, `artist_statement` and `banner_image` and `postcode` added
to the scrub (personal data that was never covered), **every step checked**, and
the auth user is **no longer deleted while any scrub failed** — that ordering is
precisely what made this invisible. Failures collect rather than short-circuit,
because a scrub that stops at the first error leaves more behind than one that
carries on and reports. The response now says the account was *not* closed and to
contact support, rather than claiming success.

10 tests on a route that had none, with a fake that rejects an unknown table and
an unknown column the way PostgREST does. The original route fails 7 of them.

**2. `placements.requester_user_id`, written by three routes.** N3 corrected the
SELECT that read this phantom and left the three INSERTS that write it, so each
of those statements is rejected whole and the placement is simply never created:
`artwork-requests/[id]/fulfill`, `artwork-requests/[id]/responses/[responseId]`,
and the `placement_request` path in `messages/route.ts` (whose error is
`console.error`'d and swallowed, so the message appears in the thread and no
placement exists behind it). The column is `proposed_by_user_id`, which prod
carries on **2 of 86** rows: that is what "written by almost nothing" looks like.

**3. `artist_profiles.free_until`** is grandfathered, pointing at the same D17.2
question the SELECT side is parked on, with a note to remove both entries
together.

`npm run check` green: 0 lint errors, 246 files, 2484 tests, 0 dependency
violations, exit 0.

### The write guard's second pass: the 14-day statutory refund window has never opened — DONE

Extended the write-side phantom guard to resolve an IDENTIFIER payload
(`insert(fullRow)`) to its `const fullRow = { ... }` declaration. That is not
polish: `api/apply` hid `referred_by_code` behind exactly that indirection, and
it destroyed a referral code on every application ever submitted. The extension
found one more immediately.

**`orders.delivered_at` exists in no migration and not in the live table**, and
three pieces of code assume it does:

1. The Stripe webhook's order insert sets it for collection orders, under the
   comment *"pin `delivered_at` so refund-window logic still works"*. It was
   also in `strippableCols`, and it was **the only entry on that list that did
   not exist**, so the D6 ladder dropped it from every insert. Silently, and by
   design, because refusing an order Stripe has already charged for is worse.
2. `isRefundEligible` implements the window: `status === "delivered" &&
   delivered_at` within 14 days. With the column absent the second operand is
   always undefined, so **it returns false for every delivered order, always**.
3. `customer-portal` gates the refund-request affordance on that function.

**`/returns` cites the Consumer Contracts Regulations 2013 and promises 14 days
from receipt to cancel for any reason.** The page also gives an email address, so
the statutory right is not wholly unavailable, but the product's own
implementation of it has never once worked: the moment an order is marked
delivered, the in-product refund path closes permanently.

**Migration 110 (written, applied to prod, verified live)**, plus the two changes
that make the column mean something: `delivered_at` is removed from
`strippableCols` (it exists now; leaving it would put it straight back), and the
`delivered` transition in `orders/route.ts` stamps it. **Only on the transition
in, and only when it is not already set**, so a re-PATCH cannot silently restart
someone's fourteen days. No backfill: existing delivered orders keep NULL, and
inventing a date would hand someone a window measured from a moment we made up.

**OWNER, and it is a widening.** Delivered orders become refund-eligible in the
portal for 14 days, where today none ever is. That restores documented, legally
required behaviour rather than inventing a policy, and the refund handlers
themselves are untouched and still owner-gated — this changes who can *ask*, not
what happens when they do.

`npm run check` green: 0 lint errors, 246 files, 2487 tests, exit 0.

### Phantom TABLES: three shipped features writing to tables that never existed — DONE

Extended the sweep from phantom columns to phantom **tables**. A table that does
not exist fails exactly like a column that does not exist, and it hid in the same
place: `DELETE /api/account` wrote to `from("waitlist")` and
`from("applications")`, neither of which is a table.

Three more, all verified absent from production, all written by shipped features,
**all three swallowing the error into a `console.warn` behind an `{ ok: true }`**:

| table | what it means |
|---|---|
| `conversation_reports` | `POST /api/messages/report`. Every report anyone has made, about harassment or anything else, existed only as a line in a Vercel log |
| `user_blocks` | `POST /api/messages/block`. A person who blocked someone was told it worked. Nothing was recorded, so the blocked account could still message them |
| `placement_record_versions` | the consignment-record audit trail, whose own comment says the snapshot "is what gives each side confidence the other isn't editing behind their back". Never one row |

Two of the three are **safety features**, and each route's own header describes
the fallback as a courtesy for a lagging migration. The migration never came, so
the fallback was the behaviour, for as long as the features have existed.

**Migration 111 (written, applied to prod, verified live).** Column shapes taken
from the insert call sites verbatim so the existing code works unchanged; the
`user_blocks` primary key is exactly the `onConflict` pair the route upserts on,
or every re-block would 23505. Service-role only, the 101 pattern: RLS on, 0
policies, 0 leaky grants, `service_role` only. Verified live for all three.

**The swallows are gone.** A report or a block that does not persist is not a
report or a block, and answering `ok` for a failed write is what kept this
invisible. The record-version snapshot stays non-fatal, because blocking
someone's edit over a failed audit row is the wrong trade, but it logs as an
error rather than a "skipped".

**A phantom-table guard now covers the class**, with an allowlist that is empty
on purpose. Verified by adding a route that reads `from("waitlist")`.

11 tests across the two safety routes, which had none. Restoring the swallow
fails the two that matter.

**Two follow-ups, surfaced not done.** The report modal shows "submitted"
whatever the API answers, so a 500 still does not reach the person; that is a
frontend change. And **nothing reads `user_blocks` yet** — the send path and the
conversation-list aggregator have to honour it before a block does anything
beyond being recorded. Both were impossible before and are possible now.

`npm run check` green: 0 lint errors, 248 files, 2500 tests, exit 0.

### Phantom columns in FILTERS: four more, and the class is now fully covered — DONE

The third and last variant. `.select()` was guarded by `phantom-columns.test.ts`
and writes by the guard added above; `.eq()`, `.in()`, `.gte()` and `.order()`
were not. A rejected filter is the most convincing failure of the three, because
**a rejected count reads as zero rather than as an error**.

| where | wrong | right | what it did |
|---|---|---|---|
| `cron/onboarding-nudges` (×2) | `artist_works.artist_user_id` | `artist_id` (the **profile** id, not the auth user id) | the day-4 "upload your first artwork" nudge went to **every** artist, including those who had already uploaded, and day 14 read every artist as having no work |
| `cron/weekly-venue-digest` | `analytics_events.venue_slug` | `venue_user_id` | the digest reported **zero views for every venue**, and its "fewer than 3 events, don't send" gate counted those zeros, so venues whose week was mostly views were skipped entirely |
| `lib/outreach-cap.ts` | `placements.requester_user_id` | `proposed_by_user_id` | the anti-spam cap counted **no placement requests at all**. An artist on Core, limited to 2 first contacts a day, could send unlimited placement requests; only the messages and artwork-response legs were ever enforced |

The `artist_works` one is not a rename: `artist_id` holds the `artist_profiles`
primary key, so the fix also had to add `id` to the profile select. A blind
find-and-replace would have swapped one phantom for a wrong join.

**All three variants now have a guard**, in one file: phantom tables, phantom
write columns and phantom filter columns, each with an allowlist that is empty on
purpose. Each verified by reintroducing the exact bug it was written for.

**Running tally for this class: 15 live defects.** Two silent data losses (a
referral code on every application, a flagged message's type and attachments), an
erasure endpoint that erased nothing, three shipped features writing to tables
that did not exist, a statutory refund window that could never open, three
placement inserts that always failed, an anti-spam cap missing a third of its
surface, a venue digest reporting zeros, and an onboarding nudge sent to people
who did not need it.

`npm run check` green: 0 lint errors, 248 files, 2501 tests, exit 0.

## Owner decisions 15 to 19, from the phantom-schema sweep

**15. `DELETE /api/account` never erased anything, and it is fixed.** No action
needed on the code. What you may want to act on: **anyone who has already
deleted their account still has their data in the database** — name, both bios,
location, Instagram, website, waitlist entry and full application. Their auth
user is gone, so they cannot see it and cannot ask again through the product. A
one-off scrub of orphaned `artist_profiles` rows (a profile whose `user_id` no
longer resolves to an auth user) would finish the job, and it is a DELETE of user
rows, so it is yours.

**16. Blocking now records, and still does nothing.** `user_blocks` exists as of
migration 111, so a block is stored. **Nothing reads it.** The send path and the
conversation-list aggregator have to honour it before a block has any effect, and
until they do a person is still told "blocked" and can still be messaged. That
was impossible to build before and is possible now.

**17. The report modal says "submitted" whatever the API answers.** The route now
returns 500 when the write fails instead of claiming success, but the frontend
swallows it, so the person is still told it worked. A frontend change, listed
here so it is not lost.

**18. The anti-spam outreach cap was missing a third of its surface** and now
is not. Placement requests were free: a Core artist limited to 2 first contacts a
day could send unlimited ones. **That means the live usage figures for the cap are
not what they appear** — any conclusion drawn about whether the limits are set
right was drawn against a cap that only enforced two of three surfaces.

**19. The weekly venue digest has been reporting zero views to every venue**, and
skipping venues whose week was mostly views. Fixed, but if anyone has been
reading those digests as a signal about venue engagement, they have been reading
zeros.

### The nightly advisor job would have failed, and one of its docs did not exist — DONE

Ran the Supabase advisors against prod after tonight's schema work, to check for
a regression. There was one, and it was older than tonight.

`check-regressions.ts` fails on any advisor lint that is not in the baseline or
in `known-acceptable.json`. **Six tables were live with a
`rls_enabled_no_policy` lint and in neither list:**

- `artist_applications` and `stripe_webhook_events`, live for months. The
  nightly advisor job has been failing on a deliberate design, not on a
  regression.
- `admin_users`, from migration 101 earlier in this session. My gap.
- `conversation_reports`, `user_blocks` and `placement_record_versions`, from
  migration 111 tonight. Also mine, and they would have joined the other three.

All six are the intended service-role-only pattern: RLS on, no policy, grants
revoked from anon and authenticated, service_role only. The lint is expected;
suppressing it is correct; not recording that is not.

**`docs/security/service-role-only-tables.md` did not exist.**
`check-regressions.ts` has referenced it by name since it was written, so nothing
ever connected a suppression to a reason. It exists now, with all 24 tables and
**which route writes each**, plus the five-step recipe for adding one, naming
migration 111 as the worked example.

**A test in `npm run check` keeps the two in step.** Every suppressed table must
appear in the doc, and every documented row must name a writer rather than just a
table. That placement is the point: the advisor job is nightly (ledger row 0b),
so forgetting the allowlist entry fails later and somewhere else, which is
exactly how `artist_applications` and `stripe_webhook_events` came to be live and
unlisted for months. Verified by suppressing an undocumented table.

**Advisor state after tonight, for the record.** Security: no ERRORs. 24
INFO-level `rls_enabled_no_policy`, all intended and now all documented, plus one
**WARN worth acting on: leaked-password protection is disabled.** Supabase Auth
can check new passwords against HaveIBeenPwned; it is a dashboard toggle and it
is off. Owner decision 20. Performance: no ERRORs, 79 unused-index INFOs (ADR
0006 retains them pre-launch), 18 multiple-permissive-policy WARNs and 3
unindexed FKs, all pre-existing and none introduced tonight.

`npm run check` green: 0 lint errors, 250 files, 2511 tests, exit 0.

**20. Leaked-password protection is off.** Supabase Auth can check every new or
changed password against HaveIBeenPwned and refuse a known-breached one. It is a
dashboard toggle, it is currently disabled, and the advisor flags it at WARN. The
only reason not to turn it on is if you object to the latency of the check, which
is a single k-anonymity lookup.

### Env-var sweep: three secret-dependent guards checked for fail-open — DONE

Compared every `process.env.X` read against `src/env.ts`'s schema. 25 vars are
read and not declared there; most are optional by design (demo config, the flag
env keys, `EMAIL_DRY_RUN`). Three gate a security control, so each was checked
for what happens when the secret is missing:

- **`OAUTH_STATE_SECRET`** — throws. Fail-closed. Correct.
- **`SUPABASE_WEBHOOK_SECRET`** — `verifySignature` returns false, so the route
  refuses. Fail-closed, and the `PUBLIC_ROUTES` entry claiming HMAC auth is
  therefore true.
- **`TURNSTILE_SECRET_KEY`** — **fails OPEN**, and in production it did so
  silently.

That last one is E1's shape: a missing `RESEND_API_KEY` dropped every email for a
week with no signal, and 09 §A.6 answered it with three layers rather than one.
Here, if the key is not set in the production environment, the CAPTCHA is simply
off, every challenge is waved through, and the response is byte-identical to a
real verification.

**I did not make it a hard fail, and that is a judgement worth seeing.** Refusing
every signup because a CAPTCHA key is missing trades a spam problem for a total
outage of the acquisition funnel, and nothing in this repository can see whether
the key is actually set in production. So the bypass stays and is now loud: an
ERROR log in production naming the consequence, and `bypass: true` in the
response body so a monitor can see it from outside without reading logs, which is
E1's other lesson. **Owner decision 21 is whether to make it a hard fail**, and it
needs one fact I do not have: is `TURNSTILE_SECRET_KEY` set in Vercel production?

8 tests on a route that had none, including that the `dev-bypass` token is
rejected once a real secret is configured — otherwise the CAPTCHA would be
opt-out by sending a magic string.

`npm run check` green: 0 lint errors, 251 files, 2519 tests, exit 0.

**21. Should the CAPTCHA fail closed in production?** `TURNSTILE_SECRET_KEY`
unset means the route waves every challenge through. It now logs an ERROR and
returns `bypass: true` so it is visible, but it still lets the request past. The
one fact needed to decide: **is that key set in Vercel production?** If yes, make
it a hard fail and the behaviour never changes. If no, bot protection on signup
is currently off and that is the more urgent half.

---

## Session close, 2026-08-28 (overnight). What changed, and what is left.

### The plan itself is done, apart from what needs you or a tool this box lacks

| doc | state |
|---|---|
| `01` authz/IDOR | complete |
| `02` RLS/DB/storage | complete bar X2/K11 (needs `pg_dump`) |
| `03` auth/admin | complete bar the owner-gated predicate cutover |
| `04` payments | 33 of 61 ticked, verified against the code. Open: Phase 8 (a new checkout mode, owner), refunds D16/D17/D18 (owner), the `tests/transactions` harness, and 0.5's consolidation, whose invariant is now pinned by test instead |
| `05` frontend saves | complete |
| `06` validation | **complete**. Phase C was done and entirely unticked |
| `07` unknot | K1–K8 complete, K10a and K10d complete. K10b/K10c/K11 blocked: no Supabase CLI, no Docker, no `pg_dump` on this machine |
| `08` cull | still blocked on its rewrite, per D6. Surfaced, not cut |
| `09` emails | **31 of 35**. The four open are DNS, a Supabase dashboard paste, DMARC staging and one that is time-based |

### What the night actually produced

Seven migrations (105–111), all applied to production and verified live, and
**19 defects that were live in production**, most found by sweeping for a class
rather than by working the list:

**Silent data loss (4).** Every referral code ever submitted, destroyed on insert.
A flagged message losing its type, terms and attachments. `DELETE /api/account`
erasing nothing while reporting success. Three placement inserts rejected whole.

**Features that did nothing (5).** Reporting a conversation. Blocking a user. The
consignment-record audit trail. The 14-day statutory refund window. The referral
programme end to end.

**Wrong answers, silently (5).** The anti-spam cap missing a third of its surface.
The venue digest reporting zero views to everyone. An onboarding nudge sent to
people who did not need it. A guard watching for functions K1 deleted. The
webhook booking orders against unsettled payments.

**Reachable-but-unbuilt (2).** No way to open a dispute at all. The contact form
never answering the sender.

**Silent config failures (3).** The CAPTCHA bypass in production. Six tables
failing the nightly advisor job. A `002_run_me.sql` residue the repo drops and
never recreates.

### Four new guards, each verified by reintroducing the bug it was written for

`phantom-write-columns.test.ts` covers three variants at once — phantom tables,
phantom write columns, phantom filter columns — and found **15 of the 19**.
`one-write-attempt.test.ts` ratchets the strip-and-retry ladder that hid four of
them. `cron-schedule.test.ts` closes the "a route nothing schedules" shape of
07 K5. `service-role-tables-documented.test.ts` keeps the advisor allowlist and
its documentation in step, in `check` rather than in the nightly job where the
mistake is not made.

### What I would look at first

**Owner decision 9**: £953.20 booked as owed to artists with an empty
`stripe_transfers` table, and one order that took £64.49 with nobody attributed.
It is the only finding that is money already taken.

**Owner decision 21**: is `TURNSTILE_SECRET_KEY` set in Vercel production? If it
is not, signup has no bot protection right now.

**Owner decision 15**: anyone who has already deleted their account still has
their data. Their auth user is gone, so they cannot ask again.
