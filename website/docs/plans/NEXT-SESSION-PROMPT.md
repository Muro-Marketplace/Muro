Finish the Wallplace remediation plan. Work continuously until the list below is
done or genuinely blocked. No loop, no scheduled wake-ups, no subagents, no
workflows. Just read, code, test, commit, repeat.

## Where you are

Worktree: /Users/finlaycoles/Downloads/Wallplace/Wallplace/.claude/worktrees/tender-ellis-41b11d
Branch: claude/wallplace-remediation-loop-b4984a
Run every npm command from the `website/` subdirectory. The Bash cwd resets to the
repo root between some calls, so `cd` explicitly rather than assuming.

Read first, in this order:
1. `website/docs/plans/2026-07-11-EXECUTION-DECISIONS.md` (BINDING, overrides all
   other docs; hoisted operating rules at the top, decisions D0-D70)
2. `website/docs/plans/PROGRESS.md` (the ledger table at the top is the source of
   truth for what remains; the tail entries record what each commit did and why)
3. The specific `website/docs/plans/implementation/0N-*.md` doc owning the task.

## Authority

- Full authority to edit code and write tests. Commit freely on the working branch.
- NEVER push, open a PR, or merge without explicit approval.
- DESTRUCTIVE DB OPS FORBIDDEN without per-case approval: no DROP TABLE, no DELETE
  of user/order/message/payment rows, no truncation. Widening a CHECK via drop+add
  is additive and allowed.
- Do NOT remove the wall visualizer (D0).

## Two standing blockers, do not work around them

**1. Migrations are one atomic step.** The Supabase MCP is AUTHORISED as of
2026-08-15 (verified against project `uwkuhygwvasdzwsusiym`), so migration work is
unblocked. D57 binds: pick the next number ABOVE the highest on disk (currently 100,
so 101 next), NEVER backfill a gap, write the `.sql` AND apply it to prod via the MCP
AND verify the result live, all in the same piece of work. Never leave an unapplied
migration on disk: that is the ledger-divergence problem already open as an owner
question. Then run `npm run schema:snapshot` (needs `SUPABASE_ACCESS_TOKEN`; if that
is still unset the script exits 2 and says so, which is D62, not a failure you caused).

Re-verify the MCP at the start of the session with a cheap read; if it has lapsed
again, skip the migration items and say so rather than writing files you cannot apply.
`website/tests/integration/schema-columns.json` is a committed snapshot of all 53
tables and 750 columns, good enough to prove a column exists without a round trip.

**2. Seven money handlers are owner-gated.** Do not migrate, refactor or "improve"
these without the owner saying so. Each is marked in-code with an OWNER-GATED comment:
- `artist-portal/orders/page.tsx`: `processRefund` (x2 call sites) and
  `issueProactiveRefund` — they execute Stripe refunds
- `components/offers/OffersList.tsx`: `pay` — POSTs to the offer checkout
- `customer-portal/page.tsx`: `confirmDelivery` — releases the artist's escrow
- `customer-portal/page.tsx`: `submitRefundRequest` — the refund flow
- `placements/[id]/payment/PaymentClient.tsx`: `startCheckout` — paid-loan checkout

They are grandfathered in the `no-authfetch-mutation` ratchet at `LITERAL_FLOOR = 7`.
Do not lower that floor and do not flip the rule from `warn` to `error`.

More generally, the money boundary: a plain status/settings/CRUD transport change is
fine; anything that triggers a refund, fund movement, payout, checkout or escrow
release is surfaced to the owner, not silently changed. Stripe Connect
onboarding/dashboard LINK handlers are account setup, not money movement, so those
are fine.

## Already done, do not redo

- The `authFetch` -> `mutate` migration is COMPLETE. Floor went 94 -> 7, and the
  remaining 7 are exactly the owner-gated set above.
- bug-12 part 2 (blog surface gated on BLOGS_V1), E43-f (dead enquiries buttons),
  row 22 (all strip-and-retry paths in placements/route.ts), row 23b.
