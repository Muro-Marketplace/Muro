# 03 - Auth, session and admin

**Status:** Ready to execute
**Scope:** E30, E34, E35, E36
**Baseline commit:** `356cd37`
**Method:** every claim below was re-derived by reading the source at the baseline commit. Nothing is carried over from the lost write-ups. Anything that could not be verified from the repo is labelled **UNCONFIRMED** and is never presented as fact.

All paths are relative to `website/` unless stated otherwise.

---

## 0. Confirmation summary

| ID | Claim from the surviving title | Status |
| --- | --- | --- |
| E30a | Application decisions are unaudited | **CONFIRMED** |
| E30b | Admin surface is client-only gated | **CONFIRMED** |
| E34 | Venue takeover via self-asserted `venue_slug` | **CONFIRMED in code**; live exploitability depends on one DB fact that is **UNCONFIRMED** (see 3.2) |
| E35a | Captcha is advisory only | **CONFIRMED** |
| E35b | Captcha fails open when the secret is unset | **CONFIRMED** |
| E35c | Rate limiting is advisory | **PARTLY REFUTED**. It is enforced at every call site. It is defeatable for other reasons (E36c, and in-memory fallback) |
| E35d | Admin `user_type` is self-settable | **CONFIRMED** |
| E36a | Open redirect in `auth/callback` | **REFUTED, already fixed** at commit `94a174a` |
| E36b | Open redirect in `api/demo/login` | **CONFIRMED** |
| E36c | Spoofable rate-limit key | **CONFIRMED** |
| E36d | User enumeration on apply / waitlist / register-venue | **CONFIRMED** |

Two of the surviving titles overstate the position and one understates it. Section 1 corrects the most consequential one.

---

## 1. The admin authorisation design (read this first)

This is the section the launch-prep instruction depends on. It resolves the conflict between *"set `user_metadata.user_type = 'admin'` on all current admins before deploy or they lose access"* and E35's *"`user_metadata` is self-settable"*.

### 1.1 How admin authorisation actually works today

There is exactly one predicate. `src/lib/admin-auth.ts:38-51`:

```ts
async function userIsAdmin(user: User): Promise<boolean> {
  const role = (user.user_metadata as { user_type?: unknown } | null)?.user_type;
  if (role !== "admin") return false;

  const email = user.email?.toLowerCase();
  if (email && adminEmails().includes(email)) return true;

  const { data } = await getSupabaseAdmin()
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}
```

So the live rule is:

```
admin  ==  user_metadata.user_type === "admin"
           AND ( email ∈ ADMIN_EMAILS  OR  user_id ∈ admin_users )
```

It is neither a pure allowlist nor a pure DB column. It is a three-source conjunction, formalised in `docs/adr/0001-one-admin-gate.md`. Four further facts materially change how it behaves in practice:

1. **`ADMIN_EMAILS` unset disables admin entirely for `getAdminUser` callers.** `src/lib/admin-auth.ts:90-97`:

   ```ts
   const allowed = adminEmails();
   if (allowed.length === 0) {
     console.error("ADMIN_EMAILS/ADMIN_EMAIL is not configured, admin access is disabled");
     return {
       user: null,
       error: NextResponse.json({ error: "Admin access not configured" }, { status: 503 }),
     };
   }
   ```

   A person who is in `admin_users` but not in the env list gets a 503 when the env list is empty, even though the predicate would have passed. The table is not a standalone path.

2. **`isAdminRequest` does not carry that guard.** `src/lib/admin-auth.ts:61-65` calls `userIsAdmin` directly with no 503 branch. So the two exported helpers disagree when `ADMIN_EMAILS` is unset: `getAdminUser` routes return 503 for everyone, while `isAdminRequest` routes (`api/admin/refresh-stats`, `api/refunds/process`, `api/refunds`) still consult `admin_users`. That is an inconsistency, not currently a vulnerability, but it will become one the moment the two are assumed equivalent.

3. **`admin_users` has no `CREATE TABLE` anywhere in the repo.** The only reference in SQL is a conditional RLS enable, `supabase/migrations/034_rls_core_tables.sql:174-178`:

   ```sql
   -- ---------- admin_users (if exists) ----------
   ...
   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_users') THEN
     EXECUTE 'ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY';
   ```

   If the table was never created out of band, the PostgREST select at line 45 errors, `data` comes back null, `Array.isArray(null)` is false, and the branch returns false. On a freshly migrated environment the effective rule collapses to `metadata AND email ∈ ADMIN_EMAILS`. Whether the table exists in the deployed project is **UNCONFIRMED** from the repo; it must be checked before step 2 of the migration below.

4. **`user_metadata` is writable by the user it belongs to.** Confirmed in-repo at four browser call sites that pass metadata straight into an anon-key `signUp`, for example `src/app/(pages)/signup/venue/page.tsx:178`:

   ```ts
   data: { user_type: "venue", display_name: form.contactName, venue_slug: venueSlug },
   ```

   No Wallplace server sits in that path; the call goes browser to GoTrue with the public anon key. Nothing filters the value, and a grep for `raw_user_meta_data` across the repo finds no sanitising trigger (only two hits, both in a docs file). GoTrue additionally exposes self-service metadata updates through `PUT /auth/v1/user`, which is what `supabase.auth.updateUser({ data })` calls; the repo uses `updateUser` at `src/app/(pages)/artist-portal/settings/page.tsx:52,79` for other fields. Whether that specific endpoint is reachable on the deployed project is **UNCONFIRMED**, but it does not matter: signup alone is sufficient to set an arbitrary `user_type`.

### 1.2 Verdict on the conflict

**The launch-prep instruction is factually correct about today's code and is the wrong remedy.**

Correct, because the metadata check is the first clause of the conjunction. Any current admin whose auth user lacks `user_metadata.user_type === "admin"` gets a 403 from `getAdminUser` at `src/lib/admin-auth.ts:99-104`. `docs/adr/0001-one-admin-gate.md:56` says so explicitly and in bold. If nothing else changes, the stamp really is required.

Wrong, because it entrenches an attacker-writable field inside the authorisation decision, and the justification given for that field does not hold. `docs/adr/0001-one-admin-gate.md:51` claims:

> "the metadata field acts as a second factor: even if an attacker compromises an allowlisted email address, they cannot gain admin access without also controlling `user_metadata.user_type`, which can only be set via the Supabase service-role API"

That premise is false, per fact 4 above. An attacker who controls an allowlisted mailbox can trigger a password reset, sign in as that user, and set their own metadata. The clause adds no attacker cost whatsoever.

What it does add is real, one-directional lockout risk for legitimate admins. Anything that overwrites an admin's `user_metadata` silently revokes their access, and the codebase already contains that exact pattern. `src/app/api/admin/applications/[id]/route.ts:114-120` replaces metadata wholesale rather than merging it:

```ts
await db.auth.admin.updateUserById(userId, {
  user_metadata: {
    user_type: "artist",
    display_name: app.name,
    artist_slug: artistSlug,
  },
});
```

So a conjunct that cannot stop an attacker can and does strip a real admin. That is a strictly negative trade.

**Decision: remove `user_metadata` from the authorisation predicate. Demote it to a UI and routing hint. Then the launch-prep stamp is no longer load-bearing, and can be applied purely for navigation cosmetics.**

### 1.3 Target design

```
isAdmin(user)  ==  email ∈ ADMIN_EMAILS   OR   user_id ∈ admin_users
```

Both operands are server-owned. Neither can be written by the subject of the check. `user_metadata.user_type` is read only by the client for navigation (`portalPathForRole`, sidebar highlighting) and is never trusted for access.

