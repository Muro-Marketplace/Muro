/**
 * Server-side fetch of an artist's published collections by slug.
 *
 * The seed-data `getCollectionsByArtist()` (in src/data/collections.ts)
 * only ever filtered the empty seed array, so collections created via
 * /artist-portal/collections never surfaced on the public profile.
 * This helper goes to Supabase directly and returns the same
 * ArtistCollection-shaped objects the public profile expects.
 *
 * Server-only (uses the admin client). Don't import from a client
 * component.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ArtistCollection } from "@/data/collections";

interface DbCollectionRow {
  id: string;
  artist_id: string;
  artist_slug: string | null;
  name: string;
  description: string | null;
  bundle_price: number | null;
  work_ids: string[] | null;
  work_sizes: { workId: string; sizeLabel: string }[] | null;
  thumbnail: string | null;
  banner_image: string | null;
  cover_image: string | null;
  available: boolean | null;
  created_at: string;
}

function rowToCollection(
  row: DbCollectionRow,
  artistName: string,
): ArtistCollection {
  const bundlePrice = row.bundle_price ?? 0;
  // Provide a reasonable price band string for UI consumers that
  // expect it (CollectionCard renders this directly).
  const bundlePriceBand =
    bundlePrice > 0 ? `£${bundlePrice}` : "Price on enquiry";
  return {
    id: row.id,
    artistSlug: row.artist_slug ?? "",
    artistName,
    name: row.name,
    description: row.description ?? "",
    workIds: Array.isArray(row.work_ids) ? row.work_ids : [],
    workSizes: Array.isArray(row.work_sizes) ? row.work_sizes : undefined,
    bundlePrice,
    bundlePriceBand,
    thumbnail: row.thumbnail ?? undefined,
    bannerImage: row.banner_image ?? undefined,
    coverImage: row.cover_image || row.thumbnail || row.banner_image || "",
    available: row.available ?? true,
  };
}

/**
 * Fetch every published, available collection for the given artist
 * slug. Returns an empty array on missing artist, no collections, or
 * any DB error (errors logged) — the consumer renders nothing in that
 * case, which matches the seed-data behaviour.
 */
export async function getCollectionsByArtistSlug(
  slug: string,
  artistName: string,
): Promise<ArtistCollection[]> {
  if (!slug) return [];
  const db = getSupabaseAdmin();

  // Resolve the profile id from the slug — collections store
  // artist_id, not slug, as their owner pointer.
  const { data: profile, error: profileErr } = await db
    .from("artist_profiles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (profileErr) {
    console.warn("[artist-collections] profile lookup failed:", profileErr.message);
    return [];
  }
  if (!profile) return [];

  const { data, error } = await db
    .from("artist_collections")
    .select("*")
    .eq("artist_id", (profile as { id: string }).id)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[artist-collections] list query failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as DbCollectionRow[];
  return rows.map((r) => rowToCollection(r, artistName));
}