- Doc 09 Phase 0 (items 0.1-0.4) and Phase 1 (items 1.1-1.4, 1.6).
- Doc 07 K7 ("order emails fire twice/three times") was fixed by 09 Phase 1, and K10
  is done. Both are still unticked in their doc. K1 is the same work as 09 Phase 2.

## The work, in priority order

The owner's goal is an MVP launch, so the launch-essential items come first. Do them
in this order unless something forces otherwise.

### Launch-blocking

1. **E34, venue takeover** (`03` §3). STILL LIVE, verified. `signup/venue/page.tsx:178`
   writes `venue_slug` into user_metadata with the public anon key, and
   `api/venue-profile/route.ts:150` trusts that string to grant ownership. An attacker
   claims any venue's slug and ends up owning the public `/venues/<slug>` page, all
   inbound artist messages, placements and requests, plus the registration PII
   (contact_name, email, phone) on an orphan row. **This needs no migration.** The same
   route's other branch already does it correctly by keying off the verified
   `user.email` from the JWT; make the slug path stop being an ownership signal.
2. **E36c, spoofable rate-limit key** (`03` §5). The limiter is bypassable, so signup
   and login brute-force protection is theatre.
3. **E36b**, open redirect in `api/demo/login`. **E36d**, user enumeration on apply /
   waitlist / register-venue.
4. **E35d / E30b**, self-settable `user_type` and the client-only admin gate (`03`
   §1, §2, §4). Signing up with `user_type: "admin"` renders the whole admin shell.
   Not a data breach today (all 14 admin API routes check server-side) but it is a
   social-engineering surface and it leaks the moment an admin page is added that
   fetches from a non-admin-gated endpoint. The proper fix is the `admin_users` table,
   now buildable since the MCP is authorised, plus server-side gating of the `/admin`
   route group so the shell stops trusting `user_metadata.user_type`. **D5 ordering is
   binding: create AND
   backfill `admin_users` BEFORE removing the `user_metadata` conjunct, or every admin
   is locked out of the live site. The conjunct cutover itself is owner-gated.**
5. **E30a**, application decisions are unaudited (`03` §2).
6. **07 K2**, two paid-loan billing implementations. The doc calls it the most
   dangerous knot: two code paths charging the same venue.
7. **07 K6**, three definitions of platform revenue. Money needs one definition.
8. **09 item 3.2**, no resend-verification path. `.resend(` has zero hits in `src/`,
   so a user who loses the verification email cannot recover, which silently kills
   signups. Also add the missing `emailRedirectTo` to the two `signUp()` calls that
   lack it (`AuthContext.tsx:123`, `apply/claim/page.tsx:61`).

### Not launch-blocking, do after

9. **09 Phase 2 / 07 K1** (same job): delete `src/lib/email.ts`, migrate the 17 call
   sites to `sendEmail` / a new `sendAdminAlert`, add the three eslint rules. The
   biggest single chunk. Both systems currently send; this is deduplication plus
   suppression, preferences and idempotency. Note the legacy path sends no
   unsubscribe header, which matters for anything marketing-shaped.
10. **09 item 1.5**, then Phase 3 (3.3-3.7), then Phase 4 (4.1-4.3).
11. **07 K3** (four sources of arrangement labels), **K4** (two placement-status
    renderers), **K5** (artist stats), **K8** (duplicate demo personas).
12. **08 surface cull**: needs a rewrite decision and §7 owner decisions first.
    Surface those, do not start cutting.

### Migration work (unblocked, the MCP is authorised)

Fold these in wherever they fit the ordering above; row 23a in particular is a
two-minute change once the column exists.

- **Row 21**, the artwork post-limit TOCTOU in `api/artist-works/route.ts`. The route
  counts the artist's works, checks the tier cap, then inserts later, so two
  concurrent POSTs both pass. A plain `INSERT ... WHERE (SELECT count(*)) < limit`
  does NOT fix it under READ COMMITTED: both statements read the same snapshot. It
  needs per-artist serialisation (`pg_advisory_xact_lock` on the artist id, or
  `SELECT ... FOR UPDATE` on the parent `artist_profiles` row) then count then insert,
  inside one function following the `085`/`087` pattern: `SECURITY DEFINER`,
  `SET search_path = public`, EXECUTE revoked from anon/authenticated/PUBLIC and
  granted to service_role only. Next migration number is 101.