Target `src/lib/admin-auth.ts`:

```ts
/**
 * The canonical admin predicate (ADR 0008, supersedes ADR 0001).
 *
 * A user is an admin iff:
 *   email in ADMIN_EMAILS env list  OR  user_id in admin_users table
 *
 * user_metadata is deliberately NOT consulted. It is writable by the user
 * it belongs to (anon-key signUp and GoTrue's PUT /auth/v1/user), so as a
 * conjunct it raised no attacker cost while creating a real lockout path
 * for legitimate admins.
 */
async function userIsAdmin(user: User): Promise<boolean> {
  const email = user.email?.toLowerCase();
  if (email && adminEmails().includes(email)) return true;
  return adminUsersHasRow(user.id);
}

/**
 * Returns true iff the row exists. Distinguishes "table missing" from
 * "no row" so the 503 misconfiguration guard can stay accurate.
 */
async function adminUsersHasRow(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .limit(1);
  if (error) {
    console.error("[admin-auth] admin_users lookup failed:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}
```

And the misconfiguration guard in `getAdminUser` changes from "env list empty" to "no admin source configured at all", so that an `admin_users`-only deployment works:

```ts
  const allowed = adminEmails();
  const tableUsable = await adminUsersTableExists();
  if (allowed.length === 0 && !tableUsable) {
    console.error("Neither ADMIN_EMAILS nor a usable admin_users table is configured, admin access is disabled");
    return {
      user: null,
      error: NextResponse.json({ error: "Admin access not configured" }, { status: 503 }),
    };
  }
```

`adminUsersTableExists` should be a single cached probe (module-level memo, reset per cold start) so it does not add a query to every admin request.

`isAdminRequest` keeps its no-503 contract but must now share the same predicate, which it already does.

### 1.4 Deploy-safe migration path

The ordering is the whole point. Executed in this order, **no admin loses access at any step**, and no step depends on the one after it.

**Step 0. Inventory, before touching anything.**
Record, from the deployed environment and not from the repo:
- the exact value of `ADMIN_EMAILS` / `ADMIN_EMAIL`;
- whether `admin_users` exists (`SELECT to_regclass('public.admin_users');`), and if so its rows;
- for each intended admin, whether `raw_user_meta_data->>'user_type' = 'admin'`.

This closes the **UNCONFIRMED** in 1.1 fact 3. Do not proceed until the answer is written down. If `admin_users` does not exist, note that every current admin is holding access purely through `ADMIN_EMAILS`, which makes step 1 and 2 additive and risk-free.

**Step 1. Create `admin_users` properly.** New migration `supabase/migrations/0NN_admin_users.sql`, idempotent so it is safe against an out-of-band table:

```sql
CREATE TABLE IF NOT EXISTS admin_users (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  note       TEXT
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
-- No policies. Service role only; every read goes through admin-auth.ts.

NOTIFY pgrst, 'reload schema';
```

Note the current code selects `id` (`src/lib/admin-auth.ts:47`). If an out-of-band table exists with a different shape, reconcile it here rather than in TypeScript. The target predicate above selects `user_id`, which the DDL guarantees.

**Step 2. Backfill `admin_users` from `ADMIN_EMAILS`.** A one-off service-role script, `scripts/backfill-admin-users.ts`, that resolves each allowlisted email through `auth.admin.listUsers()` and upserts the row. Assert at the end that the row count equals the allowlist length, and print any email with no matching auth user. This makes the table a complete mirror of the current allowlist, so step 3 cannot narrow anyone's access.

**Step 3. Ship the predicate change (section 1.3).** At this moment every current admin is still authorised twice over: by allowlist and by table row. Removing the metadata conjunct only ever *widens* the legitimate-admin set, so this deploy cannot lock anyone out. It also makes the launch-prep instruction unnecessary.

**Step 4. Ship the metadata stamp, but as cosmetics only.** Now, and only now, run a service-role script that sets `user_type: 'admin'` for real admins so `portalPathForRole` (`src/lib/auth-roles.ts:25-26`) sends them to `/admin` after login and the sidebar renders. It must **merge**, never replace:

```ts
const { data: { user } } = await admin.auth.admin.getUserById(id);
await admin.auth.admin.updateUserById(id, {
  user_metadata: { ...(user?.user_metadata ?? {}), user_type: "admin" },
});
```

If this step is skipped or fails, admins keep API access and only lose a nav convenience. That is the entire point of doing it after step 3.

**Step 5. Stop user-supplied roles from ever being `admin` again.** See 4.3. Deliberately last, because it touches signup and OAuth paths.

**Rollback.** Steps 1 and 2 are additive. Step 3 is a widening for legitimate admins and a no-op for attackers, so reverting it re-introduces the lockout risk but breaks nothing that was working. Step 4 is idempotent. There is no step whose rollback removes access from a current admin.

**Do not do the launch-prep stamp on its own and stop there.** That is the only sequence that leaves the system in the worst state: the foot-gun entrenched, the ADR's false premise unchallenged, and the client-only UI gate still trusting the same field.

**New ADR required.** Write `docs/adr/0008-admin-gate-server-facts-only.md` superseding 0001, and mark 0001 as Superseded. Quote and correct the false claim at 0001:51 so the reasoning is not re-derived from it later.

---

## 2. E30 - Unaudited application decisions and a client-only admin surface

### 2.1 E30a - `recordAdminAction` coverage gap

**Confirmed location.** The helper is `src/lib/admin-audit.ts:13-28` and writes to `admin_audit_log` (`supabase/migrations/066_admin_audit_log.sql:8-14`). Its own header comment at `src/lib/admin-audit.ts:1-9` names only three intended callers, which is why coverage was never extended.

Current callers, all verified by grep:

| Call site | Audited |
| --- | --- |
| `src/app/api/messages/route.ts:93-95` | yes |
| `src/app/api/admin/disputes/[id]/route.ts:69` | yes |
| `src/app/api/admin/blogs/[id]/route.ts:66, 90, 120` | yes |
| `src/app/api/admin/financials/route.ts:34` | yes |
| `src/app/api/admin/moderation/route.ts:77` | yes |

**The gaps.** Admin-gated routes with side effects and no audit row:

| # | Route | What it does unaudited | Severity |
| --- | --- | --- | --- |
| G1 | `src/app/api/admin/applications/[id]/route.ts` `PUT` | Accept or reject an artist application. Creates or invites an auth user (`:124`), **rewrites that user's `user_metadata`** (`:114-120`), inserts an `artist_profiles` row marked `review_status: "approved"` (`:196`), force-approves on the update path (`:211-217`), flips `artist_applications.status` (`:279-316`), sends lifecycle email. | **High.** This is the platform's admission gate and the exact action named in the finding title. |
| G2 | `src/app/api/admin/curation/route.ts` `PATCH` (`:31-52`) | Mutates `curation_requests.status` across a lifecycle that includes `paid`, `refunded` and `cancelled`, plus free-text `admin_notes`. | **High.** Money-adjacent state with no trail. |
| G3 | `src/app/api/refunds/process/route.ts` `POST` (`:15`, admin branch at `:77`) | Processes a Stripe refund. This is the only path by which an artist-initiated refund can be approved (`:86-89`), and it updates orders and refund requests at `:116, :176, :194, :250, :290`. | **High.** Real money, admin-only approval, no trail. |
| G4 | `src/app/api/admin/refresh-stats/route.ts` `POST` (`:10-25`) | Recomputes every cached artist stat. | Medium. Not destructive, but it rewrites public-facing numbers on demand. |
| G5 | `api/admin/artists`, `api/admin/venues`, `api/admin/applications` (list), `api/admin/disputes` (list), `api/admin/stats` | Read-only bulk export of user and venue PII. | Low, but an inconsistency: `api/admin/financials` `GET` already audits a read (`:34`), so the codebase's own standard says sensitive admin reads get a row. |

