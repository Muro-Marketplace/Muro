# 01: Authorisation and IDOR remediation

Status: ready to execute
Scope: `website/src/app/api/**`, plus two new modules under `website/src/lib/`
and one new ESLint rule under `website/eslint-rules/`.

## Why this plan exists

`getSupabaseAdmin()` returns a Supabase client built with the service-role
key. That client **bypasses every RLS policy**. 122 route files under
`src/app/api` import it (`grep -rl getSupabaseAdmin src/app/api | wc -l`
→ 122), so for those routes the database enforces nothing and every
ownership rule has to live in the route handler.

The findings below are what happens when that discipline is applied
route by route from memory. Twelve findings were re-derived from their
titles; all twelve are confirmed in the current source.

### Severity summary

| ID | Route | Confirmed | Class | Severity |
|----|-------|-----------|-------|----------|
| E32 | `POST /api/artist-works` (via `upsertWork`) | yes | write IDOR | critical |
| E33 | `POST /api/messages` (`placement_response`) | yes | missing authz + state | critical |
| E19 | `POST /api/orders` | yes | no auth at all | critical |
| E31 | `GET /api/messages/[conversationId]` | yes | read IDOR | critical |
| E21 | `PATCH /api/orders` | yes | self-attested escrow release | high |
| E20 | `PATCH /api/placements` | yes | missing state gate | high |
| E17 | `GET /api/artwork-requests/[id]` | yes | no auth, read leak | high |
| E18 | `GET /api/artwork-requests/[id]/responses` | yes | no auth, read leak | high |
| E39 | `GET /api/checkout/session` | yes | no auth, PII disclosure | high |
| E22 | `POST /api/artwork-requests/[id]/fulfill` | yes | no idempotency gate | medium-high |
| E23a | demo guard has zero call sites | yes | systemic dead control | medium |
| E23b | `status:"completed"` skips inventory restore | yes | state gap | medium |

