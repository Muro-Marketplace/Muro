import { NextResponse } from "next/server";
import { collections as staticCollections } from "@/data/collections";
import type { ArtistCollection } from "@/data/collections";

/**
 * Public endpoint: returns all available collections (static + database).
 */
export async function GET() {
  const allCollections: ArtistCollection[] = [...staticCollections];

  // Try to fetch database collections
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("artist_collections")
      .select("*, artist_profiles!inner(slug, name, profile_image)")
      .order("created_at", { ascending: false });

    if (data) {
      for (const row of data) {
        // Skip if already in static data
        if (allCollections.some((c) => c.id === row.id)) continue;

        const artistProfile = row.artist_profiles as { slug: string; name: string; profile_image: string } | null;
        allCollections.push({
          id: row.id,
          artistSlug: row.artist_slug || artistProfile?.slug || "",
          artistName: artistProfile?.name || row.artist_slug || "",
          name: row.name,
          description: row.description || undefined,
          workIds: row.work_ids || [],
          bundlePrice: row.bundle_price || 0,
          bundlePriceBand: row.bundle_price ? `£${row.bundle_price}` : "",
          coverImage: artistProfile?.profile_image || `https://picsum.photos/seed/${row.id}/900/600`,
          available: true,
        });
      }
    }
  } catch {
    // DB not available — just return static collections
  }

  return NextResponse.json({ collections: allCollections.filter((c) => c.available) });
}