**Mechanism.** There is no shared wrapper. Every admin route calls `getAdminUser` (or `isAdminRequest`) by hand and then, optionally and by memory, calls `recordAdminAction`. Nothing enforces the pairing, so coverage tracks whichever phase of work last touched a file.

**Exploit.** Not an external exploit; it is an accountability failure. A compromised or malicious admin account can approve itself an artist identity, rewrite another user's metadata, mark curation requests paid, and issue Stripe refunds, and the `admin_audit_log` table will show nothing. `api/admin/applications/[id]` is the worst of these because it both mints platform identity and mutates another user's `user_metadata`, which section 1 shows is security-relevant.

**Exact fix.**

Do not sprinkle calls. Introduce a wrapper so the pairing cannot be forgotten. New export in `src/lib/admin-auth.ts`:

```ts
/**
 * Admin route wrapper. Resolves the admin user, runs the handler, and
 * writes the audit row. Handlers cannot forget to audit because the
 * wrapper owns the call.
 */
export async function withAdmin(
  request: Request,
  action: string,
  handler: (user: User) => Promise<{ response: NextResponse; context?: Record<string, unknown> }>,
): Promise<NextResponse> {
  const { user, error } = await getAdminUser(request);
  if (error) return error;

  const { response, context } = await handler(user!);
  await recordAdminAction({ adminUserId: user!.id, action, context });
  return response;
}
```

Then convert G1 to G4. G1 becomes:

```ts
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  return withAdmin(request, `application_${body.action === "reject" ? "rejected" : "accepted"}`, async (user) => {
    // ... existing body, returning { response, context }
    return {
      response: NextResponse.json({ success: true, status: "rejected" }),
      context: { applicationId: id, applicantEmail: app.email, decision: "rejected" },
    };
  });
}
```

Two hard rules for the conversion:
- audit **before** returning the success response, matching the precedent already asserted by `src/app/api/messages/route.test.ts:213` ("500 when recordAdminAction rejects, audit-before-return");
- put the decision, the target id and the target's email in `context`, never the full row (the column is JSONB and will otherwise accumulate PII).

For G3, which uses `isAdminRequest` rather than `getAdminUser` because artists can also call it, do not force it through `withAdmin`. Add an explicit call inside the existing admin branch:

```ts
if (admin) {
  await recordAdminAction({
    adminUserId: userId,
    action: "refund_processed_by_admin",
    context: { orderId: order.id, refundRequestId: refundReq.id, amount: refundAmount },
  });
}
```

For G5, add a single low-cost `admin_list_viewed` row per request with `{ resource: "artists", count }`. If that is judged too noisy, record the decision in the new ADR rather than leaving the inconsistency undocumented.

**Test to add.** `src/lib/admin-audit-coverage.test.ts`, a repo-shape test that cannot rot:

```ts
import { readFileSync } from "node:fs";
import fg from "fast-glob"; // or a small recursive readdir helper, no new dep needed

const MUTATING = /export async function (POST|PUT|PATCH|DELETE)/;

it("every mutating admin route audits", async () => {
  const files = await fg("src/app/api/admin/**/route.ts");
  const offenders = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return MUTATING.test(src) && !/recordAdminAction|withAdmin/.test(src);
  });
  expect(offenders).toEqual([]);
});
```

Plus a behavioural test per converted route, modelled on `src/app/api/admin/applications/[id]/route.test.ts` which already exists: assert that a successful accept writes one row with `action: "application_accepted"` and the right `applicationId`, and that a rejected audit write surfaces rather than being swallowed.

**Breakage risk.** Low to medium. `recordAdminAction` currently never throws (`src/lib/admin-audit.ts:25-27` swallows into `console.error`), so adding calls cannot fail a request. The medium part is the `withAdmin` refactor of `applications/[id]`, which is a 250-line handler with several early returns; each early return has to become a `{ response, context }`. Convert it in one commit with the existing `route.test.ts` green before and after, and do not combine it with any behaviour change. `admin_audit_log.admin_user_id` is `NOT NULL REFERENCES auth.users(id)`, so passing a non-existent id fails the insert silently; the wrapper always passes the resolved user's id, so this is safe.

### 2.2 E30b - the admin surface is gated client-side only

**Confirmed location.** Three facts, all verified:

1. `src/app/(pages)/admin/layout.tsx:14-16` has no guard at all:

   ```tsx
   export default function AdminLayout({ children }: { children: React.ReactNode }) {
     return <>{children}</>;
   }
   ```

2. The only gate is inside a client component, `src/components/AdminPortalLayout.tsx:41-45` and `:69`:

   ```tsx
   useEffect(() => {
     if (!loading && (!user || userType !== "admin")) {
       router.replace("/login");
     }
   }, [loading, user, userType, router]);
   ```
   ```tsx
   if (!user || userType !== "admin") return null;
   ```

3. `userType` is the self-settable field. `src/context/AuthContext.tsx:137`:

   ```ts
   const userType = parseRole(user?.user_metadata?.user_type);
   ```

There is **no `middleware.ts`** in the repo (verified: neither `src/middleware.ts` nor `middleware.ts` exists), so nothing runs server-side ahead of the `/admin` route group. Every one of the ten `src/app/(pages)/admin/*/page.tsx` files renders `AdminPortalLayout` and depends entirely on it.

**Mechanism.** The gate is a render-time check inside JavaScript the attacker controls, keyed on a value the attacker writes.

**Exploit.** Sign up with `supabase.auth.signUp({ email, password, options: { data: { user_type: "admin" } } })` using the public anon key. Log in. `portalPathForRole` (`src/lib/auth-roles.ts:25-26`) routes you to `/admin`. The full admin shell renders: navigation, every admin page, every page's markup and client-side logic. The data fetches behind them return 403 because every route under `src/app/api/admin/**` does call `getAdminUser` or `isAdminRequest` (I checked all fourteen), so this is not currently a data breach. It is, however:
- a convincing UI for social engineering and for a screenshot-driven support-desk attack;
- a live leak the instant any admin page is added that fetches from a non-admin-gated endpoint, which is the default failure mode because nothing enforces the pairing;
- a `return null` that fires only after the component mounts, so the shell can flash before the redirect.

**Exact fix.** A critical constraint first, because it rules out the obvious answer: **there is no server-readable session.** `package.json:26` lists only `"@supabase/supabase-js": "^2.103.0"`; `@supabase/ssr` is not a dependency, and `src/lib/supabase.ts` is a bare `createClient(url, anonKey)` with default (localStorage) storage. The comment at `src/app/api/demo/login/route.ts:108` claiming "Supabase's `@supabase/ssr` middleware (already configured app-wide)" is inaccurate; that route writes an `sb-*-auth-token` cookie that nothing in the app reads. A Next middleware or Server Component guard therefore has no session to read today.

So ship this in two stages.

**Stage 1 (this plan): server-decided gate at the route-group boundary.**

New route `src/app/api/admin/whoami/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const { user, error } = await getAdminUser(request);
  if (error) return error;
  return NextResponse.json({ ok: true, email: user!.email });
}
```

New client component `src/components/AdminGate.tsx` that holds the token, calls `whoami`, and renders children only on `ok`. Render nothing (not a partial shell) while pending, and `router.replace("/login")` on 401/403/503.

Wire it into the route group, so it covers every current and future admin page rather than every page remembering to opt in. `src/app/(pages)/admin/layout.tsx`:

```tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
```

Leave `AdminPortalLayout`'s existing `userType` check in place as a cheap second line, but delete the comment implying it is the gate.

Be honest about what this buys: the *decision* moves to the server and uses the real predicate, so a self-declared admin no longer renders the shell. The *enforcement* is still client-executed and an attacker with devtools can still paint the UI. **The security boundary remains the per-route `getAdminUser` check, and must stay that way.** Stage 1's job is to close the default leak path and make new admin pages safe by default.

Add the invariant test that keeps that true, `src/app/api/admin/route-guard.test.ts`:

```ts
it("every admin API route checks admin auth", async () => {
  const files = await fg("src/app/api/admin/**/route.ts");
  const offenders = files.filter((f) => !/getAdminUser|isAdminRequest|withAdmin/.test(readFileSync(f, "utf8")));
  expect(offenders).toEqual([]);
});
```

**Stage 2 (separate PR, larger, out of scope here but record it):** adopt `@supabase/ssr`, move the session into cookies, add `src/middleware.ts` matching `/admin/:path*` and run the predicate there. That is the only way to get a true server-side gate, and it also makes `api/demo/login`'s cookie writing coherent. It is an auth-storage change touching every client that reads the session, so it does not belong in a security-fix PR.

**Test to add.** Unit tests for `AdminGate`: renders nothing on 403, renders children on `{ ok: true }`, redirects to `/login` on 401. Route test for `whoami` mirroring `src/lib/admin-auth.test.ts`'s existing mock harness (`vi.hoisted` around `getSupabaseAdmin`). Plus the two invariant tests above.

**Breakage risk.** Medium. `AdminGate` adds a round trip before the admin UI paints, so every admin page gains a loading state; reuse the animated bar already in `AdminPortalLayout:52-66` so it is not a visual regression. If `whoami` is wrong about the predicate, admins see a redirect loop to `/login`, which is why Stage 1 must ship **after** section 1.4 step 3, when the predicate no longer depends on metadata. Shipping the gate before the predicate fix would hard-lock any admin whose metadata is unset out of the UI as well as the API.

---

## 3. E34 - Venue takeover via self-asserted `venue_slug`

### 3.1 Confirmed locations

**The write.** `src/app/(pages)/signup/venue/page.tsx:178`, a browser call with the anon key:

```ts
data: { user_type: "venue", display_name: form.contactName, venue_slug: venueSlug },
```

**The authorisation read.** `src/app/api/venue-profile/route.ts:83-84` then `:98-112`:

```ts
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const metaSlug = typeof meta.venue_slug === "string" ? meta.venue_slug : "";
```
```ts
  if (metaSlug) {
    const { data: bySlug } = await db
      .from("venue_profiles")
      .select("id, slug")
      .eq("slug", metaSlug)
      .is("user_id", null)
      .maybeSingle();
    if (bySlug) {
      const { error } = await db
        .from("venue_profiles")
        .update({ user_id: userId })
        .eq("id", bySlug.id);
```

This runs through `getSupabaseAdmin()`, the service-role client, so RLS does not apply. The entry point is `PATCH /api/venue-profile` with `{ ensureProfile: true }` or `{ adoptIfOrphan: true }` (`:44-54`), which any authenticated user can call.

**The orphan factory.** `src/app/api/register-venue/route.ts:70-90`, unauthenticated:

```ts
    const venueSlug = (typeof body.venueSlug === "string" && body.venueSlug)
      ? body.venueSlug
      : slugify(d.venueName);
```
```ts
      const { error: profileErr } = await db.from("venue_profiles").insert({
        slug: venueSlug,
        ...
        // user_id intentionally omitted — stays NULL until back-filled
```

`venueSlug` is read off the **raw body**, not off the parsed schema. `registerVenueSchema` (`src/lib/validations.ts:84-98`) has no `venueSlug` field, so the value is unvalidated and never passed through `slugify`.

**What ownership means downstream.** `venue_profiles.user_id` is the sole ownership token. `src/lib/api-auth.ts:8-35` only validates the JWT and performs no ownership check; every venue-scoped route re-derives ownership from `user_id`, for example `src/app/api/artwork-requests/route.ts:233-243`, `src/app/api/placements/route.ts:369`, `src/app/api/messages/route.ts:126,305,624`, `src/app/api/orders/route.ts:60`, `src/app/api/dashboard/route.ts:118`.

**`/apply/claim`** is artist-only and unrelated to venues, but it self-asserts an identifier the same way, `src/app/(pages)/apply/claim/page.tsx:64`:

```ts
options: { data: { user_type: "artist", display_name: name, artist_slug: slug } },
```

No equivalent adopt-orphan-by-`artist_slug` server path was found. Whether one exists in `api/artist-profile` is **UNCONFIRMED**; check it during implementation.

### 3.2 Mechanism, exploit, and the one open question

**Mechanism.** Ownership is granted on a string the claimant chose, with no relationship to any verified fact about them. The email path immediately below (`:118-137`) is materially safer because it keys off `user.email` from the verified JWT, and login requires email confirmation (`src/components/VenuePortalLayout.tsx:94` gates on `user.email_confirmed_at`). The slug path has no such anchor.

**Exploit.**
1. Anonymously `POST /api/register-venue` with `venueSlug: "the-copper-kettle"` and the attacker's own contact details. An ownerless row is created under the victim's slug.
2. Sign up with `data: { user_type: "venue", venue_slug: "the-copper-kettle" }` and confirm the attacker's own email.
3. Visit `/venue-portal`. `VenuePortalLayout.tsx:96-99` fires `PATCH { ensureProfile: true }`, the slug branch matches, and `venue_profiles.user_id` is set to the attacker.
4. When the real venue registers later, `register-venue:74-79` sees the row already exists and skips, and their own `ensureVenueProfile` falls through to the suffix branch (`:139-144`), landing them on `the-copper-kettle-2`.

The attacker now owns the canonical slug, the public `/venues/<slug>` page, and the inbound routing for artist messages, placements and artwork requests. Run against a victim-created orphan (a venue that registered but never logged in) it additionally hands over the registration PII stored on the row: `contact_name`, `email`, `phone`, `wall_space`.

**The open question.** `supabase-migration.sql:59` declares:

```sql
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
```

I grepped every file in `supabase/migrations/*.sql` and `website/*.sql` and found **no `DROP NOT NULL`** on that column. Against that schema the orphan insert at `register-venue:80` fails with `23502` and is only logged (`:91-93`), so no orphan ever exists and step 3 finds nothing.

**UNCONFIRMED: whether `venue_profiles.user_id` is nullable in the deployed database.** This single fact decides the classification:
- **nullable** (schema has drifted from the migrations): live exploit exactly as described, fix immediately;
- **still `NOT NULL`**: the takeover is latent rather than live, but then the entire orphan self-heal feature is dead code and *every* venue registration is silently failing to seed its profile, which is its own bug of comparable priority.

Either answer requires action. Resolve it in step 0 of the checklist with `SELECT is_nullable FROM information_schema.columns WHERE table_name='venue_profiles' AND column_name='user_id';`.

### 3.3 Exact fix

**Fix 1, remove the slug adoption path entirely.** Delete `src/app/api/venue-profile/route.ts:97-116`. Adoption by verified email is the only defensible automatic path, and it already exists directly below. A slug is not evidence of anything.

**Fix 2, stop trusting `venue_slug` as an insert base.** In the fallback insert (`:139-144`), derive the slug from the display name, not from metadata:

```ts
-  const baseSlug = metaSlug || slugify(metaName) || `venue-${userId.slice(0, 8)}`;
+  const baseSlug = slugify(metaName) || `venue-${userId.slice(0, 8)}`;
```

