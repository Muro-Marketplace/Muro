# 0008. The admin gate reads server-owned facts only

**Status:** Partially accepted (the table and the surface gate are in; the predicate cutover is pending an owner decision) · **Supersedes:** [0001](0001-one-admin-gate.md) · **Date:** 2026-08-28

## Context

ADR 0001 defined the admin predicate as a three-source conjunction:

```
admin  ==  user_metadata.user_type === "admin"
           AND ( email in ADMIN_EMAILS  OR  user_id in admin_users )
```

Two things have since been established against the deployed database, and both
change the picture.

**1. `admin_users` did not exist.** `to_regclass('public.admin_users')` returned
NULL in production on 2026-08-28. The table had no `CREATE TABLE` anywhere in
the repo; its only SQL reference was a conditional RLS enable in
`034_rls_core_tables.sql`, guarded by an `IF EXISTS` that had always been false.
So the PostgREST select in `admin-auth.ts` errored, `data` came back null,
`Array.isArray(null)` was false, and the branch silently returned false for
everyone. The predicate that actually ran in production was:

```
admin  ==  user_metadata.user_type === "admin"  AND  email in ADMIN_EMAILS
```

The select also asked for a column, `id`, that the intended table does not have.

**2. ADR 0001's justification for the metadata conjunct is false.** 0001 says,
under Consequences / Positive:

> "The metadata field acts as a second factor: even if an attacker compromises
> an allowlisted email address, they cannot gain admin access without also
> controlling `user_metadata.user_type`, which can only be set via the Supabase
> service-role API."

`user_metadata` is not service-role-only. It is writable by the user it belongs
to. Four browser call sites in this repo pass it straight into an anon-key
`signUp`, and GoTrue additionally exposes self-service metadata updates through
`PUT /auth/v1/user`, which is what `supabase.auth.updateUser({ data })` calls.
An attacker who controls an allowlisted mailbox can trigger a password reset,
sign in, and set their own metadata. The conjunct adds no attacker cost.

What it does add is one-directional lockout risk for real admins. Anything that
overwrites an admin's `user_metadata` silently revokes their access, and the
codebase already does exactly that: `api/admin/applications/[id]/route.ts`
replaces metadata wholesale rather than merging it.

A conjunct that cannot stop an attacker but can strip a real admin is a strictly
negative trade.

**3. The admin surface was gated client-side, on the same field.**
`admin/layout.tsx` returned its children unwrapped, and the only check was a
render-time comparison inside `AdminPortalLayout`. Signing up with
`user_type: "admin"` rendered the entire admin shell. All twelve routes under
`api/admin` do check server-side, so no data leaked, but it was a convincing
surface for social engineering and would have become a real leak the first time
someone added an admin page fetching from a route nobody remembered to gate.

## Decision

**Target predicate.** Both operands server-owned, neither writable by the
subject of the check:

```
isAdmin(user)  ==  email in ADMIN_EMAILS   OR   user_id in admin_users
```

`user_metadata.user_type` is demoted to a UI and routing hint. It is read by the
client for navigation (`portalPathForRole`, sidebar highlighting) and is never
trusted for access.

**Ordering is the whole point.** Executed in this order, no admin loses access
at any step, and no step depends on the one after it:

| Step | What | Status |
|---|---|---|
| 0 | Inventory the deployed environment | **done** — see Context. `admin_users` absent, 40 users, 1 with metadata `user_type: 'admin'` |
| 1 | Create `admin_users` | **done** — migration `101_admin_users.sql`, applied and verified: RLS on, no policies, no anon/authenticated grants, 0 rows |
| 2 | Backfill it from `ADMIN_EMAILS` | **script shipped, not yet run** — `npm run admin:backfill` (`--dry-run` supported). Must run in an environment that has the real `ADMIN_EMAILS` |
| 3 | Ship the predicate change | **PENDING, owner-gated** |
| 4 | Stamp `user_type: 'admin'`, merging not replacing, for navigation only | pending, after step 3 |
| 5 | Stop user-supplied roles ever being `admin` again | **done** — see [0009 note below](#relationship-to-e35d) |

Steps 1 and 2 are additive: an empty table grants nobody anything, and it is the
second operand of an `OR` whose first operand is unchanged. Step 3 only ever
*widens* the legitimate-admin set once step 2 has run, so it cannot lock anyone
out. **Doing step 3 before step 2 would.**

**Surface gate (shipped).** `AdminGate` wraps the `/admin` route group and
renders nothing until `/api/admin/whoami` confirms admin status against the real
server predicate. Be precise about what that buys: the *decision* moves to the
server; the *enforcement* is still client-executed and someone with devtools can
still paint the UI. **The security boundary remains the per-route
`getAdminUser` check**, and `tests/integration/admin-route-guard.test.ts` holds
that invariant by failing if any route under `api/admin` lacks one.

A true server-side gate needs `@supabase/ssr`, the session in cookies, and a
`src/middleware.ts` matching `/admin/:path*`. There is no server-readable
session today, so that is recorded as stage 2 and is out of scope here.

## Audit coverage (E30a)

The same failure mode as the surface gate, one level up: nothing enforced the
pairing of "check admin" with "write an audit row", so coverage tracked whichever
phase of work last touched a file. `withAdmin` now owns both, and
`tests/integration/admin-route-guard.test.ts` fails if a mutating route under
`api/admin` references neither `withAdmin` nor `recordAdminAction`.

Converted: the applications gate (`application_accepted` / `application_rejected`),
the curation lifecycle (`curation_request_updated`), stats refresh
(`artist_stats_refreshed`). `api/refunds/process` keeps its own explicit calls
(`refund_approved_by_admin`, `refund_rejected_by_admin`) rather than being forced
through the wrapper, because artists legitimately call it too.

**Decision on read-only admin lists (03 §2.1 G5), taken rather than left
undocumented, which is what §2.1 asks for.** `api/admin/artists`, `venues`,
`applications` (list), `disputes` (list) and `stats` bulk-export user and venue
PII and do **not** write an audit row. That is inconsistent with
`api/admin/financials` `GET`, which does.

Not fixed, deliberately. The admin dashboard loads several of these per page view,
so auditing them would write a handful of rows every time anyone opens `/admin`.
`admin_audit_log` exists to answer "did anyone read X's messages"; burying that
signal under routine navigation makes the table worse at its job, not better.
Revisit if and when the log gets a query surface that can filter by action, at
which point the cost is only storage.

`context` on every row carries the decision, the target id and the target's email,
never the row: the column is JSONB and would otherwise accumulate PII. The
curation route records *that* admin notes changed, not what they say.

## Relationship to E35d

Self-settable `user_type` is fixed separately, at the write side: the value is
sanitised so `"admin"` can never enter `user_metadata` from a browser signup.
That is worth doing regardless of this ADR, because the field still drives
navigation, but it is not a substitute for it. A field the client writes should
not be in an authorisation predicate even when the current writes are filtered.

## Consequences

**Positive.** One definition, both operands server-owned. `admin_users` becomes a
real, usable grant path rather than dead code. Removing the metadata conjunct
removes the lockout foot-gun that `api/admin/applications/[id]` can currently
trigger. New admin pages are gated by default rather than by remembering to.

**Negative.** `AdminGate` adds a round trip before the admin UI paints, so every
admin page gains a loading state; it reuses the animated bar the three portal
layouts already share, so it is not a visual regression. Until step 3 ships, the
metadata conjunct remains, which means an admin whose metadata gets overwritten
still loses access.

**Correction to 0001.** The claim quoted above under Context is wrong and should
not be re-derived from it. 0001 is marked Superseded.
