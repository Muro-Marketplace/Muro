// Central authorisation helpers for service-role API routes (CC1).
//
// Context: most route files under src/app/api call getSupabaseAdmin(), which
// uses the service-role key and therefore BYPASSES every RLS policy. Row
// ownership has to be enforced in application code on each of those routes.
// These helpers are the single place that happens.
//
// Two rules they exist to enforce:
//
//   1. The ownership predicate goes in the SAME query that fetches the row. A
//      fetch-then-compare leaves a window where a later refactor drops the
//      comparison and nothing fails loudly. With the .eq() in the query, a
//      non-owner gets zero rows, so a forgotten check reads as "no data", not
//      "someone else's data".
//
//   2. Denial is 404 by default, not 403. A 403 confirms the row exists, which
//      is an enumeration oracle. Pass 403 only where the caller already knows
//      the row exists (they lack a profile, or hold the wrong role on a row
//      they are party to).
//
// Call style: these THROW AuthzError. Any route handler that wraps its body in
// try/catch MUST call handleAuthzError(err) as the first statement of the catch
// and return its result when non-null, otherwise the 404 is swallowed by the
// generic 400. See docs/plans/implementation/01-authz-idor.md §1.3.

import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { orFilter } from "@/lib/db/safe-filter";

/**
 * Minimal shape of an authenticated caller. Structurally compatible with the
 * Supabase `User` that getAuthenticatedUser() returns, so call sites can pass
 * `auth.user!` directly.
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
 * Returns the AuthzError's response, or null when `err` is anything else. Use as
 * the FIRST statement of every catch block in a route that calls an assert*():
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

// Email charset safe to interpolate into a PostgREST .or() term. orFilter()
// drops unsafe terms anyway; testing first lets us decide whether the
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
 * Artist profile plus an approved-review gate. Use on any route that commits the
 * artist to something a venue or a buyer will see or pay for. review_status is
 * one of pending | approved | rejected, so this correctly rejects 'rejected' as
 * well as 'pending'.
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
    db
      .from("artist_profiles")
      .select("slug")
      .eq("user_id", actorId)
      .maybeSingle<{ slug: string | null }>(),
    db
      .from("venue_profiles")
      .select("slug")
      .eq("user_id", actorId)
      .maybeSingle<{ slug: string | null }>(),
  ]);
  return [artist.data?.slug, venue.data?.slug].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
}

/**
 * Conversation ids are deterministic (`dm-${slugA}__${slugB}`, sorted), so they
 * are guessable from two public profile slugs. Participation has to be proved
 * against the message rows, never assumed from the id.
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
    .or(orFilter([`sender_id.eq.${actor.id}`, `recipient_user_id.eq.${actor.id}`]))
    .limit(1);
  if (byId.data && byId.data.length > 0) return { conversationId, slugs };

  // Legacy rows predate recipient_user_id and only carry slugs.
  if (slugs.length > 0) {
    const bySlug = await db
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .or(
        orFilter([
          ...slugs.map((s) => `sender_name.eq.${s}`),
          ...slugs.map((s) => `recipient_slug.eq.${s}`),
        ]),
      )
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
  /**
   * Who proposed the placement. NOTE: 01 §1.1 called this `requester_user_id`,
   * which exists in no migration and not in the live table. The real column is
   * `proposed_by_user_id`, which is what api/placements/route.ts writes.
   */
  proposed_by_user_id: string | null;
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
      "id, artist_user_id, venue_user_id, artist_slug, venue_slug, venue, status, proposed_by_user_id",
    )
    .eq("id", placementId)
    .or(orFilter([`artist_user_id.eq.${actor.id}`, `venue_user_id.eq.${actor.id}`]))
    .maybeSingle<Omit<PlacementRef, "role">>();
  if (!data) deny("placement_not_found", "Placement not found.");
  const role: PlacementRole = data.artist_user_id === actor.id ? "artist" : "venue";
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
    data.artist_user_id === actor.id || (!!mySlug && data.artist_slug === mySlug);
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
    // A named slug must not be confirmed to a non-owner, so that path is 404.
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

export type ArtworkRequestViewerRole = "owner" | "invited_artist" | "browsing_artist";

/**
 * Read-side counterpart of assertArtworkRequestOwner. Mirrors the visibility
 * rules the list endpoint already applies: semi_public is visible to any
 * approved artist, private only to artists named in invited_artist_slugs.
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
  const slug = profile?.review_status === "approved" ? profile.slug ?? null : null;
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