**Fix 3, stop the anonymous orphan factory from choosing slugs.** In `src/app/api/register-venue/route.ts:70-72`:

```ts
-    const venueSlug = (typeof body.venueSlug === "string" && body.venueSlug)
-      ? body.venueSlug
-      : slugify(d.venueName);
+    // Slug is always derived server-side. Accepting body.venueSlug let an
+    // anonymous caller squat any slug (E34).
+    const venueSlug = slugify(d.venueName);
```

and stop swallowing the insert error at `:91-93`: log it *and* include a `profileSeeded: boolean` in the response so a silent failure is visible in monitoring rather than only in stderr.

**Fix 4, harden email adoption.** Require `user.email_confirmed_at` before adopting by email, and adopt only when exactly one orphan matches. The current `.order("created_at", { ascending: false }).limit(1)` (`:126-129`) silently picks the newest of several, which is a coin flip on a shared or role address.

**Fix 5, make the remaining orphans claimable safely.** Any legitimate case that fix 1 breaks (a venue that registered before signing up and whose signup email differs from the registration email) becomes an admin action: surface unclaimed orphans in `/admin/venues` with an explicit "link to user" control, audited via `recordAdminAction` per section 2.1. A support-desk step is the correct cost for an operation that transfers ownership.

### 3.4 Test to add

`src/app/api/venue-profile/route.test.ts`:
- a user whose `user_metadata.venue_slug` names an existing orphan they have no email relationship to gets **no** adoption, and the orphan's `user_id` stays null (this is the regression test for the vulnerability);
- adoption by matching confirmed email still succeeds;
- adoption by matching email is refused when `email_confirmed_at` is null;
- two orphans matching the same email results in no adoption, not the newest.

`src/app/api/register-venue/route.test.ts`:
- `POST` with `venueSlug: "victim-venue"` in the body creates a row whose slug is `slugify(venueName)` and not `victim-venue`.

### 3.5 Breakage risk

**Medium to high, and asymmetric depending on the answer to 3.2.** If the column is nullable, live orphans exist and removing slug adoption strands the ones whose signup email differs from their registration email; fix 5 is not optional in that case and must ship in the same release. If the column is `NOT NULL`, there are no orphans, fixes 1 and 2 are dead-code removal with zero user impact, and the real work becomes making profile seeding actually function. Do not ship fix 1 before answering 3.2.

---

## 4. E35 - Advisory captcha, degradable rate limiting, self-settable `user_type`

### 4.1 Captcha is advisory, and fails open when unconfigured

**Confirmed location.** `src/app/api/auth/verify-turnstile/route.ts:36-41`:

```ts
  // No secret configured → treat the request as verified so local /
  // preview environments aren't blocked. The companion client widget
  // emits "dev-bypass" in the same situation.
  if (!secret) {
    return NextResponse.json({ ok: true, bypass: true });
  }
```

The client widget self-bypasses in the same situation, `src/components/Turnstile.tsx:61-64`:

```ts
    if (!SITE_KEY) {
      onVerify("dev-bypass");
      return;
    }
```

To be precise about the fail-open scope: the route fails **closed** on a network error (`:66-68` returns 502) and rejects the `dev-bypass` sentinel once a secret exists (`:43-45`). The only fail-open is the unset-secret branch.

**The bigger problem is architectural.** Only three callers exist, all browser code: `src/app/(pages)/signup/customer/page.tsx:56`, `signup/artist/page.tsx:83`, `signup/venue/page.tsx:144`. Each performs a *separate* fetch to `verify-turnstile` and then, on success, makes an *unrelated* call to the real sink. The customer page, `:56-75`:

```ts
      const verifyRes = await fetch("/api/auth/verify-turnstile", { ... });
      const verifyData = (await verifyRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!verifyRes.ok || !verifyData.ok) {
        setError("Verification failed. Refresh and try again.");
        ...
      }

      const { error: signUpError } = await supabase.auth.signUp({
```

No token, nonce or receipt crosses from the verification into the signup. Grepping `turnstile|captcha` returns **zero hits** in `src/app/api/apply/route.ts`, `src/app/api/waitlist/route.ts` and `src/app/api/register-venue/route.ts`.

**Exploit.** Skip the first fetch. `curl` the real endpoint directly. Signup is not even a Wallplace endpoint (browser to GoTrue), so it structurally cannot enforce a token without a server-side signup proxy.

**Exact fix.**
1. Make the verification produce a **receipt**. `verify-turnstile` returns a short-lived HMAC-signed token on success. Reuse the existing pattern in `src/lib/oauth-state.ts`, which already does signed-state with `timingSafeEqual` and expiry, rather than inventing a second scheme.
2. Require and verify that receipt server-side in `apply`, `waitlist` and `register-venue`. Add `captchaReceipt: z.string()` to each zod schema and reject before any DB work.
3. Fail closed in production. Replace `:36-41` with:

   ```ts
   if (!secret) {
     if (process.env.NODE_ENV === "production") {
       console.error("[turnstile] TURNSTILE_SECRET_KEY unset in production, refusing");
       return NextResponse.json({ ok: false, error: "Captcha not configured" }, { status: 503 });
     }
     return NextResponse.json({ ok: true, bypass: true });
   }
   ```
4. Signup itself cannot be gated without a server-side proxy route. Do not pretend otherwise: record it as accepted risk in the ADR, mitigated by Supabase's own captcha setting (which is configured in the Supabase dashboard, not in this repo) plus the rate limiting in 4.2. Whether that dashboard setting is enabled is **UNCONFIRMED** from the repo.

**Test to add.** `verify-turnstile` returns 503 when the secret is unset and `NODE_ENV === "production"`, and `{ ok: true }` when unset in development. Each of `apply`, `waitlist`, `register-venue` returns 400 with no receipt, 400 with a tampered receipt, 400 with an expired receipt, and proceeds with a valid one.

**Breakage risk.** High if mis-sequenced. The receipt must be deployed to the client and the server together, and `TURNSTILE_SECRET_KEY` must be present in every production environment *before* the fail-closed change, or every application form 503s. Ship the receipt plumbing first with the server accepting both a receipt and no receipt, confirm receipts are arriving in logs, then flip to mandatory.

### 4.2 Rate limiting: enforced, but degradable

**Partly refutes the finding title.** `src/lib/rate-limit.ts` returns a real `NextResponse` (`:95-100`), and I checked all nineteen call sites: every single one follows the `if (limited) return limited;` shape. `waitlist:9`, `apply:15`, `contact:8`, `messages/report:18`, `messages/block:14`, `feature-requests:42`, `auth/precheck:20-23`, `browse-artists:7`, `venues/demand:19`, `register-venue:12`, `orders/track:37`, `newsletter:16`, `enquiry:9`, `stats/public:12`, `analytics/track:17`, `moderation:49-55`, `lib/visualizer/quota.ts:171`. **There is no advisory call site.**

Two real weaknesses remain.

**Weakness A: silent degradation.** `src/lib/rate-limit.ts:27-33` documents its own defeat:

```ts
    if (!_warned && process.env.NODE_ENV === "production") {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/_TOKEN not set, falling back to in-memory limiter. " +
          "Each serverless instance has its own store, so this provides NO protection in production.",
      );
```

**Fix:** promote the warning to a hard failure in production. If `NODE_ENV === "production"` and the Upstash vars are absent, throw at module load so the deployment fails visibly rather than serving unprotected. A console warning in a serverless log is not a control.

