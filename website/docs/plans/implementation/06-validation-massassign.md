# 06: Validation and mass-assignment remediation (E44, E45, E46, E16)

Status: ready to execute
Scope: `website/src`
Findings re-derived from source on 2026-07-29. Every location below was read and
confirmed; nothing here is inferred from the lost write-ups.

---

## 0. Summary

| ID | Finding | Verdict | Severity |
|----|---------|---------|----------|
| E44 | `PUT /api/artist-profile` mass-assignment: self-approve + self-grant Pro | **CONFIRMED** | Critical |
| E45 | `PUT`/`PATCH /api/venue-profile` mass-assignment: `user_id` / `slug` writable, zero validation | **CONFIRMED** | High |
| E46a | Negative / absurd prices | **PARTIALLY CONFIRMED** (artist shipping is guarded; work `pricing[]`, `in_store_price`, `quantity_available` are not) | Medium |
| E46b | ToS-acceptance forgery | **CONFIRMED** (route requires no auth) | Medium |
| E46c | "Free frames": frame uplift trusted from the client | **CONFIRMED** (acknowledged in a source comment) | High |
| E46d | Private artwork-request response injection | **CONFIRMED**, plus two unauthenticated read endpoints that make it trivially exploitable | High |
| E16 | Subscription gating flag-disabled | **REFUTED as written.** Enforcement is genuinely server-side in six places. One real defect remains, on the client mirror. | Low (was Critical) |

Three findings emerged that were not in the surviving titles and are at least as
serious as the ones that were:

| ID | Finding | Severity |
|----|---------|----------|
| E44-b | The same artist-profile hole also writes the Stripe Connect columns, so it controls payout routing and bypasses KYC | Critical |
| E46e | `GET /api/artwork-requests/[id]` and `.../responses` have no auth at all: any anonymous caller reads private requests, invite lists, budgets and every rival bid | High |
| E46f | `POST /api/orders` has no auth at all and inserts orders with `status: "confirmed"` | High |

Scale of the mass-assignment problem, from a full sweep of all 119 API route
files: **two files spread a request body into a DB write**, across three methods
(`artist-profile` PUT, `venue-profile` PUT and PATCH). Everything else builds its
payload from named fields. The blast radius is narrow, and both files are on the
critical path for account privilege.

---

## 1. E44: `PUT /api/artist-profile` mass-assignment

### 1.1 Confirmed location

`website/src/app/api/artist-profile/route.ts:42`

```ts
// Geocode postcode if provided, store lat/lng
const updatePayload: Record<string, unknown> = { ...body };
```

`website/src/app/api/artist-profile/route.ts:102`

```ts
const { error } = await upsertArtistProfile(auth.user!.id, updatePayload);
```

`website/src/lib/db/artist-profiles.ts:110-115`

```ts
if (existing) {
  const { error } = await db
    .from("artist_profiles")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return { error };
}
```

`website/src/lib/db/artist-profiles.ts:100`. The `db` here is
`getSupabaseAdmin()`, the **service-role** client, so Postgres RLS is bypassed
entirely. The only access control on the write is the `.eq("user_id", userId)`
row filter. Column-level authorisation does not exist.

The TypeScript signature `data: Partial<Omit<DbArtistProfile, "id" | "user_id">>`
at `artist-profiles.ts:101` looks like a guard but is not one: `updatePayload` is
typed `Record<string, unknown>`, which is assignable to it, and TypeScript types
are erased at runtime regardless.

### 1.2 Mechanism

The route parses the JSON body and spreads it wholesale into the update. Three
fields are given special treatment on the way through, which is exactly what
makes the hole easy to miss on review:

- `postcode` is format-validated (line 45) and `lat`/`lng` are overwritten server-side (57-58).
- `default_shipping_price` and `international_shipping_price` are checked for `>= 0` (65-82).
- `profile_theme` / `label_theme` are stripped for non-Premium artists (88-100).

Every other column in `artist_profiles` passes through untouched. The
`profile_theme` block is the tell: the author reasoned about one paid-tier field
and wrote `// The body-side allow-anything stays, the server is the authority on
what gets persisted` (line 86-87). The body-side allow-anything is the bug.

Note also that the theme gate reads `subscription_plan` from the DB **before**
the update lands, so a single request that sets `subscription_plan: "pro"` and a
theme is still stripped, but the *next* request keeps the theme. Two requests
defeat it.

### 1.3 Exact exploit

Any authenticated user with an existing artist profile. One request:

```http
PUT /api/artist-profile HTTP/1.1
Host: wallplace.co.uk
Authorization: Bearer <the attacker's own valid Supabase access token>
Content-Type: application/json

{
  "review_status": "approved",
  "approved_at": "2026-07-29T00:00:00.000Z",
  "subscription_plan": "pro",
  "subscription_status": "active",
  "is_founding_artist": true
}
```

Response: `200 {"success":true}`.

Privilege gained, field by field:

| Field set | Effect | Enforcement point defeated |
|---|---|---|
| `review_status: "approved"` | Profile goes live on `/browse` without admin review | `getAllDatabaseArtists` filters `.eq("review_status", "approved")` (`artist-profiles.ts:69`); `placements/route.ts:394` and `placements/venues/route.ts:35` block pending artists from placing |
| `subscription_status: "active"` | `isSubscribed()` returns `active: true` | `subscriptions.ts:102`, `ACTIVE_STATUSES` at line 33. This is the single source of truth for every GATING_V1 gate |
| `subscription_plan: "pro"` | Work cap 8 → 50, image cap 3 → 10, Premium themes, Premium analytics, outreach cap 2/day → 10/day | `artist-works/route.ts:65-67`, `:135-137`; `analytics/artist/route.ts:182`; `outreach-cap.ts` |
| `is_founding_artist: true` | Stripe trial 30 days → 180 days | `subscribe/route.ts:79`: `const trialDays = hadPreviousSub ? 0 : profile.is_founding_artist ? 180 : 30;` |

The `subscription_*` pair is the sharp end. `webhooks/stripe/route.ts:720-721`,
`:908`, `:952` and `:1045` are the **only** legitimate writers of those two
columns anywhere in the codebase (verified by grep across `src/app/api`). E44
hands an unauthenticated-of-payment user the webhook's write privilege.

Verification that these columns exist: `DbArtistProfile` at
`website/src/lib/db/artist-profiles-transform.ts:43` (`is_founding_artist`),
`:53` (`subscription_plan`), `:56` (`subscription_status`), `:61`
(`review_status`), `:62` (`approved_at`).

### 1.4 E44-b: the same hole also controls payout routing (NEW, not in the titles)

`artist_profiles` carries the Stripe Connect columns, and they are the payout
destination:

`website/src/app/api/placements/[id]/payment/setup/route.ts:87-88`

```ts
transfer_data: artistProfile?.stripe_connect_account_id
  ? { destination: artistProfile.stripe_connect_account_id }
```

`website/src/lib/stripe-connect-status.ts:16-20`

```ts
.select("stripe_connect_account_id, stripe_charges_enabled, stripe_charges_checked_at")
...
if (!profile?.stripe_connect_account_id) return false;
```

So this body also works, and bypasses Stripe KYC:

```json
{
  "stripe_connect_account_id": "acct_1AttackerControlled",
  "stripe_charges_enabled": true,
  "stripe_connect_onboarding_complete": true,
  "stripe_charges_checked_at": "2099-01-01T00:00:00.000Z"
}
```

`canArtistAcceptOrders()` then returns true without Stripe ever having verified
the account, and `checkout/route.ts:280-296` (the pre-flight that refuses to mint
a session for a non-`charges_enabled` artist) is defeated. The attacker cannot
reach another artist's row, because `.eq("user_id", userId)` still scopes the
update, so this is escalation of one's own account rather than theft from a
peer. It is still a money-movement control surface reachable from an ordinary
profile-edit endpoint.

All five columns are confirmed against the migrations:
`stripe_connect_account_id` and `stripe_connect_onboarding_complete` in
`website/supabase/migrations/004_pre_launch_features.sql`,
`stripe_charges_enabled` and `stripe_charges_checked_at` in
`045_artist_charges_cache.sql`, `free_until` in `001_analytics_events.sql`. They
are simply absent from the `DbArtistProfile` interface, which is incomplete.

### 1.5 The fix

`website/src/app/api/artist-profile/route.ts`, replace line 42:

```ts
// Before
const updatePayload: Record<string, unknown> = { ...body };

// After
import { pickWritable, ARTIST_PROFILE_WRITABLE } from "@/lib/db/writable-fields";
import { artistProfileUpdateSchema } from "@/lib/validations";

const parsed = artistProfileUpdateSchema.safeParse(body);
if (!parsed.success) {
  const first = parsed.error.issues[0];
  return NextResponse.json(
    {
      error: "validation_failed",
      message: `${first?.path.join(".") || "input"}: ${first?.message || "invalid"}`,
    },
    { status: 400 },
  );
}
const updatePayload = pickWritable(parsed.data, ARTIST_PROFILE_WRITABLE);
```

