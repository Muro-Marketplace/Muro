import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { isFlagOn } from "@/lib/feature-flags";
import { isSubscribed } from "@/lib/subscriptions";
import { parseCollectionSizeTiers } from "@/lib/collection-tiers";
import type { CollectionSizeTier } from "@/data/collections";

type CollectionPayload = {
  name?: unknown;
  description?: unknown;
  bundlePrice?: unknown;
  workIds?: unknown;
  workSizes?: unknown;
  sizeTiers?: unknown;
  thumbnail?: unknown;
  bannerImage?: unknown;
  available?: unknown;
};

type DbRow = {
  id: string;
  artist_id: string;
  artist_slug: string;
  name: string;
  description: string | null;
  bundle_price: number | null;
  work_ids: string[] | null;
  work_sizes: { workId: string; sizeLabel: string }[] | null;
  size_tiers: CollectionSizeTier[] | null;
  thumbnail: string | null;
  banner_image: string | null;
  available: boolean;
  created_at: string;
  updated_at: string | null;
};

function rowToClient(row: DbRow) {
  return {
    id: row.id,
    artistSlug: row.artist_slug,
    name: row.name,
    description: row.description || "",
    bundlePrice: row.bundle_price != null ? String(row.bundle_price) : "",
    workIds: Array.isArray(row.work_ids) ? row.work_ids : [],
    workSizes: Array.isArray(row.work_sizes) ? row.work_sizes : [],
    sizeTiers: Array.isArray(row.size_tiers) ? row.size_tiers : [],
    thumbnail: row.thumbnail || undefined,
    bannerImage: row.banner_image || undefined,
    available: row.available,
    createdAt: row.created_at,
  };
}

function parseBody(body: CollectionPayload) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" && body.description.trim() !== ""
      ? body.description.trim()
      : null;
  const bundlePriceRaw = body.bundlePrice;
  const bundlePrice =
    bundlePriceRaw === null || bundlePriceRaw === undefined || bundlePriceRaw === ""
      ? null
      : parseFloat(String(bundlePriceRaw));
  const workIds = Array.isArray(body.workIds)
    ? body.workIds.filter((x): x is string => typeof x === "string")
    : [];
  const workSizes = Array.isArray(body.workSizes)
    ? body.workSizes
        .filter(
          (x): x is { workId: string; sizeLabel: string } =>
            !!x &&
            typeof x === "object" &&
            typeof (x as { workId?: unknown }).workId === "string" &&
            typeof (x as { sizeLabel?: unknown }).sizeLabel === "string"
        )
        .map((x) => ({ workId: x.workId, sizeLabel: x.sizeLabel }))
    : [];
  const thumbnail =
    typeof body.thumbnail === "string" && body.thumbnail.trim() !== ""
      ? body.thumbnail.trim()
      : null;
  const bannerImage =
    typeof body.bannerImage === "string" && body.bannerImage.trim() !== ""
      ? body.bannerImage.trim()
      : null;
  // D15: the publish gate needs to distinguish "the caller asked to publish"
  // from "the caller said nothing and we defaulted to true", so the explicit
  // flag travels alongside the resolved value.
  const availableExplicit = typeof body.available === "boolean";
  const available = availableExplicit ? (body.available as boolean) : true;

  // Size tiers are validated rather than filtered, because the tier LABEL is
  // the key api/checkout re-prices a bundle against. A duplicate or blank
  // label there is not cosmetic, it makes the charge ambiguous, so the route
  // refuses the write instead of quietly cleaning it up.
  const parsedTiers = parseCollectionSizeTiers(body.sizeTiers, workIds);
  const sizeTiers = "error" in parsedTiers ? [] : parsedTiers.tiers;
  const tierError = "error" in parsedTiers ? parsedTiers.error : null;

  return {
    name,
    description,
    bundlePrice,
    workIds,
    workSizes,
    sizeTiers,
    tierError,
    thumbnail,
    bannerImage,
    available,
    availableExplicit,
  };
}

/**
 * D15 (B2/C2 for bundles, gated by GATING_V1): collections used to publish
 * with no subscription gate at all, so an unsubscribed artist could go live
 * via a bundle while the same works were 402-blocked on /api/artist-works.
 * Same semantics as that route:
 *   - an explicit `available: true` from a non-subscribed artist returns 402
 *     so the client surfaces the upgrade prompt;
 *   - an omitted flag falls back to a draft (available=false) instead of the
 *     old publish-by-default.
 * Returns the 402 response to send, or the effective `available` value.
 */