**Weakness B: the login and password-reset limiter is bypassable for the same structural reason as the captcha.** `src/app/api/auth/precheck/route.ts` is a standalone route whose only callers are `src/app/(pages)/login/page.tsx:60-73` and `forgot-password/page.tsx:18`; the real `signInWithPassword` / `resetPasswordForEmail` calls go browser to GoTrue. Skip the precheck fetch and the limit never applies. The route's own comment (`:4-7`) concedes Cloudflare is the primary defence. Whether those Cloudflare rules exist is **UNCONFIRMED** from the repo, and must be verified rather than assumed.

**Fix:** treat `precheck` as telemetry, not a control. Document it as such in the route header so nobody counts it as brute-force protection, verify the Supabase project's own auth rate limits are configured, and record the answer.

**Test to add.** A test asserting the module throws when `NODE_ENV === "production"` and the Upstash env is absent. Keep the existing `rate-limit.test.ts` cases, but see 5.3, one of them has to change.

**Breakage risk.** Medium. The production throw will take down any environment currently running without Upstash. Confirm the vars are set in every production and preview environment before merging, and consider gating the throw behind an explicit `RATE_LIMIT_REQUIRE_REDIS=1` for one release so the failure is opt-in first.

### 4.3 `user_type` is self-settable, and `"admin"` is an accepted user-suppliable role

**Confirmed locations.**

`src/lib/auth-roles.ts:7` puts admin in the same list as the three public roles:

```ts
export const ALLOWED_ROLES = ["artist", "venue", "customer", "admin"] as const;
```

`src/app/api/auth/oauth-sign-state/route.ts:19-23` validates a **user-supplied** body field against that list:

```ts
  if (!isRole(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const next = safeRedirect(body.next, "/browse");
  const state = await signOAuthState({ role: body.role, next }).catch(() => null);
```

The route is unauthenticated and unrate-limited, so `POST {"role":"admin","next":"/admin"}` mints a validly HMAC-signed state token.

The consumer declares a narrower list and then never uses it. `src/app/api/auth/oauth-finalize/route.ts:25-26`:

```ts
const ALLOWED_ROLES = ["artist", "customer", "venue"] as const;
type Role = (typeof ALLOWED_ROLES)[number];
```

`:47` is a bare cast, not a check:

```ts
    verified = { role: v.role as Role, next: v.next };
```

`verifyOAuthState` validates against the wide list (`src/lib/oauth-state.ts:82`: `if (!isRole(payload.role)) throw new Error("Bad role in state");`), so `"admin"` passes, and the value is written to metadata at `:73-81`. **`ALLOWED_ROLES` at `oauth-finalize:25` is dead code**: the const is referenced only to derive the type. The author's intent to exclude admin was written and never wired up.

The direct route is simpler still: the four `signUp` sites in 1.1 fact 4 mean anyone can set `user_type: "admin"` with the public anon key, with no server in the path.

**Exploit and blast radius.** After section 1.3 lands, self-setting `user_type: "admin"` grants nothing at the API layer, and it already grants nothing today because of the allowlist conjunct. What it grants is the admin **UI** (section 2.2) and `/admin` routing. That is why 2.2 and this item must ship together.

**Exact fix.**

1. Split the role vocabulary so a user-suppliable role can never be `admin`. In `src/lib/auth-roles.ts`, keep `ALLOWED_ROLES` for *reading* stored values (removing `"admin"` would break `portalPathForRole` and the sidebar) and add:

   ```ts
   /** Roles a user may request at signup or OAuth. Never includes "admin":
    *  admin is granted server-side only (ADR 0008). */
   export const SIGNUP_ROLES = ["artist", "venue", "customer"] as const;
   export type SignupRole = (typeof SIGNUP_ROLES)[number];
   export function isSignupRole(v: unknown): v is SignupRole {
     return typeof v === "string" && (SIGNUP_ROLES as readonly string[]).includes(v);
   }
   ```

2. `oauth-sign-state:19` uses `isSignupRole` instead of `isRole`.
3. `oauth-finalize:47` performs a real check instead of a cast:

   ```ts
   -    verified = { role: v.role as Role, next: v.next };
   +    if (!isSignupRole(v.role)) {
   +      return NextResponse.json({ error: "Invalid role in state" }, { status: 400 });
   +    }
   +    verified = { role: v.role, next: v.next };
   ```
   and imports `SignupRole`, deleting the shadowing local `ALLOWED_ROLES` at `:25-26`.
4. Belt and braces at the database, since signup bypasses the server entirely: a trigger that strips `admin` from `raw_user_meta_data->>'user_type'` on insert and update to `auth.users`. This is the only control that covers the direct-to-GoTrue path.

   ```sql
   CREATE OR REPLACE FUNCTION strip_self_asserted_admin() RETURNS trigger AS $$
   BEGIN
     IF NEW.raw_user_meta_data ->> 'user_type' = 'admin' THEN
       NEW.raw_user_meta_data = NEW.raw_user_meta_data || '{"user_type":"customer"}'::jsonb;
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;
   ```

   **This trigger conflicts with section 1.4 step 4** (stamping real admins). Resolve it one of two ways, and pick before writing the migration: either the trigger checks `admin_users` membership and permits the value for genuine admins, or step 4 is dropped entirely and the admin nav keys off the `whoami` response rather than metadata. **The second is cleaner and is the recommendation**: once `AdminGate` knows the server's answer, metadata has no remaining job, and the launch-prep instruction can be declined outright rather than accommodated.

**Test to add.** `auth-roles.test.ts`: `isSignupRole("admin") === false` and `isRole("admin") === true`, with a comment explaining why the asymmetry is deliberate. `oauth-sign-state` returns 400 for `role: "admin"`. `oauth-finalize` returns 400 when handed a state token that was minted with `role: "admin"` (construct it by signing directly with the `oauth-state` helper, so the test exercises the finalize check rather than the sign-state check). A DB test that inserting a user with `user_type: "admin"` metadata yields a non-admin value.

**Breakage risk.** Low for items 1 to 3: no legitimate caller passes `role: "admin"` to either OAuth route. Medium for item 4: the trigger runs on every `auth.users` write including the service-role path, so it must be written to permit `admin_users` members or it will silently undo step 4 and lock the nav. Prefer the recommendation above and skip the conflict.

---

## 5. E36 - Redirects, rate-limit key, enumeration

### 5.1 Open redirect A, `auth/callback`: already fixed

**REFUTED.** There is no `src/app/auth/callback/route.ts`; the callback is a client component at `src/app/auth/callback/page.tsx`. The `next` param is read raw at `:32`, but the only navigation sink is `:72`:

```ts
      if (!cancelled) window.location.replace(safeRedirect(nextHref, "/browse"));
```

The alternate source for `nextHref` (`:66`, `data.next`) comes from `oauth-finalize:140`, where the value was HMAC-verified by `verifyOAuthState` and had already been through `safeRedirect` at mint time (`oauth-sign-state:22`). `git log` confirms the remediation: `94a174a fix(remediation/p4): validate OAuth callback redirect, close open-redirect`. **No action.** The surviving title's "two open redirects" is stale by one.

### 5.2 Open redirect B, `api/demo/login`: confirmed live

**Confirmed location.** `src/app/api/demo/login/route.ts:51-54`, a hand-rolled check:

```ts
function destinationFor(role: "artist" | "venue", explicit: string | null): string {
  if (explicit && explicit.startsWith("/")) return explicit;
  return role === "venue" ? "/venue-portal" : "/artist-portal";
}
```

Sink at `:61` and `:111-113`:

```ts
  const res = NextResponse.redirect(new URL(next, request.url), {
    status: 303, // see-other so the GET → GET handoff is correct
  });
```