Everything downstream (postcode, shipping-price, theme blocks) keeps working
unchanged, because those keys are all in the allowlist. `lat`/`lng` continue to
be assigned server-side after the pick, which is correct: they are server-owned
and must not be in the allowlist.

Defence in depth, `website/src/lib/db/artist-profiles.ts:110-115`. Make the
helper itself refuse server-owned keys, so a future route cannot reintroduce the
bug:

```ts
import { assertNoServerOwned, ARTIST_PROFILE_SERVER_OWNED } from "./writable-fields";

if (existing) {
  assertNoServerOwned(data, ARTIST_PROFILE_SERVER_OWNED, "artist_profiles");
  const { error } = await db
    .from("artist_profiles")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return { error };
}
```

The insert branch (`:124-129`) keeps its explicit `review_status` handling: that
path is used by the admin claim flow, which legitimately sets it. Route
`POST /api/artist-profile:139` already hardcodes `"pending"` and is fine.

### 1.6 Negative test

New file `website/src/app/api/artist-profile/route.test.ts`:

```ts
it("strips server-owned columns from a PUT body (E44)", async () => {
  authMock.mockResolvedValue({ user: { id: "u-artist" }, error: null });
  upsertMock.mockResolvedValue({ error: null });

  const res = await PUT(req({
    short_bio: "legit edit",
    review_status: "approved",
    subscription_plan: "pro",
    subscription_status: "active",
    is_founding_artist: true,
    stripe_connect_account_id: "acct_evil",
    user_id: "someone-else",
    slug: "stolen-slug",
    total_sales: 9999,
  }));

  expect(res.status).toBe(200);
  const payload = upsertMock.mock.calls[0][1];
  expect(payload.short_bio).toBe("legit edit");
  for (const k of [
    "review_status", "subscription_plan", "subscription_status",
    "is_founding_artist", "stripe_connect_account_id", "user_id",
    "slug", "total_sales",
  ]) {
    expect(payload).not.toHaveProperty(k);
  }
});
```

Add a second test asserting the two-request theme bypass is closed: PUT
`{subscription_plan:"pro"}` then PUT `{profile_theme:"midnight"}` and assert the
theme is still stripped, because the plan never changed.

---

## 2. E45: `PUT`/`PATCH /api/venue-profile` mass-assignment

### 2.1 Confirmed location

`website/src/app/api/venue-profile/route.ts:23-24` (PUT)

```ts
const body = await request.json();
const { error } = await upsertVenueProfile(auth.user!.id, body);
```

`website/src/app/api/venue-profile/route.ts:58` (PATCH, same helper)

```ts
const { error } = await upsertVenueProfile(auth.user!.id, body);
```

`website/src/lib/db/venue-profiles.ts:55-58`

```ts
let { error } = await db
  .from("venue_profiles")
  .update({ ...data, updated_at: new Date().toISOString() })
  .eq("user_id", userId);
```

Again `getSupabaseAdmin()` (line 47), so service-role, no RLS.

### 2.2 Mechanism

Worse than E44: the body reaches the DB with **no** transformation at all. Not a
single field is validated, coerced, capped or stripped. There is no postcode
check, no length cap, no numeric guard.

Note the asymmetry between the two branches of `upsertVenueProfile`. The insert
branch at `:91-93` writes `{ ...safeData, user_id: userId }`, so the explicit
`user_id` wins and an injected one is harmlessly overwritten. The **update**
branch at `:55-58` writes `{ ...data, updated_at }` with no such override, so an
injected `user_id` lands. This is the E45 core.

### 2.3 Exact exploit

**(a) Detach the row from its owner.**

```http
PUT /api/venue-profile HTTP/1.1
Authorization: Bearer <attacker's valid token>
Content-Type: application/json

{"user_id": "00000000-0000-0000-0000-000000000000"}
```

The update matches on the caller's `user_id`, then rewrites it. The venue row is
now owned by a user id the attacker chose. Two outcomes, both bad:

- If the id is a real user, that user's `getVenueProfileByUserId` now returns the
  attacker's row, and `ensureVenueProfile` step 1 (`route.ts:88-95`) reports
  `already_linked` against it. The victim's portal is repointed.
- If the id is nonexistent, the attacker's own row is orphaned, and
  `ensureVenueProfile` step 4 mints them a *second* venue profile. Repeat to
  create unbounded venue profiles from one account, each with a distinct slug,
  each an independent listing on the marketplace.

**(b) Slug takeover / impersonation.**

```json
{"slug": "the-national-gallery", "name": "The National Gallery"}
```

`slug` is the public URL key (`getVenueProfileBySlug`, `venue-profiles.ts:33-38`)
and the join key used by `placements`, `artwork_requests.venue_slug` and QR
routing. Nothing checks uniqueness on this path or that the caller earned the
slug. A unique index would turn the collision into a 500 rather than a takeover,
which is why the outcome here needs confirming against the migrations, but the
absence of any application-level check is confirmed.

**(c) Subscription self-grant, same as E44.** `venue_profiles` carries
`subscription_status` and `subscription_plan` (confirmed by
`subscriptions.ts:108-120`, `readVenueSubscription`, which selects both). They are
absent from the `DbVenueProfile` interface, so the interface is incomplete:

```json
{"subscription_status": "active", "subscription_plan": "pro"}
```

**(d) Unbounded writes.** `{"description": "<5 MB of text>"}` is accepted.

### 2.4 The fix

`website/src/app/api/venue-profile/route.ts`, both PUT (`:23-24`) and the
general-update branch of PATCH (`:57-58`):

```ts
const parsed = venueProfileUpdateSchema.safeParse(body);
if (!parsed.success) { /* same 400 shape as artist-profile */ }
const updatePayload = pickWritable(parsed.data, VENUE_PROFILE_WRITABLE);
const { error } = await upsertVenueProfile(auth.user!.id, updatePayload);
```

And close the asymmetry in `website/src/lib/db/venue-profiles.ts:55-58` so the
update branch matches the insert branch:

```ts
let { error } = await db
  .from("venue_profiles")
  .update({ ...data, user_id: userId, updated_at: new Date().toISOString() })
  .eq("user_id", userId);
```

Plus `assertNoServerOwned(data, VENUE_PROFILE_SERVER_OWNED, "venue_profiles")` at
the top of the function.

The `ensureVenueProfile` self-heal path (`route.ts:79-166`) needs no change: it
takes nothing from the body except the `ensureProfile` / `adoptIfOrphan` boolean
and builds every written value from `user.user_metadata` server-side.

### 2.5 Negative test

```ts
it("rejects user_id and slug in a venue PUT body (E45)", async () => {
  const res = await PUT(req({
    name: "Copper Kettle",
    user_id: "victim-user-id",
    slug: "the-national-gallery",
    subscription_status: "active",
    subscription_plan: "pro",
  }));
  const payload = upsertVenueMock.mock.calls[0][1];
  expect(payload.name).toBe("Copper Kettle");
  expect(payload).not.toHaveProperty("user_id");
  expect(payload).not.toHaveProperty("slug");
  expect(payload).not.toHaveProperty("subscription_status");
  expect(payload).not.toHaveProperty("subscription_plan");
});

it("PATCH general-update path is allowlisted too", /* same assertions via PATCH */);

it("upsertVenueProfile pins user_id on the update branch", async () => {
  await upsertVenueProfile("owner-id", { user_id: "attacker" } as never);
  expect(updateSpy.mock.calls[0][0].user_id).toBe("owner-id");
});
```

---

## 3. E46: Other validation gaps

### 3.1 E46a: Prices accepting negative or absurd values

**Partially confirmed. The specific claim needs narrowing.**

Already guarded, contrary to the title:

- `artist-profile/route.ts:65-82` rejects negative `default_shipping_price` and
  `international_shipping_price` with `invalid_shipping_price`.
- `artist-works/route.ts:109` floors frame uplift: `Math.max(0, Math.round(f.priceUplift * 100) / 100)`.
- `artist-works/route.ts:125` skips negative `pricesBySize` entries.
- `validations.ts:184-185` caps `shippingPrice` at `z.number().min(0).max(1000)`.
- `validations.ts:182` requires `price: z.number().positive().max(100000)` on checkout lines.

**Genuinely unguarded**. `POST /api/artist-works` destructures at line 36 and
passes straight through at `:163-181` with no numeric validation:

