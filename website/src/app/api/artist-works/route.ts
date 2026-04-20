import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getArtistProfileByUserId } from "@/lib/db/artist-profiles";
import { getWorksByArtistProfileId, upsertWork, deleteWork } from "@/lib/db/artist-works";

// GET: fetch works for the current user's artist profile
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const result = await getArtistProfileByUserId(auth.user!.id);
  if (!result) {
    return NextResponse.json({ works: [] });
  }

  const works = await getWorksByArtistProfileId(result.profile.id);
  return NextResponse.json({ works });
}

// POST: create or update a work
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const result = await getArtistProfileByUserId(auth.user!.id);
  if (!result) {
    return NextResponse.json({ error: "No artist profile found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { id, title, medium, dimensions, priceBand, pricing, available, color, image, orientation, sortOrder, shippingPrice, inStorePrice, quantityAvailable, frameOptions } = body;

    if (!id || !title || !image) {
      return NextResponse.json({ error: "ID, title, and image are required" }, { status: 400 });
    }

    const sanitizedFrames = Array.isArray(frameOptions)
      ? frameOptions
          .filter((f: unknown): f is { label: string; priceUplift: number } =>
            !!f && typeof f === "object" && typeof (f as { label?: unknown }).label === "string" &&
            typeof (f as { priceUplift?: unknown }).priceUplift === "number" &&
            ((f as { label: string }).label.trim().length > 0),
          )
          .slice(0, 20)
          .map((f) => ({
            label: f.label.trim().slice(0, 80),
            priceUplift: Math.max(0, Math.round(f.priceUplift * 100) / 100),
          }))
      : [];

    const { error } = await upsertWork(result.profile.id, {
      id,
      title,
      medium: medium || "",
      dimensions: dimensions || "",
      price_band: priceBand || "",
      pricing: pricing || [],
      available: available ?? true,
      color: color || "#C17C5A",
      image,
      orientation: orientation || "landscape",
      sort_order: sortOrder ?? 0,
      shipping_price: shippingPrice ?? null,
      in_store_price: inStorePrice ?? null,
      quantity_available: typeof quantityAvailable === "number" ? quantityAvailable : null,
      frame_options: sanitizedFrames,
    });

    if (error) {
      console.error("Work save error:", error);
      return NextResponse.json({ error: "Failed to save work" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE: remove a work
export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const result = await getArtistProfileByUserId(auth.user!.id);
  if (!result) {
    return NextResponse.json({ error: "No artist profile found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const workId = searchParams.get("id");

  if (!workId) {
    return NextResponse.json({ error: "Work ID required" }, { status: 400 });
  }

  const { error } = await deleteWork(workId, result.profile.id);

  if (error) {
    console.error("Work delete error:", error);
    return NextResponse.json({ error: "Failed to delete work" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
