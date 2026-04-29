import { NextResponse } from "next/server";
import type { ArtistCollection } from "@/data/collections";

/**
 * Public endpoint: returns all available collections from the database.
 * No static seed data, collections are created by artists only.
 */
export async function GET() {
  const allCollections: ArtistCollection[] = [];

  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("artist_collections")
      .select("*")
      .eq("available", true)
      .order("created_at", { ascending: false });

    if (data) {
      // Fetch artist names/images for the collections
      const slugs = [
        ...new Set(data.map((r: { artist_slug: string }) => r.artist_slug).filter(Boolean)),
      ];
      const artistMap: Record<string, { name: string; image: string }> = {};
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
        const artist = artistMap[row.artist_slug] || { name: "", image: "" };
        const thumbnail: string | undefined = row.thumbnail || undefined;
        const bannerImage: string | undefined = row.banner_image || undefined;
        const coverImage =
          thumbnail ||
          bannerImage ||
          artist.image ||
          `https://picsum.photos/seed/${row.id}/900/600`;
        allCollections.push({
          id: row.id,
          artistSlug: row.artist_slug || "",
          artistName: artist.name || row.artist_slug || "",
          name: row.name,
          description: row.description || undefined,
          workIds: Array.isArray(row.work_ids) ? row.work_ids : [],
          workSizes: Array.isArray(row.work_sizes) ? row.work_sizes : [],
          bundlePrice: row.bundle_price || 0,
          bundlePriceBand: row.bundle_price ? `£${row.bundle_price}` : "",
          thumbnail,
          bannerImage,
          coverImage,
          available: true,
        });
      }
    }
  } catch {
    // DB not available, return empty
  }

  return NextResponse.json({ collections: allCollections });
}