| Field | Line | Current handling | Risk |
|---|---|---|---|
| `pricing` (array of `{label, price}`) | `route.ts:169` `pricing: pricing \|\| []` | none: no array cap, no per-entry price check | negative or absurd tier prices; unbounded array size |
| `in_store_price` | `:176` `in_store_price: inStorePrice ?? null` | none | negative in-store price |
| `quantity_available` | `:177` typeof-number only | no `>= 0` | negative stock; `checkout/route.ts:133` treats `<= 0` as sold, so a negative value reads as permanently sold |
| `shipping_price` | `:175` `shippingPrice ?? null` | none at write time | negative per-work shipping (the checkout schema caps it, but the *stored* value feeds `calculateOrderShipping`) |
| `sort_order` | `:174` `sortOrder ?? 0` | none | cosmetic |

`pricing` is the important one: `checkout/route.ts:214-219` recomputes
`unit_amount` from `row.pricing`, so a negative or zero DB tier price feeds
directly into Stripe. It is guarded there by `dbTier.price > 0`, which means a
negative tier falls back to the *client* price rather than charging a negative
amount, so this is a correctness and trust problem rather than direct theft. Fix
it at the write boundary regardless.

Fix: add `artistWorkInputSchema` (section 5.2) and parse in
`artist-works/route.ts` before the gating checks.

### 3.2 E46b: ToS-acceptance forgery

**Confirmed.** `website/src/app/api/terms/accept/route.ts:5-25`

```ts
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userEmail, userType, termsVersion, termsType } = body;
    ...
    // Try to get authenticated user, but allow unauthenticated with email
    const { user } = await getAuthenticatedUser(request);
```

Line 18 destructures only `user` and deliberately discards the `error` that
`getAuthenticatedUser` returns for a missing or invalid token
(`api-auth.ts:12-17`). The route then inserts with `user_id: user?.id || null`
and `user_email: userEmail`, both taken from an unauthenticated request.

Exploit, no credentials of any kind:

```http
POST /api/terms/accept HTTP/1.1
Content-Type: application/json

{
  "userEmail": "victim@example.com",
  "userType": "artist",
  "termsVersion": "2026-01-01",
  "termsType": "artist_terms"
}
```

Response `200 {"success":true}`. A row now exists in `terms_acceptances`
asserting that `victim@example.com` accepted the artist terms, stamped with the
attacker's IP and user agent. This table is the evidence trail for a contractual
acceptance, so the damage is twofold: forged acceptance against a third party,
and repudiation cover for a real user ("that row could have been anyone"). It is
also an unauthenticated unbounded-insert endpoint, so it is a storage-exhaustion
vector.

Fix. Require auth and derive the email server-side:

```ts
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const parsed = termsAcceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) { /* 400 */ }

  const { error } = await getSupabaseAdmin().from("terms_acceptances").insert({
    user_id: auth.user!.id,
    user_email: auth.user!.email,          // server-derived, never from the body
    user_type: parsed.data.userType,
    terms_version: parsed.data.termsVersion,
    terms_type: parsed.data.termsType,
    ip_address: ip,
    user_agent: userAgent,
    accepted_at: new Date().toISOString(),
  });
```

**Before shipping this, check the callers.** The comment at line 17 says
unauthenticated acceptance is intentional, which suggests a pre-signup
acceptance step. Grep for `/api/terms/accept` in `src/app` and `src/components`.
If a genuine pre-auth caller exists, split the route: authenticated acceptance
takes the email from the token, and pre-signup acceptance is bound to a
short-lived signed token issued by the signup flow, using the existing
`oauth-state.ts` HMAC helper as the model. Do not leave a free-text email field
on an unauthenticated insert.

Negative test:

```ts
it("rejects an unauthenticated terms acceptance (E46b)", async () => {
  authMock.mockResolvedValue({ user: null, error: unauthorised() });
  const res = await POST(req({ userEmail: "victim@example.com", userType: "artist", ... }));
  expect(res.status).toBe(401);
  expect(insertMock).not.toHaveBeenCalled();
});

it("ignores a body-supplied userEmail and uses the token's email", async () => {
  authMock.mockResolvedValue({ user: { id: "u1", email: "real@x.com" }, error: null });
  await POST(req({ userEmail: "victim@example.com", ... }));
  expect(insertMock.mock.calls[0][0].user_email).toBe("real@x.com");
});
```

### 3.3 E46c, "Free frames": frame uplift trusted from the client

**Confirmed, and acknowledged in the source.**
`website/src/app/api/checkout/route.ts:165-169`

```ts
// Residual risk: the frame UPLIFT itself remains fully client-trusted
// for resolvable lines — a buyer can obtain the frame at or below cost
// (down to the bare base price). Fully closing this gap requires
// server-side uplift resolution (either carrying frame identity on the
// cart line or resolving the uplift from a server-held price table).
```

Mechanism. Framed cart lines carry `size: "<base> + <frame label>"`, which never
matches a DB pricing tier (tiers are bare base sizes). So:

- The floor check (`:181-209`) parses the base size, finds the base tier, and
  rejects only if `item.price < dbBaseTier.price` (`:199`).
- The line-item builder (`:211-248`) finds no matching `dbTier`, so
  `unitPence` keeps its initial value from `:213`:
  `let unitPence = Math.round(item.price * 100);`, the **client's** price.

The floor is the bare unframed price. The uplift above it is whatever the client
says it is, including zero.

Exact exploit. Work `w_123`, DB tier `A3 = £100`, artist's oak frame uplift
`£85`. Legitimate total £185. Attacker posts:

```http
POST /api/checkout HTTP/1.1
Authorization: Bearer <valid buyer token>
Content-Type: application/json

{
  "fulfilmentMethod": "ship",
  "items": [{
    "title": "Harbour Light",
    "artistName": "Maya Chen",
    "artistSlug": "maya-chen",
    "size": "A3 + Oak Frame",
    "price": 100,
    "quantity": 1,
    "framed": true,
    "type": "work",
    "workId": "w_123"
  }],
  "shipping": { "fullName": "A B", "email": "a@b.com", "phone": "07000000000",
                "addressLine1": "1 Test St", "city": "London",
                "postcode": "SW1A 1AA", "country": "United Kingdom" }
}
```

`checkoutItemSchema` passes (`price: 100` is positive). The floor check passes
(`100 >= 100`). Stripe is charged £100 for a £185 framed piece. The frame is
free. `console.warn("[checkout] framed line uses client price", ...)` (`:240`)
fires, so the exploit is at least observable in logs.

Fix. Recompute the uplift server-side. `frame_options` is already persisted per
work as `{label, priceUplift, pricesBySize?}` (`artist-works/route.ts:88-132`),
so the data needed is on the row already; only the cart line lacks frame
identity.

1. Add `frameLabel: optionalString(80)` to `checkoutItemSchema` in
   `validations.ts` and have the cart send it.
2. In `checkout/route.ts`, for any line where `isFramedLine`, resolve the price
   entirely server-side:

```ts
const baseTier = row.pricing.find(p => p?.label?.toLowerCase?.() === baseSize.toLowerCase());
if (!baseTier || typeof baseTier.price !== "number" || baseTier.price <= 0) {
  return unresolvableFramed(item.workId);
}
const frameLabel = item.frameLabel ?? (typeof item.size === "string" ? item.size.split(" + ")[1] : "");
const frame = (row.frame_options ?? []).find(
  f => f.label.toLowerCase() === (frameLabel ?? "").trim().toLowerCase(),
);
if (!frame) return unresolvableFramed(item.workId);
const uplift = frame.pricesBySize?.[baseTier.label] ?? frame.priceUplift;
serverPence.set(item.workId, Math.round((baseTier.price + uplift) * 100));
```

3. In the `lineItems` map, use `serverPence` when present and never fall back to
   `item.price` for a framed line.

This removes the `price_below_base` special case: the server computes the whole
number, so a mismatch is a warn log and a corrected charge, matching how
unframed lines already behave at `:220-226`.

Legacy carts without `frameLabel` still resolve via the `" + "` split, so no
migration window is needed. A framed line whose label matches no `frame_options`
entry now 409s instead of silently charging the client's number.

Negative test (extend `checkout/route.test.ts`, which already has a
`framed line` describe block at line 717):

```ts
it("charges base + server-side uplift, ignoring the client price (E46c)", async () => {
  mockWorkRow({ pricing: [{ label: "A3", price: 100 }],
                frame_options: [{ label: "Oak Frame", priceUplift: 85 }] });
  await POST(req({ items: [{ ...line, size: "A3 + Oak Frame", framed: true, price: 100 }] }));
  expect(stripeCreate.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(18500);
});

it("409s a framed line whose frame label is not on the work", async () => { ... });
```

### 3.4 E46d: Private artwork-request response injection

**Confirmed.** `website/src/app/api/artwork-requests/[id]/responses/route.ts:107-113`

```ts
// Verify the request exists + is open.
const { data: req } = await db
  .from("artwork_requests")
  .select("id, venue_user_id, status, title")
  .eq("id", id)
  .maybeSingle();
if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
if (req.status !== "open") return NextResponse.json({ error: "Request is closed" }, { status: 409 });
```

