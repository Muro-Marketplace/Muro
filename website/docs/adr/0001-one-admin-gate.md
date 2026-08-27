# ADR 0001 - One canonical admin gate

**Status:** Superseded by [0008](0008-admin-gate-server-facts-only.md)  
**Date:** 2026-06-14

> **Superseded 2026-08-28.** Two of this ADR's premises turned out to be false.
> The `admin_users` table it treats as an operand did not exist in the deployed
> database, so the live predicate was `metadata AND email in ADMIN_EMAILS`. And
> the "second factor" claim under Consequences / Positive below is wrong:
> `user_metadata` is NOT service-role-only, it is writable by the user it
> belongs to via anon-key `signUp` and GoTrue's `PUT /auth/v1/user`. Read
> [0008](0008-admin-gate-server-facts-only.md) before acting on anything here.

---

## Context

Admin access was checked in at least three places, each using a different definition:

1. `getAdminUser` (used by most admin API routes) checked email against the `ADMIN_EMAILS` env list, then separately checked `user_metadata.user_type === "admin"`. The two checks were sequential guards, not a unified predicate.

2. The refunds and message-processing routes called `getSupabaseAdmin().from("admin_users").select(...)` directly, making no reference to `ADMIN_EMAILS` or `user_metadata` at all.

3. Some routes re-implemented only the email check, omitting the metadata requirement entirely.

The result was that a user could be "admin" according to one gate and "not admin" according to another, depending on which route they hit. This is a security hazard: adding someone to `admin_users` without setting their metadata, or vice versa, produces unpredictable access.

---

## Decision

A single predicate, `userIsAdmin(user)`, now defines admin access everywhere:

```
user_metadata.user_type === "admin"
AND (email in ADMIN_EMAILS env list  OR  user_id in admin_users table)
```

The predicate is evaluated in this order to minimise latency and DB calls:

1. Metadata check first. If `user_type !== "admin"` the function returns false immediately, with no DB query.
2. Email allowlist. If the email is in `ADMIN_EMAILS`, the function returns true without querying `admin_users`.
3. Table lookup. Only reached for users not on the env allowlist.

Two public exports are built on this predicate:

- `isAdminRequest(request)` - returns a boolean, never throws. Use when you need to branch on admin status without committing to a specific HTTP error response.
- `getAdminUser(request)` - returns `{ user, error }` where `error` is a `NextResponse` (401/403/503) or null. This is the existing API; its error messages and status codes are unchanged so call sites need no updates.

`getAdminUser` retains one guard that is deliberately outside the shared predicate: it returns 503 when `ADMIN_EMAILS` is completely unset. An empty env list is a deployment misconfiguration, not an authorisation failure, and surfacing it as 503 makes the problem immediately visible. The shared `userIsAdmin` predicate does not replicate this guard, because `isAdminRequest` is used in contexts where throwing a 503 would be wrong.

---

## Consequences

### Positive

- There is now a single place to read, audit, and change the admin definition.
- ~~The metadata field acts as a second factor: even if an attacker compromises an allowlisted email address, they cannot gain admin access without also controlling `user_metadata.user_type`, which can only be set via the Supabase service-role API.~~ **FALSE, corrected by [0008](0008-admin-gate-server-facts-only.md).** `user_metadata` is writable by the user it belongs to. It raises no attacker cost, and as a conjunct it can strip a real admin whose metadata gets overwritten.
- `isAdminRequest` makes it straightforward to add admin checks to new routes without duplicating logic.

### Negative / breaking

**Existing `admin_users` members who do not have `user_metadata.user_type === "admin"` will lose admin access under this gate.** The table row alone is no longer sufficient. Before this change ships to production, whoever administers the project must verify that every intended admin has both a valid table row (or allowlisted email) and the `user_type: "admin"` metadata field set on their Supabase auth user. Setting the metadata requires a service-role call, for example:

```ts
await supabaseAdmin.auth.admin.updateUserById(userId, {
  user_metadata: { user_type: "admin" },
});
```

### No change

- `getAdminUser` error messages and HTTP status codes are identical to before.
- The `ADMIN_EMAILS` / `ADMIN_EMAIL` env var convention is unchanged.
- The `admin_users` table schema is unchanged.
