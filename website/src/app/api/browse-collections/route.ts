import { NextResponse } from "next/server";
import { collections as staticCollections } from "@/data/collections";
import type { ArtistCollection } from "@/data/collections";

/**
 * Public endpoint: returns all available collections (static + database).
 */
export async function GET() {
  const allCollections: ArtistCollection[] = [...staticCollections];

  // Fetch database collections
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("artist_collections")
      .select("*")
      .eq("available", true)
      .order("created_at", { ascending: false });

    if (data) {
      // Fetch artist names for the collections
      const slugs = [...new Set(data.map((r: { artist_slug: string }) => r.artist_slug).filter(Boolean))];
      let artistMap: Record<string, { name: string; image: string }> = {};
      if (slugs.length > 0) {
        const { data: profiles } = await db
          .from("artist_profiles")
          .select("slug, name, profile_image")
          .in("slug", slugs);
        if (profiles) {
          for (const p of profiles) {
            artistMap[p.slug] = { name: p.name, image: p.profile_image };
          }
        }
      }

      for (const row of data) {
        if (allCollections.some((c) => c.id === row.id)) continue;
        const artist = artistMap[row.artist_slug] || {};
        allCollections.push({
          id: row.id,
          artistSlug: row.artist_slug || "",
          artistName: artist.name || row.artist_slug || "",
          name: row.name,
          description: row.description || undefined,
          workIds: row.work_ids || [],
          bundlePrice: row.bundle_price || 0,
          bundlePriceBand: row.bundle_price ? `£${row.bundle_price}` : "",
          coverImage: artist.image || `https://picsum.photos/seed/${row.id}/900/600`,
          available: true,
        });
      }
    }
  } catch {
    // DB not available — just return static collections
  }

  return NextResponse.json({ collections: allCollections.filter((c) => c.available) });
}