The select does not fetch `visibility` or `invited_artist_slugs`, and nothing
below checks them. The only gates on POST are: valid token (`:67`), has an
artist profile (`:87-97`), under the daily outreach cap (`:101`), request is
open. Membership of the invite list is never consulted.

That both columns exist and are the intended gate is confirmed by the sibling
list route, which *does* enforce them:
`website/src/app/api/artwork-requests/route.ts:130-137`

```ts
if (invitedSlugs.length > 0) {
  query = query.or(
    `visibility.eq.semi_public,and(visibility.eq.private,invited_artist_slugs.cs.{${invitedSlugs[0]}})`,
  );
} else {
  query = query.eq("visibility", "semi_public");
}
```

and by the create schema at `:39-40`
(`visibility: z.enum(["semi_public", "private"])`, `invitedArtistSlugs`).

### 3.5 E46e: the two unauthenticated reads that make E46d trivial (NEW)

The list route carefully redacts for anonymous callers
(`artwork-requests/route.ts:201-209`, omitting `venue_user_id`,
`invited_artist_slugs`, `budget_min_pence`, `budget_max_pence`). Two sibling
endpoints undo that entirely.

**(i) `GET /api/artwork-requests/[id]` has no auth at all.**
`website/src/app/api/artwork-requests/[id]/route.ts:33-65`

```ts
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const { data: req } = await db
    .from("artwork_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
```

No `getAuthenticatedUser`, no visibility filter, `select("*")` on the
service-role client, and it also returns every response row (`:57-61`). Any
anonymous caller who knows an id gets the full private request including the
invite list, the budget, and the venue's user id, plus every competing artist's
response and proposed price.

**(ii) `GET /api/artwork-requests/[id]/responses` has no auth either.**
`responses/route.ts:54-64` is a bare `select("*")` by `request_id`.

Ids are generated as `arq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
(`artwork-requests/route.ts:246`). The `Date.now()` half is guessable to within a
narrow window; the random half is roughly 36^6 (about 2.2 billion), so this is
not casually brute-forceable, but ids leak through the semi-public list, through
notification links (`/venue-portal/artwork-requests/${id}`), and through any
artist who was legitimately invited to one request and wants to read another.
Treat the ids as public knowledge, because they are shared in URLs.

Chained exploit: read a private request via (i), then POST a response to it via
E46d, and the venue receives a bid from an artist it never invited, plus the
attacker has read every rival bid via (ii) first.

### 3.6 The fix for E46d and E46e

Add one shared helper, `website/src/lib/artwork-request-access.ts`:

```ts
export type RequestVisibility = "public" | "semi_public" | "private";

export function canArtistSeeRequest(
  req: { visibility?: string | null; invited_artist_slugs?: string[] | null; venue_user_id: string },
  viewer: { userId: string | null; artistSlug: string | null },
): boolean {
  if (viewer.userId && viewer.userId === req.venue_user_id) return true;   // owner
  const vis = (req.visibility ?? "semi_public") as RequestVisibility;
  if (vis === "private") {
    return !!viewer.artistSlug && (req.invited_artist_slugs ?? []).includes(viewer.artistSlug);
  }
  return !!viewer.userId;   // semi_public and legacy public: signed-in artists only
}
```

Then:

- `responses/route.ts` POST: widen the select at `:109` to
  `"id, venue_user_id, status, title, visibility, invited_artist_slugs"` and,
  after the artist lookup at `:87-97`, return 403 `not_invited` when
  `canArtistSeeRequest` is false. Do this **before** `checkArtistOutreachCap`
  so a rejected attempt does not burn the artist's daily quota.
- `responses/route.ts` GET (`:54`): require auth, load the parent request, and
  allow only the venue owner or an artist who has themselves responded. An
  invited artist should not be able to read rivals' bids either.
- `[id]/route.ts` GET (`:33`): require auth, apply `canArtistSeeRequest`, and
  return the responses array only to the venue owner. Return 404 rather than 403
  for a request the viewer cannot see, so the endpoint does not confirm that a
  given private id exists.

Negative tests:

```ts
it("403s an uninvited artist responding to a private request (E46d)", async () => {
  mockRequest({ visibility: "private", invited_artist_slugs: ["someone-else"], status: "open" });
  mockArtist({ slug: "attacker" });
  const res = await POST(req({ responseType: "message", message: "hi" }), ctx("arq_1"));
  expect(res.status).toBe(403);
  expect(insertMock).not.toHaveBeenCalled();
  expect(outreachCapMock).not.toHaveBeenCalled();   // quota not burned
});

it("allows an invited artist", async () => { /* invited_artist_slugs: ["attacker"] → 200 */ });
it("allows any signed-in artist on a semi_public request", async () => { /* → 200 */ });
it("404s an anonymous GET of a private request (E46e-i)", async () => { ... });
it("401s an anonymous GET of the responses list (E46e-ii)", async () => { ... });
```

### 3.7 E46f: `POST /api/orders` is completely unauthenticated (NEW)

Found during the route sweep, not in the surviving titles. Verified by reading
the full function.

`website/src/app/api/orders/route.ts:329-348`

```ts
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, items, shipping, subtotal, shippingCost, total, buyerEmail } = body;

    if (!id || !items || !shipping || subtotal == null || total == null || !buyerEmail) {
      return NextResponse.json({ error: "Missing order data" }, { status: 400 });
    }

    const { error } = await getSupabaseAdmin().from("orders").insert({
      id,
      buyer_email: buyerEmail,
      items,
      shipping,
      subtotal,
      shipping_cost: shippingCost,
      total,
      status: "confirmed",
      created_at: new Date().toISOString(),
    });
```

There is no `getAuthenticatedUser` call anywhere in the function. The write uses
the service-role client. `status` is hardcoded to `"confirmed"`. `items` and
`shipping` are opaque JSONB taken verbatim from the body with no schema.

Exploit, no credentials:

```http
POST /api/orders HTTP/1.1
Content-Type: application/json

