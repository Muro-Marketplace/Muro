import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  ArtistCollection,
  CollectionSizeTier,
  CollectionWorkSize,
} from "@/data/collections";
import { cheapestTier, collectionPriceBand } from "@/lib/collection-tiers";
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
      .select("slug, name, profile_image, open_to_free_loan, open_to_revenue_share, revenue_share_percent, open_to_outright_purchase")
      .eq("slug", row.artist_slug)
      .single();

    const workIds: string[] = Array.isArray(row.work_ids) ? row.work_ids : [];
    const workSizes: CollectionWorkSize[] = Array.isArray(row.work_sizes)
      ? row.work_sizes
      : [];
    const sizeTiers: CollectionSizeTier[] = Array.isArray(row.size_tiers)
      ? row.size_tiers
      : [];

    // The page opens on the cheapest tier, so the sizes resolved below have to
    // be that tier's, not `work_sizes`. On a tiered collection `work_sizes` is
    // a leftover from before the artist added tiers and would show a size the
    // selected tier does not include.
    //
    // Only the DEFAULT view is resolved here. Every other tier is priced on the
    // client from each work's own `pricing` array, which this route already
    // returns in full, so switching tiers costs no round trip.
    const defaultTier = cheapestTier(sizeTiers);
    const defaultSizes: CollectionWorkSize[] = defaultTier
      ? defaultTier.workSizes
      : workSizes;

    let works: (ArtistWork & { selectedSize?: string; selectedSizePrice?: number })[] = [];
    if (workIds.length > 0) {
      const { data: workRows } = await db
        .from("artist_works")
        .select("*")
        .in("id", workIds);

      const byId = new Map<string, DbWorkRow>();
      for (const w of (workRows || []) as DbWorkRow[]) byId.set(w.id, w);

      const sizeByWork = new Map<string, string>();
      for (const ws of defaultSizes) sizeByWork.set(ws.workId, ws.sizeLabel);

      works = workIds
        .map((wid) => {
          const w = byId.get(wid);
          if (!w) return null;
          const selectedSize = sizeByWork.get(wid);
          const pricing = w.pricing || [];
          // A pinned label that no longer matches any of the work's sizes is
          // treated the same as no pin at all: fall back to the work's first
          // size. The route already did this for an unpinned work, and the
          // half that was missing rendered a size the work does not sell, with
          // no price beside it. The artist renaming a size after building the
          // collection is the ordinary way to get here, and it costs nothing,
          // because a tier's price is typed rather than summed from these.
          const sizeEntry =
            (selectedSize ? pricing.find((p) => p.label === selectedSize) : undefined) ??
            pricing[0];
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
      sizeTiers,
      // The trigger in migration 136 keeps bundle_price on the cheapest tier,
      // but the tiers are the truth if a row ever drifts.
      bundlePrice: defaultTier?.price ?? row.bundle_price ?? 0,
      bundlePriceBand: collectionPriceBand(row.bundle_price, sizeTiers) ?? "",
      thumbnail,
      bannerImage,
      coverImage,
      available: true,
    };

    // Surface the artist's arrangement preferences alongside the
    // collection so the detail page can render the same Display /
    // Rev share / Purchase chips that gallery work cards do (#42).
    // Defaults match the artist profile defaults, null/undefined =
    // open, so existing artists who pre-date these columns aren't
    // accidentally hidden from placement requests.
    const artistArrangements = {
      openToFreeLoan: profile?.open_to_free_loan ?? true,
      openToRevenueShare: profile?.open_to_revenue_share ?? true,
      revenueSharePercent: profile?.revenue_share_percent ?? null,
      openToOutrightPurchase: profile?.open_to_outright_purchase ?? true,
    };

    return NextResponse.json({ collection, works, artistArrangements });
  } catch (e) {
    console.error("Collection detail error:", e);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