- **Row 23a**, add a nullable `interested_in_local_artists` boolean to
  `venue_profiles` plus the `writable-fields.ts` allowlist entry. A shipped checkbox
  currently discards its value. Confirmed live 2026-08-15: `preferred_styles` exists,
  `interested_in_local_artists` and `preferred_sizes` do not. Flip the assertion in
  `api/venue-profile/route.test.ts` that currently pins the column as absent.
- **07 K11**, no committed base schema.

## How to work

- One coherent change per commit. Commit message names the finding or file and says
  what was wrong, not just what changed.
- `cd website && npm run check` must be green before every commit. That is
  `lint && typecheck && test && audit:allowlist`. Zero lint ERRORS (warnings are
  fine and currently number ~168).
- Write a regression test for every fix. Verify fail-before by reverting the fix (or
  breaking one assertion's premise), watching it fail, then restoring. If a surface
  is genuinely untestable (render-heavy page, no harness, complex required props),
  say so honestly in PROGRESS rather than claiming an untested fix.
- Security fix: also assert the exploit path is closed, not just that the happy path
  still works.
- Payment fix: drive a simulated Stripe event through the real handler and assert the
  DB rows and the split to the penny.
- Append to `docs/plans/PROGRESS.md` after each item: what changed, files, test,
  verification output, commit sha, and anything the plan got wrong. Update the ledger
  row's status too.
- If a doc contradicts the source or prod, trust the source, fix the doc, note it.
- Deleting beats fixing. New implementation means the old one is deleted in the same
  commit; no `_v2` beside `_v1`.

## Escalate, do not guess

Stop and ask about: adding or dropping a task, changing what a task builds, touching
prod grants or data, moving money, reversing an owner decision, anything touching the
two unpaid offers (off_1778 GBP 33, off_1779 GBP 27, artist fin-coles, D11 manual
reconciliation), any Stripe dashboard change, and the `08` cull beyond the D6
unconditional list.

## Gotchas that will cost you an hour each

- **vitest hooks**: use a BLOCK body, `beforeEach(() => { mock.mockReset(); })`. An
  expression-body arrow returns the mock, and vitest registers a returned function as
  a teardown callback.
- **`vi.clearAllMocks()` can break tests** whose code under test inspects the mocked
  return value. Prefer a targeted `someMock.mockClear()`.
- **The `no-authfetch-mutation` rule only flags string-literal verbs.** A mutating
  `authFetch` whose method is a ternary or a variable is invisible to it. When you
  touch a file, grep it and handle every mutating call, not just the flagged lines.
- **`ApiError` mapping**: `.message` prefers `body.message` then `body.error`;
  `.code` is `body.error` alone; `.payload` is the parsed body (that is where zod
  `fieldErrors` and things like `minimumPence` live). Match whichever precedence the
  old code had.
- **`react-hooks/set-state-in-effect` can be silently suppressed** by an unanalysable
  construct elsewhere in the same hook. Simplifying a hook can surface a pre-existing
  error in an untouched effect. The codebase's fix is the microtask defer used in
  `account/export/page.tsx`, not a blanket disable.
- **Email tests**: `recordOrderEvent` builds its own admin client and throws without
  a service-role key, and its callers swallow that in a try/catch. Mock
  `@/lib/supabase-admin` or the test passes for the wrong reason (one email each,
  because the good path was dead). `logEvent` uses `upsert`, not `insert`.
- **Render harness**: jsdom; mock next/navigation, next/link, next/image,
  `@/lib/supabase`, the contexts, and heavy children; for `@/lib/api-client` use
  `importActual` and override only what you need so `ApiError` stays real. Stub
  `window.matchMedia` and global `fetch` where the component reads them.
- **Paths containing parentheses** (`src/app/(pages)/...`) must be quoted in shell
  commands or the glob will fail.

Start by re-confirming the Supabase MCP with a cheap read and running `npm run check`
for the baseline, then begin with E34. E34 needs no migration, so it lands fast.