This is the **only** redirect construction in the app that does not import `src/lib/safe-redirect.ts`. Nine other modules use it (`login/page.tsx:52,100,200,229`, `signup/page.tsx:79`, `signup/artist:63`, `signup/venue:106`, `signup/customer:32`, `checkout/page.tsx:46`, `auth/callback/page.tsx:72`, `oauth-sign-state:22`, `RedirectIfLoggedIn.tsx:28`). The other `NextResponse.redirect`, `api/qr/[slug]/route.ts:107`, composes its path server-side and is safe.

**Mechanism.** `startsWith("/")` accepts protocol-relative URLs. `new URL("//evil.example.com/x", "https://wallplace.co.uk/...")` resolves to `https://evil.example.com/x`. `/\evil.com` is also accepted and is treated as a host by several browsers.

**Exploit.** `GET /api/demo/login?role=artist&next=//evil.example.com/login` returns a 303 to the attacker's site **and sets the `sb-*-auth-token` cookie first** (`:127-133`). It is a credential-adjacent redirect off a `wallplace.co.uk` URL, which is exactly the shape a phishing link wants.

**Exact fix.** Use the existing helper. Do not extend the local one.

```ts
+import { safeRedirect } from "@/lib/safe-redirect";
...
 function destinationFor(role: "artist" | "venue", explicit: string | null): string {
-  if (explicit && explicit.startsWith("/")) return explicit;
-  return role === "venue" ? "/venue-portal" : "/artist-portal";
+  const fallback = role === "venue" ? "/venue-portal" : "/artist-portal";
+  return safeRedirect(explicit, fallback);
 }
```

**Test to add.** `src/app/api/demo/login/route.test.ts`: `next=//evil.example.com` redirects to the role default; likewise `/\evil.com`, `https://evil.com`, `javascript:alert(1)`, and a value containing a control character. `next=/venue-portal/settings` is preserved.

**Breakage risk.** Low, with one edge to note: `safeRedirect` rejects any string containing a colon (`safe-redirect.ts:11`), so a `next` carrying a URL in its query string would fall back to the default. No current caller does that. If one is added later, widen `safe-redirect` once, centrally, rather than reintroducing a local check.

### 5.3 Spoofable rate-limit key

**Confirmed location.** `src/lib/rate-limit.ts:87-93`:

```ts
export function getIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
```

**Mechanism.** It takes `[0]`, the **left-most** entry of the XFF list, which is entirely client-supplied. Proxies append; they do not overwrite. `x-real-ip` at `:90` is likewise unvalidated. The behaviour is currently pinned as intended by `src/lib/rate-limit.test.ts:17-20` (`it("prefers x-forwarded-for (first entry)")` expecting `"1.1.1.1"` from `"1.1.1.1, 2.2.2.2"`), so the fix must change that test.

**Exploit.** Send a random `X-Forwarded-For` per request and every request lands in a fresh bucket. This defeats the limiter on **every** rate-limited endpoint, including the auth gate at `src/app/api/auth/precheck/route.ts:19-21` (login 8/min, forgot-password 3/5min, both IP-only). It also nullifies whatever protection the E35 captcha fix adds against automation, and it enables the enumeration oracle in 5.4 at scale. This single line is the highest-leverage fix in E36.

The same derivation is duplicated in three more places, two of which matter:
- `src/app/api/terms/accept/route.ts:21` stores it as the **terms-of-service acceptance audit IP**, so that legal record is forgeable;
- `src/lib/analytics.ts:60-61` feeds `generateVisitorId`, so unique-visitor metrics are forgeable;
- `src/app/api/auth/verify-turnstile/route.ts:51-52` prefers `cf-connecting-ip` first, which is correct, and only falls back to XFF.

**Exact fix.** Trust only a header the platform sets and the client cannot forge, and never fall back to a client-supplied one.

```ts
/**
 * Client IP for rate limiting. Only platform-set headers are trusted.
 * X-Forwarded-For is deliberately NOT read: proxies append rather than
 * overwrite, so the left-most entry is attacker-controlled (E36).
 */
export function getIP(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  return "unknown";
}
```

`x-vercel-forwarded-for` is set by Vercel's edge and overwritten on every inbound request, unlike XFF. **UNCONFIRMED which of Cloudflare or Vercel actually fronts production**; confirm before choosing the order, and if it is Cloudflare, `cf-connecting-ip` alone is correct and the Vercel branch should be dropped.

Two follow-ons: export a shared `getClientIp` and switch `terms/accept:21` and `analytics.ts:60` to it, and make `"unknown"` its own bucket with a much tighter limit, since after this change `"unknown"` means "we could not identify the caller".

**Test to add.** Update `rate-limit.test.ts:17-20` to assert the opposite of what it asserts now, with a comment explaining the reversal. Add: `X-Forwarded-For` alone yields `"unknown"`; `cf-connecting-ip` wins over a spoofed XFF; two requests with different spoofed XFF values but the same `cf-connecting-ip` share a bucket (this is the actual regression test).

**Breakage risk.** Medium and environment-dependent. If neither trusted header is present in production, every caller collapses into the single `"unknown"` bucket and legitimate traffic gets 429s at scale. Verify the header exists in the deployed environment before merging. A safe rollout is to log the resolved header for one release, confirm it is populated, then switch the key.

### 5.4 User enumeration

**Confirmed locations.** All three routes return a distinct 409 with a specific message when the email is already present, against a 200 otherwise.

`src/app/api/apply/route.ts:127-133` versus `:230`:

```ts
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "An application with this email already exists" },
          { status: 409 }
        );
```

`src/app/api/waitlist/route.ts:31-37` versus `:57`: `"This email is already on the waitlist"`.
`src/app/api/register-venue/route.ts:45-51` versus `:109`: `"A registration with this email already exists"`.

**Mechanism.** A unique-constraint violation is mapped straight to a user-visible distinct status and message on an unauthenticated endpoint, protected only by the spoofable IP key of 5.3.

**Exploit.** Enumerate which addresses have applied as artists, joined the waitlist, or registered a venue. Combined with 5.3 the oracle is effectively unlimited. There is also a **timing side channel** that survives naive fixes: the success path awaits `sendEmail` (`apply:216-228`, `waitlist:45-55`, `register-venue:96-107`) while the 409 path returns immediately, so response latency separates the two cases even with identical status codes.

The codebase already has the right pattern, `src/app/api/newsletter/route.ts:35-41`:

```ts
  // Unique-constraint violation = already subscribed. Treat as success so we
  // don't leak membership status to enumeration attacks, but surface a
  // friendly message.
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: true, alreadySubscribed: true });
```

Note it still leaks through the `alreadySubscribed` body flag despite the 200, so the comment overclaims. Fix newsletter too while in the area.

**Exact fix.** For each of the three routes, return the identical success body on duplicate:

```ts
    if (error) {
      if (error.code === "23505") {
        // Duplicate email. Return the same shape as a fresh submission so
        // the endpoint is not an account-existence oracle (E36).
        return NextResponse.json({ success: true });
      }
```

The user-facing consequence is that a genuine repeat submitter sees the success screen, which is the correct trade for a public form. If the product wants them told, tell them **by email** to the address in question, which only reaches someone who controls it.

Close the timing channel at the same time. Either move the send off the request path (enqueue and return immediately, so both branches are equally fast), or `await` a matching no-op delay on the duplicate branch. Enqueuing is the better answer and may already be feasible; check whether `sendEmail` has a fire-and-forget mode before adding artificial latency.

Drop the `alreadySubscribed` flag from `newsletter:41`.