{
  "id": "ord_forged_001",
  "buyerEmail": "anything@example.com",
  "items": [{"title":"Harbour Light","artistSlug":"maya-chen","price":1200,"quantity":1}],
  "shipping": {"fullName":"A B","addressLine1":"1 Test St"},
  "subtotal": 1200,
  "shippingCost": 0,
  "total": 1200
}
```

An order marked confirmed now exists with no payment behind it. Impact:

- Fabricated sales in artist and venue portals, analytics, and admin financials.
- Unauthenticated unbounded JSONB insert, so a storage and cost exhaustion vector.
- `id` is attacker-chosen. A pre-registered id makes a later legitimate order
  with the same id fail on the primary-key collision.

The chain to actual money is **blocked**, and it is worth being precise about
that: payouts run off `stripe_transfers` rows, which only the Stripe webhook
creates (`lib/stripe-connect.ts:35-48`), and `PATCH /api/orders` refuses a caller
who is not the order's artist or venue (`orders/route.ts:158`, 403 `Not
authorised`). So this is fabrication and pollution, not theft.

Fix: **delete the handler.** It has no caller. Every reference to
`"/api/orders"` in `src/app` is a GET, except `artist-portal/orders/page.tsx:84`
which is the PATCH. Real orders are created by the Stripe webhook
(`webhooks/stripe/route.ts:348`) and by the offer path (`:136`). This is dead
code from before the webhook existed.

If it must be kept, require auth, validate the body with a zod schema, derive
`buyer_email` from the token, generate `id` server-side, and set `status` from a
verified payment intent rather than a literal.

Negative test:

```ts
it("rejects an unauthenticated order creation (E46f)", async () => {
  const res = await POST(new Request("http://localhost/api/orders", {
    method: "POST",
    body: JSON.stringify({ id: "ord_forged", buyerEmail: "x@y.com", items: [],
                           shipping: {}, subtotal: 1, total: 1 }),
  }));
  expect(res.status).toBe(401);
  expect(insertMock).not.toHaveBeenCalled();
});
```

If the handler is deleted instead, assert that `POST` is no longer exported.

---

## 4. E16: Subscription gating

### 4.1 Verdict: refuted as written, with one real defect remaining

The title says paid tiers are unenforced because the flag is off. The flag
default is indeed off in production (`feature-flags.ts:78-86`, `prodDefault:
false`), but the owner has since set `NEXT_PUBLIC_FLAG_GATING_V1=1`. The question
that matters is whether enforcement is server-side. **It is.**

### 4.2 What GATING_V1 enforces, and where

Every call site, from `grep -rn "GATING_V1" src/`:

| # | Location | Enforcement | Server-side? |
|---|---|---|---|
| 1 | `src/app/api/artist-works/route.ts:48-60` | 402 `subscription_required` when a non-subscribed artist sets `available: true` | **Yes**, route handler |
| 2 | `src/app/api/artist-works/route.ts:156-158` | new works default to `available: sub.active` | **Yes**, route handler |
| 3 | `src/app/api/placements/route.ts:322` | non-subscribed artists cannot create a placement request | **Yes**, route handler |
| 4 | `src/app/api/placements/route.ts:807` | non-subscribed artists cannot accept or counter | **Yes**, route handler |
| 5 | `src/app/api/messages/route.ts:341` | 403 on artist-to-artist first contact | **Yes**, route handler |
| 6 | `src/lib/db/merged-data.ts:35` | non-subscribed artists filtered from `/browse` | **Yes**, server module |
| 7 | `src/app/api/me/subscription/route.ts:22` | reports `gatingEnabled` to the client | read-only mirror |
| 8 | `src/lib/use-subscription.ts` | client hook, consumes #7 | UI only |

All six enforcement points call `isSubscribed()` from `src/lib/subscriptions.ts`,
which reads `subscription_status` from the DB with the service-role client
(`subscriptions.ts:83-91`, `:112-120`). Nothing trusts a client-supplied plan.
So a direct API call with a forged plan does not bypass the gate.

Note the dependency: **E44 defeats all six of these**, because it lets the
attacker write the very column `isSubscribed()` reads. Gating is server-side and
correct; E44 makes it moot. Fixing E44 is what makes E16's enforcement real.

Two tier limits are enforced *outside* the flag and therefore apply
unconditionally: work count (`artist-works/route.ts:62-82`) and image count
(`:134-142`). Both read `result.profile.subscription_plan` from the DB. Also
E44-writable.

### 4.3 The one real defect: the client mirror never sees the env var

`feature-flags.ts:98-104`

```ts
function readBoolEnv(key: string): boolean | null {
  const raw = process.env[key];
```

This is a **dynamic** property access with a computed key. Next.js inlines
`NEXT_PUBLIC_*` variables into client bundles via webpack `DefinePlugin`, which
only substitutes statically-written member expressions such as
`process.env.NEXT_PUBLIC_FLAG_GATING_V1`. It cannot substitute `process.env[key]`.
In the browser `process.env` is an empty shim, so `raw` is `undefined`,
`readBoolEnv` returns `null`, and `isFlagOn` falls through to the NODE_ENV
default at `:119-120`, namely `prodDefault: false`. Any client component calling
`isFlagOn("GATING_V1")` directly therefore believes gating is off in production
even though the env var is set.

Impact is UX, not security: the server still enforces. The visible symptom is
upgrade prompts and paywall affordances failing to render, so users hit a 402
with no explanation of why.

Mitigating factor: the codebase mostly routes around this already.
`useSubscription()` reads `gatingEnabled` over HTTP from
`/api/me/subscription:22`, where `isFlagOn` runs server-side and works correctly.
Only a client component importing `isFlagOn` directly is affected.

`feature-flags.test.ts` cannot catch this: every test runs in Node under Vitest,
where `process.env[key]` works fine.

Fix:

```ts
// Static reads so Next's DefinePlugin can inline them into the client bundle.
// process.env[dynamicKey] is NOT substituted at build time and resolves to
// undefined in the browser.
const CLIENT_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1: process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1,
  NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE: process.env.NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE,
  NEXT_PUBLIC_FLAG_PAID_LOAN_V2: process.env.NEXT_PUBLIC_FLAG_PAID_LOAN_V2,
  NEXT_PUBLIC_FLAG_GATING_V1: process.env.NEXT_PUBLIC_FLAG_GATING_V1,
  NEXT_PUBLIC_FLAG_BLOGS_V1: process.env.NEXT_PUBLIC_FLAG_BLOGS_V1,
};

function readBoolEnv(key: string): boolean | null {
  const raw = CLIENT_ENV[key] ?? process.env[key];
  ...
}
```

Verify before and after with:

```
grep -rl "NEXT_PUBLIC_FLAG_GATING_V1" .next/static/chunks/ | head
```

Empty before the fix, non-empty after. Also add an ESLint guard so a new flag
added to `FLAGS` without a `CLIENT_ENV` entry fails CI, or generate `CLIENT_ENV`
from `FLAGS` keys at build time.

Also update the `GATING_V1` description at `feature-flags.ts:82-85`: it still
reads "Default off everywhere until the upgrade modal copy is locked", which no
longer matches production. Flip `prodDefault` to `true` so the code default and
production agree, and keep the env var as the kill switch, matching the pattern
`WALL_VISUALIZER_V1` already uses (`:50-56`).

### 4.4 Tests

```ts
it("GATING_V1 resolves from a statically-inlined key", () => {
  process.env.NEXT_PUBLIC_FLAG_GATING_V1 = "1";
  setNodeEnv("production");
  expect(isFlagOn("GATING_V1")).toBe(true);
});

it("every flag in FLAGS has a CLIENT_ENV entry", () => {
  for (const { flag } of listFlags()) {
    expect(Object.keys(CLIENT_ENV)).toContain(FLAGS[flag].envKey);
  }
});
```

---

## 5. The fix pattern

### 5.1 `website/src/lib/db/writable-fields.ts` (new, complete)

Column lists derived from `src/lib/db/artist-profiles-transform.ts`,
`src/lib/db/venue-profiles-transform.ts`, and the route-level reads and writes
cited above, and cross-checked against `website/supabase/migrations/` (numbered
001 to 073) plus the base DDL in the loose root files `website/supabase-migration.sql`,
`supabase-coordinates-migration.sql` and `supabase-subscriptions-migration.sql`.
Note that prod was bootstrapped from `supabase-all-migrations.sql` rather than
from `001`, per the comment in `050_notification_prefs.sql`, so verify against
prod rather than assuming the numbered sequence is complete.

Three columns are used in code but have **no migration anywhere in this repo**
and were applied out of band: `ships_internationally`,
`international_shipping_price` (both `artist_profiles`) and `in_store_price`
(`artist_works`). They are marked inline below. Confirm them against prod before
merging.

Being on the server-owned list is what matters for safety, so a column wrongly
placed there fails closed.

```ts
// Per-entity write allowlists.
//
// The rule: no route may spread a request body into a DB write. Every write
// payload is built by pickWritable() from one of the frozen sets below.
//
// Server-owned columns are set server-side or are immutable:
//   subscription_plan / subscription_status  → Stripe webhook ONLY
//                                              (api/webhooks/stripe/route.ts)
//   review_status / approved_at              → admin routes ONLY
//                                              (api/admin/applications/[id])
//   user_id / slug / artist_id / id          → never client-writable
//   total_*                                  → lib/stats-cache.ts ONLY
//   stripe_*                                 → Stripe onboarding + webhooks ONLY
//   lat / lng                                → derived server-side from postcode

/** Columns a signed-in artist may set on their own artist_profiles row. */
export const ARTIST_PROFILE_WRITABLE = Object.freeze([
  // Identity and presentation
  "name",
  "profile_image",
  "banner_image",
  "short_bio",
  "extended_bio",
  "location",
  "profile_color",
  // Taxonomy
  "primary_medium",
  "style_tags",
  "themes",
  "discipline",
  "sub_styles",
  // Links
  "instagram",
  "website",
  // Offering
  "offers_originals",
  "offers_prints",
  "offers_framed",
  "available_sizes",
  "open_to_commissions",
  "open_to_free_loan",
  "open_to_revenue_share",
  "revenue_share_percent",
  "open_to_outright_purchase",
  "offers_pickup",
  "can_provide_frames",
  "can_arrange_framing",
  // Logistics
  "delivery_radius",
  "venue_types_suited_for",
  "postcode",              // validated + upper-cased by the route; drives lat/lng
  "default_shipping_price",
  // WARNING: these two are read and written by the app
  // (artist-profiles-transform.ts:58-59, api/artist-profile/route.ts:67) but no
  // migration in this repo defines them, so they were applied out of band.
  // Confirm they exist in prod before relying on this allowlist.
  "ships_internationally",
  "international_shipping_price",
  // Notification preferences (001_analytics_events.sql, 050_notification_prefs.sql)
  "message_notifications_enabled",
  "email_digest_enabled",
  "order_notifications_enabled",
  // Tier-gated: in the allowlist, then stripped by the Premium check in
  // api/artist-profile/route.ts:88-100. Allowlisting alone is not the gate.
  "profile_theme",
  "label_theme",
] as const);

/**
 * Never accepted from a client on artist_profiles. Denial is what fails safe,
 * so when in doubt a column belongs on this list, not the one above.
 * Migration references are to website/supabase/migrations/ unless noted.
 */
