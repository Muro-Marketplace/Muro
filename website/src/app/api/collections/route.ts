import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

type CollectionPayload = {
  name?: unknown;
  description?: unknown;
  bundlePrice?: unknown;
  workIds?: unknown;
  workSizes?: unknown;
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
  const available = typeof body.available === "boolean" ? body.available : true;

  return {
    name,
    description,
    bundlePrice,
    workIds,
    workSizes,
    thumbnail,
    bannerImage,
    available,
  };
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
      thumbnail,
      bannerImage,
      available,
    } = parseBody(raw);

    if (!name || workIds.length < 2) {
      return NextResponse.json(
        { error: "name and at least 2 workIds are required" },
        { status: 400 }
      );
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
          thumbnail,
          banner_image: bannerImage,
          available,
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
      thumbnail,
      bannerImage,
      available,
    } = parseBody(raw);

    if (!name || workIds.length < 2) {
      return NextResponse.json(
        { error: "name and at least 2 workIds are required" },
        { status: 400 }
      );
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

    const { data, error } = await db
      .from("artist_collections")
      .update({
        name,
        description,
        bundle_price: bundlePrice,
        work_ids: workIds,
        work_sizes: workSizes,
        thumbnail,
        banner_image: bannerImage,
        available,
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
