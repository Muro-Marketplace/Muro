// Server-only artist-profile DB helpers (use the service-role admin client).
// The pure transform helpers (DbArtistProfile, DbArtistWork, dbProfileToArtist)
// live in artist-profiles-transform.ts so that client components can import them
// without pulling the admin client into the browser bundle.
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { assertNoServerOwned, ARTIST_PROFILE_SERVER_OWNED } from "@/lib/db/writable-fields";
import type { Artist } from "@/data/artists";
import {
  dbProfileToArtist,
  normalisePriceBand,
  type DbArtistProfile,
  type DbArtistWork,
} from "./artist-profiles-transform";

// Re-export the pure transform helpers so existing server-side callers that
// imported them from this module keep working unchanged.
export { dbProfileToArtist, normalisePriceBand };
export type { DbArtistProfile, DbArtistWork };

export async function getArtistProfileByUserId(userId: string) {
  const db = getSupabaseAdmin();
  const { data: profile } = await db
    .from("artist_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!profile) return null;

  const { data: works } = await db
    .from("artist_works")
    .select("*")
    .eq("artist_id", profile.id)
    .order("sort_order", { ascending: true });

  return { profile: profile as DbArtistProfile, works: (works || []) as DbArtistWork[] };
}

export async function getArtistProfileBySlug(slug: string) {
  const db = getSupabaseAdmin();
  const { data: profile } = await db
    .from("artist_profiles")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!profile) return null;

  const { data: works } = await db
    .from("artist_works")
    .select("*")
    .eq("artist_id", profile.id)
    .order("sort_order", { ascending: true });

  // T9 / N1: the collect-from-venue CTA must key on a LIVE placement, not on
  // the presence of an in-store price — before this, the CTA rendered
  // identically whether the piece hung on a venue wall or in the artist's
  // flat. One batched read for the profile's placed works; no FK exists from
  // artist_works.current_placement_id to placements, so this cannot be a
  // PostgREST embed.
  const placementIds = (works || [])
    .map((w) => (w as { current_placement_id?: string | null }).current_placement_id)
    .filter((x): x is string => Boolean(x));
  const placementsById = new Map<string, {
    id: string; venue_slug: string | null; venue: string | null; status: string | null;
    collection_address: string | null; placed_size_label: string | null;
  }>();
  if (placementIds.length > 0) {
    const { data: placementRows } = await db
      .from("placements")
      .select("id, venue_slug, venue, status, collection_address, placed_size_label")
      .in("id", placementIds);
    for (const row of placementRows || []) {
      placementsById.set(row.id, row);
    }
  }
  const worksWithPlacement = (works || []).map((w) => {
    const pid = (w as { current_placement_id?: string | null }).current_placement_id;
    const pl = pid ? placementsById.get(pid) : undefined;
    return {
      ...(w as DbArtistWork),
      current_placement: pl
        ? {
            id: pl.id,
            venueSlug: pl.venue_slug,
            venueName: pl.venue,
            status: pl.status,
            collectionAddress: pl.collection_address,
            placedSizeLabel: pl.placed_size_label,
          }
        : null,
    };
  });

  return { profile: profile as DbArtistProfile, works: worksWithPlacement as DbArtistWork[] };
}

export async function getAllDatabaseArtists(): Promise<Artist[]> {
  // Only surface profiles the admin has approved. Profiles created through
  // /apply/claim default to pending and stay hidden until review_status
  // flips to "approved". Legacy rows without the column get treated as
  // approved (the query below falls back if the column doesn't exist yet).
  //
  // D38 / ADR 0004: this is the marketplace listing read, and it was the LAST
  // anon-client `SELECT *` on artist_profiles. Migration 076 revokes anon's
  // SELECT on the PII/Stripe columns (postcode, stripe_customer_id,
  // stripe_connect_account_id, stripe_subscription_id), which would make an anon
  // `SELECT *` fail with "permission denied for column". So this reads via the
  // service-role client instead, the same defence-in-depth pattern 071 used for
  // venue_profiles (server routes read via service-role, which is not subject to
  // column grants; the anon key can no longer read those columns via PostgREST
  // directly). This runs server-side only, and keeps the explicit
  // review_status filter, so the rows and columns returned are unchanged.
  const db = getSupabaseAdmin();
  let profiles: unknown[] | null = null;
  {
    const res = await db
      .from("artist_profiles")
      .select("*")
      .eq("review_status", "approved")
      .order("created_at", { ascending: false });
    if (res.error && /review_status/.test(res.error.message)) {
      // Column not yet migrated, fall back to the old behaviour.
      const all = await db
        .from("artist_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      profiles = all.data;
    } else {
      profiles = res.data;
    }
  }

  if (!profiles || profiles.length === 0) return [];

  const profileIds = profiles.map((p) => (p as { id: string }).id);
  const { data: allWorks } = await db
    .from("artist_works")
    .select("*")
    .in("artist_id", profileIds)
    .order("sort_order", { ascending: true });

  return profiles.map((profile) => {
    const p = profile as DbArtistProfile;
    const works = (allWorks || []).filter((w) => w.artist_id === p.id);
    return dbProfileToArtist(p, works as DbArtistWork[]);
  });
}

export async function upsertArtistProfile(
  userId: string,
  data: Partial<Omit<DbArtistProfile, "id" | "user_id">>,
  opts: { allowServerOwned?: readonly string[] } = {},
) {
  // A5 (E44). The guard lives HERE, not at the call sites, so no caller can skip
  // it: every write to artist_profiles goes through this function. A call site
  // that legitimately sets a server-owned column names it in allowServerOwned,
  // which is a reviewable declaration rather than a hole.
  //
  // E44 was exactly this shape: `{ ...body }` handed the client the whole row,
  // including review_status (self-approve), subscription_plan (self-grant Pro)
  // and stripe_connect_account_id (redirect payouts). pickWritable stops that at
  // the route; this stops it at the boundary, for any future caller too.
  assertNoServerOwned(
    data as Record<string, unknown>,
    ARTIST_PROFILE_SERVER_OWNED,
    "artist_profiles",
    opts.allowServerOwned,
  );

  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("artist_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (existing) {
    const { error } = await db
      .from("artist_profiles")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    return { error };
  } else {
    // New row: force review_status='pending' on insert UNLESS the
    // caller explicitly passed one (e.g. an admin claim flow that
    // approves on creation). Migration 023 set the column default
    // to 'approved', which meant any artist editing their profile
    // before admin review showed up on the public marketplace
    // immediately. Code-level default flips it the other way; the
    // admin still has to flip it to 'approved' to publish.
    const insertPayload = {
      ...data,
      user_id: userId,
      review_status:
        (data as { review_status?: string }).review_status ?? "pending",
    };
    const { error } = await db.from("artist_profiles").insert(insertPayload);
    return { error };
  }
}