export const ARTIST_PROFILE_SERVER_OWNED = Object.freeze([
  // Identity (supabase-migration.sql, base DDL)
  "id",
  "user_id",
  "slug",
  "created_at",
  "updated_at",
  // Derived server-side from postcode (supabase-coordinates-migration.sql)
  "lat",
  "lng",
  // Admin / moderation only (023_artist_profile_review_status.sql)
  "review_status",
  "approved_at",
  "reviewed_by",
  // Stripe webhook only (supabase-subscriptions-migration.sql)
  "subscription_plan",
  "subscription_status",
  "subscription_period_end",
  "trial_end",
  "stripe_customer_id",
  "stripe_subscription_id",
  // Stripe Connect onboarding + webhooks only (004, 045)
  "stripe_connect_account_id",
  "stripe_connect_onboarding_complete",
  "stripe_charges_enabled",
  "stripe_charges_checked_at",
  // Counters, maintained by lib/stats-cache.ts (001_analytics_events.sql)
  "total_views",
  "total_placements",
  "total_sales",
  "total_enquiries",
  // Billing / referral (001, 019)
  "free_until",
  "referral_code",           // unique, auto-generated
  "referred_by_code",        // write-once at signup, drives a payout
  "referral_credited_at",
  "signup_order",
  "is_founding_artist",
  // Lifecycle stamps (001, 037_welcomed_at.sql)
  "last_digest_sent_at",
  "welcomed_at",
] as const);

/** Columns a signed-in venue may set on their own venue_profiles row. */
export const VENUE_PROFILE_WRITABLE = Object.freeze([
  "name",
  "type",
  "location",
  "description",
  "image",
  "images",
  // Contact PII. Anon SELECT on these is revoked by migration 071
  // (see VENUE_PUBLIC_COLUMNS in lib/db/venue-profiles.ts:30).
  "contact_name",
  "email",
  "phone",
  "address_line1",
  "address_line2",
  "city",
  "postcode",
  // Space
  "wall_space",
  "approximate_footfall",
  "audience_type",
  // Arrangement interest
  "interested_in_free_loan",
  "interested_in_revenue_share",
  "interested_in_direct_purchase",
  "interested_in_collections",
  // Taste
  "preferred_styles",
  "preferred_themes",
  // Display needs (028)
  "display_wall_space",
  "display_lighting",
  "display_install_notes",
  "display_rotation_frequency",
  // Notification preferences (001, 050)
  "message_notifications_enabled",
  "email_digest_enabled",
] as const);
//
// Deliberately NOT on the list: `preferred_sizes` and
// `interested_in_local_artists`. venue-profiles.ts:64-65 strips them as
// "columns that may not exist in older schemas", but no migration in this repo
// defines them at all, so they do not exist in any schema. Leaving them out is
// what the strip logic was already achieving by accident. Once the allowlist
// lands, the whole strip-and-retry dance in upsertVenueProfile can be deleted.

/** Never accepted from a client on venue_profiles. */
export const VENUE_PROFILE_SERVER_OWNED = Object.freeze([
  "id",
  "user_id",
  "slug",
  "created_at",
  "updated_at",
  "welcomed_at",                           // 037_welcomed_at.sql
  // 064. Absent from the DbVenueProfile interface but confirmed present, both
  // by the migration and by lib/subscriptions.ts:112-120 which selects them.
  "subscription_plan",
  "subscription_status",
  "stripe_customer_id",
  "stripe_subscription_id",
  // 004_pre_launch_features.sql
  "stripe_connect_account_id",
  "stripe_connect_onboarding_complete",
] as const);
//
// venue_profiles has no lat/lng (the transform hardcodes London coordinates at
// venue-profiles-transform.ts:46), no review_status, and no total_* counters.

/**
 * Columns an artist may set on their own artist_works rows.
 * `id` is client-supplied by design (the portal generates it and upserts),
 * but the row is always scoped to the caller's artist_id server-side, so it
 * is handled by the route rather than listed here.
 */
export const ARTIST_WORK_WRITABLE = Object.freeze([
  "title",
  "medium",
  "dimensions",
  "price_band",
  "pricing",
  "available",            // gated by GATING_V1 in api/artist-works/route.ts:48-60
  "color",
  "image",
  "images",
  "orientation",
  "sort_order",
  "shipping_price",
  "in_store_price",
  "quantity_available",
  "frame_options",
  "description",
] as const);

export const ARTIST_WORK_SERVER_OWNED = Object.freeze([
  "artist_id",              // ownership key (base DDL)
  "created_at",
  "placed_at_venue",        // 038, denormalised by the placements PATCH handler
  "current_placement_id",   // 038, same
  "mockups",                // 035_visualizer_core.sql, written by the visualizer API
] as const);
//
// `in_store_price` is written at api/artist-works/route.ts:176 but no migration
// in this repo defines it; like the two artist_profiles shipping columns it was
// applied out of band. Confirm before merging.

export type WritableKeys<T extends readonly string[]> = T[number];

/**
 * Build a DB write payload containing only allowlisted keys.
 *
 * Keys absent from `body` are omitted entirely rather than written as
 * undefined, so a partial PATCH stays partial and never nulls a column the
 * caller did not mention.
 */
export function pickWritable<T extends readonly string[]>(
  body: unknown,
  allow: T,
): Partial<Record<WritableKeys<T>, unknown>> {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  const src = body as Record<string, unknown>;
  for (const key of allow) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = src[key];
    }
  }
  return out as Partial<Record<WritableKeys<T>, unknown>>;
}

/**
 * Defence in depth for the db helpers. Throws if a server-owned column
 * reached a write path, so a future route that forgets pickWritable fails
 * loudly in dev and CI instead of silently reintroducing E44.
 *
 * Throws rather than strips: a payload carrying these keys means a caller is
 * wrong, and silently dropping them would hide the bug.
 */
export function assertNoServerOwned(
  payload: Record<string, unknown>,
  serverOwned: readonly string[],
  table: string,
): void {
  const violations = serverOwned.filter((k) =>
    Object.prototype.hasOwnProperty.call(payload, k),
  );
  if (violations.length > 0) {
    throw new Error(
      `[writable-fields] Refusing to write server-owned column(s) on ${table}: ` +
        `${violations.join(", ")}. Build the payload with pickWritable().`,
    );
  }
}
```

### 5.2 Zod additions for `src/lib/validations.ts`

Matching the existing idioms in that file: `safeString(max)`, `optionalString(max)`,
`z.array(...).max(n)`, `z.number().min(0).max(n)`, `superRefine` for
cross-field rules.

```ts
// Shared numeric helpers. Money is in pounds on these surfaces (pence is used
// only on the artwork-request routes), so the caps are pound-denominated and
// match the £100k ceiling already used by checkoutItemSchema at line 182.
const price = (max = 100_000) => z.number().min(0).max(max);
const optionalPrice = (max = 100_000) => price(max).nullable().optional();
const dimensionCm = z.number().min(0).max(2000);   // 20 m, generous upper bound

// --- Artist profile (E44) ---------------------------------------------------
// Every key here is also on ARTIST_PROFILE_WRITABLE. Zod strips unknown keys
// by default, so parse + pickWritable is belt and braces: zod enforces shape,
// the allowlist enforces authority. Keep both, they fail in different ways.
export const artistProfileUpdateSchema = z.object({
  name: optionalString(120),
  profile_image: optionalString(2000),
  banner_image: optionalString(2000),
  short_bio: optionalString(500),
  extended_bio: optionalString(5000),
  location: optionalString(200),
  profile_color: optionalString(20),
  primary_medium: optionalString(100),
  style_tags: z.array(z.string().max(50)).max(20).optional(),
  themes: z.array(z.string().max(100)).max(20).optional(),
  discipline: z
    .enum(["photography", "painting", "digital", "drawing", "sketching", "sculpture", "mixed"])
    .nullable()
    .optional(),
  sub_styles: z.array(z.string().max(50)).max(20).nullable().optional(),
  instagram: optionalString(200),
  website: optionalString(500),
  offers_originals: z.boolean().optional(),
  offers_prints: z.boolean().optional(),
  offers_framed: z.boolean().optional(),
  available_sizes: z.array(z.string().max(50)).max(30).optional(),
  open_to_commissions: z.boolean().optional(),
  open_to_free_loan: z.boolean().optional(),
  open_to_revenue_share: z.boolean().optional(),
  revenue_share_percent: z.number().min(0).max(100).optional(),
  open_to_outright_purchase: z.boolean().optional(),
  offers_pickup: z.boolean().nullable().optional(),
  can_provide_frames: z.boolean().optional(),
  can_arrange_framing: z.boolean().optional(),
  delivery_radius: optionalString(100),
  venue_types_suited_for: z.array(z.string().max(100)).max(20).optional(),
  postcode: optionalString(20),
  default_shipping_price: optionalPrice(1000),
  ships_internationally: z.boolean().optional(),
  international_shipping_price: optionalPrice(1000),
  message_notifications_enabled: z.boolean().optional(),
  profile_theme: optionalString(50).nullable(),
  label_theme: optionalString(50).nullable(),
});

