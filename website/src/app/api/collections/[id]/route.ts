import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ArtistCollection, CollectionWorkSize } from "@/data/collections";
import type { ArtistWork, SizePricing } from "@/data/artists";

interface DbWorkRow {
  id: string;
  title: string;
  medium: string | null;
  dimensions: string | null;
  price_band: string | null;
  pricing: SizePricing[] | null;
  available: boolean;
  color: string | null;
  image: string;
  orientation: string | null;
}

/**
 * Public endpoint: returns a single published collection with resolved work details.
 * Used by the collection detail page so it does not depend on client-side static data.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();

    const { data: row, error } = await db
      .from("artist_collections")
      .select("*")
      .eq("id", id)
      .eq("available", true)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const { data: profile } = await db
      .from("artist_profiles")
      .select("slug, name, profile_image")
      .eq("slug", row.artist_slug)
      .single();

    const workIds: string[] = Array.isArray(row.work_ids) ? row.work_ids : [];
    const workSizes: CollectionWorkSize[] = Array.isArray(row.work_sizes)
      ? row.work_sizes
      : [];

    let works: (ArtistWork & { selectedSize?: string; selectedSizePrice?: number })[] = [];
    if (workIds.length > 0) {
      const { data: workRows } = await db
        .from("artist_works")
        .select("*")
        .in("id", workIds);

      const byId = new Map<string, DbWorkRow>();
      for (const w of (workRows || []) as DbWorkRow[]) byId.set(w.id, w);

      const sizeByWork = new Map<string, string>();
      for (const ws of workSizes) sizeByWork.set(ws.workId, ws.sizeLabel);

      works = workIds
        .map((wid) => {
          const w = byId.get(wid);
          if (!w) return null;
          const selectedSize = sizeByWork.get(wid);
          const pricing = w.pricing || [];
          const sizeEntry = selectedSize
            ? pricing.find((p) => p.label === selectedSize)
            : pricing[0];
          const work: ArtistWork & { selectedSize?: string; selectedSizePrice?: number } = {
            id: w.id,
            title: w.title,
            medium: w.medium || "",
            dimensions: w.dimensions || "",
            priceBand: w.price_band || "",
            pricing,
            available: w.available,
            color: w.color || "#C17C5A",
            image: w.image,
            orientation:
              (w.orientation as "portrait" | "landscape" | "square") || undefined,
            selectedSize: sizeEntry?.label || selectedSize,
            selectedSizePrice: sizeEntry?.price,
          };
          return work;
        })
        .filter(
          (x): x is ArtistWork & { selectedSize?: string; selectedSizePrice?: number } =>
            !!x
        );
    }

    const thumbnail: string | undefined = row.thumbnail || undefined;
    const bannerImage: string | undefined = row.banner_image || undefined;
    const artistImage = profile?.profile_image || "";
    const coverImage =
      thumbnail ||
      bannerImage ||
      artistImage ||
      `https://picsum.photos/seed/${row.id}/900/600`;

    const collection: ArtistCollection = {
      id: row.id,
      artistSlug: row.artist_slug,
      artistName: profile?.name || row.artist_slug,
      name: row.name,
      description: row.description || undefined,
      workIds,
      workSizes,
      bundlePrice: row.bundle_price || 0,
      bundlePriceBand: row.bundle_price ? `£${row.bundle_price}` : "",
      thumbnail,
      bannerImage,
      coverImage,
      available: true,
    };

    return NextResponse.json({ collection, works });
  } catch (e) {
    console.error("Collection detail error:", e);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