async function gatePublish(
  userId: string,
  available: boolean,
  availableExplicit: boolean,
): Promise<{ response: NextResponse } | { available: boolean }> {
  if (!isFlagOn("GATING_V1")) return { available };
  const sub = await isSubscribed(userId);
  if (sub.active) return { available };
  if (available && availableExplicit) {
    return {
      response: NextResponse.json(
        {
          error: "subscription_required",
          message: "Publishing a collection requires an active Wallplace subscription.",
          upgrade_url: "/artist-portal/billing",
        },
        { status: 402 },
      ),
    };
  }
  return { available: false };
}

// GET: fetch collections for the authenticated artist
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();

    const { data: profile } = await db
      .from("artist_profiles")
      .select("id, slug")
      .eq("user_id", auth.user!.id)
      .single();

    if (!profile) {
      return NextResponse.json({ collections: [] });
    }

    const { data, error } = await db
      .from("artist_collections")
      .select("*")
      .eq("artist_id", profile.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Collections query error:", error.message);
      return NextResponse.json({ collections: [] });
    }

    const rows = (data || []) as DbRow[];
    return NextResponse.json({ collections: rows.map(rowToClient) });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// POST: create a new collection
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const raw = (await request.json()) as CollectionPayload;
    const {
      name,
      description,
      bundlePrice,
      workIds,
      workSizes,
      sizeTiers,
      tierError,
      thumbnail,
      bannerImage,
      available,
      availableExplicit,
    } = parseBody(raw);

    if (!name || workIds.length < 2) {
      return NextResponse.json(
        { error: "name and at least 2 workIds are required" },
        { status: 400 }
      );
    }

    if (tierError) {
      return NextResponse.json({ error: tierError }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    const { data: profile } = await db
      .from("artist_profiles")
      .select("id, slug")
      .eq("user_id", auth.user!.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });
    }

    // Same ordering as /api/artist-works: no profile is a 404 first, the
    // paywall answers 402 only to a real artist.
    const gated = await gatePublish(auth.user!.id, available, availableExplicit);
    if ("response" in gated) return gated.response;

    const id = `${profile.slug}-collection-${Date.now()}`;
    const now = new Date().toISOString();

    const { data, error } = await db
      .from("artist_collections")
      .upsert(
        {
          id,
          artist_id: profile.id,
          artist_slug: profile.slug,
          name,
          description,
          bundle_price: bundlePrice,
          work_ids: workIds,
          work_sizes: workSizes,
          size_tiers: sizeTiers,
          thumbnail,
          banner_image: bannerImage,
          available: gated.available,
          created_at: now,
          updated_at: now,
        },
        { onConflict: "id" }
      )
      .select("*")
      .single();

    if (error || !data) {
      console.error("Collections save error:", error?.message);
      return NextResponse.json({ error: "Failed to save collection" }, { status: 500 });
    }

    return NextResponse.json({ success: true, collection: rowToClient(data as DbRow) });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH: update an existing collection
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const raw = (await request.json()) as CollectionPayload & { id?: unknown };
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const {
      name,
      description,
      bundlePrice,
      workIds,
      workSizes,
      sizeTiers,
      tierError,
      thumbnail,
      bannerImage,
      available,
      availableExplicit,
    } = parseBody(raw);

    if (!name || workIds.length < 2) {
      return NextResponse.json(
        { error: "name and at least 2 workIds are required" },
        { status: 400 }
      );
    }

    if (tierError) {
      return NextResponse.json({ error: tierError }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    const { data: profile } = await db
      .from("artist_profiles")
      .select("id")
      .eq("user_id", auth.user!.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });
    }

    // Same ordering as /api/artist-works: no profile is a 404 first, the
    // paywall answers 402 only to a real artist.
    const gated = await gatePublish(auth.user!.id, available, availableExplicit);
    if ("response" in gated) return gated.response;

    const { data, error } = await db
      .from("artist_collections")
      .update({
        name,
        description,
        bundle_price: bundlePrice,
        work_ids: workIds,
        work_sizes: workSizes,
        size_tiers: sizeTiers,
        thumbnail,
        banner_image: bannerImage,
        available: gated.available,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("artist_id", profile.id)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Collections update error:", error?.message);
      return NextResponse.json({ error: "Failed to update collection" }, { status: 500 });
    }

    return NextResponse.json({ success: true, collection: rowToClient(data as DbRow) });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE: remove a collection
export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    const { data: profile } = await db
      .from("artist_profiles")
      .select("id")
      .eq("user_id", auth.user!.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });
    }

    const { error } = await db
      .from("artist_collections")
      .delete()
      .eq("id", id)
      .eq("artist_id", profile.id);

    if (error) {
      console.error("Collections delete error:", error.message);
      return NextResponse.json({ error: "Failed to delete collection" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