// --- Venue profile (E45) ----------------------------------------------------
export const venueProfileUpdateSchema = z
  .object({
    name: optionalString(200),
    type: optionalString(100),
    location: optionalString(200),
    description: optionalString(5000),
    image: optionalString(2000),
    images: z.array(z.string().max(2000)).max(12).optional(),
    contact_name: optionalString(100),
    email: z.string().trim().email().max(254).optional().or(z.literal("")),
    phone: optionalString(30),
    address_line1: optionalString(200),
    address_line2: optionalString(200),
    city: optionalString(100),
    postcode: optionalString(20),
    wall_space: optionalString(100),
    approximate_footfall: optionalString(50),
    audience_type: optionalString(100),
    interested_in_free_loan: z.boolean().optional(),
    interested_in_revenue_share: z.boolean().optional(),
    interested_in_direct_purchase: z.boolean().optional(),
    interested_in_collections: z.boolean().optional(),
    interested_in_local_artists: z.boolean().optional(),
    preferred_styles: z.array(z.string().max(100)).max(20).optional(),
    preferred_themes: z.array(z.string().max(100)).max(20).optional(),
    preferred_sizes: z.array(z.string().max(50)).max(20).optional(),
    display_wall_space: optionalString(500).nullable(),
    display_lighting: optionalString(500).nullable(),
    display_install_notes: optionalString(1000).nullable(),
    display_rotation_frequency: optionalString(100).nullable(),
    message_notifications_enabled: z.boolean().optional(),
  })
  // Reuse the country-aware refiner already defined at validations.ts:314.
  // Venues are UK-only today, so pin the country rather than reading it
  // from the body.
  .superRefine((data, ctx) => {
    if (typeof data.postcode === "string" && data.postcode.length > 0 &&
        !isValidPostcode(data.postcode, "United Kingdom")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postcode"],
        message: "Enter a valid UK postcode (e.g. SW1A 1AA).",
      });
    }
  });

// --- Artist works (E46a) ----------------------------------------------------
const sizePricingSchema = z.object({
  label: safeString(100),
  price: price(100_000),
});

export const artistWorkInputSchema = z.object({
  id: safeString(200),
  title: safeString(200),
  image: safeString(2000),
  medium: optionalString(100),
  dimensions: optionalString(200),
  priceBand: optionalString(100),
  // Cap the array so one work cannot carry hundreds of tiers, and floor
  // every price at 0 so checkout can never recompute from a negative tier.
  pricing: z.array(sizePricingSchema).max(30).optional(),
  available: z.boolean().optional(),
  color: optionalString(20),
  orientation: z.enum(["portrait", "landscape", "square"]).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  shippingPrice: optionalPrice(1000),
  inStorePrice: optionalPrice(100_000),
  quantityAvailable: z.number().int().min(0).max(10_000).nullable().optional(),
  description: optionalString(2000),
  images: z.array(z.string().max(2000)).max(10).optional(),
  frameOptions: z
    .array(
      z.object({
        label: safeString(80),
        priceUplift: price(10_000),
        imageUrl: optionalString(1000),
        pricesBySize: z.record(z.string().max(100), price(10_000)).optional(),
      }),
    )
    .max(20)
    .optional(),
});