**Test to add.** Per route: two identical `POST`s return byte-identical status and body. A `23505` from the database does not produce a 409. Newsletter's response body is identical for a new and an existing subscriber. If the timing fix is the delay variant, assert both branches await the same helper (a unit-level assertion, not a wall-clock one, which would be flaky).

**Breakage risk.** Low to medium. Any client asserting on the 409 breaks. Grep the three form components for `409` and `already exists` before merging, and update the copy so a duplicate submitter sees the success state rather than an error that will never arrive. Also check whether ops relies on the 409 for support triage; if so, the signal moves to a server log line, which is where it belonged anyway.

---

## 6. Ordered task checklist

Order matters. Section 1.4 must precede section 2.2, and 3.1 must precede everything in E34.

### Phase 0. Facts that must be established before any code changes

- [ ] **0.1** Record the deployed `ADMIN_EMAILS` / `ADMIN_EMAIL` value, verbatim.
- [ ] **0.2** `SELECT to_regclass('public.admin_users');` and, if present, dump the rows. Resolves the **UNCONFIRMED** in 1.1 fact 3.
- [ ] **0.3** For every intended admin, record whether `raw_user_meta_data->>'user_type' = 'admin'`.
- [ ] **0.4** `SELECT is_nullable FROM information_schema.columns WHERE table_name='venue_profiles' AND column_name='user_id';` Resolves 3.2 and decides whether E34 is live or latent.
- [ ] **0.5** If nullable, count existing orphans: `SELECT count(*) FROM venue_profiles WHERE user_id IS NULL;` This sizes the fix-5 support workload.
- [ ] **0.6** Confirm which edge fronts production (Cloudflare or Vercel) and which trusted IP header is actually present. Resolves the **UNCONFIRMED** in 5.3.
- [ ] **0.7** Confirm `UPSTASH_REDIS_REST_URL` / `_TOKEN` and `TURNSTILE_SECRET_KEY` are set in every production and preview environment.
- [ ] **0.8** Confirm whether Supabase's own captcha and auth rate limits are enabled on the project (dashboard, not repo). Resolves the **UNCONFIRMED** in 4.1 and 4.2.

### Phase 1. Admin authorisation (blocks phase 2)

- [ ] **1.1** Migration `0NN_admin_users.sql` creating the table idempotently (1.4 step 1).
- [ ] **1.2** `scripts/backfill-admin-users.ts`, run it, assert row count equals allowlist length (1.4 step 2).
- [ ] **1.3** Rewrite `userIsAdmin` to drop the metadata conjunct; update the `getAdminUser` 503 guard to "no admin source configured"; add the cached `adminUsersTableExists` probe (1.3).
- [ ] **1.4** Update `src/lib/admin-auth.test.ts`: the "403s when metadata is not admin" case inverts, and add "grants access to an `admin_users` row when `ADMIN_EMAILS` is empty but the table exists".
- [ ] **1.5** Write `docs/adr/0008-admin-gate-server-facts-only.md`; mark ADR 0001 Superseded and correct its line 51 claim explicitly.
- [ ] **1.6** Decline the launch-prep metadata stamp, recording why in the ADR. If the admin nav is instead keyed off `whoami` (task 2.2), no stamp is needed at all. Only if 2.2 slips should the merge-not-replace stamp of 1.4 step 4 be run as a stopgap.

### Phase 2. Admin surface and audit

- [ ] **2.1** Add `GET /api/admin/whoami` (2.2).
- [ ] **2.2** Add `src/components/AdminGate.tsx`; wire it into `src/app/(pages)/admin/layout.tsx`; key the admin nav off its response rather than `userType`.
- [ ] **2.3** Add `withAdmin` to `src/lib/admin-auth.ts` (2.1).
- [ ] **2.4** Convert G1, `api/admin/applications/[id]` `PUT`, to `withAdmin`. Single commit, existing `route.test.ts` green either side, no behaviour change.
- [ ] **2.5** Convert G2 (`admin/curation` `PATCH`) and G4 (`admin/refresh-stats` `POST`).
- [ ] **2.6** Add the explicit `recordAdminAction` call to G3, `api/refunds/process`, inside the admin branch.
- [ ] **2.7** Decide G5 (audit admin reads, or document the exception). Note `admin/financials` already audits a read.
- [ ] **2.8** Add the two invariant tests: every mutating admin route audits; every admin route checks admin auth.
- [ ] **2.9** Record Stage 2 (`@supabase/ssr` plus real middleware) as a separate follow-up issue. Do not attempt it here.

### Phase 3. E34, gated on task 0.4

- [ ] **3.1** Delete the slug adoption branch, `venue-profile/route.ts:97-116`.
- [ ] **3.2** Stop using `metaSlug` as the insert base (`:139`).
- [ ] **3.3** Derive `venueSlug` server-side in `register-venue:70-72`; surface the seed failure instead of only logging it.
- [ ] **3.4** Require `email_confirmed_at` for email adoption; refuse when more than one orphan matches.
- [ ] **3.5** Add the admin "link venue to user" control for orphans, audited. **Required in the same release as 3.1 if task 0.4 says nullable.**
- [ ] **3.6** Tests per 3.4.
- [ ] **3.7** Check `api/artist-profile` for an analogous `artist_slug` adoption path (**UNCONFIRMED** in 3.1) and fix it the same way if found.

### Phase 4. E36 quick wins, independent of the above

- [ ] **4.1** `demo/login` uses `safeRedirect` (5.2). Smallest, highest ratio; ship first.
- [ ] **4.2** Rewrite `getIP` to trusted headers only; invert `rate-limit.test.ts:17-20`; log the resolved header for one release before switching the key (5.3).
- [ ] **4.3** Switch `terms/accept:21` and `analytics.ts:60` to the shared helper.
- [ ] **4.4** Generic 200 on duplicate for `apply`, `waitlist`, `register-venue`; drop `alreadySubscribed` from `newsletter` (5.4).
- [ ] **4.5** Close the enumeration timing channel; prefer enqueuing the email over an artificial delay.
- [ ] **4.6** Update the three form components so a duplicate submitter sees the success state.

### Phase 5. E35, largest blast radius, ship last

- [ ] **5.1** Add `SIGNUP_ROLES` / `isSignupRole` to `src/lib/auth-roles.ts` (4.3).
- [ ] **5.2** `oauth-sign-state:19` uses `isSignupRole`.
- [ ] **5.3** `oauth-finalize:47` performs a real check; delete the dead local `ALLOWED_ROLES` at `:25-26`.
- [ ] **5.4** Decide the trigger-versus-stamp conflict (4.3, item 4). Recommendation: skip the stamp, key the nav off `whoami`, then the trigger is unconditional and simple.
- [ ] **5.5** Turnstile receipt: sign it in `verify-turnstile`, verify it in `apply` / `waitlist` / `register-venue`. Deploy accepting both, confirm receipts arrive, then make it mandatory.
- [ ] **5.6** `verify-turnstile` fails closed in production when the secret is unset.
- [ ] **5.7** Rate limiter refuses to start in production without Upstash; consider gating behind `RATE_LIMIT_REQUIRE_REDIS=1` for one release.
- [ ] **5.8** Rewrite the `auth/precheck` header comment so it is not mistaken for brute-force protection.
- [ ] **5.9** Tests per 4.1, 4.2 and 4.3.

### Phase 6. Close out

- [ ] **6.1** Full `npm test` green.
- [ ] **6.2** Re-run the exploit reproductions for E34, E35d, E36b and E36d against a preview deployment and confirm each now fails.
- [ ] **6.3** Confirm a real admin can still reach `/admin` and every admin API, from a clean session, before production deploy.