Nothing in this list is "unconfirmed". Two secondary observations that
did **not** reproduce as vulnerabilities are recorded in
[Appendix A](#appendix-a-checked-and-clean) so nobody re-audits them.

---

## Part 1: The shared fix

Two new modules plus one lint rule. Everything in Part 2 depends on these,
so they land first.

### 1.1 `src/lib/authz.ts`

Design rules this module encodes:

1. **The ownership predicate goes in the same query that fetches the row.**
   A fetch-then-compare (`select().eq("id", id)`, then
   `if (row.owner !== me) return 403`) leaves the row in a local variable
   before the check runs. The failure mode of a dropped comparison is
   "serves someone else's data". With the `.eq()` in the query, the
   failure mode is "no rows", which surfaces as a 404 and gets noticed.
2. **Denial is 404 by default, not 403.** A 403 confirms the row exists,
   which is an enumeration oracle. `403` is passed explicitly only where
   the caller demonstrably already knows the resource exists (they lack a
   profile, or they hold the wrong role on a row they are party to).
3. **`.or()` is built through `orFilter()`** from `@/lib/db/safe-filter`,
   because `eslint-rules/no-raw-or-filter.js` is already `error` and
   because a raw interpolated `.or()` can inject filter terms.

```ts
// src/lib/authz.ts
//
// Central authorisation helpers for service-role API routes.
//
// Context: 122 route files under src/app/api call getSupabaseAdmin(),
// which uses the service-role key and therefore BYPASSES every RLS
// policy. Row ownership has to be enforced in application code on each
// of those routes. These helpers are the single place that happens.
//
// Two rules they exist to enforce:
//
//   1. The ownership predicate goes in the SAME query that fetches the
//      row. A fetch-then-compare leaves a window where a later refactor
//      drops the comparison and nothing fails loudly. With the .eq() in
//      the query, a non-owner gets zero rows, so a forgotten check reads
//      as "no data", not "someone else's data".
//
//   2. Denial is 404 by default, not 403. A 403 confirms the row exists,
//      which is an enumeration oracle. Pass status 403 only where the
//      caller already knows the row exists.
//
// Call style: these THROW AuthzError. Any route handler that wraps its
// body in try/catch MUST call handleAuthzError(err) as the first
// statement of the catch and return its result when non-null, otherwise
// the 404 is swallowed by the generic 400. See section 1.3 of
// docs/plans/implementation/01-authz-idor.md.

import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { orFilter } from "@/lib/db/safe-filter";

/**
 * Minimal shape of an authenticated caller. Structurally compatible with
 * the Supabase `User` that getAuthenticatedUser() returns, so call sites
 * can pass `auth.user!` directly.
 */
export interface Actor {
  id: string;
  email?: string | null;
}

export type AuthzStatus = 403 | 404;

export class AuthzError extends Error {
  readonly status: AuthzStatus;
  readonly code: string;

  constructor(status: AuthzStatus, code: string, message: string) {
    super(message);
    this.name = "AuthzError";
    this.status = status;
    this.code = code;
    // Keeps `instanceof` working when the class is transpiled.
    Object.setPrototypeOf(this, AuthzError.prototype);
  }

  toResponse(): NextResponse {
    return NextResponse.json(
      { error: this.code, message: this.message },
      { status: this.status },
    );
  }
}

function deny(code: string, message: string, status: AuthzStatus = 404): never {
  throw new AuthzError(status, code, message);
}

/**
 * Returns the AuthzError's response, or null when `err` is anything else.
 * Use as the FIRST statement of every catch block in a route that calls
 * an assert*() helper:
 *
 *   } catch (err) {
 *     const denied = handleAuthzError(err);
 *     if (denied) return denied;
 *     return NextResponse.json({ error: "Invalid request" }, { status: 400 });
 *   }
 */
export function handleAuthzError(err: unknown): NextResponse | null {
  return err instanceof AuthzError ? err.toResponse() : null;
}

/** Wrap a whole handler body. For routes with no try/catch of their own. */
export async function withAuthz(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    const denied = handleAuthzError(err);
    if (denied) return denied;
    throw err;
  }
}

// Email charset safe to interpolate into a PostgREST .or() term. Mirrors
// the emailSafe guard already used in /api/orders GET. orFilter() drops
// unsafe terms anyway; we test first so we can decide whether the
// buyer-email branch exists at all rather than silently narrowing.
const SAFE_EMAIL = /^[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+$/;

// ─── Artist profile ──────────────────────────────────────────────────

export interface ArtistProfileRef {
  id: string;
  slug: string;
  user_id: string;
  review_status: string | null;
}

export async function assertOwnsArtistProfile(
  actor: Actor,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<ArtistProfileRef> {
  const { data } = await db
    .from("artist_profiles")
    .select("id, slug, user_id, review_status")
    .eq("user_id", actor.id)
    .maybeSingle<ArtistProfileRef>();
  if (!data) {
    deny("artist_profile_required", "You need an artist profile to do that.", 403);
  }
  return data;
}

/**
 * Artist profile plus an approved-review gate. Use on any route that
 * commits the artist to something a venue or a buyer will see or pay for.
 * review_status is one of pending | approved | rejected (migration 023),
 * so this correctly rejects 'rejected' as well as 'pending'.
 */
export async function assertApprovedArtist(
  actor: Actor,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<ArtistProfileRef> {
  const profile = await assertOwnsArtistProfile(actor, db);
  if (profile.review_status !== "approved") {
    deny(
      "artist_review_pending",
      "Your application is still under review. You can do this once we've approved your profile.",
      403,
    );
  }
  return profile;
}

// ─── Artworks ────────────────────────────────────────────────────────

export interface WorkRef {
  id: string;
  artist_id: string;
  title: string | null;
}

export async function assertOwnsWork(
  actor: Actor,
  workId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<WorkRef> {
  const profile = await assertOwnsArtistProfile(actor, db);
  const { data } = await db
    .from("artist_works")
    .select("id, artist_id, title")
    .eq("id", workId)
    .eq("artist_id", profile.id) // ownership in the SAME query
    .maybeSingle<WorkRef>();
  if (!data) {
    deny("work_not_found", "That artwork isn't in your portfolio.");
  }
  return data;
}

// ─── Conversations ───────────────────────────────────────────────────

export interface ConversationRef {
  conversationId: string;
  /** Every profile slug the actor owns (artist and/or venue). */
  slugs: string[];
}

async function actorSlugs(actorId: string, db: SupabaseClient): Promise<string[]> {
  const [artist, venue] = await Promise.all([
    db.from("artist_profiles").select("slug").eq("user_id", actorId)
      .maybeSingle<{ slug: string | null }>(),
    db.from("venue_profiles").select("slug").eq("user_id", actorId)
      .maybeSingle<{ slug: string | null }>(),
  ]);
  return [artist.data?.slug, venue.data?.slug].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
}

/**
 * Conversation ids are deterministic (`dm-${slugA}__${slugB}`, sorted),
 * so they are guessable from two public profile slugs. Participation has
 * to be proved against the message rows, never assumed from the id.
 */
export async function assertConversationParticipant(
  actor: Actor,
  conversationId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<ConversationRef> {
  if (!conversationId || conversationId.length > 200) {
    deny("conversation_not_found", "Conversation not found.");
  }

  const slugs = await actorSlugs(actor.id, db);

  // Modern rows carry sender_id / recipient_user_id.
  const byId = await db
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .or(orFilter([
      `sender_id.eq.${actor.id}`,
      `recipient_user_id.eq.${actor.id}`,
    ]))
    .limit(1);
  if (byId.data && byId.data.length > 0) return { conversationId, slugs };

  // Legacy rows predate recipient_user_id and only carry slugs.
  if (slugs.length > 0) {
    const bySlug = await db
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .or(orFilter([
        ...slugs.map((s) => `sender_name.eq.${s}`),
        ...slugs.map((s) => `recipient_slug.eq.${s}`),
      ]))
      .limit(1);
    if (bySlug.data && bySlug.data.length > 0) return { conversationId, slugs };
  }

  deny("conversation_not_found", "Conversation not found.");
}

// ─── Placements ──────────────────────────────────────────────────────

export type PlacementRole = "artist" | "venue";

export interface PlacementRef {
  id: string;
  artist_user_id: string | null;
  venue_user_id: string | null;
  artist_slug: string | null;
  venue_slug: string | null;
  venue: string | null;
  status: string | null;
  requester_user_id: string | null;
  role: PlacementRole;
}

export async function assertPlacementParty(
  actor: Actor,
  placementId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<PlacementRef> {
  const { data } = await db
    .from("placements")
    .select(
      "id, artist_user_id, venue_user_id, artist_slug, venue_slug, venue, status, requester_user_id",
    )
    .eq("id", placementId)
    .or(orFilter([
      `artist_user_id.eq.${actor.id}`,
      `venue_user_id.eq.${actor.id}`,
    ]))
    .maybeSingle<Omit<PlacementRef, "role">>();
  if (!data) deny("placement_not_found", "Placement not found.");
  const role: PlacementRole =
    data.artist_user_id === actor.id ? "artist" : "venue";
  return { ...data, role };
}

// ─── Orders ──────────────────────────────────────────────────────────

export type OrderRole = "seller" | "buyer";

export interface OrderRef {
  id: string;
  status: string | null;
  artist_user_id: string | null;
  artist_slug: string | null;
  buyer_user_id: string | null;
  buyer_email: string | null;
  venue_slug: string | null;
  /** Everything else on the row (items, shipping, status_history, ...). */
  [key: string]: unknown;
}

export async function assertOrderParty(
  actor: Actor,
  orderId: string,
  opts: { as?: OrderRole | "any" } = {},
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<OrderRef & { role: OrderRole }> {
  const as = opts.as ?? "any";
  const terms: string[] = [];
  let mySlug: string | null = null;

  if (as === "seller" || as === "any") {
    terms.push(`artist_user_id.eq.${actor.id}`);
    // Legacy orders have artist_user_id NULL but artist_slug populated.
    const { data: profile } = await db
      .from("artist_profiles")
      .select("slug")
      .eq("user_id", actor.id)
      .maybeSingle<{ slug: string | null }>();
    mySlug = profile?.slug ?? null;
    if (mySlug) terms.push(`artist_slug.eq.${mySlug}`);
  }
  if (as === "buyer" || as === "any") {
    terms.push(`buyer_user_id.eq.${actor.id}`);
    const email = actor.email ?? "";
    if (SAFE_EMAIL.test(email)) terms.push(`buyer_email.eq.${email}`);
  }

  const { data } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .or(orFilter(terms))
    .maybeSingle<OrderRef>();
  if (!data) deny("order_not_found", "Order not found.");

  const isSeller =
    data.artist_user_id === actor.id ||
    (!!mySlug && data.artist_slug === mySlug);
  return { ...data, role: isSeller ? "seller" : "buyer" };
}

// ─── Venues ──────────────────────────────────────────────────────────

export interface VenueProfileRef {
  id: string;
  slug: string;
  user_id: string;
  name: string | null;
}

export async function assertVenueOwner(
  actor: Actor,
  opts: { venueSlug?: string } = {},
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<VenueProfileRef> {
  let query = db
    .from("venue_profiles")
    .select("id, slug, user_id, name")
    .eq("user_id", actor.id);
  if (opts.venueSlug) query = query.eq("slug", opts.venueSlug);

  const { data } = await query.maybeSingle<VenueProfileRef>();
  if (!data) {
    if (opts.venueSlug) deny("venue_not_found", "Venue not found.");
    deny("venue_profile_required", "You need a venue profile to do that.", 403);
  }
  return data;
}

// ─── Artwork requests ────────────────────────────────────────────────

export interface ArtworkRequestRef {
  id: string;
  venue_user_id: string;
  status: string | null;
  visibility: string | null;
  title: string | null;
  invited_artist_slugs: string[] | null;
  [key: string]: unknown;
}

export async function assertArtworkRequestOwner(
  actor: Actor,
  requestId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<ArtworkRequestRef> {
  const { data } = await db
    .from("artwork_requests")
    .select("*")
    .eq("id", requestId)
    .eq("venue_user_id", actor.id) // ownership in the SAME query
    .maybeSingle<ArtworkRequestRef>();
  if (!data) deny("artwork_request_not_found", "Artwork request not found.");
  return data;
}

export type ArtworkRequestViewerRole =
  | "owner"
  | "invited_artist"
  | "browsing_artist";

/**
 * Read-side counterpart of assertArtworkRequestOwner. Mirrors the
 * visibility rules the list endpoint already applies (GET
 * /api/artwork-requests): semi_public is visible to any approved artist,
 * private only to artists named in invited_artist_slugs. Migration 047
 * dropped the 'public' value, so those are the only two states.
 */
export async function assertCanViewArtworkRequest(
  actor: Actor,
  requestId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<{ request: ArtworkRequestRef; role: ArtworkRequestViewerRole }> {
  const owned = await db
    .from("artwork_requests")
    .select("*")
    .eq("id", requestId)
    .eq("venue_user_id", actor.id)
    .maybeSingle<ArtworkRequestRef>();
  if (owned.data) return { request: owned.data, role: "owner" };

  const { data: profile } = await db
    .from("artist_profiles")
    .select("slug, review_status")
    .eq("user_id", actor.id)
    .maybeSingle<{ slug: string | null; review_status: string | null }>();
  const slug =
    profile?.review_status === "approved" ? profile.slug ?? null : null;
  if (!slug) deny("artwork_request_not_found", "Artwork request not found.");

  const semi = await db
    .from("artwork_requests")
    .select("*")
    .eq("id", requestId)
    .eq("visibility", "semi_public")
    .maybeSingle<ArtworkRequestRef>();
  if (semi.data) return { request: semi.data, role: "browsing_artist" };

  const invited = await db
    .from("artwork_requests")
    .select("*")
    .eq("id", requestId)
    .eq("visibility", "private")
    .contains("invited_artist_slugs", [slug])
    .maybeSingle<ArtworkRequestRef>();
  if (invited.data) return { request: invited.data, role: "invited_artist" };

  deny("artwork_request_not_found", "Artwork request not found.");
}
```

### 1.2 `src/lib/placements/state-machine.ts`

Orders already have `src/lib/order-state-machine.ts`. Placements have
nothing equivalent, which is the root cause of E20 and E23b. Add the
mirror module, same shape so the two read alike.

```ts
// src/lib/placements/state-machine.ts
//
// Placement lifecycle. Mirrors src/lib/order-state-machine.ts.
//
//   pending → active | declined | cancelled
//   declined → pending          (only via a counter offer, which re-opens
//                                the negotiation and flips the requester)
//   active → completed | cancelled | paused
//   paused → active | cancelled
//   completed, cancelled        terminal
//
// declined → active is deliberately NOT a transition. Re-opening a
// declined placement goes through the counter path, which flips
// requester_user_id so the other party is the one who accepts. Allowing
// the direct jump let a rejected requester force their own deal live
// (finding E20).

export type PlacementStatus =
  | "pending" | "active" | "declined" | "completed" | "paused" | "cancelled";

const TRANSITIONS: Record<PlacementStatus, readonly PlacementStatus[]> = {
  pending: ["active", "declined", "cancelled"],
  declined: ["pending", "cancelled"],
  active: ["completed", "cancelled", "paused"],
  paused: ["active", "cancelled"],
  completed: [],
  cancelled: [],
};

export const PLACEMENT_STATUSES = Object.keys(TRANSITIONS) as readonly PlacementStatus[];

export type TransitionResult = { ok: true } | { ok: false; reason: string };

function isPlacementStatus(v: string): v is PlacementStatus {
  return (PLACEMENT_STATUSES as readonly string[]).includes(v);
}

export function canPlacementTransition(
  from: string | null | undefined,
  to: string,
): TransitionResult {
  const f = (from ?? "").toLowerCase();
  if (!isPlacementStatus(f)) return { ok: false, reason: `Unknown current status: ${from}` };
  if (!isPlacementStatus(to)) return { ok: false, reason: `Unknown target status: ${to}` };
  if (f === to) return { ok: true }; // idempotent no-op, callers gate separately
  if (TRANSITIONS[f].includes(to)) return { ok: true };
  return { ok: false, reason: `Placement is ${f}; it cannot move to ${to}.` };
}
```

### 1.3 The catch-block hazard

This is the single most likely way to ship a broken version of this plan.

Most of the affected handlers end with:

```ts
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
```

A bare `catch {}` swallows the thrown `AuthzError` and converts a 404 into
a 400. Functionally the request is still denied, so tests that only assert
"not 200" pass, but the contract is wrong and the client shows the wrong
copy. **Every handler touched by this plan must convert its catch to:**

```ts
  } catch (err) {
    const denied = handleAuthzError(err);
    if (denied) return denied;
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
```

Task 14 adds a test that asserts the status code specifically, per route,
so a swallowed AuthzError fails CI rather than silently degrading.

---

## Part 2: Findings

### E17: `GET /api/artwork-requests/[id]` has no auth, leaks the private brief and every competing bid

**1. Confirmed location.** `src/app/api/artwork-requests/[id]/route.ts:33-66`.

```ts
33: export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
34:   const { id } = await context.params;
35:   const db = getSupabaseAdmin();
...
42:   const { data: req } = await db
43:     .from("artwork_requests")
44:     .select("*")
45:     .eq("id", id)
46:     .maybeSingle();
47:   if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
...
57:   const { data: responses } = await db
58:     .from("artwork_request_responses")
59:     .select("*")
60:     .eq("request_id", id)
61:     .order("created_at", { ascending: false });
...
65:   return NextResponse.json({ request: requestRow, responses: responses || [] });
```

There is no `getAuthenticatedUser` call in the GET handler. `PATCH` in the
same file does auth correctly (`:69`, `:86-90`), which makes the omission
easy to miss on review.

**2. Mechanism.** Three checks are missing, not one:
- no authentication at all, so anonymous callers are served;
- no visibility check, so `visibility = 'private'` rows are served to
  callers who are not on `invited_artist_slugs`;
- no role check on the `responses` fan-out, so every artist's response
  body, proposed fee, proposed revenue share and work selection is
  returned to whoever asked. Only the venue that owns the request should
  see the response set.

**3. Exploit.** `curl https://wallplace.co.uk/api/artwork-requests/<uuid>`
with no `Authorization` header. Response contains the full brief
(`description`, `budget_min_pence`, `budget_max_pence`, `location`,
`invited_artist_slugs`) plus `responses[]` with every rival artist's
`message`, `proposed_offer_amount_pence`,
`proposed_monthly_fee_pence` and `proposed_revenue_share_percent`.

The id is a UUID, which is not guessable. The practical attack does not
need to guess: any signed-in artist calls `GET /api/artwork-requests`
(the list endpoint, `src/app/api/artwork-requests/route.ts:123-137`),
receives every `semi_public` request id, then calls this endpoint on each
one to read every competitor's bid before submitting their own. That is a
straightforward commercial advantage, repeatable across the whole
marketplace.

**4. The fix.**

```diff
+import { assertCanViewArtworkRequest, handleAuthzError } from "@/lib/authz";
+
 export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
   const { id } = await context.params;
+  const auth = await getAuthenticatedUser(request);
+  if (auth.error) return auth.error;
   const db = getSupabaseAdmin();
-  const { data: req } = await db
-    .from("artwork_requests")
-    .select("*")
-    .eq("id", id)
-    .maybeSingle();
-  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
+  let req: ArtworkRequestRef;
+  let role: ArtworkRequestViewerRole;
+  try {
+    ({ request: req, role } = await assertCanViewArtworkRequest(auth.user!, id, db));
+  } catch (err) {
+    const denied = handleAuthzError(err);
+    if (denied) return denied;
+    throw err;
+  }
```

and then gate the response fan-out on `role`:

```diff
-  const { data: responses } = await db
-    .from("artwork_request_responses")
-    .select("*")
-    .eq("request_id", id)
-    .order("created_at", { ascending: false });
+  // Only the owning venue sees the full response set. An artist viewing
+  // the brief sees their own response and nothing else, so they can tell
+  // whether they have already replied without seeing rival terms.
+  let responsesQuery = db
+    .from("artwork_request_responses")
+    .select("*")
+    .eq("request_id", id);
+  if (role !== "owner") {
+    responsesQuery = responsesQuery.eq("artist_user_id", auth.user!.id);
+  }
+  const { data: responses } = await responsesQuery
+    .order("created_at", { ascending: false });
```

**5. Test to add.** `src/app/api/artwork-requests/[id]/route.test.ts` (new file):
- anonymous `GET` returns 401;
- signed-in artist who is not invited, on a `visibility:"private"` row,
  gets 404 with `error: "artwork_request_not_found"`;
- signed-in artist on a `semi_public` row gets 200, and
  `body.responses` contains only rows whose `artist_user_id` equals the
  caller;
- owning venue gets 200 with the full `responses` array.

**6. Risk / sequencing.** The artist portal detail page calls this
endpoint with a **plain `fetch`, not `authFetch`**:
`src/app/(pages)/artist-portal/artwork-requests/[id]/page.tsx:86`. Adding
auth to the route without changing that line breaks the artist detail
page with a 401. The client change is part of the same task, not a
follow-up. The venue-side page already uses `authFetch`
(`src/app/(pages)/venue-portal/artwork-requests/[id]/page.tsx:82`) and
the venue edit page too (`.../[id]/edit/page.tsx:45`), so those are safe.

---

### E18: `GET /api/artwork-requests/[id]/responses` has no auth, leaks competing offers

**1. Confirmed location.**
`src/app/api/artwork-requests/[id]/responses/route.ts:54-64`.

```ts
54: export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
55:   const { id } = await context.params;
56:   const db = getSupabaseAdmin();
57:   const { data, error } = await db
58:     .from("artwork_request_responses")
59:     .select("*")
60:     .eq("request_id", id)
61:     .order("created_at", { ascending: false });
62:   if (error) return NextResponse.json({ error: "Could not load responses" }, { status: 500 });
63:   return NextResponse.json({ responses: data || [] });
64: }
```

`POST` in the same file authenticates properly at `:67-68`. The `request`
parameter on the GET is declared but never used, which is the tell.

**2. Mechanism.** Same as E17 minus the request-row leak. No
authentication, no ownership check on the parent request, so the entire
bid set for any request id is public. The file's own header comment says
"GET — venue pulls responses", which describes the intent and not the
code.

**3. Exploit.** `curl https://wallplace.co.uk/api/artwork-requests/<uuid>/responses`
with no header returns every artist's offer amount and message verbatim.
An artist who wants to win a commission undercuts the lowest
`proposed_offer_amount_pence` by a pound.

**4. The fix.**

```diff
+import { assertArtworkRequestOwner, handleAuthzError } from "@/lib/authz";
+
 export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
   const { id } = await context.params;
+  const auth = await getAuthenticatedUser(request);
+  if (auth.error) return auth.error;
   const db = getSupabaseAdmin();
+  try {
+    // This endpoint is the venue's view of the bid set. Artists read
+    // their own response through GET /api/artwork-requests/[id], which
+    // scopes to artist_user_id.
+    await assertArtworkRequestOwner(auth.user!, id, db);
+  } catch (err) {
+    const denied = handleAuthzError(err);
+    if (denied) return denied;
+    throw err;
+  }
   const { data, error } = await db
```

**5. Test to add.** Extend the existing
`src/app/api/artwork-requests/[id]/responses/route.test.ts`:
- anonymous `GET` returns 401;
- authenticated non-owner venue returns 404 `artwork_request_not_found`;
- owning venue returns 200 with all responses.

**6. Risk / sequencing.** Grep shows no client calls `GET` on this path;
the artist page uses `POST` here (`.../[id]/page.tsx:164`) and the venue
page reads responses through the parent endpoint. Locking GET to the
owner therefore breaks no current caller. Land it together with E17 so
the two visibility rules ship as one behaviour change.

---

### E19: `POST /api/orders` is completely unauthenticated, so anyone can forge a "confirmed" order

**1. Confirmed location.** `src/app/api/orders/route.ts:329-359`.

```ts
329: export async function POST(request: Request) {
330:   try {
331:     const body = await request.json();
332:     const { id, items, shipping, subtotal, shippingCost, total, buyerEmail } = body;
333:
334:     if (!id || !items || !shipping || subtotal == null || total == null || !buyerEmail) {
335:       return NextResponse.json({ error: "Missing order data" }, { status: 400 });
336:     }
337:
338:     const { error } = await getSupabaseAdmin().from("orders").insert({
339:       id,
...
346:       status: "confirmed",
```

No `getAuthenticatedUser`. `GET` (`:16`) and `PATCH` (`:115`) in the same
file both authenticate, so a file-level grep for `getAuthenticatedUser`
finds a hit and the gap survives review. A per-handler scan is what
surfaces it.

**2. Mechanism.** Every field is attacker-controlled, including the
primary key `id`, the money fields `subtotal` / `shipping_cost` / `total`,
and `status`, which is hardcoded to `"confirmed"`. There is no Stripe
payment intent, no cart-session cross-check against
`cart_sessions.expected_subtotal_pence`, and no link to an authenticated
buyer. The legitimate order-creation path is the Stripe webhook
(`src/app/api/webhooks/stripe/route.ts`), which does verify a signature.
This POST is a parallel, unguarded door into the same table.

**3. Exploit.**

```
POST /api/orders
Content-Type: application/json

{"id":"ord_forged_1","items":[{"title":"Large canvas","artistSlug":"victim-artist",
 "price":1200,"quantity":1}],"shipping":{"fullName":"...","line1":"..."},
 "subtotal":1200,"shippingCost":0,"total":1200,"buyerEmail":"attacker@example.com"}
```

The row lands with `status: "confirmed"`. The victim artist opens
`/artist-portal/orders`, sees a confirmed £1,200 order, and ships the
work. No money ever moved. Chained with E21 the attacker then walks the
order to `delivered` themselves if they also control an artist account.

Secondary impact: `id` is caller-chosen, so an attacker who learns a real
order id can attempt a collision, and the endpoint is an unauthenticated
unbounded-write primitive against the `orders` table (storage exhaustion,
dashboard poisoning, revenue-report corruption).

**4. The fix.** The right fix is deletion, not authentication. Confirm
nothing calls it first:

```
grep -rn "\"/api/orders\"" src --include=*.tsx --include=*.ts | grep -i "method.*POST"
```

If there is no caller (expected: order creation happens in the Stripe
webhook), delete the handler:

```diff
-export async function POST(request: Request) {
-  try {
-    const body = await request.json();
-    ...
-  }
-}
```

If a caller does exist, replace the body with an authenticated,
server-priced insert rather than patching auth on top of the
client-supplied totals:

```diff
 export async function POST(request: Request) {
+  const auth = await getAuthenticatedUser(request);
+  if (auth.error) return auth.error;
   try {
     const body = await request.json();
-    const { id, items, shipping, subtotal, shippingCost, total, buyerEmail } = body;
+    const parsed = createOrderSchema.safeParse(body);   // new zod schema
+    if (!parsed.success) {
+      return NextResponse.json({ error: "Missing order data" }, { status: 400 });
+    }
+    // Server owns the identity, the money and the status. None of the
+    // three may come from the request body.
+    const id = `ord_${crypto.randomUUID()}`;
+    const cart = await loadCartSession(parsed.data.stripeSessionId);
+    if (!cart) return NextResponse.json({ error: "Unknown cart session" }, { status: 404 });
...
-      status: "confirmed",
+      buyer_user_id: auth.user!.id,
+      buyer_email: auth.user!.email,
+      subtotal: cart.expectedSubtotalPence / 100,
+      shipping_cost: cart.expectedShippingPence / 100,
+      status: "pending_payment",
```

Deletion is preferred. Note it in the ESLint `PUBLIC_ROUTES` allowlist
only if the route survives, and never with `status: "confirmed"`.

**5. Test to add.** `src/app/api/orders/route.test.ts` (file exists,
append a describe block):
- if deleted: `expect(routeModule.POST).toBeUndefined()` so a future
  re-add is a visible failure;
- if retained: unauthenticated `POST` returns 401; authenticated `POST`
  with `total: 1` against a cart session whose
  `expected_subtotal_pence` is `120000` does not persist `1`; the inserted
  row's `status` is never `"confirmed"`.

**6. Risk / sequencing.** Highest-value single change in this plan and the
lowest regression risk, because the legitimate creation path is the
webhook. Do the caller grep before deleting. If any legacy client-side
"save order after redirect" flow exists, deleting the route makes those
orders vanish, so the grep is not optional.

---

### E20: `PATCH /api/placements` lets a declined or cancelled placement be force-activated

**1. Confirmed location.** `src/app/api/placements/route.ts:895-912` and
`:1135-1153`.

The requester guard is scoped to pending rows only:

```ts
895:    if (existing.status === "pending" && (status === "active" || status === "declined")) {
896:      if (isSelfPlacement) { ... 400 }
902:      if (isRequester)     { ... 400 }
908:      if (!isArtist && !isVenue) { ... 403 }
912:    }
```

and the only other gate before the write is a pair of no-op checks:

```ts
1140:    if (status === "active" && existing.status === "active") {
1141:      return NextResponse.json({ error: "Already accepted" }, { status: 400 });
1142:    }
1143:    if (status === "declined" && existing.status === "declined") {
1144:      return NextResponse.json({ error: "Already declined" }, { status: 400 });
1145:    }
...
1152:    const updates: Record<string, unknown> = {};
1153:    if (status) updates.status = status;
```

**2. Mechanism.** There is no placement state machine. `existing.status`
is consulted only for the two same-state no-ops, so `declined → active`,
`cancelled → active`, `completed → active` and `cancelled → pending` all
fall straight through to line 1153. Because the requester guard at :895
is inside an `existing.status === "pending"` branch, it does not run for
any of them, so the party who was **rejected** can activate the deal
themselves.

The comment at :1135-1139 says this is deliberate ("only block the no-op
cases"). It was written for the counter-offer flow, where a declined row
legitimately re-opens. But the counter path handles that itself at
:918-961 (it sets `termsUpdates.status = "pending"` and flips
`requester_user_id`), so the permissive fall-through buys nothing and
costs the guard.

Consequential state damage, because the downstream hooks are all keyed on
`existing.status === "pending" && status === "active"`:
- paid-loan billing does not start (`:1292`), so the venue is on an
  active paid loan with no Stripe subscription;
- inventory is not decremented and `placed_at_venue` is not stamped
  (`:1352`);
- `accepted_at` and `responded_at` are not set (`:1156-1159`).

So the forced row is active but invisible to billing and to inventory.

**3. Exploit.** Artist A requests a placement at Venue B. B declines.
A then sends:

```
PATCH /api/placements
Authorization: Bearer <artist A token>

{"id":"<placement id>","status":"active"}
```

`isArtist` is true at :796, the :895 branch is skipped because the row is
`declined`, the :1140 no-op check does not match, and line 1153 writes
`status: "active"`. The placement now shows as live in both portals, the
artist's work is advertised as hanging at a venue that refused it, and
the venue's public page renders it. The same request works on a
`cancelled` row.

**4. The fix.** Two changes.

(a) Gate every status write through the new state machine, immediately
after the party check at :799:

```diff
+import { canPlacementTransition } from "@/lib/placements/state-machine";
+
     if (!isArtist && !isVenue) {
       return NextResponse.json({ error: "Not authorised" }, { status: 403 });
     }
+
+    // Every status write goes through the state machine. Without this,
+    // declined/cancelled rows fall through to the unconditional
+    // `updates.status = status` below (finding E20).
+    if (status) {
+      const t = canPlacementTransition(existing.status, status);
+      if (!t.ok) return NextResponse.json({ error: t.reason }, { status: 422 });
+    }
```

(b) Widen the requester guard so it is not scoped to pending:

```diff
-    if (existing.status === "pending" && (status === "active" || status === "declined")) {
+    if (status === "active" || status === "declined") {
       if (isSelfPlacement) {
```

With (a) in place, `declined → active` is already rejected at 422, so (b)
is defence in depth: it also covers any future transition that reaches
`active` from a non-pending state.

**5. Test to add.** `src/app/api/placements/route.test.ts` (new file),
plus a pure unit test `src/lib/placements/state-machine.test.ts`:
- state machine: `canPlacementTransition("declined","active").ok === false`;
  `("cancelled","active").ok === false`; `("completed","active").ok === false`;
  `("pending","active").ok === true`; `("declined","pending").ok === true`.
- route: artist PATCHes `{status:"active"}` on a `declined` row → 422,
  and `db.from("placements").update` is never called.
- route: the original requester PATCHes `{status:"active"}` on a pending
  row → 400 "You cannot respond to your own placement request".

**6. Risk / sequencing.** The transition table has to match production
reality before it is enforced, or legitimate flows start 422-ing. Two
transitions in the proposed table exist specifically because the code
already performs them: `active → completed` (written at :1221 when
`stage === "collected"`) and `completed → active` on undo (:1241). The
undo path writes `status` via `updates.status` rather than the `status`
body field, so it does **not** pass through `canPlacementTransition` as
written above. That is intentional (undo is not a caller-supplied status)
but must be verified in review. Before merging, run a read-only query
against production to confirm no live row sits in a status outside
`PLACEMENT_STATUSES`:

```sql
select status, count(*) from placements group by 1 order by 2 desc;
```

---

### E21: `PATCH /api/orders` lets the seller self-attest delivery and release escrow early

**1. Confirmed location.** `src/app/api/orders/route.ts:144-158` (who may
transition) and `:264-290` (what `delivered` triggers).

```ts
144:    let authorised = order.artist_user_id === auth.user!.id;
145:    if (!authorised && order.artist_slug) { ...slug fallback... }
158:    if (!authorised) return NextResponse.json({ error: "Not authorised" }, { status: 403 });
```

```ts
265:    if (status === "delivered") {
266:      const { data: pendingTransfers } = await db
267:        .from("stripe_transfers")
268:        .select("id")
269:        .eq("order_id", orderId)
270:        .eq("status", "pending");
...
283:          try {
284:            await executeTransfer(t.id);
```

**2. Mechanism.** The authorisation predicate accepts exactly one role,
the artist, and `delivered` is the transition that releases money. The
buyer, the only party who actually knows whether the parcel arrived, is
not authorised to set any status at all. `canTransition` at :160 blocks
`confirmed → delivered`, so the artist cannot jump straight there, but
`shipped → delivered` is an allowed edge
(`src/lib/order-state-machine.ts:32`) and shipping is also self-attested
by the same artist. So the artist walks
`confirmed → processing → shipped → delivered` unilaterally, in three
requests, and `executeTransfer` fires on the third.

The header comment on `order-state-machine.ts:15-17` states the intent:
"Backward transitions and skips are blocked so the artist can't, say,
mark an order delivered the moment it's paid (which would release the
14-day pending transfer early)." The skip is blocked. The three-step walk
is not.

**3. Exploit.** A malicious or simply impatient seller, holding a normal
artist token, sends three requests back to back:

```
PATCH /api/orders  {"orderId":"ord_x","status":"processing"}
PATCH /api/orders  {"orderId":"ord_x","status":"shipped","trackingNumber":"ZZ000"}
PATCH /api/orders  {"orderId":"ord_x","status":"delivered"}
```

Every `stripe_transfers` row for that order flips from `pending` to
executed and the funds leave the platform balance for the seller's
connected account, on day zero rather than day fourteen. The buyer never
receives the item and the platform has already paid out. This defeats the
14-day hold, which is the only chargeback buffer in the payout design.

**4. The fix.** Split the transition set by role. `delivered` becomes a
buyer-or-carrier-or-admin transition; the seller keeps the dispatch
statuses.

```diff
+import { assertOrderParty, handleAuthzError } from "@/lib/authz";
+
+// Statuses the seller may set. `delivered` is deliberately absent: it
+// releases escrow (see the executeTransfer block below), so it cannot be
+// self-attested by the party who gets paid (finding E21).
+const SELLER_STATUSES = new Set(["artist_notified", "awaiting_dispatch", "processing", "shipped", "cancelled"]);
+const BUYER_STATUSES  = new Set(["delivered", "disputed", "cancelled"]);
```

```diff
-    const { data: order } = await db
-      .from("orders")
-      .select("artist_user_id, artist_slug, buyer_email, status, ...")
-      .eq("id", orderId)
-      .single();
-    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
-
-    let authorised = order.artist_user_id === auth.user!.id;
-    if (!authorised && order.artist_slug) { ... }
-    if (!authorised) return NextResponse.json({ error: "Not authorised" }, { status: 403 });
+    let order;
+    try {
+      order = await assertOrderParty(auth.user!, orderId, { as: "any" }, db);
+    } catch (err) {
+      const denied = handleAuthzError(err);
+      if (denied) return denied;
+      throw err;
+    }
+
+    const allowed = order.role === "seller" ? SELLER_STATUSES : BUYER_STATUSES;
+    if (!allowed.has(status)) {
+      return NextResponse.json(
+        { error: `A ${order.role} cannot move an order to ${status}.` },
+        { status: 403 },
+      );
+    }
```

Keep the existing `canTransition` call at :160 unchanged; the role gate
and the state machine are independent and both must pass.

The `artist_user_id` back-fill at :155 moves into `assertOrderParty`'s
caller (it can stay in the route, keyed on `order.role === "seller" &&
order.artist_user_id === null`).

Admin override: `/api/admin/orders` already exists for support to force a
status; confirm it is the escape hatch for "carrier confirmed delivery
but the buyer never clicked", and if it is not, add
`delivered` to the admin route rather than re-widening this one.

**5. Test to add.** Append to `src/app/api/orders/route.test.ts`:
- seller PATCHes `{status:"delivered"}` on a `shipped` order → 403, and
  `executeTransfer` mock is not called;
- buyer PATCHes `{status:"delivered"}` on the same order → 200 and
  `executeTransfer` is called once per pending transfer;
- a third party (neither buyer nor seller) PATCHes → 404
  `order_not_found`;
- seller PATCHes `{status:"shipped"}` → still 200 (no regression).

**6. Risk / sequencing.** This changes who can complete an order, so it
has real UX consequences. Today the "Mark as delivered" control lives in
the artist portal. Removing the artist's ability to set `delivered`
without adding a buyer-side control means orders can strand in `shipped`
forever and payouts fall back to the 14-day cron
(`processPendingTransfers`), which is the correct default but slower for
honest sellers. Ship the buyer-side "Confirm delivery" affordance in the
customer portal in the same PR, and grep the artist portal for the
delivered action so the button is removed rather than left to 403:

```
grep -rn '"delivered"' src/app/\(pages\)/artist-portal
```

---

### E22: `POST /api/artwork-requests/[id]/fulfill` has no status or idempotency gate, so it mints duplicate payable artifacts

**1. Confirmed location.**
`src/app/api/artwork-requests/[id]/fulfill/route.ts:83-181`.

The only state gate is on the response, not on the request and not on
prior fulfilment:

```ts
86:  if (resp.status !== "accepted") {
87:    return NextResponse.json(
88:      { error: "Only accepted responses can be fulfilled" },
89:      { status: 422 },
90:    );
91:  }
```

and the artifact creation is unconditional:

```ts
112:      const placementId = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
...
122:      await db.from("placements").insert({ id: placementId, ... status: "pending", ... });
137:      await db.from("artwork_request_responses")
138:        .update({ linked_placement_id: placementId })
139:        .eq("id", resp.id);
```

```ts
146:      const offerId = `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
147:      await db.from("purchase_offers").insert({
...
161:        status: "accepted",
162:        accepted_at: new Date().toISOString(),
163:      });
```

The response row's own status is never advanced past `accepted`, and the
request status flip at :177-180 is a blind `update`.

**2. Mechanism.** Three gaps compound:
- `req.status` is selected at :45 and never tested, so a request already
  in `fulfilled` can be fulfilled again;
- `resp.status` stays `"accepted"` after a successful fulfil, so the
  :86 guard passes again on the next call;
- `linked_placement_id` / `linked_offer_id` are checked as *hints* for
  where to route (`:97`, `:101`) but never as "already done" markers, and
  the `existing_works` branch overwrites them.

Contrast `src/app/api/artwork-requests/[id]/responses/[responseId]/route.ts:55-56`,
which does have the gate (`if (resp.status !== "sent") return 409`). The
fulfil route is the same shape without it.

**3. Exploit.** The venue owner (or anyone who replays the venue's
request, e.g. a double-click on a flaky connection) sends N times:

```
POST /api/artwork-requests/<id>/fulfill
Authorization: Bearer <venue token>

{"response_id":"<uuid>","action":"order"}
```

Each call inserts a fresh `purchase_offers` row with a unique
`off_<timestamp>_<random>` id and `status: "accepted"`,
`accepted_at: now`. The venue portal's offers page shows N identical
accepted offers, each independently payable. With `action:"placement"`
each call inserts a fresh `placements` row in `pending`, so the artist
receives N placement requests for one agreement, and the earlier
placement ids are orphaned when `linked_placement_id` is overwritten at
:137-140.

The ids embed `Date.now()`, so rapid replays are distinct and no unique
constraint catches the duplicate.

**4. The fix.** Gate on all three, and mark the response as consumed.

```diff
   if (!resp) {
     return NextResponse.json({ error: "Response not found" }, { status: 404 });
   }
   if (resp.status !== "accepted") {
     return NextResponse.json(
       { error: "Only accepted responses can be fulfilled" },
       { status: 422 },
     );
   }
+  // Idempotency. Three independent markers, any one of which means this
+  // response has already produced its artifact (finding E22).
+  if (req.status === "fulfilled") {
+    return NextResponse.json(
+      { error: "already_fulfilled", message: "This request has already been fulfilled." },
+      { status: 409 },
+    );
+  }
+  if (resp.linked_placement_id || resp.linked_offer_id || resp.linked_commission_id) {
+    return NextResponse.json(
+      { error: "already_fulfilled", message: "This response has already been fulfilled." },
+      { status: 409 },
+    );
+  }
```

and, at the end, advance the response so the `accepted` gate cannot pass
twice even if the linked-id write fails:

```diff
   await db
     .from("artwork_requests")
     .update({ status: "fulfilled" })
     .eq("id", requestId);
+  await db
+    .from("artwork_request_responses")
+    .update({ status: "fulfilled", updated_at: new Date().toISOString() })
+    .eq("id", resp.id)
+    .eq("status", "accepted"); // compare-and-set: a concurrent second
+                               // request updates 0 rows
```

Belt and braces at the schema level, as a separate migration:

```sql
-- supabase/migrations/0NN_artwork_request_response_single_fulfilment.sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_purchase_offers_from_response
  ON purchase_offers (source_response_id)
  WHERE source_response_id IS NOT NULL;
```

(this requires adding `source_response_id` to `purchase_offers` and
setting it in the insert at :147; do the same for `placements`. Without a
DB-level constraint, two concurrent requests can both pass the read-side
gate.)

The `resp.status` CHECK constraint must be widened to include
`'fulfilled'` in the same migration, or the update silently fails.

**5. Test to add.** `src/app/api/artwork-requests/[id]/fulfill/route.test.ts` (new file):
- second `POST` with the same `response_id` returns 409 `already_fulfilled`
  and `db.from("purchase_offers").insert` is called exactly once across
  both calls;
- `POST` against a request already in `status:"fulfilled"` returns 409;
- non-owning venue returns 403 (existing behaviour, add as a regression
  guard).

**6. Risk / sequencing.** The `status: "fulfilled"` value must be added to
whatever CHECK constraint governs `artwork_request_responses.status`
before the code change deploys, otherwise the compare-and-set update
errors and, because it is not awaited into the response, fails silently.
Order: migration first, code second. The unique-index part needs a
backfill decision for any existing duplicate rows; run

```sql
select source_response_id, count(*) from purchase_offers
group by 1 having count(*) > 1;
```

before creating the index, and expect it to be non-empty in production
given the bug has been live.

---

### E23a: the demo guard has zero call sites

**1. Confirmed location.** `src/lib/demo-guard.ts` exports
`isDemoUser`, `assertNotDemo` and `assertNotDemoStrict`. Call sites:

```
$ grep -rn "assertNotDemo" src --include="*.ts" --include="*.tsx" | grep -v "src/lib/demo-guard.ts"
src/app/api/demo/login/route.ts:23: *   The `assertNotDemo` helper in @/lib/demo-guard is what actually
src/data/demo.ts:17: *   Mutations get blocked at the API layer via a `assertNotDemo`
```

Both hits are **prose inside doc comments**. No route imports
`@/lib/demo-guard`. 67 route files export a mutating handler and import
`getSupabaseAdmin`; zero of them call the guard.

**2. Mechanism.** The control is fully implemented and fully unwired. The
two doc comments assert that it is wired, which is why it has survived:
anyone verifying "is demo write-protected?" by grepping finds two
confident statements that it is.

**3. Exploit.** Anyone who clicks "Try the demo" on the homepage lands in
a real Supabase session for `DEMO_ARTIST_USER_ID` / `DEMO_VENUE_USER_ID`
(`src/app/api/demo/login/route.ts`). From there every mutating route in
the app is available to them with a valid token: they can edit the demo
artist's works, decline the demo venue's placements, send messages to
real venues from the demo account, and delete the demo profile. The next
visitor sees whatever the previous one left. Because demo accounts
message real users, the demo session is also a free unauthenticated-in-
practice outreach channel into real venue inboxes.

Severity is bounded by "the demo accounts are not real users", which is
why this is medium rather than high. It is listed because it is the
systemic half of the finding: a written control with no enforcement point
is worse than no control, because it is counted as mitigation.

**4. The fix.** Wire it, then make it impossible to forget.

Wire it into every mutating handler that writes user-visible state,
immediately after the auth check:

```diff
+import { assertNotDemo } from "@/lib/demo-guard";
+
 export async function PATCH(request: Request) {
   const auth = await getAuthenticatedUser(request);
   if (auth.error) return auth.error;
+  const demo = assertNotDemo(auth.user!.id);
+  if (demo) return demo;
```

Use `assertNotDemoStrict` (403) on anything that leaves the platform:
`/api/messages` POST, `/api/placements` POST, `/api/artwork-requests`
POST, `/api/artwork-requests/[id]/responses` POST, `/api/enquiry`,
`/api/checkout`, `/api/offers`. Use the soft `assertNotDemo` (200 +
`{demo:true}`) on in-portal edits: `/api/artist-works`,
`/api/artist-profile`, `/api/account/preferences`, favourites.

Then enforce it with the lint rule in Part 3, which fails any mutating
service-role route that imports neither `@/lib/authz` nor
`@/lib/demo-guard` and is not on the allowlist.

**5. Test to add.** `src/lib/demo-guard.test.ts` covers the helper in
isolation; the gap is coverage of the wiring. Add
`tests/integration/demo-guard-coverage.test.ts`: enumerate every
`route.ts` under `src/app/api` that exports POST/PATCH/PUT/DELETE and
imports `getSupabaseAdmin`, and assert each either imports
`@/lib/demo-guard` or appears in an explicit `DEMO_EXEMPT` list committed
alongside the test. This is the same shape as the lint rule but catches
dynamic cases and gives a readable failure listing the unguarded routes.

**6. Risk / sequencing.** `assertNotDemo` returns HTTP 200 with
`{demo:true}`. Client code that treats any 200 as success will show a
false "Saved" confirmation to demo users. Before wiring the soft variant,
grep for the response handling on each route and confirm the client
checks `data.demo`. The strict variant (403) has no such issue. If in
doubt, use strict; a demo user seeing "Demo accounts can't do this" is
better than one seeing "Saved" on a write that did not happen.

Also: the guard short-circuits to "not a demo user" when the env vars are
unset (`readDemoUserIds` returns `[]`), so wiring it into 60+ routes is a
no-op in every environment that has not configured demo accounts. That
makes this a low-risk change to land early.

---

### E23b: a direct `status:"completed"` write skips the inventory restore

**1. Confirmed location.** `src/app/api/placements/route.ts:1352-1353`
against `:1219-1222`.

Completion is reachable two ways. Via the stage path:

```ts
1219:      if (stage === "collected") {
1220:        updates.collected_at = ts;
1221:        updates.status = "completed";
1222:      }
```

but the inventory-restore trigger is keyed on the **stage**, not the
resulting status:

```ts
1352:      const becameActive = existing.status === "pending" && status === "active";
1353:      const becameCollected = existing.status === "active" && stage === "collected";
```

and `placementUpdateSchema` accepts `"completed"` as a direct status
(`src/lib/validations.ts:155`).

**2. Mechanism.** `PATCH {id, status:"completed"}` with no `stage` sets
`updates.status = "completed"` at :1153 and leaves `becameCollected`
false. So:
- `quantity_available` is never incremented back (the work stays
  decremented from the `becameActive` path at :1401-1405);
- `available` stays `false` when the decrement took it to zero, so the
  work is permanently unlisted;
- `placed_at_venue` and `current_placement_id` keep pointing at a
  finished placement, so the artwork page keeps showing "Placed at X"
  after collection.

The restore block at :1408-1420 also guards on `current_placement_id ===
id`, so once a later placement claims the work, the stale stamp is
unrecoverable through this route.

**3. Exploit.** Not primarily an attack; it is a state-corruption bug any
party to a placement can trigger with a legitimate-looking request, and
an attacker can trigger deliberately to take a rival artist's work off
sale:

```
PATCH /api/placements
{"id":"<placement I am a party to>","status":"completed"}
```

The artist's inventory is silently burned. Repeated across a portfolio it
is an availability attack by the venue against the artist.

**4. The fix.** Key the inventory hooks on the resulting status, not the
stage that happened to cause it, and reject the direct write.

```diff
-      const becameCollected = existing.status === "active" && stage === "collected";
+      // Any transition into a terminal completed state restores stock,
+      // whether it arrived via stage="collected" or a direct status
+      // write (finding E23b).
+      const effectiveStatus = (updates.status as string | undefined) ?? existing.status;
+      const becameCollected =
+        existing.status === "active" && effectiveStatus === "completed";
```

and, separately, narrow the schema so the direct write is not a supported
path at all:

```diff
-  status: z.enum(["pending", "active", "declined", "completed", "paused", "cancelled"]).optional(),
+  // "completed" is reachable only through stage:"collected", which also
+  // stamps collected_at and restores inventory. Accepting it as a bare
+  // status let callers complete a placement without either.
+  status: z.enum(["pending", "active", "declined", "paused", "cancelled"]).optional(),
```

Keep both changes: the schema narrowing removes the caller-facing path,
the `effectiveStatus` change makes the hook correct regardless.

**5. Test to add.** In `src/app/api/placements/route.test.ts`:
- `PATCH {status:"completed"}` returns 400 validation_failed after the
  schema narrowing;
- `PATCH {stage:"collected"}` on an active placement calls
  `artist_works` update with `quantity_available` incremented and
  `current_placement_id: null`;
- a placement that goes active then collected leaves
  `quantity_available` at its original value (round-trip assertion).

**6. Risk / sequencing.** Narrowing the schema is a breaking API change if
any client sends `status:"completed"`. Grep first:

```
grep -rn 'status: *"completed"' src/app/\(pages\) src/components
```

If a client does send it, change the client to `stage: "collected"` in
the same PR. Also note the undo path at :1238-1242 writes
`updates.status = "active"` directly for `unsetStage === "collected"`;
that is an internal write, not a caller-supplied status, so the schema
narrowing does not affect it.

---

### E31: any authenticated user can read any private conversation

**1. Confirmed location.**
`src/app/api/messages/[conversationId]/route.ts:6-36`.

```ts
10:    const auth = await getAuthenticatedUser(request);
11:    if (auth.error) return auth.error;
...
16:    if (!conversationId || conversationId.length > 200) {
17:      return NextResponse.json({ error: "Valid conversation ID required" }, { status: 400 });
18:    }
19:
20:    const db = getSupabaseAdmin();
21:    const { data, error } = await db
22:      .from("messages")
23:      .select("*")
24:      .eq("conversation_id", conversationId)
25:      .order("created_at", { ascending: true });
...
32:    return NextResponse.json({ messages: data || [] });
```

Authentication is present. **Authorisation is not.** The only check on
`conversationId` is a length bound.

The `DELETE` handler in the same file, at `:105-119`, does implement the
participant check. `GET` and `PATCH` do not, so the file contains a
correct reference implementation of the missing check twenty lines below
the vulnerable one.

**2. Mechanism.** Conversation ids are deterministic and derived from two
public slugs:

```ts
// src/app/api/messages/route.ts:290-293
function deterministicCid(slugA: string, slugB: string): string {
  const [a, b] = [slugA, slugB].sort();
  return `dm-${a}__${b}`;
}
```

The same function is duplicated at `src/app/api/placements/route.ts:40`.
Both artist and venue slugs are public (they are the `/browse/<slug>`
and venue page URLs). So the id is not a secret and cannot be treated as
a capability, which is exactly what this handler does.

**3. Exploit.** Attacker signs up for any account (a free artist or venue
signup is enough for a valid Bearer token), scrapes two slugs from the
public browse pages, sorts them, and requests:

```
GET /api/messages/dm-copper-kettle__maya-chen
Authorization: Bearer <any valid token>
```

Response is the entire thread: negotiation messages, `metadata` blobs
containing `placementId`, `monthlyFeeGbp`, `revenueSharePercent`,
`arrangementType`, plus any `attachments`. Iterating the cross product of
public artist and venue slugs dumps the platform's whole private
negotiation history, which is the marketplace's core commercial data.

The `PATCH` handler on the same file (`:39-74`) is a lesser variant: it
marks messages read on any conversation for any `readerSlug`, so an
attacker can also clear a victim's unread badges and hide incoming
messages from them.

**4. The fix.**

```diff
+import { assertConversationParticipant, handleAuthzError } from "@/lib/authz";
+
 export async function GET(request, { params }) {
   const auth = await getAuthenticatedUser(request);
   if (auth.error) return auth.error;
-
   try {
     const { conversationId } = await params;
-
-    if (!conversationId || conversationId.length > 200) {
-      return NextResponse.json({ error: "Valid conversation ID required" }, { status: 400 });
-    }
-
     const db = getSupabaseAdmin();
+    await assertConversationParticipant(auth.user!, conversationId, db);
     const { data, error } = await db
       .from("messages")
       .select("*")
       .eq("conversation_id", conversationId)
       .order("created_at", { ascending: true });
...
-  } catch {
+  } catch (err) {
+    const denied = handleAuthzError(err);
+    if (denied) return denied;
     return NextResponse.json({ error: "Invalid request" }, { status: 400 });
   }
 }
```

For `PATCH`, do the same and additionally stop trusting the body's
`readerSlug`:

```diff
-    const { readerSlug } = body;
-    if (!readerSlug || typeof readerSlug !== "string" || readerSlug.length > 100) {
-      return NextResponse.json({ error: "Valid readerSlug required" }, { status: 400 });
-    }
-    const safeSlug = readerSlug.replace(/[^a-zA-Z0-9_-]/g, "");
+    // readerSlug used to come from the body, so a caller could mark
+    // anyone's messages read. Derive it from the session instead.
+    const { slugs } = await assertConversationParticipant(auth.user!, conversationId, db);
...
     const { error } = await db
       .from("messages")
       .update({ is_read: true })
       .eq("conversation_id", conversationId)
-      .eq("recipient_slug", safeSlug)
+      .in("recipient_slug", slugs)
       .eq("is_read", false);
```

`DELETE` should be migrated to `assertConversationParticipant` too, for
one implementation rather than two, but its current check is correct so
that is cleanup, not a fix.

**5. Test to add.** `src/app/api/messages/[conversationId]/route.test.ts`
(new file):
- authenticated non-participant `GET dm-a__b` returns 404
  `conversation_not_found` and the messages select is never issued with
  only the `conversation_id` filter;
- participant (matched by `sender_id`) returns 200 with the thread;
- participant matched only by legacy `sender_name` slug (null
  `recipient_user_id`) returns 200, covering the legacy branch;
- `PATCH` from a non-participant returns 404 and issues no update;
- `PATCH` from a participant with a body `readerSlug` belonging to
  someone else marks only the caller's own rows read.

**6. Risk / sequencing.** The legacy-row branch matters. Rows written
before `recipient_user_id` existed have it null, so an id-only check
would lock legitimate users out of their own old threads. The two-probe
implementation in `assertConversationParticipant` covers that, and the
third test above is what proves it. Before deploying, sanity-check the
scale of the legacy set:

```sql
select count(*) from messages where recipient_user_id is null;
```

If that is zero, the slug probe is dead code and can be dropped, which is
worth knowing.

---

### E32: any artist can overwrite and hijack another artist's artwork

**1. Confirmed location.** `src/lib/db/artist-works.ts:15-33`, reached
from `src/app/api/artist-works/route.ts:163`.

```ts
15: export async function upsertWork(
16:   artistProfileId: string,
17:   work: Omit<DbArtistWork, "artist_id">
18: ) {
19:   const db = getSupabaseAdmin();
20:   const row = { ...work, artist_id: artistProfileId };
21:
22:   const { data: existing } = await db
23:     .from("artist_works")
24:     .select("id")
25:     .eq("id", work.id)          // <-- global lookup, not scoped to the artist
26:     .single();
27:
28:   async function attempt(r: Record<string, unknown>) {
29:     if (existing) {
30:       return db.from("artist_works").update(r).eq("id", work.id);   // <-- unscoped UPDATE
31:     }
32:     return db.from("artist_works").insert(r);
33:   }
```

The route does authenticate and does resolve the caller's own profile
(`route.ts:29-32`), so this looks safe at the call site. The IDOR is one
layer down, in the shared DB helper.

**2. Mechanism.** `work.id` comes straight from the request body
(`route.ts:36`) and is never checked against the caller's portfolio. The
existence probe at :25 is global, and the UPDATE at :30 is filtered on
`id` alone. `row` carries `artist_id: artistProfileId` (the **attacker's**
profile id), so the update both rewrites the victim's content and
reassigns ownership of the row.

The route's own duplicate detection makes it worse: `isNewWork` at
`route.ts:69` is computed against `existingWorks`, the *caller's* works.
A hijack of someone else's id therefore counts as a new work for the
posting-limit check while taking the update branch in `upsertWork`.

Every per-column fallback in the same function repeats the unscoped
filter (`:80`, `:98`, `:110`), so even a partial write lands on the
victim's row.

`deleteWork` at `:127-135` is correctly scoped
(`.eq("id", workId).eq("artist_id", artistProfileId)`), which shows the
pattern was known and just not applied to the upsert.

**3. Exploit.** Attacker signs up as an artist, opens any public artwork
page and reads the work id (it is in the page payload and in the
`/api/artist-works` shape). Then:

```
POST /api/artist-works
Authorization: Bearer <attacker artist token>
Content-Type: application/json

{"id":"<victim work id>","title":"Now mine","image":"https://attacker/x.jpg",
 "pricing":[{"size":"A2","price":25}],"available":true}
```

Result on the victim's row: `artist_id` becomes the attacker's profile
id, so the work vanishes from the victim's portfolio and appears in the
attacker's. Title, image and pricing are the attacker's.

The monetisation chain is real: checkout attributes the seller from
`artistSlug` on the cart item
(`src/app/api/checkout/route.ts:280`, `:299`, `:348`), and the cart item
is built from whichever profile page the buyer added it on. Once the row
sits in the attacker's portfolio it renders on the attacker's public
page, so a purchase from that page carries the attacker's slug and pays
the attacker. So this is theft of a listing, not merely defacement.

Availability variant, no hijack needed: `POST {"id":"<victim id>",
"title":"x","image":"y","available":false}` takes any artwork on the
platform off sale.

**4. The fix.** Scope both the probe and the write, in `upsertWork`. Do
not add a fetch-then-compare in the route; put the predicate in the
queries.

```diff
 export async function upsertWork(
   artistProfileId: string,
   work: Omit<DbArtistWork, "artist_id">
 ) {
   const db = getSupabaseAdmin();
   const row = { ...work, artist_id: artistProfileId };

+  // Scoped to the caller's profile. An id belonging to another artist
+  // must NOT resolve here, or the update branch below rewrites their row
+  // and reassigns artist_id to the caller (finding E32).
   const { data: existing } = await db
     .from("artist_works")
     .select("id")
     .eq("id", work.id)
+    .eq("artist_id", artistProfileId)
-    .single();
+    .maybeSingle();

   async function attempt(r: Record<string, unknown>) {
     if (existing) {
-      return db.from("artist_works").update(r).eq("id", work.id);
+      return db
+        .from("artist_works")
+        .update(r)
+        .eq("id", work.id)
+        .eq("artist_id", artistProfileId);
     }
     return db.from("artist_works").insert(r);
   }
```

and the same `.eq("artist_id", artistProfileId)` on the three fallback
updates at `:80`, `:110` and on the read-backs at `:98`, `:117`.

With this change, a hijack attempt takes the INSERT branch, collides with
the existing primary key and returns a duplicate-key error, which the
route surfaces as a 500. Convert that to a clean 409 in the route:

```diff
     if (error) {
       console.error("Work save error:", error);
+      if ((error as { code?: string }).code === "23505") {
+        return NextResponse.json(
+          { error: "work_id_taken", message: "That artwork ID is already in use." },
+          { status: 409 },
+        );
+      }
       return NextResponse.json({ error: "Failed to save work" }, { status: 500 });
     }
```

`.single()` becoming `.maybeSingle()` is required: `.single()` errors when
zero rows match, which is now the normal "new work" case.

Verify `artist_works.id` is a primary key or has a unique constraint
before relying on the collision. Migration 011 declares
`artwork_id TEXT REFERENCES artist_works(id)`, and a foreign key requires
a unique target, so it is. Confirm with `\d artist_works` and record the
result in the PR.

Use `assertOwnsWork` from `@/lib/authz` on any other route that mutates a
work by id (search: `grep -rn "artist_works" src/app/api`).

**5. Test to add.** Append to `src/app/api/artist-works/route.test.ts`
plus a new `src/lib/db/artist-works.test.ts`:
- `upsertWork("profile-A", { id: "w_owned_by_B", ... })` issues its
  existence probe with **both** `.eq("id", ...)` and
  `.eq("artist_id","profile-A")`, and takes the insert branch;
- the update branch, when taken, is filtered on `artist_id` as well as
  `id`, asserted on the query-builder mock;
- route level: POST with another artist's work id returns 409
  `work_id_taken` and never issues an `update`;
- route level: POST with the caller's own existing work id still returns
  200 (no regression on the normal edit path).

**6. Risk / sequencing.** One real behaviour change: today, a work whose
`artist_id` was written wrong (a data-migration artefact, or a profile
that was recreated) can be "repaired" by any save, because the unscoped
update re-stamps `artist_id`. After the fix, those rows become
un-editable by their real owner and every save attempt returns 409. Check
for orphans before deploying:

```sql
select w.id, w.artist_id from artist_works w
left join artist_profiles p on p.id = w.artist_id
where p.id is null;
```

Fix any hits with a one-off migration rather than leaving artists stuck.

This is the highest-severity finding in the set: single request, ordinary
free account, permanent effect on another user's monetised asset.

---

### E33: any authenticated user can accept or decline any placement via a message

**1. Confirmed location.** `src/app/api/messages/route.ts:504-530`.

```ts
504:    if (messageType === "placement_response" && metadata) {
505:      const m = metadata as Record<string, unknown>;
506:      const placementId = m.placementId as string;
507:      const responseStatus = m.status as string;
508:
509:      if (placementId && (responseStatus === "active" || responseStatus === "declined")) {
510:        await db.from("placements").update({
511:          status: responseStatus,
512:          responded_at: new Date().toISOString(),
513:        }).eq("id", placementId);
```

**2. Mechanism.** `placementId` and `status` are taken verbatim from
client-supplied `metadata`. Between line 504 and the write at 513 there
is:
- no check that the caller is the placement's artist or venue;
- no check that the placement is `pending`;
- no requester check, so the person who sent the request can accept it;
- no check that the placement has anything to do with the conversation
  the message is being posted into.

The write is `.eq("id", placementId)` with the service-role client, so
RLS does not intervene.

This is a second, unguarded path to the same state change that
`PATCH /api/placements` protects with roughly 200 lines of role,
requester, self-placement, subscription and review-status logic
(`src/app/api/placements/route.ts:796-912`). Everything that route
enforces, this bypasses, including the paid-loan billing hook, so a
placement forced active here has no Stripe subscription and no
`accepted_at`.

**3. Exploit.** Attacker holds any account with an artist or venue
profile (needed to pass the sender-slug check at `:303-313`). They
observe a placement id, which is exposed in notification links
(`/placements/<id>`), in message metadata they can read via E31, and is
weakly structured (`p-msg-<timestamp>` at `:439`, `pl_<timestamp>_<6
chars>` in the fulfil route). Then:

```
POST /api/messages
Authorization: Bearer <any profiled account>
Content-Type: application/json

{"conversationId":"dm-attacker__anyone","senderType":"artist",
 "recipientSlug":"<any valid slug>","content":"hi",
 "messageType":"placement_response",
 "metadata":{"placementId":"<victim placement id>","status":"declined"}}
```

The victim's pending placement is set to `declined`. With
`"status":"active"` it is forced live instead, and
`notifyPlacementResponse` at `:521` emails the artist telling them the
venue accepted, from a venue that did nothing. Sweeping ids kills or
force-accepts every placement negotiation on the platform.

**4. The fix.** Route the state change through the same authorisation the
PATCH endpoint uses.

```diff
+import { assertPlacementParty, handleAuthzError } from "@/lib/authz";
+import { canPlacementTransition } from "@/lib/placements/state-machine";
+import { canRespond } from "@/lib/placement-permissions";
+
     if (messageType === "placement_response" && metadata) {
       const m = metadata as Record<string, unknown>;
       const placementId = m.placementId as string;
       const responseStatus = m.status as string;

       if (placementId && (responseStatus === "active" || responseStatus === "declined")) {
-        await db.from("placements").update({
-          status: responseStatus,
-          responded_at: new Date().toISOString(),
-        }).eq("id", placementId);
+        // The caller must be a party to THIS placement, must not be the
+        // requester, and the transition must be legal. Without these the
+        // endpoint was a second, unguarded door to the state machine
+        // that PATCH /api/placements protects (finding E33).
+        const placement = await assertPlacementParty(auth.user!, placementId, db);
+
+        if (!canRespond(placement, auth.user!.id, placement.role)) {
+          return NextResponse.json(
+            { error: "You can't respond to this placement." },
+            { status: 403 },
+          );
+        }
+        const t = canPlacementTransition(placement.status, responseStatus);
+        if (!t.ok) return NextResponse.json({ error: t.reason }, { status: 422 });
+
+        const { error: updErr } = await db
+          .from("placements")
+          .update({ status: responseStatus, responded_at: new Date().toISOString() })
+          .eq("id", placementId)
+          .eq("status", "pending");   // compare-and-set against a race
+        if (updErr) {
+          return NextResponse.json({ error: "Could not update placement" }, { status: 500 });
+        }
```

and wrap the surrounding catch per section 1.3.

`canRespond` from `@/lib/placement-permissions` already encodes "pending
only, not the requester, must be a party" and is unit-tested
(`src/lib/placement-permissions.test.ts`). Reusing it keeps one
definition of the rule instead of a third.

Longer term, delete this branch entirely and have the client call
`PATCH /api/placements`, then post the message. Two writes behind one
authorisation path beats one write behind two. Record that as a
follow-up; the guard above is the immediate fix.

**5. Test to add.** Append to the existing
`src/app/api/messages/route.test.ts`:
- non-party posts `placement_response` with a victim `placementId` → 404
  `placement_not_found`, and `db.from("placements").update` is never
  called;
- the placement's requester posts `placement_response` `{status:"active"}`
  on their own pending placement → 403;
- the counterparty posts the same → 200 and exactly one update, filtered
  on `status: "pending"`;
- counterparty posts `{status:"active"}` against an already `declined`
  placement → 422.

**6. Risk / sequencing.** Depends on `src/lib/placements/state-machine.ts`
(task 3), so it sequences after E20. The `.eq("status","pending")`
compare-and-set means a genuine double-submit now updates zero rows
rather than two; the handler must treat "zero rows updated" as success
(the state is already what the caller wanted) and not as an error, or
double-clicking Accept shows a spurious failure. The diff above returns
500 only on a database error, not on zero rows, which is the intended
behaviour.

---

### E39: `GET /api/checkout/session` is unauthenticated and discloses cross-customer PII

**1. Confirmed location.** `src/app/api/checkout/session/route.ts:5-41`.

```ts
 5: export async function GET(request: Request) {
 6:   try {
 7:     const { searchParams } = new URL(request.url);
 8:     const sessionId = searchParams.get("id");
...
14:     const session = await stripe.checkout.sessions.retrieve(sessionId, {
15:       expand: ["line_items"],
16:     });
...
21:     const saved = await loadCartSession(sessionId);
22:
23:     return NextResponse.json({
...
27:       customerEmail: session.customer_email,
28:       metadata: session.metadata,
29:       cart: saved?.cart ?? [],
30:       shipping: saved?.shipping ?? null,
```

No import of `getAuthenticatedUser`, no session-to-caller binding.

**2. Mechanism.** The Stripe checkout session id is treated as a bearer
capability. It is not one: it appears in the browser URL on the success
page, so it lands in browser history, in `Referer` headers to any
third-party asset on that page, in analytics payloads, in server access
logs, and in any support ticket where a customer pastes their receipt
URL. `loadCartSession` then joins it to the `cart_sessions` row, which
holds the full `shipping` blob (`SavedCart.shipping`,
`src/lib/cart-sessions.ts:9`) with the buyer's name and postal address.

The single mitigation present is the `expires_at` filter in
`loadCartSession` (`cart-sessions.ts:56`), which bounds the window for
the cart and shipping half. The Stripe half, including
`customer_email` and `amount_total`, has no expiry.

**3. Exploit.** Anyone who obtains a `cs_...` id, from a shared receipt
link, a leaked `Referer`, an analytics export, or a log file, replays:

```
GET /api/checkout/session?id=cs_live_a1B2c3...
```

and receives that customer's email address, order total, itemised cart
and full delivery address, with no credential of any kind. For a
marketplace shipping physical goods to residential addresses, that is a
name-plus-home-address disclosure and a UK GDPR reportable event.

Session ids are high-entropy, so this is not enumerable. The realistic
vector is leakage of an id that already exists, which is precisely what
"the id is in the URL" guarantees over time.

**4. The fix.** Bind the session to the caller. Two paths, because
checkout supports guests.

```diff
+import { getAuthenticatedUser } from "@/lib/api-auth";
+import { verifyOrderToken } from "@/lib/order-tracking-token";
+
 export async function GET(request: Request) {
   try {
     const { searchParams } = new URL(request.url);
     const sessionId = searchParams.get("id");
+    const token = searchParams.get("token");
     if (!sessionId) {
       return NextResponse.json({ error: "Session ID required" }, { status: 400 });
     }
 
     const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
+
+    // The session id is not a capability: it sits in the success-page
+    // URL, so it leaks through history, Referer and logs. Prove the
+    // caller is the buyer (finding E39).
+    //
+    //   signed-in buyer  -> session email must match the token's email
+    //   guest buyer      -> single-use signed token issued at redirect
+    let authorised = false;
+    if (token) {
+      const verified = await verifyOrderToken(token);
+      authorised = !!verified && verified.sessionId === sessionId;
+    }
+    if (!authorised) {
+      const auth = await getAuthenticatedUser(request);
+      if (auth.error) return auth.error;
+      authorised =
+        !!session.customer_email &&
+        session.customer_email.toLowerCase() === (auth.user!.email ?? "").toLowerCase();
+    }
+    if (!authorised) {
+      return NextResponse.json({ error: "Not found" }, { status: 404 });
+    }
```

`verifyOrderToken` already exists (`src/lib/order-tracking-token.ts`, used
by `/api/orders/track`); it needs a `sessionId` claim added to the token
payload, and the checkout redirect must mint one into the `success_url`.

If the guest-token work is too large for this phase, the minimum viable
change is to drop the PII from the anonymous response and keep only what
the success page needs to render a confirmation:

```diff
     return NextResponse.json({
       id: session.id,
       status: session.payment_status,
       amountTotal: (session.amount_total || 0) / 100,
-      customerEmail: session.customer_email,
-      metadata: session.metadata,
-      cart: saved?.cart ?? [],
-      shipping: saved?.shipping ?? null,
+      itemCount: session.line_items?.data.length ?? 0,
```

with the full payload served only on the authorised path above.

**5. Test to add.** `src/app/api/checkout/session/route.test.ts` (new file):
- anonymous `GET ?id=cs_x` returns 401 (or, on the reduced-payload
  variant, 200 with no `shipping` and no `customerEmail` key present);
- authenticated user whose email differs from `session.customer_email`
  returns 404;
- authenticated buyer whose email matches returns 200 with `shipping`
  populated;
- valid guest token for that session returns 200; the same token against
  a different `sessionId` returns 404.

**6. Risk / sequencing.** The success page currently calls this endpoint
anonymously right after the Stripe redirect, at which point a guest buyer
has no session. Shipping auth without the guest token breaks guest
checkout confirmation, which is the highest-traffic page in the funnel.
Do the reduced-payload variant first (it is safe for every caller and
removes the PII immediately), then add the token path, then restore the
full payload behind it. Grep the caller before touching either:

```
grep -rn "api/checkout/session" src/app src/components
```

---

## Part 3: CI lint rule

### 3.1 Rule: `wallplace/require-authz-on-mutation`

Goal: make "a service-role route that mutates without an authorisation
import" a build failure, so the next E19 cannot be added silently.

Detection, all three must hold:
1. the file is `src/app/api/**/route.ts`;
2. it imports `getSupabaseAdmin` from `@/lib/supabase-admin` (directly,
   or it imports a `@/lib/db/*` helper that does, which the allowlist
   handles case by case);
3. it exports at least one of `POST`, `PATCH`, `PUT`, `DELETE`.

Satisfied by any one of:
- an `ImportDeclaration` from `@/lib/authz`;
- an `ImportDeclaration` from `@/lib/admin-auth` (admin routes gate
  through `getAdminUser`);
- the file path is in `eslint-rules/public-routes.js`.

A second, independent check on the same detection reports when the file
imports neither `@/lib/demo-guard` nor sits on the demo allowlist. Two
messageIds so the two concerns fail separately and can be rolled out in
two PRs.

```js
// eslint-rules/require-authz-on-mutation.js
"use strict";

const { PUBLIC_ROUTES, DEMO_EXEMPT_ROUTES } = require("./public-routes");

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Normalise an absolute filename to a repo-relative posix path. */
function relPath(filename) {
  const fn = (filename || "").replace(/\\/g, "/");
  const i = fn.indexOf("src/app/api/");
  return i === -1 ? fn : fn.slice(i);
}

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "API routes that mutate through the service-role client (which bypasses RLS) " +
        "must import an assert*() helper from @/lib/authz, or be on the PUBLIC_ROUTES " +
        "allowlist with a stated reason.",
    },
    schema: [],
    messages: {
      missingAuthz:
        "{{route}} exports {{method}} and uses the service-role client, which BYPASSES RLS, " +
        "but imports nothing from @/lib/authz. Add the relevant assert*() call, or add the " +
        "route to PUBLIC_ROUTES in eslint-rules/public-routes.js with a reason.",
      missingDemoGuard:
        "{{route}} exports {{method}} and mutates, but does not import @/lib/demo-guard. " +
        "Add assertNotDemo()/assertNotDemoStrict() after the auth check, or add the route " +
        "to DEMO_EXEMPT_ROUTES in eslint-rules/public-routes.js with a reason.",
    },
  },

  create(context) {
    const file = relPath(context.filename || context.getFilename());
    if (!/^src\/app\/api\/.+\/route\.ts$/.test(file)) return {};

    let usesServiceRole = false;
    let hasAuthzImport = false;
    let hasAdminAuthImport = false;
    let hasDemoGuardImport = false;
    /** @type {{node: import("estree").Node, method: string}[]} */
    const mutators = [];

    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        if (src === "@/lib/supabase-admin") usesServiceRole = true;
        if (src === "@/lib/authz") hasAuthzImport = true;
        if (src === "@/lib/admin-auth") hasAdminAuthImport = true;
        if (src === "@/lib/demo-guard") hasDemoGuardImport = true;
      },

      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl || decl.type !== "FunctionDeclaration" || !decl.id) return;
        if (!MUTATING.has(decl.id.name)) return;
        mutators.push({ node: decl.id, method: decl.id.name });
      },

      "Program:exit"() {
        if (!usesServiceRole || mutators.length === 0) return;

        const publiclyAllowed = Object.prototype.hasOwnProperty.call(PUBLIC_ROUTES, file);
        const demoAllowed = Object.prototype.hasOwnProperty.call(DEMO_EXEMPT_ROUTES, file);

        for (const { node, method } of mutators) {
          if (!hasAuthzImport && !hasAdminAuthImport && !publiclyAllowed) {
            context.report({ node, messageId: "missingAuthz", data: { route: file, method } });
          }
          if (!hasDemoGuardImport && !demoAllowed) {
            context.report({ node, messageId: "missingDemoGuard", data: { route: file, method } });
          }
        }
      },
    };
  },
};
```

### 3.2 The allowlist

A plain module, not inline config, so each entry carries a reason and
shows up in `git blame`.

```js
// eslint-rules/public-routes.js
"use strict";

// Routes that legitimately mutate without an @/lib/authz import.
// Every entry needs a reason. Adding one is a security decision: it is
// the reviewer's job to check the stated alternative control exists.
const PUBLIC_ROUTES = {
  "src/app/api/webhooks/stripe/route.ts":
    "Stripe webhook. Authenticated by constructEvent signature verification.",
  "src/app/api/webhooks/supabase/route.ts":
    "Supabase webhook. Authenticated by HMAC over the raw body (verifySignature).",
  "src/app/api/orders/track/route.ts":
    "Guest order tracking. Authenticated by signed token or email match, rate limited.",
  "src/app/api/newsletter/route.ts":
    "Public newsletter signup. Writes only the caller's own submitted email.",
  "src/app/api/waitlist/route.ts":
    "Public waitlist signup. Writes only the caller's own submitted details.",
  "src/app/api/contact/route.ts":
    "Public contact form. Writes an inbound enquiry, reads nothing.",
  "src/app/api/enquiry/route.ts":
    "Public enquiry form. Writes an inbound enquiry, reads nothing.",
  "src/app/api/curation/route.ts":
    "Public bespoke-curation enquiry. Associates a user only when a token is present.",
  "src/app/api/register-venue/route.ts":
    "Public venue registration. Creates a pending row for admin review.",
  "src/app/api/analytics/track/route.ts":
    "Anonymous event ingest. Append-only, no row is read back to the caller.",
  "src/app/api/account/email/unsubscribe/route.ts":
    "One-click unsubscribe from an email footer. Authenticated by the signed token in the link.",
  "src/app/api/walls/[id]/route.ts":
    "Ownership enforced by the shared resolveAndAuthorize() helper in the same file. " +
    "TODO: migrate to assertOwnsWall() in @/lib/authz and remove this entry.",
};

// Routes exempt from the demo-guard requirement.
const DEMO_EXEMPT_ROUTES = {
  ...PUBLIC_ROUTES, // unauthenticated routes have no user id to test
  "src/app/api/demo/login/route.ts":
    "Signs the demo session in. Guarding it would make the demo unreachable.",
  "src/app/api/account/delete/route.ts":
    "Deleting a demo account is harmless and self-correcting on reseed.",
};

module.exports = { PUBLIC_ROUTES, DEMO_EXEMPT_ROUTES };
```

### 3.3 Wiring

```diff
 // eslint-rules/index.js
 const noRawArrangementType = require("./no-raw-arrangement-type");
+const requireAuthzOnMutation = require("./require-authz-on-mutation");
 
     "no-raw-arrangement-type": noRawArrangementType,
+    "require-authz-on-mutation": requireAuthzOnMutation,
```

```diff
 // eslint.config.mjs
       "wallplace/no-raw-arrangement-type": "error",
+      "wallplace/require-authz-on-mutation": "error",
```

### 3.4 Stale-allowlist guard

ESLint cannot report an allowlist entry that no longer matches any file.
Add a small script so a deleted or renamed route cannot leave a stale
exemption behind:

```ts
// scripts/audit/check-public-routes.ts
// Fails if any PUBLIC_ROUTES / DEMO_EXEMPT_ROUTES key does not resolve to
// a real file, or if any entry has an empty reason.
```

Wire into `package.json`:

```diff
-    "check": "npm run lint && npm run typecheck && npm run test",
+    "check": "npm run lint && npm run typecheck && npm run test && npm run audit:allowlist",
+    "audit:allowlist": "tsx scripts/audit/check-public-routes.ts",
```

### 3.5 Known limits of the rule

State them in the rule's doc comment so nobody over-trusts it:

- It is an **import-presence** check, not a call-graph check. A route can
  import `@/lib/authz` and never call it. The negative tests in Part 2 are
  what prove the call actually happens; the rule only stops the "no
  authorisation concept at all" class.
- It does not follow indirection. `src/app/api/artist-works/route.ts`
  does not import `getSupabaseAdmin` at all; `src/lib/db/artist-works.ts`
  does. So E32's file would not have been caught by this rule. Task 12
  extends detection to flag `src/lib/db/*` imports from mutating routes
  as service-role-equivalent, which closes that specific hole.
- `src/app/api/walls/[id]/route.ts` is a legitimate implementation using
  a local helper and is allowlisted with a migration TODO rather than
  being contorted to satisfy the rule.

---

## Part 4: Ordered task checklist

Each task is half a day or less. Tasks 1 to 3 unblock everything else.
Within a phase, tasks are independent and can be parallelised.

**Phase A: foundations**

1. Add `website/src/lib/authz.ts` exactly as in section 1.1, plus
   `website/src/lib/authz.test.ts` covering: each `assert*` throws
   `AuthzError` with status 404 on a non-match; `assertOwnsArtistProfile`
   and `assertVenueOwner` throw 403 when the profile is missing;
   `handleAuthzError` returns null for a non-AuthzError.
2. Add `website/src/lib/placements/state-machine.ts` and
   `website/src/lib/placements/state-machine.test.ts` (section 1.2).
   Before writing the transition table, run the
   `select status, count(*) from placements group by 1` check and record
   the output in the PR description.
3. Add `website/eslint-rules/require-authz-on-mutation.js`,
   `website/eslint-rules/public-routes.js`, wire both into
   `website/eslint-rules/index.js` and `website/eslint.config.mjs`, with
   `require-authz-on-mutation` set to `"warn"` for now. Add
   `website/scripts/audit/check-public-routes.ts` and the
   `audit:allowlist` script.

**Phase B: the unauthenticated routes (no dependencies, highest value)**

4. **E19.** Grep for callers of `POST /api/orders`; delete the handler in
   `website/src/app/api/orders/route.ts:329-359` if there are none.
   Add the regression test to
   `website/src/app/api/orders/route.test.ts`.
5. **E39, part 1.** Strip `customerEmail`, `metadata`, `cart` and
   `shipping` from the anonymous response in
   `website/src/app/api/checkout/session/route.ts`. Add
   `website/src/app/api/checkout/session/route.test.ts`. Update the
   success page to match.
6. **E17 + E18.** Add auth and visibility gating to
   `website/src/app/api/artwork-requests/[id]/route.ts` (GET) and
   `website/src/app/api/artwork-requests/[id]/responses/route.ts` (GET).
   Change
   `website/src/app/(pages)/artist-portal/artwork-requests/[id]/page.tsx:86`
   from `fetch` to `authFetch`. New test file for `[id]`, extend the
   existing test file for `responses`.

**Phase C: the write IDORs**

7. **E32.** Scope the probe and every update in
   `website/src/lib/db/artist-works.ts` to `artist_id`; add the 23505 to
   409 mapping in `website/src/app/api/artist-works/route.ts`. New
   `website/src/lib/db/artist-works.test.ts`, extend
   `website/src/app/api/artist-works/route.test.ts`. Run the orphan-row
   query first and record the result.
8. **E31.** Add `assertConversationParticipant` to GET and PATCH in
   `website/src/app/api/messages/[conversationId]/route.ts`; derive the
   reader slug from the session. Migrate DELETE to the same helper. New
   `website/src/app/api/messages/[conversationId]/route.test.ts`.
9. **E33.** Guard the `placement_response` branch in
   `website/src/app/api/messages/route.ts:504-530` with
   `assertPlacementParty` + `canRespond` + `canPlacementTransition` +
   compare-and-set. Extend
   `website/src/app/api/messages/route.test.ts`.

**Phase D: the state gaps**

10. **E20 + E23b.** Add the `canPlacementTransition` gate and widen the
    requester guard in `website/src/app/api/placements/route.ts`; fix
    `becameCollected` to key on the effective status; narrow
    `placementUpdateSchema` in `website/src/lib/validations.ts`. New
    `website/src/app/api/placements/route.test.ts`.
11. **E21.** Split seller and buyer transition sets in
    `website/src/app/api/orders/route.ts` PATCH via `assertOrderParty`;
    remove the artist-portal "Mark delivered" control and add the
    customer-portal "Confirm delivery" control. Extend
    `website/src/app/api/orders/route.test.ts`.
12. **E22.** Add the three idempotency gates and the compare-and-set
    status advance in
    `website/src/app/api/artwork-requests/[id]/fulfill/route.ts`. Write
    the accompanying migration
    (`website/supabase/migrations/0NN_artwork_request_response_single_fulfilment.sql`)
    adding `source_response_id` plus the partial unique indexes, and
    widening the response status CHECK to include `'fulfilled'`. Run the
    duplicate-detection query before creating the index. New
    `website/src/app/api/artwork-requests/[id]/fulfill/route.test.ts`.

**Phase E: the systemic controls**

13. **E23a.** Wire `assertNotDemo` / `assertNotDemoStrict` into every
    mutating route, strict variant on anything that sends email or
    touches money. Add
    `website/tests/integration/demo-guard-coverage.test.ts`. Split across
    two PRs if the diff exceeds ~30 files.
14. Convert every bare `catch {}` in a route touched by phases B to D to
    the `handleAuthzError` pattern from section 1.3, and add one
    status-code assertion per route so a swallowed `AuthzError` fails CI.
15. Extend `require-authz-on-mutation` to treat an import from
    `@/lib/db/*` as service-role-equivalent (closing the E32 blind spot),
    then flip the rule from `"warn"` to `"error"` in
    `website/eslint.config.mjs`. Land only once phases B to D are green,
    or CI will be red on known work.
16. **E39, part 2.** Add a `sessionId` claim to
    `website/src/lib/order-tracking-token.ts`, mint the token into the
    Stripe `success_url` in `website/src/app/api/checkout/route.ts`, and
    restore the full payload in
    `website/src/app/api/checkout/session/route.ts` behind the
    token-or-matching-email check. Extend the phase B test file.

---

## Appendix A: checked and clean

Recorded so these are not re-audited:

- **`deleteWork`** (`src/lib/db/artist-works.ts:127-135`) is correctly
  scoped with `.eq("artist_id", artistProfileId)`. Only the upsert path
  is vulnerable.
- **`PATCH /api/artwork-requests/[id]`**
  (`src/app/api/artwork-requests/[id]/route.ts:68-116`) authenticates and
  checks `existing.venue_user_id !== auth.user!.id`. It is a
  fetch-then-compare rather than a same-query predicate, so it is worth
  migrating to `assertArtworkRequestOwner` for consistency, but it is not
  exploitable as written.
- **`PATCH /api/artwork-requests/[id]/responses/[responseId]`**
  (`.../[responseId]/route.ts:43-56`) checks venue ownership *and* has the
  idempotency gate the fulfil route lacks (`resp.status !== "sent"` → 409).
  It is the reference implementation for the E22 fix.
- **`src/app/api/walls/[id]/route.ts`** looked unauthenticated to a
  per-handler scan because GET, PATCH and DELETE all delegate to a local
  `resolveAndAuthorize()` helper (`:59-80`) that does authenticate and
  does check `wall.user_id !== auth.user!.id`, returning 404 rather than
  403 so it does not leak existence. Correct as written.
- **`POST /api/messages`** resolves the sender slug and sender type from
  the caller's own profile and explicitly refuses to trust the
  client-supplied `senderName` (`:297-316`). The impersonation vector it
  documents is genuinely closed. Only the `placement_response` branch
  (E33) is unguarded.
- **`src/lib/admin-auth.ts`** requires `user_metadata.user_type ===
  "admin"` **and** an env allowlist or `admin_users` row, and fails
  closed with 503 when `ADMIN_EMAILS` is unset. No gap found.
- **`GET /api/orders`** scopes by `buyer_user_id` / `artist_user_id` /
  `artist_slug` / `venue_slug` / sanitised `buyer_email` and passes the
  email through a charset guard before the `.or()` (`:37`). No gap found.