// --- Terms acceptance (E46b) ------------------------------------------------
// No userEmail field: the email is taken from the auth token, never the body.
export const termsAcceptSchema = z.object({
  userType: z.enum(["artist", "venue", "customer"]),
  termsVersion: safeString(40),
  termsType: safeString(60),
});
```

Note on `artistWorkInputSchema`: the existing hand-rolled `frameOptions`
sanitiser at `artist-works/route.ts:88-132` becomes redundant once this lands.
Delete it in the same change rather than leaving two sources of truth, but keep
the `.slice(0, 20)` semantics by way of the `.max(20)` above.

---

## 6. Route write inventory

Every route under `website/src/app/api` that writes to the DB, with a verdict.

Verdict key:
- **allowlisted**: payload built from explicitly named fields, or from a zod
  `.parse()` result (zod strips unknown keys, so this is safe by construction).
- **spreads-body**: a request body reaches a DB write wholesale. Must be fixed.
- **needs-review**: writes are named, but an authorisation or validation
  question is open.
- **no-write**: read-only.

All 119 route files under `website/src/app/api` were read at their write sites.
**Exactly two files spread a request body into a DB write**, across three
methods. Every other writing route builds its payload from explicitly named
fields. No route in the codebase uses `.passthrough()` or `.catchall()` on a zod
schema, so every zod-parsed payload has unknown keys stripped by construction.

### 6.1 Must fix

| Route | Methods | Verdict | Evidence |
|---|---|---|---|
| `api/artist-profile/route.ts` | PUT | **spreads-body** | `:42` `const updatePayload: Record<string, unknown> = { ...body };` → `:102` `upsertArtistProfile(...)` → `lib/db/artist-profiles.ts:113` `.update({ ...data, updated_at })`. E44 |
| `api/venue-profile/route.ts` | PUT, PATCH | **spreads-body** | `:24` and `:58` `upsertVenueProfile(auth.user!.id, body)` → `lib/db/venue-profiles.ts:57` `.update({ ...data, updated_at })`. No schema, no allowlist. E45 |
| `api/orders/route.ts` | POST | **needs-review** (payload is named, but the route is unauthenticated) | `:329` no `getAuthenticatedUser`; `:338` service-role insert with `status: "confirmed"`. E46f |
| `api/terms/accept/route.ts` | POST | **needs-review** (payload is named, but auth is optional and `user_email` comes from the body) | `:18` `const { user } = await getAuthenticatedUser(request);` discards the error; `:27` `user_email: userEmail`. E46b |
| `api/artwork-requests/[id]/responses/route.ts` | POST | **needs-review** (payload is allowlisted; the authorisation check is missing) | `:109` select omits `visibility` / `invited_artist_slugs`. E46d |
| `api/artist-works/route.ts` | POST, DELETE | **needs-review** (payload is named; numeric fields unvalidated) | `:169` `pricing: pricing \|\| []`, `:176` `in_store_price`, `:177` `quantity_available`. E46a |
| `api/checkout/route.ts` | POST | **needs-review** (DB write is allowlisted; the Stripe amount is client-trusted for framed lines) | `:213` `let unitPence = Math.round(item.price * 100);`. E46c |

Two further authorisation observations surfaced by the sweep. Both are outside
this plan's scope but should be triaged separately:

- `api/account/email/unsubscribe/route.ts:50` upserts against a `userId` taken
  from an unauthenticated `?u=` query parameter. Intentional for one-click
  unsubscribe links, but the parameter should be a signed token.
- `lib/placements/paid-loan-billing.ts:111` selects `contact_email` from
  `venue_profiles`. No migration defines that column; the real one is `email`.
  Likely a silent always-null bug.

### 6.2 Allowlisted (no change needed)

Payload built from explicitly named fields, or from a zod `.parse()` result that
is then re-mapped by hand.

| Route | Writing methods |
|---|---|
| `api/account/delete` | POST |
| `api/account/email-preferences` | PATCH |
| `api/account/email/unsubscribe` | POST, GET |
| `api/account/preferences` | PATCH |
| `api/account` | DELETE |
| `api/admin/applications/[id]` | PUT |
| `api/admin/blogs/[id]` | PATCH |
| `api/admin/curation` | PATCH |
| `api/admin/disputes/[id]` | PATCH |
| `api/admin/financials` | GET (audit insert) |
| `api/admin/moderation` | GET (audit insert) |
| `api/admin/refresh-stats` | POST |
| `api/analytics/track` | POST |
| `api/apply` | POST |
| `api/artist-profile` | POST (`:131-140`, explicit fields) |
| `api/artwork-requests` | POST |
| `api/artwork-requests/[id]` | PATCH |
| `api/artwork-requests/[id]/fulfill` | POST |
| `api/artwork-requests/[id]/responses/[responseId]` | PATCH |
| `api/auth/oauth-finalize` | POST |
| `api/auth/welcome` | POST |
| `api/blogs` | POST |
| `api/blogs/[id]` | PATCH, DELETE |
| `api/collections` | POST, PATCH, DELETE |
| `api/contact` | POST |
| `api/cron/inactive-users` | GET |
| `api/cron/onboarding-nudges` | GET |
| `api/cron/order-delivery-followup` | GET |
| `api/cron/placement-ending-soon` | GET |
| `api/cron/placement-review-request` | GET |
| `api/cron/qr-scan-digest` | GET |
| `api/cron/weekly-artist-digest` | GET |
| `api/cron/weekly-venue-digest` | GET |
| `api/curation` | POST |
| `api/customer-addresses` | POST |
| `api/customer-addresses/[id]` | PATCH, DELETE |
| `api/enquiry` | POST |
| `api/feature-requests` | POST |
| `api/feature-requests/[id]/upvote` | POST |
| `api/messages` | POST, PATCH |
| `api/messages/[conversationId]` | PATCH, DELETE |
| `api/messages/block` | POST |
| `api/messages/item/[messageId]` | PATCH, DELETE |
| `api/messages/report` | POST |
| `api/moderation` | POST |
| `api/newsletter` | POST |
| `api/notifications` | PATCH |
| `api/offers` | POST |
| `api/offers/[id]` | PATCH |
| `api/orders` | PATCH (ownership-checked at `:158`) |
| `api/orders/[id]/events` | POST |
| `api/placements` | POST, PATCH, DELETE |
| `api/placements/[id]/photos` | POST, DELETE |
| `api/placements/[id]/record` | PUT |
| `api/placements/[id]/review` | POST |
| `api/qr/[slug]` | GET (scan analytics) |
| `api/refunds/process` | POST |
| `api/refunds/request` | POST |
| `api/register-venue` | POST |
| `api/saved` | POST, DELETE |
| `api/stripe-connect/onboard` | POST |
| `api/stripe-connect/process-pending` | GET, POST |
| `api/subscribe` | POST (writes `stripe_customer_id` only) |
| `api/venue-profile` | POST (`:181-190`), plus `ensureVenueProfile` |
| `api/waitlist` | POST |
| `api/walls` | POST |
| `api/walls/[id]` | PATCH, DELETE |
| `api/walls/[id]/layouts` | POST |
| `api/walls/[id]/layouts/[lid]` | PATCH, DELETE |
| `api/walls/[id]/layouts/[lid]/render` | POST |
| `api/walls/render-quick` | POST |
| `api/walls/upload-photo` | POST (object storage only) |
| `api/webhooks/stripe` | POST |
| `api/works/[id]/mockups` | POST, DELETE |

Two notes on the above. `api/apply:120` (`const safeRow = { ...fullRow }`),
`api/placements:494` (`{ ...row }`) and `webhooks/stripe:377` (`{ ...orderRow }`)
all spread an object, but in each case it is a **server-built** row being copied
for the missing-column retry path, not a request body. They are safe and should
not be "fixed".

`api/webhooks/stripe` deserves its verdict spelled out, since it is the only
legitimate writer of `subscription_plan` and `subscription_status`. The payload
is a Stripe event, signature-verified at `:49`. The plan is derived at `:711-714`
purely by comparing the Stripe `priceId` against `STRIPE_PRICE_*` env vars,
defaulting to `"core"`. It is not attacker-controllable without Stripe's signing
secret. `api/subscribe` reads those columns but never writes them.

### 6.3 No DB write

`account/export`, `account/roles`, `admin/applications`, `admin/artists`,
`admin/disputes`, `admin/stats`, `admin/venues`, `analytics/artist`,
`analytics/venue`, `artwork-requests/public`, `auth/oauth-sign-state`,
`auth/precheck`, `auth/verify-turnstile`, `blogs/mine`, `browse-artists`,
`browse-collections`, `checkout/session`, `collections/[id]`, `contracts/sign`,
`dashboard`, `demo/login`, `me/subscription`, `messages/unread`,
`offers/[id]/checkout`, `orders/track`, `placements/[id]`,
`placements/[id]/history`, `placements/[id]/payment/setup`, `placements/venues`,
`refunds`, `stats/public`, `stripe-connect/dashboard`, `stripe-connect/status`,
`subscribe/portal`, `venues/[slug]`, `venues/[slug]/profile`, `venues/demand`,
`walls/my-works`, `walls/quota`, `walls/saved-works`, `webhooks/supabase`.

Note that `artwork-requests/[id]` and `artwork-requests/[id]/responses` appear as
writers above for their PATCH and POST handlers; their **GET** handlers are the
unauthenticated reads covered by E46e.

---

## 7. Ordered task checklist

Each task is independently reviewable. Tasks 1 to 3 are the security-critical
path and should land first, in order.

### Phase A: the mass-assignment fix

- [ ] **A1.** Create `website/src/lib/db/writable-fields.ts` exactly as in §5.1.
      The lists are already reconciled against the migrations; the only open
      items are the three out-of-band columns, handled by A8.
- [ ] **A2.** Add `writable-fields.test.ts`: `pickWritable` drops non-allowlisted
      keys; omits absent keys rather than writing `undefined`; ignores
      prototype-chain keys (`{"__proto__": {...}}`, `constructor`); returns `{}`
      for `null`, arrays, and primitives. `assertNoServerOwned` throws with every
      violating column named.
- [ ] **A3.** Add `artistProfileUpdateSchema` and `venueProfileUpdateSchema` to
      `src/lib/validations.ts` (§5.2). Extend `validations.test.ts`.
- [ ] **A4. (E44)** Rewrite `PUT /api/artist-profile` to parse then
      `pickWritable`. Keep the postcode, shipping-price and theme blocks, which
      all operate on allowlisted keys. Add `route.test.ts` per §1.6.
- [ ] **A5. (E44)** Add `assertNoServerOwned` to `upsertArtistProfile`
      (`src/lib/db/artist-profiles.ts:110`). Keep the insert branch's explicit
      `review_status` handling for the admin claim flow.
- [ ] **A6. (E45)** Rewrite `PUT` and the general-update branch of `PATCH` on
      `/api/venue-profile` to parse then `pickWritable`. Leave
      `ensureVenueProfile` alone.
- [ ] **A7. (E45)** Pin `user_id: userId` on the update branch of
      `upsertVenueProfile` (`src/lib/db/venue-profiles.ts:57`) and add
      `assertNoServerOwned`. Add tests per §2.5.
- [ ] **A8.** Confirm the three out-of-band columns flagged in §5.1
      (`ships_internationally`, `international_shipping_price`,
      `in_store_price`) actually exist in production, and either add the missing
      migrations or remove the columns from the allowlists.

### Phase A2: the two unauthenticated write and read endpoints

- [ ] **A9. (E46f)** Delete the `POST` handler in `src/app/api/orders/route.ts`
      (`:329-359`). Confirm no caller first: every `"/api/orders"` reference in
      `src/app` is a GET except `artist-portal/orders/page.tsx:84`, which is the
      PATCH. Assert in a test that `POST` is no longer exported.
- [ ] **A10. (E46e)** Covered by B4 below, but it is an unauthenticated data
      leak rather than a validation gap, so ship it with Phase A if the phases
      are released separately.

### Phase B: the remaining validation gaps

- [ ] **B1. (E46b)** Require auth on `POST /api/terms/accept` and derive
      `user_email` from the token. **First** grep for callers to confirm no
      genuine pre-signup path exists; if one does, take the split-route option in
      §3.2. Tests per §3.2.
- [ ] **B2. (E46d)** Add `src/lib/artwork-request-access.ts` with
      `canArtistSeeRequest` plus unit tests for the owner, invited, uninvited and
      anonymous cases.
- [ ] **B3. (E46d)** Enforce it in `POST /api/artwork-requests/[id]/responses`,
      before the outreach-cap check so a rejected attempt does not burn quota.
- [ ] **B4. (E46e)** Require auth and apply `canArtistSeeRequest` on
      `GET /api/artwork-requests/[id]` and
      `GET /api/artwork-requests/[id]/responses`. Return 404, not 403, for
      unseeable private requests.
- [ ] **B5. (E46a)** Add `artistWorkInputSchema` to `POST /api/artist-works`,
      delete the now-redundant hand-rolled `frameOptions` sanitiser at
      `route.ts:88-132`, and use `ARTIST_WORK_WRITABLE`.
- [ ] **B6. (E46c)** Add `frameLabel` to `checkoutItemSchema`; send it from the
      cart. Recompute framed unit prices server-side in `checkout/route.ts` per
      §3.3. Update the comment at `:165-169`, which documents the old residual
      risk. Tests per §3.3.

### Phase C: gating and guardrails

- [ ] **C1. (E16)** Replace the dynamic `process.env[key]` read in
      `feature-flags.ts:99` with the static `CLIENT_ENV` map (§4.3). Verify with
      the `grep -rl` on `.next/static/chunks` before and after.
- [ ] **C2. (E16)** Set `GATING_V1.prodDefault: true` and rewrite its
      description to match production. Keep the env var as the kill switch.
- [ ] **C3.** Add an ESLint rule (or a unit test) that fails on a spread of an
      identifier named `body`, `payload` or `data` inside a `.insert(`,
      `.update(` or `.upsert(` call, mirroring the existing
      `no-raw-arrangement-type` rule raised to error in commit 356cd37.
- [ ] **C4.** Add a CI check that every entry in `FLAGS` has a `CLIENT_ENV` key.
- [ ] **C5.** Re-run the full suite and confirm the pre-existing gating tests in
      `artist-works/route.test.ts` and `messages/route.test.ts` still pass.

### Verification

- [ ] **V1.** `npm run test` green.
- [ ] **V2.** `npm run lint` and `npx tsc --noEmit` green.
- [ ] **V3.** Manually replay the §1.3 E44 body against a dev server and confirm
      a 200 whose stored row is unchanged on every server-owned column.
- [ ] **V4.** Manually replay the §3.3 E46c framed-line body and confirm Stripe
      receives `unit_amount: 18500`, not `10000`.
